/**
 * おばあちゃん Counter Toss — practice 枚・本・冊・人・つ (throw mode prototype).
 */
(function () {
  const canvas = document.getElementById("obc-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl = document.getElementById("obc-score");
  const streakEl = document.getElementById("obc-streak");
  const throwsEl = document.getElementById("obc-throws");
  const toastEl = document.getElementById("obc-toast");
  const calloutEl = document.getElementById("obc-callout");
  const calloutTextEl = document.getElementById("obc-callout-text");
  const startBtn = document.getElementById("obc-start");

  const MAX_COUNT = 5;
  const SCROLL_SPEED = 4.2;
  const ANNOUNCE_MS = 900;
  const THROW_BASE_MS = 1400;
  const THROW_PER_PRESS_MS = 380;
  const RESULT_MS = 1100;

  const COUNTERS = [
    {
      counter: "枚",
      reading: "まい",
      objects: [
        { id: "paper", label: "紙", kind: "flat", color: "#f5f0e6" },
        { id: "ticket", label: "切符", kind: "flat", color: "#ffd966" },
        { id: "photo", label: "写真", kind: "flat", color: "#c4d4ff" },
      ],
    },
    {
      counter: "本",
      reading: "ほん",
      objects: [
        { id: "pen", label: "ペン", kind: "long", color: "#2d6a9f" },
        { id: "umbrella", label: "傘", kind: "long", color: "#7b4ea6" },
        { id: "chopsticks", label: "箸", kind: "long", color: "#c47a2c" },
      ],
    },
    {
      counter: "冊",
      reading: "さつ",
      objects: [
        { id: "book", label: "本", kind: "volume", color: "#c0392b" },
        { id: "magazine", label: "雑誌", kind: "volume", color: "#27ae60" },
        { id: "notebook", label: "ノート", kind: "volume", color: "#2980b9" },
      ],
    },
    {
      counter: "人",
      reading: "にん",
      objects: [
        { id: "person", label: "人", kind: "person", color: "#f39c12" },
        { id: "child", label: "子供", kind: "person", color: "#e67e22" },
        { id: "guest", label: "客", kind: "person", color: "#9b59b6" },
      ],
    },
    {
      counter: "つ",
      reading: "つ",
      objects: [
        { id: "stone", label: "石", kind: "blob", color: "#7f8c8d" },
        { id: "box", label: "箱", kind: "blob", color: "#d35400" },
        { id: "hat", label: "帽子", kind: "blob", color: "#1abc9c" },
      ],
    },
  ];

  const state = {
    running: false,
    phase: "idle",
    phaseUntil: 0,
    scroll: 0,
    score: 0,
    streak: 0,
    round: null,
    throwCount: 0,
    projectiles: [],
    pedestrians: [],
    toastTimer: 0,
    keys: {},
  };

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function pickRound() {
    const group = COUNTERS[randInt(0, COUNTERS.length - 1)];
    const object = group.objects[randInt(0, group.objects.length - 1)];
    const count = randInt(1, MAX_COUNT);
    return {
      group,
      object,
      count,
      label: count + group.counter + "！",
      sublabel: object.label + " × " + count,
    };
  }

  function showToast(msg, kind) {
    if (!toastEl) return;
    toastEl.hidden = false;
    toastEl.textContent = msg;
    toastEl.className = "obc-toast" + (kind ? " obc-toast--" + kind : "");
    state.toastTimer = 1600;
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (streakEl) streakEl.textContent = String(state.streak);
    if (throwsEl) {
      const need = state.round ? state.round.count : "—";
      throwsEl.textContent = state.throwCount + " / " + need;
    }
  }

  function spawnPedestrians() {
    state.pedestrians = [];
    for (let i = 0; i < 5; i++) {
      state.pedestrians.push({
        lane: randInt(-1, 1) * 0.35,
        z: 0.15 + i * 0.16 + Math.random() * 0.08,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  function beginRound() {
    state.round = pickRound();
    state.throwCount = 0;
    state.projectiles = [];
    spawnPedestrians();
    state.phase = "announce";
    state.phaseUntil = performance.now() + ANNOUNCE_MS;
    if (calloutEl) calloutEl.hidden = false;
    if (calloutTextEl) calloutTextEl.textContent = state.round.label;
    updateHud();
  }

  function startGame() {
    state.running = true;
    state.score = 0;
    state.streak = 0;
    state.scroll = 0;
    state.throwCount = 0;
    state.projectiles = [];
    beginRound();
    updateHud();
    showToast("聞いて、数だけ Space！", null);
  }

  function throwWindowMs() {
    if (!state.round) return THROW_BASE_MS;
    return THROW_BASE_MS + state.round.count * THROW_PER_PRESS_MS;
  }

  function laneX(lane, z) {
    const center = W * 0.5;
    const spread = W * 0.22 * (0.35 + z * 0.65);
    return center + lane * spread;
  }

  function roadY(z) {
    const horizon = H * 0.28;
    const foot = H * 0.92;
    return horizon + (foot - horizon) * z;
  }

  function roadWidth(z) {
    return W * (0.18 + z * 0.72);
  }

  function drawRoad() {
    const horizon = H * 0.28;
    ctx.fillStyle = "#0a1028";
    ctx.fillRect(0, 0, W, horizon);

    const stripes = 14;
    for (let i = stripes; i >= 0; i--) {
      const z0 = i / stripes;
      const z1 = (i + 1) / stripes;
      const y0 = roadY(z0);
      const y1 = roadY(z1);
      const w0 = roadWidth(z0);
      const w1 = roadWidth(z1);
      const cx = W / 2;
      const offset = (state.scroll * 0.04) % 2;

      ctx.fillStyle = i % 2 === 0 ? "#1e4fd6" : "#f0b429";
      ctx.beginPath();
      ctx.moveTo(cx - w0 / 2, y0);
      ctx.lineTo(cx + w0 / 2, y0);
      ctx.lineTo(cx + w1 / 2, y1);
      ctx.lineTo(cx - w1 / 2, y1);
      ctx.closePath();
      ctx.fill();

      if (i % 2 === 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, y0);
        ctx.lineTo(cx, y1);
        ctx.stroke();
      }

      const check = Math.floor(state.scroll * 0.08 + i + offset) % 2;
      if (check === 0 && z1 > 0.2) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(cx - w1 * 0.12, y1 - (y1 - y0) * 0.5, w1 * 0.24, (y1 - y0) * 0.5);
      }
    }

    ctx.fillStyle = "#243b6b";
    ctx.fillRect(0, roadY(1), W, H - roadY(1));
  }

  function drawObaachan() {
    const x = W * 0.42;
    const y = H * 0.78;
    const s = 3;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "#6d4c41";
    ctx.fillRect(-3 * s, 2 * s, 6 * s, 5 * s);
    ctx.fillStyle = "#ffccbc";
    ctx.fillRect(-2 * s, -4 * s, 4 * s, 4 * s);
    ctx.fillStyle = "#bdbdbd";
    ctx.fillRect(-3 * s, -5 * s, 6 * s, 2 * s);
    ctx.fillStyle = "#111";
    ctx.fillRect(-2 * s, -3 * s, 1 * s, 1 * s);
    ctx.fillRect(1 * s, -3 * s, 1 * s, 1 * s);
    ctx.fillStyle = "#c62828";
    ctx.fillRect(-1 * s, -1 * s, 2 * s, 1 * s);

    ctx.fillStyle = "#ff5252";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(3 * s + i * 2, -2 * s, 1.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPedestrian(px, py, scale) {
    const s = 2 * scale;
    ctx.fillStyle = "#4fc3f7";
    ctx.fillRect(px - s, py - 4 * s, 2 * s, 4 * s);
    ctx.fillStyle = "#ffab91";
    ctx.fillRect(px - s, py - 6 * s, 2 * s, 2 * s);
  }

  function drawObjectSprite(x, y, size, obj) {
    const s = size;
    ctx.save();
    ctx.translate(x, y);
    switch (obj.kind) {
      case "flat":
        ctx.fillStyle = obj.color;
        ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
        ctx.strokeStyle = "#111";
        ctx.strokeRect(-s, -s * 0.6, s * 2, s * 1.2);
        break;
      case "long":
        ctx.fillStyle = obj.color;
        ctx.fillRect(-s * 0.25, -s * 1.2, s * 0.5, s * 2.4);
        break;
      case "volume":
        ctx.fillStyle = obj.color;
        ctx.fillRect(-s * 0.7, -s, s * 1.4, s * 1.6);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(-s * 0.5, -s * 0.8, s * 0.35, s * 1.2);
        break;
      case "person":
        ctx.fillStyle = obj.color;
        ctx.fillRect(-s * 0.4, -s, s * 0.8, s);
        ctx.fillStyle = "#ffccbc";
        ctx.fillRect(-s * 0.35, -s * 1.5, s * 0.7, s * 0.55);
        break;
      default:
        ctx.fillStyle = obj.color;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
  }

  function drawProjectiles() {
    state.projectiles.forEach((p) => {
      const x = laneX(p.lane, p.z);
      const y = roadY(p.z) - 8;
      const size = 4 + p.z * 10;
      drawObjectSprite(x, y, size, p.object);
    });
  }

  function drawPedestrians() {
    state.pedestrians.forEach((ped) => {
      ped.z -= 0.004 * (SCROLL_SPEED / 4);
      if (ped.z < 0.05) ped.z = 0.95;
      const x = laneX(ped.lane + Math.sin(ped.wobble + state.scroll * 0.05) * 0.08, ped.z);
      const y = roadY(ped.z);
      drawPedestrian(x, y, 0.8 + ped.z * 0.9);
    });
  }

  function drawHudText() {
    if (!state.round || state.phase === "idle") return;
    ctx.font = '600 13px "Noto Sans JP", sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    ctx.fillText(state.round.sublabel, W / 2, H * 0.22);
    if (state.phase === "throw") {
      const left = Math.max(0, state.phaseUntil - performance.now());
      ctx.fillStyle = "#ffd966";
      ctx.fillText(Math.ceil(left / 1000) + "s", W / 2, H * 0.16);
    }
  }

  function spawnProjectile() {
    if (!state.round || state.phase !== "throw") return;
    if (state.throwCount >= MAX_COUNT) return;
    state.throwCount += 1;
    state.projectiles.push({
      lane: (Math.random() - 0.5) * 0.5,
      z: 0.88,
      vz: -0.028,
      object: state.round.object,
    });
    updateHud();
  }

  function resolveRound() {
    const need = state.round.count;
    const got = state.throwCount;
    if (got === need) {
      state.score += 100 + state.streak * 20;
      state.streak += 1;
      showToast("正解！ " + state.round.label + " ✓", "ok");
    } else {
      state.streak = 0;
      showToast(
        "惜しい！ " + need + state.round.group.counter + " だった（" + got + " 回）",
        "miss"
      );
    }
    state.phase = "result";
    state.phaseUntil = performance.now() + RESULT_MS;
    if (calloutEl) calloutEl.hidden = true;
    updateHud();
  }

  function tickPhase(now) {
    if (!state.running) return;

    if (state.phase === "announce" && now >= state.phaseUntil) {
      state.phase = "throw";
      state.phaseUntil = now + throwWindowMs();
      state.throwCount = 0;
      state.projectiles = [];
      updateHud();
    } else if (state.phase === "throw" && now >= state.phaseUntil) {
      resolveRound();
    } else if (state.phase === "result" && now >= state.phaseUntil) {
      beginRound();
    }
  }

  function updateProjectiles() {
    state.projectiles = state.projectiles.filter((p) => {
      p.z += p.vz;
      return p.z > 0.12;
    });
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    drawRoad();
    drawPedestrians();
    drawProjectiles();
    drawObaachan();
    drawHudText();
  }

  function loop(now) {
    if (state.running && (state.phase === "throw" || state.phase === "announce" || state.phase === "result")) {
      state.scroll += SCROLL_SPEED * 0.016;
    }
    if (state.running && state.phase === "throw") {
      updateProjectiles();
    }
    tickPhase(now);
    if (state.toastTimer > 0) {
      state.toastTimer -= 16;
      if (state.toastTimer <= 0 && toastEl) toastEl.hidden = true;
    }
    drawFrame();
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!state.running) {
        startGame();
        return;
      }
      if (state.phase === "throw") spawnProjectile();
    }
    if (e.key === "r" || e.key === "R") startGame();
  });

  startBtn?.addEventListener("click", startGame);

  updateHud();
  drawFrame();
  requestAnimationFrame(loop);
})();
