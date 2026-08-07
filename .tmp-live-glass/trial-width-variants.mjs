import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(400);

async function measure(tag) {
  return page.evaluate((tag) => {
    const mount = document.getElementById("hw-v2-worksheet-mount");
    const form = document.querySelector("form.hw-worksheet");
    const card =
      document.querySelector(".hw-listen-card") ||
      document.querySelector(
        ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
      );
    const cs = getComputedStyle(mount);
    return {
      tag,
      mountStyleW: cs.width,
      mountZoom: cs.zoom,
      focusZoom: cs.getPropertyValue("--hw-focus-zoom").trim(),
      mountRectW: Math.round(mount.getBoundingClientRect().width),
      formRectW: Math.round(form.getBoundingClientRect().width),
      cardRectW: Math.round(card.getBoundingClientRect().width),
      cardStyleW: getComputedStyle(card).width,
    };
  }, tag);
}

console.log(JSON.stringify(await measure("baseline-current-css"), null, 2));

const trials = [
  ["48rem", "width: 48rem !important; max-width: none !important;"],
  ["768px", "width: 768px !important;"],
  ["min-48-vw", "width: min(48rem, 100vw) !important;"],
  ["min-48-calc", "width: min(48rem, calc(100vw / 1.875)) !important;"],
  ["min-48-var", "width: min(48rem, calc(100vw / var(--hw-focus-zoom))) !important;"],
  ["transform", "zoom: 1 !important; width: 100% !important; transform: scale(1.875) !important; transform-origin: top center !important;"],
];

for (const [name, css] of trials) {
  await page.addStyleTag({
    content: `
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount {
        ${css}
      }
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode .hw-worksheet {
        width: 100% !important; max-width: none !important;
      }
    `,
  });
  await page.waitForTimeout(100);
  console.log(JSON.stringify(await measure(name), null, 2));
}

await browser.close();
