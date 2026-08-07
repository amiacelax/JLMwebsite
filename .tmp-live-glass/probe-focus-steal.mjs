import { chromium } from "playwright";

const url =
  process.argv[2] ||
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=" +
    Date.now();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.waitForTimeout(500);

// Enter focus via toolbar
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1200);

const out = await page.evaluate(() => {
  function desc(el) {
    if (!el) return null;
    if (el === document.documentElement) return "html";
    if (el === document.body) return "body";
    const id = el.id ? `#${el.id}` : "";
    const cls =
      el.className && typeof el.className === "string"
        ? "." + el.className.trim().split(/\s+/).slice(0, 5).join(".")
        : "";
    const cs = getComputedStyle(el);
    return `${el.tagName.toLowerCase()}${id}${cls}[pe=${cs.pointerEvents},z=${cs.zIndex},pos=${cs.position},vis=${cs.visibility},op=${cs.opacity}]`;
  }

  function stackAt(x, y) {
    return {
      x: Math.round(x),
      y: Math.round(y),
      top: desc(document.elementFromPoint(x, y)),
      stack: document.elementsFromPoint(x, y).slice(0, 12).map(desc),
    };
  }

  const tip =
    document.querySelector(".hw-recording-tip__trigger") ||
    document.querySelector(".hw-tip-btn") ||
    document.querySelector("[data-hw-tip]");
  const blank = document.querySelector(".hw-blank");
  const play = document.querySelector(".hw-audio-chrome__play");
  const tbBtn = document.querySelector('.hw-toolbar-bar__btn[data-tb-tool="glass"]');
  const exitBtn = document.querySelector(".hw-focus-bar__exit");
  const slideBtn = document.querySelector(".hw-worksheet__slide-btn");
  const mount =
    document.getElementById("hw-v2-worksheet-mount") ||
    document.getElementById("hw-worksheet-mount");
  const zone =
    document.getElementById("hw-v5-homework-zone") ||
    document.getElementById("hw-hub-v4-homework");
  const card = document.getElementById("hw-v5-worksheet-card");
  const form = document.querySelector("form.hw-worksheet");
  const focusBar = document.querySelector(".hw-focus-bar");
  const subpage = document.querySelector(".subpage");
  const main = document.querySelector(".subpage__main");
  const section = document.querySelector(".subpage__main .section");
  const kumo = document.querySelector(".section-kumo");

  const targets = { tip, blank, play, tbBtn, exitBtn, slideBtn };
  const hits = {};
  const rects = {};
  for (const [k, el] of Object.entries(targets)) {
    if (!el) {
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
    // Skip if offscreen
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) {
      hits[k] = { offscreen: true, rect: rects[k] };
      continue;
    }
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    hits[k] = stackAt(cx, cy);
    hits[k].targetIsTop =
      document.elementFromPoint(cx, cy) === el ||
      el.contains(document.elementFromPoint(cx, cy));
    hits[k].expected = desc(el);
  }

  const mr = mount?.getBoundingClientRect();
  const scale =
    parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;
  const layoutH = mount?.offsetHeight || 0;

  // Sample grid across visual mount
  const grid = [];
  if (mr) {
    for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (const fx of [0.25, 0.5, 0.75]) {
        const x = mr.left + mr.width * fx;
        const y = mr.top + mr.height * fy;
        if (y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth) {
          grid.push(stackAt(x, y));
        }
      }
    }
  }

  function layerInfo(el, name) {
    if (!el) return { name, missing: true };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      name,
      desc: desc(el),
      display: cs.display,
      overflow: `${cs.overflowX}/${cs.overflowY}`,
      pe: cs.pointerEvents,
      zi: cs.zIndex,
      pos: cs.position,
      transform: cs.transform,
      w: Math.round(r.width),
      h: Math.round(r.height),
      t: Math.round(r.top),
      sh: el.scrollHeight,
      ch: el.clientHeight,
    };
  }

  // Check for full-viewport overlays
  const overlays = [];
  document.querySelectorAll("*").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "absolute") return;
    if (cs.pointerEvents === "none") return;
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.85 || r.height < innerHeight * 0.5) return;
    if (el === zone || el === document.body || el === document.documentElement) return;
    overlays.push({
      desc: desc(el),
      w: Math.round(r.width),
      h: Math.round(r.height),
      t: Math.round(r.top),
      pe: cs.pointerEvents,
      zi: cs.zIndex,
      pos: cs.position,
      op: cs.opacity,
    });
  });

  return {
    url: location.href,
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    htmlClasses: document.documentElement.className,
    bodyClasses: document.body.className,
    scale,
    mountMB: mount ? getComputedStyle(mount).marginBottom : null,
    mountTransform: mount ? getComputedStyle(mount).transform : null,
    mountLayoutH: layoutH,
    mountVisualH: mr ? Math.round(mr.height) : null,
    layers: [
      layerInfo(zone, "zone"),
      layerInfo(card, "card"),
      layerInfo(mount, "mount"),
      layerInfo(form, "form"),
      layerInfo(focusBar, "focusBar"),
      layerInfo(subpage, "subpage"),
      layerInfo(main, "main"),
      layerInfo(section, "section"),
      layerInfo(kumo, "kumo"),
    ],
    overlays,
    rects,
    hits,
    gridSample: grid.slice(0, 9),
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
