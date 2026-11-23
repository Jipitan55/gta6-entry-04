// Save / continue through localStorage: cash, mission progress and position.
// The save is written when a mission completes and from the pause menu.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: typeof data.cash === 'number' ? data.cash : 150,
      missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
      missionStep: typeof data.missionStep === 'number' ? data.missionStep : 0,
      x: typeof data.x === 'number' ? data.x : 0,
      z: typeof data.z === 'number' ? data.z : 0,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...data, savedAt: Date.now() }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // storage unavailable; nothing to clear
  }
}
