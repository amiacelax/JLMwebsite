/**
 * Kanji Ray — flat XYZ raycaster (map X/Z, screen Y up).
 * Far = solid fills. Within ~2 tiles + scroll zoom = kanji reveal.
 */
import { loadSave, writeSave } from "./save.js";

const canvas = document.getElementById("yg-canvas");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("yg-hud-zone");
const prompt = document.getElementById("yg-prompt");

const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const MAP_W = MAP[0].length;
const MAP_H = MAP.length;

const WALL = "壁";
const FLOOR = "床";
const TORII = "鳥居";

const COLS = 120;
const MAX_DEPTH = 22;
const MOVE = 2.4;
const TURN = 2.0;
const REVEAL_DIST = 2.0;
const ZOOM_MIN = 0.85;
const ZOOM_MAX = 2.8;
const PLANE_BASE = 0.66;

const TORII_OBJ = { x: 4.5, y: 3.0, reach: 1.0 };

const palette = {
  sky: "#0a0e14",
  wall: "#2a6898",
  wallDark: "#153050",
  wallKanji: "#9ec8e8",
  floor: "#7a5838",
  floorDark: "#3d2818",
  floorKanji: "#c8a878",
  torii: "#c03028",
  toriiDark: "#801820",
  toriiHi: "#e85040",
  toriiKanji: "#ffc8b8",
};

const save = loadSave();
const player = {
  x: typeof save.x === "number" ? save.x : 4.5,
  y: typeof save.y === "number" ? save.y : 9.2,
  angle: typeof save.angle === "number" ? save.angle : -Math.PI / 2,
};

const keys = new Set();
let zoom = 1.0;
let won = false;
let lastT = 0;
let saveTimer = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
}

function tileAt(mx, my) {
  if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return 1;
  return MAP[my][mx];
}

function solid(t) {
  return t === 1;
}

function trySlide(nx, ny) {
  if (!solid(tileAt(Math.floor(nx), Math.floor(player.y)))) player.x = nx;
  if (!solid(tileAt(Math.floor(player.x), Math.floor(ny)))) player.y = ny;
}

/** DDA on direction vector (linear rays — flat walls, no fish-eye curve). */
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

/** 0 = solid only. 1 = full kanji grid. Needs close range; zoom amplifies. */
function revealAmt(dist) {
  if (dist >= REVEAL_DIST) return 0;
  const near = 1 - dist / REVEAL_DIST;
  const zoomT = Math.min(1, (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));
  return near * (0.25 + zoomT * 0.75);
}

function floorYAtDist(dist, horizon, scrH) {
  return horizon + (0.5 * scrH) / Math.max(dist, 0.08);
}

function setKanjiFont(px) {
  ctx.font = `bold ${Math.max(12, px | 0)}px "Noto Sans JP", "MS Gothic", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}

/** 2D kanji grid across a wall face (visible when close + zoomed). */
function drawWallKanjiFace(left, right, top, bot, amt, char, color) {
  if (amt <= 0.04) return;
  const h = canvas.height;
  const visL = Math.max(0, left);
  const visR = Math.min(canvas.width, right);
  const visT = Math.max(0, top);
  const visB = Math.min(h, bot);
  const visW = visR - visL;
  const visH = visB - visT;
  if (visW < 8 || visH < 8) return;

  const cells = Math.max(3, Math.min(7, Math.round(3 + amt * 4)));
  const cellH = visH / cells;
  const cellW = cellH * 1.05;
  const size = cellH * 0.78;
  setKanjiFont(size);
  ctx.fillStyle = color;

  const cols = Math.ceil(visW / cellW) + 1;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillText(char, visL + (c + 0.5) * cellW, visT + (r + 0.5) * cellH);
    }
  }
}

function drawToriiSolid(z, w, h, horizon, dirX, dirY, planeX, planeY) {
  const dx = TORII_OBJ.x - player.x;
  const dy = TORII_OBJ.y - player.y;
  const inv = 1 / (planeX * dirY - dirX * planeY + 1e-9);
  const tx = inv * (dirY * dx - dirX * dy);
  const ty = inv * (-planeY * dx + planeX * dy);
  if (ty <= 0.15) return null;

  const dist = ty;
  const col = Math.max(0, Math.min(COLS - 1, ((COLS / 2) * (1 + tx / ty)) | 0));
  if (dist >= z[col]) return null;

  const rawH = (h * 0.55) / (dist + 0.12);
  const spriteH = Math.min(rawH, h * 0.65);
  const spriteW = spriteH * 0.9;
  const footY = floorYAtDist(dist, horizon, h);
  const top = footY - spriteH;
  const left = w / 2 + (w / 2) * (tx / ty) - spriteW / 2;
  const shade = 1 - Math.min(dist / MAX_DEPTH, 1);
  const colFill = mix(palette.toriiDark, palette.toriiHi, shade);

  const pw = spriteW * 0.13;
  const gapL = left + spriteW * 0.34;
  const gapR = left + spriteW * 0.66;
  const lintelY = top + spriteH * 0.08;
  const beamY = lintelY + spriteH * 0.12;

  ctx.fillStyle = colFill;
  ctx.fillRect(left, top, pw, spriteH);
  ctx.fillRect(left + spriteW - pw, top, pw, spriteH);
  ctx.fillRect(left - spriteW * 0.03, lintelY, spriteW * 1.06, spriteH * 0.1);
  ctx.fillRect(left + spriteW * 0.1, beamY, spriteW * 0.8, spriteH * 0.06);

  return { dist, left, top, footY, spriteW, spriteH, colFill };
}

function drawToriiKanji(info, amt) {
  if (!info || amt <= 0.04) return;
  const { left, top, spriteW, spriteH } = info;
  const pw = spriteW * 0.13;
  const size = Math.min(spriteH * 0.2, pw);
  setKanjiFont(size);
  ctx.fillStyle = palette.toriiKanji;

  for (let r = 0; r < 4; r++) {
    const py = top + spriteH * 0.18 + r * spriteH * 0.18;
    ctx.fillText(TORII, left + pw / 2, py);
    ctx.fillText(TORII, left + spriteW - pw / 2, py);
  }
  for (let i = 0; i < 3; i++) {
    ctx.fillText(TORII, left + spriteW * (0.22 + i * 0.28), top + spriteH * 0.1);
  }
}

function render() {
  const w = canvas.width;
  const h = canvas.height;
  const horizon = (h / 2) | 0;
  const colW = w / COLS;
  const planeLen = PLANE_BASE / zoom;

  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, w, h);

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

    const wallH = h / (hit.dist + 0.12);
    const floorLine = floorYAtDist(hit.dist, horizon, h);
    const top = horizon - wallH / 2;
    const bot = Math.min(horizon + wallH / 2, floorLine);
    wallTops[col] = top;
    wallBots[col] = bot;

    const visTop = Math.max(0, top);
    const visBot = Math.min(h, bot);
    const visH = visBot - visTop;
    if (visH < 1) continue;

    const shade = 1 - Math.min(hit.dist / MAX_DEPTH, 1);
    ctx.fillStyle = mix(palette.wallDark, palette.wall, shade * (hit.side ? 0.65 : 1));
    ctx.fillRect(col * colW, visTop, colW + 0.5, visH);
  }

  const toriiInfo = drawToriiSolid(z, w, h, horizon, dirX, dirY, planeX, planeY);

  for (let y = horizon; y < h; y++) {
    const rowDist = y === horizon ? MAX_DEPTH : (0.5 * h) / (y - horizon);
    const shade = 1 - Math.min(rowDist / MAX_DEPTH, 1);
    ctx.fillStyle = mix(palette.floorDark, palette.floor, shade);
    ctx.fillRect(0, y, w, 1);
  }

  let bestAmt = 0;
  let faceL = w;
  let faceR = 0;
  let faceT = h;
  let faceB = 0;
  let faceDist = MAX_DEPTH;

  for (let col = 0; col < COLS; col++) {
    const dist = wallDists[col];
    const amt = revealAmt(dist);
    if (amt <= 0.04) continue;
    if (amt > bestAmt) {
      bestAmt = amt;
      faceDist = dist;
    }
    const x0 = col * colW;
    faceL = Math.min(faceL, x0);
    faceR = Math.max(faceR, x0 + colW);
    faceT = Math.min(faceT, wallTops[col]);
    faceB = Math.max(faceB, wallBots[col]);
  }

  if (bestAmt > 0.04) {
    drawWallKanjiFace(faceL, faceR, faceT, faceB, bestAmt * Math.min(1, zoom / 1.2), WALL, palette.wallKanji);
  }

  const floorAmt = revealAmt(Math.min(faceDist, 1.8));
  if (floorAmt > 0.04) {
    const fy = Math.min(h - 1, floorYAtDist(1.2, horizon, h));
    const fTop = Math.max(horizon, fy - h * 0.22 * floorAmt);
    const step = Math.max(36, (52 / zoom) | 0);
    const fSize = 14 + floorAmt * 22;
    setKanjiFont(fSize);
    ctx.fillStyle = palette.floorKanji;
    ctx.textBaseline = "top";
    for (let y = fTop | 0; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const col = Math.min(COLS - 1, (x / w * COLS) | 0);
        const rowDist = (0.5 * h) / Math.max(y - horizon, 1);
        if (rowDist >= z[col]) continue;
        ctx.fillText(FLOOR, x, y);
      }
    }
  }

  if (toriiInfo) {
    drawToriiKanji(toriiInfo, revealAmt(toriiInfo.dist));
  }
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

  const td = Math.hypot(player.x - TORII_OBJ.x, player.y - TORII_OBJ.y);
  if (td < TORII_OBJ.reach && !won) {
    won = true;
    if (hud) hud.textContent = "鳥居 — 到着!";
    if (prompt) {
      prompt.hidden = false;
      document.getElementById("yg-prompt-text").textContent = "You reached the torii";
    }
  }

  saveTimer += dt;
  if (saveTimer >= 0.4) {
    saveTimer = 0;
    writeSave({ version: 3, x: player.x, y: player.y, angle: player.angle, zone: "kanji-ray-test" });
  }
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
  player.y = 9.2;
  player.angle = -Math.PI / 2;
  won = false;
  zoom = 1.0;
  if (prompt) prompt.hidden = true;
}

if (hud) hud.textContent = "hallway → 鳥居";
resize();
loop(0);
