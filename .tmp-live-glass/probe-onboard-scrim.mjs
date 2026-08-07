import { chromium } from "playwright";

const url =
  process.argv[2] ||
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=" +
    Date.now();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Fresh profile — no onboard keys → may trigger onboarding
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.waitForTimeout(1500);

const before = await page.evaluate(() => {
  const scrims = [...document.querySelectorAll(".hw-mg-onboard-scrim, .hw-hc-onboard-scrim")];
  return {
    bodyClasses: document.body.className,
    scrims: scrims.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        cls: el.className,
        pe: cs.pointerEvents,
        op: cs.opacity,
        display: cs.display,
        vis: cs.visibility,
        zi: cs.zIndex,
        w: Math.round(r.width),
        h: Math.round(r.height),
        visibleClass: el.classList.contains("is-visible"),
      };
    }),
    mgActive: document.body.classList.contains("hw-mg-onboarding-active"),
    hcActive: document.body.classList.contains("hw-hc-onboarding-active"),
  };
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1200);

const after = await page.evaluate(() => {
  const play = document.querySelector(".hw-audio-chrome__play");
  const r = play?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : 400;
  const y = r ? r.top + r.height / 2 : 400;
  const top = document.elementFromPoint(x, y);
  const stack = document.elementsFromPoint(x, y).slice(0, 15).map((el) => {
    const cs = getComputedStyle(el);
    return `${el.tagName}.${String(el.className).slice(0, 40)}[pe=${cs.pointerEvents},op=${cs.opacity},z=${cs.zIndex}]`;
  });
  const scrims = [...document.querySelectorAll(".hw-mg-onboard-scrim, .hw-hc-onboard-scrim, [class*='scrim'], [class*='onboard']")];
  return {
    bodyClasses: document.body.className,
    playHit: { x: Math.round(x), y: Math.round(y), top: top && `${top.tagName}.${String(top.className).slice(0, 40)}` },
    stack,
    scrims: scrims.map((el) => {
      const cs = getComputedStyle(el);
      const rr = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: String(el.className).slice(0, 80),
        pe: cs.pointerEvents,
        op: cs.opacity,
        display: cs.display,
        zi: cs.zIndex,
        w: Math.round(rr.width),
        h: Math.round(rr.height),
      };
    }),
  };
});

console.log(JSON.stringify({ url, before, after }, null, 2));
await browser.close();
