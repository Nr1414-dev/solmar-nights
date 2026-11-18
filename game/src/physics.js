// SOLMAR NIGHTS v2.3 — physics.js
// Car physics and collision. A car keeps a world velocity vector; each
// step splits it into forward and lateral parts, decays the lateral part
// by grip (that is the whole drift model), and adds engine/brake force
// along the heading. Collisions are circle-vs-building and circle-vs-car
// so nothing ever needs a physics library.

import { FIRST_ROAD, LAST_ROAD, ROAD_W, WORLD } from './config.js';
import { circleBlocked } from './city.js';
import { angleDiff, clamp } from './random.js';

export function carRadius(car) {
  return Math.max(car.type.w, car.type.h) * 0.62;
}

// Drive one car one step. `drive` is {throttle -1..1, steer -1..1,
// handbrake, gripScale}. Returns nothing; mutates the car.
export function carStep(car, drive, dt, city) {
  const t = car.type;
  const grip = (drive.handbrake ? t.gripHand : t.grip) * (drive.gripScale ?? 1);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  // Split velocity into forward / lateral.
  let fwd = car.vx * fx + car.vy * fy;
  let lat = -car.vx * fy + car.vy * fx;
  const latDecay = Math.exp(-grip * dt);
  lat *= latDecay;
  car.slip = Math.abs(lat);
  if (drive.throttle > 0) fwd += t.accel * drive.throttle * dt;
  else if (drive.throttle < 0) {
    if (fwd > 8) fwd += t.brake * drive.throttle * dt;
    else fwd += t.accel * 0.55 * drive.throttle * dt;
  } else {
    // Coast: drag toward zero.
    const drag = t.coast * dt;
    fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), drag);
  }
  const vMax = drive.throttle < 0 && fwd < 0 ? -t.revMax : t.vMax;
  fwd = clamp(fwd, -t.revMax, vMax);
  // Steering only bites while moving; faster = a little less lock.
  const speedFactor = clamp(Math.abs(fwd) / 140, 0, 1);
  const steerRate = t.steer * (1 - 0.45 * speedFactor) * Math.sign(fwd || 1);
  car.angle += drive.steer * steerRate * dt * clamp(Math.abs(fwd) / 60, 0.25, 1);
  car.vx = fx * fwd - fy * lat;
  car.vy = fy * fwd + fx * lat;
  car.speed = fwd;
  const nx = car.x + car.vx * dt;
  const ny = car.y + car.vy * dt;
  const r = carRadius(car) * 0.8;
  if (!circleBlocked(city, nx, car.y, r)) car.x = nx;
  else { car.vx *= -0.25; car.speed *= 0.4; if (Math.abs(car.speed) > 240) car.hp -= 1; }
  if (!circleBlocked(city, car.x, ny, r)) car.y = ny;
  else { car.vy *= -0.25; car.speed *= 0.4; if (Math.abs(car.speed) > 240) car.hp -= 1; }
  car.x = clamp(car.x, 24, WORLD - 24);
  car.y = clamp(car.y, 24, WORLD - 24);
  if (car.hp <= 0 && !car.dead) { car.dead = true; car.hp = 0; }
}

// Push two overlapping cars apart and swap a little momentum.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = carRadius(a) * 0.8 + carRadius(b) * 0.8;
  if (d <= 0.01 || d >= min) return;
  const push = (min - d) / 2;
  const nx = dx / d; const ny = dy / d;
  const wa = a.type.mass; const wb = b.type.mass;
  a.x -= nx * push * (wb / (wa + wb)) * 2 * 0.5;
  a.y -= ny * push * (wb / (wa + wb)) * 2 * 0.5;
  b.x += nx * push * (wa / (wa + wb)) * 2 * 0.5;
  b.y += ny * push * (wa / (wa + wb)) * 2 * 0.5;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const imp = -rel * 0.5;
    a.vx -= nx * imp / wa; a.vy -= ny * imp / wa;
    b.vx += nx * imp / wb; b.vy += ny * imp / wb;
    a.hp -= Math.abs(rel) * 0.02; b.hp -= Math.abs(rel) * 0.02;
  }
}

// Is there a building or the map edge within `d` ahead of the car?
export function aheadBlocked(city, car, d) {
  const fx = Math.cos(car.angle); const fy = Math.sin(car.angle);
  for (let s = 12; s <= d; s += 12) {
    if (circleBlocked(city, car.x + fx * s, car.y + fy * s, 10)) return true;
  }
  return false;
}

export function turnToward(current, target, maxStep) {
  const d = angleDiff(current, target);
  return current + clamp(d, -maxStep, maxStep);
}

// Helicopter orbit: close in, then circle the target at `radius`.
export function heliStep(heli, tx, ty, dt, speed, radius, wobble) {
  const dx = tx - heli.x; const dy = ty - heli.y;
  const d = Math.hypot(dx, dy) || 1;
  heli.orbit = (heli.orbit ?? 0) + dt * 0.55;
  const wantX = tx + Math.cos(heli.orbit) * radius;
  const wantY = ty + Math.sin(heli.orbit) * radius;
  const wx = wantX - heli.x; const wy = wantY - heli.y;
  const wd = Math.hypot(wx, wy) || 1;
  const sp = d > radius * 1.6 ? speed : speed * 0.55;
  heli.x += (wx / wd) * sp * dt;
  heli.y += (wy / wd) * sp * dt;
  heli.x += Math.sin(heli.orbit * 2.3) * wobble * dt;
  heli.y += Math.cos(heli.orbit * 1.7) * wobble * dt;
  heli.angle = Math.atan2(wy, wx);
}
