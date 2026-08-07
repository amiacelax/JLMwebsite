import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1000);

// Listen for all clicks on document
await page.evaluate(() => {
  window.__clicks = [];
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      window.__clicks.push({
        tag: t.tagName,
        cls: String(t.className || "").slice(0, 50),
        x: e.clientX,
        y: e.clientY,
        pe: getComputedStyle(t).pointerEvents,
      });
    },
    true
  );
});

const targets = [
  { sel: ".hw-audio-chrome__play", name: "play" },
  { sel: ".hw-recording-tip__trigger", name: "tip" },
  { sel: ".hw-blank", name: "blank" },
  { sel: '.hw-toolbar-bar__btn[data-tb-tool="glass"]', name: "glass" },
  { sel: ".hw-focus-bar__exit", name: "exit" },
];

const results = [];
for (const t of targets) {
  const loc = page.locator(t.sel).first();
  const count = await loc.count();
  if (!count) {
    results.push({ name: t.name, missing: true });
    continue;
  }
  // scroll into view via JS (zone scroll)
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const zone = document.getElementById("hw-v5-homework-zone");
    el?.scrollIntoView({ block: "center" });
    // also ensure zone scrolled if needed
    const r = el.getBoundingClientRect();
    if (r.top < 60) zone.scrollTop += r.top - 80;
    if (r.bottom > innerHeight - 20) zone.scrollTop += r.bottom - innerHeight + 40;
  }, t.sel);
  await page.waitForTimeout(200);

  const box = await loc.boundingBox();
  const before = await page.evaluate(() => window.__clicks.length);
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
  }
  const after = await page.evaluate(() => ({
    clicks: window.__clicks.slice(-3),
    len: window.__clicks.length,
  }));

  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        el: el ? `${el.tagName}.${String(el.className || "").slice(0, 40)}` : null,
        stack: document.elementsFromPoint(x, y).slice(0, 6).map((e) =>
          `${e.tagName}.${String(e.className || "").slice(0, 30)}`
        ),
      };
    },
    box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: 0, y: 0 }
  );

  results.push({
    name: t.name,
    box,
    clickCountDelta: after.len - before,
    lastClicks: after.clicks,
    hit,
  });
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
