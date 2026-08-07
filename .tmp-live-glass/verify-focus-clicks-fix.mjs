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

const out = await page.evaluate(() => {
  const zone = document.getElementById("hw-v5-homework-zone");
  const card = document.getElementById("hw-v5-worksheet-card");
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const play = document.querySelector(".hw-audio-chrome__play");
  const glass = document.querySelector('[data-tb-tool="glass"]');
  const blank = document.querySelector(".hw-blank");
  zone.scrollTop = 0;

  function hit(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const t =
      y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth
        ? document.elementFromPoint(x, y)
        : null;
    return {
      y: Math.round(r.top),
      b: Math.round(r.bottom),
      inView: r.top < innerHeight && r.bottom > 0,
      hitOk: !!(t && (t === el || el.contains(t))),
      top: t ? t.tagName + "." + String(t.className).slice(0, 40) : "NULL/OOB",
    };
  }

  const before = {
    cardDisplay: getComputedStyle(card).display,
    zoneSH: zone.scrollHeight,
    zoneCH: zone.clientHeight,
    mountBottom: Math.round(mount.getBoundingClientRect().bottom),
    cardBottom: Math.round(card.getBoundingClientRect().bottom),
    mountMB: getComputedStyle(mount).marginBottom,
    play: hit(play),
    blank: hit(blank),
    glass: hit(glass),
  };

  // Simulate missing BFC (margin collapse)
  card.style.setProperty("display", "block", "important");
  void zone.offsetHeight;
  zone.scrollTop = 0;
  const afterCollapse = {
    zoneSH: zone.scrollHeight,
    mountBottom: Math.round(mount.getBoundingClientRect().bottom),
    cardBottom: Math.round(card.getBoundingClientRect().bottom),
    play: hit(play),
    blank: hit(blank),
    glass: hit(glass),
  };

  card.style.removeProperty("display");
  void zone.offsetHeight;
  zone.scrollTop = 0;

  // Real Playwright-style interactions at visual coords without scrollIntoView
  return { before, afterCollapse };
});

// Real mouse clicks at getBoundingClientRect centers (no force)
async function tryClick(sel) {
  const box = await page.locator(sel).first().boundingBox();
  if (!box) return { sel, missing: true };
  let fired = false;
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    el?.addEventListener("click", () => (window.__clk = s), { once: true });
  }, sel);
  await page.evaluate(() => {
    window.__clk = null;
  });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const got = await page.evaluate(() => window.__clk);
  return { sel, box, fired: got === sel };
}

const clicks = {
  play: await tryClick(".hw-audio-chrome__play"),
  tip: await tryClick(".hw-recording-tip__trigger"),
  glass: await tryClick('[data-tb-tool="glass"]'),
  focus: await tryClick('[data-tb-tool="focus"]'),
};

// Type in blank
await page.locator(".hw-blank").first().click({ timeout: 5000 });
await page.keyboard.type("test");
const blankVal = await page.locator(".hw-blank").first().inputValue();

console.log(JSON.stringify({ out, clicks, blankVal }, null, 2));
await browser.close();
