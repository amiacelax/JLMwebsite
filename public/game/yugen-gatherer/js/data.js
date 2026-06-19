export const SAVE_KEY = "yugen-gatherer-v2";

export const ZONES = {
  hub: {
    id: "hub",
    label: "町の中心",
    labelEn: "Town center",
  },
  winter: {
    id: "winter",
    label: "冬 · 雪の里",
    labelEn: "Winter — snow country",
  },
  spring: {
    id: "spring",
    label: "春 · 花の野",
    labelEn: "Spring — wildflower fields",
  },
  summer: {
    id: "summer",
    label: "夏 · 渓の国",
    labelEn: "Summer — sunny falls",
  },
  fall: {
    id: "fall",
    label: "秋 · 紅葉",
    labelEn: "Fall — crimson leaves",
  },
};

/** @typedef {{ zone: string, x: number, y: number, version: number }} YugenSave */

export function defaultSave() {
  return {
    version: 2,
    zone: "hub",
    x: 21,
    y: 16,
  };
}
