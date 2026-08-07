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
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });

const detail = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const hr = host.getBoundingClientRect();
  const mount =
    document.getElementById("hw-v2-worksheet-mount") ||
    document.getElementById("hw-worksheet-mount");
  const candidates = [
    ".hw-listen-card__img",
    ".hw-listen-card__figure",
    ".hw-listen-card",
    "video",
    ".hw-hub-v2-worksheet",
  ];
  const els = {};
  for (const sel of candidates) {
    const el = host.querySelector(sel) || (sel.startsWith(".") ? document.querySelector(sel) : null);
    if (!el) {
      els[sel] = null;
      continue;
    }
    const r = el.getBoundingClientRect();
    els[sel] = {
      tag: el.tagName,
      class: el.className?.toString?.().slice(0, 80),
      t: r.top - hr.top,
      h: r.height,
      mid: r.top - hr.top + r.height / 2,
      offsetTop: el.offsetTop,
      offsetHeight: el.offsetHeight,
    };
  }
  // Walk offsetParent chain for img
  const img = host.querySelector(".hw-listen-card__img, .hw-listen-card__figure, .hw-listen-card");
  let chain = [];
  let cur = img;
  while (cur && chain.length < 8) {
    const cs = getComputedStyle(cur);
    chain.push({
      tag: cur.tagName,
      id: cur.id,
      class: (cur.className?.toString?.() || "").slice(0, 60),
      zoom: cs.zoom,
      transform: cs.transform,
      offsetTop: cur.offsetTop,
      clientTop: cur.clientTop,
    });
    cur = cur.offsetParent || cur.parentElement;
    if (cur === host) {
      chain.push({ tag: "HOST", id: host.id, class: host.className?.toString?.().slice(0, 60) });
      break;
    }
  }
  const n = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
  // Manual recompute like source
  const video =
    host.querySelector(".hw-listen-card__img, .hw-listen-card__figure") ||
    host.querySelector(".hw-listen-card");
  const vr = video.getBoundingClientRect();
  const midY = vr.top - hr.top + vr.height * 0.5;
  return {
    neutrals: n,
    manualMidY: midY,
    host: { clientH: host.clientHeight, rectH: hr.height, top: hr.top },
    mountZoom: mount ? getComputedStyle(mount).zoom : null,
    bodyZoom: getComputedStyle(document.body).zoom,
    els,
    chain,
    src: document.querySelector('script[src*="hw-worksheet-tools-layout"]')?.src,
  };
});
console.log(JSON.stringify(detail, null, 2));
await browser.close();
