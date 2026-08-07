import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(800);
const m = await page.evaluate(() => {
  const brief = document.querySelector(".hw-worksheet__topic-brief--slide");
  const card = document.querySelector(".hw-listen-card");
  const form = document.querySelector(".hw-worksheet--slide-mode");
  const br = brief?.getBoundingClientRect();
  const cr = card?.getBoundingClientRect();
  const fs = form ? getComputedStyle(form) : null;
  return {
    formDisplay: fs?.display,
    stackedAbove: !!(br && cr && br.bottom <= cr.top + 8),
    beside: !!(br && cr && br.right <= cr.left + 12 && br.top < cr.bottom),
    briefTop: br?.top,
    cardTop: cr?.top,
  };
});
console.log(JSON.stringify(m, null, 2));
await browser.close();
