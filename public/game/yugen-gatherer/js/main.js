import * as THREE from "three";
import {
  GIFT_ITEMS,
  GATHER_NODES,
  TOWN_BOUNDS,
  TOWN_NPCS,
  NPC_REQUIRED,
} from "./data.js";
import { loadSave, writeSave } from "./save.js";
import {
  buildDreamScene,
  buildKaraokeRoom,
  buildTown,
  buildElevatorInterior,
  createPlayerMesh,
  createNpcMesh,
  makeSky,
  getGroundHeight,
} from "./world.js";

const canvas = document.getElementById("yg-canvas");
const minimapCanvas = document.getElementById("yg-minimap");
const minimapCtx = minimapCanvas.getContext("2d");

const ui = {
  subtitle: document.getElementById("yg-subtitle"),
  blurDream: document.getElementById("yg-blur-dream"),
  prompt: document.getElementById("yg-prompt"),
  promptText: document.getElementById("yg-prompt-text"),
  dialogue: document.getElementById("yg-dialogue"),
  dialogueSpeaker: document.getElementById("yg-dialogue-speaker"),
  dialogueLine: document.getElementById("yg-dialogue-line"),
  dialogueChoices: document.getElementById("yg-dialogue-choices"),
  dialogueClose: document.getElementById("yg-dialogue-close"),
  choiceYes: document.getElementById("yg-choice-yes"),
  choiceNo: document.getElementById("yg-choice-no"),
  note: document.getElementById("yg-note"),
  noteClose: document.getElementById("yg-note-close"),
  hud: document.getElementById("yg-hud"),
  hudPhase: document.getElementById("yg-hud-phase"),
  hudBag: document.getElementById("yg-hud-bag"),
  controlsHint: document.getElementById("yg-controls-hint"),
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffc8a0, 0.012);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

const clock = new THREE.Clock();
const save = loadSave();

const keys = new Set();
let rightMouse = false;
let cameraYaw = 0;
let cameraPitch = 0.25;
let cameraDistance = 7;
const CAMERA_MIN = 0.05;
const CAMERA_MAX = 14;

const player = createPlayerMesh();
player.position.set(0, 0, 2);
scene.add(player);

const velocity = new THREE.Vector3();
const moveDir = new THREE.Vector3();
let onGround = true;
let interactTarget = null;
let pendingNpc = null;
let uiLocked = false;
let elevatorTransitioning = false;
let dreamTime = 0;
let elevatorTime = 0;
let fadeEl = null;

const npcMeshes = new Map();
const colliders = [];

let phase = save.phase === "dream" && save.dreamSeen ? "karaoke" : save.phase;
if (save.level0Complete) phase = "town";

const ambient = new THREE.AmbientLight(0xffeedd, 0.35);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffaa77, 1.1);
sun.position.set(20, 30, -15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
scene.add(sun);

const dreamGroup = buildDreamScene();
const karaokeGroup = buildKaraokeRoom();
karaokeGroup.visible = false;
const townGroup = buildTown();
townGroup.visible = false;
const elevatorGroup = buildElevatorInterior();
elevatorGroup.visible = false;

scene.add(dreamGroup, karaokeGroup, townGroup, elevatorGroup);

function setPhase(next) {
  phase = next;
  save.phase = next;
  writeSave(save);

  dreamGroup.visible = phase === "dream";
  karaokeGroup.visible = phase === "karaoke";
  townGroup.visible = phase === "town";
  elevatorGroup.visible = phase === "elevator";

  if (phase === "dream") {
    scene.background = makeSky(false);
    scene.fog.color.setHex(0x050810);
    scene.fog.density = 0.008;
    sun.intensity = 0.2;
    sun.position.set(20, 30, -15);
    ambient.intensity = 0.15;
    ambient.color.setHex(0xffeedd);
    renderer.toneMappingExposure = 1.08;
    ui.hud.hidden = true;
    minimapCanvas.classList.remove("is-visible");
    player.visible = false;
    ui.controlsHint.style.opacity = "0";
    ui.blurDream.classList.remove("is-clear");
  } else {
    ui.blurDream.classList.add("is-clear");
  }

  if (phase === "karaoke") {
    scene.background = new THREE.Color(0x08040e);
    scene.fog.color.setHex(0x1a0818);
    scene.fog.density = 0.028;
    sun.intensity = 0;
    sun.color.setHex(0xffaa77);
    ambient.intensity = 0.06;
    ambient.color.setHex(0xff8866);
    renderer.toneMappingExposure = 1.15;
    player.visible = true;
    player.position.set(0, 0, 2);
    cameraYaw = Math.PI;
    ui.hud.hidden = false;
    ui.hudPhase.textContent = "Karaoke room · dawn";
    minimapCanvas.classList.remove("is-visible");
    ui.controlsHint.style.opacity = "1";
  } else if (phase === "elevator") {
    scene.background = new THREE.Color(0x111111);
    scene.fog.density = 0.02;
    sun.intensity = 0.05;
    ambient.intensity = 0.12;
    ambient.color.setHex(0xffeedd);
    renderer.toneMappingExposure = 1.05;
    player.visible = true;
    player.position.set(0, 0, 0);
    cameraYaw = Math.PI;
    elevatorTime = 0;
    ui.hudPhase.textContent = "Elevator…";
  } else if (phase === "town") {
    scene.background = makeSky(true);
    scene.fog.color.setHex(0xffc896);
    scene.fog.density = 0.009;
    sun.intensity = 1.35;
    sun.color.setHex(0xffbb66);
    sun.position.set(12, 18, -22);
    ambient.intensity = 0.52;
    ambient.color.setHex(0xffe8cc);
    renderer.toneMappingExposure = 1.12;
    player.visible = true;
    player.position.set(0, 0, -22);
    cameraYaw = 0;
    ui.hud.hidden = false;
    ui.hudPhase.textContent = save.level0Complete
      ? "Level 0 complete · wander"
      : "Level 0 · meet the town";
    minimapCanvas.classList.add("is-visible");
    spawnTownNpcs();
    updateBagHud();
  }
}

function spawnTownNpcs() {
  if (npcMeshes.size) return;
  TOWN_NPCS.forEach((npc, i) => {
    const mesh = createNpcMesh(0x5a6a7a + (i * 0x030305));
    mesh.position.set(npc.x, 0, npc.z);
    mesh.userData.npcId = npc.id;
    townGroup.add(mesh);
    npcMeshes.set(npc.id, mesh);
  });
}

function showSubtitle(text, ms = 2800) {
  ui.subtitle.textContent = text;
  ui.subtitle.hidden = false;
  ui.subtitle.classList.add("is-visible");
  clearTimeout(showSubtitle.timer);
  showSubtitle.timer = setTimeout(() => {
    ui.subtitle.classList.remove("is-visible");
    setTimeout(() => {
      ui.subtitle.hidden = true;
    }, 1200);
  }, ms);
}

function fadeToBlack(duration = 900, hold = 600) {
  return new Promise((resolve) => {
    if (!fadeEl) {
      fadeEl = document.createElement("div");
      fadeEl.className = "yg-fade";
      document.getElementById("yg-root").appendChild(fadeEl);
    }
    fadeEl.classList.add("is-active");
    setTimeout(() => {
      setTimeout(() => {
        fadeEl.classList.remove("is-active");
        resolve();
      }, hold);
    }, duration);
  });
}

async function runDreamIntro() {
  player.visible = false;
  ui.controlsHint.style.opacity = "0";
  ui.blurDream.classList.remove("is-clear");
  showSubtitle("A distant light, somewhere beyond sleep…", 3200);
  await wait(3400);
  showSubtitle("…", 1200);
  await wait(1400);
  ui.blurDream.classList.add("is-clear");
  save.dreamSeen = true;
  writeSave(save);
  await fadeToBlack(800, 400);
  setPhase("karaoke");
  showSubtitle("The screen still glows. Your bag is gone.", 3500);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hideDialogue() {
  ui.dialogue.hidden = true;
  ui.dialogueChoices.hidden = true;
  ui.dialogueClose.hidden = true;
  uiLocked = false;
  pendingNpc = null;
}

function showDialogue(speaker, line, choices = false) {
  ui.dialogue.hidden = false;
  ui.dialogueSpeaker.textContent = speaker;
  ui.dialogueLine.textContent = line;
  ui.dialogueChoices.hidden = !choices;
  ui.dialogueClose.hidden = choices;
  uiLocked = true;
}

function updateBagHud() {
  if (!save.inventory.length) {
    ui.hudBag.textContent = "Bag: empty";
    return;
  }
  ui.hudBag.textContent =
    "Bag: " + save.inventory.map((id) => GIFT_ITEMS.find((g) => g.id === id)?.label || id).join(" · ");
}

function interact() {
  if (uiLocked) return;

  if (phase === "karaoke") {
    const noteDist = player.position.distanceTo(new THREE.Vector3(0.3, 0, 3.2));
    const doorDist = player.position.distanceTo(new THREE.Vector3(6.5, 0, 0));
    if (noteDist < 2.2) {
      ui.note.hidden = false;
      save.noteRead = true;
      writeSave(save);
      uiLocked = true;
      return;
    }
    if (doorDist < 2.5 && save.noteRead) {
      void exitKaraoke();
      return;
    }
    if (doorDist < 2.5) {
      showDialogue("…", "The door is locked from the inside. Maybe check the table first.", false);
      ui.dialogueClose.hidden = false;
      return;
    }
  }

  if (phase === "town" && interactTarget) {
    const npc = TOWN_NPCS.find((n) => n.id === interactTarget);
    if (!npc) return;
    if (save.npcMet.includes(npc.id)) {
      showDialogue(npc.name, "またね。いい朝だね。", false);
      ui.dialogueClose.hidden = false;
      return;
    }
    pendingNpc = npc;
    const item = GIFT_ITEMS[npc.itemIndex];
    showDialogue(npc.name, "はい、どうぞ！ — " + item.label, true);
  }
}

async function exitKaraoke() {
  uiLocked = true;
  hideDialogue();
  await fadeToBlack(700, 300);
  setPhase("elevator");
  showSubtitle("Going down…", 2000);
  uiLocked = false;
}

function acceptGift() {
  if (!pendingNpc) return;
  const item = GIFT_ITEMS[pendingNpc.itemIndex];
  if (!save.inventory.includes(item.id)) save.inventory.push(item.id);
  if (!save.npcMet.includes(pendingNpc.id)) save.npcMet.push(pendingNpc.id);
  writeSave(save);
  updateBagHud();
  hideDialogue();
  showSubtitle("Received " + item.label, 1800);
  checkLevelComplete();
}

function declineGift() {
  if (!pendingNpc) return;
  if (!save.npcMet.includes(pendingNpc.id)) save.npcMet.push(pendingNpc.id);
  writeSave(save);
  hideDialogue();
  checkLevelComplete();
}

function checkLevelComplete() {
  if (save.level0Complete) return;
  if (save.npcMet.length >= NPC_REQUIRED) {
    save.level0Complete = true;
    writeSave(save);
    ui.hudPhase.textContent = "Level 0 complete · wander";
    showSubtitle("The town feels a little warmer now.", 3200);
  }
}

function updateInteractPrompt() {
  if (uiLocked || phase === "dream" || phase === "elevator") {
    ui.prompt.hidden = true;
    interactTarget = null;
    return;
  }

  if (phase === "karaoke") {
    const noteDist = player.position.distanceTo(new THREE.Vector3(0.3, 0, 3.2));
    const doorDist = player.position.distanceTo(new THREE.Vector3(6.5, 0, 0));
    if (noteDist < 2.2) {
      ui.prompt.hidden = false;
      ui.promptText.textContent = save.noteRead ? "Read note again" : "Read note";
      return;
    }
    if (doorDist < 2.5) {
      ui.prompt.hidden = false;
      ui.promptText.textContent = save.noteRead ? "Leave" : "Door";
      return;
    }
  }

  if (phase === "town") {
    let nearest = null;
    let nearestD = 2.8;
    TOWN_NPCS.forEach((npc) => {
      const d = Math.hypot(player.position.x - npc.x, player.position.z - npc.z);
      if (d < nearestD) {
        nearestD = d;
        nearest = npc.id;
      }
    });
    interactTarget = nearest;
    if (nearest) {
      const npc = TOWN_NPCS.find((n) => n.id === nearest);
      ui.prompt.hidden = false;
      ui.promptText.textContent = "Talk to " + npc.name;
      return;
    }
  }

  ui.prompt.hidden = true;
  interactTarget = null;
}

function handleMovement(dt) {
  if (uiLocked || phase === "dream") return;

  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const speed = sprint ? 7.5 : 4.2;
  const jump = keys.has("Space");

  moveDir.set(0, 0, 0);
  if (keys.has("KeyW")) moveDir.z += 1;
  if (keys.has("KeyS")) moveDir.z -= 1;
  if (keys.has("KeyA")) moveDir.x += 1;
  if (keys.has("KeyD")) moveDir.x -= 1;
  if (moveDir.lengthSq() > 0) moveDir.normalize();

  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  const forward = new THREE.Vector3(sin, 0, cos);
  const right = new THREE.Vector3(cos, 0, -sin);
  const wish = new THREE.Vector3();
  wish.addScaledVector(forward, moveDir.z);
  wish.addScaledVector(right, moveDir.x);

  if (wish.lengthSq() > 0) {
    wish.normalize().multiplyScalar(speed);
    velocity.x = THREE.MathUtils.lerp(velocity.x, wish.x, 1 - Math.exp(-14 * dt));
    velocity.z = THREE.MathUtils.lerp(velocity.z, wish.z, 1 - Math.exp(-14 * dt));
    player.rotation.y = Math.atan2(wish.x, wish.z);
  } else {
    velocity.x = THREE.MathUtils.lerp(velocity.x, 0, 1 - Math.exp(-12 * dt));
    velocity.z = THREE.MathUtils.lerp(velocity.z, 0, 1 - Math.exp(-12 * dt));
  }

  if (onGround && jump) {
    velocity.y = 6.5;
    onGround = false;
  }
  velocity.y -= 22 * dt;

  player.position.x += velocity.x * dt;
  player.position.z += velocity.z * dt;
  player.position.y += velocity.y * dt;

  const groundY = getGroundHeight(player.position.x, player.position.z, phase);
  if (player.position.y <= groundY) {
    player.position.y = groundY;
    velocity.y = 0;
    onGround = true;
  }

  if (phase === "town") {
    player.position.x = THREE.MathUtils.clamp(player.position.x, TOWN_BOUNDS.minX, TOWN_BOUNDS.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, TOWN_BOUNDS.minZ, TOWN_BOUNDS.maxZ);
    if (player.position.z > 24) {
      player.position.z = 24;
      if (!save.level0Complete) showSubtitle("The path beyond waits for another day.", 2200);
    }
  }

  if (phase === "karaoke") {
    player.position.x = THREE.MathUtils.clamp(player.position.x, -6.5, 6.5);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -5.5, 5.5);
  }
}

function updateCamera() {
  if (phase === "dream") {
    const t = dreamTime * 0.15;
    camera.position.set(Math.sin(t) * 2, 1.5 + Math.sin(t * 0.7) * 0.3, 8 + Math.cos(t) * 1.5);
    camera.lookAt(0, 2, -42);
    return;
  }

  const dist = THREE.MathUtils.clamp(cameraDistance, CAMERA_MIN, CAMERA_MAX);
  const fp = dist <= 0.35;
  const pitch = THREE.MathUtils.clamp(cameraPitch, -0.1, 0.85);
  const ox = Math.sin(cameraYaw) * Math.cos(pitch) * dist;
  const oy = Math.sin(pitch) * dist + (fp ? 1.65 : 1.35);
  const oz = Math.cos(cameraYaw) * Math.cos(pitch) * dist;

  const target = player.position.clone();
  target.y += fp ? 1.65 : 1.35;
  camera.position.set(target.x - ox, target.y + oy * (fp ? 0 : 1), target.z - oz);
  camera.lookAt(target);
}

function drawMinimap() {
  if (phase !== "town") return;
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const scale = 2.2;

  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.fillStyle = "rgba(20, 32, 28, 0.85)";
  minimapCtx.beginPath();
  minimapCtx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
  minimapCtx.fill();

  GATHER_NODES.forEach((node) => {
    const mx = cx + node.x * scale;
    const my = cy + node.z * scale;
    minimapCtx.fillStyle = "rgba(255, 210, 80, 0.85)";
    minimapCtx.beginPath();
    minimapCtx.arc(mx, my, 4, 0, Math.PI * 2);
    minimapCtx.fill();
    minimapCtx.strokeStyle = "rgba(255, 240, 180, 0.5)";
    minimapCtx.lineWidth = 1;
    minimapCtx.stroke();
  });

  TOWN_NPCS.forEach((npc) => {
    const mx = cx + npc.x * scale;
    const my = cy + npc.z * scale;
    minimapCtx.fillStyle = "rgba(143, 220, 245, 0.75)";
    minimapCtx.fillRect(mx - 2, my - 2, 4, 4);
  });

  const px = cx + player.position.x * scale;
  const py = cy + player.position.z * scale;
  minimapCtx.fillStyle = "#ffffff";
  minimapCtx.beginPath();
  minimapCtx.moveTo(px, py - 5);
  minimapCtx.lineTo(px + 4, py + 4);
  minimapCtx.lineTo(px - 4, py + 4);
  minimapCtx.closePath();
  minimapCtx.fill();
}

function updateElevator(dt) {
  if (elevatorTransitioning) return;
  elevatorTime += dt;
  if (elevatorTime > 2.8) {
    elevatorTransitioning = true;
    void (async () => {
      await fadeToBlack(600, 400);
      setPhase("town");
      elevatorTransitioning = false;
      showSubtitle("Dawn over the town. 間.", 4000);
    })();
  }
}

function updateKaraokeAmbience(t) {
  if (phase !== "karaoke" || !karaokeGroup.userData.screen) return;
  const pulse = 0.85 + Math.sin(t * 2.2) * 0.15;
  const screen = karaokeGroup.userData.screen;
  screen.material.emissiveIntensity = 0.45 + Math.sin(t * 1.8) * 0.12;
  if (karaokeGroup.userData.screenGlow) {
    karaokeGroup.userData.screenGlow.intensity = 1.0 + Math.sin(t * 1.8) * 0.25;
  }
  karaokeGroup.userData.neonLights?.forEach((n, i) => {
    if (n.glow) n.glow.intensity = 0.45 + Math.sin(t * 3 + i * 1.4) * 0.12 * pulse;
    if (n.sign?.material) n.sign.material.emissiveIntensity = 0.95 + Math.sin(t * 3 + i) * 0.2;
  });
  if (karaokeGroup.userData.lampLight) {
    karaokeGroup.userData.lampLight.intensity = 1.3 + Math.sin(t * 0.7) * 0.08;
  }
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (phase === "elevator") updateElevator(dt);
  else if (phase !== "dream") handleMovement(dt);

  if (phase === "dream") dreamTime += dt;
  if (phase === "karaoke") updateKaraokeAmbience(clock.elapsedTime);

  updateCamera();
  updateInteractPrompt();
  drawMinimap();
  renderer.render(scene, camera);
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyE") interact();
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 2) rightMouse = true;
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 2) rightMouse = false;
});
window.addEventListener("mousemove", (e) => {
  if (!rightMouse || uiLocked) return;
  cameraYaw -= e.movementX * 0.004;
  cameraPitch += e.movementY * 0.003;
});
canvas.addEventListener("wheel", (e) => {
  cameraDistance += e.deltaY * 0.012;
  cameraDistance = THREE.MathUtils.clamp(cameraDistance, CAMERA_MIN, CAMERA_MAX);
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

ui.noteClose.addEventListener("click", () => {
  ui.note.hidden = true;
  uiLocked = false;
});
ui.dialogueClose.addEventListener("click", hideDialogue);
ui.choiceYes.addEventListener("click", acceptGift);
ui.choiceNo.addEventListener("click", declineGift);

onResize();
window.addEventListener("resize", onResize);

setPhase(phase);
animate();

if (phase === "dream") {
  void runDreamIntro();
} else if (phase === "karaoke" && !save.noteRead) {
  showSubtitle("Something is missing.", 2800);
} else if (phase === "town") {
  spawnTownNpcs();
  updateBagHud();
}

if (location.hash === "#reset") {
  localStorage.removeItem("yugen-gatherer-v1");
  location.hash = "";
  location.reload();
}
