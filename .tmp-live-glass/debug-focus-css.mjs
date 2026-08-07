import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const cs = getComputedStyle(mount);
  // Parse stylesheet rules that mention focus zoom width
  const hits = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      const list = rule.cssRules ? [...rule.cssRules] : [rule];
      const media = rule.media ? rule.media.mediaText : "";
      for (const r of list) {
        if (!r.selectorText || !r.style) continue;
        if (
          r.selectorText.includes("hw-v2-worksheet-mount") &&
          (r.style.width || r.style.zoom || r.style.getPropertyValue("--hw-focus-zoom"))
        ) {
          hits.push({
            media,
            sel: r.selectorText.slice(0, 120),
            width: r.style.width,
            zoom: r.style.zoom,
            focusZoom: r.style.getPropertyValue("--hw-focus-zoom"),
            matched: mount.matches(
              r.selectorText.split(",")[0].trim()
            )
              ? "check-first-sel"
              : "n/a",
          });
        }
      }
    }
  }
  return {
    width: cs.width,
    zoom: cs.zoom,
    focusZoom: cs.getPropertyValue("--hw-focus-zoom"),
    maxWidth: cs.maxWidth,
    marginLeft: cs.marginLeft,
    marginRight: cs.marginRight,
    hits,
  };
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
