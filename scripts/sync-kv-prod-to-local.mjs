/**
 * Copy production HOMEWORK_KV into the local preview namespace used by `npm run dev`.
 *
 * Usage:
 *   npm run sync:kv              # homework + accounts + submissions (default)
 *   npm run sync:kv -- --all     # entire namespace (~300 keys)
 *   npm run sync:kv -- --dry-run # list keys only
 *
 * Requires: wrangler logged in (`npx wrangler login`) for --remote reads.
 * After sync: restart `npm run dev` if it is already running.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WRANGLER_BIN = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const CONCURRENCY = 4;

const BINARY_PREFIXES = [
  "submission-photo:",
  "submission-video:",
  "teacher-idea-asset:",
];

/** Keys needed for local homework + submission + teacher review testing. */
const HOMEWORK_PREFIXES = [
  "catalog-index",
  "catalog:",
  "assignment:",
  "student:",
  "submissions-index",
  "submission:",
  "submission-photo:",
  "submission-photo-meta:",
  "submission-video:",
  "submission-video-meta:",
  "hw-draft:",
  "hw-comments-draft:",
  "user-accounts-index",
  "user-account:",
  "user-email:",
];

function parseArgs(argv) {
  const opts = { all: false, dryRun: false };
  for (const arg of argv) {
    if (arg === "--all") opts.all = true;
    if (arg === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

function wranglerArgs(args, { text = false, binary = false } = {}) {
  const full = [WRANGLER_BIN, ...args];
  const options = {
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  };
  if (text) options.encoding = "utf8";
  const result = spawnSync(process.execPath, full, options);
  if (result.status !== 0) {
    const err = result.stderr?.toString?.() || result.error?.message || "wrangler failed";
    throw new Error(String(err).trim());
  }
  if (binary) return result.stdout;
  return text ? result.stdout : result.stdout;
}

function listProdKeys() {
  const raw = wranglerArgs(["kv", "key", "list", "--binding=HOMEWORK_KV", "--remote"], {
    text: true,
  });
  const keys = JSON.parse(raw);
  return keys.map((row) => row.name).filter(Boolean);
}

function keyMatchesHomework(key) {
  return HOMEWORK_PREFIXES.some((prefix) =>
    prefix.endsWith(":")
      ? key.startsWith(prefix)
      : key === prefix || key.startsWith(prefix)
  );
}

function isBinaryKey(key) {
  return BINARY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function tmpFile(suffix) {
  return path.join(
    os.tmpdir(),
    `jlm-kv-sync-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`
  );
}

function getProdValue(key) {
  if (isBinaryKey(key)) {
    return {
      binary: true,
      data: wranglerArgs(["kv", "key", "get", key, "--binding=HOMEWORK_KV", "--remote"], {
        binary: true,
      }),
    };
  }
  const text = wranglerArgs(
    ["kv", "key", "get", key, "--binding=HOMEWORK_KV", "--remote", "--text"],
    { text: true }
  );
  return { binary: false, data: text };
}

function putLocalValue(key, payload) {
  const file = tmpFile(payload.binary ? ".bin" : ".txt");
  try {
    fs.writeFileSync(file, payload.data);
    wranglerArgs([
      "kv",
      "key",
      "put",
      key,
      `--path=${file}`,
      "--binding=HOMEWORK_KV",
      "--local",
      "--preview",
    ]);
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

async function mapPool(items, limit, fn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const opts = parseArgs(process.argv.slice(2));
const allKeys = listProdKeys();
const keys = opts.all ? allKeys : allKeys.filter(keyMatchesHomework);
keys.sort();

console.log(
  `Production HOMEWORK_KV: ${allKeys.length} keys total; syncing ${keys.length} (${opts.all ? "all" : "homework"}).`
);

if (opts.dryRun) {
  for (const key of keys) console.log(key);
  process.exit(0);
}

let ok = 0;
let failed = 0;
const started = Date.now();
const failures = [];

await mapPool(keys, CONCURRENCY, async (key) => {
  try {
    const value = getProdValue(key);
    putLocalValue(key, value);
    ok += 1;
    const kind = value.binary ? "bin" : "txt";
    process.stdout.write(`\r[${ok + failed}/${keys.length}] ${kind} ${key.slice(0, 72).padEnd(72)}`);
    return { ok: true };
  } catch (err) {
    failed += 1;
    failures.push({ key, error: err?.message || String(err) });
    return { ok: false };
  }
});

if (failures.length) {
  console.error("\n\nFailed keys:");
  for (const f of failures) console.error(`  ${f.key}: ${f.error}`);
}

const sec = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\nDone in ${sec}s — copied ${ok}, failed ${failed}.`);
console.log("Restart npm run dev, then log in with prod accounts on http://localhost:8787");

function verifyLocal() {
  try {
    const catalog = wranglerArgs(
      ["kv", "key", "get", "catalog-index", "--binding=HOMEWORK_KV", "--local", "--preview", "--text"],
      { text: true }
    );
    const subs = wranglerArgs(
      ["kv", "key", "get", "submissions-index", "--binding=HOMEWORK_KV", "--local", "--preview", "--text"],
      { text: true }
    );
    console.log(`Verify: catalog-index present (${catalog.trim().length} chars)`);
    console.log(`Verify: submissions-index present (${subs.trim().length} chars)`);
  } catch (err) {
    console.warn("Verify skipped:", err?.message || err);
  }
}

if (failed === 0) verifyLocal();
