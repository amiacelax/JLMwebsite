import { chromium } from "playwright";

const url =
  process.argv[2] ||
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.waitForTimeout(600);
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1000);

const out = await page.evaluate(() => {
  const zone =
    document.getElementById("hw-v5-homework-zone") ||
    document.getElementById("hw-hub-v4-homework");
  if (zone) zone.scrollTop = 0;

  const play = document.querySelector(".hw-audio-chrome__play");
  const blank = document.querySelector(".hw-blank");
  const glass = document.querySelector('[data-tb-tool="glass"]');
  const focus = document.querySelector('[data-tb-tool="focus"]');
  const tip = [...document.querySelectorAll("button")].find((b) =>
    /tip/i.test(b.textContent || b.getAttribute("aria-label") || "")
  );
  const shells = [...document.querySelectorAll(".hw-mg-shell, .hw-hc-shell")].map(
    (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        cls: el.className,
        pe: cs.pointerEvents,
        zi: cs.zIndex,
        pos: cs.position,
        size: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.top)}`,
        display: cs.display,
        visibility: cs.visibility,
      };
    }
  );

  function probe(el, name) {
    if (!el) return { name, missing: true };
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const stack = document.elementsFromPoint(x, y).slice(0, 6).map((n) => {
      const pe = getComputedStyle(n).pointerEvents;
      return `${n.tagName.toLowerCase()}.${String(n.className || "")
        .slice(0, 40)
        .replace(/\s+/g, ".")}[pe=${pe}]`;
    });
    return {
      name,
      rect: {
        t: Math.round(r.top),
        l: Math.round(r.left),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      top: stack[0] || null,
      covered: !!(
        stack[0] &&
        !stack[0].includes(el.className?.toString?.().split(/\s+/)[0] || "___") &&
        !el.contains(document.elementFromPoint(x, y))
      ),
      hitIsSelfOrChild: (() => {
        const t = document.elementFromPoint(x, y);
        return !!(t && (t === el || el.contains(t)));
      })(),
      stack,
    };
  }

  // Also check WITHOUT scroll — visual center clicks
  if (zone) zone.scrollTop = 0;
  const playR = play?.getBoundingClientRect();
  const noScrollPlay = playR
    ? {
        y: Math.round(playR.top),
        hit: (() => {
          const t = document.elementFromPoint(
            playR.left + playR.width / 2,
            playR.top + playR.height / 2
          );
          return t
            ? `${t.tagName}.${String(t.className).slice(0, 50)} pe=${getComputedStyle(t).pointerEvents}`
            : null;
        })(),
      }
    : null;

  // Full viewport pe:auto fixed/absolute layers
  const covers = [];
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === "none") continue;
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.85 || r.height < innerHeight * 0.5) continue;
    if (cs.position !== "fixed" && cs.position !== "absolute") continue;
    covers.push({
      el: `${el.tagName}#${el.id}.${String(el.className).slice(0, 55)}`,
      pe: cs.pointerEvents,
      zi: cs.zIndex,
      pos: cs.position,
      size: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.top)}`,
    });
  }

  const focusBar = document.querySelector(".hw-focus-bar");
  const mount = document.getElementById("hw-v2-worksheet-mount");

  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    scale:
      parseFloat(getComputedStyle(mount || document.body).getPropertyValue("--hw-focus-zoom")) ||
      1,
    mountTransform: mount ? getComputedStyle(mount).transform : null,
    focusBarPe: focusBar ? getComputedStyle(focusBar).pointerEvents : null,
    shells,
    covers: covers.slice(0, 15),
    noScrollPlay,
    afterScroll: [
      probe(play, "play"),
      probe(blank, "blank"),
      probe(glass, "glass"),
      probe(focus, "focusTb"),
      probe(tip, "tip"),
    ],
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
