import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

async function run(viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(
    "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
    { waitUntil: "networkidle", timeout: 60000 }
  );
  await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => {
    const card =
      document.querySelector(".hw-listen-card") ||
      document.querySelector(
        ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
      );
    const cr = card.getBoundingClientRect();
    return {
      cardW: Math.round(cr.width),
      cardStyle: getComputedStyle(card).width,
    };
  });

  await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const mount = document.getElementById("hw-v2-worksheet-mount");
    const card =
      document.querySelector(".hw-listen-card") ||
      document.querySelector(
        ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
      );
    const tb = document.querySelector(".hw-toolbar-bar");
    const kumo = document.querySelector(".section-kumo");
    const mr = mount.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const tr = tb.getBoundingClientRect();
    const cs = getComputedStyle(mount);
    return {
      focus: document.body.classList.contains("hw-hw-focus-mode"),
      zoom: cs.zoom,
      transform: cs.transform,
      focusZoom: cs.getPropertyValue("--hw-focus-zoom").trim(),
      mountStyleW: cs.width,
      mountW: Math.round(mr.width),
      mountL: Math.round(mr.left),
      mountR: Math.round(mr.right),
      cardW: Math.round(cr.width),
      cardStyle: getComputedStyle(card).width,
      cardL: Math.round(cr.left),
      cardR: Math.round(cr.right),
      tbW: Math.round(tr.width),
      kumoVis: kumo ? getComputedStyle(kumo).visibility : null,
      scaledUp: cr.width > 448 * 1.2,
      notThinner: cr.width >= 448,
      inView: cr.left >= -4 && cr.right <= innerWidth + 4,
    };
  });

  await page.screenshot({
    path: `C:/JLM Website/.tmp-live-glass/focus-verify-${viewport.width}.png`,
    fullPage: false,
  });
  await page.close();
  return { viewport: viewport.width, before, after };
}

const results = [
  await run({ width: 1440, height: 900 }),
  await run({ width: 1100, height: 900 }),
];
console.log(JSON.stringify(results, null, 2));
await browser.close();
