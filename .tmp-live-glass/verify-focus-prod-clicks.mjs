import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=" +
    Date.now(),
  { waitUntil: "networkidle", timeout: 90000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1000);

const meta = await page.evaluate(() => {
  const card = document.getElementById("hw-v5-worksheet-card");
  const bar = document.querySelector(".hw-focus-bar");
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const zone = document.getElementById("hw-v5-homework-zone");
  const sheet = [...document.styleSheets];
  let flowRoot = false;
  try {
    for (const ss of sheet) {
      for (const rule of ss.cssRules || []) {
        if (rule.cssText && rule.cssText.includes("flow-root") && rule.cssText.includes("hw-hw-focus-mode")) {
          flowRoot = true;
        }
      }
    }
  } catch {}
  return {
    cardDisplay: card ? getComputedStyle(card).display : null,
    focusBarPe: bar ? getComputedStyle(bar).pointerEvents : null,
    mountTransform: mount ? getComputedStyle(mount).transform : null,
    zoneSH: zone?.scrollHeight,
    zoneCH: zone?.clientHeight,
    mountMB: mount ? getComputedStyle(mount).marginBottom : null,
    flowRootRulePresent: flowRoot,
  };
});

async function tryClick(sel) {
  const loc = page.locator(sel).first();
  if (!(await loc.count())) return { sel, missing: true };
  await loc.scrollIntoViewIfNeeded();
  await page.evaluate((s) => {
    window.__clk = null;
    document.querySelector(s)?.addEventListener("click", () => (window.__clk = s), {
      once: true,
    });
  }, sel);
  const box = await loc.boundingBox();
  if (!box) return { sel, noBox: true };
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const got = await page.evaluate(() => window.__clk);
  return { sel, ok: got === sel, box };
}

const clicks = {
  play: await tryClick(".hw-audio-chrome__play"),
  tip: await tryClick(".hw-recording-tip__trigger"),
  glass: await tryClick('[data-tb-tool="glass"]'),
  focus: await tryClick('[data-tb-tool="focus"]'),
};

await page.locator(".hw-blank").first().click();
await page.keyboard.type("hai");
const blankVal = await page.locator(".hw-blank").first().inputValue();

console.log(JSON.stringify({ meta, clicks, blankVal }, null, 2));
await browser.close();
