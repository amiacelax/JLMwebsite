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
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });

const before = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const n = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
  const video = host?.querySelector(
    ".hw-listen-card__img, .hw-listen-card__figure, .hw-listen-card"
  );
  const hr = host?.getBoundingClientRect();
  const vr = video?.getBoundingClientRect();
  return {
    n,
    hostH: host?.clientHeight,
    video: vr && hr ? { t: vr.top - hr.top, h: vr.height, mid: vr.top - hr.top + vr.height / 2 } : null,
    focus: document.body.classList.contains("hw-hw-focus-mode"),
  };
});
console.log("BEFORE", JSON.stringify(before, null, 2));

await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(500);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(800);

const after = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const lens = host?.querySelector(":scope > .hw-mg-widget");
  const launcher = host?.querySelector(":scope > .hw-hc-launcher");
  const n = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
  const lr = lens?.getBoundingClientRect();
  const cr = launcher?.getBoundingClientRect();
  const hr = host?.getBoundingClientRect();
  const video = host?.querySelector(
    ".hw-listen-card__img, .hw-listen-card__figure, .hw-listen-card"
  );
  const vr = video?.getBoundingClientRect();
  return {
    neutrals: n,
    glassStyle: {
      x: parseFloat(lens?.style.left) || 0,
      y: parseFloat(lens?.style.top) || 0,
    },
    cloudStyle: {
      x: parseFloat(launcher?.style.left) || 0,
      y: parseFloat(launcher?.style.top) || 0,
    },
    glassVp: lr && hr ? { cx: lr.left + lr.width / 2 - hr.left, cy: lr.top + lr.height / 2 - hr.top } : null,
    cloudVp: cr && hr ? { cx: cr.left + cr.width / 2 - hr.left, cy: cr.top + cr.height / 2 - hr.top } : null,
    video:
      vr && hr
        ? { t: vr.top - hr.top, b: vr.bottom - hr.top, mid: vr.top - hr.top + vr.height / 2, h: vr.height }
        : null,
    gapCenters: lr && cr ? Math.round(cr.top + cr.height / 2 - (lr.top + lr.height / 2)) : null,
    mgStore: localStorage.getItem("hw-mg-toolbar-playtest-v5"),
    hcStore: localStorage.getItem("hw-hc-toolbar-playtest-v4"),
  };
});
console.log("AFTER", JSON.stringify(after, null, 2));
await page.screenshot({ path: "C:/JLM Website/.tmp-live-glass/probe-normal-live.png" });
await browser.close();
