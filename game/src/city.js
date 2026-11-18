// SOLMAR NIGHTS — city.js
// Procedural Solmar: a road grid the traffic can actually drive, with every
// building placed strictly inside a block interior — never on a road and
// never straddling an intersection. That placement rule is the whole point:
// a building on a road blocks every car behind it forever.
//
// Layout: 8 vertical + 8 horizontal roads (centrelines 240..3600, step 480,
// 96 wide). Between neighbouring roads sits a 384-wide block; buildings live
// in that block inset a further 40 units from the kerb. The south edge is a
// beach, the east edge a marina with a pier, one block is a park.

import { WORLD, ROAD_W, ROADS, DISTRICTS, districtAt } from './config.js';
import { range, int, pick, chance } from './random.js';

const HALF_ROAD = ROAD_W / 2; // 48
const BLOCK_INSET = 40; // building margin inside the block interior

export function isRoadPoint(x, y) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < HALF_ROAD || Math.abs(y - r) < HALF_ROAD) return true;
  }
  return false;
}

// Nearest point on the road network to (x,y), snapped to a lane centre.
export function nearestRoadPoint(x, y) {
  let best = null, bestD = Infinity;
  for (const r of ROADS) {
    for (const [px, py] of [[r, y], [x, r]]) {
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bestD) { bestD = d; best = { x: px, y: py }; }
    }
  }
  return best;
}

// Is (x,y) on a road centreline's lane, and which axis?
export function roadAxisAt(x, y) {
  let dv = Infinity, dh = Infinity;
  for (const r of ROADS) {
    dv = Math.min(dv, Math.abs(x - r));
    dh = Math.min(dh, Math.abs(y - r));
  }
  if (dv < HALF_ROAD && dv <= dh) return 'v';
  if (dh < HALF_ROAD) return 'h';
  return null;
}

export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const parks = [];
  const lights = []; // traffic lights, one per intersection approach set
  const lamps = [];

  // ---- Buildings: one or two per block, deep inside the block interior. ----
  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 7; by++) {
      const district = districtAt(bx, by);
      const d = DISTRICTS[district];
      const x0 = ROADS[bx] + HALF_ROAD + BLOCK_INSET;
      const x1 = ROADS[bx + 1] - HALF_ROAD - BLOCK_INSET;
      const y0 = ROADS[by] + HALF_ROAD + BLOCK_INSET;
      const y1 = ROADS[by + 1] - HALF_ROAD - BLOCK_INSET;
      const bw = x1 - x0, bh = y1 - y0;

      if (district === 'park') {
        parks.push({ x: x0, y: y0, w: bw, h: bh });
        for (let i = 0; i < 26; i++) {
          trees.push({ x: range(rng, x0 + 10, x1 - 10), y: range(rng, y0 + 10, y1 - 10), r: range(rng, 10, 18) });
        }
        continue;
      }
      if (district === 'beach') {
        for (let i = 0; i < 8; i++) {
          trees.push({ x: range(rng, x0, x1), y: range(rng, y0, y1), r: range(rng, 12, 18), palm: true });
        }
        continue;
      }
      // How many buildings fit this block? Downtown gets a tower cluster.
      const count = district === 'downtown' ? int(rng, 2, 4) : (chance(rng, d.density) ? int(rng, 1, 2) : 0);
      if (count === 0) {
        // Empty lot: a few trees and a parking patch.
        for (let i = 0; i < 3; i++) trees.push({ x: range(rng, x0, x1), y: range(rng, y0, y1), r: range(rng, 10, 16) });
        continue;
      }
      const cols = count >= 3 ? 2 : 1;
      const rows = Math.ceil(count / cols);
      const cellW = bw / cols, cellH = bh / rows;
      let placed = 0;
      for (let cx = 0; cx < cols && placed < count; cx++) {
        for (let cy = 0; cy < rows && placed < count; cy++) {
          const w = district === 'downtown' ? range(rng, 90, 130) : range(rng, 100, 170);
          const h = district === 'downtown' ? range(rng, 90, 130) : range(rng, 90, 150);
          const x = x0 + cx * cellW + (cellW - w) / 2 + range(rng, -8, 8);
          const y = y0 + cy * cellH + (cellH - h) / 2 + range(rng, -8, 8);
          buildings.push({
            x, y, w, h,
            district,
            floors: district === 'downtown' ? int(rng, 8, 22) : int(rng, 1, 3),
            roof: pick(rng, d.roof),
            wall: shadeRoof(pick(rng, d.roof)),
          });
          placed++;
        }
      }
      // Street trees around the block edge (on the sidewalk, never on road).
      for (let i = 0; i < 4; i++) {
        trees.push({ x: range(rng, x0 - 20, x1 + 20), y: y0 - 22, r: range(rng, 9, 14) });
        trees.push({ x: range(rng, x0 - 20, x1 + 20), y: y1 + 22, r: range(rng, 9, 14) });
      }
    }
  }

  // ---- Traffic lights: one state per intersection, shared by all cars. ----
  for (let ix = 0; ix < ROADS.length; ix++) {
    for (let iy = 0; iy < ROADS.length; iy++) {
      lights.push({ x: ROADS[ix], y: ROADS[iy], phase: (ix * 7 + iy * 3) % 2, timer: range(rng, 0, 4) });
      lamps.push({ x: ROADS[ix] + 62, y: ROADS[iy] + 62 });
      lamps.push({ x: ROADS[ix] - 62, y: ROADS[iy] - 62 });
    }
  }

  // ---- Shops: fixed, memorable corners. ----
  const shops = [
    { kind: 'gun', name: 'Iron & Lead Guns', x: 1200, y: 1200 },
    { kind: 'spray', name: 'Chroma Spray Shop', x: 2640, y: 1680 },
    { kind: 'diner', name: "Rosa's Diner", x: 720, y: 2640 },
    { kind: 'clothes', name: 'Vestir Clothing', x: 2160, y: 720 },
    { kind: 'armor', name: 'SafeGuard Armor', x: 3120, y: 1200 },
    { kind: 'diner', name: 'Pier Cafe', x: 3600, y: 2640 },
  ];

  // ---- Hidden packages: tucked behind buildings, in alleys, on the pier. ----
  const packages = [];
  const used = new Set();
  let guard = 0;
  while (packages.length < 12 && guard++ < 400) {
    const b = pick(rng, buildings);
    const side = int(rng, 0, 3);
    let px, py;
    if (side === 0) { px = b.x - 26; py = range(rng, b.y, b.y + b.h); }
    else if (side === 1) { px = b.x + b.w + 26; py = range(rng, b.y, b.y + b.h); }
    else if (side === 2) { px = range(rng, b.x, b.x + b.w); py = b.y - 26; }
    else { px = range(rng, b.x, b.x + b.w); py = b.y + b.h + 26; }
    const key = `${Math.round(px / 40)}:${Math.round(py / 40)}`;
    if (used.has(key) || isRoadPoint(px, py)) continue;
    used.add(key);
    packages.push({ x: px, y: py, found: false });
  }
  // Two packages on the marina pier, easy to spot, hard to reach unnoticed.
  packages.push({ x: 3720, y: 2520, found: false });
  packages.push({ x: 3740, y: 2760, found: false });
  while (packages.length > 12) packages.pop();

  // Marina pier: a wooden walkway east of the last road, over the water.
  const pier = { x: 3600, y: 2400, w: 200, h: 480 };

  // Player spawn: outside the diner in Old Town, on the sidewalk.
  const spawn = { x: 720, y: 2560, angle: -Math.PI / 2 };

  return { buildings, trees, parks, lights, lamps, shops, packages, pier, spawn };
}

function shadeRoof(hex) {
  // Darken a roof colour for the wall tone.
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 28);
  const g = Math.max(0, ((n >> 8) & 255) - 28);
  const b = Math.max(0, (n & 255) - 28);
  return `rgb(${r},${g},${b})`;
}

// The nearest building to a point (for package hints / cover checks).
export function nearestBuilding(city, x, y) {
  let best = null, bestD = Infinity;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}
