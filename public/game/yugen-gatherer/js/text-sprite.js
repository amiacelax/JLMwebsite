import * as THREE from "three";

const CHAR_CACHE = new Map();

/**
 * Single facing text billboard (MeshBasicMaterial — no lights/shadows).
 */
export function textChar(char, color = "#e8edf5", size = 0.42) {
  const key = `${char}|${color}|${size}`;
  if (!CHAR_CACHE.has(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 96, 96);
    ctx.font = 'bold 56px "Noto Sans JP", "MS Gothic", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(char, 48, 52);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(size, size);
    CHAR_CACHE.set(key, { geo, mat });
  }
  const { geo, mat } = CHAR_CACHE.get(key);
  return new THREE.Mesh(geo, mat);
}

/** Stack chars vertically (pillar, tree trunk). */
export function textColumn(char, color, height, size = 0.38, x = 0, z = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < height; i++) {
    const m = textChar(char, color, size);
    m.position.set(x, i * size * 0.92 + size * 0.5, z);
    g.add(m);
  }
  return g;
}

/** Flat row of chars (lintel, path). */
export function textRow(chars, color, size = 0.38, y = 0, z = 0, spacing = 0.36) {
  const g = new THREE.Group();
  const start = -((chars.length - 1) * spacing) / 2;
  chars.split("").forEach((ch, i) => {
    const m = textChar(ch, color, size);
    m.position.set(start + i * spacing, y, z);
    g.add(m);
  });
  return g;
}

/** Simple 3D text figure (player / NPC). */
export function textFigure(colors) {
  const g = new THREE.Group();
  const head = textChar("◉", colors.skin, 0.36);
  head.position.y = 1.35;
  g.add(head);
  const body = textChar("着", colors.shirt, 0.44);
  body.position.y = 0.82;
  g.add(body);
  const pack = textChar("包", colors.pack, 0.32);
  pack.position.set(0.22, 0.9, -0.08);
  g.add(pack);
  const legL = textChar("|", colors.legs, 0.34);
  legL.position.set(-0.12, 0.28, 0);
  const legR = textChar("|", colors.legs, 0.34);
  legR.position.set(0.12, 0.28, 0);
  g.add(legL, legR);
  const footL = textChar("_", colors.legs, 0.3);
  footL.position.set(-0.14, 0.05, 0.06);
  const footR = textChar("_", colors.legs, 0.3);
  footR.position.set(0.14, 0.05, 0.06);
  g.add(footL, footR);
  return g;
}

/** Torii gate group with season kanji. */
export function textTorii(seasonChar, palette) {
  const g = new THREE.Group();
  const h = 5;
  const spread = 1.35;
  g.add(textColumn("|", palette.pillar, h, 0.4, -spread, 0));
  g.add(textColumn("|", palette.pillar, h, 0.4, spread, 0));
  g.add(textRow("━━━", palette.lintel, 0.42, h * 0.36 + 0.2, 0, 0.38));
  const gate = textChar("門", palette.gate, 0.55);
  gate.position.set(0, h * 0.22 + 0.15, 0.12);
  g.add(gate);
  const season = textChar(seasonChar, palette.season, 0.62);
  season.position.set(0, h * 0.12, 0.18);
  g.add(season);
  g.userData.portalHeight = 2.2;
  return g;
}

/** Scatter ground / meadow text tiles at y≈0. */
export function scatterField(group, {
  chars,
  colors,
  count,
  minX,
  maxX,
  minZ,
  maxZ,
  size = 0.34,
  y = 0.02,
}) {
  for (let i = 0; i < count; i++) {
    const ch = chars[i % chars.length];
    const col = colors[i % colors.length];
    const m = textChar(ch, col, size * (0.9 + (i % 4) * 0.05));
    m.position.set(
      minX + Math.random() * (maxX - minX),
      y + size * 0.45,
      minZ + Math.random() * (maxZ - minZ)
    );
    m.rotation.y = (Math.random() - 0.5) * 0.4;
    group.add(m);
  }
}

/** Tree: trunk column + canopy row. */
export function textTree(x, z, palette) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(textColumn("木", palette.trunk, 3, 0.36, 0, 0));
  const canopy = textRow("木木", palette.leaves, 0.4, 1.35, 0.05, 0.34);
  g.add(canopy);
  const top = textChar("木", palette.leaves, 0.45);
  top.position.set(0, 1.75, 0);
  g.add(top);
  return g;
}
