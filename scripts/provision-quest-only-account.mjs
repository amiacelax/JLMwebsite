/**
 * Provision a Quest Only account in production KV.
 * Usage: node scripts/provision-quest-only-account.mjs [username] [password]
 * Default: questonly / jelly
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { webcrypto } from "node:crypto";

const ITERATIONS = 100_000;
const username = String(process.argv[2] || "questonly")
  .trim()
  .toLowerCase();
const password = String(process.argv[3] || "jelly");
const email = `${username}@japaneselanguagementor.com`;
const displayName = "Quest Only Demo";

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function hashPassword(passwordText) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await webcrypto.subtle.importKey(
    "raw",
    enc.encode(passwordText),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await webcrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(new Uint8Array(bits)),
  };
}

function wranglerGet(key) {
  try {
    return execSync(
      `npx wrangler kv key get "${key}" --binding=HOMEWORK_KV --remote`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
  } catch {
    return "";
  }
}

function wranglerPut(key, value) {
  const file = path.join(
    os.tmpdir(),
    `jlm-kv-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(file, value, "utf8");
  try {
    execSync(
      `npx wrangler kv key put "${key}" --path="${file}" --binding=HOMEWORK_KV --remote --preview false`,
      { stdio: "inherit" }
    );
  } finally {
    fs.unlinkSync(file);
  }
}

const existing = wranglerGet(`user-account:${username}`);
if (existing) {
  const record = JSON.parse(existing);
  record.accountLabel = "quest_only";
  record.tier = "quest_only";
  wranglerPut(`user-account:${username}`, JSON.stringify(record));
  console.log(`Updated existing account "${username}" to quest_only tier.`);
  process.exit(0);
}

const { salt, hash } = await hashPassword(password);
const id = `usr-${Date.now().toString(36)}`;
const record = {
  id,
  username,
  email,
  passwordHash: hash,
  passwordSalt: salt,
  displayName,
  role: "student",
  accountLabel: "quest_only",
  tier: "quest_only",
  courses: [],
  videoResponseUnlock: false,
  createdAt: new Date().toISOString(),
};

wranglerPut(`user-account:${username}`, JSON.stringify(record));
wranglerPut(`user-email:${email}`, username);

const indexRaw = wranglerGet("user-accounts-index");
let ids = [];
if (indexRaw) {
  try {
    ids = JSON.parse(indexRaw);
  } catch {
    ids = [];
  }
}
if (!ids.includes(username)) {
  ids.unshift(username);
  wranglerPut("user-accounts-index", JSON.stringify(ids));
}

console.log(`Created Quest Only account "${username}" (${email}).`);
console.log(`Password: ${password}`);
console.log("PayPal plan id: REPLACE_QUEST_ONLY when ready.");
