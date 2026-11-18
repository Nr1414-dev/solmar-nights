// SOLMAR NIGHTS — city.js
// The city is generated, not drawn: a seeded generator lays out the road grid,
// the blocks, the buildings, the props and the landmarks, so the same seed
// always builds the same Solmar. Every system reads this one layout — traffic
// follows its roads, pedestrians walk its sidewalks, the minimap draws it.

import { FIRST_ROAD, LAST_ROAD, PALETTE, ROAD_PITCH, ROAD_W, WORLD } from './config.js';
import { createRandom, clamp } from './random.js';

export const ROAD_CENTRES = [];
for (let c = FIRST_ROAD; c <= LAST_ROAD; c += ROAD_PITCH) ROAD_CENTRES.push(c);

export const DISTRICTS = {
  beach: 'Marina Beach',
  hills: 'Hills Park',
  docks: 'The Docks',
  oldtown: 'Old Town',
  downtown: 'Downtown',
  midtown: 'Midtown',
};

export function districtAt(x, y) {
  if (x < 432) return 'beach';
  if (x > WORLD - 432) return 'docks';
  if (y < 432) return 'hills';
  if (y > WORLD - 432) return 'oldtown';
  if (x > 1300 && x < 2540 && y > 1300 && y < 2540) return 'downtown';
  return 'midtown';
}

export function districtNameAt(x, y) {
  return DISTRICTS[districtAt(x, y)];
}

// The Salt Kings run the east strip: on their turf, bystanders look the
// other way when a crime goes down (the wanted system halves the distance
// at which a pedestrian counts as a witness there).
export function isSaltKingsTurf(x, y) {
  return districtAt(x, y) === 'docks';
}

// Landmarks the story and the shops live at. Fixed spots, so the missions and
// the minimap always agree with the world.
export const LANDMARKS = {
  safehouse: { x: 700, y: 700, name: 'Safehouse', kind: 'safehouse' },
  gunStore: { x: 3100, y: 700, name: 'Ironworks Arms', kind: 'gun' },
  sprayShop: { x: 700, y: 3100, name: 'Color Rush Spray', kind: 'spray' },
  hospital: { x: 3100, y: 3100, name: 'Solmar General', kind: 'hospital' },
  diner: { x: 1680, y: 700, name: 'Sunset Diner', kind: 'diner' },
  bank: { x: 2160, y: 2160, name: 'Solmar Bay Bank', kind: 'bank' },
  hotel: { x: 700, y: 1680, name: 'The Palms Hotel', kind: 'hotel' },
  docks: { x: 3600, y: 1680, name: 'Dock 9', kind: 'docks' },
  marina: { x: 300, y: 1680, name: 'Marina Pier', kind: 'marina' },
  arcade: { x: 2160, y: 700, name: 'Neon Arcade', kind: 'arcade' },
  depot: { x: 3360, y: 3100, name: 'Solmar Courier Depot', kind: 'depot' },
};

/** The landmark of a kind ('gun', 'depot', …), or null when there is none. */
export function landmarkByKind(kind) {
  for (const key of Object.keys(LANDMARKS)) {
    if (LANDMARKS[key].kind === kind) return LANDMARKS[key];
  }
  return null;
}

const SHOP_SIGNS = {
  gun: ['GUNS', 'AMMO'],
  spray: ['SPRAY', 'PAINT'],
  hospital: ['HOSPITAL', 'ER 24H'],
  diner: ['DINER', 'EAT'],
  bank: ['BANK', 'SOLMAR BAY'],
  hotel: ['HOTEL', 'PALMS'],
  safehouse: ['GARAGE', 'HOME'],
  docks: ['DOCK 9', 'FREIGHT'],
  marina: ['PIER', 'MARINA'],
  arcade: ['ARCADE', 'NEON'],
  depot: ['COURIER', 'DEPOT'],
};

export function createCity(seed) {
  const rng = createRandom(seed);
  const buildings = [];
  const props = []; // {x, y, kind, r, w, h, color, solid}
  const trees = [];
  const lamps = [];
  const signs = []; // neon signs on buildings: {x, y, text, color}

  // Block bounds: between consecutive road centres, inset by the road half-width.
  const blockEdges = [0, ...ROAD_CENTRES.map((c) => c + ROAD_W / 2), WORLD];
  const blockStarts = [0, ...ROAD_CENTRES.map((c) => c + ROAD_W / 2)];
  // Simpler: blocks are the gaps between roads, plus the four edge strips.
  const gaps = [];
  let prev = 0;
  for (const c of ROAD_CENTRES) {
    gaps.push([prev, c - ROAD_W / 2]);
    prev = c + ROAD_W / 2;
  }
  gaps.push([prev, WORLD]);

  function addBuilding(x, y, w, h, district, kind) {
    const roof = rng.pick(PALETTE.buildingRoof);
    const wall = rng.pick(PALETTE.buildingWall);
    const b = { x, y, w, h, roof, wall, district, kind: kind ?? 'block', tier: district === 'downtown' ? rng.int(2, 3) : rng.int(1, 2) };
    buildings.push(b);
    return b;
  }

  function addTreesInBlock(x0, y0, x1, y1, n) {
    for (let i = 0; i < n; i++) {
      trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20), r: rng.range(9, 15), shade: rng.range(0.85, 1.1) });
    }
  }

  for (let gi = 0; gi < gaps.length; gi++) {
    for (let gj = 0; gj < gaps.length; gj++) {
      const [x0, x1] = gaps[gi];
      const [y0, y1] = gaps[gj];
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 200 || bh < 200) continue;
      if (district === 'beach') {
        // Palms along the sand, a lifeguard tower, no buildings.
        for (let i = 0; i < 7; i++) {
          trees.push({ x: rng.range(190, 400), y: rng.range(y0 + 30, y1 - 30), r: 12, palm: true, shade: 1 });
        }
        if (gj === 3) props.push({ x: 250, y: cy, kind: 'tower', w: 26, h: 26, solid: true });
        continue;
      }
      if (district === 'hills') {
        addTreesInBlock(x0, y0, x1, y1, 16);
        if (rng.chance(0.5)) props.push({ x: cx, y: cy, kind: 'pond', w: 120, h: 80, solid: false });
        continue;
      }
      if (district === 'docks') {
        // Warehouses and container stacks.
        addBuilding(x0 + 30, y0 + 30, bw - 60, 90, district, 'warehouse');
        for (let i = 0; i < 6; i++) {
          props.push({ x: rng.range(x0 + 40, x1 - 90), y: rng.range(y0 + 150, y1 - 40), kind: 'container', w: 64, h: 26, color: rng.pick(['#b3543a', '#3a6db5', '#4d8a4d', '#c08a3e']), solid: true });
        }
        continue;
      }
      if (district === 'downtown') {
        // Dense: two tall slabs per block with a plaza between them.
        const split = rng.weightedPick([['vertical', 1], ['horizontal', 1]]) === 'vertical';
        if (split) {
          addBuilding(x0 + 24, y0 + 24, bw / 2 - 36, bh - 48, district);
          addBuilding(x0 + bw / 2 + 12, y0 + 24, bw / 2 - 36, bh - 48, district);
        } else {
          addBuilding(x0 + 24, y0 + 24, bw - 48, (bh - 60) / 2, district);
          addBuilding(x0 + 24, y0 + (bh + 12) / 2, bw - 48, (bh - 60) / 2, district);
        }
        addTreesInBlock(x0, y0, x1, y1, 2);
        continue;
      }
      if (district === 'oldtown') {
        // Low houses in a loose row.
        const n = rng.int(2, 3);
        for (let i = 0; i < n; i++) {
          const w = rng.range(90, 140);
          const h = rng.range(80, 120);
          addBuilding(x0 + 24 + i * ((bw - 48) / n), y0 + 30 + rng.range(0, 40), w, h, district, 'house');
        }
        addTreesInBlock(x0, y0, x1, y1, 3);
        continue;
      }
      // midtown: one or two mid-size blocks — or a pocket park, so the
      // district breathes between the buildings: trees, a fountain and a
      // pond, no walls. The fountain is solid: cars and feet go around it.
      if (rng.chance(0.18)) {
        addTreesInBlock(x0, y0, x1, y1, 6);
        props.push({ x: cx, y: cy, kind: 'fountain', w: 64, h: 64, solid: true });
        props.push({ x: cx + 130, y: cy - 90, kind: 'pond', w: 110, h: 70, solid: false });
        continue;
      }
      if (rng.chance(0.6)) {
        addBuilding(x0 + 30, y0 + 30, rng.range(150, bw - 90), rng.range(120, bh - 90), district);
        if (rng.chance(0.5)) addBuilding(x0 + bw - 170, y0 + bh - 150, 130, 110, district, 'shop');
      } else {
        addBuilding(x0 + 24, y0 + 24, bw - 48, bh - 48, district);
      }
      addTreesInBlock(x0, y0, x1, y1, 2);
    }
  }

  // Landmark buildings sit on top of the generated ones, at fixed spots, with
  // a neon sign so they read from the street and on the minimap. The neon
  // colours are dealt in a shuffled order, so no two landmarks share a hue
  // by accident of the palette order.
  const neonOrder = rng.shuffle(PALETTE.neon);
  for (const [i, key] of Object.keys(LANDMARKS).entries()) {
    const lm = LANDMARKS[key];
    const b = addBuilding(lm.x - 70, lm.y - 55, 140, 110, districtAt(lm.x, lm.y), 'landmark');
    b.landmark = key;
    const signText = SHOP_SIGNS[lm.kind] ?? [lm.name.toUpperCase()];
    signs.push({ x: lm.x, y: lm.y - 62, text: signText[0], color: neonOrder[i % neonOrder.length], sub: signText[1] ?? null });
  }

  // Street lamps at every intersection corner, hydrants and dumpsters scattered.
  for (const cx of ROAD_CENTRES) {
    for (const cy of ROAD_CENTRES) {
      lamps.push({ x: cx - ROAD_W / 2 - 8, y: cy - ROAD_W / 2 - 8 });
      lamps.push({ x: cx + ROAD_W / 2 + 8, y: cy + ROAD_W / 2 + 8 });
    }
  }
  for (let i = 0; i < 60; i++) {
    const cx = rng.pick(ROAD_CENTRES);
    const cy = rng.pick(ROAD_CENTRES);
    const side = rng.pick([1, -1]);
    props.push({
      x: cx + side * (ROAD_W / 2 + 26) + rng.range(-8, 8),
      y: cy + rng.range(-160, 160),
      kind: rng.chance(0.6) ? 'dumpster' : 'hydrant',
      w: 22, h: 16, solid: true, color: '#5a7a4d',
    });
  }

  const city = { seed, buildings, props, trees, lamps, signs, gaps };
  return city;
}

// ---- queries shared by traffic, pedestrians, physics and the renderer ----

export function isWater(x, y) {
  return x < 140;
}

export function circleBlocked(city, x, y, r) {
  if (x < 140 + r || x > WORLD - r || y < r || y > WORLD - r) return true;
  if (isWater(x, y)) return true;
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  for (const p of city.props) {
    if (!p.solid || p.kind === 'pond') continue;
    const hw = (p.w ?? 20) / 2;
    const hh = (p.h ?? 20) / 2;
    if (x + r > p.x - hw && x - r < p.x + hw && y + r > p.y - hh && y - r < p.y + hh) return true;
  }
  return false;
}

/** Push a circle out of every solid it overlaps; returns true when it moved. */
export function resolveCircle(city, ent, r) {
  let moved = false;
  const push = (cx, cy, hw, hh) => {
    const dx = ent.x - clamp(ent.x, cx - hw, cx + hw);
    const dy = ent.y - clamp(ent.y, cy - hh, cy + hh);
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    if (d2 > 0.01) {
      const d = Math.sqrt(d2);
      ent.x += (dx / d) * (r - d);
      ent.y += (dy / d) * (r - d);
    } else {
      ent.y -= r;
    }
    moved = true;
  };
  for (const b of city.buildings) push(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2);
  for (const p of city.props) {
    if (!p.solid || p.kind === 'pond') continue;
    push(p.x, p.y, (p.w ?? 20) / 2, (p.h ?? 20) / 2);
  }
  if (ent.x < 140 + r) { ent.x = 140 + r; moved = true; }
  if (ent.x > WORLD - r) { ent.x = WORLD - r; moved = true; }
  if (ent.y < r) { ent.y = r; moved = true; }
  if (ent.y > WORLD - r) { ent.y = WORLD - r; moved = true; }
  return moved;
}

export function isOnRoad(x, y) {
  for (const c of ROAD_CENTRES) {
    if (Math.abs(x - c) < ROAD_W / 2 || Math.abs(y - c) < ROAD_W / 2) return true;
  }
  return false;
}

export function nearestRoadCentre(v) {
  let best = ROAD_CENTRES[0];
  for (const c of ROAD_CENTRES) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

/** The nearest point on the road network, for spawning cars and pedestrians. */
export function nearestRoadPoint(x, y) {
  const rx = nearestRoadCentre(x);
  const ry = nearestRoadCentre(y);
  return Math.abs(x - rx) < Math.abs(y - ry) ? { x: rx, y } : { x, y: ry };
}

/** A random sidewalk spot near a point: just off a road, on foot territory. */
export function randomSidewalkSpot(city, rng, cx, cy, radius) {
  for (let tries = 0; tries < 12; tries++) {
    const x = clamp(cx + rng.range(-radius, radius), 200, WORLD - 60);
    const y = clamp(cy + rng.range(-radius, radius), 60, WORLD - 60);
    const p = nearestRoadPoint(x, y);
    // The nearest point kept one coordinate: that axis is the road it sits
    // on, so the sidewalk offset goes across it (x for a vertical road,
    // y for a horizontal one).
    const onVerticalRoad = p.x !== x;
    const side = rng.chance(0.5) ? 1 : -1;
    const sx = onVerticalRoad ? p.x + side * (ROAD_W / 2 + 16) : p.x;
    const sy = onVerticalRoad ? p.y : p.y + side * (ROAD_W / 2 + 16);
    if (!circleBlocked(city, sx, sy, 12)) return { x: sx, y: sy };
  }
  return { x: cx, y: cy };
}
