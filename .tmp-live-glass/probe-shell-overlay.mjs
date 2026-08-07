import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(
  "http://127.0.0.1:8787/homework/hub-v5-preview.html?status=in_progress&toolbar=1",
  { waitUntil: "networkidle", timeout: 60000 }
);
await page.waitForSelector("form.hw-worksheet", { timeout: 30000 });
await page.locator('[data-tb-tool="focus"]').first().click({ force: true });
await page.waitForTimeout(900);

const out = await page.evaluate(() => {
  function walk(el, depth = 0) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const pe = cs.pointerEvents;
    const interesting =
      pe !== "none" &&
      r.width > 100 &&
      r.height > 100 &&
      cs.display !== "none" &&
      cs.visibility !== "hidden";
    const node = {
      depth,
      tag: el.tagName,
      cls: String(el.className || "").slice(0, 50),
      pe,
      zi: cs.zIndex,
      pos: cs.position,
      size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      top: Math.round(r.top),
      interesting,
    };
    const kids = [...el.children].flatMap((c) => walk(c, depth + 1));
    return interesting || depth === 0 ? [node, ...kids] : kids;
  }

  const shells = [...document.querySelectorAll(".hw-hc-shell, .hw-mg-shell, .hw-focus-bar")];
  const shellTrees = shells.map((s) => ({
    root: String(s.className).slice(0, 40),
    pe: getComputedStyle(s).pointerEvents,
    size: (() => {
      const r = s.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    })(),
    interestingDescendants: walk(s).filter((n) => n.interesting),
    allAutoPe: [...s.querySelectorAll("*")]
      .filter((el) => getComputedStyle(el).pointerEvents !== "none")
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName}.${String(el.className).slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)} pe=${getComputedStyle(el).pointerEvents}`;
      })
      .slice(0, 30),
  }));

  // Check card containing block vs mount visual
  const card = document.getElementById("hw-v5-worksheet-card");
  const mount = document.getElementById("hw-v2-worksheet-mount");
  const cr = card.getBoundingClientRect();
  const mr = mount.getBoundingClientRect();

  // Force pe:auto on shells temporarily to see if THAT would block (sanity)
  const blockedIfShellAuto = [];
  for (const s of document.querySelectorAll(".hw-hc-shell, .hw-mg-shell")) {
    const prev = s.style.pointerEvents;
    s.style.pointerEvents = "auto";
    const play = document.querySelector(".hw-audio-chrome__play");
    play.scrollIntoView({ block: "center" });
    const r = play.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    blockedIfShellAuto.push({
      shell: s.className,
      top: top ? `${top.tagName}.${String(top.className).slice(0, 40)}` : null,
      blocked: top === s || s.contains(top),
    });
    s.style.pointerEvents = prev;
  }

  return {
    card: { w: Math.round(cr.width), h: Math.round(cr.height), t: Math.round(cr.top) },
    mount: { w: Math.round(mr.width), h: Math.round(mr.height), t: Math.round(mr.top), offsetH: mount.offsetHeight },
    shellTrees,
    blockedIfShellAuto,
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
