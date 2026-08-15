/**
 * Account Settings — Profile / Subscription / Notifications.
 * On the hub this fills the worksheet space; account.html redirects logged-in users there.
 */
(function (global) {
  const PLATFORM_PATH = "/homework/platform.html";
  const ACCOUNT_TABS = ["profile", "subscription", "notifications"];
  let bound = false;
  let teacherAppBound = false;
  let openFromHashLock = false;

  function setStatus(el, msg, isError) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.toggle("hw-login-inlay__error", !!isError);
    if (msg && !isError) el.style.color = "var(--color-text-muted)";
    else el.style.color = "";
  }

  function isStandalonePage() {
    return /\/account\.html$/i.test(global.location.pathname || "");
  }

  function parseHash(raw) {
    const hash = String(raw || global.location.hash || "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
    if (!hash) return null;
    if (hash === "account" || hash === "account-profile" || hash === "profile") {
      return { tab: "profile" };
    }
    if (hash === "account-subscription" || hash === "subscription") {
      return { tab: "subscription" };
    }
    if (hash === "account-notifications" || hash === "notifications") {
      return { tab: "notifications" };
    }
    return null;
  }

  function isAccountHash(raw) {
    return !!parseHash(raw);
  }

  function hashForTab(tab) {
    const id = ACCOUNT_TABS.includes(tab) ? tab : "profile";
    if (id === "profile") return "#account";
    return "#account-" + id;
  }

  function setHash(tab, mode) {
    const next = hashForTab(tab);
    if (global.location.hash === next) return;
    openFromHashLock = true;
    try {
      const url = global.location.pathname + global.location.search + next;
      if (mode === "replace") {
        global.history.replaceState(null, "", url);
      } else {
        global.location.hash = next.slice(1);
      }
    } finally {
      window.setTimeout(() => {
        openFromHashLock = false;
      }, 0);
    }
  }

  function clearAccountHash() {
    if (!isAccountHash()) return;
    openFromHashLock = true;
    try {
      global.history.replaceState(
        null,
        "",
        global.location.pathname + global.location.search
      );
    } finally {
      window.setTimeout(() => {
        openFromHashLock = false;
      }, 0);
    }
  }

  function session() {
    return global.HwAuth?.getSession?.() || null;
  }

  function loginIdValue(s) {
    const email = String(s?.email || "").trim();
    if (email && email.includes("@")) return email;
    return String(s?.username || "").trim();
  }

  function stripHubSuffix(name) {
    return String(name || "")
      .replace(/\s*'s\s+Hub\s*$/i, "")
      .trim();
  }

  function hasPaidPlan() {
    const s = session();
    if (!s || s.role === "teacher") return false;
    return Boolean(global.HwAuth?.hasActiveSubscription?.(s));
  }

  function canAutoCancelPaypal() {
    return Boolean(session()?.paypalBilling);
  }

  const PLAN_CARDS = [
    {
      id: "basic",
      title: "Basic",
      price: 5,
      tip: "One HW assignment a month — so anyone can join in — with written notes when you send it.",
    },
    {
      id: "premium",
      title: "Premium",
      price: 20,
      tip: "Four HW assignments a month — shaped around your stuck spots, with careful written notes from JD.",
      badge: "Popular",
    },
    {
      id: "ultra",
      title: "Ultra",
      price: 49,
      tip: "Four HW assignments a month, plus a personal video from JD on each one so more of it can stick.",
      badge: "Video",
      video: true,
    },
  ];

  function localNotifyKey() {
    const s = session();
    return "jlm-hw-notify-prefs:" + String(s?.username || "guest");
  }

  function readLocalNotifyPrefs() {
    try {
      return JSON.parse(localStorage.getItem(localNotifyKey()) || "{}");
    } catch {
      return {};
    }
  }

  function writeLocalNotifyPrefs(prefs) {
    try {
      localStorage.setItem(localNotifyKey(), JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }

  function getNotifyPrefs() {
    const s = session();
    const fromSession = s?.notifyPrefs && typeof s.notifyPrefs === "object" ? s.notifyPrefs : {};
    const local = readLocalNotifyPrefs();
    return {
      discord: !!(fromSession.discord || local.discord),
      sms: !!(fromSession.sms || local.sms),
      email: !!(fromSession.email || local.email),
      phonePing: !!(fromSession.phonePing || local.phonePing),
    };
  }

  function discordIdValue() {
    const el = document.getElementById("hw-account-discord-id");
    const typed = String(el?.value || "").trim();
    if (typed) return typed;
    return String(session()?.discordUserId || "").trim();
  }

  function setSwitch(id, on) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.setAttribute("aria-checked", on ? "true" : "false");
    btn.classList.toggle("is-on", !!on);
    const note = document.getElementById(id + "-note");
    if (note) note.hidden = !on;
  }

  function paintNotifySwitches() {
    const prefs = getNotifyPrefs();
    setSwitch("hw-account-notify-discord", prefs.discord);
    setSwitch("hw-account-notify-sms", prefs.sms);
    setSwitch("hw-account-notify-email", prefs.email);
    setSwitch("hw-account-notify-phonePing", prefs.phonePing);
  }

  function persistNotifyPrefs(prefs) {
    writeLocalNotifyPrefs(prefs);
    const s = session();
    if (s) {
      s.notifyPrefs = prefs;
      const remember = !!global.localStorage?.getItem?.("jlm-hw-session");
      global.HwAuth?.persistSession?.(s, remember);
    }
    if (!s?.username) return;
    void fetch("/api/auth/self-extras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: s.username, notifyPrefs: prefs }),
    }).catch(() => {});
  }

  function toggleNotify(key) {
    const prefs = getNotifyPrefs();
    if (key === "discord" && !prefs.discord && !discordIdValue()) {
      setSwitch("hw-account-notify-discord", false);
      const need = document.getElementById("hw-account-discord-need-id");
      if (need) need.hidden = false;
      return;
    }
    const need = document.getElementById("hw-account-discord-need-id");
    if (need) need.hidden = true;
    prefs[key] = !prefs[key];
    persistNotifyPrefs(prefs);
    paintNotifySwitches();
  }

  function planRank(planId) {
    if (planId === "ultra") return 3;
    if (planId === "premium" || planId === "student-special") return 2;
    if (planId === "basic") return 1;
    return 0;
  }

  function currentPlanId() {
    const s = session();
    if (!s || s.role === "teacher" || !hasPaidPlan()) return "";
    if (s.tier === "tier1") return "basic";
    if (s.tier === "tier2") return "premium";
    if (s.tier === "tier3") return "ultra";
    if (s.tier === "student_special") return "student-special";
    return "";
  }

  function toneForPlan(planId) {
    if (planId === "lessons") return "lessons";
    const current = currentPlanId();
    if (current && planId === current) return "current";
    if (!current) return "upgrade";
    return planRank(planId) < planRank(current) ? "lesser" : "upgrade";
  }

  function buildAccountTierCard(plan) {
    const article = document.createElement("article");
    article.className =
      "course-card course-card--locked hw-hub-tier-plan" +
      (plan.id === "basic" ? " hw-hub-tier-plan--featured" : "") +
      (plan.video ? " hw-hub-tier-plan--video" : "");
    article.setAttribute("data-hw-tier-plan", plan.id);
    article.setAttribute("data-hw-tier-detail", plan.id);
    article.setAttribute("data-hw-plan-tone", toneForPlan(plan.id));
    article.tabIndex = 0;
    let inner = "";
    if (plan.badge) {
      inner +=
        '<p class="hw-hub-tier-plan__badge' +
        (plan.video ? " hw-hub-tier-plan__badge--video" : "") +
        '">' +
        plan.badge +
        "</p>";
    }
    inner += '<h3 class="course-card__title">' + plan.title + "</h3>";
    inner += '<p class="hw-hub-tier-tip" role="tooltip">' + plan.tip + "</p>";
    inner +=
      '<div class="course-card__footer">' +
      '<button type="button" class="course-card__status" data-hw-tier-detail="' +
      plan.id +
      '" aria-label="View ' +
      plan.title +
      ' plan details">' +
      '<span class="course-card__status-text course-card__status-text--locked">Details</span>' +
      '<span class="course-card__status-text course-card__status-text--unlock">Unlock?</span>' +
      "</button>" +
      '<span class="course-card__price">$' +
      plan.price +
      '<span class="course-card__price-suffix">/mo</span></span>' +
      "</div>";
    article.innerHTML = inner;
    return article;
  }

  function buildStudentSpecialSlim() {
    const article = document.createElement("article");
    article.className =
      "hw-student-special hw-account-special-slim hw-hub-v5-sellup-card--clickable";
    article.setAttribute("data-hw-plan-tone", toneForPlan("student-special"));
    article.tabIndex = 0;
    article.setAttribute("role", "link");
    article.setAttribute("aria-label", "Student Special ten dollars per month");
    article.innerHTML =
      '<p class="hw-student-special__eyebrow">Already take lessons with JD?</p>' +
      '<h3 class="hw-student-special__title">Student Special <span class="hw-student-special__price">$10/mo</span></h3>' +
      '<p class="hw-student-special__desc">Four interactive assignments a month with written notes — the slim plan for current students.</p>';
    article.addEventListener("click", () => {
      global.HwCheckout?.startCheckout?.("student-special", { forcePaypal: true });
    });
    return article;
  }

  function buildLessonsSlim() {
    const article = document.createElement("article");
    article.className = "hw-account-lessons-slim";
    article.setAttribute("data-hw-plan-tone", "lessons");
    article.innerHTML =
      '<h3 class="course-card__title">Private lessons</h3>' +
      '<p class="course-card__desc">Live coaching with JD — pairs with Homework Hub or stands on its own.</p>' +
      '<a class="btn btn--primary btn--sm" href="/#contact" data-service="Private lessons">Ask about lessons</a>';
    return article;
  }

  function paintAccountPlans() {
    const mount = document.getElementById("hw-v5-account-sellup");
    const name = document.getElementById("hw-account-current-plan-name");
    if (name) name.textContent = currentPlanName();
    if (!mount) return;
    mount.replaceChildren();
    PLAN_CARDS.forEach((plan) => mount.appendChild(buildAccountTierCard(plan)));
    mount.appendChild(buildStudentSpecialSlim());
    mount.appendChild(buildLessonsSlim());
    global.HwCheckout?.bindCheckoutControls?.(mount);
  }

  async function loadSelfExtras() {
    const s = session();
    if (!s?.username || s.role === "teacher") return;
    try {
      const res = await fetch("/api/auth/self-extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: s.username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const discordEl = document.getElementById("hw-account-discord-id");
      if (discordEl && data.discordUserId) discordEl.value = String(data.discordUserId);
      if (data.discordUserId) s.discordUserId = data.discordUserId;
      if (data.notifyPrefs) {
        s.notifyPrefs = data.notifyPrefs;
        writeLocalNotifyPrefs(data.notifyPrefs);
      }
      const remember = !!global.localStorage?.getItem?.("jlm-hw-session");
      global.HwAuth?.persistSession?.(s, remember);
      paintNotifySwitches();
    } catch {
      /* local prefs still apply */
    }
  }

  function setProfileEditing(on) {
    const panel = document.getElementById("hw-account-panel");
    const saveBar = document.getElementById("hw-account-save-bar");
    const editBtn = document.getElementById("hw-account-edit");
    if (!panel) return;
    panel.classList.toggle("is-editing", !!on);
    panel.querySelectorAll("[data-hw-account-edit]").forEach((el) => {
      if (el instanceof HTMLInputElement) el.readOnly = !on;
    });
    if (saveBar) {
      saveBar.setAttribute("aria-hidden", on ? "false" : "true");
    }
    if (editBtn) {
      editBtn.setAttribute("aria-pressed", on ? "true" : "false");
      editBtn.setAttribute("aria-label", on ? "Cancel editing" : "Edit profile");
      editBtn.title = on ? "Cancel" : "Edit";
    }
    if (on) {
      window.setTimeout(() => {
        saveBar?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 80);
    }
  }

  function fillSession(root) {
    const scope = root || document;
    const s = session();
    const guest = scope.querySelector
      ? scope.querySelector("#hw-account-guest")
      : document.getElementById("hw-account-guest");
    const panel = scope.querySelector
      ? scope.querySelector("#hw-account-panel")
      : document.getElementById("hw-account-panel");
    if (!s) {
      if (guest) guest.hidden = false;
      if (panel) panel.hidden = true;
      return;
    }
    if (guest) guest.hidden = true;
    if (panel) panel.hidden = false;

    const loginEl = document.getElementById("hw-account-login-id");
    const emailEl = document.getElementById("hw-account-email-input");
    const nameInput = document.getElementById("hw-account-display-name");
    const discordEl = document.getElementById("hw-account-discord-id");
    if (loginEl) loginEl.value = loginIdValue(s);
    if (emailEl) emailEl.value = String(s.email || "").trim();
    if (nameInput) {
      nameInput.value = stripHubSuffix(s.displayName || s.username || "");
    }
    if (discordEl) discordEl.value = String(s.discordUserId || "").trim();
    setProfileEditing(false);
    const oldPw = document.getElementById("hw-account-old-password");
    const newPw = document.getElementById("hw-account-new-password");
    if (oldPw) oldPw.value = "";
    if (newPw) newPw.value = "";
    paintAccountPlans();
    paintNotifySwitches();
    void loadSelfExtras();
  }

  function currentPlanName() {
    const s = session();
    if (!s) return "Not signed in";
    if (s.role === "teacher") return "Teacher";
    const tier = s.tier || "pending";
    if (s.accountLabel === "current_student" && (tier === "pending" || !hasPaidPlan())) {
      return "Lessons — no weekly homework yet";
    }
    if (tier === "pending" || !hasPaidPlan()) return "No plan yet";
    return String(global.HwAuth?.TIERS?.[tier]?.name || "Your plan").replace(/\s+Tier$/i, "");
  }

  function fillPlanCopy() {
    const name = document.getElementById("hw-account-current-plan-name");
    if (name) name.textContent = currentPlanName();
    paintAccountPlans();
  }

  function profileMarkup() {
    const pencil =
      '<svg class="hw-account-edit__icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    return (
      '<article class="hw-hub-worksheet-card hw-account-card" id="hw-account-panel">' +
      '<form id="hw-account-profile-form" class="hw-account-form">' +
      '<h2 class="hw-account-card__sub" style="margin-top:0">General Info</h2>' +
      '<div class="hw-login-inlay__field hw-account-login-field">' +
      '<label for="hw-account-login-id">Login ID</label>' +
      '<div class="hw-account-login-bubble">' +
      '<input type="text" id="hw-account-login-id" name="loginId" readonly autocomplete="username" placeholder="you@email.com">' +
      '<button type="button" class="hw-account-edit" id="hw-account-edit" aria-pressed="false" aria-label="Edit profile" title="Edit">' +
      pencil +
      "</button>" +
      "</div>" +
      "</div>" +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-display-name">Display Name <span class="hw-login-inlay__optional">(first name recommended)</span></label>' +
      '<div class="hw-account-name-row">' +
      '<input type="text" id="hw-account-display-name" name="displayName" maxlength="40" data-hw-account-edit readonly autocomplete="nickname" placeholder="Alex">' +
      '<span class="hw-account-name-hub" aria-hidden="true">\'s Hub</span>' +
      "</div>" +
      "</div>" +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-email-input">Email</label>' +
      '<input type="email" id="hw-account-email-input" name="email" data-hw-account-edit readonly autocomplete="email" placeholder="you@email.com">' +
      "</div>" +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-discord-id">Discord ID ' +
      '<button type="button" class="hw-account-help" id="hw-account-discord-help" title="What\'s my Discord ID?" aria-label="What\'s my Discord ID?">?</button>' +
      "</label>" +
      '<input type="text" id="hw-account-discord-id" name="discordUserId" data-hw-account-edit readonly inputmode="numeric" autocomplete="off" placeholder="numbers only">' +
      "</div>" +
      '<h2 class="hw-account-card__sub">Password</h2>' +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-old-password">Current</label>' +
      '<input type="password" id="hw-account-old-password" data-hw-account-edit readonly autocomplete="current-password" placeholder="••••••••">' +
      "</div>" +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-new-password">New</label>' +
      '<input type="password" id="hw-account-new-password" data-hw-account-edit readonly minlength="6" autocomplete="new-password" placeholder="••••••••">' +
      "</div>" +
      '<p class="hw-login-inlay__error" id="hw-account-save-status" hidden role="status"></p>' +
      '<div class="hw-account-save-bar" id="hw-account-save-bar" aria-hidden="true">' +
      '<button type="submit" class="hw-login-inlay__submit" id="hw-account-save">Save new changes?</button>' +
      "</div>" +
      "</form>" +
      '<div class="hw-account-card__actions">' +
      '<button type="button" class="btn hw-account-delete-btn" id="hw-account-delete">Delete account</button>' +
      "</div>" +
      '<p class="hw-login-inlay__note hw-account-card__legal">' +
      '<a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>' +
      '<div class="hw-account-delete-dialog" id="hw-account-discord-help-dialog" hidden>' +
      '<div class="hw-account-delete-dialog__backdrop" data-hw-account-discord-help-close></div>' +
      '<div class="hw-account-delete-dialog__box" role="dialog" aria-modal="true" aria-labelledby="hw-account-discord-help-title">' +
      '<h3 class="hw-account-delete-dialog__title" id="hw-account-discord-help-title">What\'s my Discord ID?</h3>' +
      '<p class="hw-account-delete-dialog__body">In Discord: User Settings → Advanced → turn on Developer Mode. Then right-click your name and choose Copy User ID.</p>' +
      '<p class="hw-account-delete-dialog__body"><a href="https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID" target="_blank" rel="noopener noreferrer">Open Discord’s guide</a></p>' +
      '<div class="hw-account-delete-dialog__actions">' +
      '<button type="button" class="btn btn--ghost" data-hw-account-discord-help-close>Close</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="hw-account-delete-dialog" id="hw-account-delete-dialog" hidden>' +
      '<div class="hw-account-delete-dialog__backdrop" data-hw-account-delete-close></div>' +
      '<div class="hw-account-delete-dialog__box" role="dialog" aria-modal="true" aria-labelledby="hw-account-delete-title">' +
      '<h3 class="hw-account-delete-dialog__title" id="hw-account-delete-title">Delete account?</h3>' +
      '<p class="hw-account-delete-dialog__body">This will delete everything on your account.</p>' +
      '<p class="hw-account-delete-dialog__body" id="hw-account-delete-paypal-auto" hidden>' +
      "We’ll cancel your PayPal plan when you delete this account.</p>" +
      '<p class="hw-account-delete-dialog__warn" id="hw-account-delete-paypal-warn" hidden>WARNING: this will NOT cancel your subscription.</p>' +
      '<p class="hw-account-delete-dialog__body" id="hw-account-delete-paypal-note" hidden>' +
      'This older plan isn’t linked yet, so cancel it in PayPal first. ' +
      '<a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener noreferrer">Open PayPal</a>, then check the box below.</p>' +
      '<label class="hw-account-delete-dialog__check" id="hw-account-delete-paypal-check-wrap" hidden>' +
      '<input type="checkbox" id="hw-account-delete-paypal-check"> I cancelled my PayPal plan' +
      "</label>" +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-delete-password">Password</label>' +
      '<input type="password" id="hw-account-delete-password" autocomplete="current-password">' +
      "</div>" +
      '<p class="hw-login-inlay__error" id="hw-account-delete-status" hidden role="status"></p>' +
      '<div class="hw-account-delete-dialog__actions">' +
      '<button type="button" class="btn btn--ghost" data-hw-account-delete-close>Cancel</button>' +
      '<button type="button" class="btn hw-account-delete-btn" id="hw-account-delete-confirm">Delete account</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function subscriptionMarkup() {
    return (
      '<article class="hw-hub-worksheet-card hw-account-card hw-account-card--plans" id="hw-account-subscription-card">' +
      '<p class="hw-account-current-plan" id="hw-account-current-plan">' +
      '<span class="hw-account-current-plan__label">Current plan</span>' +
      '<strong class="hw-account-current-plan__name" id="hw-account-current-plan-name">—</strong>' +
      "</p>" +
      '<div class="hw-hub-v5-sellup-frame" id="hw-v5-account-sellup-frame">' +
      '<div class="hw-hub-v5-sellup hw-account-plans" id="hw-v5-account-sellup" aria-label="Homework Hub plans"></div>' +
      "</div>" +
      "</article>"
    );
  }

  function notifySwitchRow(id, label, note) {
    return (
      '<div class="hw-account-switch-row">' +
      '<span class="hw-account-switch-row__label">' +
      label +
      "</span>" +
      '<button type="button" class="hw-account-switch" id="' +
      id +
      '" role="switch" aria-checked="false" data-hw-notify="' +
      id.replace("hw-account-notify-", "") +
      '"><span class="hw-account-switch__knob"></span></button>' +
      (note
        ? '<p class="hw-account-switch-row__note" id="' +
          id +
          '-note" hidden>' +
          note +
          "</p>"
        : "") +
      "</div>"
    );
  }

  function notificationsMarkup() {
    return (
      '<article class="hw-hub-worksheet-card hw-account-card" id="hw-account-notifications-card">' +
      '<h2 class="hw-account-card__title">Notifications</h2>' +
      notifySwitchRow("hw-account-notify-discord", "Discord") +
      '<p class="hw-account-notify-error" id="hw-account-discord-need-id" hidden>Enter your Discord ID under Profile first.</p>' +
      notifySwitchRow(
        "hw-account-notify-sms",
        "SMS",
        "SMS isn’t free to send. Discord and email are — we’ll wire texts later."
      ) +
      notifySwitchRow("hw-account-notify-email", "Email") +
      notifySwitchRow(
        "hw-account-notify-phonePing",
        "Phone ping",
        "This is for when the hub is a phone app."
      ) +
      "</article>"
    );
  }

  function syncNav(inAccount) {
    document.querySelectorAll("[data-hw-account-nav]").forEach((link) => {
      if (inAccount) {
        link.textContent = "Your Hub";
        link.setAttribute("href", "#");
        link.setAttribute("aria-current", "page");
      } else {
        link.textContent = "Account Settings";
        link.setAttribute("href", "#account");
        link.removeAttribute("aria-current");
      }
    });
  }

  function isStudentHub() {
    return Boolean(
      global.HwHubV5Live && document.body.classList.contains("hw-role-student")
    );
  }

  function isTeacherHub() {
    return document.body.classList.contains("hw-role-teacher");
  }

  function paintTeacherTabs(app, activeTab) {
    const tabs = app.querySelector("#hw-account-teacher-tabs");
    if (!tabs) return;
    const slider = tabs.querySelector(".hw-hub-v5-tabs__slider") || document.createElement("span");
    slider.className = "hw-hub-v5-tabs__slider";
    slider.setAttribute("aria-hidden", "true");
    const labels = {
      profile: "Profile",
      subscription: "Subscription",
      notifications: "Notifications",
    };
    const active = ACCOUNT_TABS.includes(activeTab) ? activeTab : "profile";
    tabs.replaceChildren(slider);
    ACCOUNT_TABS.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v5-tabs__btn" + (id === active ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.id = "hw-account-teacher-tab-" + id;
      btn.setAttribute("data-hw-account-tab", id);
      btn.setAttribute("aria-selected", id === active ? "true" : "false");
      btn.setAttribute("aria-controls", "hw-account-teacher-panel-" + id);
      btn.textContent = labels[id];
      tabs.appendChild(btn);
    });
    tabs.classList.remove("is-slider-ready");
    requestAnimationFrame(() => {
      const activeBtn = tabs.querySelector(".hw-hub-v5-tabs__btn.is-active");
      if (!activeBtn) return;
      const listRect = tabs.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      slider.style.width = Math.max(0, btnRect.width) + "px";
      slider.style.height = Math.max(0, btnRect.height) + "px";
      slider.style.transform =
        "translate(" +
        (btnRect.left - listRect.left) +
        "px, " +
        (btnRect.top - listRect.top) +
        "px)";
      tabs.classList.add("is-slider-ready");
    });
  }

  function showTeacherPanel(app, tab) {
    const active = ACCOUNT_TABS.includes(tab) ? tab : "profile";
    app.querySelectorAll("[data-hw-account-panel]").forEach((panel) => {
      const on = panel.getAttribute("data-hw-account-panel") === active;
      panel.classList.toggle("is-active", on);
      panel.hidden = !on;
    });
    paintTeacherTabs(app, active);
    fillSession(app);
    fillPlanCopy();
  }

  function ensureTeacherAccountApp() {
    let app = document.getElementById("hw-account-teacher-app");
    if (app) return app;
    const teacherHub = document.getElementById("hw-teacher-hub");
    if (!teacherHub || !teacherHub.parentNode) return null;
    app = document.createElement("div");
    app.id = "hw-account-teacher-app";
    app.className = "hw-hub-v5-app hw-account-teacher-app";
    app.hidden = true;
    app.innerHTML =
      '<div class="hw-hub-v5-tabs-wrap">' +
      '<nav class="hw-hub-v5-tabs" id="hw-account-teacher-tabs" role="tablist" aria-label="Account Settings">' +
      '<span class="hw-hub-v5-tabs__slider" aria-hidden="true"></span>' +
      "</nav>" +
      "</div>" +
      '<div class="hw-hub-v5-panels hw-account-teacher-panels">' +
      '<div class="hw-hub-v5-panel is-active" id="hw-account-teacher-panel-profile" data-hw-account-panel="profile" role="tabpanel" aria-labelledby="hw-account-teacher-tab-profile">' +
      profileMarkup() +
      "</div>" +
      '<div class="hw-hub-v5-panel" id="hw-account-teacher-panel-subscription" data-hw-account-panel="subscription" role="tabpanel" aria-labelledby="hw-account-teacher-tab-subscription" hidden>' +
      subscriptionMarkup() +
      "</div>" +
      '<div class="hw-hub-v5-panel" id="hw-account-teacher-panel-notifications" data-hw-account-panel="notifications" role="tabpanel" aria-labelledby="hw-account-teacher-tab-notifications" hidden>' +
      notificationsMarkup() +
      "</div>" +
      "</div>";
    teacherHub.parentNode.insertBefore(app, teacherHub.nextSibling);
    if (!teacherAppBound) {
      teacherAppBound = true;
      app.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-hw-account-tab]");
        if (!btn || !app.contains(btn)) return;
        open(btn.getAttribute("data-hw-account-tab") || "profile", { replaceHash: true });
      });
    }
    return app;
  }

  function showTeacherOverlay(tab) {
    const app = ensureTeacherAccountApp();
    const teacherHub = document.getElementById("hw-teacher-hub");
    if (!app) return;
    if (teacherHub) teacherHub.hidden = true;
    app.hidden = false;
    showTeacherPanel(app, tab);
  }

  function hideTeacherOverlay() {
    const app = document.getElementById("hw-account-teacher-app");
    const teacherHub = document.getElementById("hw-teacher-hub");
    if (app) app.hidden = true;
    if (teacherHub && isTeacherHub()) teacherHub.hidden = false;
  }

  let studentOpenRetries = 0;

  function open(tab, options) {
    if (isStandalonePage()) return;
    const id = ACCOUNT_TABS.includes(tab) ? tab : "profile";
    const already = isOpen();
    document.body.classList.add("hw-account-mode");
    syncNav(true);
    if (!options?.fromHash) {
      setHash(id, already || options?.replaceHash ? "replace" : "push");
    }

    if (document.body.classList.contains("hw-role-student") && !global.HwHubV5Live) {
      if (studentOpenRetries < 40) {
        studentOpenRetries += 1;
        window.setTimeout(() => open(id, { fromHash: true }), 50);
      }
      return;
    }
    studentOpenRetries = 0;

    if (isStudentHub()) {
      hideTeacherOverlay();
      global.HwHubV5Live.enterAccountMode(id);
      fillSession();
      fillPlanCopy();
      return;
    }
    if (isTeacherHub()) {
      showTeacherOverlay(id);
    }
  }

  function close(options) {
    document.body.classList.remove("hw-account-mode");
    syncNav(false);
    if (!options?.fromHash) clearAccountHash();
    if (global.HwHubV5Live?.exitAccountMode) global.HwHubV5Live.exitAccountMode();
    hideTeacherOverlay();
  }

  function isOpen() {
    return document.body.classList.contains("hw-account-mode");
  }

  function maybeRedirectStandalone() {
    if (!isStandalonePage()) return;
    if (!session()) return;
    const parsed = parseHash();
    const dest = PLATFORM_PATH + hashForTab(parsed?.tab || "profile");
    global.location.replace(dest);
  }

  function onHubReady() {
    const parsed = parseHash();
    if (parsed) open(parsed.tab, { fromHash: true });
  }

  function openDeleteDialog() {
    const dialog = document.getElementById("hw-account-delete-dialog");
    const autoNote = document.getElementById("hw-account-delete-paypal-auto");
    const warn = document.getElementById("hw-account-delete-paypal-warn");
    const note = document.getElementById("hw-account-delete-paypal-note");
    const checkWrap = document.getElementById("hw-account-delete-paypal-check-wrap");
    const check = document.getElementById("hw-account-delete-paypal-check");
    const paid = hasPaidPlan();
    const autoCancel = paid && canAutoCancelPaypal();
    const needsManual = paid && !autoCancel;
    if (autoNote) autoNote.hidden = !autoCancel;
    if (warn) warn.hidden = !needsManual;
    if (note) note.hidden = !needsManual;
    if (checkWrap) checkWrap.hidden = !needsManual;
    if (check) check.checked = false;
    const pw = document.getElementById("hw-account-delete-password");
    if (pw) pw.value = "";
    setStatus(document.getElementById("hw-account-delete-status"), "", false);
    if (dialog) dialog.hidden = false;
  }

  function closeDeleteDialog() {
    const dialog = document.getElementById("hw-account-delete-dialog");
    if (dialog) dialog.hidden = true;
  }

  async function saveProfileChanges() {
    const status = document.getElementById("hw-account-save-status");
    const s = session();
    if (!s?.username) return;
    const displayName = stripHubSuffix(
      document.getElementById("hw-account-display-name")?.value || ""
    );
    const email = String(
      document.getElementById("hw-account-email-input")?.value || ""
    ).trim();
    const discordUserId = String(
      document.getElementById("hw-account-discord-id")?.value || ""
    ).trim();
    const password = String(
      document.getElementById("hw-account-old-password")?.value || ""
    );
    const newPassword = String(
      document.getElementById("hw-account-new-password")?.value || ""
    );
    if (!password) {
      setStatus(status, "Enter your current password to save.", true);
      document.getElementById("hw-account-old-password")?.focus();
      return;
    }
    setStatus(status, "Saving…", false);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: s.username,
          password,
          displayName,
          email,
          discordUserId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      if (data.session && global.HwAuth?.persistSession) {
        const remember = !!global.localStorage?.getItem?.("jlm-hw-session");
        global.HwAuth.persistSession(data.session, remember);
      }
      if (newPassword) {
        const pwRes = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: s.username,
            password,
            newPassword,
          }),
        });
        const pwData = await pwRes.json().catch(() => ({}));
        if (!pwRes.ok) throw new Error(pwData.error || "Could not update password.");
      }
      fillSession();
      setStatus(status, data.message || "Saved.", false);
    } catch (err) {
      setStatus(status, (err && err.message) || "Could not save.", true);
    }
  }

  async function deleteAccount() {
    const status = document.getElementById("hw-account-delete-status");
    const s = session();
    if (!s?.username) return;
    if (hasPaidPlan() && !canAutoCancelPaypal()) {
      const checked = document.getElementById("hw-account-delete-paypal-check");
      if (!checked?.checked) {
        setStatus(
          status,
          "Cancel your PayPal plan first, then check the box.",
          true
        );
        return;
      }
    }
    const password = String(
      document.getElementById("hw-account-delete-password")?.value || ""
    );
    if (!password) {
      setStatus(status, "Enter your password to delete this account.", true);
      return;
    }
    setStatus(status, "Deleting…", false);
    try {
      const res = await fetch("/api/auth/delete-own-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: s.username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete.");
      global.HwAuth?.logout?.();
      global.location.href = "/homework.html?deleted=1";
    } catch (err) {
      setStatus(status, (err && err.message) || "Could not delete.", true);
    }
  }

  function bind() {
    if (bound) return;
    bound = true;

    fillSession();

    document.addEventListener("click", (e) => {
      if (e.target.closest("#hw-account-edit")) {
        e.preventDefault();
        const panel = document.getElementById("hw-account-panel");
        const on = !panel?.classList.contains("is-editing");
        if (!on) fillSession();
        else setProfileEditing(true);
        return;
      }
      if (e.target.closest("#hw-account-delete-confirm")) {
        e.preventDefault();
        void deleteAccount();
        return;
      }
      if (e.target.closest("[data-hw-account-delete-close]")) {
        e.preventDefault();
        closeDeleteDialog();
        return;
      }
      if (e.target.closest("#hw-account-delete")) {
        e.preventDefault();
        openDeleteDialog();
        return;
      }
      if (e.target.closest("#hw-account-discord-help")) {
        e.preventDefault();
        const dialog = document.getElementById("hw-account-discord-help-dialog");
        if (dialog) dialog.hidden = false;
        return;
      }
      if (e.target.closest("[data-hw-account-discord-help-close]")) {
        e.preventDefault();
        const dialog = document.getElementById("hw-account-discord-help-dialog");
        if (dialog) dialog.hidden = true;
        return;
      }
      const notifyBtn = e.target.closest("[data-hw-notify]");
      if (notifyBtn) {
        e.preventDefault();
        const key = notifyBtn.getAttribute("data-hw-notify");
        if (key) toggleNotify(key);
        return;
      }
      const nav = e.target.closest("[data-hw-account-nav]");
      if (!nav) return;
      if (isStandalonePage()) return;
      e.preventDefault();
      if (isOpen()) close();
      else open("profile");
    });

    document.addEventListener("submit", (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.id === "hw-account-profile-form") {
        e.preventDefault();
        void saveProfileChanges();
      }
    });

    window.addEventListener("hashchange", () => {
      if (openFromHashLock) return;
      const parsed = parseHash();
      if (parsed) open(parsed.tab, { fromHash: true, replaceHash: true });
      else if (isOpen()) close({ fromHash: true });
    });
  }

  global.HwAccount = {
    parseHash,
    isAccountHash,
    hashForTab,
    setHash,
    profileMarkup,
    subscriptionMarkup,
    notificationsMarkup,
    fillSession,
    fillPlanCopy,
    paintAccountPlans,
    bindRoot: fillSession,
    open,
    close,
    isOpen,
    onHubReady,
    ACCOUNT_TABS,
  };

  maybeRedirectStandalone();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  if (!isStandalonePage()) {
    window.addEventListener("load", () => {
      if (parseHash()) onHubReady();
    });
  }
})(window);
