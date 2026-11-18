// SOLMAR NIGHTS — missions.js
// The story: Dana Reyes, a courier who owes the wrong people money, takes
// jobs from Mara Solis, a fixer who runs Solmar from a phone booth in
// Downtown. Six jobs, each a small state machine with its own objective,
// marker and fail condition. Side work (taxi fares, hidden packages) lives
// in world.js; this file is only the story chain.

import { LANDMARKS, districtNameAt } from './city.js';
import { clamp } from './random.js';

const RACE_POINTS = [
  { x: 960, y: 480 },
  { x: 3360, y: 960 },
  { x: 3360, y: 2880 },
  { x: 960, y: 3360 },
  { x: 480, y: 1920 },
  { x: 1920, y: 480 },
];

const COLLECT_SPOTS = [
  { x: 300, y: 3360 },
  { x: 3360, y: 480 },
  { x: 1920, y: 2880 },
];

function nearestCar(G) {
  let best = null;
  let bd = 1e9;
  for (const car of G.cars) {
    if (car.dead || car.ai === 'police') continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Mara Solis',
    brief: 'You need wheels before you can work. Take any car on the street — nobody here locks theirs — and bring it to my garage.',
    reward: 300,
    start(G) { G.mission.phase = 0; },
    update(G) {
      if (G.mission.phase === 0 && G.player.inCar) {
        G.mission.phase = 1;
        G.toast = { text: 'Mara: "Good. Now bring it to the garage."', t: 0, dur: 4 };
      }
      if (G.mission.phase === 1 && G.player.inCar) {
        const d = Math.hypot(G.player.x - LANDMARKS.safehouse.x, G.player.y - LANDMARKS.safehouse.y);
        // Pulling up on the street by the garage counts as bringing it in.
        if (d < 260) return 'done';
      }
      return 'active';
    },
    objective(G) {
      if (G.mission.phase === 0) return 'Steal a car — walk up to one and press E';
      const d = Math.hypot(G.player.x - LANDMARKS.safehouse.x, G.player.y - LANDMARKS.safehouse.y);
      return `Drive the car to Mara's garage — ${Math.max(0, Math.round(d / 10) * 10)}m away`;
    },
    target(G) {
      if (G.mission.phase === 0) {
        const c = nearestCar(G);
        return c ? { x: c.x, y: c.y } : null;
      }
      return { x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y };
    },
  },
  {
    id: 'special-delivery',
    title: 'Special Delivery',
    giver: 'Mara Solis',
    brief: 'A package is waiting at Dock 9. Pick it up and get it to The Palms Hotel. The client pays for speed — you have 100 seconds once it is in your hands.',
    reward: 600,
    start(G) { G.mission.phase = 0; G.mission.data.hold = 0; },
    update(G, dt) {
      const m = G.mission;
      if (m.phase === 0) {
        const d = Math.hypot(G.player.x - LANDMARKS.docks.x, G.player.y - LANDMARKS.docks.y);
        if (d < 110) {
          m.data.hold += dt;
          if (m.data.hold > 1.2) {
            m.phase = 1;
            m.timer = 100;
            G.toast = { text: 'Package secured. 100 seconds — move!', t: 0, dur: 4 };
          }
        } else m.data.hold = 0;
      } else {
        m.timer -= dt;
        if (m.timer <= 0) return 'fail';
        const d = Math.hypot(G.player.x - LANDMARKS.hotel.x, G.player.y - LANDMARKS.hotel.y);
        if (d < 110) return 'done';
      }
      return 'active';
    },
    objective(G) {
      const m = G.mission;
      if (m.phase === 0) return 'Pick up the package at Dock 9';
      return `Deliver the package to The Palms Hotel — ${Math.max(0, Math.ceil(m.timer))}s left`;
    },
    target(G) {
      return G.mission.phase === 0 ? { x: LANDMARKS.docks.x, y: LANDMARKS.docks.y } : { x: LANDMARKS.hotel.x, y: LANDMARKS.hotel.y };
    },
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    giver: 'Mara Solis',
    brief: 'The alarm tripped and the whole city saw your face. Three stars, Dana. Lose them — break line of sight, stay out of view, and let the heat cool.',
    reward: 800,
    start(G) {
      G.mission.phase = 0;
      G.mission.timer = 180;
      G.wanted.heat = 70;
      G.wanted.hiddenTimer = 0;
    },
    update(G, dt) {
      const m = G.mission;
      m.timer -= dt;
      if (G.wanted.stars === 0) return 'done';
      if (m.timer <= 0) return 'fail';
      return 'active';
    },
    objective(G) {
      return `Lose the cops — stay unseen until the stars clear (${Math.max(0, Math.ceil(G.mission.timer))}s)`;
    },
    target() { return null; },
  },
  {
    id: 'the-collection',
    title: 'The Collection',
    giver: 'Mara Solis',
    brief: 'Three cash drops are stashed around Solmar — the beach, the docks and downtown. Collect all three. The Salt Kings want them too, so do not dawdle.',
    reward: 1000,
    start(G) {
      G.mission.phase = 0;
      G.mission.data.got = 0;
      // A retry must not stack fresh drops on the ones left behind from the
      // last attempt: clear the old cashbags before hiding three new ones.
      G.pickups = G.pickups.filter((p) => p.kind !== 'cashbag');
      for (const s of COLLECT_SPOTS) {
        G.pickups.push({ kind: 'cashbag', x: s.x, y: s.y, taken: false, bob: 0 });
      }
    },
    update(G) {
      const got = G.pickups.filter((p) => p.kind === 'cashbag' && p.taken).length;
      G.mission.data.got = got;
      if (got >= 3) return 'done';
      return 'active';
    },
    objective(G) {
      const next = G.pickups.find((p) => p.kind === 'cashbag' && !p.taken);
      const where = next ? ` — next drop: ${districtNameAt(next.x, next.y)}` : '';
      return `Collect the cash drops — ${G.mission.data.got ?? 0} of 3 found${where}`;
    },
    target(G) {
      const next = G.pickups.find((p) => p.kind === 'cashbag' && !p.taken);
      return next ? { x: next.x, y: next.y } : null;
    },
  },
  {
    id: 'bayfront-sprint',
    title: 'Bayfront Sprint',
    giver: 'Mara Solis',
    brief: 'An illegal sprint around the bayfront. Six checkpoints, two rivals, 150 seconds. Beat them all to the last gate and the pot is yours.',
    reward: 1500,
    start(G) {
      G.mission.phase = 0;
      G.mission.data.cp = 0;
      G.mission.timer = 150;
      G.mission.data.rivalCp = [0, 0];
      // Two rival drivers in fast cars, waiting at the start line.
      const spots = [{ x: 900, y: 520 }, { x: 900, y: 440 }];
      G.rivals = spots.map((s, i) => spawnRival(G, s.x, s.y, i));
    },
    update(G, dt) {
      const m = G.mission;
      m.timer -= dt;
      if (m.timer <= 0) return 'fail';
      const cp = RACE_POINTS[m.data.cp];
      if (cp && Math.hypot(G.player.x - cp.x, G.player.y - cp.y) < 90) {
        m.data.cp++;
        G.audio?.cash();
        G.toast = { text: `Checkpoint ${m.data.cp} of ${RACE_POINTS.length}!`, t: 0, dur: 2 };
        if (m.data.cp >= RACE_POINTS.length) return 'done';
      }
      // A rival who clears every gate first wins the pot instead.
      for (let i = 0; i < G.rivals.length; i++) {
        if (G.rivals[i].cp >= RACE_POINTS.length) return 'fail';
      }
      return 'active';
    },
    objective(G) {
      const m = G.mission;
      return `Race! Checkpoint ${Math.min(m.data.cp + 1, RACE_POINTS.length)} of ${RACE_POINTS.length} — ${Math.max(0, Math.ceil(m.timer))}s left`;
    },
    target(G) {
      const cp = RACE_POINTS[G.mission.data.cp];
      return cp ? { x: cp.x, y: cp.y } : null;
    },
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    giver: 'Mara Solis',
    brief: 'Solmar Bay Bank. Walk in, hold the floor for thirty seconds while the alarms scream, grab the cash and vanish. This is the one that clears your debt.',
    reward: 5000,
    start(G) { G.mission.phase = 0; G.mission.data.hold = 0; },
    update(G, dt) {
      const m = G.mission;
      if (m.phase === 0) {
        const d = Math.hypot(G.player.x - LANDMARKS.bank.x, G.player.y - LANDMARKS.bank.y);
        if (d < 110) {
          m.phase = 1;
          m.data.hold = 0;
          G.wanted.heat = 85;
          G.wanted.hiddenTimer = 0;
          G.toast = { text: 'ALARM! Hold the bank floor — 30 seconds!', t: 0, dur: 4 };
        }
      } else if (m.phase === 1) {
        const d = Math.hypot(G.player.x - LANDMARKS.bank.x, G.player.y - LANDMARKS.bank.y);
        if (d < 130) {
          m.data.hold += dt;
          if (m.data.hold >= 30) {
            m.phase = 2;
            G.toast = { text: 'Cash grabbed! Get to the safehouse!', t: 0, dur: 4 };
          }
        }
      } else {
        const d = Math.hypot(G.player.x - LANDMARKS.safehouse.x, G.player.y - LANDMARKS.safehouse.y);
        if (d < 110) return 'done';
      }
      return 'active';
    },
    objective(G) {
      const m = G.mission;
      if (m.phase === 0) return 'Get inside Solmar Bay Bank';
      if (m.phase === 1) return `Hold the bank floor — ${Math.max(0, Math.ceil(30 - m.data.hold))}s`;
      return 'Escape to the safehouse with the cash';
    },
    target(G) {
      const m = G.mission;
      if (m.phase === 2) return { x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y };
      return { x: LANDMARKS.bank.x, y: LANDMARKS.bank.y };
    },
  },
];

function spawnRival(G, x, y, index) {
  const colors = ['#ff2e88', '#7cff4d'];
  const car = {
    x, y, angle: 0, vx: 0, vy: 0, speed: 0, slip: 0,
    type: { ...G.types.rival },
    color: colors[index % colors.length],
    hp: 120, maxHp: 120, ai: 'rival', cp: 0, driver: 'rival', dead: false,
    brakeTimer: 0,
  };
  G.cars.push(car);
  return car;
}

export function raceCheckpoint(G, index) {
  return RACE_POINTS[clamp(index, 0, RACE_POINTS.length - 1)];
}

export function startMission(G, index) {
  const def = MISSIONS[index];
  if (!def) return false;
  G.mission = { index, active: true, phase: 0, data: {}, timer: 0, def };
  def.start(G);
  G.banner = { title: def.title.toUpperCase(), sub: def.brief, t: 0, dur: 5 };
  G.audio?.missionStart();
  return true;
}

export function missionObjective(G) {
  if (!G.mission.active) return null;
  return G.mission.def.objective(G);
}

export function missionTarget(G) {
  if (!G.mission.active) return null;
  return G.mission.def.target(G);
}

/** Runs the active mission; returns 'active', 'done' or 'fail'. */
export function updateMission(G, dt) {
  if (!G.mission.active) return 'active';
  return G.mission.def.update(G, dt);
}
