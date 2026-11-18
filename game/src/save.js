// SOLMAR NIGHTS — save.js
// Save and continue, through localStorage. The save holds the campaign
// state — cash, ammo, the next job, the hidden packages found — and nothing
// else. A private window simply keeps the run for the visit.

import { BEST_KEY, DEFAULT_SETTINGS, MINIMAP_ORDER, SAVE_KEY, SETTINGS_KEY } from './config.js';

/** The player's settings, merged over the defaults and clamped: a stored
 *  value from an older build (or a hand-edited one) can never break the
 *  game — an unknown minimap size falls back to medium, a wild volume to
 *  its nearest edge. */
export function readSettings() {
  const out = { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return out;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return out;
    if (typeof data.music === 'number') out.music = Math.max(0, Math.min(1, data.music));
    if (typeof data.sfx === 'number') out.sfx = Math.max(0, Math.min(1, data.sfx));
    if (MINIMAP_ORDER.includes(data.minimap)) out.minimap = data.minimap;
    if (typeof data.shake === 'boolean') out.shake = data.shake;
    if (typeof data.hints === 'boolean') out.hints = data.hints;
  } catch {
    // Corrupt settings are forgotten, not fatal.
  }
  return out;
}

export function writeSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      music: settings.music,
      sfx: settings.sfx,
      minimap: settings.minimap,
      shake: settings.shake,
      hints: settings.hints,
    }));
    return true;
  } catch {
    return false;
  }
}

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
      armor: G.player.armor,
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
