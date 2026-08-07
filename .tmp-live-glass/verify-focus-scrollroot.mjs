import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.waitForTimeout(400);
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const html = document.documentElement;
  const body = document.body;
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(
      ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
    );
  const tb = document.querySelector(".hw-toolbar-bar");

  const htmlCs = getComputedStyle(html);
  const bodyCs = getComputedStyle(body);

  const info = {
    innerHeight,
    html: {
      overflow: htmlCs.overflow,
      overflowY: htmlCs.overflowY,
      height: htmlCs.height,
      scrollH: html.scrollHeight,
      clientH: html.clientHeight,
      scrollTop: html.scrollTop,
    },
    body: {
      overflow: bodyCs.overflow,
      overflowY: bodyCs.overflowY,
      height: bodyCs.height,
      scrollH: body.scrollHeight,
      clientH: body.clientHeight,
      scrollTop: body.scrollTop,
    },
  };

  // Try scrolling both
  html.scrollTop = 99999;
  body.scrollTop = 99999;
  window.scrollTo(0, 99999);

  const after = {
    htmlScrollTop: html.scrollTop,
    bodyScrollTop: body.scrollTop,
    pageYOffset: window.pageYOffset,
    cardBottom: Math.round(card.getBoundingClientRect().bottom),
    tbBottom: Math.round(tb.getBoundingClientRect().bottom),
    mountBottom: Math.round(mount.getBoundingClientRect().bottom),
    visualBottom: Math.round(
      mount.getBoundingClientRect().top +
        mount.offsetHeight *
          (parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) ||
            1)
    ),
  };

  // Find which ancestors have height constraints / overflow clipping
  const chain = [];
  let el = mount;
  while (el) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    chain.push({
      id: el.id || el.className?.toString?.().slice(0, 40) || el.tagName,
      h: cs.height,
      maxH: cs.maxHeight,
      overflowY: cs.overflowY,
      position: cs.position,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
    });
    el = el.parentElement;
  }

  return { info, after, chain };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
