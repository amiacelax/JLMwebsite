import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 90000 }
);
await page.waitForSelector("form.hw-worksheet");
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(600);

const o = await page.evaluate(() => {
  const mount =
    document.getElementById("hw-v2-worksheet-mount") ||
    document.getElementById("hw-worksheet-mount");
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const path = [];
  let el = host;
  while (el) {
    path.push({
      tag: el.tagName,
      id: el.id,
      cls: String(el.className).slice(0, 60),
      zoom: getComputedStyle(el).zoom,
      cw: el.clientWidth,
      rw: Math.round(el.getBoundingClientRect().width),
      ch: el.clientHeight,
      rh: Math.round(el.getBoundingClientRect().height),
    });
    el = el.parentElement;
  }
  return {
    mountZoom: mount && getComputedStyle(mount).zoom,
    hostInMount: !!(mount && mount.contains(host)),
    path,
  };
});
console.log(JSON.stringify(o, null, 2));

// Place stack lower: beside bottom of video / controls (match user pic)
const placed = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const video = host.querySelector(".hw-listen-card__img, .hw-listen-card__figure");
  const chrome = host.querySelector(".hw-audio-chrome__bar, .hw-audio-chrome");
  const hostRect = host.getBoundingClientRect();
  const vr = video.getBoundingClientRect();
  const cr = chrome?.getBoundingClientRect();

  // Target: glass near lower video, cloud near chrome bar — left edge
  const glassClientY = vr.top + vr.height * 0.72;
  const cloudClientY = cr
    ? cr.top + cr.height / 2
    : vr.bottom + 24;
  // Ensure gap >= 82 between centers
  let glassY = glassClientY - hostRect.top;
  let cloudY = cloudClientY - hostRect.top;
  if (cloudY - glassY < 82) cloudY = glassY + 82;

  const x = 0;
  window.HwMagnifyingGlass?.setLensPositionLocal?.(x, glassY, false);
  window.HwHomeworkComments?.setLauncherPositionLocal?.(x, cloudY, false);

  const lens = host.querySelector(":scope > .hw-mg-widget");
  const launcher = host.querySelector(":scope > .hw-hc-launcher");
  for (const el of [lens, launcher]) {
    if (!el) continue;
    el.hidden = false;
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
  }

  return {
    x,
    glassY: Math.round(glassY * 1000) / 1000,
    cloudY: Math.round(cloudY * 1000) / 1000,
    gap: Math.round((cloudY - glassY) * 1000) / 1000,
    video: { t: Math.round(vr.top), b: Math.round(vr.bottom) },
    chrome: cr ? { t: Math.round(cr.top), mid: Math.round(cr.top + cr.height / 2) } : null,
  };
});
console.log("placed", JSON.stringify(placed, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/neutral-lower-left0.png",
});
await browser.close();
