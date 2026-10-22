/** PayPal Subscriptions API — create at checkout, cancel on account delete. */

export type HwPaypalPlan =
  | "basic"
  | "premium"
  | "ultra"
  | "student-special"
  | "student-ultra";

export interface PaypalEnv {
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_MODE?: string;
  /** ID of the webhook made in the PayPal developer dashboard. Needed to verify webhook calls. */
  PAYPAL_WEBHOOK_ID?: string;
}

/** The old $5 Basic plan. Current subscribers are still on it. */
export const LEGACY_BASIC_PLAN_ID = "P-3BS11069X4737034MNJ563OA";

export const PAYPAL_PLAN_IDS: Record<HwPaypalPlan, string> = {
  basic: "P-3C015132V3458352HNLDR7AY",
  premium: "P-7RC25164AJ430933DNJ564GY",
  ultra: "P-9VC563511T5680357NJ565KA",
  "student-special": "P-34B653300B452420GNJ565WQ",
  /* Set when JD creates the $25 Student Ultra PayPal plan. */
  "student-ultra": "REPLACE_STUDENT_ULTRA",
};

export function normalizeHwCheckoutPlan(raw: string): HwPaypalPlan | null {
  const p = String(raw || "")
    .trim()
    .toLowerCase();
  if (p === "basic" || p === "tier1") return "basic";
  if (p === "premium" || p === "tier2") return "premium";
  if (p === "ultra" || p === "tier3") return "ultra";
  if (p === "student-special" || p === "student_special") return "student-special";
  if (p === "student-ultra" || p === "student_ultra") return "student-ultra";
  return null;
}

export function paypalCredentialsConfigured(env: PaypalEnv): boolean {
  return Boolean(
    String(env.PAYPAL_CLIENT_ID || "").trim() &&
      String(env.PAYPAL_CLIENT_SECRET || "").trim()
  );
}

export function apiBase(env: PaypalEnv): string {
  const mode = String(env.PAYPAL_MODE || "live")
    .trim()
    .toLowerCase();
  return mode === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

export async function getAccessToken(env: PaypalEnv): Promise<string> {
  const clientId = String(env.PAYPAL_CLIENT_ID || "").trim();
  const secret = String(env.PAYPAL_CLIENT_SECRET || "").trim();
  if (!clientId || !secret) throw new Error("PAYPAL_NOT_CONFIGURED");
  const auth = btoa(`${clientId}:${secret}`);
  const res = await fetch(`${apiBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("paypal token failed:", res.status, detail.slice(0, 300));
    throw new Error("PAYPAL_AUTH_FAILED");
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("PAYPAL_AUTH_FAILED");
  return data.access_token;
}

function findApproveLink(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  const approve = links.find(
    (l) => String((l as { rel?: string })?.rel || "").toLowerCase() === "approve"
  ) as { href?: string } | undefined;
  return approve?.href ? String(approve.href) : null;
}

export async function createPaypalSubscription(
  input: {
    plan: HwPaypalPlan;
    username: string;
    email?: string;
    returnUrl: string;
    cancelUrl: string;
  },
  env: PaypalEnv
): Promise<{ subscriptionId: string; approveUrl: string; plan: HwPaypalPlan }> {
  if (!paypalCredentialsConfigured(env)) throw new Error("PAYPAL_NOT_CONFIGURED");
  const planId = PAYPAL_PLAN_IDS[input.plan];
  if (!planId || planId.includes("REPLACE_")) throw new Error("PLAN_INVALID");
  const username = String(input.username || "")
    .trim()
    .toLowerCase();
  if (!username) throw new Error("USERNAME_REQUIRED");
  const returnUrl = String(input.returnUrl || "").trim();
  const cancelUrl = String(input.cancelUrl || "").trim();
  if (!returnUrl || !cancelUrl) throw new Error("RETURN_URL_REQUIRED");

  const token = await getAccessToken(env);
  const body: Record<string, unknown> = {
    plan_id: planId,
    custom_id: username.slice(0, 127),
    application_context: {
      brand_name: "Japanese Language Mentor",
      locale: "en-US",
      shipping_preference: "NO_SHIPPING",
      user_action: "SUBSCRIBE_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    body.subscriber = { email_address: email };
  }

  const res = await fetch(`${apiBase(env)}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("paypal create subscription failed:", res.status, detail.slice(0, 500));
    throw new Error("PAYPAL_CREATE_FAILED");
  }
  const data = (await res.json()) as { id?: string; links?: unknown };
  const subscriptionId = String(data.id || "").trim();
  const approveUrl = findApproveLink(data.links);
  if (!subscriptionId || !approveUrl) throw new Error("PAYPAL_CREATE_FAILED");
  return { subscriptionId, approveUrl, plan: input.plan };
}

export interface PaypalSubscriptionInfo {
  /** PayPal status, e.g. ACTIVE, CANCELLED, SUSPENDED, EXPIRED, APPROVAL_PENDING. */
  status: string;
  /** ISO time of the next charge. This is the end of the period already paid for. */
  nextBillingTime: string;
  /** ISO time of the last successful payment. */
  lastPaymentTime: string;
  planId: string;
  email: string;
  payerName: string;
}

/** Read a subscription from PayPal. Returns null if PayPal doesn't know it. */
export async function getPaypalSubscriptionInfo(
  subscriptionId: string,
  env: PaypalEnv
): Promise<PaypalSubscriptionInfo | null> {
  const id = String(subscriptionId || "").trim();
  if (!id) return null;
  if (!paypalCredentialsConfigured(env)) throw new Error("PAYPAL_NOT_CONFIGURED");
  const token = await getAccessToken(env);
  const res = await fetch(`${apiBase(env)}/v1/billing/subscriptions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("paypal subscription read failed:", res.status, detail.slice(0, 300));
    throw new Error("PAYPAL_READ_FAILED");
  }
  const data = (await res.json()) as {
    status?: string;
    plan_id?: string;
    subscriber?: { email_address?: string; name?: { given_name?: string; surname?: string } };
    billing_info?: {
      next_billing_time?: string;
      last_payment?: { time?: string };
    };
  };
  const payer = data.subscriber?.name || {};
  return {
    status: String(data.status || "").toUpperCase(),
    nextBillingTime: String(data.billing_info?.next_billing_time || ""),
    lastPaymentTime: String(data.billing_info?.last_payment?.time || ""),
    planId: String(data.plan_id || ""),
    email: String(data.subscriber?.email_address || "").trim().toLowerCase(),
    payerName: [payer.given_name, payer.surname].filter(Boolean).join(" "),
  };
}

export async function cancelPaypalSubscription(
  subscriptionId: string,
  env: PaypalEnv,
  reason = "Account deleted"
): Promise<{ cancelled: boolean; alreadyInactive?: boolean; skipped?: boolean }> {
  const id = String(subscriptionId || "").trim();
  if (!id) return { cancelled: false, skipped: true };
  if (!paypalCredentialsConfigured(env)) throw new Error("PAYPAL_NOT_CONFIGURED");

  const token = await getAccessToken(env);
  const res = await fetch(
    `${apiBase(env)}/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: String(reason || "Cancelled").slice(0, 128) }),
    }
  );
  if (res.status === 204) return { cancelled: true };
  /* Already cancelled / expired / unknown — safe to proceed with account delete. */
  if (res.status === 404 || res.status === 422) {
    return { cancelled: true, alreadyInactive: true };
  }
  const detail = await res.text().catch(() => "");
  console.error("paypal cancel failed:", res.status, detail.slice(0, 400));
  throw new Error("PAYPAL_CANCEL_FAILED");
}
