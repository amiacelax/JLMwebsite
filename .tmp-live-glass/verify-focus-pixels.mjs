import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.waitForTimeout(400);
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(900);

const meta = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const zone = document.getElementById("hw-v5-homework-zone");
  const card = document.querySelector(".hw-listen-card");
  const scale =
    parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;
  zone.scrollTop = zone.scrollHeight;
  const r = card.getBoundingClientRect();
  const cs = getComputedStyle(card);
  return {
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
    radius: cs.borderRadius,
    bg: cs.backgroundColor,
    border: cs.borderBottomColor,
  };
});

// Sample pixels near reported bottom-left / bottom-right of card
const shot = await page.screenshot({ type: "png" });
fs.writeFileSync("C:/JLM Website/.tmp-live-glass/focus-bottom-pixel.png", shot);

const pixels = await page.evaluate((m) => {
  // Draw samples via a canvas from... we can't easily. Use elementsFromPoint.
  const y = Math.round(m.bottom) - 3;
  const xL = Math.round(m.left) + 8;
  const xR = Math.round(m.right) - 8;
  const xMid = Math.round((m.left + m.right) / 2);
  function sample(x, y) {
    const els = document.elementsFromPoint(x, y).map((e) => ({
      tag: e.tagName,
      id: e.id,
      cls: (e.className || "").toString().slice(0, 40),
    }));
    return { x, y, top: els[0] };
  }
  // Also check a few px below card bottom — should NOT be listen-card
  return {
    insideBL: sample(xL, y),
    insideBR: sample(xR, y),
    insideMid: sample(xMid, y),
    belowMid: sample(xMid, Math.round(m.bottom) + 6),
    cornerBL: sample(Math.round(m.left) + 2, Math.round(m.bottom) - 2),
    meta: m,
  };
}, meta);

console.log(JSON.stringify(pixels, null, 2));
await browser.close();
