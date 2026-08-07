import { chromium } from "playwright";
import fs from "fs";

const url =
  process.argv[2] ||
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=" +
    Date.now();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1200);

const meta = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const zone = document.getElementById("hw-v5-homework-zone");
  const bar = document.querySelector(".hw-toolbar-bar");
  const play = document.querySelector(".hw-audio-chrome__play");
  const glass = document.querySelector('[data-tb-tool="glass"]');
  const card = document.getElementById("hw-v5-worksheet-card");

  function box(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      t: Math.round(r.top),
      l: Math.round(r.left),
      r: Math.round(r.right),
      b: Math.round(r.bottom),
      w: Math.round(r.width),
      h: Math.round(r.height),
      offsetH: el.offsetHeight,
      offsetW: el.offsetWidth,
      zoom: cs.zoom,
      transform: cs.transform,
      pe: cs.pointerEvents,
      zi: cs.zIndex,
      pos: cs.position,
    };
  }

  // Grid sample across viewport
  const grid = [];
  for (let y = 40; y < 880; y += 40) {
    for (const x of [200, 400, 720, 1000]) {
      const t = document.elementFromPoint(x, y);
      const id = t?.id ? `#${t.id}` : "";
      const cls = t ? "." + String(t.className || "").slice(0, 28).replace(/\s+/g, ".") : "";
      grid.push({
        x,
        y,
        top: t ? `${t.tagName}${id}${cls}` : null,
      });
    }
  }

  // Does toolbar layout box cover play?
  const pb = play?.getBoundingClientRect();
  const bb = bar?.getBoundingClientRect();
  const playCoveredByBar =
    pb &&
    bb &&
    pb.left >= bb.left &&
    pb.right <= bb.right &&
    pb.top >= bb.top &&
    pb.bottom <= bb.bottom;

  return {
    url: location.href,
    mount: box(mount),
    zone: box(zone),
    zoneScroll: { top: zone?.scrollTop, sh: zone?.scrollHeight, ch: zone?.clientHeight },
    card: box(card),
    bar: box(bar),
    play: box(play),
    glass: box(glass),
    glassDisabled: glass?.disabled ?? null,
    mg: typeof window.HwMagnifyingGlass?.attachTo,
    flagsMg: !!window.HwFeatureFlags?.magnifyingGlass?.(),
    playCoveredByBar,
    // At play center, is bar in the stack?
    playStack: pb
      ? document
          .elementsFromPoint(pb.left + pb.width / 2, pb.top + pb.height / 2)
          .slice(0, 12)
          .map((e) => {
            const id = e.id ? `#${e.id}` : "";
            return `${e.tagName}${id}.${String(e.className || "").slice(0, 24)}`;
          })
      : null,
    grid: grid.filter((g) => g.top && /toolbar|zone|shell|mg-|hc-|overlay|focus-bar/i.test(g.top)),
    gridAllMid: grid.filter((g) => g.x === 720),
  };
});

fs.writeFileSync(
  ".tmp-live-glass/probe-nested-zoom-out.json",
  JSON.stringify(meta, null, 2)
);
console.log(JSON.stringify(meta, null, 2));
await browser.close();
