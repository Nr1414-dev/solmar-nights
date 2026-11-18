// SOLMAR NIGHTS — save.js
// Save and continue, through localStorage. The save holds the campaign
// state — cash, ammo, the next job, the hidden packages found — and nothing
// else. A private window simply keeps the run for the visit.

import { BEST_KEY, SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(G) {
  try {
    const taken = G.pickups.filter((p) => p.kind === 'package' && p.taken).map((p) => p.id);
    const data = {
      cash: G.player.cash,
      ammo: G.player.ammo,
      missionIndex: G.missionIndex,
      packages: G.stats.packages,
      takenPackages: taken,
      stats: G.stats,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best then lasts this visit only.
  }
}
