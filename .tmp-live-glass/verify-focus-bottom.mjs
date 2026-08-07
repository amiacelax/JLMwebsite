import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

async function run(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(
    "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
    { waitUntil: "networkidle", timeout: 60000 }
  );
  await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
  await page.waitForTimeout(300);
  await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
  await page.waitForTimeout(800);

  const out = await page.evaluate(() => {
    const mount = document.getElementById("hw-v2-worksheet-mount");
    const zone =
      document.getElementById("hw-v5-homework-zone") ||
      document.getElementById("hw-hub-v4-homework");
    const card =
      document.querySelector(".hw-listen-card") ||
      document.querySelector(
        ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
      );
    const tb = document.querySelector(".hw-toolbar-bar");
    const kumo = document.querySelector(".section-kumo");
    const scale =
      parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;

    // Scroll so the visual bottom of the scaled mount sits in view
    const layoutH = mount.offsetHeight;
    const visualH = layoutH * scale;
    const need = Math.max(0, visualH + 24 - zone.clientHeight);
    zone.scrollTop = need;

    const cr = card.getBoundingClientRect();
    const tr = tb.getBoundingClientRect();
    const visualBottom =
      mount.getBoundingClientRect().top + mount.offsetHeight * scale;

    return {
      width: innerWidth,
      scale,
      zoneScrollable: zone.scrollHeight > zone.clientHeight + 4,
      bottomVisible: visualBottom <= innerHeight + 8,
      tbBottomVisible: tr.bottom <= innerHeight + 8,
      tbTopVisible: tr.top >= -8,
      cardBottomVisible: cr.bottom <= innerHeight + 8,
      widthLocked: Math.round(cr.width) >= 448,
      kumo: kumo
        ? {
            vis: getComputedStyle(kumo).visibility,
            display: getComputedStyle(kumo).display,
          }
        : "missing",
      exitExists: !!document.querySelector(".hw-focus-bar__exit"),
    };
  });

  await page.screenshot({
    path: `C:/JLM Website/.tmp-live-glass/focus-bottom-${width}.png`,
    fullPage: false,
  });
  await page.close();
  return out;
}

const results = [await run(1440), await run(1100)];
console.log(JSON.stringify(results, null, 2));
await browser.close();
