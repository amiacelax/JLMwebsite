import * as THREE from "three";
import {
  KANJI,
  createAccentField,
  createDirtPath,
  createGrassPatch,
  createGroundPlane,
  createHill,
  createJapaneseTree,
  createRockConstruct,
  createToriiConstruct,
  collectConstructs,
} from "./kanji-construct.js";

const HUB_SIZE = 56;

export const ZONE_META = {
  hub: { label: "町の中心", bounds: HUB_SIZE },
  winter: { label: "冬 · 雪の里", bounds: 58 },
  spring: { label: "春 · 花の野", bounds: 58 },
  summer: { label: "夏 · 渓の国", bounds: 58 },
  fall: { label: "秋 · 紅葉", bounds: 58 },
};

const HUB_PAL = {
  solid: 0x4a6a42,
  kanji: "#6a9a62",
  path: "#8a7a58",
  trunk: "#4a3828",
  trunkSolid: 0x4a3828,
  canopy: "#4a8a48",
  canopySolid: 0x3d7a48,
  pillar: "#c9a030",
  lintel: "#e8c050",
  gate: "#ffe878",
  season: "#ffffff",
};

const SEASON_PAL = {
  winter: {
    solid: 0x6a8aa8,
    kanji: "#b8d0e8",
    trunk: "#5a6a78",
    trunkSolid: 0x5a6a78,
    canopy: "#8aa0b0",
    canopySolid: 0x7a8a98,
    pillar: "#9ab0c8",
    lintel: "#c0d8e8",
    gate: "#e0f0ff",
    season: "#d8f0ff",
    accent: "#e8f4ff",
  },
  spring: {
    solid: 0x5a8a48,
    kanji: "#7aaa68",
    trunk: "#4a3828",
    trunkSolid: 0x4a3828,
    canopy: "#6aba58",
    canopySolid: 0x5a9a48,
    pillar: "#c9a030",
    lintel: "#e8c050",
    gate: "#ffe878",
    season: "#ffb8d8",
    accent: "#f0a0c8",
  },
  summer: {
    solid: 0x6a8a38,
    kanji: "#8aaa58",
    trunk: "#3a4a28",
    trunkSolid: 0x3a4a28,
    canopy: "#4a8a30",
    canopySolid: 0x4a7a30,
    pillar: "#c9a030",
    lintel: "#e8c050",
    gate: "#ffe878",
    season: "#ffe060",
    accent: "#60b0e8",
  },
  fall: {
    solid: 0x6a5a38,
    kanji: "#9a7a58",
    trunk: "#4a3028",
    trunkSolid: 0x5a3828,
    canopy: "#c05030",
    canopySolid: 0xb04028,
    pillar: "#a06030",
    lintel: "#c87840",
    gate: "#f0a050",
    season: "#e06040",
    accent: "#e07040",
  },
};

const HUB_RETURNS = {
  winter: { x: -12, z: -12 },
  spring: { x: 12, z: -12 },
  fall: { x: -12, z: 12 },
  summer: { x: 12, z: 12 },
};

function layZoneBase(parent, size, pal, seed) {
  parent.add(
    createGroundPlane(size, size, { solid: pal.solid, kanji: pal.kanji }, 460, seed)
  );
  const patches = [
    [-14, -10, 14, 12],
    [12, -14, 12, 10],
    [-10, 14, 16, 11],
    [8, 10, 13, 13],
  ];
  patches.forEach(([x, z, w, d], i) => {
    const g = createGrassPatch(w, d, { solid: pal.canopySolid, kanji: "#5a9a50" }, 150, seed + 10 + i);
    g.position.set(x, 0, z);
    parent.add(g);
  });
}

function layHubPaths(parent, seed) {
  const pathCol = { solid: 0x7a6a50, kanji: HUB_PAL.path, path: "#9a8a68" };
  const corners = [
    [-16, -16, -Math.PI / 4],
    [16, -16, Math.PI / 4],
    [-16, 16, (-3 * Math.PI) / 4],
    [16, 16, (3 * Math.PI) / 4],
  ];
  corners.forEach(([x, z, rot], i) => {
    const path = createDirtPath(24, 3.5, pathCol, 100, seed + 20 + i);
    path.position.set(x * 0.45, 0, z * 0.45);
    path.rotation.y = rot + Math.PI / 2;
    parent.add(path);
  });
}

function treeStyle(zoneId) {
  if (zoneId === "winter") return "bare";
  return "green";
}

function addTrees(parent, spots, pal, zoneId, seed) {
  const style = treeStyle(zoneId);
  spots.forEach(([x, z], i) => {
    const t = createJapaneseTree(pal, seed + i * 19, style);
    t.position.set(x, 0, z);
    t.rotation.y = (i * 0.7) % (Math.PI * 2);
    parent.add(t);
  });
}

function addHills(parent, pal, seed) {
  const h1 = createHill(14, 10, 2.6, { solid: pal.solid, kanji: "#8a7a58" }, 170, seed);
  h1.position.set(-18, 0, 14);
  h1.rotation.y = 0.35;
  parent.add(h1);
  const h2 = createHill(11, 9, 2.0, { solid: pal.solid, kanji: "#9a8a68" }, 140, seed + 30);
  h2.position.set(16, 0, -12);
  h2.rotation.y = -0.5;
  parent.add(h2);
}

export function buildHubScene() {
  const scene = new THREE.Group();
  scene.name = "hub";

  layZoneBase(scene, HUB_SIZE, HUB_PAL, 100);
  layHubPaths(scene, 110);
  addHills(scene, HUB_PAL, 200);
  addTrees(
    scene,
    [[-12, -8], [10, -14], [-18, 6], [16, 10], [-8, 18], [14, -6], [-20, -12], [18, 12]],
    HUB_PAL,
    "hub",
    300
  );

  const corner = 16;
  const portals = [
    { zone: "winter", char: "冬", color: "#b8e8ff", x: -corner, z: -corner },
    { zone: "spring", char: "春", color: "#ffb0d8", x: corner, z: -corner },
    { zone: "fall", char: "秋", color: "#f08858", x: -corner, z: corner },
    { zone: "summer", char: "夏", color: "#ffe878", x: corner, z: corner },
  ];

  const portalData = [];
  portals.forEach((p, i) => {
    const torii = createToriiConstruct(p.char, {
      solid: 0xc87830,
      pillar: HUB_PAL.pillar,
      lintel: HUB_PAL.lintel,
      gate: HUB_PAL.gate,
      season: p.color,
    }, 400 + i * 25);
    torii.position.set(p.x, 0, p.z);
    torii.rotation.y = Math.atan2(-p.x, -p.z);
    scene.add(torii);
    portalData.push({ to: p.zone, x: p.x, z: p.z, r: 4.5, hubReturn: HUB_RETURNS[p.zone] });
  });

  scene.userData.portals = portalData;
  scene.userData.spawn = { x: 0, z: 0 };
  scene.userData.bounds = HUB_SIZE / 2 - 2;
  scene.userData.constructs = collectConstructs(scene);
  return scene;
}

function buildSeasonScene(zoneId, seasonChar, pal) {
  const scene = new THREE.Group();
  scene.name = zoneId;
  const size = ZONE_META[zoneId].bounds;

  layZoneBase(scene, size, pal, 500 + zoneId.length);
  addHills(scene, pal, 600);
  addTrees(
    scene,
    Array.from({ length: 9 }, (_, i) => [
      Math.sin(i * 2.1) * (size / 2 - 8),
      Math.cos(i * 1.7) * (size / 2 - 8),
    ]),
    pal,
    zoneId,
    700
  );

  const accent =
    zoneId === "winter" ? KANJI.snow : zoneId === "spring" ? KANJI.flower : zoneId === "summer" ? KANJI.water : KANJI.leaf;
  scene.add(createAccentField(accent, pal.accent, zoneId === "spring" ? 190 : 140, { w: size - 8, d: size - 8 }, 800));

  if (zoneId === "summer") {
    const rock = createRockConstruct({ solid: 0x6a8aa8, kanji: "#80c8f0" }, 820);
    rock.position.set(12, 0, -6);
    scene.add(rock);
  }

  const torii = createToriiConstruct(seasonChar, {
    solid: 0xc87830,
    pillar: pal.pillar,
    lintel: pal.lintel,
    gate: pal.gate,
    season: pal.season,
  }, 900);
  torii.position.set(0, 0, -size / 2 + 5);
  scene.add(torii);

  scene.userData.portals = [{ to: "hub", x: 0, z: -size / 2 + 5, r: 4.5, spawn: HUB_RETURNS[zoneId] }];
  scene.userData.spawn = { x: 0, z: -size / 2 + 10 };
  scene.userData.bounds = size / 2 - 2;
  scene.userData.constructs = collectConstructs(scene);
  return scene;
}

export function buildZone(zoneId) {
  if (zoneId === "hub") return buildHubScene();
  const cfg = {
    winter: { char: "冬", pal: SEASON_PAL.winter },
    spring: { char: "春", pal: SEASON_PAL.spring },
    summer: { char: "夏", pal: SEASON_PAL.summer },
    fall: { char: "秋", pal: SEASON_PAL.fall },
  }[zoneId];
  return buildSeasonScene(zoneId, cfg.char, cfg.pal);
}

export function getZoneConstructs(zoneGroup) {
  return zoneGroup.userData.constructs || collectConstructs(zoneGroup);
}
