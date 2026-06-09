/**
 * Injects gold kumo wallpaper into page sections (site-wide).
 */
(function () {
  "use strict";

  const GAME_MAIN_CLASSES = new Set([
    "game-main",
    "lhn-main",
    "ttt-main",
    "otsu-main",
    "obc-main",
  ]);

  const CLOUDS = [
    ["1", "w1"],
    ["3", "w2"],
    ["2", "w3"],
    ["4", "w4"],
    ["2", "w5"],
    ["1", "w6"],
    ["4", "w7"],
    ["3", "w8"],
  ];

  function createKumoWallpaper(mirror) {
    const wrap = document.createElement("div");
    wrap.className = "section-kumo section-kumo--wallpaper";
    if (mirror) wrap.classList.add("section-kumo--mirror");
    wrap.setAttribute("aria-hidden", "true");

    CLOUDS.forEach(([num, pos]) => {
      const img = document.createElement("img");
      img.className = "section-kumo__img section-kumo__" + pos;
      img.src = "/images/kumo-" + num + ".png";
      img.alt = "";
      img.decoding = "async";
      wrap.appendChild(img);
    });

    return wrap;
  }

  function hasKumo(el) {
    return Boolean(el.querySelector(":scope > .section-kumo"));
  }

  function insertKumo(section, mirror) {
    const kumo = createKumoWallpaper(mirror);
    const heroBg = section.querySelector(":scope > .hero__bg");
    if (heroBg) {
      heroBg.insertAdjacentElement("afterend", kumo);
      return;
    }
    section.insertBefore(kumo, section.firstChild);
  }

  function collectTargets() {
    const targets = [];
    const seen = new Set();

    function add(el) {
      if (!el || seen.has(el) || hasKumo(el)) return;
      seen.add(el);
      targets.push(el);
    }

    document.querySelectorAll("main").forEach((main) => {
      const isGameMain = [...main.classList].some((c) => GAME_MAIN_CLASSES.has(c));
      if (isGameMain) {
        add(main);
        return;
      }

      main.querySelectorAll(":scope > .hero, :scope > .section").forEach(add);
    });

    document.querySelectorAll("footer.site-footer").forEach((footer) => {
      footer.querySelector(":scope > .site-footer__pattern")?.remove();
      footer.querySelector(":scope > .site-footer__mark")?.remove();
      add(footer);
    });

    return targets;
  }

  function init() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    collectTargets().forEach((section, index) => {
      insertKumo(section, index % 2 === 1);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
