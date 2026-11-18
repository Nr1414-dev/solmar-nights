// SOLMAR NIGHTS — gangs.js
// The Salt Kings hit squads: the other side of Dana's debt. Once Dana is on
// Mara's books (the first job done), the Kings send armed squads after her
// every minute or two — never during a story job, so a mission is never
// ambushed by a wave. A squad hunts on foot: it chases, shoots from range
// when it has line of sight, and punches up close. Killing a King pays a
// $150 bounty on the spot (self-defence, so no wanted heat for the kill
// itself) and wiping a whole squad pays a $200 bonus from Mara. A squad the
// player outruns does not give up: it catches up off-screen and reappears
// on a road nearby, so the only way out is through them.

import { ECONOMY } from './config.js';
import { nearestRoadPoint, resolveCircle } from './city.js';
import { dist } from './random.js';
import { hasLineOfSight } from './wanted.js';

const WAVE_FIRST_DELAY = 75;
const WAVE_DELAY_MIN = 75;
const WAVE_DELAY_MAX = 120;

export function createGangs() {
  return {
    timer: WAVE_FIRST_DELAY,
    wave: 0,
    waveActive: false,
    active: [],
    cleared: 0,
  };
}

function spawnWave(G) {
  const gangs = G.gangs;
  gangs.wave++;
  // Three Kings to start, one more every two squads cleared, six at most.
  const size = Math.min(3 + Math.floor(gangs.cleared / 2), 6);
  const p = G.player;
  for (let i = 0; i < size; i++) {
    const a = G.rng.range(0, Math.PI * 2);
    const spot = nearestRoadPoint(p.x + Math.cos(a) * G.rng.range(500, 650), p.y + Math.sin(a) * G.rng.range(500, 650));
    gangs.active.push({
      x: spot.x, y: spot.y, angle: 0, hp: 50, speed: 148,
      state: 'chase', shootCd: G.rng.range(0.5, 1.5), punchCd: 0,
      repositionCd: 8, dead: false,
    });
  }
  gangs.waveActive = true;
  G.toast = { text: `Salt Kings hit squad incoming — ${size} armed Kings on your tail!`, t: 0, dur: 4 };
  G.audio?.gangWarn();
}

/** A King goes down: bounty on the spot, no wanted heat for self-defence. */
export function killGangMember(G, m) {
  if (m.dead) return;
  m.dead = true;
  G.stats.gangKills++;
  G.player.cash += ECONOMY.GANG_BOUNTY;
  G.audio?.cash();
  for (let i = 0; i < 10; i++) {
    const a = G.rng.range(0, Math.PI * 2);
    G.particles.push({
      x: m.x, y: m.y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110,
      life: 0.6, max: 0.6, color: '#c0392b', size: 4,
    });
  }
  // The floater needs the world helper, so gangs.js writes it directly.
  G.floaters.push({ x: m.x, y: m.y - 20, text: `+$${ECONOMY.GANG_BOUNTY} Salt Kings bounty`, life: 1.4, color: '#7cff4d' });
}

/**
 * Runs the squads. `hooks` carries the two damage functions from world.js
 * (gangs.js must not import world.js: world.js imports this file).
 * Returns nothing; the world reads G.gangs for the HUD and the minimap.
 */
export function updateGangs(G, dt, hooks) {
  const gangs = G.gangs;
  const p = G.player;
  // No squads before the first job is done, and never during a story job.
  if (G.missionIndex < 1 || G.mission.active) return;

  if (!gangs.waveActive) {
    gangs.timer -= dt;
    if (gangs.timer <= 0) spawnWave(G);
  } else if (gangs.active.every((m) => m.dead)) {
    gangs.waveActive = false;
    gangs.cleared++;
    G.stats.wavesCleared++;
    p.cash += ECONOMY.WAVE_BONUS;
    G.toast = { text: `Hit squad wiped — Mara pays the $${ECONOMY.WAVE_BONUS} bonus.`, t: 0, dur: 4 };
    G.audio?.missionDone();
    gangs.timer = G.rng.range(WAVE_DELAY_MIN, WAVE_DELAY_MAX);
    G.saveNeeded = true;
  }

  for (const m of gangs.active) {
    if (m.dead) continue;
    const d = dist(m.x, m.y, p.x, p.y);
    m.angle = Math.atan2(p.y - m.y, p.x - m.x);
    if (d > 700) {
      // Outrun: the squad catches up off-screen and reappears nearby.
      m.repositionCd -= dt;
      if (m.repositionCd <= 0) {
        const a = G.rng.range(0, Math.PI * 2);
        const spot = nearestRoadPoint(p.x + Math.cos(a) * 480, p.y + Math.sin(a) * 480);
        m.x = spot.x;
        m.y = spot.y;
        m.repositionCd = 8;
      }
    } else {
      m.x += Math.cos(m.angle) * m.speed * dt;
      m.y += Math.sin(m.angle) * m.speed * dt;
      resolveCircle(G.city, m, 12);
    }
    // Shoot from range with line of sight; the car takes the bullets when
    // Dana is driving, she takes them on foot.
    if (d < 340 && d > 50 && hasLineOfSight(G, m.x, m.y, p.x, p.y)) {
      m.shootCd -= dt;
      if (m.shootCd <= 0) {
        m.shootCd = G.rng.range(0.9, 1.6);
        G.audio?.shoot();
        const hit = G.rng.chance(0.18);
        const aim = m.angle + G.rng.range(-0.12, 0.12);
        const endX = m.x + Math.cos(aim) * d;
        const endY = m.y + Math.sin(aim) * d;
        G.particles.push({ x: endX, y: endY, vx: 0, vy: 0, life: 0.1, max: 0.1, color: '#ff5a5a', size: 3, tracer: { x: m.x, y: m.y } });
        if (hit) {
          if (p.inCar) hooks.damageCar(G, p.inCar, 6);
          else hooks.damagePlayer(G, 6);
        }
      }
    }
    // Up close, on foot: a King swings instead of shooting.
    if (!p.inCar && d < 46) {
      m.punchCd -= dt;
      if (m.punchCd <= 0) {
        m.punchCd = 0.8;
        G.audio?.punch();
        hooks.damagePlayer(G, 8);
      }
    }
  }
  // The dead leave once they are out of sight.
  gangs.active = gangs.active.filter((m) => !m.dead || dist(m.x, m.y, p.x, p.y) < 500);
}

/** Kings still standing in the current squad, for the HUD and the minimap. */
export function gangAliveCount(G) {
  return G.gangs.active.filter((m) => !m.dead).length;
}
