import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

async function trial(name, css, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  await page.goto(
    "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
    { waitUntil: "networkidle", timeout: 60000 }
  );
  await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
  await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
  await page.waitForTimeout(400);
  if (css) {
    await page.addStyleTag({ content: css });
    await page.waitForTimeout(150);
  }
  const m = await page.evaluate((name) => {
    const mount = document.getElementById("hw-v2-worksheet-mount");
    const card =
      document.querySelector(".hw-listen-card") ||
      document.querySelector(
        ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
      );
    const tb = document.querySelector(".hw-toolbar-bar");
    const mr = mount.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const tr = tb.getBoundingClientRect();
    return {
      name,
      vw: innerWidth,
      mount: {
        L: Math.round(mr.left),
        R: Math.round(mr.right),
        W: Math.round(mr.width),
        styleW: getComputedStyle(mount).width,
        zoom: getComputedStyle(mount).zoom,
      },
      card: {
        L: Math.round(cr.left),
        R: Math.round(cr.right),
        W: Math.round(cr.width),
        styleW: getComputedStyle(card).width,
      },
      tb: { W: Math.round(tr.width), bottom: Math.round(tr.bottom) },
      cardOk: cr.width >= 830 && cr.left >= -2 && cr.right <= innerWidth + 2,
      mountOk: mr.left >= -4 && mr.right <= innerWidth + 4,
    };
  }, name);
  await page.close();
  return m;
}

const breakout = `
@media (min-width: 1400px) {
  html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
  body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-v2-worksheet-mount {
    zoom: 1.875 !important;
    width: 48rem !important;
    max-width: 48rem !important;
    margin-left: calc(50% - 50vw) !important;
    margin-right: 0 !important;
  }
  html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode .hw-worksheet {
    width: 100% !important; max-width: none !important;
  }
}`;

const breakoutCenter = `
@media (min-width: 1400px) {
  html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
  body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-v2-worksheet-mount {
    zoom: 1.875 !important;
    width: 48rem !important;
    max-width: 48rem !important;
    margin-left: calc(50% - 50vw + (100vw - 48rem * 1.875) / 2) !important;
  }
  html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode .hw-worksheet {
    width: 100% !important; max-width: none !important;
  }
}`;

const results = [];
results.push(await trial("current", null));
results.push(await trial("breakout-left", breakout));
results.push(await trial("breakout-center", breakoutCenter));
results.push(await trial("breakout-center-1600", breakoutCenter, { width: 1600, height: 900 }));
results.push(await trial("breakout-center-1100", `
@media (min-width: 900px) {
  html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
  body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-v2-worksheet-mount {
    zoom: 1.6875 !important;
    width: 48rem !important;
    max-width: 48rem !important;
    margin-left: calc(50% - 50vw + (100vw - 48rem * 1.6875) / 2) !important;
  }
  html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode .hw-worksheet {
    width: 100% !important; max-width: none !important;
  }
}`, { width: 1100, height: 900 }));

console.log(JSON.stringify(results, null, 2));
await browser.close();
