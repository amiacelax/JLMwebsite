/**
 * Role-aware script loader for homework/platform.html.
 * Shared deps are static <script defer>; this file (also defer) injects
 * teacher-only or student-only bundles with async=false so they download in
 * parallel, execute in order, then run platform + hub shells.
 */
(function (global) {
  "use strict";

  const session = global.HwAuth?.getSession?.();
  if (!session) return;

  const teacherSession = global.HwAuth.getTeacherSession?.();
  const viewingAsStudent = global.HwAuth.isViewingAsStudent?.() === true;
  const isTeacher = Boolean(teacherSession) && !viewingAsStudent;
  const studentSurface = !isTeacher;

  /** Keep versions in sync with former platform.html cache-busts.
   * builder: default typeInLabel "Type and record your answer" (2026-09-18).
   */
  const V = {
    wsCategories: "6",
    builder: "20260918-typein-label",
    editor: "20261005-mru5",
    studentList: "20260929-alpha",
    ideas: "20260610",
    mistakeFeed: "20260674",
    submissions: "20260914-review",
    flashcards: "20260928-noteslist-rec",
    teacherMistakes: "20260675",
    studentMistakes: "20261014-off",
    promo: "20261013b",
    birthdays: "20260805",
    lanternFormat: "20260650",
    lanternWords: "20260650",
    lookup: "24",
    missionary: "10",
    checkout: "20261009-close",
    sachiko: "20260694",
    quests: "22",
    questPuzzle: "5",
    workoutsData: "6",
    workouts: "12",
    localPeriod: "1",
    hubV5: "292",
    platform: "20261014-list",
    hubV6: "44",
    feedback: "11",
    glassDeck: "2",
  };

  function injectOrdered(urls) {
    urls.forEach((src) => {
      if (!src) return;
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      document.head.appendChild(s);
    });
  }

  const teacherScripts = [
    "/js/hw-ws-categories.js?v=" + V.wsCategories,
    "/js/hw-worksheet-builder.js?v=" + V.builder,
    "/js/hw-teacher-editor.js?v=" + V.editor,
    "/js/hw-student-list.js?v=" + V.studentList,
    "/js/hw-teacher-ideas.js?v=" + V.ideas,
    "/js/hw-mistake-feed.js?v=" + V.mistakeFeed,
    "/js/hw-teacher-submissions.js?v=" + V.submissions,
    "/js/hw-review-flashcards.js?v=" + V.flashcards,
    "/js/hw-teacher-mistakes.js?v=" + V.teacherMistakes,
    "/js/hw-teacher-promo.js?v=" + V.promo,
    "/js/hw-teacher-birthdays.js?v=" + V.birthdays,
    /* lantern word data files are lazy-loaded by hw-teacher-lantern-words.js */
    "/js/lantern-word-format.js?v=" + V.lanternFormat,
    "/js/hw-teacher-lantern-words.js?v=" + V.lanternWords,
    "/js/hw-teacher-lookup-lexicon.js?v=" + V.lookup,
    "/js/hw-missionary-curriculum.js?v=" + V.missionary,
    "/js/hw-glass-deck.js?v=" + V.glassDeck,
  ];

  const studentScripts = [
    "/js/hw-local-period.js?v=" + V.localPeriod,
    "/js/hw-mistake-feed.js?v=" + V.mistakeFeed,
    "/js/hw-student-mistakes.js?v=" + V.studentMistakes,
    "/js/hw-checkout.js?v=" + V.checkout,
    "/js/hw-sachiko.js?v=" + V.sachiko,
    "/js/hw-hub-feedback.js?v=" + V.feedback,
    "/js/hw-swipe-delete.js?v=1",
    "/js/hw-hub-quests.js?v=" + V.quests,
    "/js/hw-quest-puzzle.js?v=" + V.questPuzzle,
    "/js/hw-weekly-workouts-data.js?v=" + V.workoutsData,
    "/js/hw-hub-workouts.js?v=" + V.workouts,
    "/js/hw-curriculum-textbook.js?v=37",
  ];

  /** View-as needs the student picker on the teacher chrome. */
  const viewAsExtras = ["/js/hw-student-list.js?v=" + V.studentList];

  const tail = ["/js/hw-platform.js?v=" + V.platform];

  if (studentSurface && global.__JLM_HUB_V5) {
    tail.push("/js/hw-hub-v5-live.js?v=" + V.hubV5);
  }

  if (isTeacher && global.HwFeatureFlags?.hubV6?.() === true) {
    tail.push("/js/hw-hub-v6.js?v=" + V.hubV6);
  }

  const queue = [];
  if (isTeacher) {
    queue.push(...teacherScripts);
  } else if (viewingAsStudent) {
    queue.push(...viewAsExtras, ...studentScripts);
  } else {
    queue.push(...studentScripts);
  }
  queue.push(...tail);

  injectOrdered(queue);
})(window);
