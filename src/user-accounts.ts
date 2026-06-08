import { hashPassword, verifyPassword } from "./password";
import { savePromoSignup } from "./homework-kv";

const USERS_INDEX = "user-accounts-index";
const userKey = (username: string) => `user-account:${username}`;
const userEmailKey = (email: string) => `user-email:${email}`;

const RESERVED_USERNAMES = new Set([
  "jlm",
  "benm",
  "joshs",
  "deme",
  "ivan",
  "admin",
  "teacher",
  "support",
]);

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  displayName: string;
  role: "student";
  accountLabel: "homework_only";
  tier: "pending" | "tier1" | "tier2" | "tier3";
  courses: string[];
  videoResponseUnlock: boolean;
  createdAt: string;
}

export interface AuthSession {
  username: string;
  displayName: string;
  email: string;
  role: "student";
  accountLabel: "homework_only";
  tier: UserAccount["tier"];
  courses: string[];
  videoResponseUnlock: boolean;
  source: "server";
}

interface KvEnv {
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
