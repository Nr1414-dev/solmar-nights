// SOLMAR NIGHTS — gangs.js
// The Salt Kings: hit squads that hunt the player between missions, and the
// Enforcer who leads every third wave. Squads spawn off-screen, drive or run
// to the player, and fight until wiped out or outrun. Surviving a wave pays
// reputation and a little cash; losing one costs health and wanted heat.

import { range, pick } from './random.js';
import { clamp } from './physics.js';

export function createGangState() {
  return {
    wave: 0, // waves survived
    active: [], // live squad members {x,y,hp,angle,weapon,isEnforcer,speed}
    spawnTimer: 55, // seconds until the next squad (only when not in a mission)
    waveInProgress: false,
    waveLeft: 0,
    messageTimer: 0,
  };
}

const GANG_COLORS = ['#7a1a8c', '#5a1a6c', '#8c2a6a'];

// Spawn a squad of `size` members around the player at road distance.
export function spawnHitSquad(world, size, withEnforcer) {
  const p = world.player;
  const g = world.gangs;
  for (let i = 0; i < size; i++) {
    const angle = world.rng() * Math.PI * 2;
    const d = 620 + world.rng() * 260;
    let x = p.x + Math.cos(angle) * d;
    let y = p.y + Math.sin(angle) * d;
    x = clamp(x, 80, 3760); y = clamp(y, 80, 3760);
    const enforcer = withEnforcer && i === 0;
    g.active.push({
      x, y, angle,
      hp: enforcer ? 220 : 80,
      speed: enforcer ? 150 : 132,
      isEnforcer: enforcer,
      weapon: enforcer ? 'shotgun' : 'pistol',
      shootTimer: range(world.rng, 0.5, 1.6),
      color: enforcer ? '#c2a018' : pick(world.rng, GANG_COLORS),
      radius: enforcer ? 20 : 15,
    });
  }
  g.waveInProgress = true;
  g.waveLeft = g.active.length;
  world.message(withEnforcer ? 'SALT KINGS ENFORCER inbound — take him down!' : 'Salt Kings hit squad inbound!', '#e8b81a');
}

// Start a scripted wave (used by mission 7 and by the free-roam timer).
export function startWave(world) {
  const g = world.gangs;
  g.wave += 1;
  const withEnforcer = g.wave % 3 === 0;
  const size = Math.min(2 + g.wave, 7);
  spawnHitSquad(world, size, withEnforcer);
}

export function updateGangs(world, dt) {
  const g = world.gangs;
  const p = world.player;
  if (world.screen !== 'play') return;

  // Free-roam pressure: a squad every ~55s once the player has some heat or
  // reputation, but never during an active story mission step.
  const inMission = world.mission.active;
  if (!inMission && !g.waveInProgress && world.stats.reputation >= 1) {
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      g.spawnTimer = 55 + world.rng() * 25;
      startWave(world);
    }
  }

  // Move each member toward the player and shoot when in range.
  for (const m of g.active) {
    if (m.hp <= 0) continue;
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    const want = Math.atan2(p.y - m.y, p.x - m.x);
    m.angle = want;
    if (d > 260) {
      m.x += Math.cos(want) * m.speed * dt;
      m.y += Math.sin(want) * m.speed * dt;
    } else if (d < 140) {
      m.x -= Math.cos(want) * m.speed * 0.5 * dt;
      m.y -= Math.sin(want) * m.speed * 0.5 * dt;
    }
    // Keep out of buildings.
    for (const b of world.city.buildings) {
      if (m.x > b.x - 12 && m.x < b.x + b.w + 12 && m.y > b.y - 12 && m.y < b.y + b.h + 12) {
        m.x -= Math.cos(want) * m.speed * dt;
        m.y -= Math.sin(want) * m.speed * dt;
        break;
      }
    }
    m.shootTimer -= dt;
    if (m.shootTimer <= 0 && d < 460) {
      m.shootTimer = m.isEnforcer ? 1.1 : 1.6;
      world.spawnBullet(m.x, m.y, want + (world.rng() - 0.5) * 0.16, m.isEnforcer ? 520 : 460, m.isEnforcer ? 16 : 9, 'gang');
      world.audio.shoot(false);
    }
  }

  // Wave cleared?
  if (g.waveInProgress && g.active.every((m) => m.hp <= 0)) {
    g.waveInProgress = false;
    g.active = g.active.filter((m) => m.hp > 0);
    const pay = 120 + g.wave * 40;
    world.player.money += pay;
    world.stats.reputation += 1;
    world.message(`Wave ${g.wave} cleared! +$${pay}  Rep +1`, '#7ae88c');
    if (world.mission.active && world.mission.def && world.mission.def.steps[world.mission.step]?.type === 'survive') {
      world.mission.progress += 1;
    }
  }
  // Prune the dead so the array stays small.
  if (g.active.length > 0 && g.active.every((m) => m.hp <= 0)) g.active = [];
}
