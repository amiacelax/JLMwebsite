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
  const zone = document.getElementById("hw-v5-homework-zone");
  const card = document.querySelector(".hw-listen-card");
  const blank = card?.querySelector(".hw-blank, input, textarea");
  const tb = document.querySelector(".hw-toolbar-bar");
  const scale =
    parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;

  zone.scrollTop = zone.scrollHeight;

  function box(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      overflow: cs.overflow,
      overflowY: cs.overflowY,
      inView: r.top >= -4 && r.bottom <= innerHeight + 4,
      bottomInView: r.bottom <= innerHeight + 4 && r.bottom >= 0,
    };
  }

  // Walk from blank up; find overflow clippers whose client box is shorter than content
  const clippers = [];
  let el = blank;
  while (el && el !== zone) {
    const cs = getComputedStyle(el);
    if (cs.overflowY === "hidden" || cs.overflow === "hidden") {
      const r = el.getBoundingClientRect();
      clippers.push({
        id: el.id || el.className?.toString?.().slice(0, 50),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        overflow: cs.overflow,
      });
    }
    el = el.parentElement;
  }

  return {
    scale,
    zoneScrollTop: zone.scrollTop,
    zoneScrollH: zone.scrollHeight,
    zoneClientH: zone.clientHeight,
    card: box(card),
    blank: box(blank),
    tb: box(tb),
    mountVisualBottom: Math.round(
      mount.getBoundingClientRect().top + mount.offsetHeight * scale
    ),
    clippers,
  };
});

await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/focus-bottom-final.png",
  fullPage: false,
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
