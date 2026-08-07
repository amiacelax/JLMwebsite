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

await page.addStyleTag({
  content: `
    @media (min-width: 1400px) {
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-v2-worksheet-mount {
        zoom: 1 !important;
        --hw-focus-zoom: 1.875;
        width: 48rem !important;
        max-width: 48rem !important;
        transform: scale(var(--hw-focus-zoom)) !important;
        transform-origin: top center !important;
        margin-inline: auto !important;
      }
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount .hw-toolbar-bar,
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount .hw-toolbar-bar {
        zoom: 1 !important;
        transform: scale(calc(1 / var(--hw-focus-zoom, 1.875))) !important;
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

const m = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const form = document.querySelector("form.hw-worksheet");
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(
      ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
    );
  const tb = document.querySelector(".hw-toolbar-bar");
  const mr = mount.getBoundingClientRect();
  const fr = form.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  const tr = tb.getBoundingClientRect();
  return {
    vw: innerWidth,
    mount: {
      left: Math.round(mr.left),
      right: Math.round(mr.right),
      w: Math.round(mr.width),
      styleW: getComputedStyle(mount).width,
      zoom: getComputedStyle(mount).zoom,
      transform: getComputedStyle(mount).transform,
    },
    form: { left: Math.round(fr.left), w: Math.round(fr.width) },
    card: {
      left: Math.round(cr.left),
      right: Math.round(cr.right),
      w: Math.round(cr.width),
      styleW: getComputedStyle(card).width,
    },
    tb: {
      left: Math.round(tr.left),
      w: Math.round(tr.width),
      bottom: Math.round(tr.bottom),
      zoom: getComputedStyle(tb).zoom,
      transform: getComputedStyle(tb).transform,
    },
    overflows: mr.right > innerWidth + 2 || mr.left < -2,
  };
});

await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/focus-transform-scale.png",
  fullPage: false,
});
console.log(JSON.stringify(m, null, 2));
await browser.close();
