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

  global.HwFeatureFlags = {
    isLocalDev,
    magnifyingGlass,
    homeworkComments,
  };
})(window);
