import { chromium } from "playwright";

const url =
  process.argv[2] ||
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.waitForTimeout(600);

await page.evaluate(() => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (k.includes("hw-mg") || k.includes("hw-hc") || k.includes("jlm-hc"))) {
      localStorage.removeItem(k);
    }
  }
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(500);
await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(500);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(900);

const trials = [
  { name: "current", glass: { x: 82.125, y: 373.0625 }, cloud: { x: 82.125, y: 455.0625 } },
  { name: "left-edge-0", glass: { x: 0, y: 373.0625 }, cloud: { x: 0, y: 455.0625 } },
  { name: "left-edge-neg36", glass: { x: -36, y: 373.0625 }, cloud: { x: -36, y: 455.0625 } },
  { name: "video-mid-0", glass: { x: 0, y: 398 }, cloud: { x: 0, y: 480 } },
];

const results = [];
for (const t of trials) {
  const info = await page.evaluate(({ glass, cloud }) => {
    const host =
      document.querySelector(".hw-hub-v2-worksheet") ||
      document.getElementById("hw-v5-worksheet-card");
    window.HwMagnifyingGlass?.setLensPositionLocal?.(glass.x, glass.y, false);
    window.HwHomeworkComments?.setLauncherPositionLocal?.(cloud.x, cloud.y, false);
    // force visible
    const lens = host?.querySelector(":scope > .hw-mg-widget");
    const launcher = host?.querySelector(":scope > .hw-hc-launcher");
    if (lens) {
      lens.hidden = false;
      lens.style.visibility = "visible";
      lens.style.opacity = "1";
      lens.style.pointerEvents = "auto";
      lens.classList.remove("hw-mg-widget--tucked");
    }
    if (launcher) {
      launcher.hidden = false;
      launcher.style.visibility = "visible";
      launcher.style.opacity = "1";
      launcher.classList.remove("is-tucked", "hw-hc-launcher--tucked");
    }
    const hostRect = host.getBoundingClientRect();
    const lr = lens?.getBoundingClientRect();
    const cr = launcher?.getBoundingClientRect();
    const video = host.querySelector(".hw-listen-card__img, .hw-listen-card__figure");
    const vr = video?.getBoundingClientRect();
    return {
      hostL: Math.round(hostRect.left),
      glass: lr
        ? {
            cx: Math.round(lr.left + lr.width / 2),
            cy: Math.round(lr.top + lr.height / 2),
            l: Math.round(lr.left),
            overlapLeft: Math.round(hostRect.left - lr.left),
          }
        : null,
      cloud: cr
        ? {
            cx: Math.round(cr.left + cr.width / 2),
            cy: Math.round(cr.top + cr.height / 2),
            l: Math.round(cr.left),
            w: Math.round(cr.width),
            overlapLeft: Math.round(hostRect.left - cr.left),
          }
        : null,
      video: vr
        ? { t: Math.round(vr.top), b: Math.round(vr.bottom), mid: Math.round(vr.top + vr.height / 2) }
        : null,
    };
  }, t);
  results.push({ name: t.name, ...info });
  await page.screenshot({
    path: `C:/JLM Website/.tmp-live-glass/neutral-trial-${t.name}.png`,
    fullPage: false,
  });
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
