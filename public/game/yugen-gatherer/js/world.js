import * as THREE from "three";

const WOOD = 0x6b4f3a;
const WOOD_DARK = 0x4a3628;
const ROOF = 0x3d4a52;
const PAPER = 0xe8e0d0;
const STONE = 0x7a7d80;
const GRASS = 0x4a6b4a;
const PATH = 0x8a7d6a;

function canvasTex(drawFn, w = 256, h = 256, repeat = null) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  drawFn(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function woodTex(dark = false) {
  return canvasTex(
    (ctx, w, h) => {
      const base = dark ? "#3d2b1f" : "#6b4f3a";
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 28; i++) {
        ctx.strokeStyle = dark ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        const y = (i / 28) * h;
        ctx.moveTo(0, y + Math.random() * 3);
        ctx.bezierCurveTo(w * 0.3, y + 4, w * 0.7, y - 2, w, y + 1);
        ctx.stroke();
      }
    },
    256,
    256,
    [2, 2]
  );
}

function fabricTex(hex = "#4a2848") {
  return canvasTex(
    (ctx, w, h) => {
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    },
    128,
    128,
    [3, 3]
  );
}

function carpetTex() {
  return canvasTex(
    (ctx, w, h) => {
      ctx.fillStyle = "#1a1220";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 6) {
        for (let x = 0; x < w; x += 6) {
          const v = 18 + Math.floor(Math.random() * 14);
          ctx.fillStyle = `rgb(${v}, ${v * 0.6}, ${v + 8})`;
          ctx.fillRect(x, y, 5, 5);
        }
      }
    },
    256,
    256,
    [4, 4]
  );
}

function wallTex() {
  return canvasTex(
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#2a1528");
      g.addColorStop(1, "#1a0e18");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.015})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      }
    },
    256,
    256,
    [2, 1]
  );
}

function paperTex() {
  return canvasTex(
    (ctx, w, h) => {
      ctx.fillStyle = "#f4ecd8";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(180,160,130,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = "rgba(40,30,20,0.75)";
      ctx.font = "bold 42px 'Noto Sans JP', serif";
      ctx.textAlign = "center";
      ctx.fillText("さがせ", w / 2, h * 0.55);
      ctx.font = "14px Inter, sans-serif";
      ctx.fillStyle = "rgba(60,50,40,0.45)";
      ctx.fillText("…", w / 2, h * 0.78);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(160,140,100,${Math.random() * 0.08})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      }
    },
    256,
    180
  );
}

function karaokeScreenTex() {
  return canvasTex(
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.6);
      g.addColorStop(0, "#1a2848");
      g.addColorStop(1, "#080810");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(100,180,255,0.25)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const y = 60 + i * 38;
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(w - 40, y + Math.sin(i) * 6);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffeedd";
      ctx.font = "bold 36px 'Noto Sans JP', serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(255,120,180,0.8)";
      ctx.shadowBlur = 18;
      ctx.fillText("カラオケ", w / 2, 72);
      ctx.font = "28px 'Noto Sans JP', serif";
      ctx.fillStyle = "#8fdcf5";
      ctx.shadowColor = "rgba(100,200,255,0.6)";
      ctx.fillText("夜に駆ける", w / 2, h * 0.42);
      ctx.font = "22px 'Noto Sans JP', serif";
      ctx.fillStyle = "rgba(255,220,200,0.85)";
      ctx.shadowBlur = 10;
      ctx.fillText("はるか この先 輝く", w / 2, h * 0.55);
      ctx.fillStyle = "rgba(255,180,220,0.7)";
      ctx.font = "20px 'Noto Sans JP', serif";
      ctx.fillText("光の中へ", w / 2, h * 0.68);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "14px Inter, sans-serif";
      ctx.fillText("♪ now playing", w / 2, h - 28);
    },
    512,
    384
  );
}

function neonSignTex(text, color) {
  return canvasTex(
    (ctx, w, h) => {
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.floor(h * 0.55)}px 'Noto Sans JP', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillText(text, w / 2, h / 2);
    },
    256,
    96
  );
}

function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0,
    map: opts.map ?? null,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

export function makeSky(dawn = false) {
  if (dawn) {
    return new THREE.Color(0xffc896).lerp(new THREE.Color(0x7aa8d8), 0.35);
  }
  return new THREE.Color(0x050810);
}

export function buildDreamScene() {
  const group = new THREE.Group();
  group.name = "dream";

  const starsGeo = new THREE.BufferGeometry();
  const count = 1200;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 80 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  starsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  group.add(
    new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.85 })
    )
  );

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(6, 32, 32),
    stdMat(0x4ecdc4, { emissive: 0x2a8a82, emissiveIntensity: 0.6, roughness: 0.4 })
  );
  planet.position.set(0, 2, -42);
  group.add(planet);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(7.5, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x8fdcf5, transparent: true, opacity: 0.12 })
  );
  halo.position.copy(planet.position);
  group.add(halo);

  return group;
}

function mesh(w, h, d, mat, x, y, z, parent, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;
  if (opts.name) m.name = opts.name;
  if (opts.rotation) m.rotation.set(opts.rotation[0], opts.rotation[1], opts.rotation[2]);
  parent.add(m);
  return m;
}

function roof(w, d, x, y, z, parent) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(0, d * 0.55);
  shape.lineTo(w / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, stdMat(ROOF, { roughness: 0.75 }));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
}

function addNeonSign(parent, text, color, x, y, z, ry = 0, w = 2.2, h = 0.55) {
  const tex = neonSignTex(text, color);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.08),
    stdMat(0x111111, { emissive: new THREE.Color(color), emissiveIntensity: 1.2, map: tex })
  );
  sign.position.set(x, y, z);
  sign.rotation.y = ry;
  parent.add(sign);

  const glow = new THREE.PointLight(color, 0.55, 5);
  glow.position.set(x, y, z + (ry ? 0 : 0.3));
  parent.add(glow);
  return { sign, glow };
}

function addMic(parent, x, y, z, tilt = 0.35) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.38, 10),
    stdMat(0x222222, { metalness: 0.85, roughness: 0.25 })
  );
  body.position.y = 0.19;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 10),
    stdMat(0x888899, { metalness: 0.7, roughness: 0.35 })
  );
  head.position.y = 0.42;
  const grille = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.048, 0.04, 10),
    stdMat(0x444455, { metalness: 0.5, roughness: 0.4 })
  );
  grille.position.y = 0.44;
  g.add(body, head, grille);
  g.rotation.z = tilt;
  g.rotation.x = -0.15;
  parent.add(g);
}

export function buildKaraokeRoom() {
  const group = new THREE.Group();
  group.name = "karaoke";

  const floorMat = stdMat(0xffffff, { map: carpetTex(), roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.18, 12), floorMat);
  floor.position.set(0, 0.09, 0);
  floor.receiveShadow = true;
  group.add(floor);

  const woodPanel = stdMat(0xffffff, { map: woodTex(true), roughness: 0.82 });
  const wallMat = stdMat(0xffffff, { map: wallTex(), roughness: 0.92 });
  const ceilingMat = stdMat(0x120a14, { roughness: 0.95 });

  mesh(14, 0.12, 12, ceilingMat, 0, 3.94, 0, group, { castShadow: false });
  mesh(14, 1.1, 0.22, wallMat, 0, 0.55, -5.89, group);
  mesh(14, 1.1, 0.22, wallMat, 0, 0.55, 5.89, group);
  mesh(0.22, 1.1, 12, wallMat, -6.89, 0.55, 0, group);
  mesh(0.22, 1.1, 12, wallMat, 6.89, 0.55, 0, group);
  mesh(14, 0.55, 0.18, woodPanel, 0, 0.275, -5.82, group);
  mesh(14, 0.55, 0.18, woodPanel, 0, 0.275, 5.82, group);
  mesh(0.18, 0.55, 12, woodPanel, -6.82, 0.275, 0, group);
  mesh(0.18, 0.55, 12, woodPanel, 6.82, 0.275, 0, group);

  const crown = mesh(14, 0.08, 0.35, stdMat(0x2a1828, { roughness: 0.7 }), 0, 3.86, -5.75, group);
  crown.material.emissive = new THREE.Color(0xff44aa);
  crown.material.emissiveIntensity = 0.15;

  const screenTex = karaokeScreenTex();
  const screenFrame = mesh(8.6, 4.9, 0.12, stdMat(0x1a1020, { metalness: 0.4, roughness: 0.5 }), 0, 2.35, -5.72, group);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(8.1, 4.4),
    stdMat(0xffffff, {
      map: screenTex,
      emissive: 0x4466cc,
      emissiveIntensity: 0.55,
      emissiveMap: screenTex,
      roughness: 0.2,
    })
  );
  screen.position.set(0, 2.35, -5.64);
  group.add(screen);

  const screenGlow = new THREE.PointLight(0x6688ff, 1.2, 14);
  screenGlow.position.set(0, 2.4, -4);
  group.add(screenGlow);

  const neonLights = [];
  neonLights.push(addNeonSign(group, "カラオケ", "#ff55aa", -5.5, 3.15, -5.55, 0, 2.4, 0.5));
  neonLights.push(addNeonSign(group, "飲み放題", "#55ddff", 5.5, 3.15, -5.55, 0, 2.4, 0.5));
  neonLights.push(addNeonSign(group, "OPEN", "#88ff88", 5.8, 3.0, 0.2, -Math.PI / 2, 1.4, 0.45));

  const couchMat = stdMat(0xffffff, { map: fabricTex("#4a2848"), roughness: 0.92 });
  const couchBack = mesh(4.8, 0.85, 0.55, couchMat, -1.2, 0.42, 4.2, group);
  const couchSeat = mesh(4.8, 0.42, 1.5, couchMat, -1.2, 0.21, 3.35, group);
  const couchArmL = mesh(0.45, 0.55, 1.5, couchMat, -3.55, 0.28, 3.35, group);
  const couchArmR = mesh(0.45, 0.55, 1.5, couchMat, 1.15, 0.28, 3.35, group);
  const couchSide = mesh(1.5, 0.85, 0.55, couchMat, 1.9, 0.42, 4.2, group);
  const cushion1 = mesh(1.1, 0.12, 0.9, stdMat(0x5a3058, { roughness: 0.9 }), -2.2, 0.48, 3.35, group);
  const cushion2 = mesh(1.1, 0.12, 0.9, stdMat(0x6a3860, { roughness: 0.9 }), -0.2, 0.48, 3.35, group);

  const tableTop = stdMat(0xffffff, { map: woodTex(false), roughness: 0.55 });
  mesh(1.6, 0.08, 0.95, tableTop, 0.2, 0.68, 3.25, group);
  mesh(0.08, 0.62, 0.08, stdMat(0x333333, { metalness: 0.7, roughness: 0.35 }), -0.55, 0.31, 3.55, group);
  mesh(0.08, 0.62, 0.08, stdMat(0x333333, { metalness: 0.7, roughness: 0.35 }), 0.95, 0.31, 2.95, group);
  mesh(0.08, 0.62, 0.08, stdMat(0x333333, { metalness: 0.7, roughness: 0.35 }), 0.95, 0.31, 3.55, group);
  mesh(0.08, 0.62, 0.08, stdMat(0x333333, { metalness: 0.7, roughness: 0.35 }), -0.55, 0.31, 2.95, group);

  const noteTex = paperTex();
  const note = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.012, 0.3),
    stdMat(0xffffff, { map: noteTex, roughness: 0.95 })
  );
  note.position.set(0.3, 0.78, 3.2);
  note.rotation.set(-0.08, 0.15, 0.04);
  note.name = "note";
  note.castShadow = true;
  group.add(note);

  const noteShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.34),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
  );
  noteShadow.rotation.x = -Math.PI / 2;
  noteShadow.position.set(0.3, 0.73, 3.2);
  group.add(noteShadow);

  addMic(group, -0.35, 0.76, 3.45, 0.25);
  addMic(group, 0.75, 0.76, 3.1, -0.2);

  mesh(0.12, 0.22, 0.12, stdMat(0xaa4444, { roughness: 0.4 }), -0.05, 0.8, 3.05, group);
  mesh(0.28, 0.06, 0.14, stdMat(0x222222, { roughness: 0.5 }), 0.55, 0.76, 3.35, group);
  mesh(0.1, 0.14, 0.1, stdMat(0xccccaa, { roughness: 0.3, transparent: true, opacity: 0.75 }), 0.15, 0.8, 2.95, group);
  mesh(0.08, 0.1, 0.08, stdMat(0xccccaa, { roughness: 0.3, transparent: true, opacity: 0.7 }), 0.28, 0.78, 2.98, group);
  mesh(0.35, 0.12, 0.25, stdMat(0x553322, { roughness: 0.85 }), -0.6, 0.78, 3.15, group);

  const machine = mesh(0.55, 0.35, 0.4, stdMat(0x222228, { metalness: 0.5, roughness: 0.4 }), -5.8, 0.18, 2.5, group);
  machine.material.emissive = new THREE.Color(0x224422);
  machine.material.emissiveIntensity = 0.35;
  mesh(0.35, 0.08, 0.25, stdMat(0x111111, { emissive: 0x222244, emissiveIntensity: 0.5 }), -5.8, 0.38, 2.5, group);

  const speakerMat = stdMat(0x1a1a1a, { roughness: 0.85 });
  mesh(0.35, 1.1, 0.3, speakerMat, -6.2, 0.55, -2.5, group);
  mesh(0.35, 1.1, 0.3, speakerMat, 6.2, 0.55, -2.5, group);
  mesh(0.22, 0.22, 0.04, stdMat(0x333333, { metalness: 0.6 }), -6.2, 0.55, -2.34, group);
  mesh(0.22, 0.22, 0.04, stdMat(0x333333, { metalness: 0.6 }), 6.2, 0.55, -2.34, group);

  const lampPole = mesh(0.06, 1.5, 0.06, stdMat(0x3a3028, { metalness: 0.3, roughness: 0.6 }), -5.2, 0.75, 1.8, group);
  const lampShade = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.35, 12, 1, true),
    stdMat(0xc48850, { emissive: 0xffaa66, emissiveIntensity: 0.25, roughness: 0.8, side: THREE.DoubleSide })
  );
  lampShade.position.set(-5.2, 1.58, 1.8);
  group.add(lampShade);
  const lampLight = new THREE.PointLight(0xffaa66, 1.4, 8);
  lampLight.position.set(-5.2, 1.5, 1.8);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(512, 512);
  group.add(lampLight);

  const disco = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 12),
    stdMat(0xcccccc, { metalness: 0.95, roughness: 0.1 })
  );
  disco.position.set(0, 3.72, 0);
  group.add(disco);

  const stripLight = new THREE.PointLight(0xff66aa, 0.35, 10);
  stripLight.position.set(0, 3.5, 0);
  group.add(stripLight);

  const door = mesh(1.4, 2.6, 0.2, stdMat(0xffffff, { map: woodTex(true), roughness: 0.75 }), 6.5, 1.3, 0, group);
  door.name = "exit-door";
  mesh(0.08, 2.4, 1.5, stdMat(0x888888, { metalness: 0.8, roughness: 0.2 }), 6.42, 1.2, 0, group);

  const ambientFill = new THREE.PointLight(0xff8866, 0.25, 16);
  ambientFill.position.set(0, 2.5, 2);
  group.add(ambientFill);

  group.userData.screen = screen;
  group.userData.neonLights = neonLights;
  group.userData.lampLight = lampLight;
  group.userData.screenGlow = screenGlow;

  return group;
}

function buildJapaneseHouse(w, d, x, z, parent, opts = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  if (opts.rotation) g.rotation.y = opts.rotation;

  const wWood = stdMat(0xffffff, { map: woodTex(true), roughness: 0.82 });
  mesh(w, 0.15, d, wWood, 0, 0, 0, g);
  mesh(w * 0.92, 2.2, d * 0.92, stdMat(PAPER, { roughness: 0.9 }), 0, 1.1, 0, g);
  mesh(w * 0.15, 2.2, d * 0.92, stdMat(0xffffff, { map: woodTex(false), roughness: 0.8 }), -w * 0.38, 1.1, 0, g);
  roof(w * 1.05, d * 1.05, 0, 2.35, 0, g);

  if (opts.veranda) {
    mesh(w * 0.35, 0.12, d * 0.5, wWood, w * 0.35, 0.2, 0, g);
  }
  parent.add(g);
  return g;
}

function buildTorii(x, z, parent) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const pillarMat = stdMat(0xcc3322, { roughness: 0.65 });
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.35), pillarMat);
  p1.position.set(-2.2, 2.1, 0);
  p1.castShadow = true;
  const p2 = p1.clone();
  p2.position.x = 2.2;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 0.4), pillarMat);
  lintel.position.y = 3.8;
  lintel.castShadow = true;
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 0.32), pillarMat);
  nuki.position.y = 3.2;
  g.add(p1, p2, lintel, nuki);
  g.name = "torii";
  parent.add(g);
}

function buildShrine(x, z, parent) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  mesh(4, 0.3, 3, stdMat(STONE, { roughness: 0.85 }), 0, 0.15, 0, g);
  mesh(3, 1.8, 2.2, stdMat(PAPER, { roughness: 0.88 }), 0, 1.2, 0, g);
  roof(3.4, 2.6, 0, 2.1, 0, g);
  const rope = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.04, 8, 24),
    stdMat(0xeedd88, { roughness: 0.7 })
  );
  rope.rotation.x = Math.PI / 2;
  rope.position.set(0, 1.6, 1.2);
  g.add(rope);
  parent.add(g);
}

export function buildTown() {
  const group = new THREE.Group();
  group.name = "town";

  const grassTex = canvasTex(
    (ctx, w, h) => {
      ctx.fillStyle = "#3d5c3d";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 800; i++) {
        ctx.fillStyle = `rgba(${50 + Math.random() * 40},${90 + Math.random() * 50},${50 + Math.random() * 30},0.35)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    },
    256,
    256,
    [8, 8]
  );

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    stdMat(0xffffff, { map: grassTex, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const pathMat = stdMat(PATH, { roughness: 0.95 });
  const mainPath = new THREE.Mesh(new THREE.PlaneGeometry(6, 50), pathMat);
  mainPath.rotation.x = -Math.PI / 2;
  mainPath.position.y = 0.02;
  mainPath.receiveShadow = true;
  group.add(mainPath);
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), pathMat);
  cross.rotation.x = -Math.PI / 2;
  cross.position.y = 0.02;
  cross.receiveShadow = true;
  group.add(cross);

  buildJapaneseHouse(5, 4, -12, -8, group, { veranda: true });
  buildJapaneseHouse(4.5, 5, 10, -12, group, { rotation: -0.2 });
  buildJapaneseHouse(5, 4.5, -16, 4, group);
  buildJapaneseHouse(4, 4, 14, 6, group, { rotation: 0.4 });
  buildJapaneseHouse(6, 5, -6, 14, group, { veranda: true });
  buildJapaneseHouse(4.5, 4, 18, -6, group, { rotation: -0.5 });
  buildJapaneseHouse(5, 4, -20, -16, group);
  buildJapaneseHouse(4, 3.5, 8, 18, group);

  buildTorii(0, 26, group);
  buildShrine(-4, 20, group);

  const hillGeo = new THREE.ConeGeometry(22, 14, 8);
  const hillMat = stdMat(0x3d5c3d, { roughness: 1 });
  [-35, 35, -30, 30].forEach((hx, i) => {
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.position.set(hx, 0, i < 2 ? -38 : 38);
    hill.scale.set(1.2, 1, 1.2);
    group.add(hill);
  });

  const trees = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const tx = (Math.random() - 0.5) * 70;
    const tz = (Math.random() - 0.5) * 70;
    if (Math.abs(tx) < 8 && Math.abs(tz) < 8) continue;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6),
      stdMat(WOOD_DARK, { roughness: 0.9 })
    );
    trunk.position.set(tx, 0.6, tz);
    trunk.castShadow = true;
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 2.4, 7),
      stdMat(0x2d5a3d, { roughness: 0.9 })
    );
    crown.position.set(tx, 2.2, tz);
    crown.castShadow = true;
    trees.add(trunk, crown);
  }
  group.add(trees);

  return group;
}

export function buildElevatorInterior() {
  const group = new THREE.Group();
  group.name = "elevator";
  mesh(3, 0.15, 3, stdMat(0x333333, { roughness: 0.85 }), 0, 0, 0, group);
  mesh(3, 3, 0.1, stdMat(0x444444, { metalness: 0.2, roughness: 0.7 }), 0, 1.5, -1.45, group);
  mesh(0.1, 3, 3, stdMat(0x444444, { metalness: 0.2, roughness: 0.7 }), -1.45, 1.5, 0, group);
  mesh(0.1, 3, 3, stdMat(0x444444, { metalness: 0.2, roughness: 0.7 }), 1.45, 1.5, 0, group);
  const panel = mesh(0.5, 0.4, 0.05, stdMat(0x222222, { emissive: 0x224422, emissiveIntensity: 0.4 }), 1.2, 1.2, -1.4, group);
  return group;
}

export function createPlayerMesh() {
  const g = new THREE.Group();
  g.name = "player";

  const legMat = stdMat(0x2a3540, { roughness: 0.85 });
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.45, 4, 8), legMat);
  legL.position.set(-0.14, 0.38, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.14;

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.55, 6, 12),
    stdMat(0x4a5870, { roughness: 0.78 })
  );
  torso.position.y = 1.02;
  torso.castShadow = true;

  const jacket = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.5, 0.38),
    stdMat(0x3d4a62, { roughness: 0.72 })
  );
  jacket.position.set(0, 1.05, 0.02);
  jacket.castShadow = true;

  const collar = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.1, 0.36),
    stdMat(0x5a6878, { roughness: 0.75 })
  );
  collar.position.set(0, 1.32, 0.02);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 14, 14),
    stdMat(0xd4a574, { roughness: 0.72 })
  );
  head.position.y = 1.68;
  head.castShadow = true;

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    stdMat(0x2a2018, { roughness: 0.85 })
  );
  hair.position.set(0, 1.78, -0.02);
  hair.castShadow = true;

  const armL = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.09, 0.38, 4, 8),
    stdMat(0x4a5870, { roughness: 0.8 })
  );
  armL.position.set(-0.38, 1.0, 0);
  armL.rotation.z = 0.15;
  armL.castShadow = true;
  const armR = armL.clone();
  armR.position.x = 0.38;
  armR.rotation.z = -0.15;

  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.42, 0.14),
    stdMat(0x2a4a32, { roughness: 0.62 })
  );
  bag.position.set(-0.3, 1.0, -0.18);
  bag.rotation.y = 0.25;
  bag.castShadow = true;
  const bagStrap = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.35, 0.06),
    stdMat(0x1a3020, { roughness: 0.7 })
  );
  bagStrap.position.set(-0.18, 1.12, -0.05);
  bagStrap.rotation.z = -0.35;

  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), stdMat(0x1a1a1a, { roughness: 0.6 }));
  shoeL.position.set(-0.14, 0.04, 0.04);
  const shoeR = shoeL.clone();
  shoeR.position.x = 0.14;

  g.add(legL, legR, shoeL, shoeR, torso, jacket, collar, armL, armR, head, hair, bag, bagStrap);
  return g;
}

export function createNpcMesh(color = 0x6a5a7a) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.85, 6, 10),
    stdMat(color, { roughness: 0.85 })
  );
  body.position.y = 1.0;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 10),
    stdMat(0xc9a882, { roughness: 0.8 })
  );
  head.position.y = 1.65;
  head.castShadow = true;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    stdMat(0x3a3028, { roughness: 0.85 })
  );
  hair.position.set(0, 1.72, -0.02);
  g.add(body, head, hair);
  return g;
}

export function getGroundHeight(x, z, phase) {
  if (phase === "karaoke" || phase === "elevator") return 0;
  return 0;
}
