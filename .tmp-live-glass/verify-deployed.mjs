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

const info = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  return {
    src: document.querySelector('script[src*="hw-worksheet-tools-layout"]')?.src,
    hub: document.querySelector('script[src*="hw-hub-v5"]')?.src,
    normal: window.HwWorksheetToolLayout?.getModeNeutrals?.(host),
  };
});
console.log("INFO", JSON.stringify(info, null, 2));

await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(400);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(800);

const normalPos = await page.evaluate(() => {
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
  const hr = host.getBoundingClientRect();
  const lr = lens?.getBoundingClientRect();
  const cr = launcher?.getBoundingClientRect();
  return {
    glass: { x: parseFloat(lens?.style.left) || 0, y: parseFloat(lens?.style.top) || 0 },
    cloud: {
      x: parseFloat(launcher?.style.left) || 0,
      y: parseFloat(launcher?.style.top) || 0,
    },
    glassCy: lr ? lr.top + lr.height / 2 - hr.top : null,
    cloudCy: cr ? cr.top + cr.height / 2 - hr.top : null,
    gap: Math.abs((parseFloat(launcher?.style.top) || 0) - (parseFloat(lens?.style.top) || 0)),
    mgStore: localStorage.getItem("hw-mg-toolbar-playtest-v6"),
    hcStore: localStorage.getItem("hw-hc-toolbar-playtest-v5"),
    oldMg: localStorage.getItem("hw-mg-toolbar-playtest-v5"),
  };
});
console.log("NORMAL OUT", JSON.stringify(normalPos, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/deployed-normal-verify.png",
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1000);

const focusPos = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const n = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
  const lens = host?.querySelector(":scope > .hw-mg-widget");
  const launcher = host?.querySelector(":scope > .hw-hc-launcher");
  return {
    neutrals: n,
    glass: { x: parseFloat(lens?.style.left) || 0, y: parseFloat(lens?.style.top) || 0 },
    cloud: {
      x: parseFloat(launcher?.style.left) || 0,
      y: parseFloat(launcher?.style.top) || 0,
    },
  };
});
console.log("FOCUS OUT", JSON.stringify(focusPos, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/deployed-focus-verify.png",
});
await browser.close();
