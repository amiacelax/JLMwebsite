import { chromium } from "playwright";

const url =
  process.argv[2] ||
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.waitForTimeout(800);

// Clear stale tool positions
await page.evaluate(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.includes("hw-mg") || k.includes("hw-hc") || k.includes("jlm-hc"))) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(700);

// Pop glass + cloud if tucked
for (const tool of ["glass", "cloud"]) {
  const btn = page.locator(`[data-tb-tool="${tool}"]`).first();
  if (await btn.count()) {
    await btn.click({ force: true });
    await page.waitForTimeout(400);
  }
}

const out = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card") ||
    document.querySelector(".hw-worksheet")?.parentElement;
  const mount =
    document.getElementById("hw-v2-worksheet-mount") ||
    document.getElementById("hw-worksheet-mount");
  const lens = host?.querySelector(":scope > .hw-mg-widget");
  const cloud = host?.querySelector(":scope > .hw-hc-launcher");
  const video =
    host?.querySelector(".hw-listen-card__img, .hw-listen-card__figure, .hw-listen-card video, .hw-audio-player");
  const listenCard = host?.querySelector(".hw-listen-card");
  const hostRect = host?.getBoundingClientRect();
  const zoom = hostRect && host.clientWidth ? hostRect.width / host.clientWidth : 1;

  function toLayout(clientX, clientY) {
    return {
      x: (clientX - hostRect.left) / zoom,
      y: (clientY - hostRect.top) / zoom,
    };
  }

  function elInfo(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const layoutCenter = toLayout(r.left + r.width / 2, r.top + r.height / 2);
    return {
      styleLeft: el.style.left,
      styleTop: el.style.top,
      client: {
        l: Math.round(r.left),
        t: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      layoutCenter: {
        x: Math.round(layoutCenter.x * 1000) / 1000,
        y: Math.round(layoutCenter.y * 1000) / 1000,
      },
    };
  }

  let target = null;
  if (video && hostRect) {
    const vr = video.getBoundingClientRect();
    const mid = toLayout(hostRect.left, vr.top + vr.height / 2);
    // Stack: glass above cloud by 72 + 10; center of stack at video mid
    const gap = 82; // 72 widget + 10 gap between centers
    const cloudY = mid.y + gap / 2;
    const glassY = cloudY - gap;
    target = {
      x: 0,
      glass: { x: 0, y: Math.round(glassY * 1000) / 1000 },
      cloud: { x: 0, y: Math.round(cloudY * 1000) / 1000 },
      videoMidLayoutY: Math.round(mid.y * 1000) / 1000,
      videoClient: {
        t: Math.round(vr.top),
        h: Math.round(vr.height),
      },
    };
  } else if (listenCard && hostRect) {
    const cr = listenCard.getBoundingClientRect();
    const mid = toLayout(hostRect.left, cr.top + Math.min(cr.height, 220) / 2);
    const gap = 82;
    const cloudY = mid.y + gap / 2;
    target = {
      x: 0,
      glass: { x: 0, y: Math.round((cloudY - gap) * 1000) / 1000 },
      cloud: { x: 0, y: Math.round(cloudY * 1000) / 1000 },
      videoMidLayoutY: Math.round(mid.y * 1000) / 1000,
      from: "listenCard",
    };
  }

  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    zoom: Math.round(zoom * 1000) / 1000,
    mountZoom: mount ? getComputedStyle(mount).zoom : null,
    host: host
      ? {
          clientW: host.clientWidth,
          clientH: host.clientHeight,
          rectW: Math.round(hostRect.width),
          rectH: Math.round(hostRect.height),
          rectL: Math.round(hostRect.left),
          rectT: Math.round(hostRect.top),
        }
      : null,
    lens: elInfo(lens),
    cloud: elInfo(cloud),
    target,
    currentDefaults: {
      glass: { x: 82.125, y: 373.0625 },
      cloud: { x: 82.125, y: 455.0625 },
    },
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
