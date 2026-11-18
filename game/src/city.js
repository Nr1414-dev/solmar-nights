// SOLMAR NIGHTS v2.3 — city.js
// The city is generated, not drawn: a seeded generator lays out the road
// grid, the blocks between the roads, and the buildings, parks, palms and
// plazas inside each block. Districts are decided by position, so the
// north-east is towers, the centre is shops, the south is houses and the
// west edge is beach. Landmarks are fixed spots so missions, shops and the
// story always know where to send the player.

import { FIRST_ROAD, LAST_ROAD, ROAD_CENTRES, ROAD_PITCH, ROAD_W, WORLD } from './config.js';
import { makeRng } from './random.js';

export { ROAD_CENTRES };

export const DISTRICTS = {
  downtown: { name: 'Downtown', base: '#3a3f5c', roof: '#565d7d' },
  commercial: { name: 'Mercado District', base: '#4a3a52', roof: '#6b5570' },
  suburb: { name: 'Palmera Suburb', base: '#3d4a3a', roof: '#5a6b52' },
  marina: { name: 'Marina & Docks', base: '#2f4a55', roof: '#3f6b78' },
  oldtown: { name: 'Old Town', base: '#54432f', roof: '#6f5a3d' },
  beach: { name: 'Solmar Beach', base: '#b89a5e', roof: '#cbb37a' },
};

export function districtAt(x, y) {
  if (x < 300) return 'beach';
  if (x > 3300) return 'marina';
  if (y < 900 && x > 1900) return 'downtown';
  if (y < 1500) return 'commercial';
  if (y > 2900) return 'oldtown';
  if (x < 1300 && y > 1900) return 'suburb';
  return 'commercial';
}

export function districtNameAt(x, y) {
  return DISTRICTS[districtAt(x, y)].name;
}

// The Salt Kings run the east strip: on their turf bystanders look the
// other way a little longer and gang waves spawn closer.
export function isSaltKingsTurf(x, y) {
  return x > 2900 && y > 1400 && y < 2900;
}

// Landmarks the story and the shops live at. Fixed spots, so the missions
// and the save file can always find them again.
export const LANDMARKS = {
  home: { x: 960, y: 2880, name: "Dana's Apartment", kind: 'home' },
  maraOffice: { x: 1920, y: 960, name: "Mara's Office", kind: 'office' },
  gunStore: { x: 1440, y: 1440, name: 'Ironworks Arms', kind: 'gun' },
  sprayShop: { x: 2880, y: 1920, name: 'Solmar Spray & Paint', kind: 'spray' },
  diner: { x: 960, y: 1920, name: 'Sunset Diner', kind: 'diner' },
  clothes: { x: 2400, y: 1440, name: 'Marina Threads', kind: 'clothes' },
  hospital: { x: 1920, y: 2400, name: 'Solmar General', kind: 'hospital' },
  depot: { x: 3360, y: 2880, name: 'Solmar Courier Depot', kind: 'depot' },
  pier: { x: 3600, y: 960, name: 'Marina Pier', kind: 'pier' },
  market: { x: 1440, y: 2400, name: 'Mercado Central', kind: 'market' },
  shopA: { x: 2400, y: 960, name: 'Corner Mart — North', kind: 'shop' },
  shopB: { x: 960, y: 1440, name: 'Corner Mart — West', kind: 'shop' },
  park: { x: 1920, y: 1920, name: 'Plaza del Sol', kind: 'park' },
  beachBar: { x: 360, y: 1920, name: 'Tide Bar', kind: 'bar' },
  stadium: { x: 2880, y: 2880, name: 'Solmar Arena', kind: 'stadium' },
};

export function landmarkByKind(kind) {
  return Object.values(LANDMARKS).find((l) => l.kind === kind) ?? LANDMARKS.home;
}

export function createCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];
  const parks = [];
  const plazas = [];
  const cameras = []; // CCTV positions on downtown intersections

  // Blocks sit BETWEEN the roads: block centres are at 720, 1200, ...
  // (road centre + half a pitch). Buildings live inside the block
  // interior only — a building centred on a road centre would sit on
  // the road itself and block traffic, which is exactly what the first
  // version of this generator did by mistake.
  for (let bx = 0; bx < 6; bx++) {
    for (let by = 0; by < 6; by++) {
      const cx = FIRST_ROAD + bx * ROAD_PITCH + ROAD_PITCH / 2;
      const cy = FIRST_ROAD + by * ROAD_PITCH + ROAD_PITCH / 2;
      const district = districtAt(cx, cy);
      // A few blocks are parks or plazas instead of buildings.
      const roll = rng.next();
      if (roll < 0.10) {
        parks.push({ x: cx, y: cy, r: 150, trees: rng.int(6, 14) });
        for (let i = 0; i < 10; i++) {
          palms.push({ x: cx + rng.range(-140, 140), y: cy + rng.range(-140, 140), s: rng.range(0.8, 1.3) });
        }
        continue;
      }
      if (roll < 0.16) {
        plazas.push({ x: cx, y: cy, r: 130 });
        continue;
      }
      const tall = district === 'downtown';
      const count = tall ? rng.int(1, 2) : rng.int(2, 4);
      for (let i = 0; i < count; i++) {
        const w = tall ? rng.range(150, 210) : rng.range(90, 170);
        const h = tall ? rng.range(150, 210) : rng.range(80, 150);
        // Keep the whole building inside the block interior: the road
        // strip (48px half-width) plus sidewalk (14px) must stay clear,
        // so no building edge crosses 178px from the block centre.
        const x = cx + rng.range(-170 + w / 2, 170 - w / 2);
        const y = cy + rng.range(-170 + h / 2, 170 - h / 2);
        // Keep buildings from overlapping each other in the same block.
        let clash = false;
        for (const b of buildings) {
          if (Math.abs(b.x - x) < (b.w + w) / 2 + 12 && Math.abs(b.y - y) < (b.h + h) / 2 + 12) { clash = true; break; }
        }
        if (clash) continue;
        buildings.push({
          x, y, w, h,
          height: tall ? rng.range(60, 130) : rng.range(12, 42),
          district,
          shade: rng.range(0.85, 1.12),
          neon: rng.chance(0.35),
          hue: rng.int(0, 5),
        });
      }
      // Palms line the sidewalks in the suburb and along the beach.
      if (district === 'suburb' || district === 'beach') {
        for (let i = 0; i < 4; i++) {
          palms.push({ x: cx + rng.range(-180, 180), y: cy + rng.range(-180, 180), s: rng.range(0.8, 1.4) });
        }
      }
    }
  }

  // CCTV cameras watch the downtown intersections and the market.
  for (const [x, y] of [[1920, 960], [2400, 960], [1920, 1440], [2400, 1440], [1440, 2400], [2880, 1920]]) {
    cameras.push({ x, y, r: 260 });
  }

  // Fountain positions in the parks.
  const fountains = parks.map((p) => ({ x: p.x, y: p.y, r: 34 }));

  return { seed, buildings, palms, parks, plazas, cameras, fountains };
}

export function isWater(x, y) {
  return x < 150 || x > WORLD - 150;
}

export function isBeach(x, y) {
  return x >= 150 && x < 320;
}

export function circleBlocked(city, x, y, r) {
  if (x < 40 + r || x > WORLD - 40 - r || y < 40 + r || y > WORLD - 40 - r) return true;
  if (isWater(x, y)) return true;
  for (const b of city.buildings) {
    const dx = Math.abs(x - b.x) - b.w / 2;
    const dy = Math.abs(y - b.y) - b.h / 2;
    const cx = Math.max(dx, 0);
    const cy = Math.max(dy, 0);
    if (cx * cx + cy * cy < r * r) return true;
  }
  return false;
}

// Push a circle entity out of buildings / water so it never gets stuck.
export function resolveCircle(city, ent, r) {
  for (const b of city.buildings) {
    const dx = ent.x - b.x;
    const dy = ent.y - b.y;
    const ox = b.w / 2 + r - Math.abs(dx);
    const oy = b.h / 2 + r - Math.abs(dy);
    if (ox > 0 && oy > 0) {
      if (ox < oy) ent.x = b.x + Math.sign(dx || 1) * (b.w / 2 + r);
      else ent.y = b.y + Math.sign(dy || 1) * (b.h / 2 + r);
    }
  }
  ent.x = Math.max(60, Math.min(WORLD - 60, ent.x));
  ent.y = Math.max(60, Math.min(WORLD - 60, ent.y));
}

export function isOnRoad(x, y) {
  const onX = ROAD_CENTRES.some((c) => Math.abs(x - c) < ROAD_W / 2);
  const onY = ROAD_CENTRES.some((c) => Math.abs(y - c) < ROAD_W / 2);
  return onX || onY;
}

export function nearestRoadCentre(v) {
  let best = ROAD_CENTRES[0];
  for (const c of ROAD_CENTRES) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

export function nearestRoadPoint(x, y) {
  const cx = nearestRoadCentre(x);
  const cy = nearestRoadCentre(y);
  // Snap to whichever road axis is closer.
  if (Math.abs(x - cx) < Math.abs(y - cy)) return { x: cx, y };
  return { x, y: cy };
}

export function randomSidewalkSpot(city, rng, cx, cy, radius) {
  for (let tries = 0; tries < 20; tries++) {
    const x = cx + rng.range(-radius, radius);
    const y = cy + rng.range(-radius, radius);
    if (isOnRoad(x, y)) continue;
    if (circleBlocked(city, x, y, 14)) continue;
    return { x, y };
  }
  return { x: cx, y: cy };
}

// Traffic-light phase for an intersection: returns 'green' or 'red' for
// the east-west direction at time t (north-south gets the opposite).
export function lightPhase(x, y, t) {
  const idx = (Math.round(x / ROAD_PITCH) + Math.round(y / ROAD_PITCH)) % 2;
  const cycle = 14;
  const phase = (t + idx * 7) % cycle;
  return phase < 7 ? 'green' : 'red';
}
