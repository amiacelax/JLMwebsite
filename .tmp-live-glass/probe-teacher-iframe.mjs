import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.HW_BASE || "http://127.0.0.1:8787";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Inject session BEFORE any page scripts run
await context.addInitScript(() => {
  const session = {
    username: "jlm",
    displayName: "JLM",
    role: "teacher",
    loggedInAt: Date.now(),
  };
  try {
    sessionStorage.setItem("jlm-hw-session", JSON.stringify(session));
    localStorage.setItem("jlm-hw-session", JSON.stringify(session));
  } catch {}
});

const page = await context.newPage();
await page.goto(`${BASE}/homework/platform.html?cb=${Date.now()}`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2000);

const shell = await page.evaluate(() => ({
  url: location.href,
  body: document.body.className,
  hasToolbarPanel: !!document.getElementById("hw-toolbar-playtest-panel"),
  hasIframe: !!document.getElementById("hw-toolbar-playtest-iframe"),
  hasHubVersions: !!document.getElementById("hw-hub-version-tab-toolbar"),
  v6: document.body.classList.contains("hw-hub-v6-primary"),
  session: sessionStorage.getItem("jlm-hw-session")?.slice(0, 80),
}));

if (shell.url.includes("/homework?") || shell.url.endsWith("/homework")) {
  // Still on login — try form login
  await page.fill("#hw-username", "jlm");
  await page.fill("#hw-password", "demo");
  await page.click("#hw-login-form button[type=submit]");
  await page.waitForTimeout(1500);
  if (page.url().includes("homework.html") || page.url().match(/\/homework\/?(\?|$)/)) {
    const go = page.locator("#hw-go-platform");
    if (await go.count()) await go.click();
    await page.waitForTimeout(1500);
  }
  await page.goto(`${BASE}/homework/platform.html?cb=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);
}

const shell2 = await page.evaluate(() => ({
  url: location.href,
  body: document.body.className,
  hasToolbarPanel: !!document.getElementById("hw-toolbar-playtest-panel"),
  hasIframe: !!document.getElementById("hw-toolbar-playtest-iframe"),
  text: document.body.innerText.slice(0, 400),
}));

await page.evaluate((cb) => {
  const panel = document.getElementById("hw-toolbar-playtest-panel");
  const embed = document.getElementById("hw-teacher-hubv2-embed");
  const classic = document.getElementById("hw-teacher-classic");
  if (classic) classic.hidden = false;
  // Hub Preview panel may be hidden under v6
  const hubv2 = document.getElementById("hw-teacher-hubv2");
  if (hubv2) hubv2.hidden = false;
  if (panel) {
    panel.hidden = false;
    panel.style.cssText = "display:flex !important; visibility:visible !important;";
  }
  if (embed) embed.hidden = true;
  let n = panel;
  while (n && n !== document.body) {
    n.hidden = false;
    n = n.parentElement;
  }
  document.body.classList.remove("hw-hub-v6-primary"); // reveal classic embeds if needed
  const el = document.getElementById("hw-toolbar-playtest-iframe");
  if (el) {
    el.style.cssText = "display:block;width:100%;height:80vh;min-height:700px;";
    el.src =
      "/homework/hub-v5-preview.html?toolbar=1&status=in_progress&account=hw_basic&assignment=sheet-u1vevjge&cb=" +
      cb;
  }
}, Date.now());

await page.waitForTimeout(4000);
const frames = page.frames().map((f) => f.url());
const frame = page.frames().find((f) => f.url().includes("hub-v5-preview"));

if (!frame) {
  const out = { base: BASE, shell, shell2, frames, error: "no-iframe" };
  fs.writeFileSync(".tmp-live-glass/probe-teacher-iframe-out.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

await frame.waitForSelector("form.hw-worksheet", { timeout: 60000 });
await frame.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(1200);

const frameEl = await frame.frameElement();
const fbox = await frameEl.boundingBox();

async function clickInFrame(sel) {
  const prep = await frame.evaluate((s) => {
    const el = document.querySelector(s);
    const zone = document.getElementById("hw-v5-homework-zone");
    if (!el) return null;
    const r0 = el.getBoundingClientRect();
    if (zone && (r0.top < 40 || r0.bottom > innerHeight - 20)) {
      zone.scrollTop += r0.top + r0.height / 2 - innerHeight / 2;
    }
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    window.__clk = null;
    el.addEventListener("click", () => (window.__clk = s), { once: true });
    return {
      x,
      y,
      hitOk: !!(top && (top === el || el.contains(top))),
      top: top && `${top.tagName}.${String(top.className).slice(0, 40)}`,
      stack: document
        .elementsFromPoint(x, y)
        .slice(0, 10)
        .map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}#${e.id || ""}`),
    };
  }, sel);
  if (!prep) return { sel, missing: true };
  await page.mouse.click(fbox.x + prep.x, fbox.y + prep.y);
  await page.waitForTimeout(250);
  const after = await frame.evaluate((s) => {
    const el = document.querySelector(s);
    let state = {};
    if (s.includes("play")) state = { label: el?.getAttribute("aria-label") };
    else if (s.includes("blank")) state = { active: document.activeElement === el };
    else if (s.includes("exit"))
      state = { focus: document.body.classList.contains("hw-hw-focus-mode") };
    else if (s.includes("glass"))
      state = {
        pressed: el?.getAttribute("aria-pressed"),
        glassOut: document.documentElement.classList.contains("hw-tb-glass-out"),
      };
    return { got: window.__clk, state };
  }, sel);
  return { sel, prep, after, clickOk: after.got === sel };
}

const clicks = {
  play: await clickInFrame(".hw-audio-chrome__play"),
  tip: await clickInFrame(".hw-recording-tip__trigger"),
  blank: await clickInFrame(".hw-blank"),
  glass: await clickInFrame('[data-tb-tool="glass"]'),
  exit: await clickInFrame(".hw-focus-bar__exit"),
};

if (clicks.blank?.clickOk) {
  await page.keyboard.type("probe");
  clicks.blankVal = await frame.locator(".hw-blank").first().inputValue();
}

const diag = await frame.evaluate(() => {
  const play = document.querySelector(".hw-audio-chrome__play");
  const r = play?.getBoundingClientRect();
  return {
    focus: document.body.classList.contains("hw-hw-focus-mode"),
    zoom: getComputedStyle(
      document.getElementById("hw-v2-worksheet-mount") || document.body
    ).zoom,
    html: document.documentElement.className,
    fullscreen: !!document.fullscreenElement,
    playStack: r
      ? document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).slice(0, 12).map((e) => {
          const cs = getComputedStyle(e);
          return `${e.tagName}#${e.id}.${String(e.className).slice(0, 24)}[pe=${cs.pointerEvents},z=${cs.zIndex}]`;
        })
      : null,
  };
});

const out = { base: BASE, shell, shell2, fbox, diag, clicks };
fs.writeFileSync(".tmp-live-glass/probe-teacher-iframe-out.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
