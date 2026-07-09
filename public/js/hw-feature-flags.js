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

  /** Magnifying glass (虫眼鏡): enabled for all students on homework worksheets. */
  function magnifyingGlass() {
    return true;
  }

  /** Homework comment cloud — note bubbles on worksheet text for students. */
  function homeworkComments() {
    return true;
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

  global.HwFeatureFlags = {
    isLocalDev,
    magnifyingGlass,
    homeworkComments,
    hubV5,
    hubV5Demo,
  };
})(window);
