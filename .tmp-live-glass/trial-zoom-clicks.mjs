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

const baseline = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const form = document.querySelector("form.hw-worksheet");
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(".hw-worksheet__content");
  const tb = document.querySelector(".hw-toolbar-bar");
  const play = document.querySelector(".hw-audio-chrome__play");
  const mr = mount.getBoundingClientRect();
  const fr = form.getBoundingClientRect();
  const cr = card?.getBoundingClientRect();
  const tr = tb?.getBoundingClientRect();
  const pr = play?.getBoundingClientRect();
  return {
    mount: { w: Math.round(mr.width), h: Math.round(mr.height), t: Math.round(mr.top) },
    form: { w: Math.round(fr.width) },
    card: cr ? { w: Math.round(cr.width), l: Math.round(cr.left) } : null,
    tb: tr ? { w: Math.round(tr.width), h: Math.round(tr.height), b: Math.round(tr.bottom) } : null,
    play: pr ? { t: Math.round(pr.top), w: Math.round(pr.width) } : null,
    zoom: getComputedStyle(mount).zoom,
    transform: getComputedStyle(mount).transform,
    focusZoom: getComputedStyle(mount).getPropertyValue("--hw-focus-zoom").trim(),
  };
});

// Trial: zoom + width lock (48rem), no transform, toolbar counter-zoom
await page.addStyleTag({
  content: `
    @media (min-width: 900px) {
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-worksheet-mount,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-v2-worksheet-mount,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-worksheet-mount {
        --hw-focus-zoom: 1.6875;
        transform: none !important;
        margin-bottom: 0 !important;
        width: 48rem !important;
        max-width: 48rem !important;
        zoom: var(--hw-focus-zoom) !important;
      }
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount .hw-toolbar-bar,
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount .hw-toolbar-bar,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-v2-worksheet-mount .hw-toolbar-bar,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-worksheet-mount .hw-toolbar-bar,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-v2-worksheet-mount .hw-toolbar-bar,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-worksheet-mount .hw-toolbar-bar {
        transform: none !important;
        zoom: calc(1 / var(--hw-focus-zoom, 1.6875)) !important;
      }
    }
    @media (min-width: 1400px) {
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-v2-worksheet-mount,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-worksheet-mount,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-v2-worksheet-mount,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-worksheet-mount {
        --hw-focus-zoom: 1.875;
        zoom: var(--hw-focus-zoom) !important;
      }
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-v2-worksheet-mount .hw-toolbar-bar,
      html.hw-hub-v5-toolbar-embed body.hw-hw-focus-mode #hw-worksheet-mount .hw-toolbar-bar,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-v2-worksheet-mount .hw-toolbar-bar,
      html.hw-ws-toolbar body.hw-hw-focus-mode #hw-worksheet-mount .hw-toolbar-bar,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-v2-worksheet-mount .hw-toolbar-bar,
      body.hw-hw-focus-mode:has(.hw-toolbar-bar:not([hidden])) #hw-worksheet-mount .hw-toolbar-bar {
        zoom: calc(1 / var(--hw-focus-zoom, 1.875)) !important;
      }
    }
  `,
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  document.getElementById("hw-v5-homework-zone").scrollTop = 0;
});

const trial = await page.evaluate(() => {
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const form = document.querySelector("form.hw-worksheet");
  const card =
    document.querySelector(".hw-listen-card") ||
    document.querySelector(".hw-worksheet__content");
  const tb = document.querySelector(".hw-toolbar-bar");
  const play = document.querySelector(".hw-audio-chrome__play");
  const tip = document.querySelector(".hw-recording-tip__trigger");
  const mr = mount.getBoundingClientRect();
  const fr = form.getBoundingClientRect();
  const cr = card?.getBoundingClientRect();
  const tr = tb?.getBoundingClientRect();
  const pr = play?.getBoundingClientRect();

  function hit(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight) return { offscreen: true, y: Math.round(y) };
    const t = document.elementFromPoint(x, y);
    return {
      y: Math.round(y),
      hitOk: !!(t && (t === el || el.contains(t))),
      top: t ? t.tagName + "." + String(t.className).slice(0, 40) : "NULL",
    };
  }

  return {
    mount: { w: Math.round(mr.width), h: Math.round(mr.height), t: Math.round(mr.top) },
    form: { w: Math.round(fr.width) },
    card: cr ? { w: Math.round(cr.width), l: Math.round(cr.left) } : null,
    tb: tr ? { w: Math.round(tr.width), h: Math.round(tr.height), b: Math.round(tr.bottom) } : null,
    play: pr ? { t: Math.round(pr.top), w: Math.round(pr.width) } : null,
    zoom: getComputedStyle(mount).zoom,
    transform: getComputedStyle(mount).transform,
    tbZoom: tb ? getComputedStyle(tb).zoom : null,
    hits: { play: hit(play), tip: hit(tip), tb: hit(tb) },
    overflows: mr.right > innerWidth + 2 || mr.left < -2,
  };
});

console.log(JSON.stringify({ baseline, trial }, null, 2));
await browser.close();
