// SOLMAR NIGHTS v2.3 — gangs.js
// The Salt Kings hit squads: the other side of Dana's debt. Once Dana is
// on Mara's books (the first job done), the Kings send armed squads after
// her on the street. Every third wave brings an Enforcer — tougher, faster
// on the trigger, worth more. Squads spawn on their east-side turf and
// hunt the player; killing the whole wave pays a squad bonus.

import { makeRng } from './random.js';
import { isSaltKingsTurf } from './city.js';
import { dist } from './random.js';

export function createGangs() {
  return {
    active: false,
    wave: 0,
    timer: 55,
    members: [],
    enforcers: 0,
  };
}

export function gangAliveCount(G) {
  return G.gangs.members.filter((m) => !m.dead).length;
}

export function gangEnforcerCount(G) {
  return G.gangs.members.filter((m) => !m.dead && m.enforcer).length;
}

function spawnWave(G) {
  const gangs = G.gangs;
  gangs.wave++;
  const n = 2 + Math.min(3, Math.floor(gangs.wave / 2));
  const isEnforcerWave = gangs.wave % 3 === 0;
  const rng = makeRng((G.seed ^ (gangs.wave * 7919)) >>> 0);
  for (let i = 0; i < n; i++) {
    const enforcer = isEnforcerWave && i === 0;
    // Spawn on the east turf when possible, otherwise just off-screen.
    let x = G.player.x + rng.range(500, 700) * (rng.chance(0.5) ? 1 : -1);
    let y = G.player.y + rng.range(500, 700) * (rng.chance(0.5) ? 1 : -1);
    if (isSaltKingsTurf(x, y)) { x = Math.min(x, 3300); }
    gangs.members.push({
      x, y, angle: 0, hp: enforcer ? 120 : 60, maxHp: enforcer ? 120 : 60,
      speed: enforcer ? 150 : 125, shootCd: rng.range(0.5, 1.5),
      dead: false, enforcer, bounty: enforcer ? 250 : 150,
      walkPhase: rng.range(0, 6), color: enforcer ? '#ff8c1a' : '#c0392b',
    });
  }
  gangs.enforcers = gangEnforcerCount(G);
  G.hudMessage = isEnforcerWave
    ? `Salt Kings Enforcer on the street — wave ${gangs.wave}!`
    : `Salt Kings hit squad — wave ${gangs.wave}!`;
  G.hudTimer = 4;
}

export function killGangMember(G, m) {
  if (m.dead) return;
  m.dead = true;
  G.player.cash += m.bounty;
  G.campaign.kills++;
  G.floaters.push({ x: m.x, y: m.y, text: `+$${m.bounty}`, color: '#ffd23e', t: 0, life: 1.4 });
  if (gangAliveCount(G) === 0) {
    const bonus = 100 + G.gangs.wave * 25;
    G.player.cash += bonus;
    G.hudMessage = `Squad wiped out — bonus $${bonus}`;
    G.hudTimer = 3.5;
  }
}

export function updateGangs(G, dt, hooks) {
  const gangs = G.gangs;
  if (!gangs.active) return;
  // Waves arrive on a timer that shortens as the campaign progresses.
  gangs.timer -= dt;
  if (gangs.timer <= 0 && gangAliveCount(G) === 0) {
    spawnWave(G);
    gangs.timer = Math.max(38, 75 - gangs.wave * 4);
  }
  for (const m of gangs.members) {
    if (m.dead) continue;
    const p = G.player;
    const d = dist(m.x, m.y, p.x, p.y);
    const want = Math.atan2(p.y - m.y, p.x - m.x);
    m.angle = want;
    // Fog makes the Kings shoot worse; rain slows everyone a touch.
    const fog = G.weather.kind === 'fog' ? 0.6 : 1;
    if (d > 260) {
      m.x += Math.cos(want) * m.speed * dt;
      m.y += Math.sin(want) * m.speed * dt;
    } else if (d < 150) {
      m.x -= Math.cos(want) * m.speed * 0.5 * dt;
      m.y -= Math.sin(want) * m.speed * 0.5 * dt;
    }
    m.shootCd -= dt;
    if (m.shootCd <= 0 && d < 420) {
      m.shootCd = (m.enforcer ? 1.1 : 1.7) * (G.weather.kind === 'fog' ? 1.5 : 1);
      hooks.gangShoot(m, d, fog);
    }
    // A gang member that reaches the player punches.
    if (d < 30) hooks.gangMelee(m);
  }
  gangs.members = gangs.members.filter((m) => !m.dead || m.deathT < 8);
}
