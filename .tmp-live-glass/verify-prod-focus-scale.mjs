import { chromium } from "playwright";

const url =
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.waitForTimeout(500);

const before = await page.evaluate(() => {
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(
      ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
    );
  return { w: Math.round(card.getBoundingClientRect().width) };
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(700);

const after = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(
      ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
    );
  const cs = getComputedStyle(mount);
  const cr = card.getBoundingClientRect();
  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    transform: cs.transform,
    focusZoom: cs.getPropertyValue("--hw-focus-zoom").trim(),
    cardW: Math.round(cr.width),
    cardStyle: getComputedStyle(card).width,
    inView: cr.left >= -4 && cr.right <= innerWidth + 4,
  };
});

console.log(JSON.stringify({ before, after }, null, 2));
await browser.close();
