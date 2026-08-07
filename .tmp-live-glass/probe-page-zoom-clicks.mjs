/**
 * Test whether browser page-zoom (or deviceScaleFactor) breaks Focus CSS-zoom clicks.
 */
import { chromium } from "playwright";

async function run(label, opts) {
  const browser = await chromium.launch({
    headless: true,
    channel: opts.channel,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: opts.deviceScaleFactor || 1,
  });
  const page = await context.newPage();
  const url =
    "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=" +
    Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });

  if (opts.chromeZoom) {
    // Emulate Chrome UI zoom via CDP
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setPageScaleFactor", {
      pageScaleFactor: opts.chromeZoom,
    });
  }

  await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
  await page.waitForTimeout(1000);

  const probe = await page.evaluate(() => {
    const play = document.querySelector(".hw-audio-chrome__play");
    const r = play.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    window.__clk = null;
    play.addEventListener("click", () => (window.__clk = "play"), { once: true });
    return {
      x,
      y,
      rect: { t: r.top, l: r.left, w: r.width, h: r.height },
      top: top && top.tagName + "." + String(top.className).slice(0, 40),
      hitOk: !!(top && (top === play || play.contains(top))),
      zoom: getComputedStyle(document.getElementById("hw-v2-worksheet-mount")).zoom,
      dpr: window.devicePixelRatio,
      inner: { w: innerWidth, h: innerHeight },
      vv: window.visualViewport
        ? {
            scale: visualViewport.scale,
            w: visualViewport.width,
            h: visualViewport.height,
            offsetTop: visualViewport.offsetTop,
          }
        : null,
    };
  });

  await page.mouse.click(probe.x, probe.y);
  await page.waitForTimeout(200);
  const got = await page.evaluate(() => ({
    clk: window.__clk,
    label: document.querySelector(".hw-audio-chrome__play")?.getAttribute("aria-label"),
  }));

  // Also try clicking slightly offset (user aim)
  const offsets = [
    [0, 0],
    [10, 10],
    [-10, -10],
    [0, -20],
  ];
  const offsetHits = [];
  for (const [dx, dy] of offsets) {
    const h = await page.evaluate(
      ([dx, dy]) => {
        const play = document.querySelector(".hw-audio-chrome__play");
        const r = play.getBoundingClientRect();
        const x = r.left + r.width / 2 + dx;
        const y = r.top + r.height / 2 + dy;
        const top = document.elementFromPoint(x, y);
        return {
          dx,
          dy,
          top: top && top.tagName + "." + String(top.className).slice(0, 35),
          ok: !!(top && (top === play || play.contains(top))),
        };
      },
      [dx, dy]
    );
    offsetHits.push(h);
  }

  await browser.close();
  return { label, probe, got, offsetHits };
}

const results = [];
results.push(await run("default", {}));
results.push(await run("dpr2", { deviceScaleFactor: 2 }));
results.push(await run("pageScale1.25", { chromeZoom: 1.25 }));
results.push(await run("pageScale1.5", { chromeZoom: 1.5 }));

console.log(JSON.stringify(results, null, 2));
