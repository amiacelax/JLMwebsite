/**
 * Kanji Ray — flat XYZ corridor raycaster.
 * Far = solid fills. Within ~0.5 tiles + zoom = kanji reveal.
 */
import { loadSave, writeSave } from "./save.js";

const canvas = document.getElementById("yg-canvas");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("yg-hud-zone");
const prompt = document.getElementById("yg-prompt");

/** Narrow hallway: open x=3..5, walls elsewhere. Row 1 = torii pillars. */
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 0, 1, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const MAP_W = MAP[0].length;
const MAP_H = MAP.length;

const WALL = "壁";
const FLOOR = "床";
const TORII = "鳥居";

const COLS = 80;
const RENDER_MAX_W = 960;
const MAX_DEPTH = 24;
const MOVE = 2.4;
const TURN = 2.0;
const REVEAL_DIST = 0.5;
const ZOOM_MIN = 0.85;
const ZOOM_MAX = 2.8;
const PLANE_BASE = 0.66;
const HORIZON_RATIO = 0.44;
const FLOOR_SCALE = 0.46;
const WALL_H_SCALE = 0.78;

const TORII_GATE = { x: 4.5, y: 1.0 };

const palette = {
  sky: "#0a0e14",
  meshVoid: "#0a0e14",
  wall: "#2a6898",
  wallDark: "#153050",
  wallKanji: "#256088",
  floor: "#7a5838",
  floorDark: "#3d2818",
  floorKanji: "#6a4830",
  torii: "#c03028",
  toriiDark: "#801820",
  toriiHi: "#e85040",
  toriiKanji: "#ffc8b8",
};

const save = loadSave();
const player = {
  x: typeof save.x === "number" ? save.x : 4.5,
  y: typeof save.y === "number" ? save.y : 10.5,
  angle: typeof save.angle === "number" ? save.angle : -Math.PI / 2,
};

const keys = new Set();
let zoom = 1.0;
let won = false;
let lastT = 0;
let saveTimer = 0;

function resize() {
  const scale = Math.min(1, RENDER_MAX_W / window.innerWidth);
  canvas.width = Math.max(320, (window.innerWidth * scale) | 0);
  canvas.height = Math.max(240, (window.innerHeight * scale) | 0);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  ctx.imageSmoothingEnabled = false;
}

function tileAt(mx, my) {
  if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return 1;
  return MAP[my][mx];
}

function blocked(px, py) {
  return tileAt(Math.floor(px), Math.floor(py)) === 1;
}

function passedToriiGate() {
  return player.y < TORII_GATE.y + 0.15 && Math.abs(player.x - TORII_GATE.x) < 0.35;
}

function trySlide(nx, ny) {
  if (!blocked(nx, player.y)) player.x = nx;
  if (!blocked(player.x, ny)) player.y = ny;
}

function castWallDir(rx, ry) {
  let mx = Math.floor(player.x);
  let my = Math.floor(player.y);

  const ddx = Math.abs(rx) < 1e-8 ? 1e30 : Math.abs(1 / rx);
  const ddy = Math.abs(ry) < 1e-8 ? 1e30 : Math.abs(1 / ry);

  let sx;
  let sy;
  let sdx;
  let sdy;

  if (rx < 0) {
    sx = -1;
    sdx = (player.x - mx) * ddx;
  } else {
    sx = 1;
    sdx = (mx + 1 - player.x) * ddx;
  }
  if (ry < 0) {
    sy = -1;
    sdy = (player.y - my) * ddy;
  } else {
    sy = 1;
    sdy = (my + 1 - player.y) * ddy;
  }

  let side = 0;
  for (let i = 0; i < 48; i++) {
    if (sdx < sdy) {
      sdx += ddx;
      mx += sx;
      side = 0;
    } else {
      sdy += ddy;
      my += sy;
      side = 1;
    }
    if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) break;
    if (MAP[my][mx] === 1) break;
  }

  let dist;
  if (side === 0) dist = (mx - player.x + (1 - sx) / 2) / (rx || 1e-9);
  else dist = (my - player.y + (1 - sy) / 2) / (ry || 1e-9);
  dist = Math.abs(Math.min(dist, MAX_DEPTH));

  return { dist, side };
}

function mix(a, b, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ca = p(a);
  const cb = p(b);
  return `rgb(${ca.map((v, i) => (v + (cb[i] - v) * t) | 0).join(",")})`;
}

function revealAmt(dist) {
  if (dist >= REVEAL_DIST) return 0;
  const near = 1 - dist / REVEAL_DIST;
  const zoomT = Math.min(1, (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));
  return near * (0.25 + zoomT * 0.75);
}

function floorYAtDist(dist, horizon, scrH) {
  return horizon + (scrH * FLOOR_SCALE) / Math.max(dist, 0.08);
}

function wallSlice(dist, h, horizon) {
  const bot = Math.min(h, floorYAtDist(dist, horizon, h));
  const wallH = (h * WALL_H_SCALE) / (dist + 0.08);
  const top = Math.max(0, bot - wallH);
  return { top, bot };
}

function setKanjiFont(px) {
  ctx.font = `bold ${Math.max(12, px | 0)}px "Noto Sans JP", "MS Gothic", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}

/** Staggered mesh on black void — blue comes from kanji only when revealed. */
function wallMeshHit(sx, sy, colW, wallTops, wallBots, wallDists) {
  const col = Math.min(COLS - 1, Math.max(0, (sx / colW) | 0));
  for (let c = col - 1; c <= col + 1; c++) {
    if (c < 0 || c >= COLS) continue;
    const amt = revealAmt(wallDists[c]);
    if (amt <= 0.04) continue;
    if (sy >= wallTops[c] && sy <= wallBots[c]) {
      return { dist: wallDists[c], amt };
    }
  }
  return null;
}

function drawWallKanjiGrid(w, h, colW, wallTops, wallBots, wallDists, zoomMul) {
  let minDist = MAX_DEPTH;
  let anchorCol = (COLS / 2) | 0;

  for (let c = 0; c < COLS; c++) {
    const d = wallDists[c];
    if (revealAmt(d) <= 0.04) continue;
    if (d < minDist) {
      minDist = d;
      anchorCol = c;
    }
  }
  if (minDist >= REVEAL_DIST) return;

  const close = 1 - minDist / REVEAL_DIST;
  const amt = revealAmt(minDist) * zoomMul;
  const cellPx = Math.max(16, 16 + close * 18 + amt * 4);
  const cellW = cellPx * 1.08;
  const rowStep = cellPx * 0.7;
  const refBot = wallBots[anchorCol];

  let row = 0;
  for (let sy = refBot - rowStep * 0.5; sy >= 0; sy -= rowStep, row++) {
    const xOff = row & 1 ? cellW * 0.5 : 0;

    for (let sx = xOff + cellW * 0.5; sx < w; sx += cellW) {
      const hit = wallMeshHit(sx, sy, colW, wallTops, wallBots, wallDists);
      if (!hit) continue;

      const { dist, amt: colAmt } = hit;
      const size = Math.min(cellPx * 0.52, cellW * 0.82);
      const colClose = 1 - dist / REVEAL_DIST;
      const blue = mix(palette.wallDark, palette.wall, 0.5 + colClose * 0.45 + colAmt * 0.08);

      setKanjiFont(size);
      ctx.fillStyle = blue;
      ctx.fillText(WALL, sx, sy);
    }
  }
}

/** Torii lintel/beams only — pillars are map walls. */
function drawToriiSprite(z, w, h, horizon, dirX, dirY, planeX, planeY) {
  const dx = TORII_GATE.x - player.x;
  const dy = TORII_GATE.y - player.y;
  const inv = 1 / (planeX * dirY - dirX * planeY + 1e-9);
  const tx = inv * (dirY * dx - dirX * dy);
  const ty = inv * (-planeY * dx + planeX * dy);
  if (ty <= 0.12) return null;

  const dist = ty;
  const screenX = w / 2 + (w / 2) * (tx / ty);
  const col = Math.max(0, Math.min(COLS - 1, ((screenX / w) * COLS) | 0));
  if (dist >= z[col]) return null;

  const spriteH = Math.min((h * 1.6) / (dist + 0.08), h * 0.72);
  const spriteW = spriteH * 0.95;
  const footY = floorYAtDist(dist, horizon, h);
  const top = footY - spriteH;
  const left = screenX - spriteW / 2;
  const shade = 1 - Math.min(dist / MAX_DEPTH, 1);
  const colFill = mix(palette.toriiDark, palette.toriiHi, 0.4 + shade * 0.6);

  const lintelY = top + spriteH * 0.06;
  const beamY = lintelY + spriteH * 0.13;

  ctx.fillStyle = colFill;
  ctx.fillRect(left - spriteW * 0.05, lintelY, spriteW * 1.1, Math.max(spriteH * 0.1, 4));
  ctx.fillRect(left + spriteW * 0.06, beamY, spriteW * 0.88, Math.max(spriteH * 0.06, 3));

  return { dist, left, top, spriteW, spriteH, colFill };
}

function drawToriiKanji(info, amt) {
  if (!info || amt <= 0.04) return;
  const { left, top, spriteW, spriteH, colFill } = info;
  setKanjiFont(Math.max(14, spriteH * 0.12));
  ctx.fillStyle = palette.toriiKanji;
  for (let i = 0; i < 3; i++) {
    ctx.fillText(TORII, left + spriteW * (0.2 + i * 0.3), top + spriteH * 0.08);
  }
}

function render() {
  const w = canvas.width;
  const h = canvas.height;
  const horizon = (h * HORIZON_RATIO) | 0;
  const colW = w / COLS;
  const planeLen = PLANE_BASE / zoom;

  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, w, horizon);

  const z = new Float32Array(COLS);
  const wallTops = new Float32Array(COLS);
  const wallBots = new Float32Array(COLS);
  const wallDists = new Float32Array(COLS);

  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  const planeX = Math.cos(player.angle + Math.PI / 2) * planeLen;
  const planeY = Math.sin(player.angle + Math.PI / 2) * planeLen;

  for (let col = 0; col < COLS; col++) {
    const camX = (2 * col) / COLS - 1;
    const rdx = dirX + planeX * camX;
    const rdy = dirY + planeY * camX;
    const hit = castWallDir(rdx, rdy);
    z[col] = hit.dist;
    wallDists[col] = hit.dist;

    const { top, bot } = wallSlice(hit.dist, h, horizon);
    wallTops[col] = top;
    wallBots[col] = bot;

    const visTop = Math.max(0, top);
    const visBot = Math.min(h, bot);
    if (visBot - visTop < 1) continue;

    const shade = 1 - Math.min(hit.dist / MAX_DEPTH, 1);
    const rev = revealAmt(hit.dist);
    if (rev > 0.04) {
      ctx.fillStyle = palette.meshVoid;
    } else {
      ctx.fillStyle = mix(palette.wallDark, palette.wall, shade * (hit.side ? 0.65 : 1));
    }
    ctx.fillRect(col * colW, visTop, colW + 0.5, visBot - visTop);
  }

  for (let y = horizon + 1; y < h; y += 2) {
    const rowDist = (h * FLOOR_SCALE) / (y - horizon);
    const shade = 1 - Math.min(rowDist / MAX_DEPTH, 1);
    ctx.fillStyle = mix(palette.floorDark, palette.floor, shade);

    let col = 0;
    while (col < COLS) {
      while (col < COLS && rowDist >= z[col]) col++;
      if (col >= COLS) break;
      const start = col;
      while (col < COLS && rowDist < z[col]) col++;
      ctx.fillRect(start * colW, y, (col - start) * colW, 2);
    }
  }

  const toriiInfo = drawToriiSprite(z, w, h, horizon, dirX, dirY, planeX, planeY);

  const zoomMul = Math.min(1, zoom / 1.2);
  drawWallKanjiGrid(w, h, colW, wallTops, wallBots, wallDists, zoomMul);

  let minWall = MAX_DEPTH;
  for (let col = 0; col < COLS; col++) minWall = Math.min(minWall, wallDists[col]);

  const floorAmt = revealAmt(Math.min(minWall, 0.9));
  if (floorAmt > 0.04) {
    const step = Math.max(40, (56 / zoom) | 0);
    const close = 1 - Math.min(minWall, 0.9) / REVEAL_DIST;
    setKanjiFont(12 + floorAmt * 16);
    ctx.fillStyle = mix(palette.floorDark, palette.floor, 0.42 + close * 0.38);
    ctx.textBaseline = "top";
    for (let y = horizon + 1; y < h; y += step) {
      const rowDist = (h * FLOOR_SCALE) / (y - horizon);
      if (rowDist >= REVEAL_DIST) continue;
      for (let col = 0; col < COLS; col += 2) {
        if (rowDist >= z[col]) continue;
        ctx.fillText(FLOOR, (col + 0.5) * colW, y);
      }
    }
  }

  if (toriiInfo) drawToriiKanji(toriiInfo, revealAmt(toriiInfo.dist));
}

function move(dt) {
  let fwd = 0;
  let turn = 0;

  if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) turn -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) turn += 1;

  player.angle += turn * TURN * dt;

  if (fwd) {
    const nx = player.x + Math.cos(player.angle) * fwd * MOVE * dt;
    const ny = player.y + Math.sin(player.angle) * fwd * MOVE * dt;
    trySlide(nx, ny);
  }

  if (passedToriiGate() && !won) {
    won = true;
    if (hud) hud.textContent = "鳥居 — 到着!";
    if (prompt) {
      prompt.hidden = false;
      document.getElementById("yg-prompt-text").textContent = "You reached the torii";
    }
  }

  saveTimer += dt;
  if (saveTimer >= 2) {
    saveTimer = 0;
    writeSave({ version: 4, x: player.x, y: player.y, angle: player.angle, zone: "kanji-ray-test" });
  }
}

function flushSave() {
  writeSave({ version: 4, x: player.x, y: player.y, angle: player.angle, zone: "kanji-ray-test" });
}

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - lastT) / 1000, 0.05) || 0.016;
  lastT = t;
  move(dt);
  render();
}

window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("beforeunload", flushSave);
window.addEventListener("resize", resize);
window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom - e.deltaY * 0.0012));
  },
  { passive: false },
);

if (location.search.includes("reset")) {
  localStorage.removeItem("yugen-gatherer-v2");
  player.x = 4.5;
  player.y = 10.5;
  player.angle = -Math.PI / 2;
  won = false;
  zoom = 1.0;
  if (prompt) prompt.hidden = true;
}

if (hud) hud.textContent = "hallway → 鳥居";
resize();
loop(0);
