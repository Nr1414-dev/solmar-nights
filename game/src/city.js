// SOLMAR NIGHTS — city.js
// Procedural Solmar: a road grid, buildings, districts, props and shops.
// THE load-bearing rule: buildings only ever sit inside block interiors,
// inset from every road edge, so no building ever stands on a road or an
// intersection and traffic can always drive the full grid.

import { WORLD_SIZE, ROAD_WIDTH, ROAD_LINES, BLOCK_INSET, DISTRICTS, SHOPS } from './config.js';
import { Rng } from './random.js';
import { pointInRect } from './physics.js';

const PALETTES = {
  downtown: ['#5a6d84', '#6d5a84', '#4a6d7a', '#7a6d4a', '#54687e'],
  commercial: ['#8a6a4a', '#7a5a5a', '#6a7a5a', '#9a7a4a'],
  suburb: ['#a08a6a', '#8a9a7a', '#b09a7a', '#7a8a9a'],
  marina: ['#4a7a8a', '#5a8a7a', '#6a7a8a'],
  oldtown: ['#9a7a5a', '#8a6a4a', '#a08a6a', '#7a5a4a'],
  beach: ['#c9b078', '#b09a6a'],
};

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

export function isOnRoad(x, y) {
  const half = ROAD_WIDTH / 2;
  for (const l of ROAD_LINES) {
    if (Math.abs(x - l) <= half || Math.abs(y - l) <= half) return true;
  }
  return false;
}

// Nearest point on a road centre line (used to snap spawns onto roads).
export function nearestRoadPoint(x, y) {
  let best = null, bestD = Infinity;
  for (const l of ROAD_LINES) {
    const d1 = Math.abs(x - l);
    if (d1 < bestD) { bestD = d1; best = { x: l, y, axis: 'v' }; }
    const d2 = Math.abs(y - l);
    if (d2 < bestD) { bestD = d2; best = { x, y: l, axis: 'h' }; }
  }
  return best;
}

export function buildCity(seed) {
  const rng = new Rng(seed);
  const city = {
    buildings: [], trees: [], lamps: [], benches: [],
    lights: [], packages: [], shops: [], parks: [],
    water: [], piers: [],
  };

  // Block edges: world border + both sides of every road.
  const edges = [0];
  for (const l of ROAD_LINES) { edges.push(l - ROAD_WIDTH / 2, l + ROAD_WIDTH / 2); }
  edges.push(WORLD_SIZE);
  edges.sort((a, b) => a - b);

  // Buildings: one or more per block, strictly inside the block interior.
  for (let bx = 0; bx < edges.length - 1; bx += 2) {
    for (let by = 0; by < edges.length - 1; by += 2) {
      const x0 = edges[bx], x1 = edges[bx + 1];
      const y0 = edges[by], y1 = edges[by + 1];
      if (x1 - x0 < 200 || y1 - y0 < 200) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const d = districtAt(cx, cy);
      // Beach strip and marina water: no buildings, sand and sea instead.
      if (y0 >= 3568) continue;
      if (x0 >= 3568) continue;
      if (d.id === 'suburb' && rng.chance(0.22)) {
        city.parks.push({ x: x0 + BLOCK_INSET, y: y0 + BLOCK_INSET, w: x1 - x0 - 2 * BLOCK_INSET, h: y1 - y0 - 2 * BLOCK_INSET });
        for (let i = 0; i < 6; i++) {
          city.trees.push({ x: rng.float(x0 + 60, x1 - 60), y: rng.float(y0 + 60, y1 - 60), r: rng.float(14, 22) });
        }
        continue;
      }
      const palette = PALETTES[d.id] || PALETTES.commercial;
      const count = d.tall ? rng.int(1, 2) : rng.int(1, 3);
      const innerX0 = x0 + BLOCK_INSET, innerY0 = y0 + BLOCK_INSET;
      const innerW = (x1 - x0) - 2 * BLOCK_INSET;
      const innerH = (y1 - y0) - 2 * BLOCK_INSET;
      for (let i = 0; i < count; i++) {
        const w = count === 1 ? innerW * rng.float(0.55, 0.8) : innerW * rng.float(0.3, 0.45);
        const h = count === 1 ? innerH * rng.float(0.55, 0.8) : innerH * rng.float(0.3, 0.45);
        const x = innerX0 + (count === 1 ? (innerW - w) / 2 : rng.float(0, innerW - w));
        const y = innerY0 + (count === 1 ? (innerH - h) / 2 : rng.float(0, innerH - h));
        city.buildings.push({
          x, y, w, h,
          height: d.tall ? rng.int(3, 9) : rng.int(1, 3),
          color: rng.pick(palette),
          roof: rng.pick(['#3a3f46', '#4a4038', '#5a6a5a']),
          windows: rng.int(2, 5),
        });
      }
      // A couple of street trees on the block corners, clear of the road.
      if (rng.chance(0.7)) {
        city.trees.push({ x: x0 + 30, y: y0 + 30, r: 15 });
        city.trees.push({ x: x1 - 30, y: y1 - 30, r: 15 });
      }
    }
  }

  // Traffic lights at every intersection, with staggered cycles.
  for (const lx of ROAD_LINES) {
    for (const ly of ROAD_LINES) {
      city.lights.push({ x: lx, y: ly, phase: rng.float(0, 8), cycle: 16 });
    }
  }
  // Street lamps along the roads.
  for (const l of ROAD_LINES) {
    for (let t = 160; t < WORLD_SIZE; t += 320) {
      city.lamps.push({ x: l + ROAD_WIDTH / 2 + 14, y: t });
      city.lamps.push({ x: t, y: l + ROAD_WIDTH / 2 + 14 });
    }
  }

  // Shops sit on block corners facing the road, never on it.
  for (const s of SHOPS) {
    city.shops.push({ ...s });
  }

  // 12 hidden packages on sidewalks, tucked against block corners.
  const pkgSpots = [
    [400, 400], [900, 1600], [1600, 400], [2300, 900], [2900, 1600],
    [3500, 400], [400, 2300], [900, 2900], [1600, 3500], [2300, 2900],
    [2900, 2300], [3500, 2900],
  ];
  for (const [x, y] of pkgSpots) city.packages.push({ x, y, found: false });

  // Water: sea along the south edge and the marina east edge, with a pier.
  city.water.push({ x: 0, y: 3720, w: WORLD_SIZE, h: 120 });
  city.water.push({ x: 3660, y: 2560, w: 180, h: 1160 });
  city.piers.push({ x: 3520, y: 3180, w: 180, h: 26 });
  city.piers.push({ x: 3520, y: 3400, w: 140, h: 26 });

  return city;
}

// AABB collision against every building; returns the first hit or null.
export function buildingHit(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of buildings; returns corrected position.
export function collideBuildings(city, x, y, r) {
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    } else if (d2 === 0) {
      // Centre inside the building: push out the nearest side.
      const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
      const m = Math.min(left, right, top, bot);
      if (m === left) x = b.x - r; else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r; else y = b.y + b.h + r;
    }
  }
  return { x, y };
}

// Is this point under cover (close to a tall building) — shakes the heli.
export function underCover(city, x, y) {
  for (const b of city.buildings) {
    if (b.height >= 3 && x > b.x - 60 && x < b.x + b.w + 60 && y > b.y - 60 && y < b.y + b.h + 60) return true;
  }
  return false;
}

// Traffic light state at an intersection: 'h' green means horizontal goes.
export function lightState(light, time) {
  const t = (time + light.phase) % light.cycle;
  return t < light.cycle / 2 ? 'h' : 'v';
}

export function nearestShop(city, x, y, maxD = 130) {
  let best = null, bestD = maxD;
  for (const s of city.shops) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
