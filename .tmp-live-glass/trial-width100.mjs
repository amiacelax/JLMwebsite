import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.waitForTimeout(400);

async function measure(tag) {
  return page.evaluate((tag) => {
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    const form = document.querySelector("form.hw-worksheet");
    const card =
      document.querySelector(".hw-listen-card") ||
      document.querySelector(
        ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
      );
    const tb = document.querySelector(".hw-toolbar-bar");
    const glass = document.querySelector(".hw-mg-widget");
    const cloud = document.querySelector(".hw-hc-launcher");
    const mr = mount.getBoundingClientRect();
    const fr = form.getBoundingClientRect();
    const cr = card?.getBoundingClientRect();
    const tr = tb?.getBoundingClientRect();
    return {
      tag,
      focus: document.body.classList.contains("hw-hw-focus-mode"),
      mountStyleW: getComputedStyle(mount).width,
      mountZoom: getComputedStyle(mount).zoom,
      mountRectW: Math.round(mr.width),
      formRectW: Math.round(fr.width),
      cardRectW: cr ? Math.round(cr.width) : null,
      cardStyleW: card ? getComputedStyle(card).width : null,
      tbRect: tr
        ? { w: Math.round(tr.width), bottom: Math.round(tr.bottom), zoom: getComputedStyle(tb).zoom }
        : null,
      glass: glass
        ? {
            w: Math.round(glass.getBoundingClientRect().width),
            display: getComputedStyle(glass).display,
          }
        : null,
      cloud: cloud
        ? {
            w: Math.round(cloud.getBoundingClientRect().width),
            display: getComputedStyle(cloud).display,
          }
        : null,
    };
  }, tag);
}

const before = await measure("before");
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(500);
const current = await measure("current-focus");

await page.addStyleTag({
  content: `
    @media (min-width: 1400px) {
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-worksheet-mount {
        width: 100% !important;
        max-width: none !important;
        box-sizing: border-box !important;
      }
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode .hw-worksheet,
      html.hw-ws-toolbar body.hw-hw-focus-mode .hw-worksheet {
        width: 100% !important;
        max-width: none !important;
      }
    }
  `,
});
await page.waitForTimeout(200);
const width100 = await measure("width-100");

await page.addStyleTag({
  content: `
    @media (min-width: 1400px) {
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-worksheet-mount {
        width: calc(100% / 1.875) !important;
      }
    }
  `,
});
await page.waitForTimeout(200);
const widthDiv = await measure("width-div-zoom");

console.log(JSON.stringify({ before, current, width100, widthDiv }, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/focus-width100.png",
  fullPage: false,
});
await browser.close();
