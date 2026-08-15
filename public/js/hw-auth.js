/**
 * Phase 1 auth — client-side session (replace with server auth in Phase 2).
 * Account labels, subscription tiers, and demo unlock flags live here until D1.
 */
(function (global) {
  const SESSION_KEY = "jlm-hw-session";
  const VIEW_AS_KEY = "jlm-hw-view-as";
  const VIDEO_UNLOCK_PREFIX = "jlm-hw-video-unlock-";
  const ACCOUNT_OVERRIDES_KEY = "jlm-hw-account-overrides";
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
      hwPerMonth: 1,
      videoIncluded: false,
    },
    tier2: {
      id: "tier2",
      name: "Premium",
      price: 20,
      hwPerMonth: 4,
      videoIncluded: false,
    },
    tier3: {
      id: "tier3",
      name: "Ultra",
      price: 49,
      hwPerMonth: 4,
      videoIncluded: true,
    },
    student_special: {
      id: "student_special",
      name: "Student Special Tier",
      price: 10,
      hwPerMonth: 4,
      videoIncluded: false,
    },
    pending: {
      id: "pending",
      name: "No plan yet",
      price: null,
      hwPerMonth: null,
      videoIncluded: false,
    },
  };

  const PAYPAL = {
    premium:
      "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-9CF38809GM2257018NIKG6UY",
  };

  const WEEKLY_HOMEWORK_UPGRADE_PRICE = 10;

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
      tier: "pending",
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
      accountLabel: "homework_only",
      tier: "pending",
      videoResponseUnlock: false,
    },
    benc: {
      password: "jelly",
      displayName: "benc",
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

  function readAccountOverrides() {
    try {
      const raw = localStorage.getItem(ACCOUNT_OVERRIDES_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeAccountOverrides(map) {
    try {
      localStorage.setItem(ACCOUNT_OVERRIDES_KEY, JSON.stringify(map || {}));
    } catch {
      /* ignore */
    }
  }

  function getAccountOverride(username) {
    const key = normalizeUsername(username);
    if (!key) return null;
    const entry = readAccountOverrides()[key];
    if (!entry || typeof entry !== "object") return null;
    return {
      accountLabel: entry.accountLabel || null,
      tier: entry.tier || null,
    };
  }

  function setAccountOverride(username, settings) {
    const key = normalizeUsername(username);
    if (!key || !settings) return;
    const map = readAccountOverrides();
    map[key] = {
      accountLabel: settings.accountLabel || map[key]?.accountLabel || "homework_only",
      tier: settings.tier || map[key]?.tier || "pending",
    };
    writeAccountOverrides(map);
  }

  function applyAccountOverride(data) {
    if (!data?.username) return data;
    const override = getAccountOverride(data.username);
    if (!override) return data;
    return {
      ...data,
      accountLabel: override.accountLabel || data.accountLabel,
      tier: override.tier || data.tier,
    };
  }

  function enrichSession(data) {
    return enrichSessionRaw(applyAccountOverride(data));
  }

  function enrichSessionRaw(data) {
    if (!data?.username) return null;

    if (data.source === "server") {
      const tier = data.tier || "pending";
      const tierMeta = TIERS[tier] || TIERS.pending;
      const accountLabel = data.accountLabel || "homework_only";
      const videoResponseUnlock =
        tier === "tier3" || Boolean(data.videoResponseUnlock);
      return {
        username: data.username,
        displayName: data.displayName || data.username,
        email: data.email || "",
        role: data.role || "student",
        accountLabel,
        accountLabelDisplay: ACCOUNT_LABELS[accountLabel] || accountLabel,
        tier,
        tierDisplay: tierMeta.name,
        courses: Array.isArray(data.courses) ? data.courses : [],
        videoResponseUnlock,
        paypalBilling: Boolean(data.paypalBilling),
        source: "server",
        loggedInAt: data.loggedInAt || Date.now(),
        viewAs: Boolean(data.viewAs),
      };
    }

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
      email: data.email || "",
      role: data.role || account.role || "student",
      accountLabel,
      accountLabelDisplay: ACCOUNT_LABELS[accountLabel] || accountLabel,
      tier,
      tierDisplay: tierMeta.name,
      courses: Array.isArray(data.courses) ? data.courses : [],
      videoResponseUnlock,
      source: "local",
      loggedInAt: data.loggedInAt || Date.now(),
      viewAs: Boolean(data.viewAs),
    };
  }

  function getTeacherSession() {
    try {
      const raw = readStoredSession();
      if (!raw) return null;
      const data = enrichSession(JSON.parse(raw));
      if (!data || data.role !== "teacher") return null;
      return data;
    } catch {
      return null;
    }
  }

  function getViewAsStudent() {
    try {
      const username = sessionStorage.getItem(VIEW_AS_KEY);
      return username ? normalizeUsername(username) : null;
    } catch {
      return null;
    }
  }

  function isViewingAsStudent() {
    return Boolean(getTeacherSession() && getViewAsStudent());
  }

  function buildStudentViewSession(username) {
    const key = normalizeUsername(username);
    if (!key || !getTeacherSession()) return null;
    const account = ACCOUNTS[key];
    if (account && account.role === "teacher") return null;
    if (account && account.role === "student") {
      return enrichSession({
        username: key,
        displayName: account.displayName,
        role: "student",
        accountLabel: account.accountLabel,
        tier: account.tier,
        videoResponseUnlock:
          account.tier === "tier3" ||
          account.videoResponseUnlock ||
          isVideoUnlockStored(key),
        loggedInAt: Date.now(),
        viewAs: true,
      });
    }

    const fromList = global.HwStudentList?.getStudentsSync?.()?.find((s) => s.username === key);
    const viewAsActive = getViewAsStudent() === key;
    if (!fromList && !viewAsActive) return null;

    return enrichSession({
      username: key,
      displayName: fromList?.displayName || key,
      role: "student",
      accountLabel: "homework_only",
      tier: "pending",
      videoResponseUnlock: false,
      loggedInAt: Date.now(),
      viewAs: true,
      source: "server",
    });
  }

  function setViewAsStudent(username) {
    const key = normalizeUsername(username);
    if (!getTeacherSession()) return { ok: false, error: "Teacher login required." };
    if (!key) {
      sessionStorage.removeItem(VIEW_AS_KEY);
      return { ok: true, session: getTeacherSession() };
    }
    if (!isStudentAccount(key)) {
      return { ok: false, error: "Unknown student account." };
    }
    sessionStorage.setItem(VIEW_AS_KEY, key);
    const student = buildStudentViewSession(key);
    return student ? { ok: true, session: student } : { ok: false, error: "Unknown student account." };
  }

  async function setViewAsStudentAsync(username) {
    const key = normalizeUsername(username);
    if (!getTeacherSession()) return { ok: false, error: "Teacher login required." };
    if (!key) {
      sessionStorage.removeItem(VIEW_AS_KEY);
      return { ok: true, session: getTeacherSession() };
    }
    if (global.HwStudentList?.fetchStudents) {
      await global.HwStudentList.fetchStudents({
        force: true,
        teacherUsername: getTeacherSession()?.username,
      });
    }
    return setViewAsStudent(key);
  }

  function clearViewAsStudent() {
    sessionStorage.removeItem(VIEW_AS_KEY);
  }

  function getSession() {
    try {
      const teacher = getTeacherSession();
      if (teacher) {
        const viewAs = getViewAsStudent();
        if (viewAs) {
          const student = buildStudentViewSession(viewAs);
          if (student) return student;
        }
        return teacher;
      }
      const raw = readStoredSession();
      if (!raw) return null;
      return enrichSession(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function readStoredSessionOnly() {
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

  function canOfferVideoUnlock() {
    return false;
  }

  function canShowWeeklyHomeworkUpgrade(session) {
    const s = session || getSession();
    return Boolean(
      s &&
        s.role === "student" &&
        s.accountLabel === "current_student" &&
        (s.tier === "student_special" || s.tier === "pending")
    );
  }

  /**
   * Post-submission upsell offers (Hub v5 completion zone).
   * @param {object|null} session
   * @returns {Array<{ kind: 'tier'|'weekly_homework'|'lessons', plan?: string }>}
   */
  function getPostSubmitSellupOffers(session) {
    const s = session || getSession();
    if (!s || s.role !== "student") return [];

    const tier = s.tier || "pending";
    const label = s.accountLabel || "homework_only";

    if (label === "current_student" && (tier === "student_special" || tier === "pending")) {
      return [{ kind: "weekly_homework", studentSpecial: true }];
    }

    if (tier === "pending" || !hasActiveSubscription(s)) {
      return [
        { kind: "tier", plan: "basic" },
        { kind: "tier", plan: "premium" },
        { kind: "tier", plan: "ultra" },
        { kind: "lessons" },
      ];
    }

    if (label === "homework_only") {
      if (tier === "tier3") return [{ kind: "lessons" }];
      if (tier === "tier2") {
        return [
          { kind: "tier", plan: "ultra" },
          { kind: "lessons" },
        ];
      }
      if (tier === "tier1") {
        return [
          { kind: "tier", plan: "premium" },
          { kind: "tier", plan: "ultra" },
          { kind: "lessons" },
        ];
      }
    }

    /* Lesson students already taking HW — Ultra video feedback + games, not Private lessons. */
    if (label === "current_student") {
      return [
        { kind: "tier", plan: "ultra" },
        { kind: "games" },
      ];
    }

    return [];
  }

  function getTierMeta(session) {
    const s = session || getSession();
    if (!s) return null;
    return TIERS[s.tier] || TIERS.tier1;
  }

  function loginLocal(username, password, remember) {
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

  function login(username, password, remember) {
    return loginLocal(username, password, remember);
  }

  async function loginAsync(username, password, remember) {
    const local = loginLocal(username, password, remember);
    if (local.ok) return local;

    const key = normalizeUsername(username);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: key, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || "Invalid username or password." };
      }
      const session = enrichSession({
        ...data.session,
        loggedInAt: Date.now(),
      });
      if (!session) {
        return { ok: false, error: "Could not start session." };
      }
      persistSession(session, remember);
      return { ok: true, session };
    } catch {
      return { ok: false, error: "Could not reach the server. Try again." };
    }
  }

  async function signupAsync(payload, remember) {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || "Could not create account." };
      }
      const session = enrichSession({
        ...data.session,
        loggedInAt: Date.now(),
      });
      if (!session) {
        return { ok: false, error: "Account created but session failed." };
      }
      persistSession(session, remember);
      return { ok: true, session };
    } catch {
      return { ok: false, error: "Could not reach the server. Try again." };
    }
  }

  function hasActiveSubscription(session) {
    const s = session || getSession();
    return Boolean(s && s.tier && s.tier !== "pending");
  }

  /** Homework hub games — open for all student and homework-only accounts. */
  function hasGameHubAccess(session) {
    const s = session || getSession();
    if (!s || s.role !== "student") return false;
    return s.accountLabel === "homework_only" || s.accountLabel === "current_student";
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
    const live = global.HwStudentList?.getStudentsSync?.();
    if (live?.length) return live.slice();
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
    if (account?.role === "teacher") return false;
    if (account?.role === "student") return true;
    return global.HwStudentList?.isKnownStudent?.(key) || false;
  }

  function possessiveHubTitle(name) {
    const label = String(name || "").trim();
    if (!label) return "Your hub";
    return label + "'s hub";
  }

  global.HwAuth = {
    SESSION_KEY,
    VIDEO_UNLOCK_PREFIX,
    PLATFORM_PATH,
    LOGIN_PATH,
    ACCOUNT_LABELS,
    TIERS,
    WEEKLY_HOMEWORK_UPGRADE_PRICE,
    PAYPAL,
    ACCOUNTS,
    getSession,
    isAuthenticated,
    login,
    loginAsync,
    signupAsync,
    hasActiveSubscription,
    hasGameHubAccess,
    logout,
    requireAuth,
    redirectIfAuthenticated,
    normalizeUsername,
    hasVideoResponseAccess,
    canOfferVideoUnlock,
    canShowWeeklyHomeworkUpgrade,
    getPostSubmitSellupOffers,
    getTierMeta,
    enableVideoResponseUnlock,
    listStudentAccounts,
    isStudentAccount,
    possessiveHubTitle,
    getTeacherSession,
    getViewAsStudent,
    isViewingAsStudent,
    setViewAsStudent,
    setViewAsStudentAsync,
    clearViewAsStudent,
    buildStudentViewSession,
    persistSession,
    setAccountOverride,
    getAccountOverride,
  };
})(window);
