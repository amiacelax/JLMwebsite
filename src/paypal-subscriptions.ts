/**
 * PayPal Subscriptions — create approve link with return_url so buyers land back on the hub.
 * Needs PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET. Falls back is handled by the client.
 */

export type HwCheckoutPlan =
  | "basic"
  | "premium"
  | "ultra"
  | "student-special"
  | "student-ultra";

export interface PayPalEnv {
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  /** "live" (default) or "sandbox" */
  PAYPAL_MODE?: string;
}

const PLAN_IDS: Record<HwCheckoutPlan, string> = {
  basic: "P-3BS11069X4737034MNJ563OA",
  premium: "P-7RC25164AJ430933DNJ564GY",
  ultra: "P-9VC563511T5680357NJ565KA",
  "student-special": "P-34B653300B452420GNJ565WQ",
  /* Set when JD creates the $25 Student Ultra PayPal plan. */
  "student-ultra": "REPLACE_STUDENT_ULTRA",
};

function apiBase(env: PayPalEnv): string {
  const mode = String(env.PAYPAL_MODE || "live")
    .trim()
    .toLowerCase();
  return mode === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

export function normalizeHwCheckoutPlan(raw: string | undefined): HwCheckoutPlan | null {
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

export function paypalCredentialsConfigured(env: PayPalEnv): boolean {
  return Boolean(
    String(env.PAYPAL_CLIENT_ID || "").trim() &&
      String(env.PAYPAL_CLIENT_SECRET || "").trim()
  );
}

async function getAccessToken(env: PayPalEnv): Promise<string> {
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

function findApproveLink(
  links: Array<{ href?: string; rel?: string }> | undefined
): string | null {
  if (!Array.isArray(links)) return null;
  const approve = links.find((l) => String(l.rel || "").toLowerCase() === "approve");
  return approve?.href ? String(approve.href) : null;
}

export interface CreateSubscriptionInput {
  plan: HwCheckoutPlan;
  username: string;
  email?: string;
  displayName?: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  approveUrl: string;
  plan: HwCheckoutPlan;
}

export async function createPaypalSubscription(
  input: CreateSubscriptionInput,
  env: PayPalEnv
): Promise<CreateSubscriptionResult> {
  if (!paypalCredentialsConfigured(env)) throw new Error("PAYPAL_NOT_CONFIGURED");

  const planId = PLAN_IDS[input.plan];
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

  const data = (await res.json()) as {
    id?: string;
    links?: Array<{ href?: string; rel?: string }>;
  };
  const subscriptionId = String(data.id || "").trim();
  const approveUrl = findApproveLink(data.links);
  if (!subscriptionId || !approveUrl) throw new Error("PAYPAL_CREATE_FAILED");

  return {
    subscriptionId,
    approveUrl,
    plan: input.plan,
  };
}

/** Public hub return URL after PayPal approve. */
export function buildPaidReturnUrl(origin: string, plan: HwCheckoutPlan): string {
  const base = String(origin || "").replace(/\/$/, "");
  return `${base}/homework/platform.html?paid=1&plan=${encodeURIComponent(plan)}`;
}

export function buildCancelReturnUrl(origin: string, plan: HwCheckoutPlan): string {
  const base = String(origin || "").replace(/\/$/, "");
  return `${base}/homework/platform.html?paid=0&plan=${encodeURIComponent(plan)}`;
}
