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

const out = await page.evaluate(() => {
  function desc(el) {
    if (!el || el === document.documentElement) return "html";
    if (el === document.body) return "body";
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 4).join(".")
      : "";
    const pe = getComputedStyle(el).pointerEvents;
    const zi = getComputedStyle(el).zIndex;
    return `${el.tagName.toLowerCase()}${id}${cls}[pe=${pe},z=${zi}]`;
  }

  function stackAt(x, y) {
    const list = document.elementsFromPoint(x, y).slice(0, 8).map(desc);
    return { x, y, top: list[0], stack: list };
  }

  const tip = document.querySelector(".hw-tip-btn, [data-hw-tip], .hw-worksheet__tip, button.hw-tip");
  const blank = document.querySelector(".hw-blank, input.hw-blank, .hw-worksheet .hw-blank");
  const play = document.querySelector(
    ".hw-audio-chrome__play, .hw-audio-player__play, button[data-hw-audio-play], .hw-listen-card button"
  );
  const tbBtn = document.querySelector('.hw-toolbar-bar__btn[data-tb-tool="glass"], .hw-toolbar-bar__btn');
  const exitBtn = document.querySelector(".hw-focus-bar__exit");
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const zone =
    document.getElementById("hw-v5-homework-zone") ||
    document.getElementById("hw-hub-v4-homework");
  const form = document.querySelector("form.hw-worksheet");

  const targets = { tip, blank, play, tbBtn, exitBtn, mount, form };
  const rects = {};
  const hits = {};
  for (const [k, el] of Object.entries(targets)) {
    if (!el) {
      rects[k] = null;
      hits[k] = "MISSING";
      continue;
    }
    const r = el.getBoundingClientRect();
    rects[k] = {
      t: Math.round(r.top),
      l: Math.round(r.left),
      w: Math.round(r.width),
      h: Math.round(r.height),
      pe: getComputedStyle(el).pointerEvents,
    };
    const cx = r.left + r.width / 2;
    const cy = r.top + Math.min(r.height / 2, 20);
    hits[k] = stackAt(cx, cy);
  }

  // Also sample center of viewport and center of scaled visual
  const mr = mount.getBoundingClientRect();
  const scale =
    parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;
  hits.viewportCenter = stackAt(innerWidth / 2, innerHeight / 2);
  hits.scaledMid = stackAt(mr.left + mr.width / 2, mr.top + (mount.offsetHeight * scale) / 2);

  // Ancestors pointer-events
  const chain = [];
  let n = form;
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    chain.push({
      el: desc(n),
      pe: cs.pointerEvents,
      overflow: `${cs.overflowX}/${cs.overflowY}`,
      transform: cs.transform,
      zi: cs.zIndex,
      pos: cs.position,
    });
    n = n.parentElement;
  }

  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    scale,
    zonePe: zone ? getComputedStyle(zone).pointerEvents : null,
    zoneOverflow: zone ? `${getComputedStyle(zone).overflowX}/${getComputedStyle(zone).overflowY}` : null,
    rects,
    hits,
    chain,
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
