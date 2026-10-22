/**
 * Seed the glass lexicon (KV overlay) for Situation Cards 3-17 the way JD did cards 1-2:
 * conjugated words are one unit (forced) with the dictionary-form reading + short gloss,
 * nouns get a kana reading + short gloss. Skips anything already in the overlay.
 *
 * Grammar spots (てみる, てやる, てもらう ...) are left alone on purpose - JD edits those.
 *
 *   node scripts/seed-sit-card-lexicon.mjs          # dry run
 *   node scripts/seed-sit-card-lexicon.mjs --apply  # write to live KV
 */
import fs from "fs";

const SITE = "https://japaneselanguagementor.com";
const TEACHER = "jlm";
const APPLY = process.argv.includes("--apply");

/** [surface, reading, definition, force?] */
const ROWS = [
  // 3 seat
  ["席", "せき", "seat"],
  ["人", "ひと", "person"],
  ["取られました", "とる", "to take (取られる = to have it taken from you)", true],
  ["言って", "いう", "to say", true],
  // 4 konbini
  ["お弁当", "おべんとう", "bento, boxed lunch", true],
  ["温めよう", "あたためる", "to warm up, to heat up", true],
  ["したら", "する", "to do (したら = when / if you do)", true],
  ["財布", "さいふ", "wallet"],
  ["忘れた", "わすれる", "to forget", true],
  ["気づきました", "きづく", "to notice, to realize", true],
  ["店員さん", "てんいん", "store clerk (店員 + polite さん)", true],
  ["岩崎", "いわさき", "Iwasaki (surname)"],
  ["言います", "いう", "to say", true],
  // 5 train
  ["友達", "ともだち", "friend"],
  ["りかちゃん", "", "Rika-chan (friend's name + friendly ちゃん)", true],
  ["大事", "だいじ", "important"],
  ["約束", "やくそく", "promise, appointment"],
  ["間に合いません", "まにあう", "to be in time, to make it", true],
  ["次", "つぎ", "next"],
  ["電車", "でんしゃ", "train"],
  ["８分", "はっぷん", "8 minutes", true],
  ["伝えます", "つたえる", "to tell, to convey", true],
  // 6 allergy
  ["色々", "いろいろ", "various, all kinds of"],
  ["食べ物", "たべもの", "food"],
  ["アレルギー", "", "allergy"],
  ["あります", "ある", "to be, to exist (things)", true],
  ["注文", "ちゅうもん", "order (at a restaurant)"],
  ["前", "まえ", "before; in front of"],
  ["ちゃんと", "", "properly, clearly"],
  ["伝えて", "つたえる", "to tell, to convey", true],
  // 7 noise
  ["夜中", "よなか", "middle of the night"],
  ["隣", "となり", "next door, neighbor"],
  ["うるさい", "", "noisy, annoying"],
  // 11 wrong drink
  ["頼んだ", "たのむ", "to ask for, to order", true],
  ["違う", "ちがう", "to be different", true],
  ["飲み物", "のみもの", "drink, beverage"],
  ["来ました", "くる", "to come", true],
  ["怒らず", "おこる", "to get angry (怒らず = without getting angry)", true],
  ["でも", "", "but"],
  ["はっきり", "", "clearly, plainly"],
  // h1 birthday
  ["セラ", "", "Sera (friend's name)"],
  ["誕生日", "たんじょうび", "birthday", true],
  ["プレゼント", "", "present, gift"],
  ["考えて", "かんがえる", "to think, to consider", true],
  ["渡す", "わたす", "to hand over, to give"],
  // h3 thanks
  ["大和", "やまと", "Yamato (surname)"],
  ["ドライヤー", "", "hair dryer"],
  ["買う", "かう", "to buy", true],
  ["とても", "", "very"],
  ["親切", "しんせつ", "kind"],
  ["お礼", "おれい", "thanks, gratitude"],
  // h4 reunion
  ["久しぶり", "ひさしぶり", "long time (no see)"],
  ["会えた", "あう", "to be able to meet (会える = can meet)", true],
  ["家族", "かぞく", "family"],
  ["ばったり", "", "suddenly, unexpectedly (run into)"],
  ["会いました", "あう", "to meet", true],
  ["最初", "さいしょ", "first, beginning"],
  // 12 first meet
  ["初めて", "はじめて", "for the first time"],
  ["会う", "あう", "to meet", true],
  ["自己紹介", "じこしょうかい", "self-introduction", true],
  ["して", "する", "to do"],
  // 13 keychain
  ["向こう", "むこう", "over there, the other side"],
  ["キーホルダー", "", "key chain"],
  ["落としました", "おとす", "to drop", true],
  ["本人", "ほんにん", "the person themselves"],
  ["気づかず", "きづく", "to notice (気づかず = without noticing)", true],
  ["急いで", "いそぐ", "to hurry", true],
  ["歩いて", "あるく", "to walk", true],
  ["行きます", "いく", "to go", true],
  // 14 rain child
  ["雨", "あめ", "rain"],
  ["降っています", "ふる", "to fall (rain, snow)", true],
  ["コンビニ", "", "convenience store"],
  ["傘", "かさ", "umbrella"],
  ["持っていない", "もつ", "to have, to hold (持っていない = not holding)", true],
  ["悲しそう", "かなしい", "sad (悲しそう = looks sad)", true],
  ["子ども", "こども", "child"],
  // 15 rain station
  ["駅", "えき", "station"],
  ["向かって", "むかう", "to head toward", true],
  ["歩いている", "あるく", "to walk", true],
  ["急に", "きゅうに", "suddenly", true],
  ["降り始めました", "ふりはじめる", "to start raining (降る + 始める)", true],
  ["戻る", "もどる", "to go back, to return"],
  ["めんどくさい", "", "a hassle, annoying"],
  // 16 priority seat
  ["優先座席", "ゆうせんざせき", "priority seat", true],
  ["スマホ", "", "smartphone"],
  ["見ている", "みる", "to look at, to watch", true],
  ["若い", "わかい", "young"],
  ["座っています", "すわる", "to sit", true],
  ["妊婦さん", "にんぷさん", "pregnant woman (polite)", true],
  ["立っています", "たつ", "to stand", true],
  ["ゆずって", "ゆずる", "to give up (a seat), to yield", true],
  // 17 lost keys
  ["鍵", "かぎ", "key"],
  ["見つかりません", "みつかる", "to be found", true],
  ["自分", "じぶん", "oneself, myself"],
];

const res = await fetch(SITE + "/api/mg-lexicon");
const live = await res.json();
const overlay = live.overlay || {};
fs.writeFileSync(new URL("../.tmp-mg-overlay-backup.json", import.meta.url), JSON.stringify(live, null, 2), "utf8");

const haveCustom = new Set(Object.keys(overlay.custom || {}));
const haveForced = new Set(overlay.forceUnits || []);
let n = 0;
for (const [surface, reading, definition, force] of ROWS) {
  const needCustom = !haveCustom.has(surface);
  const needForce = force && !haveForced.has(surface);
  if (!needCustom && !needForce) continue;
  n++;
  console.log((APPLY ? "save " : "would save ") + surface + (needForce ? "  [unit]" : "") + (needCustom ? "" : "  (kept your entry)"));
  if (!APPLY) continue;
  const body = { teacherUsername: TEACHER, surface };
  if (needCustom) {
    if (reading) body.reading = reading;
    if (definition) body.definition = definition;
  }
  if (needForce) body.forceUnit = surface;
  const r = await fetch(SITE + "/api/mg-lexicon/patch", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.log("  FAILED", r.status, await r.text());
}
console.log(n + " entries" + (APPLY ? " written" : " (dry run)"));
