import { chromium } from "playwright";

const url =
  process.argv[2] ||
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=" +
    Date.now();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1200);

async function tryRealClick(sel) {
  const exists = await page.locator(sel).count();
  if (!exists) return { sel, missing: true };

  // Scroll target into theater viewport via zone scroll, not scrollIntoView (can break transform)
  const prep = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const zone = document.getElementById("hw-v5-homework-zone");
    if (!el || !zone) return { ok: false };
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (mid < 40 || mid > zone.clientHeight - 40) {
      zone.scrollTop += mid - zone.clientHeight / 2;
    }
    return { ok: true, scrollTop: zone.scrollTop };
  }, sel);
  await page.waitForTimeout(200);

  const hit = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    window.__clk = null;
    el.addEventListener("click", () => (window.__clk = s), { once: true });
    return {
      x,
      y,
      top:
        top &&
        `${top.tagName}.${String(top.className).slice(0, 40)}#${top.id || ""}`,
      hitOk: !!(top && (top === el || el.contains(top))),
      inView: y >= 0 && y <= innerHeight,
      scrollTop: document.getElementById("hw-v5-homework-zone")?.scrollTop,
    };
  }, sel);

  if (!hit?.inView) return { sel, prep, hit, skipped: "not-in-view" };

  await page.mouse.click(hit.x, hit.y);
  const got = await page.evaluate(() => window.__clk);
  return { sel, prep, hit, clickOk: got === sel, got };
}

const results = {
  url,
  play: await tryRealClick(".hw-audio-chrome__play"),
  tip: await tryRealClick(".hw-recording-tip__trigger"),
  blank: await tryRealClick(".hw-blank"),
  glass: await tryRealClick('[data-tb-tool="glass"]'),
  focus: await tryRealClick('[data-tb-tool="focus"]'),
  slide: await tryRealClick(".hw-worksheet__slide-btn:not([disabled])"),
  exit: await tryRealClick(".hw-focus-bar__exit"),
};

// After blank click, type
if (results.blank?.clickOk) {
  await page.keyboard.type("test");
  results.blankVal = await page.locator(".hw-blank").first().inputValue();
}

// Diagnose visual vs layout for tip before scroll
results.diag = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const form = document.querySelector("form.hw-worksheet");
  const tip = document.querySelector(".hw-recording-tip__trigger");
  const play = document.querySelector(".hw-audio-chrome__play");
  const zone = document.getElementById("hw-v5-homework-zone");
  const scale =
    parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;

  function info(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      rect: {
        t: Math.round(r.top),
        l: Math.round(r.left),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      offsetTop: el.offsetTop,
      offsetH: el.offsetHeight,
      pe: cs.pointerEvents,
    };
  }

  // Sample points along a vertical line through play center x
  const playR = play?.getBoundingClientRect();
  const samples = [];
  if (playR) {
    const x = playR.left + playR.width / 2;
    for (let y = 50; y < 900; y += 50) {
      const t = document.elementFromPoint(x, y);
      samples.push({
        y,
        top: t
          ? `${t.tagName}.${String(t.className).slice(0, 30)}`
          : "NULL",
      });
    }
  }

  return {
    scale,
    zoneScroll: zone?.scrollTop,
    zoneSH: zone?.scrollHeight,
    zoneCH: zone?.clientHeight,
    formOverflow: form ? getComputedStyle(form).overflow : null,
    formPe: form ? getComputedStyle(form).pointerEvents : null,
    play: info(play),
    tip: info(tip),
    samples,
  };
});

console.log(JSON.stringify(results, null, 2));
await browser.close();
