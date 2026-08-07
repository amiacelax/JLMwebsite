import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function probe(url, label) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("form.hw-worksheet, .hw-toolbar-bar", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(800);
  const hasForm = await page.locator("form.hw-worksheet").count();
  if (!hasForm) {
    return { label, error: "no form", url };
  }
  await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
  await page.waitForTimeout(900);

  return await page.evaluate((label) => {
    const mount = document.getElementById("hw-v2-worksheet-mount") || document.getElementById("hw-worksheet-mount");
    const play = document.querySelector(".hw-audio-chrome__play");
    const tip = document.querySelector(".hw-recording-tip__trigger");
    const blank = document.querySelector(".hw-blank");
    const glass = document.querySelector('.hw-toolbar-bar__btn[data-tb-tool="glass"]');
    const zone = document.getElementById("hw-v5-homework-zone") || document.getElementById("hw-hub-v4-homework");

    function layoutBox(el) {
      return {
        offsetW: el.offsetWidth,
        offsetH: el.offsetHeight,
        rectW: Math.round(el.getBoundingClientRect().width),
        rectH: Math.round(el.getBoundingClientRect().height),
      };
    }

    function hitTest(el, name) {
      if (!el) return { name, missing: true };
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      const inEl = !!(top && (top === el || el.contains(top)));
      // Also test a point that might be "visual only" if scale broke hits:
      // use layout-centered point via offsetLeft chain approx
      return {
        name,
        inEl,
        top: top ? `${top.tagName}.${String(top.className || "").slice(0, 40)}` : null,
        pe: getComputedStyle(el).pointerEvents,
        boxes: layoutBox(el),
        xy: { x: Math.round(x), y: Math.round(y) },
      };
    }

    // Find elements that are large + pointer-events auto covering center
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const stack = document.elementsFromPoint(cx, cy).slice(0, 10).map((el) => {
      const cs = getComputedStyle(el);
      return `${el.tagName}#${el.id}.${String(el.className||"").slice(0,35)}[pe=${cs.pointerEvents},zi=${cs.zIndex},pos=${cs.position}]`;
    });

    return {
      label,
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      scale: mount ? getComputedStyle(mount).getPropertyValue("--hw-focus-zoom").trim() : null,
      mountTransform: mount ? getComputedStyle(mount).transform : null,
      mountBoxes: mount ? layoutBox(mount) : null,
      zoneOverflow: zone ? `${getComputedStyle(zone).overflowX}/${getComputedStyle(zone).overflowY}` : null,
      hits: [hitTest(play, "play"), hitTest(tip, "tip"), hitTest(blank, "blank"), hitTest(glass, "glass")],
      centerStack: stack,
    };
  }, label);
}

const local = await probe(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  "local-preview"
);

// Production preview if available
let prod = null;
try {
  prod = await probe(
    "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
    "prod-preview"
  );
} catch (e) {
  prod = { error: String(e) };
}

console.log(JSON.stringify({ local, prod }, null, 2));
await browser.close();
