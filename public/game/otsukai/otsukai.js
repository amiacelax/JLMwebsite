/**
 * はじめてのおつかい — listen to Mom, pick the right item at the shop.
 * Storybook-style UI (not 8-bit canvas).
 */
(function () {
  const ERRANDS = [
    {
      momIntro: "おつかい、お願いできる？",
      momIntroSub: "Can you run an errand for me?",
      request: "牛乳を買ってきて。",
      requestSub: "Please buy some milk.",
      success: "ありがとう！牛乳、ちょうどよかったわ。",
      successSub: "Thank you! The milk is just what we needed.",
      correctId: "milk",
      items: [
        { id: "milk", label: "牛乳", reading: "ぎゅうにゅう", icon: "🥛" },
        { id: "bread", label: "パン", reading: "ぱん", icon: "🍞" },
        { id: "apple", label: "りんご", reading: "りんご", icon: "🍎" },
        { id: "egg", label: "卵", reading: "たまご", icon: "🥚" },
        { id: "soy", label: "醤油", reading: "しょうゆ", icon: "🫙" },
        { id: "rice", label: "お米", reading: "おこめ", icon: "🍚" },
      ],
    },
    {
      momIntro: "次はこれをお願い。",
      momIntroSub: "Next errand, please.",
      request: "パンを一つ買ってきて。",
      requestSub: "Buy one loaf of bread.",
      success: "いいパンね！おつかいえらい。",
      successSub: "Nice bread! Good job on your errand.",
      correctId: "bread",
      items: [
        { id: "milk", label: "牛乳", reading: "ぎゅうにゅう", icon: "🥛" },
        { id: "bread", label: "パン", reading: "ぱん", icon: "🍞" },
        { id: "apple", label: "りんご", reading: "りんご", icon: "🍎" },
        { id: "egg", label: "卵", reading: "たまご", icon: "🥚" },
        { id: "tofu", label: "豆腐", reading: "とうふ", icon: "🧈" },
        { id: "tea", label: "お茶", reading: "おちゃ", icon: "🍵" },
      ],
    },
    {
      momIntro: "もう一回、お願い。",
      momIntroSub: "One more time, please.",
      request: "りんごを三つ買ってきて。",
      requestSub: "Buy three apples.",
      success: "りんご、おいしそう！助かったわ。",
      successSub: "The apples look delicious! You saved the day.",
      correctId: "apple",
      items: [
        { id: "banana", label: "バナナ", reading: "ばなな", icon: "🍌" },
        { id: "apple", label: "りんご", reading: "りんご", icon: "🍎" },
        { id: "mikan", label: "みかん", reading: "みかん", icon: "🍊" },
        { id: "grape", label: "ぶどう", reading: "ぶどう", icon: "🍇" },
        { id: "melon", label: "メロン", reading: "めろん", icon: "🍈" },
        { id: "peach", label: "もも", reading: "もも", icon: "🍑" },
      ],
    },
    {
      momIntro: "最後のおつかいよ。",
      momIntroSub: "Last errand.",
      request: "卵を買ってきて。",
      requestSub: "Please buy eggs.",
      success: "完璧！はじめてのおつかい、成功ね。",
      successSub: "Perfect! Your first errand is a success.",
      correctId: "egg",
      items: [
        { id: "egg", label: "卵", reading: "たまご", icon: "🥚" },
        { id: "milk", label: "牛乳", reading: "ぎゅうにゅう", icon: "🥛" },
        { id: "fish", label: "さかな", reading: "さかな", icon: "🐟" },
        { id: "meat", label: "お肉", reading: "おにく", icon: "🥩" },
        { id: "noodle", label: "うどん", reading: "うどん", icon: "🍜" },
        { id: "onion", label: "たまねぎ", reading: "たまねぎ", icon: "🧅" },
      ],
    },
  ];

  const sceneHome = document.getElementById("otsu-scene-home");
  const sceneShop = document.getElementById("otsu-scene-shop");
  const sceneSuccess = document.getElementById("otsu-scene-success");
  const shelfEl = document.getElementById("otsu-shelf");
  const speakerEl = document.getElementById("otsu-speaker");
  const lineJaEl = document.getElementById("otsu-line-ja");
  const lineSubEl = document.getElementById("otsu-line-sub");
  const advanceBtn = document.getElementById("otsu-advance");
  const toastEl = document.getElementById("otsu-toast");
  const scoreEl = document.getElementById("otsu-score");
  const stepEl = document.getElementById("otsu-step");
  const totalEl = document.getElementById("otsu-total");
  const successTextEl = document.getElementById("otsu-success-text");
  const restartBtn = document.getElementById("otsu-restart");
  const dialogueEl = document.getElementById("otsu-dialogue");

  const state = {
    index: 0,
    score: 0,
    phase: "intro",
    picking: false,
  };

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function showToast(msg, kind) {
    if (!toastEl) return;
    toastEl.hidden = false;
    toastEl.textContent = msg;
    toastEl.className = "otsu-toast" + (kind ? " otsu-toast--" + kind : "");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toastEl.hidden = true;
    }, 2200);
  }

  function setDialogue(speaker, ja, sub, showAdvance) {
    if (speakerEl) speakerEl.textContent = speaker;
    if (lineJaEl) lineJaEl.textContent = ja;
    if (lineSubEl) lineSubEl.textContent = sub || "";
    if (advanceBtn) advanceBtn.hidden = !showAdvance;
  }

  function showScene(name) {
    if (sceneHome) sceneHome.hidden = name !== "home";
    if (sceneShop) sceneShop.hidden = name !== "shop";
    if (sceneSuccess) sceneSuccess.hidden = name !== "success";
  }

  function currentErrand() {
    return ERRANDS[state.index];
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (stepEl) stepEl.textContent = String(Math.min(state.index + 1, ERRANDS.length));
    if (totalEl) totalEl.textContent = String(ERRANDS.length);
  }

  function renderShelf() {
    if (!shelfEl) return;
    const errand = currentErrand();
    shelfEl.replaceChildren();
    shuffle(errand.items).forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "otsu-item";
      btn.setAttribute("data-item-id", item.id);
      btn.innerHTML =
        '<span class="otsu-item__icon" aria-hidden="true">' +
        item.icon +
        '</span><span class="otsu-item__label">' +
        item.label +
        '</span><span class="otsu-item__reading">' +
        item.reading +
        "</span>";
      btn.addEventListener("click", () => onPick(item.id));
      shelfEl.appendChild(btn);
    });
  }

  function beginIntro() {
    state.phase = "intro";
    state.picking = false;
    showScene("home");
    const errand = currentErrand();
    setDialogue("ママ", errand.momIntro, errand.momIntroSub, true);
    updateHud();
  }

  function showRequest() {
    state.phase = "request";
    const errand = currentErrand();
    setDialogue("ママ", errand.request, errand.requestSub, true);
  }

  function openShop() {
    state.phase = "shop";
    state.picking = true;
    showScene("shop");
    renderShelf();
    setDialogue("あなた", "みせで えらぶ…", "Choose at the shop…", false);
  }

  function onPick(itemId) {
    if (!state.picking) return;
    const errand = currentErrand();
    if (itemId === errand.correctId) {
      state.picking = false;
      state.score += 100;
      showToast("正解！", "ok");
      showSuccess();
    } else {
      showToast("惜しい！ もう一度 えらんで。", "miss");
    }
    updateHud();
  }

  function showSuccess() {
    state.phase = "success";
    showScene("success");
    const errand = currentErrand();
    if (successTextEl) successTextEl.textContent = errand.successSub;
    setDialogue("ママ", errand.success, errand.successSub, true);
  }

  function nextErrand() {
    state.index += 1;
    if (state.index >= ERRANDS.length) {
      setDialogue(
        "ママ",
        "全部できた！すごいね。",
        "You finished every errand! Amazing.",
        false
      );
      showScene("success");
      if (successTextEl) {
        successTextEl.textContent = "Score: " + state.score + " — おつかいマスター！";
      }
      showToast("ゲームクリア！", "ok");
      return;
    }
    beginIntro();
  }

  function onAdvance() {
    if (state.phase === "intro") {
      showRequest();
    } else if (state.phase === "request") {
      openShop();
    } else if (state.phase === "success") {
      nextErrand();
    }
  }

  function restart() {
    state.index = 0;
    state.score = 0;
    beginIntro();
    showToast("はじめから！", null);
  }

  advanceBtn?.addEventListener("click", onAdvance);
  dialogueEl?.addEventListener("click", (e) => {
    if (e.target === advanceBtn) return;
    if (state.phase === "intro" || state.phase === "request" || state.phase === "success") {
      onAdvance();
    }
  });
  restartBtn?.addEventListener("click", restart);

  if (totalEl) totalEl.textContent = String(ERRANDS.length);
  beginIntro();
})();
