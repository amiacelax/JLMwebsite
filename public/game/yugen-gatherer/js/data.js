export const SAVE_KEY = "yugen-gatherer-v1";

export const NPC_REQUIRED = 7;

export const GIFT_ITEMS = [
  { id: "gold", label: "金", labelEn: "gold ore" },
  { id: "silver", label: "銀", labelEn: "silver ore" },
  { id: "curry", label: "カレー", labelEn: "curry" },
  { id: "chestnut", label: "栗", labelEn: "chestnut" },
  { id: "beetle", label: "かぶとむし", labelEn: "rhinoceros beetle" },
  { id: "frog", label: "カエル", labelEn: "frog" },
  { id: "glasses", label: "メガネ", labelEn: "glasses" },
  { id: "wasabi", label: "わさび", labelEn: "wasabi" },
  { id: "yukata", label: "ゆかた", labelEn: "yukata" },
  { id: "cigarette", label: "タバコ一本", labelEn: "one cigarette" },
];

/** @type {{ id: string, name: string, x: number, z: number, itemIndex: number }[]} */
export const TOWN_NPCS = [
  { id: "npc-a", name: "おばあちゃん", x: -14, z: -6, itemIndex: 3 },
  { id: "npc-b", name: "店主", x: 8, z: -10, itemIndex: 2 },
  { id: "npc-c", name: "学生", x: 16, z: 2, itemIndex: 6 },
  { id: "npc-d", name: "釣り人", x: -20, z: 12, itemIndex: 5 },
  { id: "npc-e", name: "神社の人", x: 0, z: 18, itemIndex: 0 },
  { id: "npc-f", name: "農家", x: -8, z: 14, itemIndex: 4 },
  { id: "npc-g", name: "旅人", x: 22, z: -4, itemIndex: 8 },
  { id: "npc-h", name: "子ども", x: 12, z: 16, itemIndex: 1 },
  { id: "npc-i", name: "画家", x: -18, z: -14, itemIndex: 7 },
  { id: "npc-j", name: "バイト", x: 4, z: -18, itemIndex: 9 },
];

/** Natural gathering nodes for minimap (world coords). */
export const GATHER_NODES = [
  { x: -24, z: 8, kind: "herb" },
  { x: -10, z: 22, kind: "mineral" },
  { x: 6, z: 24, kind: "herb" },
  { x: 20, z: 14, kind: "bug" },
  { x: 24, z: -8, kind: "mineral" },
  { x: -6, z: -22, kind: "herb" },
  { x: 14, z: -20, kind: "mineral" },
  { x: -22, z: -2, kind: "bug" },
  { x: 18, z: 8, kind: "herb" },
  { x: -12, z: 4, kind: "mineral" },
  { x: 2, z: 12, kind: "bug" },
  { x: -16, z: 20, kind: "herb" },
];

export const TOWN_BOUNDS = { minX: -28, maxX: 28, minZ: -28, maxZ: 28 };

export function defaultSave() {
  return {
    phase: "dream",
    noteRead: false,
    inventory: [],
    npcMet: [],
    level0Complete: false,
    dreamSeen: false,
  };
}
