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
  const card = document.getElementById("hw-v5-worksheet-card");
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const zone = document.getElementById("hw-v5-homework-zone");
  const bar = document.querySelector(".hw-focus-bar");
  const kids = [...card.children].map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      id: el.id,
      cls: String(el.className).slice(0, 60),
      pe: cs.pointerEvents,
      pos: cs.position,
      zi: cs.zIndex,
      display: cs.display,
      offset: `${el.offsetWidth}x${el.offsetHeight}`,
      rect: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.top)}`,
      marginBottom: cs.marginBottom,
    };
  });

  // Map of who owns each row of pixels down the center (no scroll)
  zone.scrollTop = 0;
  const rows = [];
  for (let y = 40; y < 880; y += 40) {
    const el = document.elementFromPoint(720, y);
    rows.push({
      y,
      el: el
        ? `${el.tagName}#${el.id}.${String(el.className || "").slice(0, 40)}`
        : "NULL",
    });
  }

  const barR = bar.getBoundingClientRect();
  const barCs = getComputedStyle(bar);

  // Check if any element has inert or aria-hidden that blocks
  const inertish = [...document.querySelectorAll("[inert], [aria-hidden='true']")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 200 && r.height > 200 && getComputedStyle(el).pointerEvents !== "none";
    })
    .slice(0, 15)
    .map((el) => `${el.tagName}#${el.id}.${String(el.className).slice(0, 40)} inert=${el.hasAttribute("inert")} ah=${el.getAttribute("aria-hidden")}`);

  return {
    kids,
    rows,
    bar: {
      h: Math.round(barR.height),
      w: Math.round(barR.width),
      pe: barCs.pointerEvents,
      zi: barCs.zIndex,
      pos: barCs.position,
    },
    mountPe: getComputedStyle(mount).pointerEvents,
    cardPe: getComputedStyle(card).pointerEvents,
    inertish,
    htmlFs: !!document.fullscreenElement,
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
