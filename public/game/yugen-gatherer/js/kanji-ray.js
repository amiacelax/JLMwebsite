/**
 * Kanji Ray — 3D lattice of 漢字 atoms projected from world xyz.
 */
import { loadSave, writeSave } from "./save.js";

const canvas = document.getElementById("yg-canvas");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("yg-hud-zone");
const prompt = document.getElementById("yg-prompt");

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
const PILLAR = "木";
const LINTEL = "瓦";
const GATE = "門";

const COLS = 80;
const RENDER_MAX_W = 960;
const MAX_DEPTH = 24;
const MOVE = 2.4;
const TURN = 2.0;
const REVEAL_DIST = 0.5;
const RESOLVE_RANGE = REVEAL_DIST * 3.2;
const ZOOM_MIN = 0.85;
const ZOOM_MAX = 2.8;
const PLANE_BASE = 0.66;
const HORIZON_RATIO = 0.44;
const FLOOR_SCALE = 0.46;
const WALL_H_SCALE = 0.78;
const WALL_H_WORLD = 0.96;
const TORII_PILLAR_H_WORLD = 0.96;
const LATTICE_CELL = 0.22;
const DEPTH_LAYER_RESOLVE = 0.68;
const COLOR_BLEND_RESOLVE = 0.48;
const ATOM_FILL_FAR = 0.84;
const ATOM_FILL_NEAR = 0.58;
const MAX_ATOM_PX = 24;

const TORII_ROW = 1;
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

const MATERIALS = {
  wall: { atom: WALL, dark: () => palette.wallDark, light: () => palette.wall, accent: () => palette.wallKanji },
  floor: { atom: FLOOR, dark: () => palette.floorDark, light: () => palette.floor, accent: () => palette.floorKanji },
  pillar: { atom: PILLAR, dark: () => palette.toriiDark, light: () => palette.toriiHi, accent: () => palette.toriiKanji },
  lintel: { atom: LINTEL, dark: () => palette.toriiDark, light: () => palette.toriiHi, accent: () => palette.toriiKanji },
  gate: { atom: GATE, dark: () => palette.toriiDark, light: () => palette.torii, accent: () => palette.toriiKanji },
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

const solidVoxels = new Map();
let worldAtoms = [];

function voxelKey(ix, iy, iz) {
  return `${ix},${iy},${iz}`;
}

function worldToIdx(v) {
  return Math.floor(v / LATTICE_CELL);
}

function idxToWorld(i) {
  return (i + 0.5) * LATTICE_CELL;
}

function tileAt(mx, my) {
  if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return 1;
  return MAP[my][mx];
}

function isToriiPillar(mx, my) {
  return my === TORII_ROW && (mx === 3 || mx === 5);
}

function setSolid(ix, iy, iz, material, kind, char) {
  solidVoxels.set(voxelKey(ix, iy, iz), { material, kind, char: char || material.atom });
}

function addBoxVoxels(x0, x1, y0, y1, z0, z1, material, kind, char) {
  const ix0 = worldToIdx(x0);
  const ix1 = worldToIdx(x1 - 1e-6);
  const iy0 = worldToIdx(y0);
  const iy1 = worldToIdx(y1 - 1e-6);
  const iz0 = worldToIdx(z0);
  const iz1 = worldToIdx(z1 - 1e-6);
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        setSolid(ix, iy, iz, material, kind, char);
      }
    }
  }
}

function isExterior(ix, iy, iz) {
  return (
    !solidVoxels.has(voxelKey(ix - 1, iy, iz)) ||
    !solidVoxels.has(voxelKey(ix + 1, iy, iz)) ||
    !solidVoxels.has(voxelKey(ix, iy - 1, iz)) ||
    !solidVoxels.has(voxelKey(ix, iy + 1, iz)) ||
    !solidVoxels.has(voxelKey(ix, iy, iz - 1)) ||
    !solidVoxels.has(voxelKey(ix, iy, iz + 1))
  );
}

function buildWorldAtoms() {
  solidVoxels.clear();

  for (let my = 0; my < MAP_H; my++) {
    for (let mx = 0; mx < MAP_W; mx++) {
      const wall = MAP[my][mx] === 1;
      const pillar = isToriiPillar(mx, my);
      const hWorld = pillar ? TORII_PILLAR_H_WORLD : WALL_H_WORLD;
      const zSteps = Math.ceil(hWorld / LATTICE_CELL);
      const mat = pillar ? MATERIALS.pillar : MATERIALS.wall;
      const kind = pillar ? "pillar" : "wall";

      for (let iz = 0; iz < zSteps; iz++) {
        for (let iy = worldToIdx(my); iy <= worldToIdx(my + 1 - 1e-6); iy++) {
          for (let ix = worldToIdx(mx); ix <= worldToIdx(mx + 1 - 1e-6); ix++) {
            if (idxToWorld(iz) > hWorld) continue;
            if (wall) setSolid(ix, iy, iz, mat, kind);
            else if (iz === 0) setSolid(ix, iy, 0, MATERIALS.floor, "floor");
          }
        }
      }
    }
  }

  addBoxVoxels(3.06, 5.94, 0.82, 1.18, 0.84, 0.98, MATERIALS.lintel, "kasagi");
  addBoxVoxels(3.34, 5.66, 0.88, 1.12, 0.7, 0.84, MATERIALS.lintel, "nuki");
  addBoxVoxels(4.1, 4.9, 0.92, 1.08, 0.56, 0.72, MATERIALS.gate, "gaku", GATE);
  setSolid(worldToIdx(4.5), worldToIdx(1.0), worldToIdx(0.64), MATERIALS.gate, "gaku-center", TORII);

  const atoms = [];
  for (const [key, data] of solidVoxels) {
    const [ix, iy, iz] = key.split(",").map(Number);
    if (!isExterior(ix, iy, iz)) continue;
    atoms.push({
      x: idxToWorld(ix),
      y: idxToWorld(iy),
      z: idxToWorld(iz),
      ix,
      iy,
      iz,
      material: data.material,
      kind: data.kind,
      char: data.char,
    });
  }
  return atoms;
}

function resize() {
  const scale = Math.min(1, RENDER_MAX_W / window.innerWidth);
  canvas.width = Math.max(320, (window.innerWidth * scale) | 0);
  canvas.height = Math.max(240, (window.innerHeight * scale) | 0);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  ctx.imageSmoothingEnabled = false;
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

  return { dist, side, mx, my };
}

function sameWallFace(a, b) {
  if (!b || a.side !== b.side) return false;
  return a.side === 0 ? a.mx === b.mx : a.my === b.my;
}

function mix(a, b, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ca = p(a);
  const cb = p(b);
  return `rgb(${ca.map((v, i) => (v + (cb[i] - v) * t) | 0).join(",")})`;
}

function resolveAmount(dist) {
  if (dist >= RESOLVE_RANGE) return 0;
  const near = 1 - dist / RESOLVE_RANGE;
  const zoomT = Math.min(1, (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));
  return Math.min(1, near * (0.15 + zoomT * 0.85));
}

function floorYAtDist(dist, horizon, scrH) {
  return horizon + (scrH * FLOOR_SCALE) / Math.max(dist, 0.08);
}

function wallSlice(dist, h, horizon, hit) {
  const bot = Math.min(h, floorYAtDist(dist, horizon, h));
  const hScale = hit && isToriiPillar(hit.mx, hit.my) ? TORII_PILLAR_H_WORLD / WALL_H_WORLD : 1;
  const wallH = ((h * WALL_H_SCALE) / (dist + 0.08)) * hScale;
  const top = Math.max(0, bot - wallH);
  return { top, bot };
}

function drawWallTrapezoid(x0, x1, top0, top1, bot0, bot1, scrH, style) {
  if (!style) return;
  const t0 = Math.max(0, top0);
  const t1 = Math.max(0, top1);
  const b0 = Math.min(scrH, bot0);
  const b1 = Math.min(scrH, bot1);
  if (Math.max(t0, t1) >= Math.min(b0, b1) - 0.5) return;
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.moveTo(x0, t0);
  ctx.lineTo(x1, t1);
  ctx.lineTo(x1, b1);
  ctx.lineTo(x0, b0);
  ctx.closePath();
  ctx.fill();
}

function setKanjiFont(px) {
  ctx.font = `bold ${Math.max(4, px | 0)}px "Noto Sans JP", "MS Gothic", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}

function viewDirAtCol(col, dirX, dirY, planeX, planeY) {
  const camX = (2 * col) / COLS - 1;
  const rdx = dirX + planeX * camX;
  const rdy = dirY + planeY * camX;
  const len = Math.hypot(rdx, rdy) || 1;
  return { x: rdx / len, y: rdy / len };
}

function hitForAtom(atom) {
  if (atom.kind === "floor") return { side: 1, mx: worldToIdx(atom.x), my: worldToIdx(atom.y) };
  const mx = Math.floor(atom.x);
  const my = Math.floor(atom.y);
  const dx = player.x - (mx + 0.5);
  const dy = player.y - (my + 0.5);
  if (Math.abs(dx) > Math.abs(dy)) return { side: 0, mx, my };
  return { side: 1, mx, my };
}

function wallNormalTowardPlayer(hit) {
  if (hit.side === 0) {
    return player.x < hit.mx + 0.5 ? { x: -1, y: 0 } : { x: 1, y: 0 };
  }
  return player.y < hit.my + 0.5 ? { x: 0, y: -1 } : { x: 0, y: 1 };
}

function surfaceTransform(hit, viewDir) {
  const n = wallNormalTowardPlayer(hit);
  const face = Math.abs(n.x * viewDir.x + n.y * viewDir.y);
  const scaleX = Math.max(0.22, Math.min(1, face));
  const tx = -n.y;
  const ty = n.x;
  const along = viewDir.x * tx + viewDir.y * ty;
  const skewX = along * (1 - face) * 0.48;
  return { scaleX, skewX, nx: n.x, ny: n.y };
}

function vertScaleAt(dist, h) {
  return (h * WALL_H_SCALE) / (dist + 0.08) / WALL_H_WORLD;
}

function atomSizeForVoxel(dist, resolve, vertScale, scaleX) {
  const footprint = vertScale * LATTICE_CELL * scaleX;
  const fill = ATOM_FILL_FAR + (ATOM_FILL_NEAR - ATOM_FILL_FAR) * resolve;
  return Math.min(MAX_ATOM_PX, Math.max(5, footprint * fill));
}

function atomColor(material, dist, resolve) {
  const shade = 1 - Math.min(dist / MAX_DEPTH, 1);
  const t = resolve * 0.65 + shade * (1 - resolve * 0.45);
  if (resolve > COLOR_BLEND_RESOLVE) {
    return mix(material.dark(), material.accent(), 0.38 + t * 0.5);
  }
  return mix(material.dark(), material.light(), t);
}

function surfaceBackdrop(material, resolve) {
  if (resolve < 0.06) return null;
  if (resolve > COLOR_BLEND_RESOLVE) return palette.meshVoid;
  return mix(material.dark(), palette.meshVoid, resolve * 1.35);
}

function latticeStagger(ix, iy, iz, cellPx) {
  return (ix + iy + iz) & 1 ? cellPx * 0.28 : 0;
}

function projectAtom3D(atom, w, h, horizon, dirX, dirY, planeX, planeY) {
  const dx = atom.x - player.x;
  const dy = atom.y - player.y;
  const inv = 1 / (planeX * dirY - dirX * planeY + 1e-9);
  const tx = inv * (dirY * dx - dirX * dy);
  const ty = inv * (-planeY * dx + planeX * dy);
  if (ty <= 0.12) return null;

  const dist = ty;
  const sx = w / 2 + (w / 2) * (tx / ty);
  const footY = floorYAtDist(dist, horizon, h);
  const vScale = vertScaleAt(dist, h);
  const sy = footY - atom.z * vScale;

  if (sx < -24 || sx > w + 24 || sy < horizon - 32 || sy > h + 16) return null;

  return { dist, depth: dist + atom.z * 0.1, sx, sy, vScale };
}

function overlapKey(col, sx, sy, size) {
  const bucket = Math.max(4, size * 0.82);
  return `${col},${(sx / bucket) | 0},${(sy / bucket) | 0}`;
}

function drawAtomGlyph(char, sx, sy, size, color, hit, viewDir, alpha) {
  const { scaleX, skewX } = surfaceTransform(hit, viewDir);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);
  ctx.transform(1, 0, skewX, 1, 0, 0);
  ctx.scale(scaleX, 1);
  setKanjiFont(size);
  ctx.fillStyle = color;
  ctx.fillText(char, 0, 0);
  ctx.restore();
}

function drawSurfaceBackdrops(w, h, horizon, colW, wallTops, wallBots, wallDists, wallHits) {
  for (let col = 0; col < COLS; ) {
    let runEnd = col;
    while (runEnd + 1 < COLS && sameWallFace(wallHits[runEnd], wallHits[runEnd + 1])) {
      runEnd++;
    }
    const midDist = (wallDists[col] + wallDists[runEnd]) * 0.5;
    const resolve = resolveAmount(midDist);
    const hit = wallHits[col];
    const mat = hit && isToriiPillar(hit.mx, hit.my) ? MATERIALS.pillar : MATERIALS.wall;
    drawWallTrapezoid(
      col * colW,
      runEnd + 1 < COLS ? (runEnd + 1) * colW : w,
      wallTops[col],
      wallTops[runEnd],
      wallBots[col],
      wallBots[runEnd],
      h,
      surfaceBackdrop(mat, resolve),
    );
    col = runEnd + 1;
  }
}

function renderWorldAtoms(w, h, horizon, colW, z, dirX, dirY, planeX, planeY) {
  const queue = [];
  const occupied = new Set();

  for (const atom of worldAtoms) {
    const proj = projectAtom3D(atom, w, h, horizon, dirX, dirY, planeX, planeY);
    if (!proj || proj.dist >= MAX_DEPTH) continue;

    const col = Math.max(0, Math.min(COLS - 1, ((proj.sx / w) * COLS) | 0));
    if (atom.kind === "floor") {
      if (proj.dist >= z[col]) continue;
    } else if (proj.dist > z[col] + 0.04) {
      continue;
    }

    queue.push({ atom, ...proj, col });
  }

  queue.sort((a, b) => a.depth - b.depth);

  for (const item of queue) {
    const { atom, dist, sx, sy, col, vScale } = item;
    const resolve = resolveAmount(dist);
    const hit = hitForAtom(atom);
    const viewDir = viewDirAtCol(col, dirX, dirY, planeX, planeY);
    const { scaleX } = surfaceTransform(hit, viewDir);
    const size = atomSizeForVoxel(dist, resolve, vScale, scaleX);
    const key = overlapKey(col, sx, sy, size);
    if (occupied.has(key)) continue;
    occupied.add(key);

    const stagger = latticeStagger(atom.ix, atom.iy, atom.iz, size);
    drawAtomGlyph(atom.char, sx + stagger, sy, size, atomColor(atom.material, dist, resolve), hit, viewDir, 1);

    if (resolve > DEPTH_LAYER_RESOLVE && dist < REVEAL_DIST * 1.4 && atom.iz > 0) {
      const backData = solidVoxels.get(voxelKey(atom.ix, atom.iy, atom.iz - 1));
      if (backData) {
        const backAtom = {
          ...atom,
          z: idxToWorld(atom.iz - 1),
          iz: atom.iz - 1,
          char: backData.char,
          material: backData.material,
        };
        const backProj = projectAtom3D(backAtom, w, h, horizon, dirX, dirY, planeX, planeY);
        if (backProj) {
          const backSize = size * 0.86;
          drawAtomGlyph(
            backAtom.char,
            backProj.sx + latticeStagger(backAtom.ix, backAtom.iy, backAtom.iz, backSize),
            backProj.sy,
            backSize,
            atomColor(backAtom.material, dist, resolve * 0.8),
            hit,
            viewDir,
            0.32,
          );
        }
      }
    }
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
  const wallHits = new Array(COLS);

  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  const planeX = Math.cos(player.angle + Math.PI / 2) * planeLen;
  const planeY = Math.sin(player.angle + Math.PI / 2) * planeLen;

  for (let col = 0; col < COLS; col++) {
    const camX = (2 * col) / COLS - 1;
    const rdx = dirX + planeX * camX;
    const rdy = dirY + planeY * camX;
    const hit = castWallDir(rdx, rdy);
    wallHits[col] = hit;
    wallDists[col] = hit.dist;
    z[col] = hit.dist;
    const slice = wallSlice(hit.dist, h, horizon, hit);
    wallTops[col] = slice.top;
    wallBots[col] = slice.bot;
  }

  drawSurfaceBackdrops(w, h, horizon, colW, wallTops, wallBots, wallDists, wallHits);
  renderWorldAtoms(w, h, horizon, colW, z, dirX, dirY, planeX, planeY);

  ctx.textBaseline = "middle";
  ctx.globalAlpha = 1;
}

function move(dt) {
  let fwd = 0;
  let turn = 0;
  let strafe = 0;

  if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) turn -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) turn += 1;
  if (keys.has("KeyQ")) strafe -= 1;
  if (keys.has("KeyE")) strafe += 1;

  player.angle += turn * TURN * dt;

  if (fwd || strafe) {
    const nx = player.x + (Math.cos(player.angle) * fwd - Math.sin(player.angle) * strafe) * MOVE * dt;
    const ny = player.y + (Math.sin(player.angle) * fwd + Math.cos(player.angle) * strafe) * MOVE * dt;
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

worldAtoms = buildWorldAtoms();
if (hud) hud.textContent = "hallway → 鳥居";
resize();
loop(0);
