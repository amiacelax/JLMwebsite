import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(900);

// Scroll zone to bottom where toolbar lives
await page.evaluate(() => {
  const zone = document.getElementById("hw-v5-homework-zone");
  zone.scrollTop = zone.scrollHeight;
});
await page.waitForTimeout(400);

const out = await page.evaluate(() => {
  const zone = document.getElementById("hw-v5-homework-zone");
  const tools = ["glass", "cloud", "focus", "answers", "send"];
  const results = {};
  for (const tool of tools) {
    const btn = document.querySelector(`.hw-toolbar-bar__btn[data-tb-tool="${tool}"]`);
    if (!btn) {
      results[tool] = "missing";
      continue;
    }
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    let fired = false;
    btn.addEventListener("click", () => { fired = true; }, { once: true });
    btn.click();
    results[tool] = {
      rect: { t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width) },
      hit: top ? `${top.tagName}.${String(top.className).slice(0, 40)}` : "NULL",
      ok: !!(top && (top === btn || btn.contains(top))),
      fired,
      pe: getComputedStyle(btn).pointerEvents,
      disabled: btn.disabled,
    };
  }

  // Stack at toolbar center
  const tb = document.querySelector(".hw-toolbar-bar");
  const tr = tb.getBoundingClientRect();
  const stack = document
    .elementsFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2)
    .slice(0, 8)
    .map((el) => `${el.tagName}.${String(el.className).slice(0, 35)}[pe=${getComputedStyle(el).pointerEvents},z=${getComputedStyle(el).zIndex}]`);

  return {
    scrollTop: zone.scrollTop,
    scrollHeight: zone.scrollHeight,
    clientHeight: zone.clientHeight,
    results,
    stack,
    tbRect: {
      t: Math.round(tr.top),
      b: Math.round(tr.bottom),
      pe: getComputedStyle(tb).pointerEvents,
      zi: getComputedStyle(tb).zIndex,
      transform: getComputedStyle(tb).transform,
    },
  };
});

// Real mouse on glass
await page.evaluate(() => {
  window.__glassFired = false;
  document
    .querySelector('.hw-toolbar-bar__btn[data-tb-tool="glass"]')
    ?.addEventListener("click", () => { window.__glassFired = true; }, { once: true });
});
const gBox = await page.locator('.hw-toolbar-bar__btn[data-tb-tool="glass"]').boundingBox();
if (gBox) {
  await page.mouse.click(gBox.x + gBox.width / 2, gBox.y + gBox.height / 2);
  await page.waitForTimeout(200);
}
const glassFired = await page.evaluate(() => window.__glassFired);

console.log(JSON.stringify({ out, gBox, glassFired }, null, 2));
await page.screenshot({ path: "C:/JLM Website/.tmp-live-glass/focus-toolbar-scroll.png" });
await browser.close();
