// SOLMAR NIGHTS — save.js
// Save / load to localStorage. Only plain progress data is stored; the city
// is rebuilt from the seed, so a save is a few hundred bytes.

import { SAVE_KEY, SETTINGS_KEY } from './config.js';

export function saveGame(state) {
  try {
    const p = state.player;
    const data = {
      version: 25,
      money: state.money,
      rep: state.rep,
      missionIndex: state.missions.index,
      completed: state.missions.completed,
      packages: state.packagesFound,
      weapons: p.weapons,
      weapon: p.weapon,
      ammo: { mag: p.mag, reserve: p.reserve },
      armor: p.armor,
      health: p.health,
      outfit: p.outfit,
      seed: state.seed,
      time: state.timeHours,
      x: p.x, y: p.y,
      unlocked: state.unlocked,
      stats: state.stats,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 25) return null;
    return data;
  } catch { return null; }
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
