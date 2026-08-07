import { chromium } from "playwright";
import fs from "fs";

const imgPath =
  "C:/Users/langu/.cursor/projects/c-JLM-Website/assets/c__Users_langu_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-34b1f3d9-9b49-4f19-91f5-eb43c7e131a4.png";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Load screenshot as page to inspect red circle region
const b64 = fs.readFileSync(imgPath).toString("base64");
await page.setContent(`<img id="s" src="data:image/png;base64,${b64}" style="image-rendering:auto">`);
const meta = await page.evaluate(async () => {
  const img = document.getElementById("s");
  await new Promise((r) => (img.complete ? r() : (img.onload = r)));
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { width: w, height: h } = c;
  const data = ctx.getImageData(0, 0, w, h).data;
  // Find red circle pixels (high R, low G/B)
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0,
    count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (r > 180 && g < 100 && b < 100 && r - g > 80) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  // Also find green ring (glass) and blue (cloud) centers near red box
  function findBlob(pred) {
    let sx = 0,
      sy = 0,
      n = 0,
      bx0 = w,
      by0 = h,
      bx1 = 0,
      by1 = 0;
    for (let y = Math.max(0, minY - 20); y < Math.min(h, maxY + 20); y++) {
      for (let x = Math.max(0, minX - 20); x < Math.min(w, maxX + 20); x++) {
        const i = (y * w + x) * 4;
        if (pred(data[i], data[i + 1], data[i + 2])) {
          n++;
          sx += x;
          sy += y;
          if (x < bx0) bx0 = x;
          if (y < by0) by0 = y;
          if (x > bx1) bx1 = x;
          if (y > by1) by1 = y;
        }
      }
    }
    if (!n) return null;
    return {
      cx: Math.round(sx / n),
      cy: Math.round(sy / n),
      n,
      box: { x0: bx0, y0: by0, x1: bx1, y1: by1 },
    };
  }
  const green = findBlob((r, g, b) => g > 140 && r < 120 && b < 120);
  const blue = findBlob((r, g, b) => b > 140 && r < 120 && g < 160 && b > g);
  // Find card left edge near mid height of circle: dark card vs darker bg
  return {
    img: { w, h },
    red: count
      ? { minX, minY, maxX, maxY, cx: Math.round((minX + maxX) / 2), cy: Math.round((minY + maxY) / 2), count }
      : null,
    green,
    blue,
  };
});
console.log(JSON.stringify(meta, null, 2));
await browser.close();
