import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

async function run(zoom) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(
    "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
    { waitUntil: "networkidle", timeout: 60000 }
  );
  await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
  // Emulate browser zoom via CDP
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: zoom });
  await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => {
    const play = document.querySelector(".hw-audio-chrome__play");
    const tip = document.querySelector(".hw-recording-tip__trigger");
    const blank = document.querySelector(".hw-blank");
    const glass = document.querySelector('.hw-toolbar-bar__btn[data-tb-tool="glass"]');
    const exit = document.querySelector(".hw-focus-bar__exit");
    const zone = document.getElementById("hw-v5-homework-zone");

    function corners(el, name) {
      if (!el) return { name, missing: true };
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const pts = [
        ["c", r.left + r.width / 2, r.top + r.height / 2],
        ["tl", r.left + 4, r.top + 4],
        ["tr", r.right - 4, r.top + 4],
        ["bl", r.left + 4, r.bottom - 4],
        ["br", r.right - 4, r.bottom - 4],
      ];
      const hits = {};
      for (const [k, x, y] of pts) {
        const t = document.elementFromPoint(x, y);
        const ok = !!(t && (t === el || el.contains(t)));
        hits[k] = {
          ok,
          top: t ? `${t.tagName}.${String(t.className).slice(0, 35)}` : "NULL",
        };
      }
      // Real click test at center
      let clicked = false;
      const h = () => { clicked = true; };
      el.addEventListener("click", h, { once: true });
      el.click();
      return { name, hits, clicked, pe: getComputedStyle(el).pointerEvents };
    }

    return {
      zoneScroll: zone.scrollTop,
      play: corners(play, "play"),
      tip: corners(tip, "tip"),
      blank: corners(blank, "blank"),
      glass: corners(glass, "glass"),
      exit: corners(exit, "exit"),
    };
  });

  await context.close();
  return { zoom, result };
}

const results = [await run(1), await run(1.25)];
console.log(JSON.stringify(results, null, 2));
await browser.close();
