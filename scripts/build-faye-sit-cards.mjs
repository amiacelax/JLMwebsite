/**
 * Build Situation Cards — HTML decks + PNGs for PowerPoint.
 *
 * Two variants (kept separate on purpose):
 * - ws  → English chrome for Homework Hub worksheets later
 *         public/preview/faye-sit-cards/ + faye-sit-cards-lesson.html
 * - jp  → clean lesson cards for Faye (状況カード only)
 *         public/preview/faye-sit-cards-jp/ + faye-sit-cards-lesson-jp.html
 *
 * Run: node scripts/build-faye-sit-cards.mjs
 *      node scripts/build-faye-sit-cards.mjs jp
 *      node scripts/build-faye-sit-cards.mjs ws
 *      node scripts/build-faye-sit-cards.mjs both
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, "public/homework/media/faye-situation-cards-1");
const TMP_EXPORT = path.join(ROOT, "preview/.tmp-sit-export");

const CARDS = [
  {
    n: "01",
    label: "1 · Fever",
    image: "sit-1-fever.png",
    text: "あなたは今起きました。頭を触ってみるとやっぱりあつい。まず、どうしますか？",
  },
  {
    n: "02",
    label: "2 · Doctor",
    image: "sit-2-doctor.png",
    text: "熱が40度を越えてしまいました。どうしますか？",
  },
  {
    n: "03",
    label: "3 · Seat",
    image: "sit-3-seat.png",
    text: "あなたの席がこの人に取られました。言ってやってください！",
  },
  {
    n: "04",
    label: "4 · Konbini",
    image: "sit-4-konbini.png",
    text: "お弁当を温めようとしたら、財布を家に忘れたことに気づきました。店員さんの岩崎さんに何と言いますか？",
  },
  {
    n: "05",
    label: "5 · Train",
    image: "sit-5-train.png",
    text: "友達のりかちゃんとの大事な約束に間に合いません。次の電車まで８分。友達に何を伝えますか？",
  },
  {
    n: "06",
    label: "6 · Allergy",
    image: "sit-6-restaurant.png",
    text: "色々な食べ物のアレルギーがあります。注文の前に、店員さんにちゃんと伝えてください。",
  },
  {
    n: "07",
    label: "7 · Noise",
    image: "sit-7-noise.png",
    text: "夜中なのに隣がうるさいです。明日仕事があります。どうしますか？言ってみてください。",
  },
  {
    n: "08",
    label: "11 · Cafe",
    image: "sit-11-cafe.png",
    text: "頼んだものと違う飲み物が来ました。怒らずに、でもはっきり言ってください。",
  },
  {
    n: "09",
    label: "H1 · Birthday",
    image: "sit-h1-birthday.png",
    text: "今日は友達のセラさんの誕生日です。大事なプレゼントを考えて買ったんだけど、渡す前に何と言いますか？",
  },
  {
    n: "10",
    label: "H3 · Thanks",
    image: "sit-h3-thanks.png",
    text: "店員さんの大和さんがドライヤーを買うのにとても親切でした。お礼を言ってください。",
  },
  {
    n: "11",
    label: "H4 · Reunion",
    image: "sit-h4-reunion.png",
    text: "久しぶりに会えた友達の家族とばったり会いました。最初に何と言いますか？",
  },
];

const CARD_CSS = `
:root {
  --navy: #1a2744;
  --navy-soft: #243556;
  --cream: #faf6ef;
  --paper: #fffdf9;
  --line: #d4dce8;
  --muted: #6b7a92;
  --accent: #c9a227;
  --card-w: 420px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", system-ui, sans-serif;
  background: #eef2f8;
  color: var(--navy);
}
body.single {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: #fff;
}
.deck-head {
  max-width: 920px;
  margin: 0 auto 1.25rem;
  padding: 1.5rem 1rem 0;
  text-align: center;
}
.deck-head h1 { font-size: 1.1rem; margin: 0 0 0.35rem; }
.deck-head p { margin: 0; font-size: 0.82rem; color: var(--muted); }
.deck {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
  padding: 0 1.5rem 3rem;
  max-width: 1400px;
  margin: 0 auto;
  align-items: stretch;
}
@media (min-width: 900px) {
  .deck {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (min-width: 1200px) {
  .deck {
    grid-template-columns: repeat(4, 1fr);
  }
}
.sit-card {
  width: 100%;
  max-width: none;
  min-height: 0;
  height: 100%;
  background: #1a2744;
  border-radius: 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #e8edf5;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, outline-color 0.15s ease;
}
.sit-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.42);
}
.sit-card:focus {
  outline: 2px solid #d4a853;
  outline-offset: 3px;
}
.sit-card.is-copied {
  outline: 2px solid #4ade80;
  outline-offset: 3px;
}
body.single .sit-card {
  width: var(--card-w);
  min-height: 560px;
  cursor: default;
}
.sit-card--jp {
  min-height: 0;
}
body.single .sit-card--jp {
  min-height: 560px;
}
.sit-card__head {
  padding: 0.85rem 1.1rem 0.65rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: #161f35;
}
.sit-card__head--jp {
  justify-content: flex-start;
}
.sit-card__eyebrow {
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #d4a853;
}
.sit-card__eyebrow--jp {
  font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  text-transform: none;
  color: #d4a853;
}
.sit-card__num {
  font-size: 0.72rem;
  color: #94a3b8;
}
.sit-card__image {
  height: 180px;
  margin: 0.85rem 0.9rem 0;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #0f1629;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
body.single .sit-card__image {
  height: 240px;
  margin: 1rem 1.1rem 0;
}
.sit-card__image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.sit-card__body {
  flex: 1;
  padding: 1.15rem 1.25rem 1.35rem;
}
.sit-card__body--jp {
  padding: 1.35rem 1.25rem 1.5rem;
}
.sit-card__label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 0.5rem;
}
.sit-card__text {
  font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
  font-size: 1.05rem;
  line-height: 1.75;
  color: #e8edf5;
  margin: 0;
  user-select: text;
  -webkit-user-select: text;
  pointer-events: none;
}
.sit-card__foot {
  padding: 0.65rem 1.1rem 0.85rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: #94a3b8;
  background: #161f35;
}
@media print {
  .deck-head { display: none; }
  .deck {
    display: block;
    max-width: none;
    padding: 0;
  }
  .sit-card {
    box-shadow: none;
    page-break-after: always;
    break-after: page;
    margin: 0 auto;
    width: var(--card-w);
    max-width: var(--card-w);
  }
}
`;

function cardInner(card, imgSrc, variant) {
  if (variant === "jp") {
    return `
  <article class="sit-card sit-card--jp" id="card" title="クリックでコピー" tabindex="0" role="button">
    <header class="sit-card__head sit-card__head--jp">
      <span class="sit-card__eyebrow sit-card__eyebrow--jp">状況カード</span>
    </header>
    <div class="sit-card__image">
      <img src="${imgSrc}" alt="">
    </div>
    <div class="sit-card__body sit-card__body--jp">
      <p class="sit-card__text">${card.text}</p>
    </div>
  </article>`;
  }
  return `
  <article class="sit-card" id="card" title="クリックでコピー" tabindex="0" role="button">
    <header class="sit-card__head">
      <span class="sit-card__eyebrow">Situation Card</span>
      <span class="sit-card__num">${card.label}</span>
    </header>
    <div class="sit-card__image">
      <img src="${imgSrc}" alt="">
    </div>
    <div class="sit-card__body">
      <div class="sit-card__label">What do you say?</div>
      <p class="sit-card__text">${card.text}</p>
    </div>
    <footer class="sit-card__foot">
      <span>Japanese Language Mentor</span>
      <span>Homework Hub</span>
    </footer>
  </article>`;
}

function cardHtml(card, imgSrc, opts = {}) {
  const variant = opts.variant || "ws";
  const single = opts.single ? ' class="single"' : "";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Situation Card ${card.n}</title>
  <style>${CARD_CSS}</style>
</head>
<body${single}>
${cardInner(card, imgSrc, variant)}
</body>
</html>`;
}

function deckHtml(variant) {
  const isJp = variant === "jp";
  const title = isJp
    ? "Faye — 状況カード"
    : "Faye — Situation Cards (WS English)";
  const pngFolder = isJp ? "/preview/faye-sit-cards-jp/" : "/preview/faye-sit-cards/";
  const hint = isJp
    ? `Drag PNGs from <code>${pngFolder}</code> into PowerPoint`
    : `WS English version (keep for Homework Hub later) · PNGs in <code>${pngFolder}</code>`;

  const cards = CARDS.map((c) => {
    const img = `../homework/media/faye-situation-cards-1/${c.image}`;
    return cardInner(c, img, variant).replace(' id="card"', ` data-card="${c.n}"`);
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${CARD_CSS}</style>
</head>
<body>
  <header class="deck-head">
    <h1>${title}</h1>
    <p>${hint} · <strong>カードをクリック → PNGをコピー</strong>（PowerPointに Ctrl+V）</p>
  </header>
  <main class="deck">${cards}</main>
  <script>
    (function () {
      const variant = ${JSON.stringify(variant)};
      const pngBase =
        variant === "jp" ? "faye-sit-cards-jp/card-" : "faye-sit-cards/card-";

      async function copyCardPng(card) {
        const n = card.getAttribute("data-card");
        if (!n) return;
        const url = pngBase + n + ".png";
        let ok = false;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error("fetch " + res.status);
          const blob = await res.blob();
          if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
            await navigator.clipboard.write([
              new ClipboardItem({ [blob.type || "image/png"]: blob }),
            ]);
            ok = true;
          } else {
            // file:// or no ClipboardItem — download instead
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "card-" + n + ".png";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            ok = true;
            card.setAttribute("title", "PNGを保存しました");
            card.classList.add("is-copied");
            setTimeout(() => {
              card.classList.remove("is-copied");
              card.setAttribute("title", "クリックでPNGコピー");
            }, 1200);
            return;
          }
        } catch (err) {
          console.warn(err);
          // Last resort: open PNG in new tab
          window.open(url, "_blank");
        }
        card.classList.add("is-copied");
        card.setAttribute("title", ok ? "PNGをコピーしました — Ctrl+V" : "PNGを開きました");
        setTimeout(() => {
          card.classList.remove("is-copied");
          card.setAttribute("title", "クリックでPNGコピー");
        }, 1200);
      }

      document.querySelectorAll(".sit-card").forEach((card) => {
        card.setAttribute("title", "クリックでPNGコピー");
        card.addEventListener("click", () => copyCardPng(card));
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            copyCardPng(card);
          }
        });
      });
    })();
  </script>
</body>
</html>`;
}

function findChrome() {
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return paths.find((p) => fs.existsSync(p));
}

function pathsFor(variant) {
  if (variant === "jp") {
    return {
      // Main lesson page Faye opens — clean 状況カード cards
      html: path.join(ROOT, "public/preview/faye-sit-cards-lesson.html"),
      htmlAlias: path.join(ROOT, "public/preview/faye-sit-cards-lesson-jp.html"),
      pngDir: path.join(ROOT, "public/preview/faye-sit-cards-jp"),
      localHtml: path.join(ROOT, "preview/faye-sit-cards-lesson.html"),
      localHtmlAlias: path.join(ROOT, "preview/faye-sit-cards-lesson-jp.html"),
      localPng: path.join(ROOT, "preview/faye-sit-cards-jp"),
    };
  }
  return {
    // English chrome — keep for Homework Hub worksheets later
    html: path.join(ROOT, "public/preview/faye-sit-cards-lesson-ws.html"),
    pngDir: path.join(ROOT, "public/preview/faye-sit-cards"),
    localHtml: path.join(ROOT, "preview/faye-sit-cards-lesson-ws.html"),
    localPng: path.join(ROOT, "preview/faye-sit-cards"),
  };
}

function writeLocalHtml(p) {
  fs.mkdirSync(path.dirname(p.localHtml), { recursive: true });
  // Root preview/ is one level shallower than public/preview/ — fix image paths for file://
  const localHtmlBody = fs
    .readFileSync(p.html, "utf8")
    .replaceAll(
      "../homework/media/faye-situation-cards-1/",
      "../public/homework/media/faye-situation-cards-1/"
    );
  fs.writeFileSync(p.localHtml, localHtmlBody, "utf8");
  console.log("Copied local", p.localHtml);
  if (p.htmlAlias) {
    fs.copyFileSync(p.html, p.htmlAlias);
    console.log("Alias", p.htmlAlias);
  }
  if (p.localHtmlAlias) {
    fs.writeFileSync(p.localHtmlAlias, localHtmlBody, "utf8");
  }
}

function buildVariant(variant, chrome, htmlOnly) {
  const p = pathsFor(variant);
  fs.mkdirSync(p.pngDir, { recursive: true });
  fs.mkdirSync(TMP_EXPORT, { recursive: true });
  fs.writeFileSync(p.html, deckHtml(variant), "utf8");
  console.log("Wrote", p.html);

  writeLocalHtml(p);

  if (htmlOnly) return;

  if (!chrome) {
    console.warn("Chrome/Edge not found — skipped PNG export for", variant);
    return;
  }

  for (const card of CARDS) {
    const imgPath = path.join(MEDIA, card.image);
    if (!fs.existsSync(imgPath)) {
      console.error("Missing image:", imgPath);
      continue;
    }
    const imgFileUrl =
      "file:///" + imgPath.replace(/\\/g, "/").replace(/ /g, "%20");
    const tmpHtml = path.join(TMP_EXPORT, `${variant}-card-${card.n}.html`);
    const outPng = path.join(p.pngDir, `card-${card.n}.png`);
    fs.writeFileSync(
      tmpHtml,
      cardHtml(card, imgFileUrl, { single: true, variant }),
      "utf8"
    );
    const htmlUrl =
      "file:///" + tmpHtml.replace(/\\/g, "/").replace(/ /g, "%20");
    try {
      execFileSync(
        chrome,
        [
          "--headless=new",
          "--disable-gpu",
          "--hide-scrollbars",
          "--window-size=460,680",
          `--screenshot=${outPng}`,
          htmlUrl,
        ],
        { stdio: "pipe" }
      );
      console.log("PNG", outPng);
    } catch (e) {
      console.error("PNG fail", variant, card.n, e.message);
    }
  }

  writeLocalHtml(p);
  fs.mkdirSync(p.localPng, { recursive: true });
  for (const f of fs.readdirSync(p.pngDir)) {
    if (f.endsWith(".png")) {
      fs.copyFileSync(path.join(p.pngDir, f), path.join(p.localPng, f));
    }
  }
  console.log("Copied local PNGs", p.localPng);
}

const args = process.argv.slice(2).map((a) => String(a).toLowerCase());
const htmlOnly = args.includes("--html-only");
const mode = args.find((a) => a === "both" || a === "ws" || a === "jp") || "jp";
const variants = mode === "both" ? ["ws", "jp"] : mode === "ws" ? ["ws"] : ["jp"];

const chrome = htmlOnly ? null : findChrome();
for (const v of variants) buildVariant(v, chrome, htmlOnly);
