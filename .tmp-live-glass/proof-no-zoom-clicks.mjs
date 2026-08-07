/**
 * Real-mouse Focus click proof after zoom removal.
 * Asserts play toggles Pause, blank focuses + accepts type, exit leaves Focus.
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.HW_BASE || "http://127.0.0.1:8787";
const CB = Date.now();
const url = `${BASE}/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=${CB}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1000);

const meta = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const bar = document.querySelector(".hw-toolbar-bar");
  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    zoom: mount ? getComputedStyle(mount).zoom : null,
    transform: mount ? getComputedStyle(mount).transform : null,
    barParent: bar?.parentElement?.id || bar?.parentElement?.className?.slice?.(0, 40),
    barIsAfterMount: bar?.previousElementSibling?.id === "hw-v2-worksheet-mount",
    cssHref: [...document.styleSheets]
      .map((s) => s.href)
      .filter((h) => h && /hw-hub-v5|styles\.css|magnifying/.test(h))
      .map((h) => h.split("/").pop()),
  };
});

async function realClick(sel) {
  const prep = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const zone = document.getElementById("hw-v5-homework-zone");
    if (!el) return null;
    const r0 = el.getBoundingClientRect();
    if (zone && (r0.top < 40 || r0.bottom > innerHeight - 20)) {
      zone.scrollTop += r0.top + r0.height / 2 - innerHeight / 2;
    }
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    window.__clk = null;
    el.addEventListener("click", () => (window.__clk = s), { once: true });
    return {
      x,
      y,
      hitOk: !!(top && (top === el || el.contains(top))),
      top: top && `${top.tagName}.${String(top.className).slice(0, 40)}`,
      stack: document.elementsFromPoint(x, y).slice(0, 8).map((e) =>
        `${e.tagName}.${String(e.className).slice(0, 28)}#${e.id || ""}`
      ),
    };
  }, sel);
  if (!prep) return { sel, missing: true };
  await page.mouse.click(prep.x, prep.y);
  await page.waitForTimeout(200);
  const after = await page.evaluate((s) => {
    const el = document.querySelector(s);
    let state = {};
    if (s.includes("play")) {
      const audio = el
        ?.closest(".hw-listen-card, .hw-audio-chrome, .hw-audio-player")
        ?.querySelector("audio");
      state = {
        label: el?.getAttribute("aria-label"),
        paused: audio ? audio.paused : null,
      };
    } else if (s.includes("blank")) {
      state = { active: document.activeElement === el, value: el?.value };
    } else if (s.includes("exit")) {
      state = { focus: document.body.classList.contains("hw-hw-focus-mode") };
    } else if (s.includes("glass")) {
      state = {
        pressed: el?.getAttribute("aria-pressed"),
        glassOut: document.documentElement.classList.contains("hw-tb-glass-out"),
      };
    }
    return { got: window.__clk, state };
  }, sel);
  return { sel, prep, after, clickOk: after.got === sel };
}

const play = await realClick(".hw-audio-chrome__play");
const tip = await realClick(".hw-recording-tip__trigger");
const blank = await realClick(".hw-blank");
let blankVal = null;
if (blank.clickOk && blank.after?.state?.active) {
  await page.keyboard.type("probe");
  blankVal = await page.locator(".hw-blank").first().inputValue();
}
const glass = await realClick('[data-tb-tool="glass"]');
const exit = await realClick(".hw-focus-bar__exit");

const out = {
  url,
  meta,
  play,
  tip,
  blank,
  blankVal,
  glass,
  exit,
  proof: {
    zoomIs1: meta.zoom === "1" || meta.zoom === 1,
    playToggled: play.after?.state?.label === "Pause" || play.after?.state?.paused === false,
    blankTyped: blankVal === "probe",
    exitLeftFocus: exit.after?.state?.focus === false,
    toolbarOutsideMount: !!meta.barIsAfterMount,
  },
};

fs.writeFileSync(".tmp-live-glass/proof-no-zoom-clicks.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

const ok =
  out.proof.zoomIs1 &&
  out.proof.playToggled &&
  out.proof.blankTyped &&
  out.proof.exitLeftFocus;
await browser.close();
process.exit(ok ? 0 : 2);
