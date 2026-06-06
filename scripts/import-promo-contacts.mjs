/**
 * One-off: import legacy mailing-list contacts into production promo-signups KV.
 * Run: node scripts/import-promo-contacts.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROD_URL =
  "https://japanese-language-mentor.jplang.workers.dev/api/promo-signups?teacherUsername=jlm";

const CONTACTS = [
  { name: "Benny Grullon", email: "benny.skates@gmail.com" },
  { name: "Alex (Sykopath)", email: "sykohpath@gmail.com" },
  { name: "Dave Dixon", email: "daviddixonit@gmail.com" },
  { name: "Jacob Lightner", email: "lightnerjacob31@gmail.com" },
  { name: "François", email: "havret.francois@gmail.com" },
  { name: "Phil (TheLibrarian)", email: "Theafroscotsman@gmail.com" },
  { name: "Max", email: "rinokumura023@gmail.com" },
  { name: "Juan (gummibaer)", email: "tomkaulitz777@gmail.com" },
  { name: "Mattias Persson", email: "mattte95@hotmail.com" },
  { name: "Agnieszka R (Isilvenn)", email: "ainewedd@gmail.com" },
  { name: "Daniel Gause", email: "danielgause3@gmail.com" },
  { name: "Butterz", email: "butterscotchginoza@gmail.com" },
  { name: "Chiharu Villebois", email: "chiharuv@yahoo.com.au" },
  { name: "Chiharu's Older Brother", email: "chiharuv@yahoo.com.au" },
  { name: "Karl (Kash)", email: "kashcarbon@gmail.com" },
  { name: "Rafael Quintao (Zegamer)", email: "rafaelquintao981@gmail.com" },
  { name: "Taylor Rush", email: "aminalanche@gmail.com" },
  { name: "Demetrius Beckham (Demi)", email: "demetrius.be1992@gmail.com" },
  { name: "Emily", email: "Secretsister5@msn.com" },
  { name: "Deivid Natanael", email: "deividnatanael@gmail.com" },
  { name: "Jared Konner", email: "jared.l.konner@gmail.com" },
  { name: "スティギアン (CJ)", email: "stygiansixx@gmail.com" },
  { name: "Takuya Odakura", email: "odakura.cgd@gmail.com" },
  { name: "Noah Orton, River Sage", email: "thenoahorton@gmail.com" },
  { name: "Anastazia Hamilton", email: "anastaziaghamiltion@icloud.com" },
  { name: "Gary Watanabe", email: "garyw@redeemercitytocity.com" },
  { name: "Jamal Taylor", email: "jt125845@gmail.com" },
  { name: "Jay Crotts", email: "crotts.jay@gmail.com" },
  { name: "Izzy", email: "izzkuz@gmail.com" },
  { name: "Nathan", email: "NathanKissoon@hotmail.co.uk" },
  { name: "Jason Katakura", email: "jaykata@yahoo.com" },
  { name: "Mason Van Horn", email: "Carla Facebook" },
];

function wranglerPut(key, value) {
  const file = path.join(
    os.tmpdir(),
    `jlm-kv-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(file, value, "utf8");
  try {
    execSync(
      `npx wrangler kv key put "${key}" --path="${file}" --binding=HOMEWORK_KV --remote --preview false`,
      { stdio: "pipe", encoding: "utf8" }
    );
  } finally {
    fs.unlinkSync(file);
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function importId(normalized) {
  return `promo-import-${normalized.replace(/[^a-z0-9]/g, "").slice(0, 48)}`;
}

const prodRes = await fetch(PROD_URL);
const prod = prodRes.ok ? await prodRes.json() : { signups: [] };
const byEmail = new Map();

for (const entry of prod.signups || []) {
  byEmail.set(normalizeEmail(entry.email), { ...entry });
}

let added = 0;
let merged = 0;

for (const contact of CONTACTS) {
  const email = String(contact.email || "").trim();
  const normalized = normalizeEmail(email);
  if (!normalized) continue;

  const existing = byEmail.get(normalized);
  if (existing) {
    const names = [existing.name, contact.name].filter(Boolean);
    const unique = [...new Set(names)];
    const joined = unique.join("; ");
    if (joined !== existing.name) {
      existing.name = joined;
      merged += 1;
    }
    byEmail.set(normalized, existing);
    continue;
  }

  const id = importId(normalized);
  byEmail.set(normalized, {
    id,
    name: contact.name,
    email,
    page: "Import",
    signedUpAt: "2020-01-01T00:00:00.000Z",
  });
  added += 1;
}

const records = [...byEmail.values()];
const index = records.map((entry) => entry.id);

for (const entry of records) {
  wranglerPut(`promo-signup:${entry.id}`, JSON.stringify(entry));
  wranglerPut(`promo-email:${normalizeEmail(entry.email)}`, entry.id);
}

wranglerPut("promo-signups-index", JSON.stringify(index));

console.log(
  `Done. Added ${added} new, merged ${merged} names. Production email list now has ${records.length} entries.`
);
