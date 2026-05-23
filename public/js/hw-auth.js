/**
 * Phase 1 auth — client-side session (replace with server auth in Phase 2).
 * Usernames match Discord handles (case-insensitive). Password is "demo" for all test accounts.
 */
(function (global) {
  const SESSION_KEY = "jlm-hw-session";
  const PLATFORM_PATH = "/homework/platform.html";
  const LOGIN_PATH = "/homework.html";

  /** @type {Record<string, { password: string, displayName: string }>} */
  const ACCOUNTS = {
    japaneselanguagementor: {
      password: "demo",
      displayName: "japaneselanguagementor",
    },
    benm: {
      password: "demo",
      displayName: "Ben M",
    },
  };

  function normalizeUsername(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function readStoredSession() {
    return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  }

  function getSession() {
    try {
      const raw = readStoredSession();
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.username || !ACCOUNTS[data.username]) return null;
      return data;
    } catch {
      return null;
    }
  }

  function isAuthenticated() {
    return getSession() !== null;
  }

  function login(username, password, remember) {
    const key = normalizeUsername(username);
    const account = ACCOUNTS[key];
    if (!account || password !== account.password) {
      return { ok: false, error: "Invalid username or password." };
    }
    const session = {
      username: key,
      displayName: account.displayName,
      loggedInAt: Date.now(),
    };
    const payload = JSON.stringify(session);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    if (remember) {
      localStorage.setItem(SESSION_KEY, payload);
    } else {
      sessionStorage.setItem(SESSION_KEY, payload);
    }
    return { ok: true, session };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  function requireAuth(loginPath) {
    if (!isAuthenticated()) {
      const target = loginPath || LOGIN_PATH;
      const next = encodeURIComponent(global.location.pathname + global.location.search);
      global.location.replace(`${target}?next=${next}`);
      return false;
    }
    return true;
  }

  function redirectIfAuthenticated(platformPath) {
    if (isAuthenticated()) {
      global.location.replace(platformPath || PLATFORM_PATH);
      return true;
    }
    return false;
  }

  global.HwAuth = {
    SESSION_KEY,
    PLATFORM_PATH,
    LOGIN_PATH,
    ACCOUNTS,
    getSession,
    isAuthenticated,
    login,
    logout,
    requireAuth,
    redirectIfAuthenticated,
    normalizeUsername,
  };
})(window);
