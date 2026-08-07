import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=" +
    Date.now(),
  { waitUntil: "networkidle", timeout: 90000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  const zone = document.getElementById("hw-v5-homework-zone");
  zone.scrollTop = 0;

  const layers = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0)
      continue;
    if (cs.pointerEvents === "none") continue;
    const pos = cs.position;
    if (pos !== "fixed" && pos !== "absolute" && pos !== "sticky") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    layers.push({
      tag:
        el.tagName +
        (el.id ? "#" + el.id : "") +
        "." +
        String(el.className).slice(0, 55),
      pos,
      zi: cs.zIndex,
      pe: cs.pointerEvents,
      t: Math.round(r.top),
      l: Math.round(r.left),
      w: Math.round(r.width),
      h: Math.round(r.height),
      coversFull: r.width > innerWidth * 0.8 && r.height > innerHeight * 0.4,
    });
  }
  layers.sort((a, b) => (parseInt(b.zi) || 0) - (parseInt(a.zi) || 0));

  function checkPseudo(el, name) {
    const result = { name };
    for (const p of ["::before", "::after"]) {
      const ps = getComputedStyle(el, p);
      if (ps.content === "none" || ps.content === "normal") {
        result[p] = "none";
        continue;
      }
      result[p] = {
        content: ps.content.slice(0, 40),
        pe: ps.pointerEvents,
        pos: ps.position,
        zi: ps.zIndex,
        w: ps.width,
        h: ps.height,
        display: ps.display,
      };
    }
    return result;
  }

  const form = document.querySelector("form.hw-worksheet");
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const card = document.getElementById("hw-v5-worksheet-card");
  const sticky = document.querySelector(".hw-worksheet__slide-sticky-head");
  const play = document.querySelector(".hw-audio-chrome__play");

  const peChain = [];
  let n = play;
  while (n) {
    const cs = getComputedStyle(n);
    peChain.push({
      el:
        n.tagName +
        (n.id ? "#" + n.id : "") +
        "." +
        String(n.className).slice(0, 45),
      pe: cs.pointerEvents,
      overflow: cs.overflow,
      transform: cs.transform !== "none",
      zi: cs.zIndex,
      pos: cs.position,
    });
    n = n.parentElement;
  }

  const pr = play.getBoundingClientRect();
  const top = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);

  // Compare layout box vs visual: unscaled offset within mount
  const mr = mount.getBoundingClientRect();
  const scale =
    parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;
  const layoutTop = mount.offsetTop;
  const playOffset = play.offsetTop; // relative to offsetParent — may not be mount

  // Walk offset parents for play layout position in mount local coords
  let yLocal = 0;
  let el = play;
  while (el && el !== mount) {
    yLocal += el.offsetTop;
    el = el.offsetParent;
    if (!el || el === document.body) break;
  }
  const unscaledScreenY = mr.top / scale + yLocal; // wrong if origin top center
  // Correct: transform-origin top center means visualY = mountTop + localY * scale
  const predictedVisualY = mr.top + (play.getBoundingClientRect().top - mr.top);
  // layout Y without transform (approximate using offsetHeight ratios)
  const mountLayoutTop = zone.getBoundingClientRect().top + 16; // rough
  const layoutPlayY =
    mount.getBoundingClientRect().top +
    (play.getBoundingClientRect().top - mount.getBoundingClientRect().top) / scale;

  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    fullscreen: !!document.fullscreenElement,
    scale,
    layers: layers.slice(0, 30),
    fullCoverLayers: layers.filter((l) => l.coversFull),
    peChain,
    playRect: {
      t: Math.round(pr.top),
      l: Math.round(pr.left),
      w: Math.round(pr.width),
      h: Math.round(pr.height),
    },
    playTop: top && top.tagName + "." + String(top.className).slice(0, 40),
    playHitOk: !!(top && (top === play || play.contains(top))),
    layoutPlayYApprox: Math.round(layoutPlayY),
    predictedVisualY: Math.round(predictedVisualY),
    mountRect: {
      t: Math.round(mr.top),
      h: Math.round(mr.height),
      layoutH: mount.offsetHeight,
    },
    formOverflow: getComputedStyle(form).overflow,
    formClientH: form.clientHeight,
    formScrollH: form.scrollHeight,
    stickyPe: sticky ? getComputedStyle(sticky).pointerEvents : null,
    stickyZi: sticky ? getComputedStyle(sticky).zIndex : null,
    stickyRect: sticky
      ? {
          t: Math.round(sticky.getBoundingClientRect().top),
          h: Math.round(sticky.getBoundingClientRect().height),
        }
      : null,
  };
});

console.log(JSON.stringify(out, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/focus-click-debug.png",
  fullPage: false,
});
await browser.close();
