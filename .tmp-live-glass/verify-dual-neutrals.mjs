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

await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(450);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(900);

const normal = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const n = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    modeNeutrals: n,
    glass: {
      x: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.left) || 0,
      y: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.top) || 0,
    },
    cloud: {
      x: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.left) || 0,
      y: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.top) || 0,
    },
    keys: {
      mg: localStorage.getItem("hw-mg-toolbar-playtest-v5"),
      hc: localStorage.getItem("hw-hc-toolbar-playtest-v4"),
    },
  };
});
console.log("NORMAL", JSON.stringify(normal, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/dual-verify-normal.png",
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(900);

const focus = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const n = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    modeNeutrals: n,
    glass: {
      x: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.left) || 0,
      y: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.top) || 0,
    },
    cloud: {
      x: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.left) || 0,
      y: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.top) || 0,
    },
  };
});
console.log("FOCUS", JSON.stringify(focus, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/dual-verify-focus.png",
});

// Exit focus
await page.locator(".hw-focus-bar__exit").first().click({ force: true });
await page.waitForTimeout(900);
const afterExit = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const n = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    modeNeutrals: n,
    glass: {
      x: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.left) || 0,
      y: parseFloat(host.querySelector(":scope > .hw-mg-widget")?.style.top) || 0,
    },
    cloud: {
      x: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.left) || 0,
      y: parseFloat(host.querySelector(":scope > .hw-hc-launcher")?.style.top) || 0,
    },
  };
});
console.log("AFTER_EXIT", JSON.stringify(afterExit, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/dual-verify-after-exit.png",
});

await browser.close();
