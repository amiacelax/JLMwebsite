import { chromium } from "playwright";

const url =
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector(
  "#hw-v2-worksheet-mount, #hw-worksheet-mount, form.hw-worksheet",
  { timeout: 30000 }
);
await page.waitForTimeout(800);

async function sample() {
  return page.evaluate(() => {
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    const z = mount ? getComputedStyle(mount).zoom : null;
    return {
      htmlClasses: document.documentElement.className,
      bodyFocus: document.body.classList.contains("hw-hw-focus-mode"),
      mountZoom: z,
      mountZoomNum: z == null || z === "" ? null : Number.parseFloat(z),
    };
  });
}

const before = await sample();

const focusTb = page.locator('[data-tb-tool="focus"]');
const focusWs = page.locator("[data-hw-focus]");
if ((await focusTb.count()) > 0) {
  await focusTb.first().click({ force: true });
} else if ((await focusWs.count()) > 0) {
  await focusWs.first().click({ force: true });
} else {
  await page.evaluate(() =>
    document.body.classList.add("hw-hw-focus-mode")
  );
}
await page.waitForTimeout(600);
const after = await sample();

console.log(JSON.stringify({ before, after }, null, 2));
await browser.close();
