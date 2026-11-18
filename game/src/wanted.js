// SOLMAR NIGHTS v2.3 — wanted.js
// The wanted system, modelled on the modern crime-game rules the research
// describes: a crime only counts when somebody sees it. Each star has a
// state — hollow (reported, police heading to the scene without a
// description), solid white (a cop sees you right now, active chase),
// flashing white (line of sight broken, police searching your last known
// position), red (you escaped, but the area stays hot and the police
// remember your description; walk back in looking the same and the chase
// restarts). Under the stars sit evidence icons — CCTV, outfit, face,
// vehicle, weapon — each cleared its own way.

import { WANTED } from './config.js';
import { circleBlocked } from './city.js';
import { clamp, dist } from './random.js';

export function createWanted() {
  return {
    heat: 0,
    stars: 0,
    state: 'none', // none | hollow | solid | flashing | red
    lastSeenX: 0, lastSeenY: 0,
    seenTimer: 0,
    hideTimer: 0,
    hotX: 0, hotY: 0, hotRadius: 0, hotTimer: 0,
    evidence: { cctv: false, outfit: false, face: false, car: false, weapon: false },
    evidenceTimer: { cctv: 0 },
    reportTimer: 0, // a witness is on the phone; police arrive when it ends
    reported: false,
  };
}

export function wantedStars(w) { return w.stars; }

export function wantedLabel(stars) {
  return ['Clean', 'One Star', 'Two Stars', 'Three Stars', 'Four Stars', 'Five Stars', 'Six Stars'][stars] ?? 'Clean';
}

// Line of sight: sample the segment; a building in the way blocks it.
export function hasLineOfSight(G, x1, y1, x2, y2) {
  const d = dist(x1, y1, x2, y2);
  const steps = Math.ceil(d / 24);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (circleBlocked(G.city, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 6)) return false;
  }
  return true;
}

function starsForHeat(heat) {
  let s = 0;
  for (let i = 1; i < WANTED.HEAT_PER_STAR.length; i++) {
    if (heat >= WANTED.HEAT_PER_STAR[i]) s = i;
  }
  return Math.min(s, 6);
}

// A crime happened at (x,y). It only becomes heat if a witness can see
// it — a pedestrian or a cop within range with line of sight, or a CCTV
// camera. Unseen crimes still add a little heat if the victim screams:
// the `witnessed` flag is computed by the caller.
export function addCrime(G, kind, x, y, witnessed) {
  const w = G.wanted;
  const base = WANTED.CRIME[kind] ?? 15;
  const p = G.player;
  if (!witnessed) {
    // Nobody saw it: a whisper of heat, and only if it was loud.
    if (kind === 'shoot' || kind === 'explosion') w.heat = Math.min(115, w.heat + base * 0.15);
    return;
  }
  w.heat = Math.min(115, w.heat + base);
  w.stars = starsForHeat(w.heat);
  // The witness starts a report: police head to the scene (hollow star)
  // unless a cop already sees you (solid star).
  if (w.state === 'none' || w.state === 'red') {
    w.state = 'hollow';
    w.reportTimer = 3;
    w.hotX = x; w.hotY = y; w.hotRadius = 420; w.hotTimer = 90;
  }
  // Evidence accumulates with the crime.
  if (kind === 'shoot' || kind === 'killPed' || kind === 'killCop') {
    w.evidence.weapon = p.weapon !== 'fists';
    w.evidence.face = true;
    w.evidence.outfit = true;
  }
  if (kind === 'stealCar' || kind === 'runOver') w.evidence.car = true;
  // CCTV: if a camera covers the spot, the tape exists.
  for (const cam of G.city.cameras) {
    if (dist(x, y, cam.x, cam.y) < cam.r) {
      w.evidence.cctv = true;
      w.evidenceTimer.cctv = 120;
      break;
    }
  }
  if (w.stars > G.campaign.bestStars) G.campaign.bestStars = w.stars;
}

export function clearWanted(G) {
  const w = G.wanted;
  w.heat = 0; w.stars = 0; w.state = 'none';
  w.hideTimer = 0; w.hotTimer = 0; w.reportTimer = 0; w.reported = false;
  w.evidence = { cctv: false, outfit: false, face: false, car: false, weapon: false };
}

// Evidence clears, each its own way:
//  cctv — the tape ages out after 120s, or a spray-shop visit wipes it;
//  outfit — change clothes at Marina Threads;
//  face — a spray-shop respray + time, or a full escape to red then leaving;
//  car — ditch the car (get out and walk away) or respray it;
//  weapon — holster / ditch the weapon (switch to fists).
export function clearEvidence(G, kind) {
  const w = G.wanted;
  if (kind === 'outfit') { w.evidence.outfit = false; G.player.outfit = (G.player.outfit + 1) % 4; }
  if (kind === 'car') w.evidence.car = false;
  if (kind === 'cctv') { w.evidence.cctv = false; w.evidenceTimer.cctv = 0; }
  if (kind === 'weapon') { w.evidence.weapon = false; G.player.weapon = 'fists'; }
  if (kind === 'face') w.evidence.face = false;
}

export function heliSeesPlayer(G) {
  const h = G.heli;
  if (!h || !h.active) return false;
  const p = G.player;
  if (dist(h.x, h.y, p.x, p.y) > WANTED.HELI_SPOT_RADIUS + 120) return false;
  return hasLineOfSight(G, h.x, h.y, p.x, p.y);
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  const p = G.player;
  // CCTV tape ages out on its own.
  if (w.evidence.cctv) {
    w.evidenceTimer.cctv -= dt;
    if (w.evidenceTimer.cctv <= 0) w.evidence.cctv = false;
  }
  // A witness report finishes: hollow -> solid if a cop is near, else
  // the police still come to look (hollow stays, they search the scene).
  if (w.reportTimer > 0) {
    w.reportTimer -= dt;
    if (w.reportTimer <= 0) w.reported = true;
  }
  // Does any cop see the player right now?
  let copSees = false;
  for (const cop of G.cops) {
    if (cop.dead) continue;
    if (dist(cop.x, cop.y, p.x, p.y) < WANTED.SIGHT_RANGE && hasLineOfSight(G, cop.x, cop.y, p.x, p.y)) { copSees = true; break; }
  }
  for (const car of G.cars) {
    if (car.ai !== 'police' || car.dead) continue;
    if (dist(car.x, car.y, p.x, p.y) < WANTED.SIGHT_RANGE && hasLineOfSight(G, car.x, car.y, p.x, p.y)) { copSees = true; break; }
  }
  if (G.heli.active && heliSeesPlayer(G)) copSees = true;

  if (w.stars > 0) {
    if (copSees) {
      w.state = 'solid';
      w.lastSeenX = p.x; w.lastSeenY = p.y;
      w.seenTimer = 0;
      w.hideTimer = 0;
    } else if (w.state === 'solid') {
      w.state = 'flashing';
      w.seenTimer = 0;
    } else if (w.state === 'flashing') {
      w.seenTimer += dt;
      // Hidden long enough: drop one star.
      if (w.seenTimer > WANTED.HIDE_TIME[w.stars]) {
        w.heat = Math.max(0, w.heat - 26);
        const ns = starsForHeat(w.heat);
        if (ns < w.stars) {
          w.stars = ns;
          w.seenTimer = 0;
          if (ns === 0) {
            // Escaped — but the area stays hot and they remember you.
            w.state = 'red';
            w.hotX = w.lastSeenX; w.hotY = w.lastSeenY;
            w.hotRadius = 520; w.hotTimer = 75;
            w.hideTimer = 0;
          } else {
            w.state = 'flashing';
          }
        }
      }
    } else if (w.state === 'hollow') {
      // Police arrive at the scene; if they find you there, it goes solid.
      w.seenTimer += dt;
      if (w.seenTimer > 25) {
        w.heat = Math.max(0, w.heat - 20);
        w.stars = starsForHeat(w.heat);
        w.seenTimer = 0;
        if (w.stars === 0) { w.state = 'none'; }
      }
    }
  }
  if (w.state === 'red') {
    w.hotTimer -= dt;
    // Walking back into the hot area looking the same restarts the chase.
    const inHot = dist(p.x, p.y, w.hotX, w.hotY) < w.hotRadius;
    const recognisable = w.evidence.outfit || w.evidence.face || w.evidence.car;
    if (inHot && recognisable) {
      w.heat = Math.max(w.heat, 30);
      w.stars = starsForHeat(w.heat);
      w.state = 'hollow';
      w.reportTimer = 2;
    }
    if (w.hotTimer <= 0) {
      w.state = 'none';
      w.evidence.outfit = false;
      w.evidence.face = false;
      w.evidence.car = false;
    }
  }
  // Standing in the crime area makes you easy to find: hide timer stalls.
  if (w.state === 'flashing' && dist(p.x, p.y, w.hotX, w.hotY) < w.hotRadius * 0.6) {
    w.seenTimer = Math.max(0, w.seenTimer - dt * 0.8);
  }
  w.heat = clamp(w.heat, 0, 115);
}
