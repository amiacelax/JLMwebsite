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

async function measure(label) {
  return page.evaluate((label) => {
    const host =
      document.querySelector(".hw-hub-v2-worksheet") ||
      document.getElementById("hw-v5-worksheet-card");
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    const hr = host.getBoundingClientRect();
    const img = host.querySelector(".hw-listen-card__img, .hw-listen-card__figure");
    const listen = host.querySelector(".hw-listen-card");
    const ir = img?.getBoundingClientRect();
    const lr = listen?.getBoundingClientRect();
    const zoom = mount ? parseFloat(getComputedStyle(mount).zoom) || 1 : 1;

    function localYFromRect(r) {
      if (!r) return null;
      return (r.top - hr.top + r.height / 2) / zoom;
    }
    function offsetMidY(el) {
      if (!el || !host.contains(el)) return null;
      let y = el.offsetHeight / 2;
      let cur = el;
      while (cur && cur !== host) {
        y += cur.offsetTop;
        cur = cur.offsetParent;
        if (!cur) break;
        if (!host.contains(cur) && cur !== host) break;
      }
      // fallback walk parentElement if offsetParent skipped host
      if (cur !== host) {
        y = el.offsetHeight / 2;
        cur = el;
        while (cur && cur !== host) {
          y += cur.offsetTop;
          const p = cur.parentElement;
          if (!p) break;
          cur = p;
        }
      }
      return y;
    }

    // Proper offset sum via offsetParent until host
    function localCenterY(el) {
      if (!el) return null;
      let top = 0;
      let cur = el;
      while (cur && cur !== host) {
        top += cur.offsetTop;
        cur = cur.offsetParent;
      }
      if (cur !== host) {
        // offsetParent jumped out — use parentElement path
        top = 0;
        cur = el;
        while (cur && cur !== host) {
          top += cur.offsetTop;
          cur = cur.parentElement;
        }
      }
      return top + el.offsetHeight / 2;
    }

    const n = window.HwWorksheetToolLayout?.getModeNeutrals?.(host);
    return {
      label,
      focus: document.body.classList.contains("hw-hw-focus-mode"),
      zoom,
      mountZoom: mount ? getComputedStyle(mount).zoom : null,
      host: { clientH: host.clientHeight, rectH: hr.height, ratio: hr.height / host.clientHeight },
      neutrals: n,
      img: {
        rectMid: ir ? ir.top - hr.top + ir.height / 2 : null,
        localFromRectZoom: localYFromRect(ir),
        localCenter: localCenterY(img),
        offsetTop: img?.offsetTop,
        offsetH: img?.offsetHeight,
      },
      listen: {
        rectMid: lr ? lr.top - hr.top + lr.height / 2 : null,
        localFromRectZoom: localYFromRect(lr),
        localCenter: localCenterY(listen),
        offsetTop: listen?.offsetTop,
        offsetH: listen?.offsetHeight,
      },
      focusFixedMid: (497 + 579) / 2,
    };
  }, label);
}

console.log("NORMAL", JSON.stringify(await measure("normal"), null, 2));

await page.locator('[data-tb-tool="glass"]').first().click({ force: true });
await page.waitForTimeout(300);
await page.locator('[data-tb-tool="cloud"]').first().click({ force: true });
await page.waitForTimeout(500);
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1000);

console.log("FOCUS", JSON.stringify(await measure("focus"), null, 2));

const focusPos = await page.evaluate(() => {
  const host =
    document.querySelector(".hw-hub-v2-worksheet") ||
    document.getElementById("hw-v5-worksheet-card");
  const lens = host?.querySelector(":scope > .hw-mg-widget");
  const launcher = host?.querySelector(":scope > .hw-hc-launcher");
  const hr = host.getBoundingClientRect();
  const lr = lens?.getBoundingClientRect();
  const cr = launcher?.getBoundingClientRect();
  return {
    glassStyle: { x: parseFloat(lens?.style.left) || 0, y: parseFloat(lens?.style.top) || 0 },
    cloudStyle: { x: parseFloat(launcher?.style.left) || 0, y: parseFloat(launcher?.style.top) || 0 },
    glassVisualY: lr ? lr.top + lr.height / 2 - hr.top : null,
    cloudVisualY: cr ? cr.top + cr.height / 2 - hr.top : null,
  };
});
console.log("FOCUS POS", JSON.stringify(focusPos, null, 2));
await page.screenshot({ path: "C:/JLM Website/.tmp-live-glass/probe-focus-coords.png" });

await browser.close();
