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
await page.waitForTimeout(900);

const result = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const zone =
    document.getElementById("hw-v5-homework-zone") ||
    document.getElementById("hw-hub-v4-homework");
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(
      ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
    );
  const tb = document.querySelector(".hw-toolbar-bar");
  const kumo = document.querySelector(".section-kumo");
  const scale =
    parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;
  const zcs = getComputedStyle(zone);

  const atTop = {
    zonePos: zcs.position,
    zoneOverflowY: zcs.overflowY,
    scrollH: zone.scrollHeight,
    clientH: zone.clientHeight,
    cardBottom: Math.round(card.getBoundingClientRect().bottom),
    tbBottom: Math.round(tb.getBoundingClientRect().bottom),
    visualBottom: Math.round(
      mount.getBoundingClientRect().top + mount.offsetHeight * scale
    ),
    marginBottom: getComputedStyle(mount).marginBottom,
    extra: getComputedStyle(mount).getPropertyValue("--hw-focus-scale-extra").trim(),
  };

  zone.scrollTop = zone.scrollHeight;

  const cr = card.getBoundingClientRect();
  const tr = tb.getBoundingClientRect();
  const visualBottom = mount.getBoundingClientRect().top + mount.offsetHeight * scale;

  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    atTop,
    afterScroll: {
      scrollTop: zone.scrollTop,
      cardTop: Math.round(cr.top),
      cardBottom: Math.round(cr.bottom),
      tbTop: Math.round(tr.top),
      tbBottom: Math.round(tr.bottom),
      visualBottom: Math.round(visualBottom),
      cardInView: cr.top >= -6 && cr.bottom <= innerHeight + 6,
      tbInView: tr.top >= -6 && tr.bottom <= innerHeight + 6,
      bottomReachable: visualBottom <= innerHeight + 10,
    },
    kumoVis: kumo ? getComputedStyle(kumo).visibility : null,
    widthOk: Math.round(card.getBoundingClientRect().width) >= 448,
    noBlueShell: (() => {
      const c = document.getElementById("hw-v5-worksheet-card");
      const cs = getComputedStyle(c);
      return cs.backgroundColor === "rgba(0, 0, 0, 0)" || cs.backgroundColor === "transparent";
    })(),
  };
});

await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/focus-noclip-scrolled.png",
  fullPage: false,
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
