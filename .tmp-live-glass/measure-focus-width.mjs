import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector(".hw-worksheet--slide-mode, form.hw-worksheet", {
  timeout: 30000,
});
await page.waitForTimeout(600);

async function sample(label) {
  return page.evaluate((label) => {
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    const form = document.querySelector("form.hw-worksheet");
    const card =
      document.querySelector(".hw-listen-card") ||
      document.querySelector(
        ".hw-worksheet__section:not([hidden]) .hw-worksheet__content"
      );
    const container = document.querySelector(".container--wide");
    const mr = mount?.getBoundingClientRect();
    const fr = form?.getBoundingClientRect();
    const cr = card?.getBoundingClientRect();
    const ctr = container?.getBoundingClientRect();
    const ms = mount ? getComputedStyle(mount) : null;
    const fs = form ? getComputedStyle(form) : null;
    const cs = card ? getComputedStyle(card) : null;
    return {
      label,
      focus: document.body.classList.contains("hw-hw-focus-mode"),
      htmlClasses: document.documentElement.className,
      mount: mr
        ? {
            w: Math.round(mr.width),
            left: Math.round(mr.left),
            right: Math.round(mr.right),
            zoom: ms?.zoom,
            width: ms?.width,
            maxWidth: ms?.maxWidth,
          }
        : null,
      form: fr
        ? {
            w: Math.round(fr.width),
            left: Math.round(fr.left),
            width: fs?.width,
            maxWidth: fs?.maxWidth,
          }
        : null,
      card: cr
        ? {
            w: Math.round(cr.width),
            left: Math.round(cr.left),
            maxWidth: cs?.maxWidth,
            width: cs?.width,
          }
        : null,
      container: ctr
        ? {
            w: Math.round(ctr.width),
            maxWidth: getComputedStyle(container).maxWidth,
          }
        : null,
      vw: window.innerWidth,
    };
  }, label);
}

const before = await sample("before");
const focusTb = page.locator('[data-tb-tool="focus"]');
await focusTb.first().click({ force: true });
await page.waitForTimeout(800);
const after = await sample("after");

console.log(JSON.stringify({ before, after }, null, 2));
await browser.close();
