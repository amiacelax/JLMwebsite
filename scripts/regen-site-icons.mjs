/**
 * Regenerate JLM favicons / touch icons from the clear jpmentor logo master.
 * - Favicon + PWA sizes: transparent background (keep black mountain outlines)
 * - apple-touch-icon: white fill (iOS paints transparency black)
 * - og-image: left unchanged (share card)
 *
 * Source: jpmentorlogonotype PNG (may still have leftover opaque black bg).
 * Prefer existing alpha; punch remaining near-black bg via color-seed + dilate
 * so mountain outlines stay.
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SOURCE_CANDIDATES = [
  process.env.JLM_LOGO_SOURCE,
  path.join(
    process.env.USERPROFILE || '',
    '.cursor/projects/c-JLM-Website/assets',
    'c__Users_langu_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_jpmentorlogonotype-61464e1a-4c0c-4c7e-92d3-520fe431a0d5.png'
  ),
  path.join(root, 'public', 'images', 'logo-master-source.png'),
].filter(Boolean);

const BLACK_LUMA = 28; // near-black = background / outline candidate
const OUTLINE_DILATE = 14; // reclaim thick black strokes around colored fills

function resolveSource() {
  for (const p of SOURCE_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('No logo source found. Set JLM_LOGO_SOURCE or place logo-master-source.png');
}

function isNearBlack(r, g, b) {
  return r <= BLACK_LUMA && g <= BLACK_LUMA && b <= BLACK_LUMA;
}

function dilateMask(mask, w, h, radius) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) {
        out[i] = 1;
        continue;
      }
      let found = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const r2 = radius * radius;
      outer: for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const dx = xx - x;
          const dy = yy - y;
          if (dx * dx + dy * dy > r2) continue;
          if (mask[yy * w + xx]) {
            found = 1;
            break outer;
          }
        }
      }
      out[i] = found;
    }
  }
  return out;
}

async function makeTransparentLogo(logoPath) {
  const { data, info } = await sharp(logoPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels } = info;
  const mask = new Uint8Array(w * h);

  // Seed: clearly non-black pixels (red sun, blue/white mountain), any alpha
  for (let i = 0; i < w * h; i++) {
    const o = i * channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    if (a > 0 && !isNearBlack(r, g, b)) mask[i] = 1;
  }

  // Grow seed to absorb black outlines that hug the colored shapes
  const keep = dilateMask(mask, w, h, OUTLINE_DILATE);

  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * channels;
    const d = i * 4;
    if (keep[i]) {
      // Preserve original soft edges / alpha on logo pixels
      out[d] = data[o];
      out[d + 1] = data[o + 1];
      out[d + 2] = data[o + 2];
      out[d + 3] = data[o + 3] || 255;
    } else {
      out[d] = 0;
      out[d + 1] = 0;
      out[d + 2] = 0;
      out[d + 3] = 0;
    }
  }

  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png();
}

async function writeSizedPng(pipeline, size, dest, { background, padding = 0.08 } = {}) {
  // Small inset so the mark doesn't kiss the icon edge at tiny sizes
  const inner = Math.max(1, Math.round(size * (1 - padding * 2)));
  let logo = pipeline.clone().resize(inner, inner, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  const logoBuf = await logo.png().toBuffer();

  if (background) {
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background,
      },
    })
      .composite([{ input: logoBuf, gravity: 'centre' }])
      .png()
      .toFile(dest);
  } else {
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: logoBuf, gravity: 'centre' }])
      .png()
      .toFile(dest);
  }
  console.log('wrote', dest);
}

async function main() {
  const logoPath = resolveSource();
  console.log('source', logoPath);

  const images = path.join(root, 'public', 'images');
  const pub = path.join(root, 'public');

  const transparent = await makeTransparentLogo(logoPath);
  const clearBuf = await transparent.png().toBuffer();
  const clear = () => sharp(clearBuf);

  // Clear master for icons (do NOT overwrite in-page logo.png)
  await clear().png().toFile(path.join(images, 'logo-clear.png'));
  console.log('wrote', path.join(images, 'logo-clear.png'));

  // Transparent icons (favicon + PWA)
  await writeSizedPng(clear(), 16, path.join(images, 'favicon-16.png'));
  await writeSizedPng(clear(), 32, path.join(images, 'favicon-32.png'));
  await writeSizedPng(clear(), 32, path.join(pub, 'favicon.png'));
  await writeSizedPng(clear(), 192, path.join(images, 'icon-192.png'));
  await writeSizedPng(clear(), 512, path.join(images, 'icon-512.png'));

  // apple-touch: white fill so iOS doesn't paint black
  await writeSizedPng(clear(), 180, path.join(images, 'apple-touch-icon.png'), {
    background: { r: 255, g: 255, b: 255, alpha: 255 },
  });
  await writeSizedPng(clear(), 180, path.join(pub, 'apple-touch-icon.png'), {
    background: { r: 255, g: 255, b: 255, alpha: 255 },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
