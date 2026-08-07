import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });

const before = await page.evaluate(() => {
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(
      ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
    );
  const cr = card.getBoundingClientRect();
  return { cardW: Math.round(cr.width), cardL: Math.round(cr.left) };
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(400);

await page.addStyleTag({
  content: `
    @media (min-width: 1400px) {
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-v2-worksheet-mount {
        --hw-focus-zoom: 1.875;
        zoom: 1 !important;
        width: 100% !important;
        max-width: 48rem !important;
        transform: scale(var(--hw-focus-zoom)) !important;
        transform-origin: top center !important;
        margin-inline: auto !important;
      }
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount .hw-toolbar-bar {
        zoom: 1 !important;
        transform: scale(calc(1 / 1.875)) !important;
        transform-origin: center center !important;
      }
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode .hw-worksheet {
        width: 100% !important;
        max-width: none !important;
      }
    }
  `,
});
await page.waitForTimeout(200);

const after = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(
      ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
    );
  const tb = document.querySelector(".hw-toolbar-bar");
  const glass = document.querySelector(".hw-mg-widget, .hw-magnifying-glass");
  const cloud = document.querySelector(".hw-hc-launcher");
  const mr = mount.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  const tr = tb.getBoundingClientRect();
  return {
    mount: { L: Math.round(mr.left), R: Math.round(mr.right), W: Math.round(mr.width), styleW: getComputedStyle(mount).width },
    card: { L: Math.round(cr.left), R: Math.round(cr.right), W: Math.round(cr.width), styleW: getComputedStyle(card).width },
    tb: { L: Math.round(tr.left), W: Math.round(tr.width), zoom: getComputedStyle(tb).zoom, transform: getComputedStyle(tb).transform },
    glass: glass ? { display: getComputedStyle(glass).display, w: Math.round(glass.getBoundingClientRect().width) } : null,
    cloud: cloud ? { display: getComputedStyle(cloud).display, w: Math.round(cloud.getBoundingClientRect().width) } : null,
    inView: cr.left >= 0 && cr.right <= innerWidth && mr.left >= -8 && mr.right <= innerWidth + 8,
  };
});

await page.screenshot({ path: "C:/JLM Website/.tmp-live-glass/focus-scale-100.png", fullPage: false });
console.log(JSON.stringify({ before, after }, null, 2));
await browser.close();
