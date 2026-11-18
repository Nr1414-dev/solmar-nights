// SOLMAR NIGHTS — world.js
// The living city: one state object and one update. The player (on foot or
// in a car), traffic that follows the road grid, pedestrians who walk the
// sidewalks and flee trouble, police who chase by wanted level, the taxi
// side job, shops, pickups, particles and the camera. Missions plug in from
// missions.js; the wanted rules from wanted.js.

import { DAY_LENGTH, ECONOMY, LANE_OFFSET, PLAYER, VEHICLE_TYPES, WANTED } from './config.js';
import { LANDMARKS, ROAD_CENTRES, createCity, circleBlocked, districtNameAt, isOnRoad, nearestRoadCentre, nearestRoadPoint, randomSidewalkSpot, resolveCircle } from './city.js';
import { createRandom, angleDiff, clamp, dist } from './random.js';
import { aheadBlocked, carRadius, carStep, collideCars } from './physics.js';
import { addCrime, clearWanted, createWanted, updateWanted } from './wanted.js';
import { MISSIONS, missionTarget, startMission, updateMission } from './missions.js';

const PED_SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8', '#00cec9'];
const PED_SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const CAR_COLORS = {
  sedan: ['#c0392b', '#2e86c1', '#e67e22', '#7d3c98', '#16a085', '#b7950b', '#5d6d7e'],
  sports: ['#e74c3c', '#8e44ad', '#3498db', '#f39c12', '#ecf0f1'],
  pickup: ['#5d6d7e', '#935116', '#2e4053'],
  van: ['#aeb6bf', '#7f8c8d', '#d5dbdb'],
  truck: ['#6e510f', '#5d6d7e', '#922b21'],
};

function randColor(rng, type) {
  const list = CAR_COLORS[type] ?? CAR_COLORS.sedan;
  return list[Math.floor(rng.next() * list.length)];
}

export function createWorld(seed, save) {
  const city = createCity(seed);
  const rng = createRandom((seed ^ 0x9e3779b9) >>> 0);
  const G = {
    seed,
    city,
    rng,
    types: VEHICLE_TYPES,
    time: 0,
    clock: 0.72, // golden hour: the sun low over the marina
    player: {
      x: 620, y: 640, angle: 0, vx: 0, vy: 0, hp: PLAYER.MAX_HP,
      cash: save?.cash ?? ECONOMY.START_CASH,
      ammo: save?.ammo ?? 12,
      inCar: null, punchCd: 0, shootCd: 0, lastDamage: 99, moving: false,
    },
    cars: [],
    peds: [],
    police: [],
    rivals: [],
    particles: [],
    skidmarks: [],
    floaters: [],
    pickups: [],
    wanted: createWanted(),
    mission: { index: save?.missionIndex ?? 0, active: false, phase: 0, data: {}, timer: 0, def: null },
    missionIndex: save?.missionIndex ?? 0,
    missionCooldown: 0,
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, fares: 0, packages: save?.packages ?? 0 },
    taxi: { state: 'none', passenger: null, dest: null, fare: 0, cooldown: 0 },
    camera: { x: 620, y: 640, zoom: 1, trauma: 0, ox: 0, oy: 0 },
    banner: null,
    toast: null,
    prompt: null,
    nearShop: null,
    flags: { busted: false, wasted: false, ending: false },
    saveNeeded: false,
    audio: null,
    lastShot: null,
    lastExplosion: null,
    district: 'Midtown',
    playSeconds: 0,
  };

  spawnParkedCars(G);
  spawnTraffic(G, 14);
  for (let i = 0; i < 42; i++) spawnPed(G, true);
  spawnPickups(G, save);
  return G;
}

function spawnPickups(G, save) {
  const taken = new Set(save?.takenPackages ?? []);
  for (let i = 0; i < 12; i++) {
    const spot = randomSidewalkSpot(G.city, G.rng, 1920, 1920, 1700);
    if (taken.has(i)) continue;
    G.pickups.push({ kind: 'package', x: spot.x, y: spot.y, taken: false, id: i, bob: G.rng.range(0, 6) });
  }
  for (let i = 0; i < 6; i++) {
    const spot = randomSidewalkSpot(G.city, G.rng, 1920, 1920, 1700);
    G.pickups.push({ kind: 'health', x: spot.x, y: spot.y, taken: false, respawn: 0, bob: 0 });
  }
}

function spawnCar(G, x, y, angle, typeKey, ai, color) {
  const car = {
    x, y, angle, vx: 0, vy: 0, speed: 0, slip: 0,
    type: VEHICLE_TYPES[typeKey],
    typeKey,
    color: color ?? randColor(G.rng, typeKey),
    hp: VEHICLE_TYPES[typeKey].hp,
    maxHp: VEHICLE_TYPES[typeKey].hp,
    ai: ai ?? null,
    driver: ai === 'traffic' ? 'traffic' : null,
    dead: false,
    dir: 0, target: null, brakeTimer: 0, shootCd: 0,
  };
  G.cars.push(car);
  return car;
}

function randomRoadPoint(G) {
  const cx = ROAD_CENTRES[Math.floor(G.rng.next() * ROAD_CENTRES.length)];
  const cy = ROAD_CENTRES[Math.floor(G.rng.next() * ROAD_CENTRES.length)];
  return { x: cx, y: cy };
}

function spawnParkedCars(G) {
  const spots = [
    [700, 540, 0, 'sedan'], [760, 540, 0, 'sports'], [1140, 1020, Math.PI / 2, 'pickup'],
    [1620, 540, 0, 'sedan'], [2100, 1020, Math.PI / 2, 'van'], [2580, 1500, 0, 'sedan'],
    [3060, 540, 0, 'sports'], [700, 2100, Math.PI / 2, 'pickup'], [1140, 2580, 0, 'sedan'],
    [2100, 3060, Math.PI / 2, 'truck'], [3060, 2100, 0, 'van'], [1620, 3060, 0, 'sedan'],
  ];
  for (const [x, y, a, t] of spots) spawnCar(G, x, y, a, t, 'parked');
}

function spawnTraffic(G, n) {
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'pickup', 'van', 'truck'];
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(G);
    const dir = Math.floor(G.rng.next() * 4);
    const car = spawnCar(G, p.x, p.y, dir * Math.PI / 2, types[Math.floor(G.rng.next() * types.length)], 'traffic');
    car.dir = dir;
    car.target = nextIntersection(G, car);
    car.vx = Math.cos(car.angle) * 100;
    car.vy = Math.sin(car.angle) * 100;
  }
}

function nextIntersection(G, car) {
  // From the car's current intersection, pick a neighbouring one along its
  // heading; at the map edge it must turn.
  const dirs = [0, 1, 2, 3]; // E S W N
  const cur = { x: nearestRoadCentre(car.x), y: nearestRoadCentre(car.y) };
  const options = [];
  for (const d of dirs) {
    if (d === (car.dir + 2) % 4) continue; // no U-turns
    const nx = cur.x + (d === 0 ? 480 : d === 2 ? -480 : 0);
    const ny = cur.y + (d === 1 ? 480 : d === 3 ? -480 : 0);
    if (nx < 480 || nx > 3360 || ny < 480 || ny > 3360) continue;
    options.push({ dir: d, x: nx, y: ny });
  }
  if (options.length === 0) return { dir: (car.dir + 2) % 4, x: cur.x, y: cur.y };
  return options[Math.floor(G.rng.next() * options.length)];
}

function spawnPed(G, anywhere) {
  const p = G.player;
  const spot = anywhere
    ? randomSidewalkSpot(G.city, G.rng, p.x, p.y, 900)
    : randomSidewalkSpot(G.city, G.rng, p.x, p.y, 700);
  const ped = {
    x: spot.x, y: spot.y, angle: G.rng.range(0, Math.PI * 2),
    speed: G.rng.range(50, 85), state: 'walk', target: null, idle: 0,
    shirt: PED_SHIRTS[Math.floor(G.rng.next() * PED_SHIRTS.length)],
    skin: PED_SKINS[Math.floor(G.rng.next() * PED_SKINS.length)],
    hp: 30, dead: false, fleeTimer: 0, shootCd: 0,
  };
  ped.target = randomSidewalkSpot(G.city, G.rng, ped.x, ped.y, 500);
  G.peds.push(ped);
  return ped;
}

// ---- effects ----

export function addShake(G, amount) {
  G.camera.trauma = clamp(G.camera.trauma + amount, 0, 1);
}

export function burst(G, x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const a = G.rng.range(0, Math.PI * 2);
    const s = G.rng.range(speed * 0.3, speed);
    G.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: G.rng.range(life * 0.5, life), max: life, color, size: G.rng.range(size * 0.6, size * 1.4),
    });
  }
  if (G.particles.length > 500) G.particles.splice(0, G.particles.length - 500);
}

export function floater(G, x, y, text, color) {
  G.floaters.push({ x, y, text, life: 1.4, color: color ?? '#ffffff' });
  if (G.floaters.length > 24) G.floaters.shift();
}

function explode(G, x, y, radius) {
  burst(G, x, y, 26, '#ff7a1a', 260, 0.8, 5);
  burst(G, x, y, 18, '#ffd23e', 180, 0.5, 4);
  burst(G, x, y, 14, '#555555', 90, 1.6, 7);
  addShake(G, 0.7);
  G.audio?.explosion();
  G.lastExplosion = { x, y, t: 0 };
  addCrime(G, 'explosion', x, y);
  for (const ped of G.peds) {
    if (!ped.dead && dist(ped.x, ped.y, x, y) < radius) killPed(G, ped, true);
  }
  if (dist(G.player.x, G.player.y, x, y) < radius * 0.8 && !G.player.inCar) damagePlayer(G, 45);
  if (G.player.inCar && dist(G.player.x, G.player.y, x, y) < radius) damageCar(G, G.player.inCar, 60);
}

// ---- damage ----

function killPed(G, ped, silent) {
  if (ped.dead) return;
  ped.dead = true;
  burst(G, ped.x, ped.y, 12, '#c0392b', 120, 0.7, 4);
  if (!silent) {
    G.stats.kills++;
    floater(G, ped.x, ped.y - 20, 'WASTED', '#ff5a5a');
  }
}

function damagePed(G, ped, dmg, fromX, fromY) {
  ped.hp -= dmg;
  const a = Math.atan2(ped.y - fromY, ped.x - fromX);
  ped.x += Math.cos(a) * 10;
  ped.y += Math.sin(a) * 10;
  if (ped.hp <= 0) {
    killPed(G, ped);
    addCrime(G, 'killPed', ped.x, ped.y);
  } else {
    ped.state = 'flee';
    ped.fleeTimer = 3;
  }
}

export function damagePlayer(G, dmg) {
  const p = G.player;
  p.hp -= dmg;
  p.lastDamage = 0;
  addShake(G, 0.25);
  if (p.hp <= 0) {
    p.hp = 0;
    G.flags.wasted = true;
    G.audio?.busted();
  }
}

export function damageCar(G, car, dmg) {
  car.hp -= dmg;
  if (car.hp <= 0 && !car.dead) {
    car.dead = true;
    explode(G, car.x, car.y, 130);
    if (car === G.player.inCar) {
      G.player.inCar = null;
      damagePlayer(G, 30);
    }
  }
}

// ---- shooting ----

function shootRay(G, fromX, fromY, angle) {
  // Step along the ray: first wall, pedestrian, cop or car hit wins.
  const stepLen = 12;
  let best = { d: PLAYER.SHOOT_RANGE, kind: null, obj: null };
  for (let d = stepLen; d <= PLAYER.SHOOT_RANGE; d += stepLen) {
    const x = fromX + Math.cos(angle) * d;
    const y = fromY + Math.sin(angle) * d;
    if (circleBlocked(G.city, x, y, 2)) {
      best = { d, kind: 'wall', obj: null, x, y };
      break;
    }
    for (const ped of G.peds) {
      if (!ped.dead && Math.hypot(ped.x - x, ped.y - y) < 13) { best = { d, kind: 'ped', obj: ped, x, y }; break; }
    }
    if (best.kind) break;
    for (const cop of G.police) {
      if (!cop.dead && Math.hypot(cop.x - x, cop.y - y) < 13) { best = { d, kind: 'cop', obj: cop, x, y }; break; }
    }
    if (best.kind) break;
    for (const car of G.cars) {
      if (!car.dead && Math.hypot(car.x - x, car.y - y) < carRadius(car)) { best = { d, kind: 'car', obj: car, x, y }; break; }
    }
    if (best.kind) break;
  }
  return best;
}

// ---- the update ----

export function updateWorld(G, input, audio, dt, screen, passedActions) {
  G.audio = audio;
  G.time += dt;
  G.clock = (G.clock + dt / DAY_LENGTH) % 1;
  G.playSeconds += dt;
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
  if (G.toast) { G.toast.t += dt; if (G.toast.t > G.toast.dur) G.toast = null; }
  G.missionCooldown = Math.max(0, G.missionCooldown - dt);
  G.taxi.cooldown = Math.max(0, G.taxi.cooldown - dt);

  const p = G.player;
  const axes = input.axes();
  // The caller (main.js) already consumed this frame's actions to check for
  // pause; shots pass none and the fake input reports none.
  const actions = passedActions ?? input.takeActions();
  const mouseWorld = screenToWorld(G, input.mouse.lx ?? input.mouse.x, input.mouse.ly ?? input.mouse.y);
  p.lastDamage += dt;
  if (p.lastDamage > PLAYER.REGEN_DELAY && p.hp > 0 && p.hp < PLAYER.MAX_HP) {
    p.hp = Math.min(PLAYER.MAX_HP, p.hp + PLAYER.REGEN_RATE * dt);
  }
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  G.district = districtNameAt(p.x, p.y);

  if (actions & 16) { // horn
    if (p.inCar) {
      audio.horn();
      for (const ped of G.peds) {
        if (!ped.dead && dist(ped.x, ped.y, p.x, p.y) < 260) { ped.state = 'flee'; ped.fleeTimer = 1.5; }
      }
    }
  }

  updatePlayer(G, input, actions, axes, mouseWorld, audio, dt);
  updateCars(G, audio, dt);
  updatePeds(G, audio, dt);
  updatePolice(G, audio, dt);
  updateParticles(G, dt);
  updatePickups(G, audio, dt);
  updateTaxi(G, audio, dt);
  updateShops(G, actions, audio, dt);
  updateWanted(G, dt);
  updatePoliceSpawns(G, dt);

  // Mission lifecycle.
  if (G.mission.active) {
    const status = updateMission(G, dt);
    if (status === 'done') {
      const def = G.mission.def;
      p.cash += def.reward;
      G.stats.missionsDone++;
      G.missionIndex = Math.min(MISSIONS.length, G.mission.index + 1);
      G.mission.active = false;
      G.missionCooldown = 4;
      G.banner = { title: 'JOB DONE', sub: `${def.title} complete — +$${def.reward}`, t: 0, dur: 4 };
      audio.missionDone();
      floater(G, p.x, p.y - 30, `+$${def.reward}`, '#7cff4d');
      if (G.mission.index === MISSIONS.length - 1) G.flags.ending = true;
      G.saveNeeded = true;
    } else if (status === 'fail') {
      const def = G.mission.def;
      G.mission.active = false;
      G.missionCooldown = 3;
      G.banner = { title: 'JOB FAILED', sub: `${def.title} — Mara will let you try again.`, t: 0, dur: 4 };
      audio.missionFail();
    }
  } else if (G.missionIndex < MISSIONS.length && G.missionCooldown <= 0) {
    // Standing at the safehouse with Mara's work waiting starts the next job.
    const d = Math.hypot(p.x - LANDMARKS.safehouse.x, p.y - LANDMARKS.safehouse.y);
    if (d < 90) {
      G.prompt = `Press E — Mara has work: ${MISSIONS[G.missionIndex].title}`;
      if (actions & 4) startMission(G, G.missionIndex);
    }
  }

  updateCamera(G, dt);
  // Live sound: engine follows the player's car, sirens follow the nearest cop.
  const car = p.inCar;
  audio.engine(car ? Math.abs(car.speed) / car.type.vMax : 0, !!car);
  let nearestSiren = 0;
  for (const c of G.cars) {
    if (c.ai === 'police') nearestSiren = Math.max(nearestSiren, clamp(1 - dist(c.x, c.y, p.x, p.y) / 900, 0, 1));
  }
  audio.sirenNear(nearestSiren);
}

export function screenToWorld(G, sx, sy) {
  const cam = G.camera;
  return {
    x: cam.x + (sx - 640) / cam.zoom,
    y: cam.y + (sy - 360) / cam.zoom,
  };
}

// ---- player ----

function updatePlayer(G, input, actions, axes, mouseWorld, audio, dt) {
  const p = G.player;
  if (p.inCar) {
    const car = p.inCar;
    const throttle = axes.y < 0 ? 1 : axes.y > 0 ? -1 : 0;
    const steer = axes.x;
    const handbrake = input.down('attack');
    const impact = carStep(car, { throttle, steer, handbrake }, dt, G.city);
    if (impact > 90) {
      damageCar(G, car, impact * 0.28);
      burst(G, car.x, car.y, 8, '#ffd23e', 160, 0.4, 3);
      addShake(G, clamp(impact / 400, 0.1, 0.5));
      audio.crash();
    }
    if (car.slip > 70 && Math.abs(car.speed) > 120) {
      G.skidmarks.push({ x: car.x, y: car.y, angle: car.angle, life: 8 });
      if (G.skidmarks.length > 400) G.skidmarks.shift();
      if (G.rng.chance(0.3)) burst(G, car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18, 1, '#bbbbbb', 30, 0.5, 3);
    }
    if (car.hp < car.maxHp * 0.35 && G.rng.chance(0.2)) {
      burst(G, car.x, car.y - 8, 1, '#666666', 40, 1.2, 5);
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Running over pedestrians.
    for (const ped of G.peds) {
      if (!ped.dead && dist(ped.x, ped.y, car.x, car.y) < carRadius(car) + 8 && Math.abs(car.speed) > 90) {
        killPed(G, ped);
        addCrime(G, 'runOver', ped.x, ped.y);
        addShake(G, 0.2);
      }
    }
    if (actions & 4) { // E: get out
      const side = { x: p.x + Math.cos(car.angle + Math.PI / 2) * 34, y: p.y + Math.sin(car.angle + Math.PI / 2) * 34 };
      if (!circleBlocked(G.city, side.x, side.y, 14)) { p.x = side.x; p.y = side.y; }
      else { p.x = p.x - Math.cos(car.angle) * 34; p.y = p.y - Math.sin(car.angle) * 34; }
      car.vx *= 0.25;
      car.vy *= 0.25;
      car.driver = null;
      car.ai = 'parked';
      p.inCar = null;
      audio.door();
    }
    return;
  }

  // On foot.
  const speed = axes.sprint ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED;
  let mx = axes.x;
  let my = axes.y;
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  if (len > 0) {
    mx /= len;
    my /= len;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.angle = Math.atan2(my, mx);
    resolveCircle(G.city, p, PLAYER.RADIUS);
  }
  // Aim at the mouse; the body follows the walk direction only while moving.
  if (input.mouse.down || p.shootCd > 0) {
    p.angle = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);
  }

  // Punch.
  if ((actions & 8) && p.punchCd <= 0) {
    p.punchCd = PLAYER.PUNCH_COOLDOWN;
    audio.punch();
    let hitAny = false;
    const check = (obj, isCop) => {
      const d = dist(obj.x, obj.y, p.x, p.y);
      if (d < PLAYER.PUNCH_RANGE + 14 && Math.abs(angleDiff(p.angle, Math.atan2(obj.y - p.y, obj.x - p.x))) < 1.2) {
        hitAny = true;
        if (isCop) {
          obj.hp -= PLAYER.PUNCH_DAMAGE;
          if (obj.hp <= 0) { obj.dead = true; addCrime(G, 'killCop', obj.x, obj.y); G.stats.kills++; }
          else { obj.state = 'chase'; }
        } else {
          damagePed(G, obj, PLAYER.PUNCH_DAMAGE, p.x, p.y);
          addCrime(G, 'punch', obj.x, obj.y);
        }
        burst(G, obj.x, obj.y, 6, '#ffffff', 120, 0.3, 3);
      }
    };
    for (const ped of G.peds) if (!ped.dead) check(ped, false);
    for (const cop of G.police) if (!cop.dead) check(cop, true);
    if (hitAny) addShake(G, 0.12);
  }

  // Shoot (mouse held).
  if (input.mouse.down && p.shootCd <= 0) {
    if (p.ammo > 0) {
      p.shootCd = PLAYER.SHOOT_COOLDOWN;
      p.ammo--;
      const aim = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);
      p.angle = aim;
      const hit = shootRay(G, p.x, p.y, aim);
      const endX = p.x + Math.cos(aim) * hit.d;
      const endY = p.y + Math.sin(aim) * hit.d;
      G.particles.push({ x: p.x + Math.cos(aim) * 18, y: p.y + Math.sin(aim) * 18, vx: 0, vy: 0, life: 0.06, max: 0.06, color: '#ffe9a8', size: 7 });
      G.particles.push({ x: endX, y: endY, vx: 0, vy: 0, life: 0.12, max: 0.12, color: '#ffd23e', size: 3, tracer: { x: p.x, y: p.y } });
      audio.shoot();
      addShake(G, 0.08);
      G.lastShot = { x: endX, y: endY, t: 0 };
      addCrime(G, 'shoot', p.x, p.y);
      if (hit.kind === 'ped') {
        damagePed(G, hit.obj, PLAYER.SHOOT_DAMAGE, p.x, p.y);
        audio.hit();
      } else if (hit.kind === 'cop') {
        hit.obj.hp -= PLAYER.SHOOT_DAMAGE;
        if (hit.obj.hp <= 0) { hit.obj.dead = true; addCrime(G, 'killCop', hit.obj.x, hit.obj.y); G.stats.kills++; }
        audio.hit();
      } else if (hit.kind === 'car') {
        damageCar(G, hit.obj, PLAYER.SHOOT_DAMAGE);
        burst(G, endX, endY, 5, '#ffd23e', 120, 0.3, 3);
      } else if (hit.kind === 'wall') {
        burst(G, endX, endY, 4, '#cccccc', 100, 0.3, 2);
      }
      // Everyone nearby hears the shot.
      for (const ped of G.peds) {
        if (!ped.dead && dist(ped.x, ped.y, p.x, p.y) < 380) { ped.state = 'flee'; ped.fleeTimer = 3; }
      }
    } else if (p.shootCd <= 0) {
      p.shootCd = 0.3;
      audio.denied();
      floater(G, p.x, p.y - 24, 'NO AMMO — buy at Ironworks Arms', '#ff9a9a');
    }
  }

  // Enter a car.
  if (actions & 4) {
    const car = nearestCarTo(G, p.x, p.y, 78);
    if (car) {
      if (car.driver === 'traffic') {
        // Pull the driver out; they run for it.
        const driver = spawnPed(G, false);
        driver.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
        driver.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
        driver.state = 'flee';
        driver.fleeTimer = 4;
        car.driver = null;
        G.stats.carsStolen++;
        addCrime(G, 'stealCar', car.x, car.y);
      } else if (car.ai === 'parked') {
        G.stats.carsStolen++;
        addCrime(G, 'stealCar', car.x, car.y);
      }
      car.ai = null;
      car.driver = 'player';
      p.inCar = car;
      p.x = car.x;
      p.y = car.y;
      audio.door();
    }
  }
}

function nearestCarTo(G, x, y, maxD) {
  let best = null;
  let bd = maxD;
  for (const car of G.cars) {
    if (car.dead || car.ai === 'police') continue;
    const d = dist(car.x, car.y, x, y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

// ---- cars: traffic, police, rivals ----

function updateCars(G, audio, dt) {
  const p = G.player;
  for (const car of G.cars) {
    if (car.dead) continue;
    if (car === p.inCar) continue;
    if (car.ai === 'traffic') updateTrafficCar(G, car, dt);
    else if (car.ai === 'police') updatePoliceCar(G, car, dt);
    else if (car.ai === 'rival') updateRivalCar(G, car, dt);
    else if (car.ai === 'parked') {
      car.vx *= 0.9;
      car.vy *= 0.9;
      car.x += car.vx * dt;
      car.y += car.vy * dt;
    }
  }
  // Car-to-car bumps.
  for (let i = 0; i < G.cars.length; i++) {
    const a = G.cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < G.cars.length; j++) {
      const b = G.cars[j];
      if (b.dead) continue;
      const impact = collideCars(a, b);
      if (impact > 110) {
        damageCar(G, a, impact * 0.12);
        damageCar(G, b, impact * 0.12);
        if (a === p.inCar || b === p.inCar) {
          addShake(G, 0.2);
          audio.crash();
        }
      }
    }
  }
  // Remove wrecks once they are far away and cold.
  G.cars = G.cars.filter((c) => !c.dead || dist(c.x, c.y, p.x, p.y) < 900);
}

function trafficSteerTo(car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  return clamp(angleDiff(car.angle, want) * 2.2, -1, 1);
}

function updateTrafficCar(G, car, dt) {
  // Drive the road grid: head for the next intersection, lane on the right.
  const t = car.target;
  if (!t) { car.target = nextIntersection(G, car); return; }
  const laneX = t.x + (car.dir === 1 ? LANE_OFFSET : car.dir === 3 ? -LANE_OFFSET : 0);
  const laneY = t.y + (car.dir === 0 ? LANE_OFFSET : car.dir === 2 ? -LANE_OFFSET : 0);
  const d = dist(car.x, car.y, laneX, laneY);
  if (d < 46) {
    car.dir = t.dir;
    car.target = nextIntersection(G, car);
    return;
  }
  let throttle = car.speed < 150 ? 0.75 : 0;
  // Brake for what is ahead: a wall, a car, a pedestrian in the lane.
  if (aheadBlocked(G.city, car, 70)) throttle = -0.6;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (forward > 0 && forward < 80 && side < 30) { throttle = -0.8; break; }
  }
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (forward > 0 && forward < 60 && side < 26) { throttle = -0.8; break; }
  }
  const steer = trafficSteerTo(car, laneX, laneY);
  const impact = carStep(car, { throttle, steer, handbrake: false }, dt, G.city);
  if (impact > 120) damageCar(G, car, impact * 0.2);
}

function updatePoliceCar(G, car, dt) {
  const p = G.player;
  const w = G.wanted;
  // Seen: ram the player. Unseen: search the last known position, then
  // wander the streets around it — the player can genuinely slip away.
  let tx;
  let ty;
  let throttle = 1;
  if (w.seen || !w.lastKnown) {
    const lead = 0.35;
    tx = p.x + (p.inCar ? p.inCar.vx : 0) * lead;
    ty = p.y + (p.inCar ? p.inCar.vy : 0) * lead;
  } else {
    const lk = w.lastKnown;
    if (dist(car.x, car.y, lk.x, lk.y) < 120) {
      if (!car.searchTarget || dist(car.x, car.y, car.searchTarget.x, car.searchTarget.y) < 80) {
        const a = G.rng.range(0, Math.PI * 2);
        const spot = nearestRoadPoint(lk.x + Math.cos(a) * 320, lk.y + Math.sin(a) * 320);
        car.searchTarget = spot;
      }
      tx = car.searchTarget.x;
      ty = car.searchTarget.y;
      throttle = 0.6;
    } else {
      tx = lk.x;
      ty = lk.y;
    }
  }
  const steer = trafficSteerTo(car, tx, ty);
  if (aheadBlocked(G.city, car, 60)) throttle = -0.5;
  const impact = carStep(car, { throttle, steer, handbrake: false }, dt, G.city);
  if (impact > 100) {
    damageCar(G, car, impact * 0.15);
    addShake(G, 0.1);
  }
  // A police car that loses the player on foot pulls up and its cop gets out.
  if (!p.inCar && dist(car.x, car.y, p.x, p.y) < 60 && car.speed < 60 && G.police.length < 4) {
    spawnFootCop(G, car.x, car.y);
    car.vx = 0;
    car.vy = 0;
  }
}

function updateRivalCar(G, car, dt) {
  const cp = raceCheckpoint(G, car.cp);
  const d = dist(car.x, car.y, cp.x, cp.y);
  if (d < 90) car.cp++;
  const steer = trafficSteerTo(car, cp.x, cp.y);
  let throttle = car.speed < 330 ? 1 : 0.2;
  if (aheadBlocked(G.city, car, 80)) throttle = -0.4;
  carStep(car, { throttle, steer, handbrake: false }, dt, G.city);
}

// ---- pedestrians ----

function updatePeds(G, audio, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const threat = G.lastShot ?? G.lastExplosion ?? { x: p.x, y: p.y };
      const a = Math.atan2(ped.y - threat.y, ped.x - threat.x);
      ped.x += Math.cos(a) * 210 * dt;
      ped.y += Math.sin(a) * 210 * dt;
      ped.angle = a;
      resolveCircle(G.city, ped, 12);
      if (ped.fleeTimer <= 0) ped.state = 'walk';
      continue;
    }
    if (ped.state === 'walk') {
      if (!ped.target) ped.target = randomSidewalkSpot(G.city, G.rng, ped.x, ped.y, 500);
      const d = dist(ped.x, ped.y, ped.target.x, ped.target.y);
      if (d < 20) {
        ped.state = 'idle';
        ped.idle = G.rng.range(1, 3);
      } else {
        const a = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * dt;
        ped.y += Math.sin(a) * ped.speed * dt;
        resolveCircle(G.city, ped, 12);
      }
    } else if (ped.state === 'idle') {
      ped.idle -= dt;
      if (ped.idle <= 0) {
        ped.state = 'walk';
        ped.target = randomSidewalkSpot(G.city, G.rng, ped.x, ped.y, 500);
      }
    }
    // A fast car bearing down scatters the crowd.
    if (p.inCar && Math.abs(p.inCar.speed) > 150 && dist(ped.x, ped.y, p.x, p.y) < 120) {
      ped.state = 'flee';
      ped.fleeTimer = 1.5;
    }
  }
  // Stream the crowd around the camera: too far away walks off, a fresh face walks in.
  // Dead pedestrians are cleared once they are out of sight too.
  for (let i = G.peds.length - 1; i >= 0; i--) {
    const ped = G.peds[i];
    const d = dist(ped.x, ped.y, p.x, p.y);
    if ((!ped.dead && d > 1000) || (ped.dead && d > 600)) {
      G.peds.splice(i, 1);
      if (!ped.dead) spawnPed(G, false);
    }
  }
  while (G.peds.filter((x) => !x.dead).length < 36) spawnPed(G, false);
  if (G.lastShot) { G.lastShot.t += dt; if (G.lastShot.t > 3) G.lastShot = null; }
  if (G.lastExplosion) { G.lastExplosion.t += dt; if (G.lastExplosion.t > 3) G.lastExplosion = null; }
}

// ---- foot police ----

function spawnFootCop(G, x, y) {
  G.police.push({
    x, y, angle: 0, hp: 60, dead: false, state: 'chase',
    shootCd: G.rng.range(0.5, 1.5), arrestTimer: 0, speed: 155,
  });
}

function updatePolice(G, audio, dt) {
  const p = G.player;
  for (const cop of G.police) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
    if (G.wanted.stars === 0) {
      // Heat off: the cop walks back to the station and leaves.
      cop.state = 'leave';
      const tx = LANDMARKS.hospital.x;
      const ty = LANDMARKS.hospital.y;
      const a = Math.atan2(ty - cop.y, tx - cop.x);
      cop.x += Math.cos(a) * 120 * dt;
      cop.y += Math.sin(a) * 120 * dt;
      if (dist(cop.x, cop.y, tx, ty) < 100) cop.dead = true;
      continue;
    }
    if (d > 700) { cop.dead = true; continue; }
    // Unseen, a foot cop heads for the last known position; only a cop who
    // can see the player arrests or shoots.
    const target = G.wanted.seen ? { x: p.x, y: p.y } : (G.wanted.lastKnown ?? { x: p.x, y: p.y });
    cop.angle = Math.atan2(target.y - cop.y, target.x - cop.x);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    resolveCircle(G.city, cop, 12);
    if (G.wanted.seen && G.wanted.stars <= 2 && !p.inCar && d < 46) {
      cop.arrestTimer += dt;
      if (cop.arrestTimer > 1.5) {
        G.flags.busted = true;
        audio.busted();
      }
    } else cop.arrestTimer = 0;
    if (G.wanted.seen && G.wanted.stars >= 2 && d < 320 && d > 60) {
      cop.shootCd -= dt;
      if (cop.shootCd <= 0) {
        cop.shootCd = G.rng.range(0.7, 1.4);
        audio.shoot();
        const hit = G.rng.chance(0.22);
        const aim = cop.angle + G.rng.range(-0.12, 0.12);
        const endX = cop.x + Math.cos(aim) * d;
        const endY = cop.y + Math.sin(aim) * d;
        G.particles.push({ x: endX, y: endY, vx: 0, vy: 0, life: 0.1, max: 0.1, color: '#ff5a5a', size: 3, tracer: { x: cop.x, y: cop.y } });
        if (hit) damagePlayer(G, 7);
      }
    }
  }
  G.police = G.police.filter((c) => !c.dead || dist(c.x, c.y, p.x, p.y) < 500);
}

function updatePoliceSpawns(G, dt) {
  const want = WANTED.CHASE_CARS[G.wanted.stars] ?? 0;
  const have = G.cars.filter((c) => c.ai === 'police' && !c.dead).length;
  if (have < want && G.wanted.stars > 0) {
    const p = G.player;
    const spot = randomRoadPoint(G);
    // Spawn off-screen but not absurdly far: nudge the point away from the player.
    const a = Math.atan2(spot.y - p.y, spot.x - p.x);
    const sx = p.x + Math.cos(a) * 650;
    const sy = p.y + Math.sin(a) * 650;
    const rp = nearestRoadPoint(sx, sy);
    const car = spawnCar(G, rp.x, rp.y, Math.atan2(p.y - rp.y, p.x - rp.x), 'police', 'police', '#1a5276');
    car.vx = Math.cos(car.angle) * 200;
    car.vy = Math.sin(car.angle) * 200;
  }
  // Foot cops: up to two on the beat while wanted.
  if (G.wanted.stars >= 1 && G.police.filter((c) => !c.dead).length < Math.min(2, G.wanted.stars)) {
    const p = G.player;
    const a = G.rng.range(0, Math.PI * 2);
    const spot = nearestRoadPoint(p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420);
    spawnFootCop(G, spot.x, spot.y);
  }
}

// ---- particles, pickups, taxi, shops ----

function updateParticles(G, dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const pt = G.particles[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.98;
    pt.vy *= 0.98;
    if (pt.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.skidmarks.length - 1; i >= 0; i--) {
    G.skidmarks[i].life -= dt;
    if (G.skidmarks[i].life <= 0) G.skidmarks.splice(i, 1);
  }
  for (let i = G.floaters.length - 1; i >= 0; i--) {
    const f = G.floaters[i];
    f.life -= dt;
    f.y -= 24 * dt;
    if (f.life <= 0) G.floaters.splice(i, 1);
  }
}

function updatePickups(G, audio, dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    pk.bob += dt;
    if (pk.taken) {
      if (pk.kind === 'health') {
        pk.respawn -= dt;
        if (pk.respawn <= 0) pk.taken = false;
      }
      continue;
    }
    const d = dist(pk.x, pk.y, p.x, p.y);
    if (d < 30) {
      pk.taken = true;
      if (pk.kind === 'package') {
        p.cash += ECONOMY.PACKAGE_VALUE;
        G.stats.packages++;
        floater(G, pk.x, pk.y - 20, `+$${ECONOMY.PACKAGE_VALUE} hidden package`, '#7cff4d');
        audio.pickup();
        G.saveNeeded = true;
      } else if (pk.kind === 'health') {
        p.hp = Math.min(PLAYER.MAX_HP, p.hp + 35);
        floater(G, pk.x, pk.y - 20, '+35 HEALTH', '#7cff4d');
        audio.pickup();
        pk.respawn = 60;
      } else if (pk.kind === 'cashbag') {
        floater(G, pk.x, pk.y - 20, 'Cash drop secured', '#ffd23e');
        audio.cash();
      }
    }
  }
}

function updateTaxi(G, audio, dt) {
  const p = G.player;
  const t = G.taxi;
  const inTaxi = p.inCar && p.inCar.typeKey === 'taxi';
  if (!inTaxi) {
    if (t.state !== 'none') {
      t.state = 'none';
      t.passenger = null;
      G.toast = { text: 'Fare cancelled — the passenger walked away.', t: 0, dur: 3 };
    }
    return;
  }
  if (t.state === 'none' && t.cooldown <= 0) {
    // Someone on the sidewalk hails the cab.
    const spot = randomSidewalkSpot(G.city, G.rng, p.x, p.y, 500);
    const ped = spawnPed(G, false);
    ped.x = spot.x;
    ped.y = spot.y;
    ped.state = 'idle';
    ped.idle = 999;
    ped.hailing = true;
    t.passenger = ped;
    t.state = 'toPickup';
  } else if (t.state === 'toPickup' && t.passenger) {
    const d = dist(p.x, p.y, t.passenger.x, t.passenger.y);
    if (d < 56 && Math.abs(p.inCar.speed) < 40) {
      const dest = randomRoadPoint(G);
      t.dest = dest;
      t.fare = Math.round(50 + dist(p.x, p.y, dest.x, dest.y) * 0.35);
      t.state = 'toDest';
      t.passenger.hailing = false;
      t.passenger.dead = true; // they are in the cab now
      G.toast = { text: `Passenger in! Take them to ${districtNameAt(dest.x, dest.y)} — fare $${t.fare}`, t: 0, dur: 4 };
      audio.pickup();
    }
  } else if (t.state === 'toDest' && t.dest) {
    const d = dist(p.x, p.y, t.dest.x, t.dest.y);
    if (d < 70) {
      const tip = p.inCar.speed > 200 ? Math.round(t.fare * 0.25) : 0;
      p.cash += t.fare + tip;
      G.stats.fares++;
      floater(G, p.x, p.y - 30, `+$${t.fare + tip} fare${tip ? ' (fast tip!)' : ''}`, '#7cff4d');
      audio.cash();
      t.state = 'none';
      t.passenger = null;
      t.dest = null;
      t.cooldown = 6;
      G.saveNeeded = true;
    }
  }
}

function updateShops(G, actions, audio, dt) {
  const p = G.player;
  G.nearShop = null;
  G.prompt = null;
  if (p.inCar) {
    // Spray shop works from the car: pulling up on the street by it counts.
    const d = dist(p.x, p.y, LANDMARKS.sprayShop.x, LANDMARKS.sprayShop.y);
    if (d < 260) {
      G.nearShop = 'spray';
      G.prompt = `Press E — Color Rush: repair + respray + lose the cops ($${ECONOMY.SPRAY_PRICE})`;
      if (actions & 4) {
        if (p.cash >= ECONOMY.SPRAY_PRICE) {
          p.cash -= ECONOMY.SPRAY_PRICE;
          p.inCar.hp = p.inCar.maxHp;
          p.inCar.color = randColor(G.rng, p.inCar.typeKey);
          clearWanted(G);
          audio.cash();
          floater(G, p.x, p.y - 30, 'Resprayed — heat gone', '#7cff4d');
          G.toast = { text: 'Color Rush: "New paint, who dis?"', t: 0, dur: 3 };
        } else {
          audio.denied();
          floater(G, p.x, p.y - 30, `Need $${ECONOMY.SPRAY_PRICE}`, '#ff9a9a');
        }
      }
    }
    return;
  }
  // On foot: every landmark has its own counter.
  for (const key of Object.keys(LANDMARKS)) {
    const lm = LANDMARKS[key];
    const d = dist(p.x, p.y, lm.x, lm.y);
    if (d > 95) continue;
    if (lm.kind === 'gun') {
      G.nearShop = 'gun';
      G.prompt = `Press E — Ironworks Arms: ${ECONOMY.AMMO_AMOUNT} rounds ($${ECONOMY.AMMO_PRICE})`;
      if (actions & 4) {
        if (p.cash >= ECONOMY.AMMO_PRICE) {
          p.cash -= ECONOMY.AMMO_PRICE;
          p.ammo += ECONOMY.AMMO_AMOUNT;
          audio.cash();
          floater(G, p.x, p.y - 30, `+${ECONOMY.AMMO_AMOUNT} rounds`, '#7cff4d');
        } else {
          audio.denied();
          floater(G, p.x, p.y - 30, `Need $${ECONOMY.AMMO_PRICE}`, '#ff9a9a');
        }
      }
    } else if (lm.kind === 'diner') {
      G.nearShop = 'diner';
      G.prompt = `Press E — Sunset Diner: full meal, full health ($${ECONOMY.HEAL_PRICE})`;
      if (actions & 4) {
        if (p.cash >= ECONOMY.HEAL_PRICE && p.hp < PLAYER.MAX_HP) {
          p.cash -= ECONOMY.HEAL_PRICE;
          p.hp = PLAYER.MAX_HP;
          audio.pickup();
          floater(G, p.x, p.y - 30, 'Full health', '#7cff4d');
        } else if (p.hp >= PLAYER.MAX_HP) {
          floater(G, p.x, p.y - 30, 'Already full health', '#ffffff');
        } else {
          audio.denied();
          floater(G, p.x, p.y - 30, `Need $${ECONOMY.HEAL_PRICE}`, '#ff9a9a');
        }
      }
    } else if (lm.kind === 'safehouse') {
      G.nearShop = 'safehouse';
      if (!G.mission.active && G.missionIndex < MISSIONS.length) {
        G.prompt = `Press E — Mara has work: ${MISSIONS[G.missionIndex].title}`;
        if (actions & 4) startMission(G, G.missionIndex);
      } else if (!G.mission.active) {
        G.prompt = 'Press E — Save game';
        if (actions & 4) {
          G.saveNeeded = true;
          G.toast = { text: 'Game saved at the safehouse.', t: 0, dur: 3 };
          audio.pickup();
        }
      }
    } else if (lm.kind === 'hospital') {
      G.nearShop = 'hospital';
      if (p.hp < PLAYER.MAX_HP) {
        p.hp = Math.min(PLAYER.MAX_HP, p.hp + 12 * dt);
        G.prompt = 'Solmar General — patching you up…';
      }
    }
    break;
  }
}

function updateCamera(G, dt) {
  const p = G.player;
  const cam = G.camera;
  const look = p.inCar ? 0.45 : 0.12;
  const tx = p.x + (p.inCar ? p.inCar.vx : 0) * look;
  const ty = p.y + (p.inCar ? p.inCar.vy : 0) * look;
  const k = 1 - Math.exp(-5 * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  const targetZoom = p.inCar ? 1 - clamp(Math.abs(p.inCar.speed) / 1400, 0, 0.18) : 1;
  cam.zoom += (targetZoom - cam.zoom) * (1 - Math.exp(-3 * dt));
  cam.trauma = Math.max(0, cam.trauma - 1.4 * dt);
  const sh = cam.trauma * cam.trauma * 14;
  cam.ox = (G.rng.next() * 2 - 1) * sh;
  cam.oy = (G.rng.next() * 2 - 1) * sh;
}

export { isOnRoad };
