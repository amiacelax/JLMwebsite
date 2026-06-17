import { SAVE_KEY, defaultSave } from "./data.js";

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return { ...defaultSave(), ...JSON.parse(raw) };
  } catch {
    return defaultSave();
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function resetSave() {
  localStorage.removeItem(SAVE_KEY);
}
