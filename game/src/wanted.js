// SOLMAR NIGHTS — wanted.js
// The wanted system: a small visible signal (the stars) over a simple rule —
// a crime only counts when someone sees it. Witnesses are pedestrians and
// police near the crime; a cop who sees the player keeps the chase hot.
// Break line of sight and stay hidden, and the heat cools one star at a
// time; the hotter you are, the longer each star takes to cool.

import { WANTED } from './config.js';
import { circleBlocked, isOnRoad, isSaltKingsTurf } from './city.js';

/** Line of sight between two points: true when no building stands between. */
export function hasLineOfSight(G, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(d / 16));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (circleBlocked(G.city, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 4)) return false;
  }
  return true;
}

export function createWanted() {
  return {
    heat: 0,
    stars: 0,
    hiddenTimer: 0,
    seen: false,
    flash: 0,
    // Where the police last saw the player: when they lose sight they
    // search this spot instead of homing in on the player perfectly.
    lastKnown: null,
  };
}

/** A pedestrian close enough to see the crime. */
function pedWitnessNear(G, x, y, radius) {
  for (const p of G.peds) {
    if (!p.dead && Math.hypot(p.x - x, p.y - y) < radius) return true;
  }
  return false;
}

/** A cop on foot or in a car close enough to see the crime. */
function copWitnessNear(G, x, y, radius) {
  for (const c of G.police) {
    if (!c.dead && Math.hypot(c.x - x, c.y - y) < radius) return true;
  }
  for (const car of G.cars) {
    if (car.ai === 'police' && Math.hypot(car.x - x, car.y - y) < radius) return true;
  }
  return false;
}

export function addCrime(G, kind, x, y) {
  const w = G.wanted;
  const amount = WANTED.CRIME[kind] ?? 10;
  const px = x ?? G.player.x;
  const py = y ?? G.player.y;
  // A cop always counts as a witness; a pedestrian only if close enough.
  // Killing a cop is reported by the radio no matter what. On Salt Kings
  // turf, bystanders look the other way: a pedestrian only counts at half
  // the usual distance, while a cop still counts at full range.
  const onTurf = isSaltKingsTurf(px, py);
  const witnessed = kind === 'killCop'
    || copWitnessNear(G, px, py, WANTED.CRIME_RADIUS)
    || pedWitnessNear(G, px, py, onTurf ? WANTED.CRIME_RADIUS / 2 : WANTED.CRIME_RADIUS);
  if (!witnessed) return false;
  w.heat = Math.min(100, w.heat + amount);
  w.hiddenTimer = 0;
  return true;
}

export function wantedStars(w) {
  let stars = 0;
  for (let i = 1; i <= 5; i++) {
    if (w.heat >= WANTED.HEAT_PER_STAR[i]) stars = i;
  }
  return stars;
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  w.stars = wantedStars(w);
  if (w.stars === 0) {
    w.seen = false;
    w.hiddenTimer = 0;
    return;
  }
  // Does any police unit have eyes on the player right now? Distance alone
  // is not enough: a building between the cop and the player breaks sight,
  // so ducking behind a block is a real way to cool the heat.
  let seen = false;
  const p = G.player;
  for (const car of G.cars) {
    if (car.ai === 'police' && Math.hypot(car.x - p.x, car.y - p.y) < WANTED.SIGHT_RANGE && hasLineOfSight(G, car.x, car.y, p.x, p.y)) { seen = true; break; }
  }
  if (!seen) {
    for (const c of G.police) {
      if (!c.dead && Math.hypot(c.x - p.x, c.y - p.y) < WANTED.SIGHT_RANGE && hasLineOfSight(G, c.x, c.y, p.x, p.y)) { seen = true; break; }
    }
  }
  w.seen = seen;
  if (seen) {
    w.hiddenTimer = 0;
    w.flash = 0;
    w.lastKnown = { x: p.x, y: p.y };
  } else {
    w.hiddenTimer += dt;
    w.flash += dt;
    // Laying low off the streets cools the heat faster: ducking into a
    // block, an alley or a park beats sitting in traffic where patrols
    // cruise past.
    const layLow = !isOnRoad(p.x, p.y);
    const coolAfter = WANTED.HIDE_TIME[w.stars] * (layLow ? 0.7 : 1);
    if (w.hiddenTimer >= coolAfter) {
      w.heat = Math.max(0, w.heat - 25);
      w.hiddenTimer = 0;
      w.stars = wantedStars(w);
      // A cooled star means the chase gives up: the patrols leave.
      G.cars = G.cars.filter((c) => c.ai !== 'police');
      for (const c of G.police) c.dead = true;
      if (w.stars === 0) G.banner = { title: 'HEAT OFF', sub: 'The cops lost you.', t: 0, dur: 2.5 };
    }
  }
}

export function clearWanted(G) {
  G.wanted.heat = 0;
  G.wanted.stars = 0;
  G.wanted.hiddenTimer = 0;
  G.wanted.seen = false;
  G.wanted.lastKnown = null;
}
