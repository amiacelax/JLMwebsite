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

const meta = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const card = document.querySelector(".hw-listen-card");
  const cs = getComputedStyle(mount);
  return {
    zoom: cs.zoom,
    transform: cs.transform,
    focusZoom: cs.getPropertyValue("--hw-focus-zoom").trim(),
    cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
    cssHref: [...document.styleSheets]
      .map((s) => s.href)
      .filter((h) => h && h.includes("hw-hub-v5"))
      .map((h) => h.split("/").pop()),
  };
});

async function tryClick(sel, { scroll = true } = {}) {
  const loc = page.locator(sel).first();
  if (!(await loc.count())) return { sel, missing: true };
  if (scroll) {
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      const zone = document.getElementById("hw-v5-homework-zone");
      if (!el || !zone) return;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (mid < 40 || mid > zone.clientHeight - 40) {
        zone.scrollTop += mid - zone.clientHeight / 2;
      }
    }, sel);
    await page.waitForTimeout(150);
  }
  const hit = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    window.__clk = null;
    el.addEventListener("click", () => (window.__clk = s), { once: true });
    return {
      x,
      y,
      inView: y >= 0 && y <= innerHeight,
      hitOk: !!(top && (top === el || el.contains(top))),
      top: top
        ? top.tagName +
          (top.id ? "#" + top.id : "") +
          "." +
          String(top.className).slice(0, 45)
        : "NULL",
      stoleByZone: !!(top && top.id === "hw-v5-homework-zone"),
    };
  }, sel);
  if (!hit.inView) return { sel, hit, skipped: true };
  await page.mouse.click(hit.x, hit.y);
  const got = await page.evaluate(() => window.__clk);
  return { sel, hit, clickOk: got === sel };
}

const results = {
  url,
  meta,
  play: await tryClick(".hw-audio-chrome__play", { scroll: false }),
  tip: await tryClick(".hw-recording-tip__trigger"),
  blank: await tryClick(".hw-blank"),
  glass: await tryClick('[data-tb-tool="glass"]'),
  slide: await tryClick(".hw-worksheet__slide-btn:not([disabled])", {
    scroll: false,
  }),
  exit: await tryClick(".hw-focus-bar__exit", { scroll: false }),
};

const stillFocus = await page.evaluate(() =>
  document.body.classList.contains("hw-hw-focus-mode")
);
results.exitExitedFocus = !stillFocus;

console.log(JSON.stringify(results, null, 2));
await browser.close();
