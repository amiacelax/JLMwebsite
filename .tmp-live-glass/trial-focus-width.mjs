import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.waitForTimeout(400);

const focusTb = page.locator('[data-tb-tool="focus"]');
await focusTb.first().click({ force: true });
await page.waitForTimeout(500);

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
    const mr = mount.getBoundingClientRect();
    const fr = form.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    return {
      tag,
      mountStyleW: getComputedStyle(mount).width,
      mountZoom: getComputedStyle(mount).zoom,
      mountRectW: Math.round(mr.width),
      formRectW: Math.round(fr.width),
      formStyleW: getComputedStyle(form).width,
      cardRectW: Math.round(cr.width),
      cardStyleW: getComputedStyle(card).width,
      cardMax: getComputedStyle(card).maxWidth,
    };
  }, tag);
}

const baseline = await measure("current");

// Trial A: width calc(100%/zoom) + zoom
await page.addStyleTag({
  content: `
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount {
      width: calc(100% / 1.875) !important;
      max-width: none !important;
      zoom: 1.875 !important;
      margin-inline: auto !important;
    }
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode .hw-worksheet {
      width: 100% !important;
      max-width: none !important;
    }
  `,
});
await page.waitForTimeout(200);
const trialA = await measure("A-width/zoom");

// Trial B: transform scale with width compensation to grow
await page.addStyleTag({
  content: `
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount {
      zoom: 1 !important;
      width: 100% !important;
      transform: scale(1.875) !important;
      transform-origin: top center !important;
    }
  `,
});
await page.waitForTimeout(200);
const trialB = await measure("B-transform-scale");

// Trial C: lock worksheet/card layout rem widths so zoom multiplies them fully
await page.addStyleTag({
  content: `
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount {
      zoom: 1.875 !important;
      width: 48rem !important;
      max-width: none !important;
      transform: none !important;
      margin-inline: auto !important;
    }
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode .hw-worksheet {
      width: 100% !important;
      max-width: none !important;
    }
  `,
});
await page.waitForTimeout(200);
const trialC = await measure("C-lock-48rem");

// Trial D: widen mount so 28rem card fits pre-zoom then scales
await page.addStyleTag({
  content: `
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount {
      zoom: 1.875 !important;
      width: calc(28rem + 4rem) !important; /* card + padding room */
      max-width: none !important;
      transform: none !important;
      margin-inline: auto !important;
    }
  `,
});
await page.waitForTimeout(200);
const trialD = await measure("D-lock-card-room");

// Trial E: transform scale but width 100%/scale so visual = parent*scale? 
// width:100%; scale(1.875) overflows. Instead width:calc(100%/1.875) scale → visual=100%
await page.addStyleTag({
  content: `
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount {
      zoom: 1 !important;
      width: calc(100% / 1.875) !important;
      transform: scale(1.875) !important;
      transform-origin: top center !important;
      margin-inline: auto !important;
    }
    html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode .hw-worksheet {
      width: 100% !important;
      max-width: none !important;
    }
  `,
});
await page.waitForTimeout(200);
const trialE = await measure("E-transform-comp");

console.log(JSON.stringify({ baseline, trialA, trialB, trialC, trialD, trialE }, null, 2));
await browser.close();
