// SOLMAR NIGHTS — physics.js
// Car physics and collision. A car keeps a world velocity vector; each step
// splits it into forward and lateral parts, the lateral part decaying by the
// grip model, so a handbrake turn really slides. Collisions are circles
// (two per car, nose and tail) against the city's rectangles, and circles
// against each other for car-to-car bumps.

import { circleBlocked, resolveCircle } from './city.js';
import { clamp } from './random.js';

export function carRadius(car) {
  return Math.max(car.type.w, car.type.h) * 0.42;
}

/**
 * One physics step for a car. `drive` is { throttle: -1..1, steer: -1..1,
 * handbrake: bool }. Returns the impact speed when the car hit something
 * hard this step (0 otherwise), so the caller can spark, shake and charge
 * damage for it.
 */
export function carStep(car, drive, dt, city) {
  const t = car.type;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let fSpeed = car.vx * fx + car.vy * fy;
  let latX = car.vx - fSpeed * fx;
  let latY = car.vy - fSpeed * fy;

  // Steering authority grows with speed, then saturates; reversing flips it.
  const steerAuthority = clamp(Math.abs(fSpeed) / 70, 0, 1);
  car.angle += drive.steer * t.steer * steerAuthority * dt * (fSpeed < -1 ? -1 : 1);
  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  fSpeed = car.vx * nfx + car.vy * nfy;
  latX = car.vx - fSpeed * nfx;
  latY = car.vy - fSpeed * nfy;

  if (drive.throttle > 0) {
    fSpeed = Math.min(fSpeed + t.accel * dt, t.vMax);
  } else if (drive.throttle < 0) {
    if (fSpeed > 8) fSpeed = Math.max(fSpeed - t.brake * dt, 0);
    else fSpeed = Math.max(fSpeed - t.accel * 0.55 * dt, -t.revMax);
  } else {
    fSpeed -= Math.sign(fSpeed) * Math.min(Math.abs(fSpeed), t.coast * dt);
  }

  // `drive.gripScale` lets the world slick the roads (rain) without
  // touching the car's own handling numbers: grip is the whole drift
  // model, so scaling it scales the slide.
  const grip = (drive.handbrake ? t.gripHand : t.grip) * (drive.gripScale ?? 1);
  const decay = Math.exp(-grip * dt);
  latX *= decay;
  latY *= decay;
  car.vx = fSpeed * nfx + latX;
  car.vy = fSpeed * nfy + latY;
  car.speed = fSpeed;
  car.handbrake = drive.handbrake;
  car.slip = Math.hypot(latX, latY);

  const prevX = car.x;
  const prevY = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Nose and tail circles against the city. A hard stop is an impact.
  let impact = 0;
  const half = t.w / 4;
  for (const s of [1, -1]) {
    const probe = { x: car.x + nfx * half * s, y: car.y + nfy * half * s };
    const r = t.h / 2 + 1;
    if (circleBlocked(city, probe.x, probe.y, r)) {
      const before = Math.hypot(car.vx, car.vy);
      resolveCircle(city, probe, r);
      car.x += probe.x - (car.x + nfx * half * s);
      car.y += probe.y - (car.y + nfy * half * s);
      const after = Math.hypot(car.vx, car.vy);
      // Kill the velocity into the wall, keep the slide along it.
      const nx = probe.x - car.x;
      const ny = probe.y - car.y;
      const nl = Math.hypot(nx, ny) || 1;
      const into = (car.vx * nx + car.vy * ny) / nl;
      if (into < 0) {
        car.vx -= (nx / nl) * into * 1.4;
        car.vy -= (ny / nl) * into * 1.4;
      }
      impact = Math.max(impact, before - after);
    }
  }
  // If the body still overlaps after the nose/tail pushes, nudge it free.
  if (circleBlocked(city, car.x, car.y, t.h / 2)) {
    resolveCircle(city, car, t.h / 2);
    car.x = car.x;
    car.y = car.y;
    void prevX;
    void prevY;
  }
  return impact;
}

/** Push two cars apart and trade a little velocity; returns impact speed. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ra = carRadius(a);
  const rb = carRadius(b);
  const d = Math.hypot(dx, dy);
  const min = ra + rb;
  if (d >= min || d < 0.01) return 0;
  const nx = dx / d;
  const ny = dy / d;
  const overlap = min - d;
  const totalMass = a.type.mass + b.type.mass;
  a.x -= nx * overlap * (b.type.mass / totalMass);
  a.y -= ny * overlap * (b.type.mass / totalMass);
  b.x += nx * overlap * (a.type.mass / totalMass);
  b.y += ny * overlap * (a.type.mass / totalMass);
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const impulse = -rel * 0.7;
    a.vx -= nx * impulse * (b.type.mass / totalMass);
    a.vy -= ny * impulse * (b.type.mass / totalMass);
    b.vx += nx * impulse * (a.type.mass / totalMass);
    b.vy += ny * impulse * (a.type.mass / totalMass);
    return -rel;
  }
  return 0;
}

/** Is the point ahead of `car` (distance `d`) blocked? Used by traffic AI. */
export function aheadBlocked(city, car, d) {
  const x = car.x + Math.cos(car.angle) * d;
  const y = car.y + Math.sin(car.angle) * d;
  return circleBlocked(city, x, y, 10);
}
