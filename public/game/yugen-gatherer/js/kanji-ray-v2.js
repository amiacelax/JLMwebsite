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
const SHAPE_KINDS = new Set(["floor", "wall", "door", "chair", "ice", "water"]);

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
};

function objectColor(kind, char) {
  if (char === "土") return OBJECT_COLORS.earth;
  if (char === "砂") return OBJECT_COLORS.sand;
  if (char === "水") return OBJECT_COLORS.water;
  return OBJECT_COLORS[kind] ?? "#ffffff";
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
  const cols = Math.round((2 * ROOM) / FLOOR_STEP) + 1;

  for (let row = 0; row < cols; row++) {
    const rowOffset = row % 2 === 1 ? FLOOR_STEP * 0.5 : 0;
    for (let col = 0; col < cols; col++) {
      const x = -ROOM + ((2 * ROOM) * col) / (cols - 1) + rowOffset;
      const z = -ROOM + ((2 * ROOM) * row) / (cols - 1);
      if (Math.abs(x) > ROOM) continue;
      if (floorBlocked(roomId, x, z)) continue;
      const edge = col === 0 || col === cols - 1 || row === 0 || row === cols - 1;
      addGlyph("floor", char, color, new THREE.Vector3(x, y, z), edge ? 0.4 : 0.38, roomId);
    }
  }
}

const inDoorway = (x, y) => x > DOOR_LEFT && x < DOOR_RIGHT && y < DOOR_TOP + 0.1;

function roomHasDoorway(roomId, wall) {
  if (wall === "back") return true;
  return wall === "front" && roomId === "demo";
}

function buildWalls(roomId) {
  const color = objectColor("wall", "壁");
  for (let y = 0.4; y <= HGT; y += 0.55) {
    for (let x = -ROOM; x <= ROOM; x += 0.6) {
      if (!(inDoorway(x, y) && roomHasDoorway(roomId, "back"))) {
        addGlyph("wall", "壁", color, new THREE.Vector3(x + rand(0.05), y, -ROOM), 0.65, roomId);
      }
      if (!(inDoorway(x, y) && roomHasDoorway(roomId, "front"))) {
        addGlyph("wall", "壁", color, new THREE.Vector3(x + rand(0.05), y, ROOM), 0.65, roomId);
      }
    }
    for (let z = -ROOM; z <= ROOM; z += 0.6) {
      addGlyph("wall", "壁", color, new THREE.Vector3(-ROOM, y, z + rand(0.05)), 0.65, roomId);
      addGlyph("wall", "壁", color, new THREE.Vector3(ROOM, y, z + rand(0.05)), 0.65, roomId);
    }
  }
}

const DOOR_COLS = 6;
const DOOR_ROWS = 7;
const DOOR_LEFT = -1.1;
const DOOR_RIGHT = 0.9;
const DOOR_BOTTOM = 0.4;
const DOOR_TOP = 2.8;

function buildDoor(roomId, wall = "back") {
  const color = objectColor("door", "扉");
  const z = wall === "back" ? -ROOM : ROOM;

  for (let row = 0; row < DOOR_ROWS; row++) {
    const y = DOOR_BOTTOM + ((DOOR_TOP - DOOR_BOTTOM) * row) / (DOOR_ROWS - 1);
    for (let col = 0; col < DOOR_COLS; col++) {
      const x = DOOR_LEFT + ((DOOR_RIGHT - DOOR_LEFT) * col) / (DOOR_COLS - 1);
      const edge = col === 0 || col === DOOR_COLS - 1 || row === 0 || row === DOOR_ROWS - 1;
      addGlyph("door", "扉", color, new THREE.Vector3(x, y, z), edge ? 0.4 : 0.36, roomId);
    }
  }
}

const DOOR_CX = (DOOR_LEFT + DOOR_RIGHT) / 2;
const doorMarkers = [];

function markerPosForWall(wall) {
  const z = wall === "back" ? -ROOM + 0.3 : ROOM - 0.3;
  return new THREE.Vector3(DOOR_CX, DOOR_TOP + 0.18, z);
}

function buildDoorMarkers(roomId, wall = "back") {
  const hex = new THREE.Color(OBJECT_COLORS.beacon).getHex();
  const pos = markerPosForWall(wall);

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

function buildDemoRoom() {
  const chairX = 1.6;
  const chairZ = 1.2;
  registerFloorMask("demo", (x, z) => inChairFootprint(chairX, chairZ, x, z));
  buildFloor("demo");
  buildWalls("demo");
  buildDoor("demo", "back");
  buildDoorMarkers("demo", "back");
  buildDoor("demo", "front");
  buildDoorMarkers("demo", "front");
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
  s.sprite.position.set(
    rand(ROOM * 1.6),
    spread ? Math.random() * HGT + 2 : HGT + 2 + Math.random() * 2,
    rand(ROOM * 1.6),
  );
}

buildDemoRoom();
buildWinterRoom();
buildSummerRoom();
for (let i = 0; i < 100; i++) addSnowflake();

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
    desc: "Back door → winter. Front door → summer beach. Click · WASD · ESC.",
    bg: 0x05060a,
    fog: 0.045,
  },
  winter: {
    title: "Winter Room",
    desc: "雪 falls. Slide on the 氷 pond. Back door → demo room. Click · WASD · ESC.",
    bg: 0x141c28,
    fog: 0.038,
  },
  summer: {
    title: "Summer Room",
    desc: "Beach — wade into the 水 at the far shore. Back door → demo front door. Click · WASD · ESC.",
    bg: 0x05060a,
    fog: 0.045,
  },
};

const ROOM_PORTALS = {
  demo: [
    { wall: "back", target: "winter", spawnWall: "back" },
    { wall: "front", target: "summer", spawnWall: "back" },
  ],
  winter: [{ wall: "back", target: "demo", spawnWall: "back" }],
  summer: [{ wall: "back", target: "demo", spawnWall: "front" }],
};

const DOOR_PORTAL_BACK_Z = -ROOM + 0.85;
const DOOR_PORTAL_FRONT_Z = ROOM - 0.85;

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

function spawnPose(wall) {
  if (wall === "back") {
    return { pos: new THREE.Vector3(0, STAND_EYE_Y, -ROOM + 2.4), yaw: Math.PI };
  }
  return { pos: new THREE.Vector3(0, STAND_EYE_Y, ROOM - 2.4), yaw: 0 };
}

function setRoom(roomId, spawnWall = "back") {
  currentRoom = roomId;
  doorCooldown = 1.2;
  applyRoomAtmosphere(roomId);
  const spawn = spawnPose(spawnWall);
  camera.position.copy(spawn.pos);
  euler.y = spawn.yaw;
  camera.quaternion.setFromEuler(euler);
  slideVelocity.set(0, 0, 0);
  wasOnIce = false;
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
const BOUND = ROOM - 0.6;
const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const slideVelocity = new THREE.Vector3();
let wasOnIce = false;

function onIce(x, z) {
  return inPond(x, z);
}

function portalTriggered(wall, p) {
  if (p.x < DOOR_LEFT || p.x > DOOR_RIGHT) return false;
  if (wall === "back") return p.z <= DOOR_PORTAL_BACK_Z;
  if (wall === "front") return p.z >= DOOR_PORTAL_FRONT_Z;
  return false;
}

function checkDoorTransition() {
  if (doorCooldown > 0) return;
  const p = camera.position;
  const portals = ROOM_PORTALS[currentRoom] ?? [];
  for (const link of portals) {
    if (!portalTriggered(link.wall, p)) continue;
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
    if (move.lengthSq() > 0) {
      move.normalize();
      camera.position.addScaledVector(move, moveSpeed * dt);
    }
  }

  wasOnIce = icy;

  const p = camera.position;
  p.x = THREE.MathUtils.clamp(p.x, -BOUND, BOUND);
  p.z = THREE.MathUtils.clamp(p.z, -BOUND, BOUND);
  p.y = wade
    ? THREE.MathUtils.lerp(STAND_EYE_Y, WAIST_EYE_Y, wadeDepth)
    : STAND_EYE_Y;

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
    if (g.kind === "floor" || g.kind === "ice" || g.kind === "water") {
      const dx = camera.position.x - g.sprite.position.x;
      const dy = camera.position.y - g.sprite.position.y;
      const dz = camera.position.z - g.sprite.position.z;
      d = Math.hypot(dx, dy, dz);
    } else {
      d = tmp.copy(g.sprite.position).sub(camera.position).length();
    }

    const revealFar =
      g.kind === "floor" || g.kind === "ice" || g.kind === "water"
        ? FLOOR_REVEAL_FAR
        : REVEAL_FAR;
    const t = THREE.MathUtils.clamp((revealFar - d) / (revealFar - REVEAL_NEAR), 0, 1);
    const clarity = g.shapeFirst ? t * t : t * t * t;

    g.sprite.visible = clarity > 0.02;

    if (g.shapeFirst) {
      const crest = g.waveCrest ?? 0;
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

function updateSnow(dt) {
  const active = currentRoom === "winter";
  for (const s of snowflakes) {
    s.sprite.visible = active;
    if (!active) continue;

    const p = s.sprite.position;
    p.y -= s.fall * dt;
    p.x += s.drift * dt;
    p.z += Math.sin(s.spin + p.y * 0.4) * 0.15 * dt;

    if (p.y < 0.05) resetSnowflake(s);
    if (Math.abs(p.x) > ROOM + 1 || Math.abs(p.z) > ROOM + 1) p.x = rand(ROOM * 1.2);
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
  updateClarity();
  updateSnow(dt);
  renderer.render(scene, camera);
}

animate();
