// SOLMAR NIGHTS — wanted.js
// The six-star wanted system. Four star states, five independent evidence
// flags, and crimes that only count when somebody sees them.
//
// States:
//   hollow   — a crime was reported, but police have no description yet.
//              Cops drive toward the scene; they do not know who you are.
//   solid    — a cop (or camera) has eyes on you right now: active chase.
//   flashing — line of sight broke: cops search your last seen position.
//   red      — you escaped, but the area is "hot" and police remember your
//              description. Walk back in looking the same and the chase
//              restarts at once.
// Evidence (each cleared its own way):
//   cctv    — clears by waiting out the tape (60s without new crimes).
//   outfit  — clears by changing clothes at Vestir.
//   face    — clears by leaving the hot area + staying out of sight.
//   car     — clears by respraying at Chroma, or ditching the car.
//   weapon  — clears by holstering / switching to fists for a while.

import { clamp } from './random.js';

export function createWanted() {
  return {
    stars: 0,
    state: 'none', // none | hollow | solid | flashing | red
    heat: 0, // 0..100, feeds star level
    lastSeen: { x: 0, y: 0 },
    hot: null, // {x, y, r} hot area while red
    evidence: { cctv: false, outfit: false, face: false, car: false, weapon: false },
    searchTimer: 0, // flashing: seconds left searching lastSeen
    coolTimer: 0, // red: seconds until the heat fully dies
    cctvTimer: 0, // seconds until the CCTV tape expires
    weaponTimer: 0, // seconds since weapon last fired
    seenTimer: 0, // seconds of continuous line of sight
    reportTimer: 0, // hollow: seconds until the report is filed
  };
}

// A crime happened. `witnessed` means a pedestrian, cop or camera actually
// saw it (or heard the shot). Unwitnessed crimes never touch the wanted
// level — that is the core stealth rule of the game.
export function addCrime(world, kind, x, y, witnessed) {
  const w = world.wanted;
  if (!witnessed) return;
  const heatGain = { shot: 22, kill: 30, steal: 14, assault: 18, speeding: 0 }[kind] ?? 10;
  w.heat = clamp(w.heat + heatGain, 0, 100);
  w.lastSeen = { x, y };
  if (kind === 'shot' || kind === 'kill') {
    w.evidence.weapon = true;
    w.weaponTimer = 0;
    w.evidence.cctv = true;
    w.cctvTimer = 0;
  }
  if (kind === 'kill') w.evidence.face = true;
  if (kind === 'steal') w.evidence.car = true;
  if (world.player.inCar) w.evidence.car = true;
  if (w.stars === 0) {
    w.state = 'hollow';
    w.reportTimer = 2.5; // the witness phones it in; cops arrive after this
  } else if (w.state === 'red') {
    // Seen again while hot: straight back to a chase.
    w.state = 'solid';
    w.seenTimer = 0;
  }
  recomputeStars(world);
}

export function recomputeStars(world) {
  const w = world.wanted;
  const fromHeat = w.heat <= 0 ? 0 : w.heat < 12 ? 1 : w.heat < 26 ? 2 : w.heat < 42 ? 3 : w.heat < 60 ? 4 : w.heat < 82 ? 5 : 6;
  w.stars = fromHeat;
  if (w.stars === 0) {
    w.state = 'none';
    w.hot = null;
  }
}

// Called every frame. Handles state transitions, timers and decay.
export function updateWanted(world, dt) {
  const w = world.wanted;
  const p = world.player;
  if (w.stars === 0) return;

  // --- line of sight: any cop / heli close enough with a clear view ---
  const seen = policeCanSee(world);
  if (seen) {
    w.seenTimer += dt;
    w.lastSeen = { x: p.x, y: p.y };
    if (w.state === 'hollow' || w.state === 'flashing' || w.state === 'red') {
      w.state = 'solid';
    }
  } else {
    w.seenTimer = Math.max(0, w.seenTimer - dt * 2);
  }

  if (w.state === 'hollow') {
    w.reportTimer -= dt;
    if (w.reportTimer <= 0) {
      // Report filed: if the player is still near the scene, cops identify
      // them; otherwise the report goes cold and heat decays.
      const d = Math.hypot(p.x - w.lastSeen.x, p.y - w.lastSeen.y);
      if (d < 700) { w.state = 'solid'; }
      else { w.heat = Math.max(0, w.heat - 6 * dt); recomputeStars(world); }
    }
  } else if (w.state === 'solid') {
    if (!seen) {
      w.state = 'flashing';
      w.searchTimer = 9;
    }
  } else if (w.state === 'flashing') {
    w.searchTimer -= dt;
    if (seen) { w.state = 'solid'; }
    else if (w.searchTimer <= 0) {
      // Escaped the search: area goes hot, description remembered.
      w.state = 'red';
      w.hot = { x: w.lastSeen.x, y: w.lastSeen.y, r: 620 };
      w.coolTimer = 45;
    }
  } else if (w.state === 'red') {
    w.coolTimer -= dt;
    // Walking back into the hot area while the description is remembered
    // restarts the chase — unless the outfit/face evidence is cleared.
    const inHot = w.hot && Math.hypot(p.x - w.hot.x, p.y - w.hot.y) < w.hot.r;
    if (inHot && (w.evidence.outfit || w.evidence.face) && seen) {
      w.state = 'solid';
    }
    if (w.coolTimer <= 0) {
      w.heat = Math.max(0, w.heat - 25);
      w.evidence.face = false;
      w.hot = null;
      recomputeStars(world);
      if (w.stars > 0) { w.state = 'red'; w.coolTimer = 30; w.hot = { x: p.x, y: p.y, r: 500 }; }
    }
  }

  // --- evidence timers ---
  if (w.evidence.cctv) {
    w.cctvTimer += dt;
    if (w.cctvTimer > 60) { w.evidence.cctv = false; w.cctvTimer = 0; }
  }
  if (w.evidence.weapon) {
    w.weaponTimer += dt;
    if (w.weaponTimer > 40) { w.evidence.weapon = false; }
  }
  // Passive heat decay only while nobody can see you.
  if (!seen && w.state !== 'solid') {
    w.heat = Math.max(0, w.heat - 0.55 * dt);
    if (w.heat <= 0) { w.stars = 0; w.state = 'none'; w.hot = null; }
    else recomputeStars(world);
  }
}

// True when any on-duty cop or the helicopter has line of sight. Distance
// based; buildings block sight for cops on foot, the heli sees over them
// unless the player is under a roof (checked by the caller via cover).
export function policeCanSee(world) {
  const p = world.player;
  for (const c of world.cops) {
    if (c.hp <= 0) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    const range = c.inCar ? 720 : 520;
    if (d < range && hasLineOfSight(world, c.x, c.y, p.x, p.y)) return true;
  }
  if (world.heli && world.heli.active) {
    const d = Math.hypot(world.heli.x - p.x, world.heli.y - p.y);
    if (d < 900 && !world.player.underCover) return true;
  }
  return false;
}

// Sampled line-of-sight: step along the segment, reject if inside a building.
export function hasLineOfSight(world, x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 40);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
    for (const b of world.city.buildings) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return false;
    }
  }
  return true;
}

// --- evidence clearing, each with its own action (called by shops/world) ---
export function clearOutfitEvidence(world) {
  world.wanted.evidence.outfit = false;
  world.wanted.evidence.face = false;
  world.player.outfit = (world.player.outfit + 1) % 5;
}

export function clearCarEvidence(world) {
  world.wanted.evidence.car = false;
  const car = world.player.inCar;
  if (car) car.color = pickFreshColor(world);
}

export function pickFreshColor(world) {
  const palette = ['#c23b2e', '#2e6bc2', '#e8b81a', '#2e8c5a', '#8c2e7a', '#e8e8e8'];
  return palette[Math.floor(world.rng() * palette.length)];
}

// Bribing / laying low: pay to cut heat (diner "lay low" is a story beat;
// the spray shop and clothes shop handle their own evidence).
export function layLow(world, cost) {
  const w = world.wanted;
  if (world.player.money < cost || w.stars === 0) return false;
  world.player.money -= cost;
  w.heat = Math.max(0, w.heat - 30);
  recomputeStars(world);
  return true;
}
