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

  const VARIANT_COUNT = 4;

  const SERVICES_EXTRA_CLOUDS = [
    ["2", "b1"],
    ["4", "b2"],
    ["1", "b3"],
    ["3", "b4"],
  ];

  const CONTACT_EXTRA_CLOUDS = [
    ["3", "c1"],
    ["1", "c2"],
    ["4", "c3"],
    ["2", "c4"],
  ];

  function cloudsForVariant(variant) {
    const shift = ((variant % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
    return CLOUDS.map(([_, pos], i) => {
      const [num] = CLOUDS[(i + shift * 2) % CLOUDS.length];
      return [num, pos];
    });
  }

  function variantForSection(section, index) {
    if (section.id === "about") return "about";
    if (section.id === "services") return "services";
    if (section.id === "contact") return "contact";
    return "v" + (((index % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT);
  }

  function shuffleForVariant(variantKey) {
    if (variantKey === "about") return 3;
    if (variantKey === "services") return 2;
    if (variantKey === "contact") return 1;
    return Number(variantKey.replace("v", "")) || 0;
  }

  function addCloud(wrap, num, pos) {
    const img = document.createElement("img");
    img.className = "section-kumo__img section-kumo__" + pos;
    img.src = "/images/kumo-" + num + ".png";
    img.alt = "";
    img.decoding = "async";
    wrap.appendChild(img);
  }

  function createKumoWallpaper(variantKey) {
    const wrap = document.createElement("div");
    wrap.className = "section-kumo section-kumo--wallpaper section-kumo--" + variantKey;
    wrap.setAttribute("aria-hidden", "true");

    cloudsForVariant(shuffleForVariant(variantKey)).forEach(([num, pos]) => {
      addCloud(wrap, num, pos);
    });

    if (variantKey === "services") {
      SERVICES_EXTRA_CLOUDS.forEach(([num, pos]) => addCloud(wrap, num, pos));
    }

    if (variantKey === "contact") {
      CONTACT_EXTRA_CLOUDS.forEach(([num, pos]) => addCloud(wrap, num, pos));
    }

    return wrap;
  }

  function hasKumo(el) {
    return Boolean(el.querySelector(":scope > .section-kumo"));
  }

  function insertKumo(section, variantKey) {
    const kumo = createKumoWallpaper(variantKey);
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
      insertKumo(section, variantForSection(section, index));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
