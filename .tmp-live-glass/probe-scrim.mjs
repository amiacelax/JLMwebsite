import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(900);

const out = await page.evaluate(() => {
  const scrims = [...document.querySelectorAll(
    ".hw-hc-onboard-scrim, .hw-mg-onboard-scrim, [class*='onboard-scrim'], [class*='scrim']"
  )].map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      cls: el.className,
      hidden: el.hidden,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      pe: cs.pointerEvents,
      zi: cs.zIndex,
      size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      inDom: true,
    };
  });

  // Any fixed/absolute full-viewport pe:auto element
  const blockers = [];
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === "none") continue;
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.85 || r.height < innerHeight * 0.85) continue;
    if (cs.position !== "fixed" && cs.position !== "absolute") continue;
    blockers.push({
      el: `${el.tagName}#${el.id}.${String(el.className).slice(0, 50)}`,
      pe: cs.pointerEvents,
      opacity: cs.opacity,
      zi: cs.zIndex,
      pos: cs.position,
      size: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.top)}`,
    });
  }

  // Compare click at visual play vs layout play
  const play = document.querySelector(".hw-audio-chrome__play");
  play.scrollIntoView({ block: "center" });
  const r = play.getBoundingClientRect();
  // layout center approx: reverse scale from mount
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const scale = parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;
  const mr = mount.getBoundingClientRect();
  // visual center
  const vx = r.left + r.width / 2;
  const vy = r.top + r.height / 2;
  // If someone clicked as if unscaled (bug perception): layout box is smaller, centered in visual
  const lx = r.left + (r.width / scale) / 2 + (r.width - r.width / scale) / 2;
  const ly = r.top + (r.height / scale) / 2; // top-aligned within visual for child? approximate

  return {
    scrims,
    blockers,
    playHitVisual: (() => {
      const t = document.elementFromPoint(vx, vy);
      return t ? `${t.tagName}.${String(t.className).slice(0, 40)}` : null;
    })(),
    bodyClasses: document.body.className,
    htmlClasses: document.documentElement.className,
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
