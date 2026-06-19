import * as THREE from "three";

export const KANJI = {
  tree: "木",
  grass: "草",
  ground: "土",
  hill: "坂",
  person: "人",
  wearer: "者",
  cloth: "衣",
  house: "家",
  roof: "屋",
  gate: "門",
  rock: "石",
  tile: "瓦",
  water: "水",
  snow: "雪",
  flower: "花",
  leaf: "葉",
};

const TEX_CACHE = new Map();
const GEO_UNIT = new THREE.PlaneGeometry(1, 1);
const _dummy = new THREE.Object3D();
const _world = new THREE.Vector3();

function rand(seed) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function kanjiTexture(char, color) {
  const key = `${char}|${color}`;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = '700 72px "Noto Sans JP", "MS Gothic", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(char, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.set(key, tex);
  return tex;
}

function kanjiMaterial(char, color) {
  const col = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    map: kanjiTexture(char, color),
    transparent: true,
    opacity: 0.92,
    emissive: col,
    emissiveIntensity: 0.28,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}

function buildKanjiCloud(char, color, points, baseScale = 0.2) {
  if (!points.length) return null;
  const mesh = new THREE.InstancedMesh(GEO_UNIT, kanjiMaterial(char, color), points.length);
  points.forEach((p, i) => {
    const s = baseScale * (p.scale || 1);
    _dummy.position.set(p.x, p.y, p.z);
    _dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
    _dummy.scale.set(s, s, s);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Trunk — tight vertical column (Japanese garden tree). */
function sampleTrunk(count, height, radius, seed) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = rand(seed + i) * Math.PI * 2;
    const r = radius * (0.2 + rand(seed + i + 1) * 0.8);
    pts.push({
      x: Math.cos(a) * r,
      y: 0.2 + rand(seed + i + 2) * height,
      z: Math.sin(a) * r,
      scale: 0.7 + rand(seed + i + 3) * 0.35,
      ry: a,
      rx: (rand(seed + i + 4) - 0.5) * 0.15,
    });
  }
  return pts;
}

/** Rounded umbrella canopy — not a pine cone. */
function sampleCanopy(count, radius, centerY, seed) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const u = rand(seed + i);
    const v = rand(seed + i + 0.3);
    const theta = u * Math.PI * 2;
    const phi = v * Math.PI * 0.45;
    const r = radius * (0.55 + rand(seed + i + 0.6) * 0.45);
    pts.push({
      x: Math.cos(theta) * Math.cos(phi) * r * 1.15,
      y: centerY + Math.sin(phi) * r * 0.55 + rand(seed + i + 0.9) * 0.12,
      z: Math.sin(theta) * Math.cos(phi) * r * 1.15,
      scale: 0.65 + rand(seed + i + 1.1) * 0.45,
      ry: theta + (rand(seed + i + 1.4) - 0.5) * 0.5,
      rx: (rand(seed + i + 1.7) - 0.5) * 0.35,
      rz: (rand(seed + i + 2) - 0.5) * 0.25,
    });
  }
  return pts;
}

/** Bare winter branches — sparse horizontal 木. */
function sampleBranches(count, seed) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const t = rand(seed + i);
    pts.push({
      x: side * (0.4 + t * 1.1),
      y: 1.4 + rand(seed + i + 1) * 0.9,
      z: (rand(seed + i + 2) - 0.5) * 0.5,
      scale: 0.55 + rand(seed + i + 3) * 0.3,
      ry: side * 1.2,
      rz: side * 0.35,
    });
  }
  return pts;
}

function samplePlaneGrid(count, w, d, y, seed) {
  const pts = [];
  const cols = Math.ceil(Math.sqrt(count * (w / d)));
  const rows = Math.ceil(count / cols);
  let n = 0;
  for (let r = 0; r < rows && n < count; r++) {
    for (let c = 0; c < cols && n < count; c++) {
      pts.push({
        x: -w / 2 + (c + 0.5) * (w / cols) + (rand(seed + n) - 0.5) * 0.3,
        y: y + (rand(seed + n + 50) - 0.5) * 0.05,
        z: -d / 2 + (r + 0.5) * (d / rows) + (rand(seed + n + 100) - 0.5) * 0.3,
        scale: 0.5 + rand(seed + n + 150) * 0.35,
        ry: rand(seed + n + 200) * Math.PI * 2,
        rx: -Math.PI / 2 + (rand(seed + n + 250) - 0.5) * 0.12,
      });
      n++;
    }
  }
  return pts;
}

function sampleSlope(count, w, d, rise, seed) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const u = rand(seed + i);
    const v = rand(seed + i + 0.5);
    const x = (u - 0.5) * w;
    const z = (v - 0.5) * d;
    pts.push({
      x,
      y: 0.1 + ((z + d / 2) / d) * rise,
      z,
      scale: 0.55 + rand(seed + i + 1) * 0.4,
      ry: rand(seed + i + 2) * Math.PI * 2,
      rx: -0.3 - v * 0.2,
    });
  }
  return pts;
}

function samplePerson(seed) {
  const pts = [];
  const parts = [
    [0, 1.55, 0, 1.05],
    [-0.16, 1.3, 0.04, 0.8],
    [0.16, 1.3, -0.04, 0.8],
    [0, 1.0, 0, 0.95],
    [0, 0.55, 0, 1.0],
    [-0.13, 0.2, 0.05, 0.75],
    [0.13, 0.2, 0.05, 0.75],
  ];
  parts.forEach(([x, y, z, sc], pi) => {
    for (let k = 0; k < 5; k++) {
      pts.push({
        x: x + (rand(seed + pi + k) - 0.5) * 0.07,
        y: y + (rand(seed + pi + k + 10) - 0.5) * 0.05,
        z: z + (rand(seed + pi + k + 20) - 0.5) * 0.07,
        scale: sc * (0.88 + rand(seed + pi + k + 30) * 0.18),
        ry: (rand(seed + pi + k + 40) - 0.5) * 0.45,
      });
    }
  });
  return pts;
}

function wrapConstruct(proxy, kanjiMeshes, lod = { near: 14, far: 28 }) {
  const group = new THREE.Group();
  if (proxy) group.add(proxy);
  const kanji = new THREE.Group();
  kanjiMeshes.filter(Boolean).forEach((m) => kanji.add(m));
  group.add(kanji);
  group.userData.kanjiConstruct = {
    proxy,
    kanji,
    lodNear: lod.near,
    lodFar: lod.far,
    phase: Math.random() * Math.PI * 2,
  };
  return group;
}

/** Japanese garden tree proxy — slender trunk + flat round canopy. */
function japaneseTreeProxy(colors, style = "green") {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({
    color: colors.trunkSolid || 0x4a3828,
    roughness: 0.92,
    flatShading: true,
  });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.7, 6), trunkMat);
  trunk.position.y = 0.85;
  g.add(trunk);

  if (style !== "bare") {
    const canopyMat = new THREE.MeshStandardMaterial({
      color: colors.canopySolid || 0x3d7a48,
      roughness: 0.88,
      flatShading: true,
    });
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.25, 10, 8), canopyMat);
    canopy.scale.set(1.15, 0.55, 1.15);
    canopy.position.y = 2.25;
    g.add(canopy);
  } else {
    const branchMat = trunkMat.clone();
    [-0.7, 0.7].forEach((sx) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.1, 4), branchMat);
      b.position.set(sx * 0.6, 1.75, 0);
      b.rotation.z = sx * 0.55;
      g.add(b);
    });
  }
  return g;
}

export function createJapaneseTree(colors, seed = 0, style = "green") {
  const trunkPts = sampleTrunk(24, 1.5, 0.14, seed);
  const meshes = [buildKanjiCloud(KANJI.tree, colors.trunk, trunkPts, 0.19)];

  if (style === "bare") {
    meshes.push(buildKanjiCloud(KANJI.tree, colors.trunk, sampleBranches(18, seed + 40), 0.17));
  } else {
    meshes.push(
      buildKanjiCloud(KANJI.tree, colors.canopy, sampleCanopy(100, 1.2, 2.15, seed + 50), 0.22)
    );
  }

  return wrapConstruct(japaneseTreeProxy(colors, style), meshes, { near: 16, far: 32 });
}

export function createGrassPatch(w, d, color, count = 160, seed = 0) {
  const pts = samplePlaneGrid(count, w, d, 0.14, seed).map((p) => ({
    ...p,
    y: 0.1 + rand(seed + p.x) * 0.2,
    rx: (rand(seed + p.z) - 0.5) * 0.35,
  }));
  const proxy = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: color.solid || 0x4a8a48, roughness: 0.95, side: THREE.DoubleSide })
  );
  proxy.rotation.x = -Math.PI / 2;
  proxy.position.y = 0.02;
  return wrapConstruct(proxy, [buildKanjiCloud(KANJI.grass, color.kanji, pts, 0.17)], { near: 18, far: 34 });
}

export function createGroundPlane(w, d, color, count = 450, seed = 0) {
  const pts = samplePlaneGrid(count, w, d, 0.03, seed);
  const proxy = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: color.solid || 0x5a6a48, roughness: 1, side: THREE.DoubleSide })
  );
  proxy.rotation.x = -Math.PI / 2;
  proxy.position.y = 0.01;
  return wrapConstruct(proxy, [buildKanjiCloud(KANJI.ground, color.kanji, pts, 0.15)], { near: 22, far: 40 });
}

export function createDirtPath(length, width, color, count = 120, seed = 0) {
  const pts = samplePlaneGrid(count, length, width, 0.05, seed);
  const proxy = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    new THREE.MeshStandardMaterial({ color: color.solid || 0x7a6a50, roughness: 1, side: THREE.DoubleSide })
  );
  proxy.rotation.x = -Math.PI / 2;
  proxy.position.y = 0.03;
  return wrapConstruct(proxy, [buildKanjiCloud(KANJI.ground, color.path || color.kanji, pts, 0.14)], {
    near: 20,
    far: 36,
  });
}

export function createHill(w, d, rise, color, count = 180, seed = 0) {
  const pts = sampleSlope(count, w, d, rise, seed);
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(w, rise, d),
    new THREE.MeshStandardMaterial({ color: color.solid || 0x6a5a40, roughness: 0.9, flatShading: true })
  );
  proxy.position.set(0, rise / 2, 0);
  proxy.rotation.x = -0.2;
  return wrapConstruct(proxy, [buildKanjiCloud(KANJI.hill, color.kanji, pts, 0.19)], { near: 16, far: 32 });
}

export function createToriiConstruct(seasonChar, palette, seed = 0) {
  const left = sampleTrunk(40, 3.1, 0.12, seed).map((p) => ({ ...p, x: p.x - 1.15 }));
  const right = sampleTrunk(40, 3.1, 0.12, seed + 50).map((p) => ({ ...p, x: p.x + 1.15 }));
  const gatePts = [];
  for (let i = 0; i < 35; i++) {
    gatePts.push({
      x: (rand(seed + i) - 0.5) * 1.1,
      y: 0.5 + rand(seed + i + 1) * 1.8,
      z: (rand(seed + i + 2) - 0.5) * 0.3,
      scale: 0.7 + rand(seed + i + 3) * 0.35,
      ry: rand(seed + i + 4) * Math.PI * 2,
    });
  }
  const lintelPts = [];
  for (let i = 0; i < 40; i++) {
    lintelPts.push({
      x: (i / 40 - 0.5) * 3.2,
      y: 3.15 + (rand(seed + i + 10) - 0.5) * 0.15,
      z: (rand(seed + i + 11) - 0.5) * 0.25,
      scale: 0.55 + rand(seed + i + 12) * 0.25,
      ry: (rand(seed + i + 13) - 0.5) * 0.3,
    });
  }

  const proxy = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: palette.solid || 0xc87830,
    roughness: 0.75,
    flatShading: true,
  });
  const pL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.3, 0.28), mat);
  pL.position.set(-1.15, 1.65, 0);
  const pR = pL.clone();
  pR.position.x = 1.15;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.22, 0.28), mat);
  lintel.position.y = 3.2;
  proxy.add(pL, pR, lintel);

  return wrapConstruct(
    proxy,
    [
      buildKanjiCloud(KANJI.tree, palette.pillar, [...left, ...right], 0.18),
      buildKanjiCloud(KANJI.tile, palette.lintel, lintelPts, 0.16),
      buildKanjiCloud(KANJI.gate, palette.gate, gatePts, 0.24),
      buildKanjiCloud(seasonChar, palette.season, sampleCanopy(14, 0.45, 2.6, seed + 80), 0.3),
    ],
    { near: 14, far: 28 }
  );
}

export function createPersonConstruct(colors, seed = 0) {
  const body = samplePerson(seed);
  const cloth = body.slice(0, 15).map((p) => ({ ...p, scale: (p.scale || 1) * 0.82 }));
  const proxy = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.95, 4, 8),
    new THREE.MeshStandardMaterial({ color: colors.solid || 0x5a8a9a, roughness: 0.82, flatShading: true })
  );
  proxy.position.y = 1.0;
  return wrapConstruct(
    proxy,
    [
      buildKanjiCloud(KANJI.person, colors.skin, body, 0.21),
      buildKanjiCloud(KANJI.wearer, colors.shirt, cloth, 0.19),
      buildKanjiCloud(KANJI.cloth, colors.cloth, cloth.slice(0, 10), 0.17),
    ],
    { near: 9, far: 20 }
  );
}

export function createRockConstruct(color, seed = 0) {
  const pts = [];
  for (let i = 0; i < 60; i++) {
    pts.push({
      x: (rand(seed + i) - 0.5) * 1.4,
      y: rand(seed + i + 1) * 0.9,
      z: (rand(seed + i + 2) - 0.5) * 1.2,
      scale: 0.5 + rand(seed + i + 3) * 0.35,
      ry: rand(seed + i + 4) * Math.PI * 2,
    });
  }
  const proxy = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.75, 0),
    new THREE.MeshStandardMaterial({ color: color.solid || 0x7a7a80, flatShading: true })
  );
  proxy.position.y = 0.5;
  return wrapConstruct(proxy, [buildKanjiCloud(KANJI.rock, color.kanji, pts, 0.19)], { near: 12, far: 24 });
}

export function createAccentField(char, color, count, bounds, seed = 0) {
  const pts = samplePlaneGrid(count, bounds.w, bounds.d, 0.18, seed).map((p) => ({
    ...p,
    y: 0.15 + rand(seed + p.x) * 0.3,
  }));
  const g = new THREE.Group();
  const mesh = buildKanjiCloud(char, color, pts, 0.19);
  if (mesh) g.add(mesh);
  g.userData.kanjiConstruct = { proxy: null, kanji: g, lodNear: 22, lodFar: 42, phase: Math.random() * 6 };
  return g;
}

export function collectConstructs(root) {
  const list = [];
  root.traverse((o) => {
    if (o.userData?.kanjiConstruct) list.push(o);
  });
  return list;
}

export function updateKanjiConstructs(constructs, camera, time) {
  for (const group of constructs) {
    const kd = group.userData.kanjiConstruct;
    if (!kd) continue;

    group.getWorldPosition(_world);
    const dist = camera.position.distanceTo(_world);

    let showProxy = true;
    let showKanji = false;
    let opacity = 0;

    if (dist <= kd.lodNear) {
      showProxy = false;
      showKanji = true;
      opacity = 0.95;
    } else if (dist <= kd.lodFar) {
      showProxy = true;
      showKanji = true;
      opacity = THREE.MathUtils.mapLinear(dist, kd.lodNear, kd.lodFar, 0.9, 0.08);
    } else {
      showProxy = true;
      showKanji = false;
      opacity = 0;
    }

    if (kd.proxy) kd.proxy.visible = showProxy;
    kd.kanji.visible = showKanji;

    const bob = Math.sin(time * 1.1 + kd.phase) * 0.02;
    kd.kanji.position.y = bob;
    kd.kanji.rotation.y = Math.atan2(camera.position.x - _world.x, camera.position.z - _world.z);

    kd.kanji.traverse((ch) => {
      if (ch.isMesh && ch.material?.opacity !== undefined) {
        ch.material.opacity = opacity;
        ch.material.emissiveIntensity = 0.1 + opacity * 0.35;
      }
    });
  }
}
