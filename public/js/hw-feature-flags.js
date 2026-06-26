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

  /** Magnifying glass (虫眼鏡): on in local dev only. Override: localStorage hw-mg-dev=1 */
  function magnifyingGlass() {
    if (isLocalDev()) return true;
    if (PRODUCTION_HOSTS.has(location.hostname)) return devOverride("hw-mg-dev");
    return devOverride("hw-mg-dev");
  }

  global.HwFeatureFlags = {
    isLocalDev,
    magnifyingGlass,
  };
})(window);
