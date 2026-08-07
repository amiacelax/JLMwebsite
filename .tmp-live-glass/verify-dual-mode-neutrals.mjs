import { chromium } from "playwright";

const local =
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1";
const prod =
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let url = process.argv[2] || local;
try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
} catch {
  url = prod;
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
}
console.log("URL", url);

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

const apis = await page.evaluate(() => ({
  getModeNeutrals: typeof window.HwWorksheetToolLayout?.getModeNeutrals,
  mgSync: typeof window.HwMagnifyingGlass?.syncModePosition,
  hcSync: typeof window.HwHomeworkComments?.syncModePosition,
}));
console.log("APIs", apis);

const normalN = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  return window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
});
console.log("NORMAL neutrals", JSON.stringify(normalN));

await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(500);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(700);

const normalPos = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const lens = host?.querySelector(":scope > .hw-mg-widget");
  const launcher = host?.querySelector(":scope > .hw-hc-launcher");
  return {
    glass: {
      x: parseFloat(lens?.style.left) || 0,
      y: parseFloat(lens?.style.top) || 0,
    },
    cloud: {
      x: parseFloat(launcher?.style.left) || 0,
      y: parseFloat(launcher?.style.top) || 0,
    },
    mgStore:
      localStorage.getItem("hw-mg-toolbar-playtest-v5") ||
      localStorage.getItem("hw-mg-student-toolbar-v4"),
    hcStore:
      localStorage.getItem("hw-hc-toolbar-playtest-v4") ||
      localStorage.getItem("hw-hc-student-toolbar-v3"),
  };
});
console.log("NORMAL out", JSON.stringify(normalPos, null, 2));

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
    glass: {
      x: parseFloat(lens?.style.left) || 0,
      y: parseFloat(lens?.style.top) || 0,
    },
    cloud: {
      x: parseFloat(launcher?.style.left) || 0,
      y: parseFloat(launcher?.style.top) || 0,
    },
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    mgStore:
      localStorage.getItem("hw-mg-toolbar-playtest-v5") ||
      localStorage.getItem("hw-mg-student-toolbar-v4"),
    hcStore:
      localStorage.getItem("hw-hc-toolbar-playtest-v4") ||
      localStorage.getItem("hw-hc-student-toolbar-v3"),
  };
});
console.log("FOCUS out", JSON.stringify(focusPos, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/dual-neutral-verify-focus.png",
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1000);

const back = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const lens = host?.querySelector(":scope > .hw-mg-widget");
  const launcher = host?.querySelector(":scope > .hw-hc-launcher");
  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    glass: {
      x: parseFloat(lens?.style.left) || 0,
      y: parseFloat(lens?.style.top) || 0,
    },
    cloud: {
      x: parseFloat(launcher?.style.left) || 0,
      y: parseFloat(launcher?.style.top) || 0,
    },
    mgStore:
      localStorage.getItem("hw-mg-toolbar-playtest-v5") ||
      localStorage.getItem("hw-mg-student-toolbar-v4"),
    hcStore:
      localStorage.getItem("hw-hc-toolbar-playtest-v4") ||
      localStorage.getItem("hw-hc-student-toolbar-v3"),
  };
});
console.log("BACK normal", JSON.stringify(back, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/dual-neutral-verify-normal.png",
});

await browser.close();
