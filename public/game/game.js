/**
 * Top-down village — levels, 好き quests, gather, level clear.
 */
(function () {
  const DATA = window.GAME_DATA;
  const TS = DATA.tileSize;
  const PROGRESS_KEY = "jlm-game-progress";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const invEl = document.getElementById("inventory");
  const heldLabel = document.getElementById("held-label");
  const mapLabel = document.getElementById("map-label");
  const levelLabel = document.getElementById("level-label");
  const toastEl = document.getElementById("toast");
  const levelGridEl = document.getElementById("level-grid");
  const clearOverlay = document.getElementById("level-clear-overlay");
  const clearLevelNum = document.getElementById("level-clear-num");

  const keys = {};
  let toastTimer = 0;
  const spriteCache = {};

  const state = {
    currentLevel: 0,
    mapId: "village",
    player: { x: 0, y: 0, w: 22, h: 22, speed: 2.2 },
    inventory: [],
    heldItem: null,
    collectedNodes: new Set(),
    npcState: {},
    dialogueOpen: false,
    progress: { level0Clear: false, level1Clear: false },
  };

  function isLevelCleared(levelId) {
    return !!state.progress["level" + levelId + "Clear"];
  }

  function isLevelUnlocked(lvl) {
    if (!lvl.playable) return false;
    if (lvl.requiresLevel != null && !isLevelCleared(lvl.requiresLevel)) return false;
    return true;
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) Object.assign(state.progress, JSON.parse(raw));
    } catch (_) {}
  }

  function saveProgress() {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress));
  }

  function getLevelNpcs(levelId) {
    return DATA.npcs.filter((n) => n.level === levelId);
  }

  function initNpcState() {
    state.npcState = {};
    getLevelNpcs(state.currentLevel).forEach((n) => {
      state.npcState[n.id] = { complete: false };
    });
  }

  function parseMap(mapDef) {
    const tiles = [];
    const charMap = { "#": 1, ".": 0, T: 2, H: 3, ">": 4, "<": 5 };
    for (let y = 0; y < mapDef.height; y++) {
      const row = mapDef.rows[y];
      for (let x = 0; x < mapDef.width; x++) {
        const ch = row[x] || "#";
        tiles.push(charMap[ch] ?? 1);
      }
    }
    return tiles;
  }

  const mapCache = {};
  function getMap(id) {
    if (!mapCache[id]) {
      const def = DATA.maps[id];
      mapCache[id] = { ...def, tiles: parseMap(def) };
    }
    return mapCache[id];
  }

  function tileAt(map, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 1;
    return map.tiles[ty * map.width + tx];
  }

  function isSolid(tile) {
    return tile === 1 || tile === 2 || tile === 3;
  }

  function worldToTile(px, py) {
    return { tx: Math.floor(px / TS), ty: Math.floor(py / TS) };
  }

  function rectHitsWall(map, x, y, w, h) {
    const corners = [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ];
    for (const [cx, cy] of corners) {
      const { tx, ty } = worldToTile(cx, cy);
      if (isSolid(tileAt(map, tx, ty))) return true;
    }
    return false;
  }

  function resizeCanvas() {
    const map = getMap(state.mapId);
    canvas.width = map.width * TS;
    canvas.height = map.height * TS;
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    toastTimer = 90;
  }

  function receiveItem(itemId, quiet) {
    const item = DATA.items[itemId];
    if (!item) return;
    if (!state.inventory.includes(itemId)) state.inventory.push(itemId);
    state.heldItem = itemId;
    renderInventory();
    updateHeldLabel();
    if (!quiet) showToast(item.receiveToast || item.labelJa + "をもらった！");
  }

  function addToInventory(itemId) {
    if (!state.inventory.includes(itemId)) {
      state.inventory.push(itemId);
      renderInventory();
      const item = DATA.items[itemId];
      showToast(item.labelJa ? item.labelJa + "を見つけた！" : item.label + " collected");
    }
  }

  function renderInventory() {
    invEl.innerHTML = "";
    Object.keys(DATA.items).forEach((id) => {
      const item = DATA.items[id];
      const has = state.inventory.includes(id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "inv-slot" +
        (has ? "" : " inv-slot--empty") +
        (state.heldItem === id ? " inv-slot--held" : "");
      btn.title = item.labelJa || item.label;
      btn.style.background = has ? "#1a2744" : "#16213e";

      if (has && item.sprite) {
        const img = document.createElement("img");
        img.className = "inv-slot__sprite";
        img.src = item.sprite;
        img.alt = "";
        btn.appendChild(img);
      }

      if (has) {
        btn.addEventListener("click", () => {
          state.heldItem = state.heldItem === id ? null : id;
          renderInventory();
          updateHeldLabel();
        });
      }
      invEl.appendChild(btn);
    });
  }

  function updateHeldLabel() {
    if (!state.heldItem) {
      heldLabel.textContent = "Holding: nothing";
      return;
    }
    const item = DATA.items[state.heldItem];
    heldLabel.textContent =
      "Holding: " + (item.labelJa || item.label) + " (click slot to release)";
  }

  function getNpcsOnMap() {
    return getLevelNpcs(state.currentLevel).filter((n) => n.map === state.mapId);
  }

  function getGatherNodes() {
    if (state.currentLevel < 1) return [];
    return DATA.gatherNodes.filter(
      (g) =>
        g.level === state.currentLevel &&
        g.map === state.mapId &&
        !state.collectedNodes.has(g.id)
    );
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function npcCenter(npc) {
    return { x: npc.x * TS + TS / 2, y: npc.y * TS + TS / 2 };
  }

  function nearestNpc(maxDist) {
    const px = state.player.x + state.player.w / 2;
    const py = state.player.y + state.player.h / 2;
    let best = null;
    let bestD = maxDist;
    for (const npc of getNpcsOnMap()) {
      const c = npcCenter(npc);
      const d = dist(px, py, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
    }
    return best;
  }

  function nearestGatherNode(maxDist) {
    const px = state.player.x + state.player.w / 2;
    const py = state.player.y + state.player.h / 2;
    for (const node of getGatherNodes()) {
      const cx = node.x * TS + TS / 2;
      const cy = node.y * TS + TS / 2;
      if (dist(px, py, cx, cy) < maxDist) return node;
    }
    return null;
  }

  function switchMap(newId, spawn) {
    state.mapId = newId;
    const map = getMap(newId);
    state.player.x = spawn.x * TS + (TS - state.player.w) / 2;
    state.player.y = spawn.y * TS + (TS - state.player.h) / 2;
    resizeCanvas();
    mapLabel.textContent = map.name;
  }

  function checkMapTransitions() {
    if (state.currentLevel < 1) return;
    const map = getMap(state.mapId);
    const { tx, ty } = worldToTile(
      state.player.x + state.player.w / 2,
      state.player.y + state.player.h / 2
    );
    const tile = tileAt(map, tx, ty);
    if (tile === 4 && state.mapId === "village") {
      switchMap("forest", DATA.maps.forest.playerStart);
    } else if (tile === 5 && state.mapId === "forest") {
      switchMap("village", { x: 18, y: 11 });
    }
  }

  function tryGather() {
    const node = nearestGatherNode(36);
    if (!node) return;
    state.collectedNodes.add(node.id);
    addToInventory(node.item);
  }

  function allLevelNpcsComplete() {
    return getLevelNpcs(state.currentLevel).every((n) => state.npcState[n.id]?.complete);
  }

  function checkLevelComplete() {
    const id = state.currentLevel;
    const key = "level" + id + "Clear";
    if (!allLevelNpcsComplete() || state.progress[key]) return;
    state.progress[key] = true;
    saveProgress();
    showLevelClearPopup(id);
    renderLevelGrid();
  }

  function showLevelClearPopup(levelId) {
    if (clearLevelNum) clearLevelNum.textContent = String(levelId);
    if (clearOverlay) clearOverlay.hidden = false;
    state.dialogueOpen = true;
  }

  function hideLevelClearPopup() {
    if (clearOverlay) clearOverlay.hidden = true;
    state.dialogueOpen = false;
  }

  function resetLevelRun() {
    state.mapId = "village";
    state.inventory = [];
    state.heldItem = null;
    state.collectedNodes = new Set();
    initNpcState();
    const start = DATA.maps.village.playerStart;
    state.player.x = start.x * TS + (TS - state.player.w) / 2;
    state.player.y = start.y * TS + (TS - state.player.h) / 2;
    resizeCanvas();
    mapLabel.textContent = DATA.maps.village.name;
    renderInventory();
    updateHeldLabel();
  }

  const LOCK_ICON_HTML = `<span class="level-card__lock" aria-hidden="true">
    <svg class="level-card__lock-svg level-card__lock-svg--locked" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    <svg class="level-card__lock-svg level-card__lock-svg--unlocked" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path class="level-card__lock-shackle" d="M8 11V7a4 4 0 0 1 8 0"/></svg>
  </span>`;

  const LOCK_STATUS_HTML = `<span class="level-card__status"><span class="level-card__status-text level-card__status-text--locked">Locked</span><span class="level-card__status-text level-card__status-text--unlock">Unlock?</span></span>`;

  function renderLevelGrid() {
    if (!levelGridEl) return;
    levelGridEl.innerHTML = "";

    DATA.levels.forEach((lvl) => {
      const cleared = isLevelCleared(lvl.id);
      const unlocked = isLevelUnlocked(lvl);
      const isLocked = lvl.playable ? !unlocked : true;

      const el = document.createElement(isLocked ? "article" : "button");
      if (isLocked) {
        el.className = "level-card level-card--locked";
        el.tabIndex = 0;
      } else {
        el.type = "button";
        el.className = "level-card";
        if (cleared) el.classList.add("level-card--clear");
      }

      let inner = "";
      if (isLocked) inner += LOCK_ICON_HTML;
      inner += `<span class="level-card__num">${lvl.title}</span>`;
      inner += `<span class="level-card__grammar">${lvl.grammar}</span>`;
      if (lvl.subtitle) inner += `<span class="level-card__sub">${lvl.subtitle}</span>`;
      if (cleared) inner += `<span class="level-card__badge">CLEAR</span>`;
      else if (isLocked) inner += LOCK_STATUS_HTML;

      el.innerHTML = inner;

      if (unlocked) {
        el.addEventListener("click", () => {
          state.currentLevel = lvl.id;
          resetLevelRun();
          updateLevelHud();
          const again = isLevelCleared(lvl.id);
          showToast(
            lvl.title +
              " — " +
              lvl.grammar +
              (again ? " (play again)" : "")
          );
        });
      }

      levelGridEl.appendChild(el);
    });
  }

  function updateLevelHud() {
    const meta = DATA.levels.find((l) => l.id === state.currentLevel);
    if (levelLabel && meta) {
      levelLabel.textContent = meta.title + " — " + meta.grammar;
    }
    const forestHint = document.getElementById("hud-forest-hint");
    if (forestHint) forestHint.hidden = state.currentLevel < 1;
  }

  function closeDialogue() {
    state.dialogueOpen = false;
  }

  function handleNpcTalk(npc) {
    const ns = state.npcState[npc.id];
    state.dialogueOpen = true;

    if (ns.complete) {
      DialogueUI.open({
        speaker: npc.label,
        line: npc.completeLine || "ありがとう！",
        clickable: npc.clickable || [],
        closeCallback: closeDialogue,
      });
      return;
    }

    if (npc.interaction === "give_item" && !ns.complete) {
      DialogueUI.open({
        speaker: npc.label,
        line: npc.line,
        clickable: npc.clickable || [],
        closeCallback: () => {
          receiveItem(npc.givesItem, true);
          state.dialogueOpen = true;
          DialogueUI.open({
            speaker: "",
            line: npc.receiveLine,
            clickable: [],
            closeCallback: () => {
              ns.complete = true;
              closeDialogue();
              checkLevelComplete();
            },
          });
        },
      });
      return;
    }

    if (npc.interaction === "want_item") {
      if (state.heldItem === npc.wantedItem) {
        state.inventory = state.inventory.filter((i) => i !== npc.wantedItem);
        state.heldItem = null;
        renderInventory();
        updateHeldLabel();
        ns.complete = true;
        DialogueUI.open({
          speaker: npc.label,
          line: npc.thanks,
          clickable: npc.clickable || [],
          closeCallback: () => {
            closeDialogue();
            checkLevelComplete();
          },
        });
        return;
      }

      let line = npc.line;
      if (npc.hintLine && state.heldItem !== npc.wantedItem) {
        line = npc.line + "\n\n" + npc.hintLine;
      }
      DialogueUI.open({
        speaker: npc.label,
        line,
        clickable: npc.clickable || [],
        closeCallback: closeDialogue,
      });
      return;
    }

    DialogueUI.open({
      speaker: npc.label,
      line: npc.line,
      clickable: npc.clickable || [],
      closeCallback: closeDialogue,
    });
  }

  function advanceDialogue() {
    if (clearOverlay && !clearOverlay.hidden) return;
    if (!DialogueUI.isOpen()) return;
    DialogueUI.close();
    if (!DialogueUI.isOpen()) closeDialogue();
  }

  function interact() {
    if (clearOverlay && !clearOverlay.hidden) return;
    if (DialogueUI.isOpen()) {
      advanceDialogue();
      return;
    }
    const npc = nearestNpc(44);
    if (npc) {
      handleNpcTalk(npc);
      return;
    }
    tryGather();
  }

  function updateMovement() {
    if (state.dialogueOpen) return;
    const map = getMap(state.mapId);
    let dx = 0;
    let dy = 0;
    if (keys.w || keys.ArrowUp) dy -= state.player.speed;
    if (keys.s || keys.ArrowDown) dy += state.player.speed;
    if (keys.a || keys.ArrowLeft) dx -= state.player.speed;
    if (keys.d || keys.ArrowRight) dx += state.player.speed;

    if (dx !== 0) {
      const nx = state.player.x + dx;
      if (!rectHitsWall(map, nx, state.player.y, state.player.w, state.player.h)) {
        state.player.x = nx;
      }
    }
    if (dy !== 0) {
      const ny = state.player.y + dy;
      if (!rectHitsWall(map, state.player.x, ny, state.player.w, state.player.h)) {
        state.player.y = ny;
      }
    }
    checkMapTransitions();
  }

  function drawMap(map) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = tileAt(map, x, y);
        let color = "#5a8f4a";
        if (t === 1) color = "#4a4a5a";
        if (t === 2) color = "#2d5a27";
        if (t === 3) color = "#8b4513";
        if (t === 4 || t === 5) color = "#6c5ce7";
        ctx.fillStyle = color;
        ctx.fillRect(x * TS, y * TS, TS, TS);
        if (t === 2) {
          ctx.fillStyle = "#1e3d1a";
          ctx.beginPath();
          ctx.arc(x * TS + TS / 2, y * TS + TS / 2, TS * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        if (t === 3) {
          ctx.fillStyle = "#c0392b";
          ctx.fillRect(x * TS + 4, y * TS + 4, TS - 8, TS - 10);
          ctx.fillStyle = "#5d4037";
          ctx.fillRect(x * TS + TS / 2 - 4, y * TS + TS - 12, 8, 12);
        }
        if (t === 4) {
          ctx.fillStyle = "#fff";
          ctx.font = "10px sans-serif";
          ctx.fillText("→", x * TS + 10, y * TS + 20);
        }
        if (t === 5) {
          ctx.fillStyle = "#fff";
          ctx.font = "10px sans-serif";
          ctx.fillText("←", x * TS + 10, y * TS + 20);
        }
      }
    }
  }

  function preloadSprites() {
    Object.values(DATA.items).forEach((item) => {
      if (!item.sprite || spriteCache[item.sprite]) return;
      const img = new Image();
      img.src = item.sprite;
      spriteCache[item.sprite] = img;
    });
  }

  function drawGatherNodes() {
    const size = 24;
    for (const node of getGatherNodes()) {
      const item = DATA.items[node.item];
      if (!item) continue;
      const cx = node.x * TS + TS / 2;
      const cy = node.y * TS + TS / 2;
      const img = item.sprite ? spriteCache[item.sprite] : null;
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
        continue;
      }
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawNpcs() {
    for (const npc of getNpcsOnMap()) {
      const cx = npc.x * TS + TS / 2;
      const cy = npc.y * TS + TS / 2;
      const done = state.npcState[npc.id]?.complete;
      ctx.fillStyle = done ? "#636e72" : npc.color;
      ctx.fillRect(cx - 12, cy - 16, 24, 28);
      ctx.fillStyle = "#ffeaa7";
      ctx.fillRect(cx - 8, cy - 22, 16, 10);
      if (done) {
        ctx.fillStyle = "#00b894";
        ctx.font = "9px sans-serif";
        ctx.fillText("✓", cx - 3, cy - 18);
      }
    }
  }

  function drawPlayer() {
    const { x, y, w, h } = state.player;
    ctx.fillStyle = "#e17055";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#fab1a0";
    ctx.fillRect(x + 4, y - 6, w - 8, 8);
  }

  function drawInteractHint() {
    if (state.dialogueOpen) return;
    const npc = nearestNpc(44);
    const node = nearestGatherNode(36);
    if (!npc && !node) return;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.font = "11px sans-serif";
    const actionLabel = shouldUseTouchControls() ? "Action" : "E";
    const msg =
      npc ? "[" + actionLabel + "] Talk" : state.currentLevel >= 1 ? "[" + actionLabel + "] Gather" : "";
    if (!msg) return;
    const px = state.player.x + state.player.w / 2;
    ctx.fillText(msg, px - 22, state.player.y - 8);
  }

  function loop() {
    updateMovement();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const map = getMap(state.mapId);
    drawMap(map);
    drawGatherNodes();
    drawNpcs();
    drawPlayer();
    drawInteractHint();

    if (toastTimer > 0) {
      toastTimer--;
      if (toastTimer === 0) toastEl.classList.remove("show");
    }
    requestAnimationFrame(loop);
  }

  const MOVE_KEY_ALIASES = {
    up: ["w", "ArrowUp"],
    down: ["s", "ArrowDown"],
    left: ["a", "ArrowLeft"],
    right: ["d", "ArrowRight"],
  };

  function setMoveDir(dir, active) {
    const aliases = MOVE_KEY_ALIASES[dir];
    if (!aliases) return;
    for (const k of aliases) {
      keys[k] = active;
      keys[k.toLowerCase()] = active;
    }
  }

  function shouldUseTouchControls() {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function setupTouchControls() {
    const panel = document.getElementById("touch-controller");
    if (!panel) return;

    function refreshVisibility() {
      const show = shouldUseTouchControls();
      panel.hidden = !show;
      panel.setAttribute("aria-hidden", show ? "false" : "true");
    }

    refreshVisibility();
    window.matchMedia("(max-width: 768px)").addEventListener("change", refreshVisibility);
    window.matchMedia("(pointer: coarse)").addEventListener("change", refreshVisibility);

    function bindDirectionButton(btn) {
      const dir = btn.dataset.dir;
      if (!dir) return;

      const press = (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        setMoveDir(dir, true);
        btn.classList.add("touch-btn--active");
      };

      const release = () => {
        setMoveDir(dir, false);
        btn.classList.remove("touch-btn--active");
      };

      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("lostpointercapture", release);
    }

    panel.querySelectorAll("[data-dir]").forEach(bindDirectionButton);

    const actionBtn = document.getElementById("touch-action");
    if (actionBtn) {
      actionBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        actionBtn.classList.add("touch-btn--active");
      });
      actionBtn.addEventListener("pointerup", (e) => {
        e.preventDefault();
        actionBtn.classList.remove("touch-btn--active");
        interact();
      });
      actionBtn.addEventListener("pointercancel", () => {
        actionBtn.classList.remove("touch-btn--active");
      });
    }
  }

  function setupInput() {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        keys[e.key] = true;
        keys[e.key.toLowerCase()] = true;
        e.preventDefault();
      }
      if (e.key === "e" || e.key === "Enter") {
        if (e.key === "Enter" && DialogueUI.isOpen()) return;
        e.preventDefault();
        interact();
      }
    });
    window.addEventListener("keyup", (e) => {
      keys[e.key] = false;
      keys[e.key.toLowerCase()] = false;
    });
    setupTouchControls();
  }

  function init() {
    DialogueUI.init();
    DialogueUI.setAdvanceHandler(advanceDialogue);
    preloadSprites();
    loadProgress();
    initNpcState();
    resetLevelRun();
    updateLevelHud();
    renderLevelGrid();

    document.getElementById("level-clear-ok")?.addEventListener("click", hideLevelClearPopup);

    setupInput();
    requestAnimationFrame(loop);
    showToast("Level 0 — Talk to villagers (E). どうぞ！");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
