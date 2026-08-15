/**
 * Hostname-based feature gates. `npm run deploy` ships all of public/ — use flags
 * to keep WIP features off production without deleting source files.
 */
(function (global) {
  /** Production hosts where WIP features must stay disabled unless overridden. */
  const PRODUCTION_HOSTS = new Set(["japanese-language-mentor.jplang.workers.dev"]);

  function isLocalDev() {
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]") {
      return true;
    }
    if (host.endsWith(".local")) return true;
    // Wrangler `npm run dev` default port
    if (location.port === "8787") return true;
    return false;
  }

  function devOverride(key) {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  /**
   * Magnifying glass (虫眼鏡): on for all hosts (local + production).
   * Live student toolbar pops Glass the same way as local Toolbar playtest.
   * Force off: localStorage hw-mg-dev=0 (not used by default).
   */
  function magnifyingGlass() {
    try {
      if (localStorage.getItem("hw-mg-dev") === "0") return false;
    } catch {
      /* ignore */
    }
    return true;
  }

  /** Homework comment cloud — note bubbles on worksheet text for students. */
  function homeworkComments() {
    return true;
  }

  /**
   * Magnet (“reset tool positions”) on worksheet cards.
   * Off everywhere for now — code stays in hw-worksheet-tools-layout.js.
   * Re-enable: localStorage hw-tool-magnet=1 (or ?toolMagnet=1).
   */
  function toolMagnet() {
    try {
      if (localStorage.getItem("hw-tool-magnet") === "0") return false;
      if (localStorage.getItem("hw-tool-magnet") === "1") return true;
    } catch {
      /* ignore */
    }
    try {
      if (new URLSearchParams(location.search).get("toolMagnet") === "0") return false;
      if (new URLSearchParams(location.search).get("toolMagnet") === "1") return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  /**
   * Homework Hub v5 student layout (tabs, post-submit sellup, review zone).
   * Default on everywhere; force off with localStorage hw-hubv5-dev=0.
   * Demo simulate bar stays local-only (see hw-hub-v5-live.js).
   */
  function hubV5() {
    try {
      if (localStorage.getItem("hw-hubv5-dev") === "0") return false;
    } catch {
      /* ignore */
    }
    try {
      if (new URLSearchParams(location.search).get("hubv5") === "0") return false;
    } catch {
      /* ignore */
    }
    return true;
  }

  /**
   * Teacher Hub v6 — primary teacher chrome when on.
   * Default on; force off with localStorage hw-hubv6-dev=0 or ?hubv6=0
   * (restores classic teacher tab strip).
   */
  function hubV6() {
    try {
      if (localStorage.getItem("hw-hubv6-dev") === "0") return false;
      if (localStorage.getItem("hw-hubv6-dev") === "1") return true;
    } catch {
      /* ignore */
    }
    try {
      if (new URLSearchParams(location.search).get("hubv6") === "0") return false;
      if (new URLSearchParams(location.search).get("hubv6") === "1") return true;
    } catch {
      /* ignore */
    }
    return true;
  }

  /** Hub v5 simulate/account bar — explicit opt-in only (never auto on localhost). */
  function hubV5Demo() {
    try {
      if (new URLSearchParams(location.search).get("hubv5demo") === "0") return false;
      if (localStorage.getItem("hw-hubv5-demo") === "0") return false;
    } catch {
      /* ignore */
    }
    if (devOverride("hw-hubv5-demo")) return true;
    try {
      if (new URLSearchParams(location.search).get("hubv5demo") === "1") return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  if (hubV5()) {
    global.__JLM_HUB_V5 = true;
  }
  try {
    if (new URLSearchParams(location.search).get("hubv5") === "1") {
      global.__JLM_HUB_V5 = true;
    }
  } catch {
    /* ignore */
  }

  /**
   * Focus layout/scale without browser fullscreen — so Cursor design mode
   * (and similar) still work. Enable: ?designFocus=1 or localStorage hw-design-focus=1
   */
  function designFocus() {
    try {
      if (new URLSearchParams(location.search).get("designFocus") === "1") return true;
    } catch {
      /* ignore */
    }
    return devOverride("hw-design-focus");
  }

  /**
   * Site Games + Courses pages / hub Games tab.
   * Backburner — off everywhere. Re-enable: localStorage hw-games-courses=1
   * (or ?gamesCourses=1).
   */
  function gamesAndCourses() {
    try {
      if (localStorage.getItem("hw-games-courses") === "0") return false;
      if (localStorage.getItem("hw-games-courses") === "1") return true;
    } catch {
      /* ignore */
    }
    try {
      if (new URLSearchParams(location.search).get("gamesCourses") === "0") return false;
      if (new URLSearchParams(location.search).get("gamesCourses") === "1") return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  global.HwFeatureFlags = {
    isLocalDev,
    magnifyingGlass,
    homeworkComments,
    toolMagnet,
    hubV5,
    hubV5Demo,
    hubV6,
    designFocus,
    gamesAndCourses,
  };
})(window);
