// Room — a first-person room woven from kanji glyphs.
// Port of https://rmar.xyz/projects/room (Rigel)
// Walk closer (WASD + mouse look) and the glyphs resolve into focus.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.175.0/build/three.module.js";

const canvas = document.getElementById("yg-canvas");
if (!canvas) throw new Error("room canvas not found");

const panel = canvas.parentElement;
panel.style.position = "relative";
panel.style.overflow = "hidden";

const W = () => panel.clientWidth;
const H = () => panel.clientHeight;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.045);

const camera = new THREE.PerspectiveCamera(70, W() / H(), 0.1, 100);
camera.position.set(0, 1.6, 4);

scene.add(new THREE.AmbientLight(0xffffff, 1));

const textureCache = new Map();

function kanjiTexture(char, color) {
  const key = char + color;
  if (textureCache.has(key)) return textureCache.get(key);

  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.font = `700 ${size * 0.78}px "Yu Gothic", "Meiryo", "MS Gothic", "Noto Sans JP", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(char, size / 2, size / 2 + 4);
  ctx.shadowBlur = 0;
  ctx.fillText(char, size / 2, size / 2 + 4);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  return tex;
}

function lanternGlowTexture(hex) {
  const key = `lantern-glow:${hex}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const col = new THREE.Color(hex);
  const r = (col.r * 255) | 0;
  const g = (col.g * 255) | 0;
  const b = (col.b * 255) | 0;
  const w = 192;
  const h = 160;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";

  const blob = (cx, cy, rx, ry, peak) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(${r},${g},${b},${peak})`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},${peak * 0.38})`);
    grad.addColorStop(0.72, `rgba(${r},${g},${b},${peak * 0.1})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  blob(w * 0.5, h * 0.44, w * 0.34, h * 0.22, 0.55);
  blob(w * 0.52, h * 0.3, w * 0.16, h * 0.42, 0.32);
  blob(w * 0.47, h * 0.6, w * 0.28, h * 0.14, 0.18);
  blob(w * 0.63, h * 0.46, w * 0.11, h * 0.18, 0.12);
  blob(w * 0.36, h * 0.5, w * 0.09, h * 0.15, 0.1);

  const tex = new THREE.CanvasTexture(c);
  textureCache.set(key, tex);
  return tex;
}

const glyphs = [];
const snowflakes = [];
const fallingLeaves = [];
const fallTreeSources = [];
const fallingPetals = [];
const springTreeSources = [];
const birdFlocks = [];
let leafSpawnCD = 2;
let petalSpawnCD = 2;
let birdSpawnCD = 6;
const RIVER_FLOW_AXIS = 1; // +X — river flows left/right past the bridge
const SHAPE_KINDS = new Set(["floor", "wall", "door", "chair", "ice", "water", "bridge", "river", "foliage", "tree"]);

function addGlyph(kind, char, color, pos, scale = 0.5, roomId = "demo") {
  const shapeFirst = SHAPE_KINDS.has(kind);
  const mat = new THREE.SpriteMaterial({
    map: kanjiTexture(char, color),
    transparent: true,
    depthWrite: false,
    blending: shapeFirst ? THREE.NormalBlending : THREE.AdditiveBlending,
    opacity: 0,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(pos);
  sprite.scale.setScalar(scale);
  sprite.visible = false;
  scene.add(sprite);
  const entry = { sprite, baseScale: scale, kind, shapeFirst, roomId };
  glyphs.push(entry);
  return entry;
}

const ROOM = 7;
const HGT = 4;

/** Half-extent per room — fall is 2× standard. */
const ROOM_HALF = {
  demo: ROOM,
  winter: ROOM,
  summer: ROOM,
  fall: ROOM * 2,
  spring: ROOM,
};

function roomHalf(roomId) {
  return ROOM_HALF[roomId] ?? ROOM;
}

/** Fixed colors per kanji/object — same in every room. */
const OBJECT_COLORS = {
  beacon: "#e8c070", // 光
  door: "#b91c1c", // 扉
  wall: "#8a7fb5", // 壁
  floor: "#3a6ea5", // 床
  earth: "#8b7355", // 土
  chair: "#5fb39a", // 椅 子
  ice: "#b8e8f4", // 氷
  snow: "#e8f4fc", // 雪
  sand: "#c9a066", // 砂
  water: "#2d8fbf", // 水
  bridge: "#8a8680", // 橋 stone
  river: "#3a7ca5", // 川
  wood: "#6b4f3a", // 木
  maple_red: "#c42b1a", // 紅葉 palette
  maple_yellow: "#d4a017",
  maple_green: "#3d6b35",
  grass: "#5a9a5a", // 草
  sakura: "#ffb7c5", // 桜
  sakura_pale: "#ffd1e0",
  sakura_deep: "#f08fa8",
  bird: "#e8e4dc", // 鳥
};

function objectColor(kind, char) {
  if (char === "土") return OBJECT_COLORS.earth;
  if (char === "砂") return OBJECT_COLORS.sand;
  if (char === "草") return OBJECT_COLORS.grass;
  if (char === "水") return OBJECT_COLORS.water;
  if (char === "川") return OBJECT_COLORS.river;
  if (char === "橋") return OBJECT_COLORS.bridge;
  if (char === "木") return OBJECT_COLORS.wood;
  if (char === "桜") return pickSakuraColor();
  if (char === "紅葉" || char === "葉") return pickMapleColor();
  return OBJECT_COLORS[kind] ?? "#ffffff";
}

function pickMapleColor() {
  const r = Math.random();
  if (r < 0.05) return OBJECT_COLORS.maple_green;
  if (r < 0.3) return OBJECT_COLORS.maple_yellow;
  return OBJECT_COLORS.maple_red;
}

function pickSakuraColor() {
  const r = Math.random();
  if (r < 0.35) return OBJECT_COLORS.sakura_pale;
  if (r < 0.7) return OBJECT_COLORS.sakura;
  return OBJECT_COLORS.sakura_deep;
}

const rand = (a) => (Math.random() - 0.5) * a;

const FLOOR_STEP = 0.4;
/** Top-layer footprints — floor glyphs skip these xz regions. */
const floorMasks = [];

function registerFloorMask(roomId, test) {
  floorMasks.push({ roomId, test });
}

function floorBlocked(roomId, x, z) {
  return floorMasks.some((m) => m.roomId === roomId && m.test(x, z));
}

function buildFloor(roomId, char = "床") {
  const y = 0.02;
  const color = objectColor("floor", char);
  const half = roomHalf(roomId);
  const cols = Math.round((2 * half) / FLOOR_STEP) + 1;

  for (let row = 0; row < cols; row++) {
    const rowOffset = row % 2 === 1 ? FLOOR_STEP * 0.5 : 0;
    for (let col = 0; col < cols; col++) {
      const x = -half + ((2 * half) * col) / (cols - 1) + rowOffset;
      const z = -half + ((2 * half) * row) / (cols - 1);
      if (Math.abs(x) > half) continue;
      if (floorBlocked(roomId, x, z)) continue;
      const edge = col === 0 || col === cols - 1 || row === 0 || row === cols - 1;
      addGlyph("floor", char, color, new THREE.Vector3(x, y, z), edge ? 0.4 : 0.38, roomId);
    }
  }
}

const inZWallDoorway = (x, y) => x > DOOR_NEAR && x < DOOR_FAR && y < DOOR_TOP + 0.1;
const inXWallDoorway = (z, y) => z > DOOR_NEAR && z < DOOR_FAR && y < DOOR_TOP + 0.1;

function roomHasDoorway(roomId, wall) {
  if (roomId === "demo") return true;
  return wall === "back";
}

function buildWalls(roomId) {
  const color = objectColor("wall", "壁");
  const half = roomHalf(roomId);
  for (let y = 0.4; y <= HGT; y += 0.55) {
    for (let x = -half; x <= half; x += 0.6) {
      if (!(inZWallDoorway(x, y) && roomHasDoorway(roomId, "back"))) {
        addGlyph("wall", "壁", color, new THREE.Vector3(x + rand(0.05), y, -half), 0.65, roomId);
      }
      if (!(inZWallDoorway(x, y) && roomHasDoorway(roomId, "front"))) {
        addGlyph("wall", "壁", color, new THREE.Vector3(x + rand(0.05), y, half), 0.65, roomId);
      }
    }
    for (let z = -half; z <= half; z += 0.6) {
      if (!(inXWallDoorway(z, y) && roomHasDoorway(roomId, "left"))) {
        addGlyph("wall", "壁", color, new THREE.Vector3(-half, y, z + rand(0.05)), 0.65, roomId);
      }
      if (!(inXWallDoorway(z, y) && roomHasDoorway(roomId, "right"))) {
        addGlyph("wall", "壁", color, new THREE.Vector3(half, y, z + rand(0.05)), 0.65, roomId);
      }
    }
  }
}

const DOOR_COLS = 6;
const DOOR_ROWS = 7;
const DOOR_NEAR = -1.1;
const DOOR_FAR = 0.9;
const DOOR_BOTTOM = 0.4;
const DOOR_TOP = 2.8;
const DOOR_C = (DOOR_NEAR + DOOR_FAR) / 2;

function buildDoor(roomId, wall = "back") {
  const color = objectColor("door", "扉");
  const half = roomHalf(roomId);

  if (wall === "left" || wall === "right") {
    const x = wall === "left" ? -half : half;
    for (let row = 0; row < DOOR_ROWS; row++) {
      const y = DOOR_BOTTOM + ((DOOR_TOP - DOOR_BOTTOM) * row) / (DOOR_ROWS - 1);
      for (let col = 0; col < DOOR_COLS; col++) {
        const z = DOOR_NEAR + ((DOOR_FAR - DOOR_NEAR) * col) / (DOOR_COLS - 1);
        const edge = col === 0 || col === DOOR_COLS - 1 || row === 0 || row === DOOR_ROWS - 1;
        addGlyph("door", "扉", color, new THREE.Vector3(x, y, z), edge ? 0.4 : 0.36, roomId);
      }
    }
    return;
  }

  const z = wall === "back" ? -half : half;

  for (let row = 0; row < DOOR_ROWS; row++) {
    const y = DOOR_BOTTOM + ((DOOR_TOP - DOOR_BOTTOM) * row) / (DOOR_ROWS - 1);
    for (let col = 0; col < DOOR_COLS; col++) {
      const x = DOOR_NEAR + ((DOOR_FAR - DOOR_NEAR) * col) / (DOOR_COLS - 1);
      const edge = col === 0 || col === DOOR_COLS - 1 || row === 0 || row === DOOR_ROWS - 1;
      addGlyph("door", "扉", color, new THREE.Vector3(x, y, z), edge ? 0.4 : 0.36, roomId);
    }
  }
}

const doorMarkers = [];

function markerPosForWall(wall, half) {
  const y = DOOR_TOP + 0.18;
  if (wall === "back") return new THREE.Vector3(DOOR_C, y, -half + 0.3);
  if (wall === "front") return new THREE.Vector3(DOOR_C, y, half - 0.3);
  if (wall === "left") return new THREE.Vector3(-half + 0.3, y, DOOR_C);
  return new THREE.Vector3(half - 0.3, y, DOOR_C);
}

function buildDoorMarkers(roomId, wall = "back") {
  const hex = new THREE.Color(OBJECT_COLORS.beacon).getHex();
  const pos = markerPosForWall(wall, roomHalf(roomId));

  const light = new THREE.PointLight(hex, 0.9, 24, 1.6);
  light.position.copy(pos);
  light.visible = false;
  scene.add(light);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: lanternGlowTexture(hex),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.26,
    }),
  );
  halo.position.copy(pos);
  halo.scale.set(1.15, 0.82, 1);
  halo.visible = false;
  scene.add(halo);

  const lantern = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: kanjiTexture("光", OBJECT_COLORS.beacon),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.48,
    }),
  );
  lantern.position.copy(pos);
  lantern.scale.setScalar(0.3);
  lantern.visible = false;
  scene.add(lantern);

  doorMarkers.push({ roomId, wall, light, halo, lantern });
}

function updateDoorMarkers() {
  for (const m of doorMarkers) {
    const on = m.roomId === currentRoom;
    m.light.visible = on;
    m.halo.visible = on;
    m.lantern.visible = on;
  }
}

const PAIR_HALF = 0.12;
const CHAIR_STEP = 0.4;

function addChairPair(cx, cy, cz, scale, roomId) {
  const color = objectColor("chair", "椅");
  addGlyph("chair", "椅", color, new THREE.Vector3(cx - PAIR_HALF, cy, cz), scale, roomId);
  addGlyph("chair", "子", color, new THREE.Vector3(cx + PAIR_HALF, cy, cz), scale, roomId);
}

function chairAt(cx, cz, roomId) {
  const seatY = 0.9;

  for (let x = -CHAIR_STEP; x <= CHAIR_STEP; x += CHAIR_STEP) {
    for (let z = -CHAIR_STEP; z <= CHAIR_STEP; z += CHAIR_STEP) {
      addChairPair(cx + x, seatY, cz + z, 0.4, roomId);
    }
  }

  for (let x = -CHAIR_STEP; x <= CHAIR_STEP; x += CHAIR_STEP) {
    for (let y = seatY + 0.4; y <= seatY + 1.05; y += 0.38) {
      addChairPair(cx + x, y, cz - CHAIR_STEP * 0.95, 0.36, roomId);
    }
  }

  for (const sx of [-CHAIR_STEP, CHAIR_STEP]) {
    for (const sz of [-CHAIR_STEP, CHAIR_STEP]) {
      for (let y = 0.18; y < seatY - 0.1; y += 0.38) {
        addChairPair(cx + sx, y, cz + sz, 0.32, roomId);
      }
    }
  }
}

const POND_CX = 0;
const POND_CZ = 1.4;
const POND_RX = 2.0;
const POND_RZ = 1.3;
const ICE_STEP = 0.38;

function inPond(x, z) {
  const nx = (x - POND_CX) / POND_RX;
  const nz = (z - POND_CZ) / POND_RZ;
  return nx * nx + nz * nz <= 1;
}

function inChairFootprint(cx, cz, x, z) {
  const dx = Math.abs(x - cx);
  const dz = Math.abs(z - cz);
  return dx <= CHAIR_STEP + PAIR_HALF + 0.1 && dz <= CHAIR_STEP + 0.55;
}

function buildPond(roomId) {
  const color = objectColor("ice", "氷");
  const y = 0.03;
  for (let z = POND_CZ - POND_RZ; z <= POND_CZ + POND_RZ; z += ICE_STEP) {
    for (let x = POND_CX - POND_RX; x <= POND_CX + POND_RX; x += ICE_STEP) {
      const nx = (x - POND_CX) / POND_RX;
      const nz = (z - POND_CZ) / POND_RZ;
      if (nx * nx + nz * nz > 1) continue;
      const edge = nx * nx + nz * nz > 0.72;
      addGlyph("ice", "氷", color, new THREE.Vector3(x, y, z), edge ? 0.38 : 0.34, roomId);
    }
  }
}

const WATER_STEP = 0.38;
const WATER_DEPTH_RAMP = 2.2;
const STAND_EYE_Y = 1.6;
const WAIST_EYE_Y = 1.05;
const WATER_WADE_SPEED = 2.1;
const WAVE_OMEGA = 2.1;
const WAVE_K = 1.35;
const WAVE_Y_AMP = 0.13;
const WAVE_Z_AMP = 0.055;
const WAVE_SHORE_FALLOFF = 1.35;

function shoreZ(x) {
  return 4.2 + Math.sin(x * 0.35) * 0.35 + Math.cos(x * 0.15) * 0.15;
}

/** Wavy shoreline — sand near door, ocean toward the front. */
function inWater(x, z) {
  return z > shoreZ(x);
}

function waterDepthFactor(x, z) {
  if (!inWater(x, z)) return 0;
  return THREE.MathUtils.clamp((z - shoreZ(x)) / WATER_DEPTH_RAMP, 0, 1);
}

function placeWaterGlyph(roomId, color, x, y, z, scale, depth, layer) {
  const entry = addGlyph("water", "水", color, new THREE.Vector3(x, y, z), scale, roomId);
  if (roomId === "summer") {
    entry.wave = {
      baseX: x,
      baseY: y,
      baseZ: z,
      depth,
      layer,
      phase: x * 0.47 + z * 0.19 + layer * 1.15,
    };
  }
  return entry;
}

function buildWater(roomId) {
  const color = objectColor("water", "水");

  for (let z = -ROOM + 0.5; z <= ROOM - 0.5; z += WATER_STEP) {
    for (let x = -ROOM + 0.5; x <= ROOM - 0.5; x += WATER_STEP) {
      if (!inWater(x, z)) continue;
      const depth = z - shoreZ(x);
      const edge = depth < 0.55 || Math.abs(x) > ROOM - 1.2;
      const scale = edge ? 0.38 : 0.34;

      placeWaterGlyph(roomId, color, x, 0.03, z, scale, depth, 0);

      if (depth > 0.9) {
        placeWaterGlyph(roomId, color, x, 0.45, z, scale - 0.02, depth, 1);
      }
      if (depth > 1.7) {
        placeWaterGlyph(roomId, color, x, 0.88, z, scale - 0.04, depth, 2);
      }
    }
  }
}

function buildSummerRoom() {
  registerFloorMask("summer", inWater);
  buildFloor("summer", "砂");
  buildWalls("summer");
  buildDoor("summer", "back");
  buildDoorMarkers("summer", "back");
  buildWater("summer");
}

const FALL_RIVER_Z0 = 3.5;
const FALL_RIVER_Z1 = 8.5;
const FALL_BRIDGE_Z = (FALL_RIVER_Z0 + FALL_RIVER_Z1) / 2;
const FALL_BRIDGE_WALK_W = 2.2;
const FALL_BRIDGE_SPAN_W = 10;
const FALL_BRIDGE_RAMP_LEN = 1.4;
const FALL_BRIDGE_DECK_Y = 0.58;
const FALL_BRIDGE_EYE_LIFT = 0.44;
const FALL_FEATURED_TREE = { x: 0, z: 11.8 };
const RIVER_STEP = 0.4;
const BRIDGE_STEP = 0.42;
const RIVER_FLOW_SPEED = 0.55;

function onFallBridge(x, z) {
  if (Math.abs(x) > FALL_BRIDGE_WALK_W) return false;
  return z >= FALL_RIVER_Z0 - FALL_BRIDGE_RAMP_LEN && z <= FALL_RIVER_Z1 + FALL_BRIDGE_RAMP_LEN;
}

function fallBridgeEyeY(x, z) {
  if (!onFallBridge(x, z)) return null;

  if (z < FALL_RIVER_Z0) {
    const t = (z - (FALL_RIVER_Z0 - FALL_BRIDGE_RAMP_LEN)) / FALL_BRIDGE_RAMP_LEN;
    return STAND_EYE_Y + FALL_BRIDGE_EYE_LIFT * THREE.MathUtils.clamp(t, 0, 1);
  }
  if (z > FALL_RIVER_Z1) {
    const t = 1 - (z - FALL_RIVER_Z1) / FALL_BRIDGE_RAMP_LEN;
    return STAND_EYE_Y + FALL_BRIDGE_EYE_LIFT * THREE.MathUtils.clamp(t, 0, 1);
  }
  return STAND_EYE_Y + FALL_BRIDGE_EYE_LIFT;
}

function inFallRiverWater(x, z) {
  return z >= FALL_RIVER_Z0 && z <= FALL_RIVER_Z1 && !onFallBridge(x, z);
}

function placeRiverGlyph(roomId, x, y, z, scale) {
  const color = OBJECT_COLORS.river;
  const entry = addGlyph("river", "川", color, new THREE.Vector3(x, y, z), scale, roomId);
  entry.flow = {
    baseX: x,
    baseY: y,
    baseZ: z,
    offset: Math.random() * RIVER_STEP,
    phase: x * 0.31 + z * 0.17,
  };
  return entry;
}

function buildRiver(roomId) {
  const half = roomHalf(roomId);
  const y = 0.02;

  for (let z = FALL_RIVER_Z0; z <= FALL_RIVER_Z1; z += RIVER_STEP) {
    const row = Math.round((z - FALL_RIVER_Z0) / RIVER_STEP);
    const rowOffset = row % 2 === 1 ? RIVER_STEP * 0.5 : 0;
    for (let x = -half + 0.5; x <= half - 0.5; x += RIVER_STEP) {
      if (!inFallRiverWater(x, z)) continue;
      placeRiverGlyph(roomId, x + rowOffset, y, z, 0.36);
    }
  }
}

function buildBridge(roomId) {
  const color = OBJECT_COLORS.bridge;

  for (let step = 0; step <= 3; step++) {
    const t = step / 3;
    const zNear = FALL_RIVER_Z0 - BRIDGE_STEP - t * (FALL_BRIDGE_RAMP_LEN - BRIDGE_STEP);
    const zFar = FALL_RIVER_Z1 + BRIDGE_STEP + t * (FALL_BRIDGE_RAMP_LEN - BRIDGE_STEP);
    const y = 0.06 + t * (FALL_BRIDGE_DECK_Y - 0.06);
    for (let x = -FALL_BRIDGE_WALK_W; x <= FALL_BRIDGE_WALK_W; x += BRIDGE_STEP) {
      addGlyph("bridge", "橋", color, new THREE.Vector3(x, y, zNear), 0.36, roomId);
      addGlyph("bridge", "橋", color, new THREE.Vector3(x, y, zFar), 0.36, roomId);
    }
  }

  for (let z = FALL_RIVER_Z0; z <= FALL_RIVER_Z1; z += BRIDGE_STEP) {
    const row = Math.round((z - FALL_RIVER_Z0) / BRIDGE_STEP);
    const rowOffset = row % 2 === 1 ? BRIDGE_STEP * 0.5 : 0;
    for (let x = -FALL_BRIDGE_WALK_W; x <= FALL_BRIDGE_WALK_W; x += BRIDGE_STEP) {
      addGlyph("bridge", "橋", color, new THREE.Vector3(x + rowOffset, FALL_BRIDGE_DECK_Y, z), 0.4, roomId);
    }
    for (const px of [-FALL_BRIDGE_WALK_W, 0, FALL_BRIDGE_WALK_W]) {
      for (let y = 0.02; y < FALL_BRIDGE_DECK_Y; y += 0.34) {
        addGlyph("bridge", "橋", color, new THREE.Vector3(px, y, z), 0.28, roomId);
      }
    }
  }

  for (let x = -FALL_BRIDGE_SPAN_W; x <= FALL_BRIDGE_SPAN_W; x += BRIDGE_STEP) {
    addGlyph("bridge", "橋", color, new THREE.Vector3(x, FALL_BRIDGE_DECK_Y + 0.04, FALL_BRIDGE_Z), 0.36, roomId);
    addGlyph("bridge", "橋", color, new THREE.Vector3(x, FALL_BRIDGE_DECK_Y + 0.46, FALL_BRIDGE_Z + 0.48), 0.26, roomId);
    addGlyph("bridge", "橋", color, new THREE.Vector3(x, FALL_BRIDGE_DECK_Y + 0.46, FALL_BRIDGE_Z - 0.48), 0.26, roomId);
  }
  for (let x = -FALL_BRIDGE_SPAN_W; x <= FALL_BRIDGE_SPAN_W; x += 1.15) {
    for (let y = 0.02; y < FALL_BRIDGE_DECK_Y; y += 0.34) {
      addGlyph("bridge", "橋", color, new THREE.Vector3(x, y, FALL_BRIDGE_Z), 0.3, roomId);
    }
  }
}

function addMapleCanopy(roomId, spot, trunkH, layers, featured) {
  for (const layer of layers) {
    for (let i = 0; i < layer.ring; i++) {
      const ang = (i / layer.ring) * Math.PI * 2 + layer.twist;
      const rx = layer.rx * (0.55 + (i % 3) * 0.15);
      const rz = layer.rz * (0.55 + ((i + 1) % 3) * 0.15);
      const x = spot.x + layer.ox + Math.cos(ang) * rx;
      const z = spot.z + layer.oz + Math.sin(ang) * rz;
      addGlyph("foliage", "葉", pickMapleColor(), new THREE.Vector3(x, layer.y, z), layer.scale, roomId);
      if (featured) {
        fallTreeSources.push({ x, y: layer.y, z });
      }
    }
  }
}

function buildJapaneseMapleTree(roomId, spot, featured = false) {
  const bark = OBJECT_COLORS.wood;
  const leanX = featured ? 0.22 : 0.12;
  const trunkH = featured ? 3.2 : 1.9 + Math.random() * 0.8;

  for (let y = 0.2; y < trunkH; y += 0.44) {
    const t = y / trunkH;
    addGlyph("tree", "木", bark, new THREE.Vector3(spot.x + leanX * t, y, spot.z - 0.05 * t), featured ? 0.36 : 0.32, roomId);
  }

  const layers = featured
    ? [
        { y: trunkH + 0.15, rx: 1.1, rz: 0.85, ox: 0.35, oz: 0.12, twist: 0.2, ring: 10, scale: 0.36 },
        { y: trunkH + 0.58, rx: 1.75, rz: 1.25, ox: -0.25, oz: 0.18, twist: 0.9, ring: 12, scale: 0.4 },
        { y: trunkH + 0.98, rx: 2.25, rz: 1.55, ox: 0.42, oz: -0.12, twist: 1.6, ring: 14, scale: 0.42 },
        { y: trunkH + 1.34, rx: 2.05, rz: 1.35, ox: -0.32, oz: 0.28, twist: 2.2, ring: 12, scale: 0.4 },
        { y: trunkH + 1.62, rx: 1.45, rz: 1.05, ox: 0.15, oz: 0.05, twist: 2.8, ring: 10, scale: 0.38 },
      ]
    : [
        { y: trunkH + 0.2, rx: 1.0, rz: 0.8, ox: 0.15, oz: 0.08, twist: 0.4, ring: 8, scale: 0.32 },
        { y: trunkH + 0.55, rx: 1.35, rz: 1.05, ox: -0.12, oz: 0.12, twist: 1.1, ring: 9, scale: 0.34 },
        { y: trunkH + 0.82, rx: 1.15, rz: 0.9, ox: 0.1, oz: -0.08, twist: 1.8, ring: 8, scale: 0.32 },
      ];

  addMapleCanopy(roomId, spot, trunkH, layers, featured);
}

function buildFallTrees(roomId) {
  fallTreeSources.length = 0;
  buildJapaneseMapleTree(roomId, FALL_FEATURED_TREE, true);

  const bgSpots = [
    { x: -6, z: 11 },
    { x: 6.5, z: 12.2 },
    { x: -9, z: 12.5 },
    { x: 8, z: 11.2 },
  ];

  for (const spot of bgSpots) {
    buildJapaneseMapleTree(roomId, spot, false);
  }
}

function buildFallRoom() {
  registerFloorMask("fall", (x, z) => inFallRiverWater(x, z));
  buildFloor("fall", "土");
  buildRiver("fall");
  buildBridge("fall");
  buildFallTrees("fall");
  buildWalls("fall");
  buildDoor("fall", "back");
  buildDoorMarkers("fall", "back");
}

function buildSpringRoom() {
  buildFloor("spring", "草");
  buildSpringCherryTrees("spring");
  buildWalls("spring");
  buildDoor("spring", "back");
  buildDoorMarkers("spring", "back");
}

const SPRING_TREE_SPOTS = [
  { x: -4.2, z: 2.8 },
  { x: 4.5, z: 1.5 },
  { x: -2.8, z: -3.2 },
  { x: 3.2, z: -4 },
  { x: 0.5, z: 4.8 },
];

function addSakuraCanopy(roomId, spot, trunkH, layers) {
  for (const layer of layers) {
    for (let i = 0; i < layer.ring; i++) {
      const ang = (i / layer.ring) * Math.PI * 2 + layer.twist;
      const rx = layer.rx * (0.5 + (i % 4) * 0.12);
      const rz = layer.rz * (0.5 + ((i + 2) % 4) * 0.12);
      const x = spot.x + layer.ox + Math.cos(ang) * rx;
      const z = spot.z + layer.oz + Math.sin(ang) * rz;
      addGlyph("foliage", "桜", pickSakuraColor(), new THREE.Vector3(x, layer.y, z), layer.scale, roomId);
      if (layer.y >= trunkH + 0.45) {
        springTreeSources.push({ x, y: layer.y, z });
      }
    }
  }
}

function buildCherryTree(roomId, spot) {
  const bark = OBJECT_COLORS.wood;
  const trunkH = 2.4 + Math.random() * 0.9;
  const leanX = (Math.random() - 0.5) * 0.18;

  for (let y = 0.2; y < trunkH; y += 0.42) {
    const t = y / trunkH;
    addGlyph("tree", "木", bark, new THREE.Vector3(spot.x + leanX * t, y, spot.z), 0.34, roomId);
  }

  const layers = [
    { y: trunkH + 0.18, rx: 1.05, rz: 0.9, ox: 0.2, oz: 0.1, twist: 0.3, ring: 10, scale: 0.34 },
    { y: trunkH + 0.52, rx: 1.55, rz: 1.2, ox: -0.18, oz: 0.14, twist: 1.0, ring: 12, scale: 0.38 },
    { y: trunkH + 0.88, rx: 1.85, rz: 1.45, ox: 0.28, oz: -0.1, twist: 1.7, ring: 14, scale: 0.4 },
    { y: trunkH + 1.18, rx: 1.55, rz: 1.15, ox: -0.15, oz: 0.2, twist: 2.4, ring: 11, scale: 0.36 },
  ];

  addSakuraCanopy(roomId, spot, trunkH, layers);
}

function buildSpringCherryTrees(roomId) {
  springTreeSources.length = 0;
  for (const spot of SPRING_TREE_SPOTS) {
    buildCherryTree(roomId, spot);
  }
}

function addFallingPetalSlot() {
  const color = pickSakuraColor();
  const mat = new THREE.SpriteMaterial({
    map: kanjiTexture("桜", color),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.82,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(0.11 + Math.random() * 0.05);
  sprite.visible = false;
  scene.add(sprite);
  fallingPetals.push({
    sprite,
    active: false,
    fall: 0.22 + Math.random() * 0.18,
    drift: (Math.random() - 0.5) * 0.65,
    flutter: 0.9 + Math.random() * 0.8,
    spin: Math.random() * Math.PI * 2,
    t: 0,
  });
}

function spawnFallingPetal() {
  if (!springTreeSources.length) return;

  let petal = fallingPetals.find((p) => !p.active);
  if (!petal) {
    addFallingPetalSlot();
    petal = fallingPetals[fallingPetals.length - 1];
  }

  const src = springTreeSources[(Math.random() * springTreeSources.length) | 0];
  const color = pickSakuraColor();
  petal.sprite.material.map = kanjiTexture("桜", color);
  petal.sprite.material.needsUpdate = true;
  petal.sprite.position.set(src.x + rand(0.12), src.y + rand(0.08), src.z + rand(0.12));
  petal.sprite.scale.setScalar(0.11 + Math.random() * 0.05);
  petal.fall = 0.22 + Math.random() * 0.18;
  petal.drift = (Math.random() - 0.5) * 0.65;
  petal.flutter = 0.9 + Math.random() * 0.8;
  petal.spin = Math.random() * Math.PI * 2;
  petal.t = 0;
  petal.active = true;
  petal.sprite.visible = true;
}

function updateFallingPetals(dt) {
  if (currentRoom !== "spring") {
    for (const petal of fallingPetals) {
      petal.active = false;
      petal.sprite.visible = false;
    }
    return;
  }

  petalSpawnCD -= dt;
  if (petalSpawnCD <= 0) {
    spawnFallingPetal();
    if (Math.random() < 0.45) spawnFallingPetal();
    petalSpawnCD = 1.8 + Math.random() * 1.6;
  }

  for (const petal of fallingPetals) {
    if (!petal.active) continue;

    petal.t += dt;
    const p = petal.sprite.position;
    const hirahira = Math.sin(petal.spin + petal.t * petal.flutter);
    p.y -= petal.fall * dt * (0.65 + 0.35 * Math.abs(hirahira));
    p.x += (petal.drift + hirahira * 0.55) * dt;
    p.z += Math.cos(petal.spin + petal.t * (petal.flutter * 0.85)) * 0.45 * dt;
    petal.sprite.material.rotation = hirahira * 0.55;

    if (p.y < 0.05) {
      petal.active = false;
      petal.sprite.visible = false;
    }
  }
}

function makeBirdSprite() {
  const mat = new THREE.SpriteMaterial({
    map: kanjiTexture("鳥", OBJECT_COLORS.bird),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.7,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.visible = false;
  scene.add(sprite);
  return sprite;
}

function spawnBirdFlock() {
  const half = roomHalf("spring");
  const fromLeft = Math.random() < 0.5;
  const vx = (fromLeft ? 1 : -1) * (3.8 + Math.random() * 2.2);
  const backX = -Math.sign(vx) * 0.42;
  const flock = {
    active: true,
    x: fromLeft ? -half - 1.5 : half + 1.5,
    y: 3.1 + Math.random() * 1.1,
    z: rand(half * 1.1),
    vx,
    vz: (Math.random() - 0.5) * 0.35,
    parts: [
      { sprite: makeBirdSprite(), ox: 0, oz: 0, scale: 0.2 },
      { sprite: makeBirdSprite(), ox: backX, oz: -0.38, scale: 0.16 },
      { sprite: makeBirdSprite(), ox: backX, oz: 0.38, scale: 0.16 },
    ],
  };

  for (const part of flock.parts) {
    part.sprite.scale.setScalar(part.scale);
    part.sprite.visible = true;
  }

  birdFlocks.push(flock);
}

function updateBirds(dt) {
  if (currentRoom !== "spring") {
    for (let i = birdFlocks.length - 1; i >= 0; i--) {
      for (const part of birdFlocks[i].parts) {
        part.sprite.visible = false;
      }
      birdFlocks.splice(i, 1);
    }
    return;
  }

  birdSpawnCD -= dt;
  if (birdSpawnCD <= 0) {
    spawnBirdFlock();
    if (Math.random() < 0.35) spawnBirdFlock();
    birdSpawnCD = 10 + Math.random() * 5;
  }

  const half = roomHalf("spring");
  for (let i = birdFlocks.length - 1; i >= 0; i--) {
    const flock = birdFlocks[i];
    if (!flock.active) continue;

    flock.x += flock.vx * dt;
    flock.z += flock.vz * dt;
    flock.y += Math.sin(flock.x * 0.5) * 0.08 * dt;

    for (const part of flock.parts) {
      part.sprite.position.set(flock.x + part.ox, flock.y, flock.z + part.oz);
      part.sprite.visible = true;
    }

    if (Math.abs(flock.x) > half + 2.5) {
      for (const part of flock.parts) {
        scene.remove(part.sprite);
        part.sprite.material.dispose();
      }
      birdFlocks.splice(i, 1);
    }
  }
}

function buildDemoRoom() {
  const chairX = 1.6;
  const chairZ = 1.2;
  registerFloorMask("demo", (x, z) => inChairFootprint(chairX, chairZ, x, z));
  buildFloor("demo");
  buildWalls("demo");
  for (const wall of ["back", "front", "left", "right"]) {
    buildDoor("demo", wall);
    buildDoorMarkers("demo", wall);
  }
  chairAt(chairX, chairZ, "demo");
}

function buildWinterRoom() {
  registerFloorMask("winter", inPond);
  buildFloor("winter", "土");
  buildWalls("winter");
  buildDoor("winter", "back");
  buildDoorMarkers("winter", "back");
  buildPond("winter");
}

function addSnowflake() {
  const mat = new THREE.SpriteMaterial({
    map: kanjiTexture("雪", OBJECT_COLORS.snow),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.4,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(0.12 + Math.random() * 0.1);
  sprite.visible = false;
  scene.add(sprite);
  snowflakes.push({
    sprite,
    fall: 0.7 + Math.random() * 1.4,
    drift: (Math.random() - 0.5) * 0.35,
    spin: (Math.random() - 0.5) * 0.6,
  });
  resetSnowflake(snowflakes[snowflakes.length - 1], true);
}

function resetSnowflake(s, spread = false) {
  const half = roomHalf("winter");
  s.sprite.position.set(
    rand(half * 1.6),
    spread ? Math.random() * HGT + 2 : HGT + 2 + Math.random() * 2,
    rand(half * 1.6),
  );
}

function addFallingLeafSlot() {
  const color = pickMapleColor();
  const mat = new THREE.SpriteMaterial({
    map: kanjiTexture("葉", color),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.75,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(0.14 + Math.random() * 0.06);
  sprite.visible = false;
  scene.add(sprite);
  fallingLeaves.push({
    sprite,
    active: false,
    fall: 0.55 + Math.random() * 0.45,
    drift: (Math.random() - 0.5) * 0.5,
    sway: (Math.random() - 0.5) * 1.2,
    spin: Math.random() * Math.PI * 2,
    t: 0,
  });
}

function spawnFallingLeaf() {
  if (!fallTreeSources.length) return;

  let leaf = fallingLeaves.find((l) => !l.active);
  if (!leaf) {
    addFallingLeafSlot();
    leaf = fallingLeaves[fallingLeaves.length - 1];
  }

  const src = fallTreeSources[(Math.random() * fallTreeSources.length) | 0];
  const color = pickMapleColor();
  leaf.sprite.material.map = kanjiTexture("葉", color);
  leaf.sprite.material.needsUpdate = true;
  leaf.sprite.position.set(src.x + rand(0.15), src.y + rand(0.1), src.z + rand(0.15));
  leaf.sprite.scale.setScalar(0.14 + Math.random() * 0.06);
  leaf.fall = 0.55 + Math.random() * 0.45;
  leaf.drift = (Math.random() - 0.5) * 0.5;
  leaf.sway = (Math.random() - 0.5) * 1.2;
  leaf.spin = Math.random() * Math.PI * 2;
  leaf.t = 0;
  leaf.active = true;
  leaf.sprite.visible = true;
}

function updateFallingLeaves(dt) {
  if (currentRoom !== "fall") {
    for (const leaf of fallingLeaves) {
      leaf.active = false;
      leaf.sprite.visible = false;
    }
    return;
  }

  leafSpawnCD -= dt;
  if (leafSpawnCD <= 0) {
    spawnFallingLeaf();
    leafSpawnCD = 3 + Math.random() * 2;
  }

  for (const leaf of fallingLeaves) {
    if (!leaf.active) continue;

    leaf.t += dt;
    const p = leaf.sprite.position;
    p.y -= leaf.fall * dt;
    p.x += leaf.drift * dt;
    p.z += Math.sin(leaf.spin + leaf.t * 2.4) * leaf.sway * dt;

    if (p.y < 0.05) {
      leaf.active = false;
      leaf.sprite.visible = false;
    }
  }
}

buildDemoRoom();
buildWinterRoom();
buildSummerRoom();
buildFallRoom();
buildSpringRoom();
for (let i = 0; i < 100; i++) addSnowflake();
for (let i = 0; i < 12; i++) addFallingLeafSlot();
for (let i = 0; i < 20; i++) addFallingPetalSlot();

const hud = document.createElement("div");
hud.className = "sim-hud";
const hudTitle = document.createElement("p");
hudTitle.className = "sim-hud-title";
const hudDesc = document.createElement("p");
hudDesc.className = "sim-hud-desc";
hud.append(hudTitle, hudDesc);
panel.appendChild(hud);

const roomMeta = {
  demo: {
    title: "Room",
    desc: "N winter · S summer · W fall · E spring. Click · WASD · ESC.",
    bg: 0x05060a,
    fog: 0.045,
  },
  winter: {
    title: "Winter Room",
    desc: "雪 falls. Slide on the 氷 pond. Back door → demo (N). Click · WASD · ESC.",
    bg: 0x141c28,
    fog: 0.038,
  },
  summer: {
    title: "Summer Room",
    desc: "Beach — wade into the 水 at the far shore. Back door → demo (S). Click · WASD · ESC.",
    bg: 0x05060a,
    fog: 0.045,
  },
  fall: {
    title: "Fall Room",
    desc: "Cross the 橋 over the 川 toward 紅葉. 葉 drifts from the trees. Back door → demo (W). Click · WASD · ESC.",
    bg: 0x0a0806,
    fog: 0.02,
  },
  spring: {
    title: "Spring Room",
    desc: "桜 in bloom — petals flutter down. 鳥 fly overhead. Back door → demo (E). Click · WASD · ESC.",
    bg: 0x0a0c10,
    fog: 0.035,
  },
};

const ROOM_PORTALS = {
  demo: [
    { wall: "back", target: "winter", spawnWall: "back" },
    { wall: "front", target: "summer", spawnWall: "back" },
    { wall: "left", target: "fall", spawnWall: "back" },
    { wall: "right", target: "spring", spawnWall: "back" },
  ],
  winter: [{ wall: "back", target: "demo", spawnWall: "back" }],
  summer: [{ wall: "back", target: "demo", spawnWall: "front" }],
  fall: [{ wall: "back", target: "demo", spawnWall: "left" }],
  spring: [{ wall: "back", target: "demo", spawnWall: "right" }],
};

let currentRoom = "demo";
let doorCooldown = 0;

function applyRoomAtmosphere(roomId) {
  const m = roomMeta[roomId];
  scene.background.setHex(m.bg);
  if (m.fog > 0) {
    if (!scene.fog) scene.fog = new THREE.FogExp2(m.bg, m.fog);
    scene.fog.color.setHex(m.bg);
    scene.fog.density = m.fog;
  } else {
    scene.fog = null;
  }
  hudTitle.textContent = m.title;
  hudDesc.textContent = m.desc;
  updateDoorMarkers();
}

function spawnPose(wall, roomId) {
  const half = roomHalf(roomId);
  if (wall === "back") {
    return { pos: new THREE.Vector3(0, STAND_EYE_Y, -half + 2.4), yaw: Math.PI };
  }
  if (wall === "front") {
    return { pos: new THREE.Vector3(0, STAND_EYE_Y, half - 2.4), yaw: 0 };
  }
  if (wall === "left") {
    return { pos: new THREE.Vector3(-half + 2.4, STAND_EYE_Y, 0), yaw: -HALF_PI };
  }
  if (wall === "right") {
    return { pos: new THREE.Vector3(half - 2.4, STAND_EYE_Y, 0), yaw: HALF_PI };
  }
  return { pos: new THREE.Vector3(0, STAND_EYE_Y, -half + 2.4), yaw: Math.PI };
}

function setRoom(roomId, spawnWall = "back") {
  currentRoom = roomId;
  doorCooldown = 1.2;
  applyRoomAtmosphere(roomId);
  const spawn = spawnPose(spawnWall, roomId);
  camera.position.copy(spawn.pos);
  euler.y = spawn.yaw;
  camera.quaternion.setFromEuler(euler);
  slideVelocity.set(0, 0, 0);
  wasOnIce = false;
  if (roomId === "fall") leafSpawnCD = 1 + Math.random() * 2;
  if (roomId === "spring") {
    petalSpawnCD = 1 + Math.random() * 1.5;
    birdSpawnCD = 4 + Math.random() * 3;
  }
}

applyRoomAtmosphere("demo");

const euler = new THREE.Euler(0, 0, 0, "YXZ");
const HALF_PI = Math.PI / 2;

canvas.addEventListener("click", () => canvas.requestPointerLock());

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  euler.setFromQuaternion(camera.quaternion);
  euler.y -= e.movementX * 0.002;
  euler.x -= e.movementY * 0.002;
  euler.x = THREE.MathUtils.clamp(euler.x, -HALF_PI, HALF_PI);
  camera.quaternion.setFromEuler(euler);
});

const keys = {};
addEventListener("keydown", (e) => {
  keys[e.code] = true;
});
addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

const SPEED = 3.5;
const ICE_ACCEL = 10;
const ICE_MAX_SPEED = 7;
/** Closer to 1 = less friction, more slide. */
const ICE_FRICTION = 0.994;
const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const slideVelocity = new THREE.Vector3();
let wasOnIce = false;

function onIce(x, z) {
  return inPond(x, z);
}

function portalTriggered(wall, p, half) {
  if (wall === "back") {
    return p.x > DOOR_NEAR && p.x < DOOR_FAR && p.z <= -half + 0.85;
  }
  if (wall === "front") {
    return p.x > DOOR_NEAR && p.x < DOOR_FAR && p.z >= half - 0.85;
  }
  if (wall === "left") {
    return p.z > DOOR_NEAR && p.z < DOOR_FAR && p.x <= -half + 0.85;
  }
  if (wall === "right") {
    return p.z > DOOR_NEAR && p.z < DOOR_FAR && p.x >= half - 0.85;
  }
  return false;
}

function checkDoorTransition() {
  if (doorCooldown > 0) return;
  const p = camera.position;
  const half = roomHalf(currentRoom);
  const portals = ROOM_PORTALS[currentRoom] ?? [];
  for (const link of portals) {
    if (!portalTriggered(link.wall, p, half)) continue;
    setRoom(link.target, link.spawnWall);
    return;
  }
}

function moveCamera(dt) {
  if (document.pointerLockElement !== canvas) return;

  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, up).normalize();

  move.set(0, 0, 0);
  if (keys.KeyW) move.add(forward);
  if (keys.KeyS) move.sub(forward);
  if (keys.KeyD) move.add(right);
  if (keys.KeyA) move.sub(right);

  const icy = currentRoom === "winter" && onIce(camera.position.x, camera.position.z);
  const wade = currentRoom === "summer" && inWater(camera.position.x, camera.position.z);
  const wadeDepth = wade ? waterDepthFactor(camera.position.x, camera.position.z) : 0;
  const moveSpeed = wade ? THREE.MathUtils.lerp(SPEED, WATER_WADE_SPEED, wadeDepth) : SPEED;

  if (icy) {
    if (!wasOnIce && move.lengthSq() > 0) {
      move.normalize();
      slideVelocity.copy(move).multiplyScalar(SPEED);
    }

    if (move.lengthSq() > 0) {
      move.normalize();
      slideVelocity.addScaledVector(move, ICE_ACCEL * dt);
    }

    slideVelocity.multiplyScalar(ICE_FRICTION ** (dt * 60));

    if (slideVelocity.length() > ICE_MAX_SPEED) {
      slideVelocity.normalize().multiplyScalar(ICE_MAX_SPEED);
    }

    camera.position.addScaledVector(slideVelocity, dt);
  } else {
    slideVelocity.set(0, 0, 0);
    const prevX = camera.position.x;
    const prevZ = camera.position.z;
    if (move.lengthSq() > 0) {
      move.normalize();
      camera.position.addScaledVector(move, moveSpeed * dt);
    }

    const p = camera.position;
    if (currentRoom === "fall" && inFallRiverWater(p.x, p.z)) {
      p.x = prevX;
      p.z = prevZ;
    }
  }

  wasOnIce = icy;

  const p = camera.position;
  const bound = roomHalf(currentRoom) - 0.6;
  p.x = THREE.MathUtils.clamp(p.x, -bound, bound);
  p.z = THREE.MathUtils.clamp(p.z, -bound, bound);

  const bridgeEye = currentRoom === "fall" ? fallBridgeEyeY(p.x, p.z) : null;
  p.y = wade
    ? THREE.MathUtils.lerp(STAND_EYE_Y, WAIST_EYE_Y, wadeDepth)
    : bridgeEye ?? STAND_EYE_Y;

  checkDoorTransition();
}

/** All objects — hidden until you approach. */
const REVEAL_NEAR = 1.8;
const REVEAL_FAR = 5.5;
const FLOOR_REVEAL_FAR = REVEAL_FAR + FLOOR_STEP * 0.5;
const tmp = new THREE.Vector3();

const SHAPE_OPACITY_MAX = 0.58;
const SHAPE_SCALE_BOOST = 0.18;

function updateClarity() {
  for (const g of glyphs) {
    if (g.roomId !== currentRoom) {
      g.sprite.visible = false;
      continue;
    }

    let d;
    if (g.kind === "floor" || g.kind === "ice" || g.kind === "water" || g.kind === "river" || g.kind === "bridge") {
      const dx = camera.position.x - g.sprite.position.x;
      const dy = camera.position.y - g.sprite.position.y;
      const dz = camera.position.z - g.sprite.position.z;
      d = Math.hypot(dx, dy, dz);
    } else {
      d = tmp.copy(g.sprite.position).sub(camera.position).length();
    }

    const revealFar =
      g.kind === "floor" || g.kind === "ice" || g.kind === "water" || g.kind === "river" || g.kind === "bridge"
        ? FLOOR_REVEAL_FAR
        : REVEAL_FAR;
    const t = THREE.MathUtils.clamp((revealFar - d) / (revealFar - REVEAL_NEAR), 0, 1);
    const clarity = g.shapeFirst ? t * t : t * t * t;

    g.sprite.visible = clarity > 0.02;

    if (g.shapeFirst) {
      const crest = g.waveCrest ?? g.flowCrest ?? 0;
      g.sprite.material.opacity = clarity * (SHAPE_OPACITY_MAX + crest * 0.14);
      g.sprite.scale.setScalar(g.baseScale * (0.88 + clarity * (SHAPE_SCALE_BOOST + crest * 0.07)));
    } else {
      g.sprite.material.opacity = clarity * 0.95;
      g.sprite.scale.setScalar(g.baseScale * (0.55 + clarity * 0.65));
    }
  }
}

function updateWaterWaves(time) {
  if (currentRoom !== "summer") return;

  for (const g of glyphs) {
    if (g.roomId !== "summer" || g.kind !== "water" || !g.wave) continue;

    const { baseX, baseY, baseZ, depth, layer, phase } = g.wave;
    const shoreProx = THREE.MathUtils.clamp(1 - depth / WAVE_SHORE_FALLOFF, 0, 1);
    const layerDamp = 1 - layer * 0.38;
    const motion = 0.22 + 0.78 * shoreProx;

    const theta = WAVE_K * baseZ - WAVE_OMEGA * time + phase;
    const sinT = Math.sin(theta);
    const yOff = WAVE_Y_AMP * motion * layerDamp * sinT;
    const zOff = -WAVE_Z_AMP * motion * layerDamp * sinT;

    g.sprite.position.set(baseX, baseY + yOff, baseZ + zOff);
    g.waveCrest = ((sinT + 1) * 0.5) * shoreProx * layerDamp;
  }
}

function updateRiverFlow(dt) {
  if (currentRoom !== "fall") return;

  for (const g of glyphs) {
    if (g.roomId !== "fall" || g.kind !== "river" || !g.flow) continue;

    g.flow.offset += dt * RIVER_FLOW_SPEED * RIVER_FLOW_AXIS;
    if (g.flow.offset > RIVER_STEP) g.flow.offset -= RIVER_STEP;
    if (g.flow.offset < -RIVER_STEP) g.flow.offset += RIVER_STEP;

    g.sprite.position.set(g.flow.baseX + g.flow.offset, g.flow.baseY, g.flow.baseZ);
    g.flowCrest = 0.5 + 0.5 * Math.sin(g.flow.offset * 6 + g.flow.phase);
  }
}

function updateSnow(dt) {
  const active = currentRoom === "winter";
  const half = roomHalf("winter");
  for (const s of snowflakes) {
    s.sprite.visible = active;
    if (!active) continue;

    const p = s.sprite.position;
    p.y -= s.fall * dt;
    p.x += s.drift * dt;
    p.z += Math.sin(s.spin + p.y * 0.4) * 0.15 * dt;

    if (p.y < 0.05) resetSnowflake(s);
    if (Math.abs(p.x) > half + 1 || Math.abs(p.z) > half + 1) p.x = rand(half * 1.2);
  }
}

function resize() {
  renderer.setSize(W(), H(), false);
  camera.aspect = W() / H();
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (doorCooldown > 0) doorCooldown -= dt;
  moveCamera(dt);
  updateWaterWaves(clock.elapsedTime);
  updateRiverFlow(dt);
  updateClarity();
  updateSnow(dt);
  updateFallingLeaves(dt);
  updateFallingPetals(dt);
  updateBirds(dt);
  renderer.render(scene, camera);
}

animate();
