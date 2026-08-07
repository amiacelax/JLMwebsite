import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1000);

async function measure(label) {
  return page.evaluate((label) => {
    const zone = document.getElementById("hw-v5-homework-zone");
    const card = document.getElementById("hw-v5-worksheet-card");
    const mount = document.getElementById("hw-v2-worksheet-mount");
    const play = document.querySelector(".hw-audio-chrome__play");
    const tip = document.querySelector(".hw-recording-tip__trigger");
    const blank = document.querySelector(".hw-blank");
    const glass = document.querySelector('[data-tb-tool="glass"]');

    function probe(el, name) {
      if (!el) return { name, missing: true };
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const t = document.elementFromPoint(x, y);
      let clicked = false;
      const on = () => {
        clicked = true;
      };
      el.addEventListener("click", on, { once: true });
      if (t) {
        t.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            view: window,
          })
        );
      }
      el.removeEventListener("click", on);
      return {
        name,
        y: Math.round(r.top),
        hitOk: !!(t && (t === el || el.contains(t))),
        clicked,
        top: t
          ? t.tagName + "." + String(t.className).slice(0, 35)
          : "NULL",
        zoneScroll: zone.scrollTop,
      };
    }

    return {
      label,
      cardDisplay: getComputedStyle(card).display,
      cardH: Math.round(card.getBoundingClientRect().height),
      mountH: Math.round(mount.getBoundingClientRect().height),
      zoneSH: zone.scrollHeight,
      zoneCH: zone.clientHeight,
      maxScroll: zone.scrollHeight - zone.clientHeight,
      targets: [probe(play, "play"), probe(tip, "tip"), probe(blank, "blank"), probe(glass, "glass")],
    };
  }, label);
}

const withFlow = await measure("flow-root");

// Break BFC
await page.evaluate(() => {
  const card = document.getElementById("hw-v5-worksheet-card");
  card.style.setProperty("display", "block", "important");
});
await page.waitForTimeout(100);
const collapsed = await measure("collapsed-block");

// Also remove margin clearance entirely (worst case of pre-fix)
await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  mount.style.setProperty("margin-bottom", "0", "important");
  const card = document.getElementById("hw-v5-worksheet-card");
  card.style.setProperty("display", "block", "important");
});
await page.waitForTimeout(100);
const noClearance = await measure("no-clearance");

console.log(JSON.stringify({ withFlow, collapsed, noClearance }, null, 2));
await browser.close();
