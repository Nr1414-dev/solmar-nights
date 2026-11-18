// SOLMAR NIGHTS — shots.js
// The screenshot scenes behind ?shot=cover|drive|foot|title. Each one plays
// the real game forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (drive toward a waypoint, brake for walls,
// walk toward a marker), so the frame is what a short game really looks
// like and the same seed always gives the same frame. The cover is the
// chase: three stars, police behind, the minimap and a job on the HUD.

import { LANDMARKS, nearestRoadCentre, nearestRoadPoint } from './city.js';
import { STEP } from './config.js';
import { angleDiff, clamp } from './random.js';
import { aheadBlocked, carStep } from './physics.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { startMission } from './missions.js';
import { updateWorld } from './world.js';

/** A fake input the autopilot drives with, shaped like createInput's. */
function fakeInput(G, drive) {
  return {
    mouse: { x: 640, y: 360, down: false, clicked: false },
    axes() {
      return drive.axes();
    },
    down() {
      return false;
    },
    takeActions() {
      return 0;
    },
    consumeAnyKey() {
      return false;
    },
  };
}

/** Steer a car toward a point, braking for walls and for cars ahead. */
function driveToward(G, car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDiff(car.angle, want) * 2.2, -1, 1);
  let throttle = car.speed < 300 ? 1 : 0;
  if (aheadBlocked(G.city, car, 90)) throttle = -0.7;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (forward > 0 && forward < 90 && side < 30) { throttle = -0.7; break; }
  }
  return { throttle, steer, handbrake: false };
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
    // First get to the nearest intersection, then cross the grid.
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
    color: type === 'sports' ? '#e74c3c' : '#2e86c1',
    hp: G.types[type].hp, maxHp: G.types[type].hp,
    ai: null, driver: 'player', dead: false, dir: 0, target: null, brakeTimer: 0, shootCd: 0,
  };
  G.cars.push(car);
  G.player.inCar = car;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  car.vx = Math.cos(angle) * 160;
  car.vy = Math.sin(angle) * 160;
  return car;
}

function runSteps(G, audio, input, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) updateWorld(G, input, audio, STEP, SCREEN_PLAY);
}

/**
 * Set the world to the named scene and return the screen to draw over it.
 * Names: cover (police chase), drive (downtown cruise), foot (job on foot),
 * title (the menu). Any other name is the title.
 */
export function stageShot(name, G, audio) {
  if (name === 'title') return { screen: SCREEN_TITLE };
  if (name === 'drive') {
    G.clock = 0.74; // low sun over the marina
    giveCar(G, 'sports', 1500, 1440, Math.PI); // west along the avenue, toward the garage
    startMission(G, 0);
    G.mission.phase = 1; // already stolen: drive to the garage
    const input = fakeInput(G, autopilotDrive(G, { x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y }));
    // Five seconds: still en route, the job objective still on the HUD.
    runSteps(G, audio, input, 5);
    G.banner = { title: 'FIRST WHEELS', sub: 'Drive the car to Mara\'s garage', t: 0, dur: 6 };
    return { screen: SCREEN_PLAY };
  }
  if (name === 'foot') {
    G.clock = 0.6; // bright midday
    G.player.x = 1850;
    G.player.y = 2100;
    G.player.angle = -Math.PI / 2;
    G.camera.x = 1850;
    G.camera.y = 2100;
    startMission(G, 3); // The Collection
    // Walk the player toward the downtown cash drop.
    const target = { x: 1920, y: 2880 };
    const input = fakeInput(G, {
      axes() {
        const dx = target.x - G.player.x;
        const dy = target.y - G.player.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: dx / len, y: dy / len, sprint: true };
      },
    });
    input.mouse = { x: 640, y: 200, down: false, clicked: false };
    runSteps(G, audio, input, 4);
    G.player.angle = Math.atan2(target.y - G.player.y, target.x - G.player.x);
    // The job banner has done its work; the frame is about the street.
    G.banner = null;
    return { screen: SCREEN_PLAY };
  }
  // cover: the chase. Three stars, police behind, dusk, downtown.
  G.clock = 0.78;
  giveCar(G, 'sports', 1920, 1920, 0);
  startMission(G, 2); // Heat Wave: the alarm already tripped
  G.wanted.heat = 70;
  const input = fakeInput(G, autopilotDrive(G, { x: 3700, y: 1920 }));
  // Five and a half seconds: the car is still flying down the avenue
  // toward the docks, the chase hot behind it — any longer and the rams
  // pin it to a stop.
  runSteps(G, audio, input, 5.5);
  // Make sure the chase reads: at least three police cars trailing behind.
  const p = G.player;
  let cops = G.cars.filter((c) => c.ai === 'police' && !c.dead);
  let guard = 0;
  while (cops.length < 3 && guard < 6) {
    guard++;
    const back = p.angle + Math.PI + (guard - 2) * 0.35;
    const spot = nearestRoadPoint(p.x + Math.cos(back) * 430, p.y + Math.sin(back) * 430);
    const car = {
      x: spot.x, y: spot.y, angle: Math.atan2(p.y - spot.y, p.x - spot.x),
      vx: 0, vy: 0, speed: 0, slip: 0,
      type: G.types.police, typeKey: 'police', color: '#1a5276',
      hp: 160, maxHp: 160, ai: 'police', driver: 'police', dead: false,
      dir: 0, target: null, brakeTimer: 0, shootCd: 0,
    };
    car.vx = Math.cos(car.angle) * 240;
    car.vy = Math.sin(car.angle) * 240;
    G.cars.push(car);
    cops = G.cars.filter((c) => c.ai === 'police' && !c.dead);
  }
  runSteps(G, audio, input, 1.2);
  // A chase cover wants motion: keep rolling until the car is really moving.
  for (let tries = 0; tries < 3 && Math.abs(G.player.inCar?.speed ?? 0) < 120; tries++) {
    runSteps(G, audio, input, 1.5);
  }
  G.banner = { title: 'HEAT WAVE', sub: 'Three stars. Lose the cops — break line of sight and stay hidden.', t: 0, dur: 6 };
  return { screen: SCREEN_PLAY };
}
