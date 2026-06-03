/**
 * Phase 1 auth — client-side session (replace with server auth in Phase 2).
 * Account labels, subscription tiers, and demo unlock flags live here until D1.
 */
(function (global) {
  const SESSION_KEY = "jlm-hw-session";
  const VIDEO_UNLOCK_PREFIX = "jlm-hw-video-unlock-";
  const PLATFORM_PATH = "/homework/platform.html";
  const LOGIN_PATH = "/homework.html";

  const ACCOUNT_LABELS = {
    current_student: "Current Student",
    homework_only: "Homework Only",
  };

  /** @type {Record<string, { name: string, price: number|null, hwPerMonth: number|null, videoIncluded: boolean }>} */
  const TIERS = {
    tier1: {
      id: "tier1",
      name: "Basic",
      price: 5,
      hwPerMonth: 2,
      videoIncluded: false,
    },
    tier2: {
      id: "tier2",
      name: "Premium",
      price: 15,
      hwPerMonth: 4,
      videoIncluded: false,
    },
    tier3: {
      id: "tier3",
      name: "Unlimited",
      price: 99,
      hwPerMonth: null,
      videoIncluded: true,
    },
    student_special: {
      id: "student_special",
      name: "Student Special Tier",
      price: null,
      hwPerMonth: null,
      videoIncluded: false,
    },
  };

  const VIDEO_RESPONSE_ADDON_PRICE = 15;
  const WEEKLY_HOMEWORK_UPGRADE_PRICE = 5;

  /** PayPal billing plan subscribe URLs. */
  const PAYPAL = {
    premium:
      "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-9CF38809GM2257018NIKG6UY",
    videoFeedback:
      "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-15R38814RL5675323NIKHAIA",
  };

  /** @type {Record<string, object>} */
  const ACCOUNTS = {
    jlm: {
      password: "demo",
      displayName: "JLM",
      role: "teacher",
    },
    benm: {
      password: "demo",
      displayName: "Ben M",
      role: "student",
      accountLabel: "current_student",
      tier: "student_special",
      videoResponseUnlock: false,
    },
    joshs: {
      password: "jelly",
      displayName: "Josh S",
      role: "student",
      accountLabel: "current_student",
      tier: "student_special",
      videoResponseUnlock: false,
    },
    deme: {
      password: "jelly",
      displayName: "Deme",
      role: "student",
      accountLabel: "homework_only",
      tier: "tier2",
      videoResponseUnlock: false,
    },
    ivan: {
      password: "jelly",
      displayName: "Ivan",
      role: "student",
      accountLabel: "current_student",
      tier: "student_special",
      videoResponseUnlock: false,
    },
  };

  function normalizeUsername(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function readStoredSession() {
    return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  }

  function isVideoUnlockStored(username) {
    return localStorage.getItem(VIDEO_UNLOCK_PREFIX + username) === "1";
  }

  function setVideoUnlockStored(username, enabled) {
    const key = VIDEO_UNLOCK_PREFIX + username;
    if (enabled) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  }

  function enrichSession(data) {
    if (!data?.username) return null;
    const account = ACCOUNTS[data.username];
    if (!account) return null;

    const tier = data.tier || account.tier || "tier1";
    const tierMeta = TIERS[tier] || TIERS.tier1;
    const accountLabel = data.accountLabel || account.accountLabel || "homework_only";
    const storedUnlock = isVideoUnlockStored(data.username);
    const videoResponseUnlock =
      tier === "tier3" ||
      Boolean(data.videoResponseUnlock || account.videoResponseUnlock || storedUnlock);

    return {
      username: data.username,
      displayName: data.displayName || account.displayName || data.username,
      role: data.role || account.role || "student",
      accountLabel,
      accountLabelDisplay: ACCOUNT_LABELS[accountLabel] || accountLabel,
      tier,
      tierDisplay: tierMeta.name,
      videoResponseUnlock,
      loggedInAt: data.loggedInAt || Date.now(),
    };
  }

  function getSession() {
    try {
      const raw = readStoredSession();
      if (!raw) return null;
      return enrichSession(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function persistSession(session, remember) {
    const payload = JSON.stringify(session);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    if (remember) localStorage.setItem(SESSION_KEY, payload);
    else sessionStorage.setItem(SESSION_KEY, payload);
  }

  function isAuthenticated() {
    return getSession() !== null;
  }

  function hasVideoResponseAccess(session) {
    const s = session || getSession();
    return Boolean(s && s.videoResponseUnlock);
  }

  function canOfferVideoUnlock(session) {
    const s = session || getSession();
    if (!s || s.role === "teacher") return false;
    if (hasVideoResponseAccess(s)) return false;
    return s.tier === "tier1" || s.tier === "tier2" || s.tier === "student_special";
  }

  function canShowWeeklyHomeworkUpgrade(session) {
    const s = session || getSession();
    return Boolean(
      s &&
        s.role === "student" &&
        s.accountLabel === "current_student" &&
        s.tier === "student_special"
    );
  }

  function getTierMeta(session) {
    const s = session || getSession();
    if (!s) return null;
    return TIERS[s.tier] || TIERS.tier1;
  }

  function login(username, password, remember) {
    const key = normalizeUsername(username);
    const account = ACCOUNTS[key];
    if (!account || password !== account.password) {
      return { ok: false, error: "Invalid username or password." };
    }

    const session = enrichSession({
      username: key,
      displayName: account.displayName,
      role: account.role || "student",
      accountLabel: account.accountLabel,
      tier: account.tier,
      videoResponseUnlock:
        account.tier === "tier3" ||
        account.videoResponseUnlock ||
        isVideoUnlockStored(key),
      loggedInAt: Date.now(),
    });

    persistSession(session, remember);
    return { ok: true, session };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  function enableVideoResponseUnlock(username) {
    const key = normalizeUsername(username);
    if (!ACCOUNTS[key]) return null;
    setVideoUnlockStored(key, true);
    const session = getSession();
    if (session && session.username === key) {
      session.videoResponseUnlock = true;
      const remember = Boolean(localStorage.getItem(SESSION_KEY));
      persistSession(session, remember);
    }
    return getSession();
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

  function listStudentAccounts() {
    return Object.entries(ACCOUNTS)
      .filter(([, account]) => account.role === "student")
      .map(([username, account]) => ({
        username,
        displayName: account.displayName || username,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  function isStudentAccount(username) {
    const key = normalizeUsername(username);
    const account = ACCOUNTS[key];
    return Boolean(account && account.role === "student");
  }

  global.HwAuth = {
    SESSION_KEY,
    VIDEO_UNLOCK_PREFIX,
    PLATFORM_PATH,
    LOGIN_PATH,
    ACCOUNT_LABELS,
    TIERS,
    VIDEO_RESPONSE_ADDON_PRICE,
    WEEKLY_HOMEWORK_UPGRADE_PRICE,
    PAYPAL,
    ACCOUNTS,
    getSession,
    isAuthenticated,
    login,
    logout,
    requireAuth,
    redirectIfAuthenticated,
    normalizeUsername,
    hasVideoResponseAccess,
    canOfferVideoUnlock,
    canShowWeeklyHomeworkUpgrade,
    getTierMeta,
    enableVideoResponseUnlock,
    listStudentAccounts,
    isStudentAccount,
  };
})(window);
