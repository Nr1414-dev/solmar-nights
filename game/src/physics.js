// SOLMAR NIGHTS — physics.js
// Small, dependency-free geometry and movement helpers: angles, circle-vs-
// rectangle collision against buildings, and the shared car handling model
// used by the player, traffic and police alike.

export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function distSq(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
}

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function turnToward(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Push a circle out of a rectangle. Returns true when a collision happened.
// The circle is treated as a point with radius r; the rectangle is an AABB.
export function resolveCircleRect(obj, r, rect) {
  const nx = clamp(obj.x, rect.x, rect.x + rect.w);
  const ny = clamp(obj.y, rect.y, rect.y + rect.h);
  let dx = obj.x - nx, dy = obj.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    obj.x += dx * push;
    obj.y += dy * push;
  } else {
    // Centre inside the rect: push out along the smallest penetration axis.
    const left = obj.x - rect.x, right = rect.x + rect.w - obj.x;
    const top = obj.y - rect.y, bottom = rect.y + rect.h - obj.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) obj.x = rect.x - r;
    else if (m === right) obj.x = rect.x + rect.w + r;
    else if (m === top) obj.y = rect.y - r;
    else obj.y = rect.y + rect.h + r;
  }
  return true;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// A car is a rotated rectangle; approximate it with a circle at its centre
// plus two circles at the ends for collision and for "is this point inside".
export function carCircles(car, def) {
  const half = def.len / 2 - 6;
  const c = Math.cos(car.angle), s = Math.sin(car.angle);
  return [
    { x: car.x - c * half, y: car.y - s * half, r: def.wid / 2 + 2 },
    { x: car.x, y: car.y, r: def.wid / 2 + 2 },
    { x: car.x + c * half, y: car.y + s * half, r: def.wid / 2 + 2 },
  ];
}

// One step of arcade car handling. `car` carries {angle, speed}; `def` is a
// VEHICLES entry; throttle in -1..1, steer in -1..1. Returns nothing, mutates.
// Rain (slick) is passed in as a grip multiplier.
export function stepCar(car, def, throttle, steer, dt, gripMul = 1) {
  const grip = def.grip * gripMul;
  if (throttle > 0) car.speed += def.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 5) car.speed -= def.accel * 1.6 * dt; // brake
    else car.speed += def.reverse * throttle * dt; // reverse (throttle negative)
  }
  // Drag + rolling resistance.
  car.speed -= car.speed * 0.55 * dt;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -def.reverse, def.top);
  // Steering scales with speed but never reverses the car at standstill.
  const steerAuthority = clamp(Math.abs(car.speed) / 120, 0, 1);
  car.angle += steer * grip * 0.9 * steerAuthority * dt * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

// Keep an entity inside the city bounds with a soft bounce.
export function clampToCity(obj, margin = 60) {
  const { WORLD } = { WORLD: 3840 };
  obj.x = clamp(obj.x, margin, WORLD - margin);
  obj.y = clamp(obj.y, margin, WORLD - margin);
}
