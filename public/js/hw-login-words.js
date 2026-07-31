/**
 * Homework landing — handwritten word cycle behind the login card.
 */
(function () {
  const el = document.getElementById("hw-login-hero-words");
  if (!el) return;

  const WORDS = [
    { kana: "しゅくだい", kanji: "宿題" },
    { kana: "どりょく", kanji: "努力" },
    { kana: "べんきょう", kanji: "勉強" },
    { kana: "モチベーション", kanji: null },
    { kana: "たのしい", kanji: "楽しい" },
  ];

  const TYPE_MS = 175;
  const HIRAGANA_HOLD_MS = 850;
  const CONVERT_MS = 220;
  const HOLD_MS = 2000;
  const BETWEEN_MS = 400;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = 0;
  let timer = 0;
  let stopped = false;

  function sleep(ms) {
    return new Promise((resolve) => {
      timer = window.setTimeout(resolve, ms);
    });
  }

  function chars(text) {
    return Array.from(String(text || ""));
  }

  async function showStatic(entry) {
    el.classList.remove("is-typing", "is-converting");
    el.classList.toggle("is-long-word", chars(entry.kanji || entry.kana).length >= 7);
    el.textContent = entry.kanji || entry.kana;
  }

  async function playWord(entry) {
    el.classList.remove("is-converting", "is-between");
    el.classList.add("is-typing");
    el.classList.toggle("is-long-word", chars(entry.kanji || entry.kana).length >= 7);

    const units = chars(entry.kana);
    for (let i = 0; i < units.length; i++) {
      if (stopped) return;
      el.textContent = units.slice(0, i + 1).join("");
      await sleep(TYPE_MS);
    }

    el.classList.remove("is-typing");

    await sleep(HIRAGANA_HOLD_MS);

    if (entry.kanji) {
      el.classList.add("is-converting");
      await sleep(CONVERT_MS);
      el.textContent = entry.kanji;
      el.classList.remove("is-converting");
    }

    await sleep(HOLD_MS);
  }

  async function loop() {
    if (reducedMotion) {
      let i = 0;
      window.setInterval(() => {
        showStatic(WORDS[i]);
        i = (i + 1) % WORDS.length;
      }, HOLD_MS + BETWEEN_MS);
      return;
    }

    while (!stopped) {
      await playWord(WORDS[index]);
      index = (index + 1) % WORDS.length;
      el.classList.add("is-between");
      await sleep(BETWEEN_MS);
      el.classList.remove("is-between");
    }
  }

  loop();

  window.addEventListener(
    "pagehide",
    () => {
      stopped = true;
      window.clearTimeout(timer);
    },
    { once: true }
  );
})();
