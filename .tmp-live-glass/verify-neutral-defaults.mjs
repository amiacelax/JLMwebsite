import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Serve local files via file? Better hit local wrangler if up; else we verify after deploy.
const url =
  process.argv[2] ||
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1";

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
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(500);
await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(450);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(900);

const out = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const lens = host?.querySelector(":scope > .hw-mg-widget");
  const launcher = host?.querySelector(":scope > .hw-hc-launcher");
  for (const el of [lens, launcher]) {
    if (!el) continue;
    el.hidden = false;
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
  }
  const hostRect = host.getBoundingClientRect();
  const lr = lens?.getBoundingClientRect();
  const cr = launcher?.getBoundingClientRect();
  const video = host.querySelector(".hw-listen-card__img, .hw-listen-card__figure");
  const chrome = host.querySelector(".hw-audio-chrome__bar, .hw-audio-chrome");
  const vr = video?.getBoundingClientRect();
  const chr = chrome?.getBoundingClientRect();
  return {
    lensStyle: { left: lens?.style.left, top: lens?.style.top },
    cloudStyle: { left: launcher?.style.left, top: launcher?.style.top },
    mgKey: localStorage.getItem("hw-mg-toolbar-playtest-v4") || localStorage.getItem("hw-mg-student-toolbar-v3"),
    hcKey: localStorage.getItem("hw-hc-toolbar-playtest-v3") || localStorage.getItem("hw-hc-student-toolbar-v2"),
    hostL: Math.round(hostRect.left),
    lens: lr
      ? {
          cx: Math.round(lr.left + lr.width / 2),
          cy: Math.round(lr.top + lr.height / 2),
          overlap: Math.round(hostRect.left - lr.left),
        }
      : null,
    cloud: cr
      ? {
          cx: Math.round(cr.left + cr.width / 2),
          cy: Math.round(cr.top + cr.height / 2),
          w: Math.round(cr.width),
        }
      : null,
    video: vr ? { t: Math.round(vr.top), mid: Math.round(vr.top + vr.height / 2), b: Math.round(vr.bottom) } : null,
    chrome: chr ? { mid: Math.round(chr.top + chr.height / 2) } : null,
  };
});

console.log(JSON.stringify(out, null, 2));
await page.screenshot({ path: "C:/JLM Website/.tmp-live-glass/neutral-verify-local.png" });
await browser.close();
