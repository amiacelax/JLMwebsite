import { chromium } from "playwright";

const url =
  process.argv[2] ||
  "http://127.0.0.1:8788/homework/hub-v5-preview.html?status=in_progress&toolbar=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
} catch (e) {
  console.error("goto fail", e.message);
  await browser.close();
  process.exit(1);
}
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

const n = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const neutrals = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
  const hr = host.getBoundingClientRect();
  const listen = host.querySelector(".hw-listen-card");
  const img = host.querySelector(".hw-listen-card__img");
  const lr = listen?.getBoundingClientRect();
  const ir = img?.getBoundingClientRect();
  return {
    neutrals,
    listenMid: lr ? lr.top - hr.top + lr.height / 2 : null,
    imgMid: ir ? ir.top - hr.top + ir.height / 2 : null,
    src: document.querySelector('script[src*="hw-worksheet-tools-layout"]')?.src,
    storageKeys: {
      mg: "hw-mg-toolbar-playtest-v6",
      hc: "hw-hc-toolbar-playtest-v5",
    },
  };
});
console.log(JSON.stringify(n, null, 2));

await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(400);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(700);

const pos = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const lens = host?.querySelector(":scope > .hw-mg-widget");
  const launcher = host?.querySelector(":scope > .hw-hc-launcher");
  // Force show both for screenshot
  for (const el of [lens, launcher]) {
    if (!el) continue;
    el.hidden = false;
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
  }
  return {
    glass: { x: parseFloat(lens?.style.left) || 0, y: parseFloat(lens?.style.top) || 0 },
    cloud: {
      x: parseFloat(launcher?.style.left) || 0,
      y: parseFloat(launcher?.style.top) || 0,
    },
    gap: Math.abs(
      (parseFloat(launcher?.style.top) || 0) - (parseFloat(lens?.style.top) || 0)
    ),
    mgStore: localStorage.getItem("hw-mg-toolbar-playtest-v6"),
    hcStore: localStorage.getItem("hw-hc-toolbar-playtest-v5"),
  };
});
console.log("POS", JSON.stringify(pos, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/verify-normal-listen-mid.png",
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(900);
const focus = await page.evaluate(() => {
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
console.log("FOCUS", JSON.stringify(focus, null, 2));
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/verify-focus-untouched.png",
});
await browser.close();
