/**
 * Hostname-based feature gates. `npm run deploy` ships all of public/ — use flags
 * to keep WIP features off production without deleting source files.
 */
(function (global) {
  /** Production hosts where WIP features must stay disabled unless overridden. */
  const PRODUCTION_HOSTS = new Set(["japanese-language-mentor.jplang.workers.dev"]);

  function isLocalDev() {
    const host = location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
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

  global.HwFeatureFlags = {
    isLocalDev,
    magnifyingGlass,
  };
})(window);
