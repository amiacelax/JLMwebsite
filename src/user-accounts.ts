import { hashPassword, verifyPassword } from "./password";
import { savePromoSignup } from "./homework-kv";
import { cancelPaypalSubscription, type PaypalEnv } from "./paypal";

const USERS_INDEX = "user-accounts-index";
const userKey = (username: string) => `user-account:${username}`;
const userEmailKey = (email: string) => `user-email:${email}`;

const RESERVED_USERNAMES = new Set([
  "jlm",
  "benm",
  "joshs",
  "deme",
  "ivan",
  "noplan",
  "benc",
  "demo",
  "admin",
  "teacher",
  "support",
]);

export type AccountLabel = "homework_only" | "current_student";
export type AccountTier =
  | "pending"
  | "tier1"
  | "tier2"
  | "tier3"
  | "student_special";

const ACCOUNT_LABELS = new Set<AccountLabel>(["homework_only", "current_student"]);
const ACCOUNT_TIERS = new Set<AccountTier>([
  "pending",
  "tier1",
  "tier2",
  "tier3",
  "student_special",
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
  source: "server";
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
  return {
    username: account.username,
    displayName: account.displayName,
    email: account.email,
    role: account.role,
    accountLabel: account.accountLabel,
    tier: account.tier,
    courses: account.courses || [],
    videoResponseUnlock:
      account.tier === "tier3" || Boolean(account.videoResponseUnlock),
    paypalBilling: Boolean(String(account.paypalSubscriptionId || "").trim()),
    source: "server",
  };
}

export interface SignupInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export async function createUserAccount(
  data: SignupInput,
  env: KvEnv
): Promise<{ session: AuthSession }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = normalizeUsername(data.username);
  const email = normalizeEmail(data.email);
  const password = String(data.password || "");
  const displayName = String(data.displayName || "").trim() || username;

  if (!username) throw new Error("USERNAME_REQUIRED");
  if (!isValidUsername(username)) throw new Error("USERNAME_INVALID");
  if (RESERVED_USERNAMES.has(username)) throw new Error("USERNAME_RESERVED");
  if (!email || !isValidEmail(email)) throw new Error("EMAIL_INVALID");
  if (!password) throw new Error("PASSWORD_REQUIRED");

  const existingUser = await kv.get(userKey(username));
  if (existingUser) throw new Error("USERNAME_TAKEN");

  const existingEmail = await kv.get(userEmailKey(email));
  if (existingEmail) throw new Error("EMAIL_TAKEN");

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
  username: string;
  password: string;
}

export async function loginUserAccount(
  data: LoginInput,
  env: KvEnv
): Promise<{ session: AuthSession }> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const username = normalizeUsername(data.username);
  const password = String(data.password || "");
  if (!username || !password) throw new Error("INVALID_CREDENTIALS");

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
    return JSON.parse(raw) as UserAccount;
  } catch {
    return null;
  }
}

export interface UserAccountSettingsPatch {
  accountLabel?: AccountLabel;
  tier?: AccountTier;
}

export function normalizeAccountLabel(value: unknown): AccountLabel | null {
  const label = String(value || "")
    .trim()
    .toLowerCase();
  if (label === "current_student" || label === "homework_only") return label;
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
  return account;
}

export async function savePaypalSubscription(
  username: string,
  patch: { paypalSubscriptionId?: string; paypalPlan?: string },
  env: KvEnv
): Promise<UserAccount | null> {
  const kv = env.HOMEWORK_KV;
  if (!kv) throw new Error("KV_NOT_CONFIGURED");

  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error("USERNAME_REQUIRED");

  const account = await getUserAccount(normalized, env);
  if (!account) return null;

  const id = String(patch.paypalSubscriptionId || "").trim();
  if (id) account.paypalSubscriptionId = id;
  const plan = String(patch.paypalPlan || "").trim();
  if (plan) account.paypalPlan = plan;

  await kv.put(userKey(normalized), JSON.stringify(account));
  return account;
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

  const ok = await verifyPassword(
    password,
    account.passwordSalt,
    account.passwordHash
  );
  if (!ok) throw new Error("INVALID_CREDENTIALS");

  return deleteUserAccount(username, env);
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

  return { username: normalized, deleted: true };
}
