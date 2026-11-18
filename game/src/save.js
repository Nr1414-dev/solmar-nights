// SOLMAR NIGHTS — save.js
// localStorage save/load. The save is a small JSON snapshot of the player's
// progress (money, weapons, mission progress, packages, position, reputation)
// — never the whole world, so a save from an older build still loads.

import { SAVE_KEY } from './config.js';

export function saveGame(world) {
  try {
    const p = world.player;
    const data = {
      v: 2,
      money: p.money,
      hp: p.hp,
      x: p.x, y: p.y,
      weapons: p.weapons,
      ammo: p.ammo,
      weapon: p.weapon,
      outfit: p.outfit,
      unlockedCars: p.unlockedCars,
      missionIndex: world.mission.index,
      completedCount: world.mission.completedCount,
      packages: world.city.packages.map((pk) => pk.found),
      reputation: world.stats.reputation,
      kills: world.stats.kills,
      carsStolen: world.stats.carsStolen,
      fares: world.stats.fares,
      time: world.time,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 2) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
}

export function hasSave() {
  return loadGame() !== null;
}

export function applySave(world, data) {
  const p = world.player;
  p.money = data.money ?? p.money;
  p.hp = data.hp ?? p.hp;
  p.x = data.x ?? p.x;
  p.y = data.y ?? p.y;
  p.weapons = { ...p.weapons, ...(data.weapons || {}) };
  p.ammo = { ...p.ammo, ...(data.ammo || {}) };
  p.weapon = data.weapon || p.weapon;
  p.outfit = data.outfit ?? p.outfit;
  p.unlockedCars = data.unlockedCars || p.unlockedCars;
  world.mission.index = data.missionIndex ?? 0;
  world.mission.completedCount = data.completedCount ?? 0;
  if (Array.isArray(data.packages)) {
    data.packages.forEach((found, i) => {
      if (world.city.packages[i]) world.city.packages[i].found = !!found;
    });
  }
  world.stats.reputation = data.reputation ?? 0;
  world.stats.kills = data.kills ?? 0;
  world.stats.carsStolen = data.carsStolen ?? 0;
  world.stats.fares = data.fares ?? 0;
  world.time = data.time ?? world.time;
}
