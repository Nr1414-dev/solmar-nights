// SOLMAR NIGHTS v2.3 — missions.js
// The story: Dana Reyes, a courier who owes the wrong people money, takes
// jobs for fixer Mara Solis to buy her way out. Eight jobs, each a small
// state machine with its own objective, timer and payout. Jobs unlock in
// order; finishing a job pays cash, raises reputation and unlocks the next
// one plus a perk (a weapon, a vehicle, a contact). The last job ends the
// campaign arc — the debt is paid and Solmar is Dana's.

import { LANDMARKS } from './city.js';
import { dist } from './random.js';

export const MISSIONS = [
  { id: 0, title: 'First Drop', kind: 'deliver', brief: 'Mara needs a parcel at the pier. Take it there — no questions, no stops.', reward: 300, time: 150, unlock: 'Taxi fares open' },
  { id: 1, title: 'Hot Wheels', kind: 'race', brief: 'A Kings runner stole Mara\u2019s car. Chase the checkpoints and bring it back — fast.', reward: 450, time: 180, unlock: 'Sports car spawns in Downtown' },
  { id: 2, title: 'Corner Mart', kind: 'robbery', brief: 'The till at Corner Mart — North is fat tonight. Grab the cash and lose the heat.', reward: 700, time: 240, unlock: 'Pistol discount at Ironworks' },
  { id: 3, title: 'The Escort', kind: 'escort', brief: 'Mara\u2019s driver is spooked. Ride with him to the diner and keep the Kings off his tail.', reward: 600, time: 240, unlock: 'Body armor at Ironworks' },
  { id: 4, title: 'Heat Wave', kind: 'escape', brief: 'The cops made you at the market. Lose a three-star wanted level and meet Mara at her office.', reward: 800, time: 300, unlock: 'Spray shop wipes CCTV evidence' },
  { id: 5, title: 'Kings Turf', kind: 'fight', brief: 'The Salt Kings are collecting on the east side. Clear two waves on their turf and send a message.', reward: 1000, time: 300, unlock: 'Shotgun at Ironworks' },
  { id: 6, title: 'The Last Delivery', kind: 'delivery', brief: 'Three parcels, one courier van, 180 seconds. The depot van is waiting — make every drop.', reward: 2500, time: 180, unlock: 'Courier van is yours to keep' },
  { id: 7, title: 'Paying the Debt', kind: 'finale', brief: 'One last run: take the payoff to the pier at dawn and end this. The Kings will try to stop you.', reward: 4000, time: 360, unlock: 'Story complete — free roam, legend of Solmar' },
];

export function missionObjective(G) {
  const m = G.mission;
  if (!m.active) return G.campaign.missionsDone.length >= 8 ? 'Story complete — Solmar is yours' : 'Visit Mara\u2019s Office (M) to start the next job';
  const def = MISSIONS[m.index];
  switch (m.stage) {
    case 'go': return `${def.title}: reach ${m.targetName}`;
    case 'pickup': return `${def.title}: pick up the package`;
    case 'deliver': return `${def.title}: deliver to ${m.targetName}`;
    case 'checkpoint': return `${def.title}: checkpoint ${m.checkpoint + 1}/${m.checkpoints.length}`;
    case 'rob': return `${def.title}: grab the cash (hold F)`;
    case 'escape': return `${def.title}: lose the heat, then reach ${m.targetName}`;
    case 'fight': return `${def.title}: clear the Kings — ${m.killsNeeded - m.kills} left`;
    case 'finale': return `${def.title}: reach the pier with the payoff`;
    default: return def.title;
  }
}

export function missionTarget(G) {
  const m = G.mission;
  if (!m.active) return null;
  if (m.stage === 'checkpoint') return m.checkpoints[m.checkpoint];
  if (m.target) return { x: m.target.x, y: m.target.y };
  return null;
}

function raceCheckpoints(G) {
  const p = G.player;
  return [
    { x: 1440, y: 960 }, { x: 2400, y: 1440 }, { x: 2880, y: 2400 },
    { x: 1920, y: 2880 }, { x: 960, y: 1920 }, { x: LANDMARKS.maraOffice.x, y: LANDMARKS.maraOffice.y },
  ].map((c) => ({ ...c, reached: false }));
}

export function startMission(G, index) {
  const def = MISSIONS[index];
  if (!def) return false;
  const m = {
    active: true, index, stage: 'go', timer: def.time, target: null,
    targetName: '', checkpoint: 0, checkpoints: [], kills: 0, killsNeeded: 0,
    parcels: 0, parcelsDone: 0, robProgress: 0, startedAt: G.time,
  };
  G.mission = m;
  const p = G.player;
  switch (def.kind) {
    case 'deliver':
      m.target = LANDMARKS.pier; m.targetName = 'Marina Pier'; m.stage = 'deliver';
      break;
    case 'race':
      m.checkpoints = raceCheckpoints(G); m.stage = 'checkpoint';
      break;
    case 'robbery':
      m.target = LANDMARKS.shopA; m.targetName = 'Corner Mart — North'; m.stage = 'go';
      break;
    case 'escort':
      m.target = LANDMARKS.diner; m.targetName = 'Sunset Diner'; m.stage = 'go';
      m.escort = { x: p.x + 60, y: p.y, hp: 100 };
      break;
    case 'escape':
      m.target = LANDMARKS.maraOffice; m.targetName = "Mara's Office"; m.stage = 'escape';
      // The cops are already on you.
      G.wanted.heat = 55; G.wanted.stars = 3; G.wanted.state = 'solid';
      G.wanted.lastSeenX = p.x; G.wanted.lastSeenY = p.y;
      break;
    case 'fight':
      m.killsNeeded = 6; m.stage = 'fight';
      G.gangs.active = true; G.gangs.timer = 2;
      break;
    case 'delivery':
      m.parcels = 3; m.parcelsDone = 0; m.stage = 'deliver';
      m.target = LANDMARKS.market; m.targetName = 'Mercado Central';
      G.hudMessage = 'Courier van parked at the depot — grab it!';
      G.hudTimer = 5;
      break;
    case 'finale':
      m.target = LANDMARKS.pier; m.targetName = 'Marina Pier'; m.stage = 'finale';
      G.gangs.active = true; G.gangs.timer = 3;
      break;
    default:
      m.target = LANDMARKS.pier; m.targetName = 'Marina Pier';
  }
  G.hudMessage = `${def.title} — ${def.brief}`;
  G.hudTimer = 6;
  return true;
}

function finishMission(G, success) {
  const m = G.mission;
  const def = MISSIONS[m.index];
  if (success) {
    let pay = def.reward;
    if (def.kind === 'delivery') pay += m.parcelsDone * 150;
    G.player.cash += pay;
    G.campaign.missionsDone.push(m.index);
    G.campaign.reputation += 10;
    G.floaters.push({ x: G.player.x, y: G.player.y - 30, text: `+$${pay} — ${def.title} complete!`, color: '#ffd23e', t: 0, life: 2.5 });
    G.hudMessage = `${def.title} complete! +$${pay} — ${def.unlock}`;
    G.hudTimer = 6;
    if (m.index === 0) G.gangs.active = true; // the Kings notice you now
    if (m.index === 7) G.ending = true;
  } else {
    G.hudMessage = `${def.title} failed — talk to Mara to retry`;
    G.hudTimer = 5;
  }
  G.mission = { active: false, index: -1, stage: '', timer: 0, target: null, targetName: '', checkpoint: 0, checkpoints: [], kills: 0, killsNeeded: 0, parcels: 0, parcelsDone: 0, robProgress: 0, startedAt: 0 };
}

export function updateMission(G, dt) {
  const m = G.mission;
  if (!m.active) return;
  const def = MISSIONS[m.index];
  m.timer -= dt;
  if (m.timer <= 0) { finishMission(G, false); return; }
  const p = G.player;
  const near = (t, r = 70) => t && dist(p.x, p.y, t.x, t.y) < r;

  switch (def.kind) {
    case 'deliver':
      if (near(m.target, 80)) finishMission(G, true);
      break;
    case 'race': {
      const cp = m.checkpoints[m.checkpoint];
      if (cp && near(cp, 90)) {
        m.checkpoint++;
        G.player.cash += 50;
        if (m.checkpoint >= m.checkpoints.length) finishMission(G, true);
      }
      break;
    }
    case 'robbery':
      if (m.stage === 'go' && near(m.target, 80)) { m.stage = 'rob'; G.hudMessage = 'Hold F to empty the till!'; G.hudTimer = 3; }
      else if (m.stage === 'rob') {
        if (near(m.target, 110) && G.robHeld) {
          m.robProgress += dt;
          if (m.robProgress >= 4) {
            m.stage = 'escape';
            m.target = LANDMARKS.maraOffice; m.targetName = "Mara's Office";
            G.wanted.heat = Math.max(G.wanted.heat, 45); G.wanted.stars = Math.max(G.wanted.stars, 2);
            G.wanted.state = 'hollow'; G.wanted.reportTimer = 2;
            G.hudMessage = 'Got the cash! Lose the heat and reach Mara.';
            G.hudTimer = 4;
          }
        } else if (!near(m.target, 110)) { m.robProgress = Math.max(0, m.robProgress - dt); }
      } else if (m.stage === 'escape' && near(m.target, 80) && G.wanted.stars <= 1) finishMission(G, true);
      break;
    case 'escort': {
      if (m.escort) {
        // The driver follows you; if he falls too far behind he catches up.
        const d = dist(m.escort.x, m.escort.y, p.x, p.y);
        if (d > 260) { m.escort.x = p.x - 40; m.escort.y = p.y + 40; }
        else if (d > 90) {
          const a = Math.atan2(p.y - m.escort.y, p.x - m.escort.x);
          m.escort.x += Math.cos(a) * 130 * dt;
          m.escort.y += Math.sin(a) * 130 * dt;
        }
        if (m.escort.hp <= 0) { finishMission(G, false); return; }
      }
      if (near(m.target, 80)) finishMission(G, true);
      break;
    }
    case 'escape':
      if (G.wanted.stars === 0 && near(m.target, 80)) finishMission(G, true);
      break;
    case 'fight':
      if (m.kills >= m.killsNeeded) finishMission(G, true);
      break;
    case 'delivery': {
      const drops = [LANDMARKS.market, LANDMARKS.diner, LANDMARKS.pier];
      const cur = drops[Math.min(m.parcelsDone, 2)];
      m.target = cur;
      m.targetName = cur.name;
      const inVan = p.inCar && p.inCar.typeKey === 'delivery';
      if (near(cur, 80) && inVan) {
        m.parcelsDone++;
        G.player.cash += 150;
        G.floaters.push({ x: p.x, y: p.y - 30, text: `Parcel ${m.parcelsDone}/3 delivered +$150`, color: '#ffd23e', t: 0, life: 1.6 });
        if (m.parcelsDone >= 3) finishMission(G, true);
      }
      break;
    }
    case 'finale':
      if (near(m.target, 80)) finishMission(G, true);
      break;
    default:
      if (near(m.target, 80)) finishMission(G, true);
  }
}

export function nextMissionIndex(G) {
  for (let i = 0; i < MISSIONS.length; i++) {
    if (!G.campaign.missionsDone.includes(i)) return i;
  }
  return -1;
}
