import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.waitForTimeout(400);

// Capture clickability BEFORE focus
const before = await page.evaluate(() => {
  const play = document.querySelector(".hw-audio-chrome__play");
  const r = play.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    hit: hit?.className || hit?.tagName,
    pe: getComputedStyle(play).pointerEvents,
  };
});

await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(900);

const clickTests = await page.evaluate(async () => {
  const results = {};

  function tryClick(sel, name) {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) {
      results[name] = { ok: false, reason: "missing" };
      return;
    }
    const zone =
      document.getElementById("hw-v5-homework-zone") ||
      document.getElementById("hw-hub-v4-homework");
    // Scroll element into view within zone
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const covered =
      top && top !== el && !el.contains(top) && !top.contains?.(el);
    let clicked = false;
    const onClick = () => {
      clicked = true;
    };
    el.addEventListener("click", onClick, { once: true });
    // Dispatch at element
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window })
    );
    // Also try pointer path via elementFromPoint
    if (top) {
      top.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window })
      );
    }
    results[name] = {
      ok: clicked || (top && (top === el || el.contains(top))),
      clicked,
      top: top
        ? `${top.tagName}.${(top.className || "").toString().slice(0, 60)}`
        : null,
      covered,
      rect: { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
      pe: getComputedStyle(el).pointerEvents,
      zoneScroll: zone?.scrollTop,
    };
  }

  tryClick(".hw-audio-chrome__play", "play");
  tryClick(".hw-focus-bar__exit", "exit");
  tryClick('.hw-toolbar-bar__btn[data-tb-tool="glass"]', "glass");
  tryClick(".hw-blank", "blank");
  // tip-ish
  tryClick(
    'button[aria-label*="Tip"], button[title*="Tip"], .hw-hint-btn, .hw-item-tip, [data-hw-hint]',
    "tip"
  );

  // Find any button labeled Tip
  const tipEl = [...document.querySelectorAll("button")].find((b) =>
    /tip/i.test(b.textContent || b.getAttribute("aria-label") || "")
  );
  if (tipEl) tryClick(tipEl, "tipText");

  // Sample many points across the visual sheet for unexpected overlays
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const mr = mount.getBoundingClientRect();
  const samples = [];
  for (let yi = 0.15; yi <= 0.85; yi += 0.14) {
    for (let xi of [0.35, 0.5, 0.65]) {
      const x = mr.left + mr.width * xi;
      const y = mr.top + mr.height * yi;
      if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) continue;
      const el = document.elementFromPoint(x, y);
      samples.push({
        x: Math.round(x),
        y: Math.round(y),
        el: el
          ? `${el.tagName}.${String(el.className || "")
              .slice(0, 50)
              .replace(/\s+/g, ".")}`
          : "NULL",
        pe: el ? getComputedStyle(el).pointerEvents : null,
      });
    }
  }
  results.samples = samples;

  // Check for full-viewport covering elements
  const covers = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (cs.pointerEvents === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) continue;
    if (r.top > 40 || r.left > 40) continue;
    covers.push({
      el: `${el.tagName}#${el.id}.${String(el.className || "").slice(0, 80)}`,
      pe: cs.pointerEvents,
      zi: cs.zIndex,
      pos: cs.position,
      wh: `${Math.round(r.width)}x${Math.round(r.height)}`,
    });
  }
  results.covers = covers.slice(0, 20);

  return results;
});

// Real Playwright clicks (not synthetic)
let playClicked = false;
page.on("console", (msg) => {
  if (msg.text().includes("PLAY-CLICKED")) playClicked = true;
});
await page.evaluate(() => {
  const play = document.querySelector(".hw-audio-chrome__play");
  play?.addEventListener("click", () => console.log("PLAY-CLICKED"), { once: true });
});

const playBox = await page.locator(".hw-audio-chrome__play").first().boundingBox();
let pwClick = null;
if (playBox) {
  try {
    await page.mouse.click(playBox.x + playBox.width / 2, playBox.y + playBox.height / 2);
    await page.waitForTimeout(200);
    pwClick = { attempted: true, playClicked, box: playBox };
  } catch (e) {
    pwClick = { attempted: true, error: String(e), box: playBox };
  }
}

console.log(JSON.stringify({ before, clickTests, pwClick, playClicked }, null, 2));
await browser.close();
