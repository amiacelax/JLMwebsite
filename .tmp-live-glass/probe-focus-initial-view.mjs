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
  const zone = document.getElementById("hw-v5-homework-zone");
  zone.scrollTop = 0;
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const form = document.querySelector("form.hw-worksheet");
  const focusBar = document.querySelector(".hw-focus-bar");
  const sticky = document.querySelector(".hw-worksheet__slide-sticky-head");
  const play = document.querySelector(".hw-audio-chrome__play");
  const blank = document.querySelector(".hw-blank");
  const glass = document.querySelector('[data-tb-tool="glass"]');
  const tip = [...document.querySelectorAll("button")].find((b) =>
    /tip/i.test(b.textContent || b.getAttribute("aria-label") || "")
  );

  function info(el, name) {
    if (!el) return { name, missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const inView =
      r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    return {
      name,
      rect: {
        t: Math.round(r.top),
        l: Math.round(r.left),
        w: Math.round(r.width),
        h: Math.round(r.height),
        b: Math.round(r.bottom),
      },
      inView,
      pe: cs.pointerEvents,
      pos: cs.position,
      zi: cs.zIndex,
      hit: top
        ? top === el || el.contains(top)
          ? "SELF"
          : top.tagName + "." + String(top.className).slice(0, 50)
        : "NULL",
      covered: !!(
        top &&
        top !== el &&
        !el.contains(top) &&
        !top.contains?.(el)
      ),
    };
  }

  const grid = [];
  for (let y = 40; y < 880; y += 80) {
    for (const x of [200, 720, 1200]) {
      const el = document.elementFromPoint(x, y);
      grid.push({
        x,
        y,
        el: el
          ? el.tagName +
            "." +
            String(el.className || "")
              .slice(0, 45)
              .replace(/\s+/g, ".")
          : "NULL",
      });
    }
  }

  const fb = focusBar?.getBoundingClientRect();
  const st = sticky?.getBoundingClientRect();

  return {
    zoneScroll: zone.scrollTop,
    zoneClient: {
      w: zone.clientWidth,
      h: zone.clientHeight,
      sh: zone.scrollHeight,
    },
    focusBar: fb
      ? {
          t: Math.round(fb.top),
          h: Math.round(fb.height),
          w: Math.round(fb.width),
          pe: getComputedStyle(focusBar).pointerEvents,
        }
      : null,
    sticky: st
      ? {
          t: Math.round(st.top),
          h: Math.round(st.height),
          w: Math.round(st.width),
          pos: getComputedStyle(sticky).position,
          zi: getComputedStyle(sticky).zIndex,
          pe: getComputedStyle(sticky).pointerEvents,
        }
      : null,
    formOverflow: getComputedStyle(form).overflow,
    mountTransform: getComputedStyle(mount).transform,
    targets: [
      info(play, "play"),
      info(blank, "blank"),
      info(glass, "glass"),
      info(tip, "tip"),
      info(focusBar?.querySelector(".hw-focus-bar__exit"), "exit"),
    ],
    grid,
  };
});

console.log(JSON.stringify(out, null, 2));
await page.screenshot({
  path: ".tmp-live-glass/focus-click-initial.png",
  fullPage: false,
});
await browser.close();
