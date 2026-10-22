import { hashPassword, randomUrlToken, sha256Base64Url, verifyPassword } from "./password";
import {
  clearStudentWiped,
  invalidateStudentListSnapshot,
  savePromoSignup,
} from "./homework-kv";
import {
  cancelPaypalSubscription,
  getPaypalSubscriptionInfo,
  type PaypalEnv,
} from "./paypal";

const USERS_INDEX = "user-accounts-index";
const userKey = (username: string) => `user-account:${username}`;
const userEmailKey = (email: string) => `user-email:${email}`;
/** PayPal subscription id -> username, so PayPal webhooks can find the account. */
export const paypalSubKey = (subscriptionId: string) => `paypal-sub:${subscriptionId}`;

const RESERVED_USERNAMES = new Set([
  "jlm",
  "benm",
  "joshs",
  "deme",
  "ivan",
  "noplan",
  "benc",
  "demo",
  "demo2",
  "christian",
  "curriculum",
  "admin",
  "teacher",
  "support",
]);

export type AccountLabel = "homework_only" | "current_student" | "quest_only";
export type AccountTier =
  | "pending"
  | "tier1"
  | "tier2"
  | "tier3"
  | "student_special"
  | "quest_only";

const ACCOUNT_LABELS = new Set<AccountLabel>([
  "homework_only",
  "current_student",
  "quest_only",
]);
const ACCOUNT_TIERS = new Set<AccountTier>([
  "pending",
  "tier1",
  "tier2",
  "tier3",
  "student_special",
  "quest_only",
]);

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  displayName: string;
  role: "student";
  accountLabel: AccountLabel;
  tier: AccountTier;
  courses: string[];
  videoResponseUnlock: boolean;
  createdAt: string;
  paypalSubscriptionId?: string;
  paypalPlan?: string;
  /** Set when checkout is confirmed, not when a PayPal subscription is only started. */
  paypalPaid?: boolean;
  /** A new PayPal subscription started while another plan is still live. Becomes the main id once active. */
  paypalPendingSubscriptionId?: string;
  /**
   * UTC instant when a cancelled plan stops. Until then the student keeps the plan
   * they already paid for. Cleared when they subscribe again.
   */
  planEndsAt?: string;
  /** When the student pressed Cancel subscription. */
  planCancelledAt?: string;
  /**
   * UTC instant when a temporary curriculum trial ends.
   * Access stops at this time (not at the end of a local calendar day).
   * Stored on the account; login does not change it into a permanent lesson-payer flag.
   */
  curriculumTrialEndsAt?: string;
}

export interface AuthSession {
  username: string;
  displayName: string;
  email: string;
  role: "student";
  accountLabel: AccountLabel;
  tier: AccountTier;
  courses: string[];
  videoResponseUnlock: boolean;
  paypalBilling: boolean;
  /** Present once the student cancelled: the plan stays active until this instant. */
  planEndsAt?: string;
  source: "server";
  /** Present only while the account has a curriculum trial end time. */
  curriculumTrialEndsAt?: string;
  curriculumTrialBaseLabel?: AccountLabel;
  curriculumTrialBaseTier?: AccountTier;
  curriculumTrialHomeworkId?: string;
}

/** Homework sheet a curriculum trial uses, same sheet Christian opens. */
export const CURRICULUM_TRIAL_HOMEWORK_ID = "sheet-secret-hiragana";

export function curriculumTrialEndsMs(raw: unknown): number | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

/** True until the stored UTC instant. Equal to that instant counts as ended. */
export function isCurriculumTrialActive(raw: unknown, nowMs = Date.now()): boolean {
  const ms = curriculumTrialEndsMs(raw);
  return ms !== null && nowMs < ms;
}

interface KvEnv extends PaypalEnv {
  HOMEWORK_KV?: KVNamespace;
}

function normalizeUsername(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function normalizeEmail(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function makeUserId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `user-${Date.now()}-${rand}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{2,23}$/.test(username);
}

async function readUsersIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(USERS_INDEX);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function writeUsersIndex(kv: KVNamespace, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  await kv.put(USERS_INDEX, JSON.stringify(unique));
}

export function toAuthSession(account: UserAccount): AuthSession {
  const session: AuthSession = {
    username: account.username,
    displayName: account.displayName,
    email: account.email,
    role: account.role,
    accountLabel: account.accountLabel,
    tier: account.tier,
    courses: account.courses || [],
    videoResponseUnlock:
      account.tier === "tier3" || Boolean(account.videoResponseUnlock),
    paypalBilling:
      Boolean(String(account.paypalSubscriptionId || "").trim()) &&
      !String(account.planCancelledAt || "").trim(),
    source: "server",
  };
  const planEnds = String(account.planEndsAt || "").trim();
  if (planEnds && Number.isFinite(Date.parse(planEnds))) session.planEndsAt = planEnds;
  const endsAt = String(account.curriculumTrialEndsAt || "").trim();
  if (curriculumTrialEndsMs(endsAt) !== null) {
    session.curriculumTrialEndsAt = endsAt;
    session.curriculumTrialBaseLabel = account.accountLabel;
    session.curriculumTrialBaseTier = account.tier;
    session.curriculumTrialHomeworkId = CURRICULUM_TRIAL_HOMEWORK_ID;
  }
  return session;
}

export interface SignupInput {
  email: string;
  password: string;
  confirmPassword?: string;
  displayName: string;
  /** Optional legacy/manual handle — usually auto-made from email. */
  username?: string;
}

async function allocateUsername(
  kv: KVNamespace,
  email: string,
  displayName: string
): Promise<string> {
  const local = String(email.split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fromName = String(displayName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let base = (local || fromName || "user").slice(0, 20);
  if (!/^[a-z0-9]/.test(base)) base = ("u" + base).slice(0, 20);
  if (base.length < 3) base = (base + "user").slice(0, 8);

  for (let i = 0; i < 40; i++) {
    const candidate =
      i === 0 ? base.slice(0, 24) : (base.slice(0, 18) + String(i)).slice(0, 24);
    if (!isValidUsername(candidate)) continue;
    if (RESERVED_USERNAMES.has(candidate)) continue;
    if (!(await kv.get(userKey(candidate)))) return candidate;
  }
  return ("u" + Date.now().toString(36)).slice(0, 24);
}

export async function createUserAccount(
  data: SignupInput,
  env: KvEnv
): Promise<{ session: AuthSession }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const email = normalizeEmail(data.email);
  const password = String(data.password || "");
  const confirmPassword = String(data.confirmPassword ?? "");
  const displayName = String(data.displayName || "").trim();
  let username = normalizeUsername(String(data.username || ""));

  if (!displayName) throw new Error("DISPLAY_NAME_REQUIRED");
  if (displayName.length > 40) throw new Error("DISPLAY_NAME_TOO_LONG");
  if (!email || !isValidEmail(email)) throw new Error("EMAIL_INVALID");
  if (!password) throw new Error("PASSWORD_REQUIRED");
  if (password.length < 4) throw new Error("PASSWORD_TOO_SHORT");
  if (password !== confirmPassword) throw new Error("PASSWORD_MISMATCH");

  const existingEmail = await kv.get(userEmailKey(email));
  if (existingEmail) throw new Error("EMAIL_TAKEN");

  if (username) {
    if (!isValidUsername(username)) throw new Error("USERNAME_INVALID");
    if (RESERVED_USERNAMES.has(username)) throw new Error("USERNAME_RESERVED");
    if (await kv.get(userKey(username))) throw new Error("USERNAME_TAKEN");
  } else {
    username = await allocateUsername(kv, email, displayName);
  }

  const { salt, hash } = await hashPassword(password);
  const id = makeUserId();
  const record: UserAccount = {
    id,
    username,
    email,
    passwordHash: hash,
    passwordSalt: salt,
    displayName,
    role: "student",
    accountLabel: "homework_only",
    tier: "pending",
    courses: [],
    videoResponseUnlock: false,
    createdAt: new Date().toISOString(),
  };

  await kv.put(userKey(username), JSON.stringify(record));
  await kv.put(userEmailKey(email), username);

  const ids = await readUsersIndex(kv);
  ids.unshift(username);
  await writeUsersIndex(kv, ids);
  await clearStudentWiped(kv, username);
  await invalidateStudentListSnapshot(kv);

  try {
    await savePromoSignup(
      { email, name: displayName, page: "Account signup" },
      env
    );
  } catch {
    /* signup still succeeds if email list write fails */
  }

  return { session: toAuthSession(record) };
}

export interface LoginInput {
  /** Email (preferred) or legacy username. */
  username?: string;
  email?: string;
  login?: string;
  password: string;
}

export async function loginUserAccount(
  data: LoginInput,
  env: KvEnv
): Promise<{ session: AuthSession }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const password = String(data.password || "");
  const loginRaw = String(data.login || data.email || data.username || "").trim();
  if (!loginRaw || !password) throw new Error("INVALID_CREDENTIALS");

  let username = "";
  if (loginRaw.includes("@")) {
    const email = normalizeEmail(loginRaw);
    if (!isValidEmail(email)) throw new Error("INVALID_CREDENTIALS");
    username = String((await kv.get(userEmailKey(email))) || "").trim().toLowerCase();
  } else {
    username = normalizeUsername(loginRaw);
  }
  if (!username) throw new Error("INVALID_CREDENTIALS");

  const raw = await kv.get(userKey(username));
  if (!raw) throw new Error("INVALID_CREDENTIALS");

  let account: UserAccount;
  try {
    account = JSON.parse(raw) as UserAccount;
  } catch {
    throw new Error("INVALID_CREDENTIALS");
  }

  const ok = await verifyPassword(
    password,
    account.passwordSalt,
    account.passwordHash
  );
  if (!ok) throw new Error("INVALID_CREDENTIALS");

  return { session: toAuthSession(account) };
}

export async function getUserAccount(
  username: string,
  env: KvEnv
): Promise<UserAccount | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const raw = await kv.get(userKey(normalized));
  if (!raw) return null;

  try {
    return applyPlanExpiry(JSON.parse(raw) as UserAccount);
  } catch {
    return null;
  }
}

/** True once a cancelled plan has run past the end of the period the student paid for. */
export function planHasEnded(account: Pick<UserAccount, "planEndsAt">, nowMs = Date.now()): boolean {
  const ms = Date.parse(String(account.planEndsAt || "").trim());
  return Number.isFinite(ms) && nowMs >= ms;
}

/** After the paid period of a cancelled plan, the account goes back to no plan. */
function applyPlanExpiry(account: UserAccount): UserAccount {
  if (planHasEnded(account) && account.tier !== "pending") {
    account.tier = "pending";
    account.paypalPaid = false;
    account.videoResponseUnlock = false;
  }
  return account;
}

export interface UserAccountSettingsPatch {
  accountLabel?: AccountLabel;
  tier?: AccountTier;
}

export function normalizeAccountLabel(value: unknown): AccountLabel | null {
  const label = String(value || "")
    .trim()
    .toLowerCase();
  if (
    label === "current_student" ||
    label === "homework_only" ||
    label === "quest_only"
  ) {
    return label;
  }
  return null;
}

export function normalizeAccountTier(value: unknown): AccountTier | null {
  const tier = String(value || "")
    .trim()
    .toLowerCase();
  if (ACCOUNT_TIERS.has(tier as AccountTier)) return tier as AccountTier;
  return null;
}

export async function updateUserAccountSettings(
  username: string,
  patch: UserAccountSettingsPatch,
  env: KvEnv
): Promise<UserAccount | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error("USERNAME_REQUIRED");

  const account = await getUserAccount(normalized, env);
  if (!account) return null;

  const nextLabel = patch.accountLabel
    ? normalizeAccountLabel(patch.accountLabel)
    : null;
  if (patch.accountLabel !== undefined && !nextLabel) {
    throw new Error("INVALID_ACCOUNT_LABEL");
  }

  const nextTier = patch.tier ? normalizeAccountTier(patch.tier) : null;
  if (patch.tier !== undefined && !nextTier) {
    throw new Error("INVALID_ACCOUNT_TIER");
  }

  if (nextLabel) account.accountLabel = nextLabel;
  if (nextTier) account.tier = nextTier;

  await kv.put(userKey(normalized), JSON.stringify(account));
  await invalidateStudentListSnapshot(kv);
  return account;
}

export async function savePaypalSubscription(
  username: string,
  patch: { paypalSubscriptionId?: string; paypalPlan?: string; asPending?: boolean },
  env: KvEnv
): Promise<UserAccount | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error("USERNAME_REQUIRED");

  const account = await getUserAccount(normalized, env);
  if (!account) return null;

  const id = String(patch.paypalSubscriptionId || "").trim();
  const plan = String(patch.paypalPlan || "").trim();
  const hasLivePlan =
    Boolean(String(account.paypalSubscriptionId || "").trim()) &&
    account.tier !== "pending" &&
    !String(account.planCancelledAt || "").trim();
  if (id && patch.asPending && hasLivePlan && id !== account.paypalSubscriptionId) {
    /* Switching plans: keep the live plan's id until the new one is active. */
    account.paypalPendingSubscriptionId = id;
  } else if (id) {
    account.paypalSubscriptionId = id;
    if (account.paypalPendingSubscriptionId === id) delete account.paypalPendingSubscriptionId;
    if (plan) account.paypalPlan = plan;
  }
  if (id) await kv.put(paypalSubKey(id), normalized);

  await kv.put(userKey(normalized), JSON.stringify(account));
  await invalidateStudentListSnapshot(kv);
  return account;
}

export async function updateOwnDisplayName(
  data: { username: string; password: string; displayName: string },
  env: KvEnv
): Promise<{ session: AuthSession }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = normalizeUsername(data.username);
  const password = String(data.password || "");
  const displayName = String(data.displayName || "").trim();
  if (!username || !password) throw new Error("INVALID_CREDENTIALS");
  if (!displayName || displayName.length < 1) throw new Error("DISPLAY_NAME_REQUIRED");
  if (displayName.length > 40) throw new Error("DISPLAY_NAME_TOO_LONG");

  const account = await getUserAccount(username, env);
  if (!account) throw new Error("INVALID_CREDENTIALS");

  const ok = await verifyPassword(password, account.passwordSalt, account.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");

  account.displayName = displayName;
  await kv.put(userKey(username), JSON.stringify(account));
  await invalidateStudentListSnapshot(kv);
  return { session: toAuthSession(account) };
}

export async function changeOwnPassword(
  data: { username: string; password: string; newPassword: string },
  env: KvEnv
): Promise<{ session: AuthSession }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = normalizeUsername(data.username);
  const password = String(data.password || "");
  const newPassword = String(data.newPassword || "");
  if (!username || !password) throw new Error("INVALID_CREDENTIALS");
  if (newPassword.length < 4) throw new Error("PASSWORD_TOO_SHORT");

  const account = await getUserAccount(username, env);
  if (!account) throw new Error("INVALID_CREDENTIALS");

  const ok = await verifyPassword(password, account.passwordSalt, account.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");

  const { salt, hash } = await hashPassword(newPassword);
  account.passwordSalt = salt;
  account.passwordHash = hash;
  await kv.put(userKey(username), JSON.stringify(account));
  return { session: toAuthSession(account) };
}

export async function deleteOwnAccount(
  data: { username: string; password: string },
  env: KvEnv
): Promise<{ username: string; deleted: boolean }> {
  const username = normalizeUsername(data.username);
  const password = String(data.password || "");
  if (!username || !password) throw new Error("INVALID_CREDENTIALS");

  const account = await getUserAccount(username, env);
  if (!account) throw new Error("INVALID_CREDENTIALS");

  const ok = await verifyPassword(password, account.passwordSalt, account.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");

  return deleteUserAccount(username, env);
}

/** A paid plan runs for 30 days from the last payment (not a calendar month). */
export const PLAN_PERIOD_DAYS = 30;

/**
 * When a cancelled plan stops: 30 days after the last payment.
 * If PayPal has no last-payment time, fall back to its next billing time, then to 30 days from now.
 * Never earlier than now, never more than 40 days out.
 */
export function planEndMs(
  info: { lastPaymentTime?: string; nextBillingTime?: string } | null | undefined,
  nowMs = Date.now()
): number {
  const lastPaid = Date.parse(info?.lastPaymentTime || "");
  let endsMs: number;
  if (Number.isFinite(lastPaid)) {
    endsMs = lastPaid + PLAN_PERIOD_DAYS * 86400000;
  } else {
    const next = Date.parse(info?.nextBillingTime || "");
    endsMs = Number.isFinite(next) ? next : nowMs + PLAN_PERIOD_DAYS * 86400000;
  }
  return Math.min(Math.max(endsMs, nowMs), nowMs + 40 * 86400000);
}

export interface CancelSubscriptionResult {
  session: AuthSession;
  /** UTC instant the plan stops. Empty when PayPal isn't linked (JD sets it by hand). */
  planEndsAt: string;
  /** No PayPal subscription on file, so the student must cancel in PayPal themselves. */
  manual: boolean;
  /** The plan was already cancelled earlier. Nothing new was sent to PayPal. */
  alreadyCancelled: boolean;
  tier: AccountTier;
  displayName: string;
  email: string;
  username: string;
}

/**
 * Student cancels their own plan. PayPal stops billing now; the plan stays active
 * until the end of the period they already paid for (planEndsAt).
 */
export async function cancelOwnSubscription(
  data: { username: string; password: string },
  env: KvEnv
): Promise<CancelSubscriptionResult> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = normalizeUsername(data.username);
  const password = String(data.password || "");
  if (!username || !password) throw new Error("INVALID_CREDENTIALS");

  const account = await getUserAccount(username, env);
  if (!account) throw new Error("INVALID_CREDENTIALS");
  const ok = await verifyPassword(password, account.passwordSalt, account.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");

  if (account.tier === "pending") throw new Error("NO_ACTIVE_PLAN");

  const base = {
    tier: account.tier,
    displayName: account.displayName,
    email: account.email,
    username: account.username,
  };

  if (String(account.planCancelledAt || "").trim()) {
    return {
      ...base,
      session: toAuthSession(account),
      planEndsAt: String(account.planEndsAt || ""),
      manual: false,
      alreadyCancelled: true,
    };
  }

  const subscriptionId = String(account.paypalSubscriptionId || "").trim();
  const nowIso = new Date().toISOString();

  if (!subscriptionId) {
    /* Older plan with no PayPal link on file. The student cancels in PayPal; JD is told. */
    account.planCancelledAt = nowIso;
    await kv.put(userKey(username), JSON.stringify(account));
    await invalidateStudentListSnapshot(kv);
    return {
      ...base,
      session: toAuthSession(account),
      planEndsAt: "",
      manual: true,
      alreadyCancelled: false,
    };
  }

  /* Read the paid-through date first. PayPal drops it once the plan is cancelled. */
  const info = await getPaypalSubscriptionInfo(subscriptionId, env);
  const endsMs = planEndMs(info);
  const alreadyInactive = Boolean(
    info && ["CANCELLED", "EXPIRED", "SUSPENDED"].includes(info.status)
  );
  if (!alreadyInactive) {
    await cancelPaypalSubscription(subscriptionId, env, "Cancelled by subscriber");
  }

  account.planCancelledAt = nowIso;
  account.planEndsAt = new Date(endsMs).toISOString();
  await kv.put(userKey(username), JSON.stringify(account));
  await invalidateStudentListSnapshot(kv);

  return {
    ...base,
    session: toAuthSession(account),
    planEndsAt: account.planEndsAt,
    manual: false,
    alreadyCancelled: false,
  };
}

export async function deleteUserAccount(
  username: string,
  env: KvEnv
): Promise<{ username: string; deleted: boolean }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error("USERNAME_REQUIRED");

  const raw = await kv.get(userKey(normalized));
  if (!raw) return { username: normalized, deleted: false };

  let account: UserAccount;
  try {
    account = JSON.parse(raw) as UserAccount;
  } catch {
    throw new Error("INVALID_ACCOUNT");
  }

  const subscriptionId = String(account.paypalSubscriptionId || "").trim();
  if (subscriptionId) {
    await cancelPaypalSubscription(subscriptionId, env);
  }

  await kv.delete(userKey(normalized));
  if (account.email) {
    await kv.delete(userEmailKey(normalizeEmail(account.email)));
  }

  const ids = await readUsersIndex(kv);
  await writeUsersIndex(
    kv,
    ids.filter((id) => id !== normalized)
  );
  await invalidateStudentListSnapshot(kv);

  return { username: normalized, deleted: true };
}

const RESET_TTL_SEC = 60 * 60;
const resetTokenKey = (tokenHash: string) => `password-reset:${tokenHash}`;
const resetUserKey = (username: string) => `password-reset-user:${username}`;
const resetRateKey = (email: string) => `password-reset-rate:${email}`;

interface PasswordResetRecord {
  username: string;
  email: string;
  createdAt: string;
}

export async function getUserAccountByEmail(
  email: string,
  env: KvEnv
): Promise<UserAccount | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");
  const normalized = normalizeEmail(email);
  if (!normalized || !isValidEmail(normalized)) return null;
  const username = String((await kv.get(userEmailKey(normalized))) || "")
    .trim()
    .toLowerCase();
  if (!username) return null;
  return getUserAccount(username, env);
}

export async function createPasswordResetToken(
  email: string,
  env: KvEnv
): Promise<{ token: string; account: UserAccount } | { skipped: true; reason: string }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const account = await getUserAccountByEmail(email, env);
  if (!account) return { skipped: true, reason: "unknown" };

  const rateRaw = await kv.get(resetRateKey(account.email));
  const rateCount = Number(rateRaw || 0);
  if (rateCount >= 3) return { skipped: true, reason: "rate" };

  const prevHash = String((await kv.get(resetUserKey(account.username))) || "").trim();
  if (prevHash) await kv.delete(resetTokenKey(prevHash));

  const token = randomUrlToken(32);
  const tokenHash = await sha256Base64Url(token);
  const record: PasswordResetRecord = {
    username: account.username,
    email: account.email,
    createdAt: new Date().toISOString(),
  };
  await kv.put(resetTokenKey(tokenHash), JSON.stringify(record), {
    expirationTtl: RESET_TTL_SEC,
  });
  await kv.put(resetUserKey(account.username), tokenHash, {
    expirationTtl: RESET_TTL_SEC,
  });
  await kv.put(resetRateKey(account.email), String(rateCount + 1), {
    expirationTtl: RESET_TTL_SEC,
  });
  return { token, account };
}

export async function resetPasswordWithToken(
  data: { token?: string; password?: string; confirmPassword?: string },
  env: KvEnv
): Promise<{ session: AuthSession }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const token = String(data.token || "").trim();
  const password = String(data.password || "");
  const confirmPassword = String(data.confirmPassword ?? "");
  if (!token) throw new Error("RESET_TOKEN_INVALID");
  if (!password) throw new Error("PASSWORD_REQUIRED");
  if (password.length < 4) throw new Error("PASSWORD_TOO_SHORT");
  if (password !== confirmPassword) throw new Error("PASSWORD_MISMATCH");

  const tokenHash = await sha256Base64Url(token);
  const raw = await kv.get(resetTokenKey(tokenHash));
  if (!raw) throw new Error("RESET_TOKEN_INVALID");

  let record: PasswordResetRecord;
  try {
    record = JSON.parse(raw) as PasswordResetRecord;
  } catch {
    throw new Error("RESET_TOKEN_INVALID");
  }

  const account = await getUserAccount(record.username, env);
  if (!account) throw new Error("RESET_TOKEN_INVALID");

  const { salt, hash } = await hashPassword(password);
  account.passwordSalt = salt;
  account.passwordHash = hash;
  await kv.put(userKey(account.username), JSON.stringify(account));
  await kv.delete(resetTokenKey(tokenHash));
  await kv.delete(resetUserKey(account.username));
  return { session: toAuthSession(account) };
}
