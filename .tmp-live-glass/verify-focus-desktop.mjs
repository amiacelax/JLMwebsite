import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  {
    waitUntil: "networkidle",
    timeout: 60000,
  }
);
await page.waitForSelector(".hw-worksheet--slide-mode, form.hw-worksheet", {
  timeout: 30000,
});
await page.waitForTimeout(500);

const focusBtn = page.locator('[data-tb-tool="focus"]');
await focusBtn.first().click({ force: true });
await page.waitForTimeout(900);

const metrics = await page.evaluate(() => {
  const brief = document.querySelector(".hw-worksheet__topic-brief--slide");
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(
      ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
    );
  const shell = document.querySelector(
    "#hw-v5-worksheet-card, .hw-hub-worksheet-card"
  );
  const form = document.querySelector(".hw-worksheet--slide-mode");
  const kumo = document.querySelector(".section-kumo");
  const br = brief?.getBoundingClientRect();
  const cr = card?.getBoundingClientRect();
  const cs = shell ? getComputedStyle(shell) : null;
  const fs = form ? getComputedStyle(form) : null;
  return {
    inFocus: document.body.classList.contains("hw-hw-focus-mode"),
    formDisplay: fs?.display,
    formGrid: fs?.gridTemplateColumns,
    brief: br
      ? { top: br.top, left: br.left, bottom: br.bottom, right: br.right }
      : null,
    card: cr
      ? { top: cr.top, left: cr.left, bottom: cr.bottom, right: cr.right }
      : null,
    shellBorder: cs ? `${cs.borderTopWidth} ${cs.borderTopColor}` : null,
    shellBg: cs?.backgroundColor,
    shellPad: cs?.padding,
    kumoVisible: kumo ? getComputedStyle(kumo).visibility : null,
    beside: !!(
      br &&
      cr &&
      br.right <= cr.left + 12 &&
      br.top < cr.bottom &&
      br.bottom > cr.top - 48
    ),
    stackedAbove: !!(br && cr && br.bottom <= cr.top + 6),
  };
});

await page.screenshot({
  path: "C:/JLM Website/.tmp-live-glass/focus-desktop-verify.png",
  fullPage: false,
});
console.log(JSON.stringify(metrics, null, 2));
await browser.close();
