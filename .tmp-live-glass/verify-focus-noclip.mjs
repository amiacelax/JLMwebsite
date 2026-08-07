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
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(
      ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
    );
  const tb = document.querySelector(".hw-toolbar-bar");
  const zone =
    document.getElementById("hw-v5-homework-zone") ||
    document.getElementById("hw-hub-v4-homework");
  const section = document.querySelector(".subpage__main .section");
  const cardEl = document.getElementById("hw-v5-worksheet-card");

  const chain = [];
  let el = mount;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    chain.push({
      tag: el.id || el.className?.toString?.().slice(0, 48) || el.tagName,
      overflow: cs.overflow,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
    });
    el = el.parentElement;
  }

  const mr = mount.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  const tr = tb?.getBoundingClientRect();
  const cs = getComputedStyle(mount);
  const scale = parseFloat(cs.getPropertyValue("--hw-focus-zoom")) || 1;
  const extra = cs.getPropertyValue("--hw-focus-scale-extra").trim();
  const layoutH = mount.offsetHeight;
  const visualBottom = mr.top + layoutH * scale;
  const marginBottom = parseFloat(cs.marginBottom) || 0;

  // Scroll so scaled bottom is in view, then re-check
  const targetY = Math.max(0, visualBottom - innerHeight + 24);
  scrollTo(0, targetY);

  const cr2 = card.getBoundingClientRect();
  const tr2 = tb?.getBoundingClientRect();
  const mr2 = mount.getBoundingClientRect();
  const visualBottom2 = mr2.top + layoutH * scale;

  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    bodyOverflow: getComputedStyle(document.body).overflow + "/" + getComputedStyle(document.body).overflowY,
    sectionOverflow: section ? getComputedStyle(section).overflow : null,
    zoneOverflow: zone ? getComputedStyle(zone).overflow : null,
    cardOverflow: cardEl ? getComputedStyle(cardEl).overflow : null,
    mountOverflow: cs.overflow,
    transform: cs.transform,
    scale,
    extra,
    layoutH,
    marginBottom,
    visualBottom: Math.round(visualBottom),
    visualBottomAfterScroll: Math.round(visualBottom2),
    cardBottom: Math.round(cr.bottom),
    cardBottomAfterScroll: Math.round(cr2.bottom),
    tbBottom: tr ? Math.round(tr.bottom) : null,
    tbBottomAfterScroll: tr2 ? Math.round(tr2.bottom) : null,
    cardFullyInView:
      cr2.top >= -2 && cr2.bottom <= innerHeight + 2,
    tbFullyInView: tr2
      ? tr2.top >= -2 && tr2.bottom <= innerHeight + 2
      : null,
    scaledPaintFitsLayout:
      marginBottom + 2 >= (scale - 1) * layoutH,
    clippers: chain.filter(
      (c) =>
        c.overflowY === "hidden" ||
        c.overflow === "hidden" ||
        c.overflowX === "hidden"
    ),
  };
});

await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/focus-noclip-verify.png",
  fullPage: false,
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
