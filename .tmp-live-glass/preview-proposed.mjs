import { chromium } from "playwright";

const url =
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });

// Simulate the NEW compute on live DOM (before deploy)
const sim = await page.evaluate(() => {
  const GAP = 10;
  const TOOL_SIZE = 72;
  const STACK_CENTER_GAP = TOOL_SIZE + GAP;
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const hostRect = host.getBoundingClientRect();
  const listen =
    host.querySelector(".hw-listen-card") ||
    host.querySelector(".hw-listen-card__figure, .hw-listen-card__img");
  const lr = listen.getBoundingClientRect();
  const midY = lr.top - hostRect.top + lr.height * 0.5;
  const proposed = {
    lens: { x: 0, y: Math.round((midY - STACK_CENTER_GAP / 2) * 1000) / 1000 },
    launcher: { x: 0, y: Math.round((midY + STACK_CENTER_GAP / 2) * 1000) / 1000 },
  };
  const current = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
  return {
    current,
    proposed,
    midY,
    focus: { lens: { x: 0, y: 497 }, launcher: { x: 0, y: 579 } },
    gapProposed: proposed.launcher.y - proposed.lens.y,
  };
});
console.log(JSON.stringify(sim, null, 2));

// Apply proposed and screenshot
await page.evaluate((pos) => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (k.includes("hw-mg") || k.includes("hw-hc") || k.includes("jlm-hc"))) {
      localStorage.removeItem(k);
    }
  }
}, sim.proposed);

await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(300);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(500);

await page.evaluate((pos) => {
  window.HwMagnifyingGlass?.setLensPositionLocal?.(pos.lens.x, pos.lens.y, false);
  window.HwHomeworkComments?.setLauncherPositionLocal?.(
    pos.launcher.x,
    pos.launcher.y,
    false
  );
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
}, sim.proposed);

await page.waitForTimeout(200);
await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/preview-normal-listen-mid.png",
});
await browser.close();
