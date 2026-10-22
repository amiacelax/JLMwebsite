/**
 * PayPal webhooks: PayPal tells us when someone pays, cancels, or stops paying.
 * This keeps plans in step with PayPal even if the student never comes back to the site.
 *
 * Setup (once, by JD): PayPal developer dashboard → Webhooks → add
 *   https://japaneselanguagementor.com/api/paypal/webhook
 * with the BILLING.SUBSCRIPTION.* and PAYMENT.SALE.COMPLETED events, then
 *   npx wrangler secret put PAYPAL_WEBHOOK_ID
 */
import { invalidateStudentListSnapshot } from "./homework-kv";
import { type DiscordNotifyEnv } from "./discord-notify";
import { notifyOther, type DiscordRouteEnv } from "./discord-channels";
import { outboundEmailConfigured, sendOutboundEmail, type InquiryEmailEnv } from "./notify-email";
import {
  LEGACY_BASIC_PLAN_ID,
  PAYPAL_PLAN_IDS,
  apiBase,
  cancelPaypalSubscription,
  getAccessToken,
  getPaypalSubscriptionInfo,
  paypalCredentialsConfigured,
  type PaypalEnv,
} from "./paypal";
import {
  getUserAccount,
  paypalSubKey,
  planEndMs,
  type AccountTier,
  type UserAccount,
} from "./user-accounts";
import { mapCheckoutPlanToTier, planLabelFromTier } from "./hw-plan-reminders";
import { buildCancellationEmail } from "./student-email-text";

export type PaypalWebhookEnv = { HOMEWORK_KV?: KVNamespace } & PaypalEnv & DiscordNotifyEnv & DiscordRouteEnv & InquiryEmailEnv;

interface PaypalEvent {
  id?: string;
  event_type?: string;
  resource?: Record<string, unknown>;
}

/** PayPal plan id → our plan name. */
function planNameFromPlanId(planId: string): string | null {
  const id = String(planId || "").trim();
  if (!id) return null;
  if (id === LEGACY_BASIC_PLAN_ID) return "basic";
  for (const [name, value] of Object.entries(PAYPAL_PLAN_IDS)) {
    if (value === id) return name;
  }
  return null;
}

/** Ask PayPal if this call is really from PayPal. */
export async function verifyPaypalWebhook(
  headers: Headers,
  event: unknown,
  env: PaypalWebhookEnv
): Promise<boolean> {
  const webhookId = String(env.PAYPAL_WEBHOOK_ID || "").trim();
  if (!webhookId || !paypalCredentialsConfigured(env)) return false;
  const body = {
    auth_algo: headers.get("paypal-auth-algo") || "",
    cert_url: headers.get("paypal-cert-url") || "",
    transmission_id: headers.get("paypal-transmission-id") || "",
    transmission_sig: headers.get("paypal-transmission-sig") || "",
    transmission_time: headers.get("paypal-transmission-time") || "",
    webhook_id: webhookId,
    webhook_event: event,
  };
  if (!body.transmission_id || !body.transmission_sig) return false;
  const token = await getAccessToken(env);
  const res = await fetch(`${apiBase(env)}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}

async function findUsername(
  subscriptionId: string,
  customId: string,
  env: PaypalWebhookEnv
): Promise<{ username: string; via: string; payerHint: string }> {
  const kv = env.HOMEWORK_KV;
  let payerHint = "";

  if (kv && subscriptionId) {
    const mapped = await kv.get(paypalSubKey(subscriptionId));
    if (mapped) {
      return { username: String(mapped).trim().toLowerCase(), via: "sub-map", payerHint };
    }
  }

  const fromCustom = String(customId || "").trim().toLowerCase();
  if (fromCustom) {
    return { username: fromCustom, via: "custom_id", payerHint };
  }

  /* Older / cleared subs have no custom_id and no KV map — ask PayPal who pays. */
  if (subscriptionId && paypalCredentialsConfigured(env)) {
    try {
      const info = await getPaypalSubscriptionInfo(subscriptionId, env);
      if (info) {
        const email = String(info.email || "").trim().toLowerCase();
        const name = String(info.payerName || "").trim();
        payerHint = [name, email].filter(Boolean).join(" · ");
        if (kv && email) {
          const byEmail = String((await kv.get(`user-email:${email}`)) || "")
            .trim()
            .toLowerCase();
          if (byEmail) {
            await kv.put(paypalSubKey(subscriptionId), byEmail);
            return { username: byEmail, via: "paypal-email", payerHint };
          }
          /* Scan accounts if the email index is missing (older signups). */
          const indexRaw = await kv.get("user-accounts-index");
          const ids = indexRaw ? (JSON.parse(indexRaw) as string[]) : [];
          for (const id of ids) {
            const raw = await kv.get(`user-account:${id}`);
            if (!raw) continue;
            try {
              const acc = JSON.parse(raw) as { email?: string; username?: string };
              if (String(acc.email || "").trim().toLowerCase() === email) {
                const u = String(acc.username || id).trim().toLowerCase();
                await kv.put(paypalSubKey(subscriptionId), u);
                await kv.put(`user-email:${email}`, u);
                return { username: u, via: "paypal-email-scan", payerHint };
              }
            } catch {
              /* skip bad rows */
            }
          }
        }
      }
    } catch (err) {
      console.error("paypal-webhook: could not look up subscription payer:", err);
    }
  }

  return { username: "", via: "", payerHint };
}

async function saveAccount(account: UserAccount, env: PaypalWebhookEnv): Promise<void> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  await kv.put(`user-account:${account.username}`, JSON.stringify(account));
  await invalidateStudentListSnapshot(kv);
}

function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function ping(env: PaypalWebhookEnv, text: string): Promise<void> {
  try {
    await notifyOther(env, text);
  } catch (err) {
    console.error("paypal-webhook: teacher ping failed:", err);
  }
}

/** Do what the event says. Returns a short note for logs/tests. */
export async function handlePaypalEvent(
  event: PaypalEvent,
  env: PaypalWebhookEnv,
  origin = "https://japaneselanguagementor.com"
): Promise<string> {
  const type = String(event.event_type || "");
  const resource = (event.resource || {}) as Record<string, unknown>;
  const isSale = type === "PAYMENT.SALE.COMPLETED";
  const subscriptionId = String(
    (isSale ? resource.billing_agreement_id : resource.id) || ""
  ).trim();
  if (!subscriptionId) return "no subscription id";

  const found = await findUsername(subscriptionId, String(resource.custom_id || ""), env);
  const username = found.username;
  if (!username) {
    const who = found.payerHint ? ` Payer: ${found.payerHint}.` : " Check PayPal for the subscriber email.";
    await ping(
      env,
      `PayPal event ${type} for subscription ${subscriptionId}.${who} No Homework Hub login matched.`
    );
    return "unknown student";
  }
  const account = await getUserAccount(username, env);
  if (!account) {
    const who = found.payerHint ? ` Payer: ${found.payerHint}.` : "";
    await ping(
      env,
      `PayPal event ${type} for subscription ${subscriptionId} looks like ${username}, but that hub account is missing.${who}`
    );
    return "no account";
  }

  const isCurrent = account.paypalSubscriptionId === subscriptionId;
  const isPending = account.paypalPendingSubscriptionId === subscriptionId;
  const who = `${account.displayName || account.username} (${account.username})`;

  switch (type) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
    case "BILLING.SUBSCRIPTION.RE-ACTIVATED": {
      const planName = planNameFromPlanId(String(resource.plan_id || ""));
      const tier = planName ? mapCheckoutPlanToTier(planName) : null;
      if (!tier) return "unknown plan";
      if (!isCurrent && !isPending && account.paypalSubscriptionId) return "not this student's plan";

      const hadPlan = account.tier !== "pending" && !String(account.planCancelledAt || "").trim();
      const oldId = account.paypalSubscriptionId && !isCurrent ? account.paypalSubscriptionId : "";

      account.tier = tier as AccountTier;
      account.paypalPaid = true;
      account.paypalSubscriptionId = subscriptionId;
      if (planName) account.paypalPlan = planName;
      delete account.paypalPendingSubscriptionId;
      delete account.planEndsAt;
      delete account.planCancelledAt;
      if (planName === "ultra" || planName === "student-ultra") account.videoResponseUnlock = true;
      await saveAccount(account, env);

      if (oldId && paypalCredentialsConfigured(env)) {
        try {
          await cancelPaypalSubscription(oldId, env, "Switched to a different plan");
        } catch (err) {
          console.error("paypal-webhook: could not cancel old plan:", err);
        }
      }
      if (!hadPlan || oldId) {
        await ping(env, `PayPal: ${who} is now on the ${planLabelFromTier(tier)} plan.`);
      }
      return "activated";
    }

    case "BILLING.SUBSCRIPTION.CANCELLED":
    case "BILLING.SUBSCRIPTION.SUSPENDED":
    case "BILLING.SUBSCRIPTION.EXPIRED": {
      /* Old plans that were replaced by a switch also send CANCELLED. Ignore those. */
      if (!isCurrent) return "not the current plan";
      if (String(account.planCancelledAt || "").trim()) return "already cancelled";

      let endsMs = Date.now();
      if (type !== "BILLING.SUBSCRIPTION.EXPIRED") {
        try {
          endsMs = planEndMs(await getPaypalSubscriptionInfo(subscriptionId, env));
        } catch {
          endsMs = planEndMs(null);
        }
      }
      account.planCancelledAt = new Date().toISOString();
      account.planEndsAt = new Date(endsMs).toISOString();
      await saveAccount(account, env);

      const endsOn = formatDate(account.planEndsAt);
      const planName = planLabelFromTier(account.tier);
      const reason =
        type === "BILLING.SUBSCRIPTION.SUSPENDED"
          ? "stopped (payments kept failing)"
          : type === "BILLING.SUBSCRIPTION.EXPIRED"
            ? "ran out"
            : "cancelled in PayPal";
      await ping(
        env,
        `PayPal: ${who}'s ${planName} plan ${reason}. Their plan ends ${endsOn || "soon"}.`
      );

      if (type === "BILLING.SUBSCRIPTION.CANCELLED" && account.email && outboundEmailConfigured(env)) {
        try {
          const mail = buildCancellationEmail({
            name: account.displayName,
            planName,
            endsOn,
            loginUrl: `${origin}/homework.html?user=${encodeURIComponent(account.username)}`,
          });
          await sendOutboundEmail(env, {
            to: account.email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          });
        } catch (err) {
          console.error("paypal-webhook: cancellation email failed:", err);
        }
      }
      return "ended";
    }

    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
      if (isCurrent) {
        await ping(env, `PayPal: ${who}'s ${planLabelFromTier(account.tier)} payment failed. PayPal will retry.`);
      }
      return "payment failed";
    }

    case "PAYMENT.SALE.COMPLETED": {
      /* A payment landed. If the plan had been marked ended but PayPal is still billing, undo that. */
      if (!isCurrent) return "not the current plan";
      if (!account.planEndsAt && !account.planCancelledAt) return "renewed";
      try {
        const info = await getPaypalSubscriptionInfo(subscriptionId, env);
        if (info?.status === "ACTIVE") {
          delete account.planEndsAt;
          delete account.planCancelledAt;
          await saveAccount(account, env);
          return "renewed, end date cleared";
        }
      } catch (err) {
        console.error("paypal-webhook: could not read subscription:", err);
      }
      return "payment, no change";
    }

    default:
      return "ignored";
  }
}

/** Entry point from the Worker route. */
export async function handlePaypalWebhookRequest(
  request: Request,
  env: PaypalWebhookEnv
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!String(env.PAYPAL_WEBHOOK_ID || "").trim()) {
    return new Response("PayPal webhook is not set up yet.", { status: 503 });
  }

  let event: PaypalEvent;
  try {
    event = (await request.json()) as PaypalEvent;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  let verified = false;
  try {
    verified = await verifyPaypalWebhook(request.headers, event, env);
  } catch (err) {
    console.error("paypal-webhook: verify failed:", err);
    return new Response("Could not verify", { status: 502 });
  }
  if (!verified) return new Response("Signature not valid", { status: 401 });

  const kv = env.HOMEWORK_KV;
  const eventKey = event.id ? `paypal-event:${event.id}` : "";
  if (kv && eventKey && (await kv.get(eventKey))) {
    return new Response("Already handled", { status: 200 });
  }

  try {
    const note = await handlePaypalEvent(event, env, new URL(request.url).origin);
    if (kv && eventKey) await kv.put(eventKey, note, { expirationTtl: 7 * 86400 });
    return new Response(note, { status: 200 });
  } catch (err) {
    console.error("paypal-webhook: handling failed:", event.event_type, err);
    /* 500 makes PayPal send it again later. */
    return new Response("Handler error", { status: 500 });
  }
}
