/**
 * Japanese Missionary Curriculum — conversation textbook / instruction manual.
 * Teacher tracker: checkboxes + notes. Mounts into #hw-missionary-root.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "jlm-missionary-curriculum-v1";
  const ROOT_ID = "hw-missionary-root";

  /**
   * Textbook spine: past tense first (strongest for conversation), then deepen.
   * Every unit aims at: (1) HW online to complete, (2) real-life use
   * (situation cards, self-quiz, street talk).
   */
  const SECTIONS = [
    {
      id: "how-this-works",
      book: "How this works",
      title: "Learn & speak first — grammar later",
      lede: "Get talk down. Flesh out grammar when they need bigger answers. Every unit: HW + real life.",
      items: [
        {
          id: "pillar-hw",
          label: "HW online to complete",
          hint: "Every unit gets a finishable Homework Hub sheet (record / type / check).",
          notesRows: 3,
        },
        {
          id: "pillar-real-life",
          label: "Real-life applicability",
          hint: "Situation cards, self-quiz, street talk — not just worksheets.",
          notesRows: 3,
        },
        {
          id: "pillar-past-first",
          label: "Past tense first (した)",
          hint: "Simple た・だ before future / してる / negatives.",
          notesRows: 2,
        },
      ],
    },
    {
      id: "rules",
      book: "0 · Strategies (forever)",
      title: "Conversation rules — refer back always",
      lede: "Each rule needs HW.",
      items: [
        {
          id: "rule-repeat",
          label: "The Repeat Rule",
          hint: "Needs HW.",
          notesRows: 2,
        },
        {
          id: "rule-katakana",
          label: "The Katakana Rule",
          hint: "Needs HW.",
          notesRows: 2,
        },
        {
          id: "rule-talk-now",
          label: "Talk now, worry later",
          hint: "Needs HW.",
          notesRows: 2,
        },
        {
          id: "rule-one-way",
          label: "One way to say",
          hint: "Needs HW. Default one phrase — even いそがしい.",
          notesRows: 3,
        },
        {
          id: "rule-daily-prayer",
          label: "Daily prayer — praying like a child",
          hint: "Every day, from day 1. 神様、 / ごめんなさい。 / ありがとうございます。 / 日本語うまくなりたいです。助けてください。 / イエスキリストの名前によって祈ります。",
          notesRows: 4,
        },
      ],
    },
    {
      id: "learn-speak-spine",
      book: "Learn & speak spine",
      title: "1 → 11 (in order)",
      lede: "Speak first. Name the system later (Four Types at 7). Conjugation explanations last.",
      items: [
        {
          id: "b1-intro",
          label: "1. 自己紹介",
          hint: "お名前は？何才？どこに住んでる？お仕事は？趣味は？ + sit cards / spouse / train.",
          notesRows: 3,
        },
        {
          id: "b1-shita",
          label: "2. した — past (た・だ)",
          hint: "今日は何をした？昨日？月曜日？ Keep explanation simple.",
          notesRows: 3,
        },
        {
          id: "b1-gospel",
          label: "After 2. Gospel — one way to say it",
          hint: "Teach once they can say した. Memorize: 私たちはいい人じゃない。 / 自分の力で、私は天国に行けない。 / イエス様は神様。 / イエス様は私たちのつみのために死にました。 / そして、よみがえりました。 / このことを信じれば〇〇さんも救われます。 Longer lines only when teaching with the pictures: 悪いことしたことありますか？みんな罪人です。 / 自分の力で天国に行けないです。どんなにいい人でも、天国に行けないです。 / イエスは神さまである。 / イエスが私たちのかわりに死にました。でも、蘇られて、今も生きています。 / 今言ったことを信じたら、○○さんも救われます。",
          notesRows: 6,
        },
        {
          id: "b1-suru",
          label: "3. する — future / invite (る・ます)",
          hint: "Plans + invites. Sit cards: ramen place with friend; Christmas church event with neighbor. Needs HW.",
          notesRows: 4,
        },
        {
          id: "b1-shiteru",
          label: "4. してる",
          notesRows: 2,
        },
        {
          id: "b1-neg-past",
          label: "5. Negative plain past",
          hint: "しなかった・食べなかった…",
          notesRows: 2,
        },
        {
          id: "b1-neg-future",
          label: "6. Negative future",
          hint: "しない・食べない…",
          notesRows: 2,
        },
        {
          id: "lesson-four-types",
          label: "7. Four Types of Japanese",
          hint: "They’ve been using these — now name the map.",
          notesRows: 3,
        },
        {
          id: "b1-mashou",
          label: "8. ましょう",
          hint: "Sit cards (Let’s go / let’s see a movie) — not made yet.",
          notesRows: 2,
        },
        {
          id: "b1-i-adj",
          label: "9. い-adjectives + conjugation",
          notesRows: 3,
        },
        {
          id: "b1-na-noun",
          label: "10. Nouns & な-adjectives + conjugation",
          notesRows: 3,
        },
        {
          id: "b1-verb-conj",
          label: "11. Verb conjugation explanation",
          hint: "Fuller system once the talk is already down.",
          notesRows: 3,
        },
      ],
    },
    {
      id: "spine-lessons-parked",
      book: "Parked / later",
      title: "Old “teach early” leftovers",
      items: [
        { id: "lesson-three-conjugate", label: "Three Ways to Conjugate Japanese (merge into 11?)" },
        {
          id: "gram-conjugation",
          label: "Conjugation = #1 skill (merge into 11?)",
        },
      ],
    },
    {
      id: "book1-time-spine",
      book: "Parked / later",
      title: "Extra day-talk (optional deepen)",
      items: [
        {
          id: "b1-goji-shiteta",
          label: "５時に何をしてた？",
          notesRows: 2,
        },
      ],
    },
    {
      id: "book1-people",
      book: "Book 1 — Time & your day (past first)",
      title: "Describing stuff and people",
      lede: "Makes 自己紹介 deeper — not just name/job, but who people are.",
      items: [
        {
          id: "b1-people-prompt",
          label: "～はどんな人？",
          hint: "彼女・彼氏・旦那さん・奥さん・お母さん・お父さん・おじいちゃん・おばあちゃん・息子・娘",
          notesRows: 3,
        },
        {
          id: "b1-adj-starter",
          label: "Starter adjectives",
          hint: "優しい・おもしろい・かっこいい・かわいい・親切・まじめ・元気・静か・忙しい・明るい・厳しい・おもしろい系 — expand toward the 100-adj list.",
          notesRows: 3,
        },
        {
          id: "b1-deeper-jiko",
          label: "Deeper 自己紹介 using people + adjectives",
          hint: "Hook: talk about family / partner / roommate so intro isn’t flat.",
          notesRows: 2,
        },
      ],
    },
    {
      id: "book1-top5-grammar",
      book: "Book 1 — Time & your day (past first)",
      title: "Top-5 grammar (don’t bury these)",
      items: [
        {
          id: "gram-mou-mada",
          label: "もう・まだ",
          hint: "Top-5 first grammar. もう食べた？ / まだ食べてない。",
          notesRows: 2,
        },
        {
          id: "gram-koto-aru",
          label: "～ことある",
          hint: "Top-5. Have you ever…? 食べたことある？行ったことある？",
          notesRows: 2,
        },
      ],
    },
    {
      id: "book2-question-how",
      book: "Book 2 — Question words",
      title: "どう？ / どうだった？",
      items: [
        { id: "q-nihon-dou", label: "日本はどう？慣れた？" },
        { id: "q-eiga-dou-datta", label: "映画はどうだった？" },
        {
          id: "q-dou-more",
          label: "More どう / どうだった prompts",
          hint: "授業は？仕事は？週末は？その店は？",
          notesRows: 2,
        },
      ],
    },
    {
      id: "book2-question-when",
      book: "Book 2 — Question words",
      title: "いつ / 何時",
      items: [
        { id: "q-tanjoubi-itsu", label: "誕生日いつ？" },
        { id: "q-itsukara-itsumade", label: "いつから？いつまで？" },
        { id: "q-nanji-ni-kara-made", label: "何時に？何時から？何時まで？" },
        {
          id: "q-ima-nanji",
          label: "すみません、今何時ですか？",
          hint: "Also a Situation Card: ask a random person what time it is.",
          notesRows: 2,
        },
        {
          id: "sit-ima-nanji",
          label: "Situation card: What time is it? (to a stranger)",
          hint: "Print / deck card for street practice of すみません、今何時ですか？",
          notesRows: 3,
        },
      ],
    },
    {
      id: "book2-question-what",
      book: "Book 2 — Question words",
      title: "何 — 何の？ (give them 10)",
      lede: "Students get a fixed set of なんの questions so they can fire them in real talk.",
      items: [
        { id: "q-nanno-1", label: "何の仕事？" },
        { id: "q-nanno-2", label: "何の映画？" },
        { id: "q-nanno-3", label: "何の本？" },
        { id: "q-nanno-4", label: "何のスポーツ？" },
        { id: "q-nanno-5", label: "何の音楽？" },
        { id: "q-nanno-6", label: "何の料理？" },
        { id: "q-nanno-7", label: "何の話？" },
        { id: "q-nanno-8", label: "何の日？（何の日ですか）" },
        { id: "q-nanno-9", label: "何のアプリ？" },
        { id: "q-nanno-10", label: "何の会社？" },
      ],
    },
    {
      id: "book2-question-where",
      book: "Book 2 — Question words",
      title: "Where — どこ",
      items: [
        { id: "q-doko-no-hito", label: "どこの人？" },
        { id: "q-doko-ni-aru", label: "どこにある？" },
        { id: "q-doko-de-deatta", label: "どこで出会った？" },
        { id: "q-doko-ni-sumeru", label: "どこに住んでる？" },
        { id: "q-doko-kara-kita", label: "どこから来た？" },
        { id: "q-doko-ga-ii", label: "どこがいい？" },
      ],
    },
    {
      id: "book2-question-who",
      book: "Book 2 — Question words",
      title: "Who — だれ",
      items: [
        { id: "q-dare-kono-hito", label: "この人だれ？" },
        { id: "q-dare-to-itta", label: "だれと行った？" },
        { id: "q-dare-ga-tsukutta", label: "だれが作った？" },
        { id: "q-dare-ni-kiita", label: "だれに聞いた？" },
        { id: "q-dareka-iru", label: "だれかいる？" },
        { id: "q-dare-no", label: "これはだれの？" },
      ],
    },
    {
      id: "book2-question-why",
      book: "Book 2 — Question words",
      title: "Why — なんで / どうして",
      items: [
        { id: "q-nande-nihon", label: "なんで日本に来た？" },
        { id: "q-doushite", label: "どうして…？" },
        { id: "q-nande-benkyou", label: "なんで日本語勉強してる？" },
        { id: "q-doushite-koko", label: "どうしてここにした？" },
        { id: "q-nande-okureta", label: "なんで遅れた？" },
        { id: "q-doushite-katta", label: "どうして買った？" },
        { id: "q-nande-yameta", label: "なんでやめた？" },
      ],
    },
    {
      id: "book3-but-and-because",
      book: "Book 3 — But, and, because (+ soft permission)",
      title: "Connectors & “anything’s fine”",
      lede: "Next book after question words. Glue sentences together; keep it street-usable.",
      items: [
        { id: "b3-dokodemo-ii", label: "どこでもいい" },
        { id: "b3-nandemo-ii", label: "なんでもいい" },
        {
          id: "b3-teii",
          label: "ていい？ / てもいいよ / ても大丈夫",
          notesRows: 2,
        },
        { id: "b3-kedo", label: "けど・だけど・でも" },
        { id: "b3-dakara", label: "だから・から (because)" },
        { id: "b3-tara", label: "if — たら" },
        {
          id: "b3-toki",
          label: "when — とき / ときに / のとき",
          notesRows: 2,
        },
        {
          id: "b3-more-later",
          label: "More Book 3 ideas (park here)",
          hint: "You’ll think of more later — dump them in notes.",
          notesRows: 4,
        },
      ],
    },
    {
      id: "sit-cards",
      book: "Tools — Situation Cards",
      title: "Situation Cards",
      lede: "Real-life pillar. Every spine unit should spawn cards, not only worksheets.",
      items: [
        { id: "sit-complete-set", label: "Make a complete set" },
        {
          id: "sit-print-design",
          label: "Print design",
          hint: "Front/back? EN? JP? Simple? How do they use them?",
          notesRows: 4,
        },
        {
          id: "sit-self-quiz",
          label: "Self-quiz strategies",
          hint: "How missionaries quiz themselves with cards when alone.",
          notesRows: 3,
        },
      ],
    },
    {
      id: "core-lists",
      book: "Tools — Core lists (bake into everything)",
      title: "100s — not a separate class",
      lede: "Core Japanese is the word page (Quizlet sets 1–7, plus つまり, 例えば, わざと). Bake those into lessons, sit cards, daily stories, and grammar — never a silo.",
      items: [
        {
          id: "list-100-kanji",
          label: "First 100 kanji (except numbers)",
          notesRows: 3,
        },
        { id: "list-100-verbs", label: "100 verbs to memorize", notesRows: 3 },
        { id: "list-100-adjectives", label: "100 adjectives", notesRows: 3 },
        { id: "list-100-nouns", label: "100 nouns", notesRows: 3 },
        { id: "core-tsumari", label: "つまり" },
        { id: "core-tatoeba", label: "例えば" },
        { id: "core-toriaezu", label: "とりあえず" },
        { id: "core-wazato", label: "わざと" },
      ],
    },
    {
      id: "parking-grammar",
      book: "Later / parking lot",
      title: "More grammar for convo (queue)",
      lede: "Keep these visible so they don’t get lost — slot into books when ready.",
      items: [
        { id: "gram-mae-ato", label: "～前・～あと" },
        { id: "gram-mashou", label: "ましょう" },
        { id: "gram-tekudasai", label: "てください・て" },
        {
          id: "gram-tekureru",
          label: "てくれる・てあげる・てもらう",
          hint: "Ben M lesson: great advice on あげる・くれる・もらう. Bring this up the next time we do videos.",
          notesRows: 3,
        },
        { id: "gram-sou", label: "～そう" },
        { id: "gram-temo", label: "ても — even if" },
        { id: "gram-noni", label: "のに — even though" },
        { id: "gram-magnet-wood", label: "Magnet / Wood (last one)" },
      ],
    },
  ];

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { done: {}, notes: {}, projectNotes: "" };
      const parsed = JSON.parse(raw);
      return {
        done: parsed.done && typeof parsed.done === "object" ? parsed.done : {},
        notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
        projectNotes: typeof parsed.projectNotes === "string" ? parsed.projectNotes : "",
      };
    } catch {
      return { done: {}, notes: {}, projectNotes: "" };
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function countProgress(state) {
    let total = 0;
    let done = 0;
    SECTIONS.forEach((sec) => {
      sec.items.forEach((item) => {
        total += 1;
        if (state.done[item.id]) done += 1;
      });
    });
    return { total, done };
  }

  function render(root, state) {
    const { total, done } = countProgress(state);
    let html =
      '<header class="hw-missionary__head">' +
      '<h2 class="hw-missionary__title">Japanese Missionary Curriculum</h2>' +
      '<p class="hw-missionary__lede">Conversation textbook / instruction manual. Past tense first. Every unit: HW online + real-life use. Check items off as you build — notes stay on this browser.</p>' +
      '<p class="hw-missionary__progress" aria-live="polite">' +
      done +
      " / " +
      total +
      " done</p>" +
      "</header>" +
      '<label class="hw-missionary__project-notes">' +
      "<span>Project notes</span>" +
      '<textarea class="hw-missionary__textarea" data-missionary-project-notes rows="3" placeholder="Audience, deadlines, what’s stuck…">' +
      esc(state.projectNotes) +
      "</textarea>" +
      "</label>";

    let lastBook = "";
    SECTIONS.forEach((sec) => {
      if (sec.book && sec.book !== lastBook) {
        html += '<h3 class="hw-missionary__book">' + esc(sec.book) + "</h3>";
        lastBook = sec.book;
      }
      html += '<section class="hw-missionary__section" data-section="' + esc(sec.id) + '">';
      html += '<h4 class="hw-missionary__section-title">' + esc(sec.title) + "</h4>";
      if (sec.lede) {
        html += '<p class="hw-missionary__section-lede">' + esc(sec.lede) + "</p>";
      }
      html += '<ul class="hw-missionary__list">';
      sec.items.forEach((item) => {
        const isDone = !!state.done[item.id];
        const note = state.notes[item.id] || "";
        const rows = item.notesRows || 2;
        html +=
          '<li class="hw-missionary__item' +
          (isDone ? " is-done" : "") +
          '" data-item="' +
          esc(item.id) +
          '">' +
          '<label class="hw-missionary__check">' +
          '<input type="checkbox" data-missionary-done value="' +
          esc(item.id) +
          '"' +
          (isDone ? " checked" : "") +
          ">" +
          '<span class="hw-missionary__label" lang="ja">' +
          esc(item.label) +
          "</span>" +
          "</label>";
        if (item.hint) {
          html += '<p class="hw-missionary__hint">' + esc(item.hint) + "</p>";
        }
        html +=
          '<label class="hw-missionary__notes">' +
          '<span class="hw-missionary__notes-label">Notes</span>' +
          '<textarea class="hw-missionary__textarea" data-missionary-note="' +
          esc(item.id) +
          '" rows="' +
          rows +
          '" placeholder="Scratch notes…">' +
          esc(note) +
          "</textarea>" +
          "</label></li>";
      });
      html += "</ul></section>";
    });

    root.innerHTML = html;
  }

  function getState(root) {
    if (!root._missionaryState) root._missionaryState = loadState();
    return root._missionaryState;
  }

  function bind(root) {
    if (root.dataset.missionaryBound === "1") return;
    root.dataset.missionaryBound = "1";

    root.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (!t.matches("[data-missionary-done]")) return;
      const state = getState(root);
      const id = t.value;
      state.done[id] = t.checked;
      saveState(state);
      const li = t.closest(".hw-missionary__item");
      if (li) li.classList.toggle("is-done", t.checked);
      const prog = root.querySelector(".hw-missionary__progress");
      if (prog) {
        const { total, done } = countProgress(state);
        prog.textContent = done + " / " + total + " done";
      }
    });

    root.addEventListener("input", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLTextAreaElement)) return;
      const state = getState(root);
      if (t.matches("[data-missionary-project-notes]")) {
        state.projectNotes = t.value;
        saveState(state);
        return;
      }
      const id = t.getAttribute("data-missionary-note");
      if (!id) return;
      state.notes[id] = t.value;
      saveState(state);
    });
  }

  function mount(force) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    if (!force && root.dataset.missionaryReady === "1") return true;
    const state = loadState();
    root._missionaryState = state;
    render(root, state);
    bind(root);
    root.dataset.missionaryReady = "1";
    return true;
  }

  function boot() {
    if (document.getElementById(ROOT_ID)) mount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.HwMissionaryCurriculum = {
    mount,
    sections: SECTIONS,
  };
})(typeof window !== "undefined" ? window : globalThis);
