// SOLMAR NIGHTS v2.3 — shots.js
// The screenshot scenes behind ?shot=cover|drive|foot|title. Each one
// plays the real game forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot (drive toward a waypoint on the
// road grid, brake for walls), so the frame is what a short game really
// looks like and the same seed always gives the same frame. The cover is
// the chase: four stars, the police helicopter overhead, police behind,
// the minimap and a job on the HUD.

import { LANDMARKS, nearestRoadCentre, nearestRoadPoint } from './city.js';
import { STEP } from './config.js';
import { angleDiff, clamp } from './random.js';
import { aheadBlocked, carStep } from './physics.js';
import { startMission } from './missions.js';
import { updateWorld } from './world.js';

/** A fake input the autopilot drives with, shaped like createInput's. */
function fakeInput(drive) {
  return {
    mouse: { x: 640, y: 360, down: false, clicked: false },
    axes() { return drive.axes(); },
    down() { return false; },
    takeActions() { return 0; },
    consumeAnyKey() { return false; },
  };
}

/** Steer a car toward a point, braking for walls and for cars ahead. */
function driveToward(G, car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  let steer = clamp(angleDiff(car.angle, want) * 2.2, -1, 1);
  let throttle = car.speed < 300 ? 1 : 0;
  // Only a wall right at the nose counts: at an intersection the nose
  // sweeps past building corners, and braking for those stalls the car.
  if (aheadBlocked(G.city, car, 45)) throttle = 0;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    // A car ahead: crawl and swing around it instead of reversing into
    // the car behind — reversing is what used to stall the autopilot.
    if (forward > 0 && forward < 90 && side < 30) { throttle = 0.25; steer = clamp(steer + 0.45, -1, 1); break; }
  }
  return { throttle, steer, handbrake: false, gripScale: 1 - 0.25 * (G.weather?.rain ?? 0) };
}

/**
 * The robot driver: a Manhattan route on the road grid — down the current
 * road to the target's row, across to its column, then in to the target.
 * Straight-line steering gets stuck on buildings; the grid does not.
 */
function autopilotDrive(G, target) {
  let legs = null;
  let leg = 0;
  function computeLegs() {
    const car = G.player.inCar;
    const fx = nearestRoadCentre(car.x);
    const fy = nearestRoadCentre(car.y);
    const tx = nearestRoadCentre(target.x);
    const ty = nearestRoadCentre(target.y);
    legs = [];
    legs.push({ x: fx, y: fy });
    if (fy !== ty) legs.push({ x: fx, y: ty });
    if (fx !== tx) legs.push({ x: tx, y: ty });
    legs.push({ x: target.x, y: target.y });
    leg = 0;
  }
  return {
    axes() {
      const car = G.player.inCar;
      if (!car) return { x: 0, y: 0, sprint: false };
      if (!legs) computeLegs();
      const wp = legs[Math.min(leg, legs.length - 1)];
      if (Math.hypot(car.x - wp.x, car.y - wp.y) < 90 && leg < legs.length - 1) leg++;
      const d = driveToward(G, car, wp.x, wp.y);
      return { x: d.steer, y: d.throttle > 0 ? -1 : 1, sprint: false };
    },
  };
}

/** Put the player in a car of `type` at (x, y), facing `angle`. */
function giveCar(G, type, x, y, angle) {
  const car = {
    x, y, angle, vx: 0, vy: 0, speed: 0, slip: 0,
    type: G.types[type], typeKey: type,
    color: type === 'sports' ? '#e74c3c' : type === 'delivery' ? '#ff8c42' : '#2e86c1',
    hp: G.types[type].hp, maxHp: G.types[type].hp,
    ai: null, driver: 'player', dead: false, dir: 0, target: null, brakeTimer: 0, shootCd: 0,
    honkTimer: 0, stuckTimer: 0, lastX: x, lastY: y,
  };
  G.cars.push(car);
  G.player.inCar = car;
  G.player.x = x; G.player.y = y; G.player.angle = angle;
  return car;
}

function givePolice(G, n) {
  // Spawn the pursuit behind the player's route (west of the start,
  // since the chase runs east along the 1920 road) so they chase into
  // the frame instead of pinning the car before it can move.
  for (let i = 0; i < n; i++) {
    const spread = (i - (n - 1) / 2) * 220;
    const spot = nearestRoadPoint(G.player.x - 620 - i * 60, G.player.y + spread);
    const x = spot.x;
    const y = spot.y;
    const car = {
      x, y, angle: 0, vx: 0, vy: 0, speed: 0, slip: 0,
      type: G.types.police, typeKey: 'police', color: '#eef2f7',
      hp: 160, maxHp: 160, ai: 'police', driver: 'ai', dead: false,
      dir: 0, target: null, brakeTimer: 0, shootCd: 1, honkTimer: 0, stuckTimer: 0, lastX: x, lastY: y,
    };
    G.cars.push(car);
  }
}

/**
 * Set up scene `name` on a fresh world G and play it forward with the
 * autopilot. Returns the number of fixed steps to run. `audio` is a
 * silent stand-in (the shot page never unlocks real audio).
 */
export function runShotScene(G, name, audio) {
  const p = G.player;
  if (name === 'cover') {
    // Straight east along the 1920 road: no turns, so the chase reads
    // as speed instead of a traffic jam at an intersection.
    giveCar(G, 'sports', 1440, 1920, 0);
    startMission(G, 0);
    G.wanted.heat = 85; G.wanted.stars = 4; G.wanted.state = 'solid';
    G.wanted.lastSeenX = p.x; G.wanted.lastSeenY = p.y;
    G.wanted.evidence.cctv = true; G.wanted.evidence.outfit = true; G.wanted.evidence.car = true;
    givePolice(G, 3);
    G._policeTimer = 6; // no extra spawns during the short chase scene
    G.heli.active = true;
    G.heli.x = p.x - 200; G.heli.y = p.y - 260;
    G.dayTime = 17.5 * 3600; // low sun, dusk
    const drive = autopilotDrive(G, { x: 2880, y: 1920 });
    const input = fakeInput(drive);
    for (let i = 0; i < 60 * 3; i++) updateWorld(G, input, audio, STEP, 'play', 0);
    return 60 * 3;
  }
  if (name === 'drive') {
    giveCar(G, 'delivery', 3360, 2760, Math.PI);
    startMission(G, 6);
    G.dayTime = 17 * 3600;
    const drive = autopilotDrive(G, LANDMARKS.market);
    const input = fakeInput(drive);
    for (let i = 0; i < 60 * 10; i++) updateWorld(G, input, audio, STEP, 'play', 0);
    return 60 * 10;
  }
  if (name === 'foot') {
    p.x = 1920; p.y = 1920; p.angle = 0;
    G.camera.x = p.x; G.camera.y = p.y;
    startMission(G, 0);
    G.weather.kind = 'fog'; G.weather.fog = 0.8;
    G.dayTime = 12 * 3600;
    const input = {
      mouse: { x: 700, y: 360, down: false, clicked: false },
      axes() { return { x: 0.4, y: -0.6, sprint: false }; },
      down() { return false; },
      takeActions() { return 0; },
      consumeAnyKey() { return false; },
    };
    for (let i = 0; i < 60 * 6; i++) updateWorld(G, input, audio, STEP, 'play', 0);
    return 60 * 6;
  }
  // 'title' needs no play: the title screen draws the world behind it.
  G.dayTime = 17.5 * 3600;
  return 0;
}
