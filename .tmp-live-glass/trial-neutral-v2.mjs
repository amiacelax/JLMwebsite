import { chromium } from "playwright";

const url =
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });

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
await page.waitForTimeout(450);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(900);

const diag = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const launcher = host?.querySelector(":scope > .hw-hc-launcher");
  const lens = host?.querySelector(":scope > .hw-mg-widget");

  function forceShow(el) {
    if (!el) return;
    el.hidden = false;
    el.removeAttribute("hidden");
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("pointer-events", "auto", "important");
    el.style.setProperty("transform", "translate(-50%, -50%)", "important");
  }
  forceShow(lens);
  forceShow(launcher);

  const hostRect = host.getBoundingClientRect();
  const video = host.querySelector(".hw-listen-card__img, .hw-listen-card__figure");
  const vr = video?.getBoundingClientRect();
  const videoMidY = vr ? vr.top + vr.height / 2 - hostRect.top : 400;
  const gap = 82;
  const cloudY = videoMidY + gap / 2;
  const glassY = cloudY - gap;
  const x = 0;

  window.HwMagnifyingGlass?.setLensPositionLocal?.(x, glassY, false);
  window.HwHomeworkComments?.setLauncherPositionLocal?.(x, cloudY, false);
  forceShow(lens);
  forceShow(launcher);

  const lr = lens?.getBoundingClientRect();
  const cr = launcher?.getBoundingClientRect();
  return {
    x,
    glassY,
    cloudY,
    videoMidY,
    hostL: Math.round(hostRect.left),
    lens: lr
      ? { cx: Math.round(lr.left + lr.width / 2), cy: Math.round(lr.top + lr.height / 2), w: Math.round(lr.width) }
      : null,
    cloud: cr
      ? { cx: Math.round(cr.left + cr.width / 2), cy: Math.round(cr.top + cr.height / 2), w: Math.round(cr.width) }
      : null,
    video: vr
      ? { t: Math.round(vr.top), b: Math.round(vr.bottom), mid: Math.round(vr.top + vr.height / 2) }
      : null,
    launcherClass: launcher?.className,
  };
});

console.log(JSON.stringify(diag, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/neutral-left0-midvideo.png",
});

// Match screenshot: slightly outside left edge
await page.evaluate(({ glassY, cloudY }) => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const launcher = host?.querySelector(":scope > .hw-hc-launcher");
  const lens = host?.querySelector(":scope > .hw-mg-widget");
  const x = -8;
  window.HwMagnifyingGlass?.setLensPositionLocal?.(x, glassY, false);
  window.HwHomeworkComments?.setLauncherPositionLocal?.(x, cloudY, false);
  for (const el of [lens, launcher]) {
    if (!el) continue;
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
  }
}, diag);

await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/neutral-neg8-midvideo.png",
});

await browser.close();
