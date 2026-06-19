import * as THREE from "three";
import { ZONES } from "./data.js";
import { loadSave, writeSave } from "./save.js";
import { buildZone, ZONE_META, getZoneConstructs } from "./world.js";
import { createPersonConstruct, updateKanjiConstructs } from "./kanji-construct.js";

if (location.search.includes("reset")) {
  localStorage.removeItem("yugen-gatherer-v2");
  localStorage.removeItem("yugen-gatherer-v1");
}

const canvas = document.getElementById("yg-canvas");
const hudZone = document.getElementById("yg-hud-zone");
const prompt = document.getElementById("yg-prompt");
const promptText = document.getElementById("yg-prompt-text");
const fadeEl = document.getElementById("yg-fade");

const FOG = {
  hub: 0x1a1814,
  winter: 0x141c28,
  spring: 0x141a18,
  summer: 0x1e1810,
  fall: 0x1a120e,
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.setClearColor(0x12100e, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG.hub, 50, 140);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
scene.add(new THREE.AmbientLight(0xffeed8, 0.7));
scene.add(new THREE.HemisphereLight(0xfff0d8, 0x3a4a38, 0.45));

const save = loadSave();
let zoneId = save.zone in ZONE_META ? save.zone : "hub";
let zoneGroup = buildZone(zoneId);
scene.add(zoneGroup);

let zoneConstructs = getZoneConstructs(zoneGroup);

const player = createPersonConstruct({
  solid: 0x5a8a9a,
  skin: "#ffe8d0",
  shirt: "#5a8a9a",
  cloth: "#6a5040",
}, 42);
player.position.set(save.x, 0, save.z);
scene.add(player);

const allConstructs = [player];

const keys = new Set();
let transitioning = false;
const MOVE_SPEED = 7.5;
const clock = new THREE.Clock();

function refreshConstructs() {
  zoneConstructs = getZoneConstructs(zoneGroup);
  allConstructs.length = 0;
  allConstructs.push(player, ...zoneConstructs);
}

function persist() {
  writeSave({ version: 2, zone: zoneId, x: player.position.x, z: player.position.z });
}

function clampPlayer() {
  const b = zoneGroup.userData.bounds || 30;
  player.position.x = THREE.MathUtils.clamp(player.position.x, -b, b);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -b, b);
}

function updateCamera() {
  const { x: px, z: pz } = player.position;
  camera.position.set(px - 9, 11, pz + 11);
  camera.lookAt(px, 1.8, pz);
}

function showPrompt(text) {
  prompt.hidden = !text;
  if (text) promptText.textContent = text;
}

function findNearPortal() {
  const portals = zoneGroup.userData.portals || [];
  let best = null;
  let bestD = Infinity;
  for (const p of portals) {
    const d = Math.hypot(player.position.x - p.x, player.position.z - p.z);
    if (d < p.r && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

function updatePrompt() {
  const p = findNearPortal();
  if (!p) return showPrompt(null);
  const dest = ZONES[p.to] || ZONE_META[p.to];
  showPrompt(p.to === "hub" ? "E — return to town" : `E — enter ${dest?.label || p.to}`);
}

async function transitionTo(nextZone, spawn) {
  if (transitioning) return;
  transitioning = true;
  fadeEl.hidden = false;
  requestAnimationFrame(() => fadeEl.classList.add("is-active"));
  await new Promise((r) => setTimeout(r, 480));

  scene.remove(zoneGroup);
  zoneId = nextZone;
  zoneGroup = buildZone(zoneId);
  scene.add(zoneGroup);
  scene.fog.color.setHex(FOG[zoneId] || FOG.hub);
  refreshConstructs();

  const s = spawn || zoneGroup.userData.spawn || { x: 0, z: 0 };
  player.position.set(s.x, 0, s.z);
  clampPlayer();
  persist();
  if (hudZone) hudZone.textContent = ZONE_META[zoneId]?.label || zoneId;

  fadeEl.classList.remove("is-active");
  await new Promise((r) => setTimeout(r, 420));
  fadeEl.hidden = true;
  transitioning = false;
  updatePrompt();
}

function tryPortal() {
  const p = findNearPortal();
  if (!p) return;
  transitionTo(p.to === "hub" ? "hub" : p.to, p.to === "hub" ? p.spawn : null);
}

function handleMovement(dt) {
  if (transitioning) return;
  let dx = 0;
  let dz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) dz -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) dz += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) dx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) dx += 1;
  if (!dx && !dz) return;
  const len = Math.hypot(dx, dz) || 1;
  player.position.x += (dx / len) * MOVE_SPEED * dt;
  player.position.z += (dz / len) * MOVE_SPEED * dt;
  clampPlayer();
  player.rotation.y = Math.atan2(dx, dz);
  persist();
  updatePrompt();
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  handleMovement(dt);
  updateCamera();
  updateKanjiConstructs(allConstructs, camera, clock.elapsedTime);
  renderer.render(scene, camera);
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyE") {
    e.preventDefault();
    tryPortal();
  }
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("resize", onResize);

if (hudZone) hudZone.textContent = ZONE_META[zoneId]?.label || "町の中心";
refreshConstructs();
onResize();
clampPlayer();
updatePrompt();
animate();
