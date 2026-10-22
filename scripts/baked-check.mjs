#!/usr/bin/env node
/**
 * "Baked language" checker - finds garbled Japanese / punctuation anywhere on the site.
 *
 *   node scripts/baked-check.mjs            files in public/ + src/  AND  live saved data (KV)
 *   node scripts/baked-check.mjs --local    files only (this is what runs before every deploy)
 *   node scripts/baked-check.mjs --live     live saved data only (assignments, catalog, notebooks, drafts, ...)
 *   node scripts/baked-check.mjs --live --fix    repair what it finds in the live data
 *
 * Baked language = text that was saved after being read with the wrong code page, e.g.
 *     πüèσÉìσëìπü»∩╝ƒ   or   â€”   instead of   お名前は？   or   —
 * It uses the exact same repair code as the Worker (src/homework-encoding.ts), so what this flags is
 * what the Worker would repair, and vice versa.
 */
import { build } from "esbuild";
import { readdirSync, readFileSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, extname, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const quiet = args.has("--quiet");
const doLocal = args.has("--local") || !args.has("--live");
const doLive = args.has("--live") || !args.has("--local");
const fix = args.has("--fix");
const SITE = process.env.BAKED_SITE || "https://japaneselanguagementor.com";
const TEACHER = process.env.HW_TEACHER_USER || "jlm";

/* ---- load the Worker's own repair code ---- */
const tmp = mkdtempSync(join(tmpdir(), "baked-"));
const bundle = join(tmp, "enc.mjs");
await build({
  entryPoints: [join(ROOT, "src", "homework-encoding.ts")],
  bundle: true,
  format: "esm",
  outfile: bundle,
  logLevel: "error",
});
const { repairMojibakeUtf8 } = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

/* ---- local files ---- */
const TEXT_EXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".md", ".ts", ".txt", ".mdc", ".toml"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".wrangler", "vendor", "dist", "videos", "media", "audio", "images"]);
const SKIP_FILES = /(\.min\.js|html2canvas|package-lock\.json)$/i;
const SKIP_PATHS = [
  /^public[\\/]preview[\\/]/i, // throw-away mockups
  /(^|[\\/])(hw-encoding\.js|homework-encoding\.ts)$/i, // these files describe garbled text on purpose
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".tmp") || SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (TEXT_EXT.has(extname(name).toLowerCase()) && !SKIP_FILES.test(name) && st.size < 3_000_000) yield full;
  }
}

let problems = 0;
const say = (...a) => console.log(...a);

if (doLocal) {
  say("== Files (public/ + src/) ==");
  let found = 0;
  for (const base of ["public", "src"]) {
    for (const file of walk(join(ROOT, base))) {
      const rel = relative(ROOT, file);
      if (SKIP_PATHS.some((re) => re.test(rel))) continue;
      const text = readFileSync(file, "utf8");
      if (text.charCodeAt(0) === 0xfeff && rel.endsWith(".json")) {
        say(`  ${rel}: starts with a BOM (JSON should be plain UTF-8)`);
        found++;
      }
      if (text.includes("\uFFFD")) {
        const line = text.slice(0, text.indexOf("\uFFFD")).split("\n").length;
        say(`  ${rel}:${line}  contains a broken character (U+FFFD)`);
        found++;
      }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("baked-ignore") || /^\s*(\/\/|\/\*|\*)/.test(line)) continue; // comments may quote garbled examples
        // quick filter: only lines with a non-ASCII char can be baked
        if (!/[^\x00-\x7f]/.test(line)) continue;
        const fixed = repairMojibakeUtf8(line);
        if (fixed !== line) {
          found++;
          say(`  ${rel}:${i + 1}  ${line.trim().slice(0, 70)}   ->   ${fixed.trim().slice(0, 50)}`);
        }
      }
    }
  }
  say(found ? `  ${found} problem(s) in files.` : "  clean.");
  problems += found;
}

/* ---- live data ---- */
if (doLive) {
  say(`== Live saved data (${SITE}) ==`);
  let cursor = "";
  let scanned = 0;
  let found = 0;
  let brokenFound = 0;
  try {
    do {
      const url = `${SITE}/api/baked-check?teacherUsername=${encodeURIComponent(TEACHER)}${fix ? "&fix=1" : ""}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
      const data = await res.json();
      scanned += data.scanned || 0;
      for (const b of data.bad || []) {
        found++;
        say(`  ${b.key}  (${b.strings} garbled)${b.fixed ? "  FIXED" : ""}\n      ${b.sample}`);
      }
      for (const b of data.broken || []) {
        brokenFound++;
        say(`  ${b.key}  has ${b.lost} lost character(s) (shown as a broken box) - the original text is gone, retype it`);
      }
      cursor = data.nextCursor || "";
    } while (cursor);
    say(found ? `  ${found} saved item(s) with baked language (${scanned} scanned).` : `  clean (${scanned} items scanned).`);
    problems += (fix ? 0 : found) + brokenFound;
  } catch (e) {
    say("  could not check live data:", e.message);
    if (!args.has("--local")) problems += 1;
  }
}

if (problems) {
  if (!quiet) say("\nBaked language found. Live data: run with --live --fix. Files: fix the text by hand (they are listed above).");
  process.exit(1);
}
say("\nNo baked language.");
