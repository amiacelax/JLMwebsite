import { chromium } from "playwright";

const url =
  process.argv[2] ||
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

await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(400);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(700);

const normal = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const video = host.querySelector(
    ".hw-listen-card__img, .hw-listen-card__figure, .hw-listen-card"
  );
  const listen = host.querySelector(".hw-listen-card");
  const hr = host.getBoundingClientRect();
  const vr = video?.getBoundingClientRect();
  const lr = listen?.getBoundingClientRect();
  const half = 36;
  const pad = 12;
  const gap = 82;
  const videoMidY = vr ? vr.top + vr.height / 2 - hr.top : 400;
  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    host: { w: host.clientWidth, h: host.clientHeight, l: Math.round(hr.left) },
    video: vr
      ? {
          l: Math.round(vr.left - hr.left),
          t: Math.round(vr.top - hr.top),
          w: Math.round(vr.width),
          h: Math.round(vr.height),
          midY: Math.round(videoMidY),
        }
      : null,
    listen: lr
      ? {
          l: Math.round(lr.left - hr.left),
          t: Math.round(lr.top - hr.top),
          w: Math.round(lr.width),
        }
      : null,
    candidates: {
      inset48: {
        x: half + pad,
        glassY: Math.round((videoMidY - gap / 2) * 1000) / 1000,
        cloudY: Math.round((videoMidY + gap / 2) * 1000) / 1000,
      },
      leftOfListen: lr
        ? {
            x: Math.round((lr.left - hr.left - half - 10) * 1000) / 1000,
            glassY: Math.round((videoMidY - gap / 2) * 1000) / 1000,
            cloudY: Math.round((videoMidY + gap / 2) * 1000) / 1000,
          }
        : null,
      old82: {
        x: 82.125,
        glassY: Math.round((videoMidY - gap / 2) * 1000) / 1000,
        cloudY: Math.round((videoMidY + gap / 2) * 1000) / 1000,
      },
      focusFixed: { x: 0, glassY: 497, cloudY: 579 },
    },
    current: {
      glass: {
        x: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.left) || 0,
        y: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.top) || 0,
      },
      cloud: {
        x: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.left) || 0,
        y: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.top) || 0,
      },
    },
  };
});

console.log("NORMAL", JSON.stringify(normal, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/dual-neutral-normal-current.png",
});

for (const [name, c] of Object.entries(normal.candidates)) {
  if (!c) continue;
  await page.evaluate((pos) => {
    window.HwMagnifyingGlass?.setLensPositionLocal?.(pos.x, pos.glassY, false);
    window.HwHomeworkComments?.setLauncherPositionLocal?.(pos.x, pos.cloudY, false);
    const host =
      document.querySelector(".hw-hub-v2-worksheet") ||
      document.getElementById("hw-v5-worksheet-card");
    for (const el of [
      host?.querySelector(":scope > .hw-mg-widget"),
      host?.querySelector(":scope > .hw-hc-launcher"),
    ]) {
      if (!el) continue;
      el.hidden = false;
      el.style.setProperty("display", "flex", "important");
      el.style.setProperty("visibility", "visible", "important");
      el.style.setProperty("opacity", "1", "important");
    }
  }, c);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `C:/JLM Website/.tmp-live-glass/dual-neutral-normal-${name}.png`,
  });
}

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(900);

const focusMeas = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const video = host.querySelector(
    ".hw-listen-card__img, .hw-listen-card__figure, .hw-listen-card"
  );
  const hr = host.getBoundingClientRect();
  const vr = video?.getBoundingClientRect();
  const gap = 82;
  const videoMidY = vr ? vr.top + vr.height / 2 - hr.top : 400;
  const mount =
    document.getElementById("hw-v2-worksheet-mount") ||
    document.getElementById("hw-worksheet-mount");
  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    host: { w: host.clientWidth, h: host.clientHeight },
    videoMidY: Math.round(videoMidY * 1000) / 1000,
    zoom: mount ? getComputedStyle(mount).zoom : null,
    computedEdge: {
      x: 0,
      glassY: Math.round((videoMidY - gap / 2) * 1000) / 1000,
      cloudY: Math.round((videoMidY + gap / 2) * 1000) / 1000,
    },
    fixed: { x: 0, glassY: 497, cloudY: 579 },
    current: {
      glass: {
        x: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.left) || 0,
        y: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.top) || 0,
      },
      cloud: {
        x: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.left) || 0,
        y: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.top) || 0,
      },
    },
  };
});

console.log("FOCUS", JSON.stringify(focusMeas, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/dual-neutral-focus-current.png",
});

await browser.close();
