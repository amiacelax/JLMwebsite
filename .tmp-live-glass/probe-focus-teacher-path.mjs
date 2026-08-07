/**
 * Focus click repro: direct preview + student platform + teacher iframe forced src.
 */
import { chromium } from "playwright";
import fs from "fs";

const LIVE =
  process.env.HW_BASE ||
  "https://japanese-language-mentor.jplang.workers.dev";
const CB = Date.now();
const OUT = ".tmp-live-glass/probe-focus-teacher-path-out.json";

async function diagnoseFrame(frame, label) {
  await frame.waitForSelector("form.hw-worksheet", { timeout: 60000 });

  const focusTb = frame.locator('[data-tb-tool="focus"]').first();
  const focusBtn = frame.locator("[data-hw-focus]").first();
  if ((await focusTb.count()) > 0) {
    await focusTb.click({ force: true });
  } else if ((await focusBtn.count()) > 0) {
    await focusBtn.click({ force: true });
  } else {
    return { label, error: "no-focus-control" };
  }
  await frame.waitForTimeout(1200);

  const page = frame.page();

  const diag = await frame.evaluate(() => {
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    const zone =
      document.getElementById("hw-v5-homework-zone") ||
      document.getElementById("hw-hub-v4-homework");
    const play = document.querySelector(".hw-audio-chrome__play");
    const tip = document.querySelector(".hw-recording-tip__trigger");
    const blank = document.querySelector(".hw-blank");
    const glass = document.querySelector('[data-tb-tool="glass"]');
    const exit = document.querySelector(".hw-focus-bar__exit");

    function d(el) {
      if (!el) return null;
      const id = el.id ? `#${el.id}` : "";
      const cls =
        el.className && typeof el.className === "string"
          ? "." + el.className.trim().split(/\s+/).slice(0, 4).join(".")
          : "";
      const cs = getComputedStyle(el);
      return `${el.tagName.toLowerCase()}${id}${cls}[pe=${cs.pointerEvents},z=${cs.zIndex},pos=${cs.position},zoom=${cs.zoom}]`;
    }

    function stackAt(x, y) {
      return {
        x: Math.round(x),
        y: Math.round(y),
        top: d(document.elementFromPoint(x, y)),
        stack: document.elementsFromPoint(x, y).slice(0, 14).map(d),
      };
    }

    const targets = { play, tip, blank, glass, exit };
    const hits = {};
    for (const [k, el] of Object.entries(targets)) {
      if (!el) {
        hits[k] = "MISSING";
        continue;
      }
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      hits[k] = {
        rect: {
          t: Math.round(r.top),
          l: Math.round(r.left),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
        pe: getComputedStyle(el).pointerEvents,
        ...stackAt(cx, cy),
        targetIsTop: !!(top && (top === el || el.contains(top))),
        expected: d(el),
      };
    }

    const overlays = [...document.querySelectorAll("*")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" && cs.position !== "absolute") return false;
        if (cs.pointerEvents === "none") return false;
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width >= innerWidth * 0.8 && r.height >= innerHeight * 0.45;
      })
      .slice(0, 12)
      .map(d);

    // Ancestor pointer-events for play
    const ancestors = [];
    let n = play;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      ancestors.push({
        d: d(n),
        pe: cs.pointerEvents,
        overflow: `${cs.overflowX}/${cs.overflowY}`,
        zoom: cs.zoom,
        transform: cs.transform,
      });
      n = n.parentElement;
    }

    return {
      url: location.href,
      focus: document.body.classList.contains("hw-hw-focus-mode"),
      htmlClasses: document.documentElement.className,
      bodyClasses: document.body.className,
      fullscreen: !!document.fullscreenElement,
      zoom: mount ? getComputedStyle(mount).zoom : null,
      transform: mount ? getComputedStyle(mount).transform : null,
      zoneOverflow: zone ? `${getComputedStyle(zone).overflowX}/${getComputedStyle(zone).overflowY}` : null,
      zonePe: zone ? getComputedStyle(zone).pointerEvents : null,
      zoneDisplay: zone ? getComputedStyle(zone).display : null,
      zoneZ: zone ? getComputedStyle(zone).zIndex : null,
      overlays,
      hits,
      playAncestors: ancestors.slice(0, 16),
    };
  });

  const frameEl = await frame.frameElement().catch(() => null);
  let iframeOffset = { x: 0, y: 0 };
  if (frameEl) {
    const box = await frameEl.boundingBox();
    if (box) iframeOffset = { x: box.x, y: box.y };
  }

  async function realClick(sel, name) {
    const loc = frame.locator(sel).first();
    if (!(await loc.count())) return { name, missing: true };

    await frame.evaluate((s) => {
      const el = document.querySelector(s);
      const zone = document.getElementById("hw-v5-homework-zone");
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (zone && (r.top < 50 || r.bottom > innerHeight - 30)) {
        zone.scrollTop += r.top + r.height / 2 - innerHeight / 2;
      }
    }, sel);
    await frame.waitForTimeout(250);

    const info = await frame.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      window.__clk = null;
      el.addEventListener("click", () => (window.__clk = s), { once: true });
      return {
        x,
        y,
        top: top
          ? `${top.tagName}.${String(top.className || "").slice(0, 40)}#${top.id || ""}`
          : null,
        hitOk: !!(top && (top === el || el.contains(top))),
        stack: document.elementsFromPoint(x, y).slice(0, 10).map(
          (e) =>
            `${e.tagName}.${String(e.className || "").slice(0, 28)}#${e.id || ""}`
        ),
      };
    }, sel);

    if (!info) return { name, missing: true };

    const beforeState = await frame.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      if (s.includes("play")) {
        const audio = el
          .closest(".hw-listen-card, .hw-audio-chrome, .hw-audio-player")
          ?.querySelector("audio");
        return {
          ariaPressed: el.getAttribute("aria-pressed"),
          label: el.getAttribute("aria-label"),
          paused: audio ? audio.paused : null,
          className: String(el.className),
        };
      }
      if (s.includes("blank")) {
        return { active: document.activeElement === el, value: el.value };
      }
      if (s.includes("glass") || s.includes("tip") || s.includes("focus")) {
        return {
          pressed: el.getAttribute("aria-pressed"),
          tipOpen: !!document.querySelector(".hw-recording-tip.is-open, .hw-recording-tip[open]"),
        };
      }
      if (s.includes("exit")) {
        return { focus: document.body.classList.contains("hw-hw-focus-mode") };
      }
      return {};
    }, sel);

    await page.mouse.click(iframeOffset.x + info.x, iframeOffset.y + info.y);
    await frame.waitForTimeout(250);

    const after = await frame.evaluate((s) => {
      const el = document.querySelector(s);
      const got = window.__clk;
      let state = {};
      if (s.includes("play")) {
        const audio = el
          ?.closest(".hw-listen-card, .hw-audio-chrome, .hw-audio-player")
          ?.querySelector("audio");
        state = {
          ariaPressed: el?.getAttribute("aria-pressed"),
          label: el?.getAttribute("aria-label"),
          paused: audio ? audio.paused : null,
          className: String(el?.className || ""),
        };
      } else if (s.includes("blank")) {
        state = { active: document.activeElement === el, value: el?.value };
      } else if (s.includes("glass") || s.includes("tip") || s.includes("focus")) {
        state = {
          pressed: el?.getAttribute("aria-pressed"),
          tipOpen: !!document.querySelector(
            ".hw-recording-tip.is-open, .hw-recording-tip[open]"
          ),
          glassOut: document.documentElement.classList.contains("hw-tb-glass-out"),
        };
      } else if (s.includes("exit")) {
        state = { focus: document.body.classList.contains("hw-hw-focus-mode") };
      }
      return { got, state };
    }, sel);

    return {
      name,
      sel,
      info,
      beforeState,
      after,
      clickListenerFired: after.got === sel,
      behaviorChanged:
        JSON.stringify(beforeState) !== JSON.stringify(after.state),
    };
  }

  const clicks = {
    play: await realClick(".hw-audio-chrome__play", "play"),
    tip: await realClick(".hw-recording-tip__trigger", "tip"),
    blank: await realClick(".hw-blank", "blank"),
    glass: await realClick('[data-tb-tool="glass"]', "glass"),
    exit: await realClick(".hw-focus-bar__exit", "exit"),
  };

  if (clicks.blank?.clickListenerFired) {
    await page.keyboard.type("probe");
    clicks.blankVal = await frame
      .locator(".hw-blank")
      .first()
      .inputValue()
      .catch(() => null);
  }

  return { label, diag, clicks, iframeOffset };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const out = { cb: CB, live: LIVE };

try {
  // 1) Direct preview
  {
    const page = await context.newPage();
    const url = `${LIVE}/homework/hub-v5-preview.html?status=in_progress&toolbar=1&cb=${CB}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    out.directPreview = await diagnoseFrame(page.mainFrame(), "direct-preview");
    await page.close();
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  }

  // 2) Teacher platform with forced toolbar iframe (same DOM as Teacher Hub Toolbar tab)
  {
    const page = await context.newPage();
    await page.goto(`${LIVE}/homework/platform.html?cb=${CB}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.evaluate(() => {
      const session = {
        username: "jlm",
        displayName: "JLM",
        role: "teacher",
        loggedInAt: Date.now(),
      };
      sessionStorage.setItem("jlm-hw-session", JSON.stringify(session));
      localStorage.setItem("jlm-hw-session", JSON.stringify(session));
      sessionStorage.removeItem("jlm-hw-view-as");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Force-show toolbar panel + load iframe (bypass hidden tab UI)
    await page.evaluate((cb) => {
      const panel = document.getElementById("hw-toolbar-playtest-panel");
      const embed = document.getElementById("hw-teacher-hubv2-embed");
      if (panel) panel.hidden = false;
      if (embed) embed.hidden = true;
      const el = document.getElementById("hw-toolbar-playtest-iframe");
      if (el) {
        el.src =
          "/homework/hub-v5-preview.html?toolbar=1&status=in_progress&account=hw_basic&assignment=sheet-u1vevjge&cb=" +
          cb;
      }
    }, CB);
    await page.waitForTimeout(2500);

    const frame = page.frames().find((f) => f.url().includes("hub-v5-preview"));
    if (!frame) {
      out.teacherToolbar = {
        label: "teacher-toolbar-iframe",
        error: "iframe-not-found",
        frames: page.frames().map((f) => f.url()),
      };
    } else {
      out.teacherToolbar = await diagnoseFrame(frame, "teacher-toolbar-iframe");
    }
    await page.close();
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  }

  // 3) Student platform
  {
    const page = await context.newPage();
    await page.goto(`${LIVE}/homework/platform.html?hubv5=1&cb=${CB}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.evaluate(() => {
      const session = {
        username: "benm",
        displayName: "Ben M",
        role: "student",
        accountLabel: "current_student",
        tier: "pending",
        loggedInAt: Date.now(),
      };
      sessionStorage.setItem("jlm-hw-session", JSON.stringify(session));
      localStorage.setItem("jlm-hw-session", JSON.stringify(session));
      sessionStorage.removeItem("jlm-hw-view-as");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);

    const hasForm = await page.locator("form.hw-worksheet").count();
    if (!hasForm) {
      out.studentPlatform = {
        label: "student-platform",
        error: "no-worksheet",
        url: page.url(),
        htmlClasses: await page.evaluate(() => document.documentElement.className),
        text: (await page.locator("body").innerText().catch(() => "")).slice(0, 800),
      };
    } else {
      out.studentPlatform = await diagnoseFrame(page.mainFrame(), "student-platform");
    }
    await page.close();
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  }
} catch (err) {
  out.error = String(err && err.stack ? err.stack : err);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
}

console.log(JSON.stringify(out, null, 2));
await browser.close();
