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

const glyphs = [];
const snowflakes = [];
const SHAPE_KINDS = new Set(["floor", "wall", "door", "chair", "ice"]);

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
const palettes = {
  demo: {
    floor: "#3a6ea5",
    wall: "#8a7fb5",
    door: "#d9a441",
    chair: "#5fb39a",
  },
  winter: {
    floor: "#7a9eb8",
    wall: "#9aafc8",
    door: "#c9d4e0",
    ice: "#b8e8f4",
    snow: "#e8f4fc",
  },
};

const rand = (a) => (Math.random() - 0.5) * a;

const FLOOR_STEP = 0.4;

function buildFloor(roomId, palette, char = "床") {
  const y = 0.02;
  const cols = Math.round((2 * ROOM) / FLOOR_STEP) + 1;

  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      const x = -ROOM + ((2 * ROOM) * col) / (cols - 1);
      const z = -ROOM + ((2 * ROOM) * row) / (cols - 1);
      const edge = col === 0 || col === cols - 1 || row === 0 || row === cols - 1;
      addGlyph("floor", char, palette.floor, new THREE.Vector3(x, y, z), edge ? 0.4 : 0.38, roomId);
    }
  }
}

const inDoorway = (x, y) => x > -1.1 && x < 1.1 && y < 2.9;

function buildWalls(roomId, palette) {
  for (let y = 0.4; y <= HGT; y += 0.55) {
    for (let x = -ROOM; x <= ROOM; x += 0.6) {
      if (!inDoorway(x, y)) {
        addGlyph("wall", "壁", palette.wall, new THREE.Vector3(x + rand(0.05), y, -ROOM), 0.65, roomId);
      }
      addGlyph("wall", "壁", palette.wall, new THREE.Vector3(x + rand(0.05), y, ROOM), 0.65, roomId);
    }
    for (let z = -ROOM; z <= ROOM; z += 0.6) {
      addGlyph("wall", "壁", palette.wall, new THREE.Vector3(-ROOM, y, z + rand(0.05)), 0.65, roomId);
      addGlyph("wall", "壁", palette.wall, new THREE.Vector3(ROOM, y, z + rand(0.05)), 0.65, roomId);
    }
  }
}

const DOOR_COLS = 6;
const DOOR_ROWS = 7;
const DOOR_LEFT = -1.1;
const DOOR_RIGHT = 0.9;
const DOOR_BOTTOM = 0.4;
const DOOR_TOP = 2.8;

function buildDoor(roomId, palette) {
  const z = -ROOM;

  for (let row = 0; row < DOOR_ROWS; row++) {
    const y = DOOR_BOTTOM + ((DOOR_TOP - DOOR_BOTTOM) * row) / (DOOR_ROWS - 1);
    for (let col = 0; col < DOOR_COLS; col++) {
      const x = DOOR_LEFT + ((DOOR_RIGHT - DOOR_LEFT) * col) / (DOOR_COLS - 1);
      const edge = col === 0 || col === DOOR_COLS - 1 || row === 0 || row === DOOR_ROWS - 1;
      addGlyph("door", "扉", palette.door, new THREE.Vector3(x, y, z), edge ? 0.4 : 0.36, roomId);
    }
  }
}

const DOOR_CX = (DOOR_LEFT + DOOR_RIGHT) / 2;
const DOOR_CY = (DOOR_BOTTOM + DOOR_TOP) / 2;
const doorLights = [];
const doorBeacons = [];

function buildDoorMarkers(roomId, palette) {
  const color = new THREE.Color(palette.door);

  const light = new THREE.PointLight(color.getHex(), 0.48, 16, 2);
  light.position.set(DOOR_CX, DOOR_CY, -ROOM + 0.35);
  light.visible = false;
  scene.add(light);
  doorLights.push({ light, roomId });

  for (const x of [DOOR_LEFT + 0.15, DOOR_RIGHT - 0.15]) {
    const mat = new THREE.SpriteMaterial({
      map: kanjiTexture("灯", palette.door),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.14,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, DOOR_TOP + 0.22, -ROOM + 0.25);
    sprite.scale.setScalar(0.22);
    sprite.visible = false;
    scene.add(sprite);
    doorBeacons.push({ sprite, roomId });
  }
}

function updateDoorMarkers() {
  const pulse = 0.13 + Math.sin(performance.now() * 0.0018) * 0.035;
  for (const { light, roomId } of doorLights) {
    light.visible = roomId === currentRoom;
  }
  for (const { sprite, roomId } of doorBeacons) {
    const on = roomId === currentRoom;
    sprite.visible = on;
    if (on) sprite.material.opacity = pulse;
  }
}

const PAIR_HALF = 0.12;
const CHAIR_STEP = 0.4;

function addChairPair(cx, cy, cz, scale, roomId) {
  addGlyph("chair", "椅", palettes.demo.chair, new THREE.Vector3(cx - PAIR_HALF, cy, cz), scale, roomId);
  addGlyph("chair", "子", palettes.demo.chair, new THREE.Vector3(cx + PAIR_HALF, cy, cz), scale, roomId);
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

function buildPond(roomId, palette) {
  const y = 0.03;
  for (let z = POND_CZ - POND_RZ; z <= POND_CZ + POND_RZ; z += ICE_STEP) {
    for (let x = POND_CX - POND_RX; x <= POND_CX + POND_RX; x += ICE_STEP) {
      const nx = (x - POND_CX) / POND_RX;
      const nz = (z - POND_CZ) / POND_RZ;
      if (nx * nx + nz * nz > 1) continue;
      const edge = nx * nx + nz * nz > 0.72;
      addGlyph("ice", "氷", palette.ice, new THREE.Vector3(x, y, z), edge ? 0.38 : 0.34, roomId);
    }
  }
}

function buildDemoRoom() {
  const p = palettes.demo;
  buildFloor("demo", p);
  buildWalls("demo", p);
  buildDoor("demo", p);
  buildDoorMarkers("demo", p);
  chairAt(1.6, 1.2, "demo");
}

function buildWinterRoom() {
  const p = palettes.winter;
  buildFloor("winter", p, "土");
  buildWalls("winter", p);
  buildDoor("winter", p);
  buildDoorMarkers("winter", p);
  buildPond("winter", p);
}

function addSnowflake() {
  const mat = new THREE.SpriteMaterial({
    map: kanjiTexture("雪", palettes.winter.snow),
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
    desc: "Walk through the back door to the winter room. Click · WASD · ESC.",
    bg: 0x05060a,
    fog: 0.045,
  },
  winter: {
    title: "Winter Room",
    desc: "雪 falls outside. Slide on the frozen 氷 pond. Return through the door. Click · WASD · ESC.",
    bg: 0x141c28,
    fog: 0.038,
  },
};

let currentRoom = "demo";
let doorCooldown = 0;

function applyRoomAtmosphere(roomId) {
  const m = roomMeta[roomId];
  scene.background.setHex(m.bg);
  scene.fog.color.setHex(m.bg);
  scene.fog.density = m.fog;
  hudTitle.textContent = m.title;
  hudDesc.textContent = m.desc;
  updateDoorMarkers();
}

function setRoom(roomId) {
  currentRoom = roomId;
  doorCooldown = 1.2;
  applyRoomAtmosphere(roomId);
  camera.position.set(0, 1.6, -ROOM + 2.4);
  euler.y = Math.PI;
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
const DOOR_PORTAL_Z = -ROOM + 0.85;
const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const slideVelocity = new THREE.Vector3();
let wasOnIce = false;

function onIce(x, z) {
  const nx = (x - POND_CX) / POND_RX;
  const nz = (z - POND_CZ) / POND_RZ;
  return nx * nx + nz * nz <= 1;
}

function checkDoorTransition() {
  if (doorCooldown > 0) return;
  const p = camera.position;
  if (p.x < DOOR_LEFT || p.x > DOOR_RIGHT || p.z > DOOR_PORTAL_Z) return;
  setRoom(currentRoom === "demo" ? "winter" : "demo");
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
      camera.position.addScaledVector(move, SPEED * dt);
    }
  }

  wasOnIce = icy;

  const p = camera.position;
  p.x = THREE.MathUtils.clamp(p.x, -BOUND, BOUND);
  p.z = THREE.MathUtils.clamp(p.z, -BOUND, BOUND);
  p.y = 1.6;

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
    if (g.kind === "floor" || g.kind === "ice") {
      const dx = camera.position.x - g.sprite.position.x;
      const dz = camera.position.z - g.sprite.position.z;
      d = Math.hypot(dx, dz);
    } else {
      d = tmp.copy(g.sprite.position).sub(camera.position).length();
    }

    const revealFar =
      g.kind === "floor" || g.kind === "ice" ? FLOOR_REVEAL_FAR : REVEAL_FAR;
    const t = THREE.MathUtils.clamp((revealFar - d) / (revealFar - REVEAL_NEAR), 0, 1);
    const clarity = g.shapeFirst ? t * t : t * t * t;

    g.sprite.visible = clarity > 0.02;

    if (g.shapeFirst) {
      g.sprite.material.opacity = clarity * SHAPE_OPACITY_MAX;
      g.sprite.scale.setScalar(g.baseScale * (0.88 + clarity * SHAPE_SCALE_BOOST));
    } else {
      g.sprite.material.opacity = clarity * 0.95;
      g.sprite.scale.setScalar(g.baseScale * (0.55 + clarity * 0.65));
    }
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
  updateClarity();
  updateDoorMarkers();
  updateSnow(dt);
  renderer.render(scene, camera);
}

animate();
