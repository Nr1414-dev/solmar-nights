// SOLMAR NIGHTS v2.3 — save.js
// Save / continue / settings through localStorage. The save holds the
// campaign (cash, missions done, weapons, reputation, position) — never
// the live world, which is always rebuilt from the seed. Everything is
// wrapped in try/catch: a browser that blocks storage still plays.

import { BEST_KEY, SAVE_KEY, SETTINGS_KEY } from './config.js';

export const DEFAULT_SETTINGS = {
  music: 0.55,
  sfx: 0.8,
  minimap: 1, // 0 small, 1 medium, 2 large
  shake: true,
  hints: true,
};

export function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function writeSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage blocked */ }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return data;
  } catch { return null; }
}

export function writeSave(G) {
  try {
    const p = G.player;
    const data = {
      version: 3,
      cash: p.cash,
      missionsDone: [...G.campaign.missionsDone],
      reputation: G.campaign.reputation,
      kills: G.campaign.kills,
      carsStolen: G.campaign.carsStolen,
      weapon: p.weapon,
      ammo: p.ammo,
      armor: p.armor,
      outfit: p.outfit,
      x: p.x, y: p.y,
      playSeconds: Math.round(G.time),
      bestStars: G.campaign.bestStars,
      packages: [...G.campaign.packages],
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0; } catch { return 0; }
}

export function saveBest(value) {
  try {
    if (value > readBest()) localStorage.setItem(BEST_KEY, String(value));
  } catch { /* ignore */ }
}
