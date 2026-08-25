/**
 * Live student worksheet floating toolbar (Glass · Cloud · Focus · See Answers · Send).
 * Port of Hub v5 Toolbar playtest chrome — mount scale via CSS (hw-hub-v5.css); no playtestReady fakes.
 */
(function (global) {
  "use strict";

  const ROOT_CLASS = "hw-ws-toolbar";
  /** Phone widths — match Hub mobile tabs / Glass coarse breakpoint. */
  const MOBILE_ARM_MQ = "(max-width: 767px)";
  let boundForm = null;
  let slideHandler = null;
  let inputHandler = null;
  let changeHandler = null;
  let answerHandler = null;
  let fsHandler = null;
  let armChangeHandler = null;
  let mobileArmMq = null;
  let mobileArmMqHandler = null;

  function barEl() {
    return document.getElementById("hw-toolbar-bar");
  }

  /**
   * Glass + Cloud: every viewport arms from the toolbar icon
   * (same as mobile — no floating lens/launcher fling).
   */
  function usesToolbarDirectArm() {
    return true;
  }

  /** Glass: every viewport — toolbar click arms/disarms; floating lens stays tucked. */
  function usesGlassDirectArm() {
    return true;
  }

  /** Cloud: every viewport — toolbar click arms/disarms; floating launcher stays tucked. */
  function usesCloudDirectArm() {
    return true;
  }

  function isGlassArmed() {
    return !!document.querySelector(".hw-mg-host.hw-mg-armed");
  }

  function isCloudArmed() {
    return !!document.querySelector(".hw-hc-host.hw-hc-armed");
  }

  function worksheetFormEl(form) {
    return (
      form ||
      boundForm ||
      document.querySelector("#hw-v2-worksheet-mount form.hw-worksheet") ||
      document.getElementById("hw-worksheet-form")
    );
  }

  function worksheetToolHostEl(form) {
    const f = worksheetFormEl(form);
    return (
      f?.closest(".hw-hub-v2-worksheet") ||
      document.getElementById("hw-v5-worksheet-card") ||
      f?.parentElement ||
      null
    );
  }

  function isGlassPopped() {
    return document.documentElement.classList.contains("hw-tb-glass-out");
  }

  function isCloudPopped() {
    return document.documentElement.classList.contains("hw-tb-cloud-out");
  }

  function setGlassPopped(on) {
    document.documentElement.classList.toggle("hw-tb-glass-out", !!on);
    if (!on) {
      global.HwMagnifyingGlass?.setArmed?.(false);
      return;
    }
    global.HwMagnifyingGlass?.refresh?.();
  }

  function setCloudPopped(on) {
    document.documentElement.classList.toggle("hw-tb-cloud-out", !!on);
    if (!on) {
      global.HwHomeworkComments?.disarm?.();
      return;
    }
    global.HwHomeworkComments?.applyLauncherPosition?.();
  }

  function syncToolbarActionState(form) {
    const f = worksheetFormEl(form);
    const bar = barEl();
    if (!bar) return;
    const sendBtn = bar.querySelector('[data-tb-tool="send"]');
    const answersBtn = bar.querySelector('[data-tb-tool="answers"]');
    const focusBtn = bar.querySelector('[data-tb-tool="focus"]');
    const glassBtn = bar.querySelector('[data-tb-tool="glass"]');
    const cloudBtn = bar.querySelector('[data-tb-tool="cloud"]');
    const formSend = f?.querySelector('.hw-worksheet__actions-submit button[type="submit"]');
    const formAnswers = f?.querySelector("[data-hw-see-answers]");
    const readOnly = f?.classList.contains("hw-worksheet--readonly") || f?.dataset.hwReadOnly === "true";
    /* Same completion gate as playtest: all blanks filled → Send + See Answers appear together. */
    const sendReady = Boolean(!readOnly && formSend && !formSend.disabled);
    const answersReady = sendReady;

    if (sendBtn) {
      sendBtn.disabled = !formSend || formSend.disabled || readOnly;
      sendBtn.setAttribute("data-tb-tone", sendReady ? "ready" : "muted");
      sendBtn.classList.toggle("is-ready", sendReady);
      sendBtn.setAttribute("aria-hidden", sendReady ? "false" : "true");
      if (sendReady) sendBtn.removeAttribute("tabindex");
      else sendBtn.setAttribute("tabindex", "-1");
    }
    if (answersBtn) {
      const locked = readOnly || !formAnswers || formAnswers.hidden || formAnswers.disabled;
      answersBtn.disabled = locked;
      answersBtn.classList.toggle("is-ready", answersReady);
      answersBtn.classList.toggle("answers-ready", answersReady);
      answersBtn.setAttribute("data-tb-tone", answersReady ? "gold" : "muted");
      answersBtn.setAttribute("aria-hidden", answersReady ? "false" : "true");
      if (answersReady) answersBtn.removeAttribute("tabindex");
      else answersBtn.setAttribute("tabindex", "-1");
      answersBtn.setAttribute(
        "aria-pressed",
        formAnswers?.getAttribute("aria-pressed") === "true" ? "true" : "false"
      );
      const label = answersBtn.querySelector(".hw-toolbar-bar__label");
      if (label && formAnswers) {
        label.textContent =
          formAnswers.getAttribute("aria-pressed") === "true" ? "Hide Answers" : "See Answers";
      }
    }
    if (focusBtn) {
      focusBtn.disabled = readOnly;
      focusBtn.setAttribute(
        "aria-pressed",
        document.body.classList.contains("hw-hw-focus-mode") ? "true" : "false"
      );
    }
    if (glassBtn) {
      glassBtn.disabled = !(
        global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.attachTo
      );
      const glassOn = usesGlassDirectArm() ? isGlassArmed() : isGlassPopped();
      glassBtn.setAttribute("aria-pressed", glassOn ? "true" : "false");
    }
    if (cloudBtn) {
      cloudBtn.disabled = !(
        global.HwFeatureFlags?.homeworkComments?.() && global.HwHomeworkComments?.attachTo
      );
      const cloudOn = usesCloudDirectArm() ? isCloudArmed() : isCloudPopped();
      cloudBtn.setAttribute("aria-pressed", cloudOn ? "true" : "false");
    }
    global.HwToolbarQIcons?.applyToToolbar?.(bar);
    global.HwWorksheetToolLayout?.clearMobileToolbarHome?.(barEl());
  }

  function findHwBoxCard() {
    return (
      document.getElementById("hw-v5-worksheet-card") ||
      document.querySelector("#hw-hub-v4-homework .hw-hub-v2-worksheet") ||
      document.querySelector(".hw-hub-v2-worksheet.hw-hub-worksheet-card") ||
      document.querySelector(".hw-hub-v2-worksheet")
    );
  }

  /**
   * Sit the toolbar under the HW content, inside the blue grammar box
   * (sibling after the mount, still on the card). PC + mobile.
   * Call park() before mount.innerHTML clears so remount cannot destroy the bar.
   */
  function placeToolbarUnderHwBox(form) {
    void form;
    const bar = ensureBar();
    const card = findHwBoxCard();
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    if (!bar || !card) return;
    const anchor = mount && card.contains(mount) ? mount : null;
    if (anchor) {
      if (bar.previousElementSibling === anchor && bar.parentElement === card) {
        global.HwWorksheetToolLayout?.clearMobileToolbarHome?.(bar);
        return;
      }
      anchor.after(bar);
    } else if (bar.parentElement !== card) {
      card.appendChild(bar);
    }
    global.HwWorksheetToolLayout?.clearMobileToolbarHome?.(bar);
  }

  /** Keep the bar inside the blue box, outside the mount, before mount.innerHTML clears. */
  function park() {
    const bar = barEl();
    if (!bar) return;
    const card = findHwBoxCard();
    if (!card) return;
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    if (mount && card.contains(mount)) {
      if (bar.previousElementSibling !== mount || bar.parentElement !== card) mount.after(bar);
    } else if (bar.parentElement !== card) {
      card.appendChild(bar);
    }
    global.HwWorksheetToolLayout?.clearMobileToolbarHome?.(bar);
  }

  function ensureBar() {
    let bar = barEl();
    if (bar) return bar;
    const card = findHwBoxCard();
    if (!card) return null;
    bar = document.createElement("nav");
    bar.className = "hw-toolbar-bar";
    bar.id = "hw-toolbar-bar";
    bar.setAttribute("aria-label", "Worksheet tools");
    bar.hidden = true;
    bar.innerHTML =
      '<button type="button" class="hw-toolbar-bar__btn" data-tb-tool="glass" title="Highlight a word" aria-label="Highlight a word" aria-pressed="false">' +
      '<span class="hw-toolbar-bar__icon hw-toolbar-bar__icon--glass" aria-hidden="true">' +
      '<svg class="hw-toolbar-bar__glass" xmlns="http://www.w3.org/2000/svg" viewBox="-18 -28 148 170" fill="none">' +
      '<g transform="rotate(-40 50 55)" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M50 -11.5V-13.5"/><path d="M-9 52A59 59 0 0 1 109 52A59 59 0 0 1 93.85 91.48"/>' +
      '<path d="M11.85 60.11A39 39 0 1 1 50 91"/><path d="M50 91V125"/><path d="M36 103H64"/>' +
      '<path d="M50 125V133Q49 137 46.5 136Q45 134.5 46 131"/></g></svg></span></button>' +
      '<button type="button" class="hw-toolbar-bar__btn" data-tb-tool="cloud" title="Write a note/question" aria-label="Write a note/question" aria-pressed="false">' +
      '<span class="hw-toolbar-bar__icon hw-toolbar-bar__icon--cloud" aria-hidden="true">' +
      '<svg class="hw-toolbar-bar__cloud" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 48">' +
      '<g fill="currentColor"><circle cx="22" cy="28" r="13"/><circle cx="40" cy="21" r="16"/>' +
      '<circle cx="58" cy="28" r="12"/><rect x="12" y="26" width="56" height="15" rx="7.5"/></g></svg></span></button>' +
      '<button type="button" class="hw-toolbar-bar__btn" data-tb-tool="focus" title="Focus Mode">' +
      '<span class="hw-toolbar-bar__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><circle cx="12" cy="12" r="3"/></svg></span></button>' +
      '<button type="button" class="hw-toolbar-bar__btn" data-tb-tool="answers" title="See Answers">' +
      '<span class="hw-toolbar-bar__icon hw-toolbar-bar__icon--answers" aria-hidden="true"></span></button>' +
      '<button type="button" class="hw-toolbar-bar__btn" data-tb-tool="send" title="Send">' +
      '<span class="hw-toolbar-bar__icon hw-toolbar-bar__icon--send" aria-hidden="true">' +
      '<span class="hw-toolbar-bar__send-wake" aria-hidden="true">' +
      '<span class="hw-toolbar-bar__send-streak"></span><span class="hw-toolbar-bar__send-streak"></span>' +
      '<span class="hw-toolbar-bar__send-streak"></span></span>' +
      '<svg class="hw-toolbar-bar__send" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">' +
      '<path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></span></button>';
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    if (mount && card.contains(mount)) mount.after(bar);
    else card.appendChild(bar);
    delete bar.dataset.bound;
    global.HwToolbarQIcons?.applyToToolbar?.(bar);
    return bar;
  }

  /** One toolbar tap arms/disarms Glass — no floating lens on the sheet. */
  function toggleGlassArmFromToolbar() {
    const next = !isGlassArmed();
    /* Keep floating Glass tucked (desktop used to fling it out). */
    document.documentElement.classList.remove("hw-tb-glass-out");
    global.HwMagnifyingGlass?.setArmed?.(next);
    syncToolbarActionState();
  }

  /** One toolbar tap arms/disarms Cloud — no floating launcher on the sheet. */
  function toggleCloudArmFromToolbar() {
    const next = !isCloudArmed();
    /* Keep floating Cloud tucked (desktop used to fling it out). */
    document.documentElement.classList.remove("hw-tb-cloud-out");
    if (next) {
      global.HwHomeworkComments?.setArmed?.(true);
    } else {
      global.HwHomeworkComments?.disarm?.();
    }
    syncToolbarActionState();
  }

  function toggleGlassFromToolbar(_glassBtn) {
    toggleGlassArmFromToolbar();
  }

  function toggleCloudFromToolbar(_cloudBtn) {
    toggleCloudArmFromToolbar();
  }

  /** Crossing phone↔desktop: drop float/arm so modes stay clean. */
  function onMobileArmBreakpointChange() {
    setGlassPopped(false);
    setCloudPopped(false);
    global.HwMagnifyingGlass?.setArmed?.(false);
    global.HwHomeworkComments?.disarm?.();
    syncToolbarActionState();
  }

  function bindToolbarActions() {
    const bar = barEl();
    if (!bar || bar.dataset.bound === "1") return;
    bar.dataset.bound = "1";
    bar.addEventListener("click", (ev) => {
      const btn = ev.target.closest?.("[data-tb-tool]");
      if (!btn || btn.disabled || btn.getAttribute("aria-disabled") === "true" || !bar.contains(btn)) {
        return;
      }
      const tool = btn.getAttribute("data-tb-tool");
      const form = worksheetFormEl();
      if (tool === "focus") {
        if (document.body.classList.contains("hw-hw-focus-mode")) {
          global.HwWorksheet?.exitFocusMode?.();
        } else {
          form?.querySelector("[data-hw-focus]")?.click();
        }
        syncToolbarActionState();
        return;
      }
      if (tool === "send") {
        form?.querySelector('.hw-worksheet__actions-submit button[type="submit"]')?.click();
        syncToolbarActionState();
        return;
      }
      if (tool === "answers") {
        const answers = form?.querySelector("[data-hw-see-answers]");
        if (answers && !answers.disabled && !answers.hidden) answers.click();
        else if (form) global.HwWorksheet?.toggleTeacherAnswers?.(form);
        syncToolbarActionState();
        return;
      }
      if (tool === "glass") {
        toggleGlassFromToolbar(btn);
        return;
      }
      if (tool === "cloud") {
        toggleCloudFromToolbar(btn);
      }
    });
    if (!fsHandler) {
      fsHandler = () => syncToolbarActionState();
      document.addEventListener("fullscreenchange", fsHandler);
    }
    if (!armChangeHandler) {
      armChangeHandler = () => syncToolbarActionState();
      document.addEventListener("hw-tool-arm-change", armChangeHandler);
    }
    if (!mobileArmMqHandler) {
      try {
        mobileArmMq = window.matchMedia(MOBILE_ARM_MQ);
        mobileArmMqHandler = () => onMobileArmBreakpointChange();
        if (mobileArmMq.addEventListener) {
          mobileArmMq.addEventListener("change", mobileArmMqHandler);
        } else if (mobileArmMq.addListener) {
          mobileArmMq.addListener(mobileArmMqHandler);
        }
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Mount glass + cloud tucked until toolbar pop-out (same behavior as Toolbar playtest).
   * When skipAttach is true, only tuck existing widgets (e.g. after review attach).
   */
  function attachWorksheetTools(form, options) {
    options = options || {};
    const f = worksheetFormEl(form);
    if (!f) return;
    const host = worksheetToolHostEl(f);
    const username = options.username || "";
    const assignmentId =
      options.assignmentId || f.getAttribute("data-assignment-id") || "";

    if (!options.skipAttach) {
      if (global.HwFeatureFlags?.homeworkComments?.() && global.HwHomeworkComments?.attachTo) {
        global.HwHomeworkComments.attachTo(f, {
          username,
          assignmentId,
          readOnly: !!options.readOnly,
          submissionId: options.submissionId || "",
          studentReviewed: !!options.studentReviewed,
          initialComments: options.initialComments,
          initialQuestionMarks: options.initialQuestionMarks,
          onStudentAckNotes: options.onStudentAckNotes || null,
          skipOnboarding: true,
          useModeNeutrals: true,
          /* v4: normal listen-mid stack; bump clears stale high/spread normals. */
          launcherStorageKey: "hw-hc-student-toolbar-v4",
          /* Fallback before layout measure — Focus left-edge stack. */
          defaultLauncher: { x: 0, y: 579 },
        });
        global.HwWorksheetToolLayout?.ensureFocusNeutralWatch?.();
      }

      if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.attachTo && host) {
        global.HwMagnifyingGlass.attachTo(host, {
          skipOnboarding: true,
          useModeNeutrals: true,
          /* v5: normal listen-mid stack; bump clears stale high/spread normals. */
          storageKey: "hw-mg-student-toolbar-v5",
          defaultLens: { x: 0, y: 497 },
        });
        global.HwWorksheetToolLayout?.ensureFocusNeutralWatch?.();
      } else if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.refresh) {
        global.HwMagnifyingGlass.refresh();
      }
    }

    setGlassPopped(false);
    setCloudPopped(false);
    global.HwWorksheetToolLayout?.ensureSaveHomesControl?.();
  }

  function unbindFormListeners() {
    if (!boundForm) return;
    if (inputHandler) boundForm.removeEventListener("input", inputHandler);
    if (changeHandler) boundForm.removeEventListener("change", changeHandler);
    if (answerHandler) boundForm.removeEventListener("hw-worksheet-answer", answerHandler);
    if (slideHandler) boundForm.removeEventListener("hw-worksheet-slide", slideHandler);
    inputHandler = changeHandler = answerHandler = slideHandler = null;
    boundForm = null;
  }

  function bindFormListeners(form) {
    unbindFormListeners();
    boundForm = form;
    inputHandler = () => syncToolbarActionState(form);
    changeHandler = () => syncToolbarActionState(form);
    answerHandler = () => syncToolbarActionState(form);
    slideHandler = () => {
      placeToolbarUnderHwBox(form);
      syncToolbarActionState(form);
    };
    form.addEventListener("input", inputHandler);
    form.addEventListener("change", changeHandler);
    form.addEventListener("hw-worksheet-answer", answerHandler);
    form.addEventListener("hw-worksheet-slide", slideHandler);
  }

  /**
   * Activate the floating bar for a mounted student worksheet form.
   * @param {HTMLFormElement} form
   * @param {{
   *   username?: string,
   *   assignmentId?: string,
   *   readOnly?: boolean,
   *   skipAttach?: boolean,
   *   submissionId?: string,
   *   studentReviewed?: boolean,
   *   initialComments?: unknown,
   *   onStudentAckNotes?: Function|null,
   * }} [options]
   */
  function mount(form, options) {
    options = options || {};
    const bar = barEl();
    if (!form || !bar) return false;

    document.documentElement.classList.add(ROOT_CLASS);
    document.body.classList.add(ROOT_CLASS);
    bar.hidden = false;
    global.HwToolbarQIcons?.applyToToolbar?.(bar);

    bindToolbarActions();
    bindFormListeners(form);
    attachWorksheetTools(form, options);
    placeToolbarUnderHwBox(form);
    syncToolbarActionState(form);
    return true;
  }

  function unmount() {
    unbindFormListeners();
    setGlassPopped(false);
    setCloudPopped(false);
    park();
    const bar = barEl();
    if (bar) {
      global.HwWorksheetToolLayout?.clearMobileToolbarHome?.(bar);
      bar.hidden = true;
    }
    document.documentElement.classList.remove(ROOT_CLASS);
    document.body.classList.remove(ROOT_CLASS);
  }

  global.HwStudentToolbar = {
    mount,
    unmount,
    park,
    sync: syncToolbarActionState,
    place: placeToolbarUnderHwBox,
    isActive: () => document.documentElement.classList.contains(ROOT_CLASS),
  };
})(window);
