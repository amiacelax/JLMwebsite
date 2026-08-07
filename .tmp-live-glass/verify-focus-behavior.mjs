import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(
  "https://japanese-language-mentor.jplang.workers.dev/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=" +
    Date.now(),
  { waitUntil: "networkidle", timeout: 90000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 45000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1500);

// Click at VISUAL play center and at LAYOUT-approx Y (unscaled) to compare
const coords = await page.evaluate(() => {
  const play = document.querySelector(".hw-audio-chrome__play");
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const scale =
    parseFloat(getComputedStyle(mount).getPropertyValue("--hw-focus-zoom")) || 1;
  const pr = play.getBoundingClientRect();
  const mr = mount.getBoundingClientRect();
  // Unscaled center Y: mountTop + (visualOffsetFromMountTop / scale)
  const visualCx = pr.left + pr.width / 2;
  const visualCy = pr.top + pr.height / 2;
  const layoutCy = mr.top + (pr.top - mr.top) / scale + pr.height / scale / 2;
  const layoutCx = mr.left + mr.width / 2; // origin top center — x roughly centered
  // Better layout x: account for origin top center
  const layoutCx2 =
    mr.left +
    mr.width / 2 +
    (pr.left + pr.width / 2 - (mr.left + mr.width / 2)) / scale;

  function hit(x, y) {
    const t = document.elementFromPoint(x, y);
    return {
      x: Math.round(x),
      y: Math.round(y),
      top: t
        ? t.tagName + "." + String(t.className).slice(0, 50) + "#" + (t.id || "")
        : "NULL",
      isPlay: !!(t && (t === play || play.contains(t))),
    };
  }

  return {
    scale,
    visual: hit(visualCx, visualCy),
    layoutApprox: hit(layoutCx2, layoutCy),
    playArmedBefore: play.getAttribute("aria-pressed") || play.dataset.state || play.className,
  };
});

console.log("coords", JSON.stringify(coords, null, 2));

// Real mouse click at visual play
await page.mouse.click(coords.visual.x, coords.visual.y);
await page.waitForTimeout(300);
const afterVisual = await page.evaluate(() => {
  const play = document.querySelector(".hw-audio-chrome__play");
  const audio = document.querySelector(".hw-audio-player__el, audio");
  return {
    playClass: play?.className,
    ariaPressed: play?.getAttribute("aria-pressed"),
    audioPaused: audio?.paused,
    currentTime: audio?.currentTime,
  };
});
console.log("afterVisualClick", afterVisual);

// Click slide next and see if page changes
const slideBefore = await page.locator(".hw-worksheet__slide-counter").textContent();
const slideBox = await page.locator(".hw-worksheet__slide-btn").nth(1).boundingBox();
if (slideBox) {
  await page.mouse.click(slideBox.x + slideBox.width / 2, slideBox.y + slideBox.height / 2);
  await page.waitForTimeout(400);
}
const slideAfter = await page.locator(".hw-worksheet__slide-counter").textContent();
console.log("slide", { slideBefore, slideAfter });

// Click Exit
const exitBox = await page.locator(".hw-focus-bar__exit").boundingBox();
if (exitBox) {
  await page.mouse.click(exitBox.x + exitBox.width / 2, exitBox.y + exitBox.height / 2);
  await page.waitForTimeout(400);
}
const stillFocus = await page.evaluate(() =>
  document.body.classList.contains("hw-hw-focus-mode")
);
console.log("exitWorked", !stillFocus);

// Now reproduce FAILURE: inject overlay that matches common bug OR remove flow-root and click at visual without scroll
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1000);

// Force-break: set card to block and remove margin clearance — then sample hits WITHOUT scrolling at play visual
const broken = await page.evaluate(() => {
  const card = document.getElementById("hw-v5-worksheet-card");
  const mount = document.getElementById("hw-v2-worksheet-mount");
  card.style.setProperty("display", "block", "important");
  mount.style.setProperty("margin-bottom", "0", "important");
  const zone = document.getElementById("hw-v5-homework-zone");
  zone.scrollTop = 0;

  const play = document.querySelector(".hw-audio-chrome__play");
  const tip = document.querySelector(".hw-recording-tip__trigger");
  const blank = document.querySelector(".hw-blank");
  const glass = document.querySelector('[data-tb-tool="glass"]');

  function probe(el, name) {
    if (!el) return { name, missing: true };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const inView = y >= 0 && y <= innerHeight;
    const top = inView ? document.elementFromPoint(x, y) : null;
    return {
      name,
      inView,
      y: Math.round(y),
      hitOk: !!(top && (top === el || el.contains(top))),
      top: top
        ? top.tagName + "." + String(top.className).slice(0, 40)
        : inView
          ? "NULL"
          : "OFFSCREEN",
      zoneSH: zone.scrollHeight,
      zoneCH: zone.clientHeight,
      cardH: Math.round(card.getBoundingClientRect().height),
      mountH: Math.round(mount.getBoundingClientRect().height),
    };
  }

  return {
    play: probe(play, "play"),
    tip: probe(tip, "tip"),
    blank: probe(blank, "blank"),
    glass: probe(glass, "glass"),
  };
});
console.log("brokenState", JSON.stringify(broken, null, 2));

await browser.close();
