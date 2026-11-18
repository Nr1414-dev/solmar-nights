// SOLMAR NIGHTS — world.js
// The living city: game state, spawning, traffic AI, pedestrians, police,
// helicopter, roadblocks, bullets, taxi fares, shops, weather and the day
// cycle. Rendering lives in render.js, the wanted rules in wanted.js, the
// story in missions.js — this file is the simulation that wires them together.

import { WORLD, ROADS, VEHICLES, VEHICLE_KEYS, WEAPONS, START_MONEY, HIDDEN_PACKAGES } from './config.js';
import { makeRng, seedFromString, range, int, pick, chance } from './random.js';
import { buildCity, isRoadPoint, nearestRoadPoint, roadAxisAt } from './city.js';
import { clamp, dist, angleDiff, turnToward, resolveCircleRect, stepCar, carCircles, TAU } from './physics.js';
import { createWanted, addCrime, updateWanted, clearOutfitEvidence, clearCarEvidence } from './wanted.js';
import { createMissionState, updateMissions, startMission } from './missions.js';
import { createGangState, updateGangs, startWave } from './gangs.js';
import { createAudio } from './audio.js';

export function createWorld(seed) {
  const rng = makeRng(typeof seed === 'number' ? seed : seedFromString(String(seed ?? 'solmar-7')));
  const city = buildCity(rng);
  const world = {
    seed, rng, city,
    time: 10 * 3600, // seconds into the day; start 10:00
    dayLength: 300, // one full day/night cycle, seconds of play
    elapsed: 0,
    weather: { type: 'clear', intensity: 0, timer: 75 },
    screen: 'title',
    paused: false,
    settings: { music: true, sfx: true, minimap: 1, volume: 0.8 },
    camera: { x: city.spawn.x, y: city.spawn.y, zoom: 1 },
    player: {
      x: city.spawn.x, y: city.spawn.y, angle: city.spawn.angle,
      hp: 100, armor: 0, money: START_MONEY,
      weapon: 'fist', weapons: { fist: true, pistol: false, shotgun: false },
      ammo: { pistol: 0, shotgun: 0 },
      outfit: 0, inCar: null, speed: 0,
      shootTimer: 0, underCover: false, dead: false,
      unlockedCars: ['sedan'],
    },
    cars: [], peds: [], cops: [], bullets: [], particles: [],
    heli: { active: false, x: 0, y: 0, angle: 0, coverTimer: 0 },
    roadblock: { active: false, timer: 18, cars: [] },
    wanted: createWanted(),
    mission: createMissionState(),
    gangs: createGangState(),
    stats: { kills: 0, carsStolen: 0, fares: 0, reputation: 0, packages: 0, shotsFired: 0 },
    fare: { active: false, stage: 'none', x: 0, y: 0, pay: 0 },
    messages: [],
    audio: createAudio(),
    titleChoice: 0, // 0 new game, 1 continue, 2 how to, 3 settings
    howto: false,
    gameOverTimer: 0,
    rainDrops: [],
  };

  world.message = (text, color = '#ffffff') => {
    world.messages.push({ text, color, t: 0 });
    if (world.messages.length > 5) world.messages.shift();
  };
  world.spawnCar = (kind, x, y, angle, driver = 'traffic') => spawnCar(world, kind, x, y, angle, driver);
  world.spawnBullet = (x, y, angle, speed, dmg, from) => {
    world.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.4, dmg, from });
  };
  world.startGangWave = () => startWave(world);
  world.beginMission = () => {
    if (!world.mission.active && world.mission.index < 8) startMission(world, world.mission.index);
  };

  seedTraffic(world);
  seedPeds(world);
  return world;
}

export function spawnCar(world, kind, x, y, angle, driver = 'traffic') {
  const def = VEHICLES[kind];
  const car = {
    id: world.cars.length + Math.floor(world.rng() * 100000),
    kind, x, y, angle, speed: 0,
    color: pick(world.rng, def.colors),
    driver, hp: 100, honk: 0, blockedTimer: 0,
    axis: chance(world.rng, 0.5) ? 'v' : 'h',
    road: pick(world.rng, ROADS),
    dir: chance(world.rng, 0.5) ? 1 : -1,
    lane: chance(world.rng, 0.5) ? 24 : -24,
    targetSpeed: range(world.rng, 130, 210),
    missionTarget: false, gangCar: false,
    brake: false,
  };
  world.cars.push(car);
  return car;
}

function seedTraffic(world) {
  const kinds = ['sedan', 'sedan', 'taxi', 'van', 'pickup', 'coupe', 'sport', 'bike', 'muscle', 'delivery'];
  for (let i = 0; i < 26; i++) {
    const road = pick(world.rng, ROADS);
    const other = pick(world.rng, ROADS);
    const vertical = chance(world.rng, 0.5);
    const kind = pick(world.rng, kinds);
    const x = vertical ? road : range(world.rng, 200, WORLD - 200);
    const y = vertical ? range(world.rng, 200, WORLD - 200) : road;
    const angle = vertical ? (chance(world.rng, 0.5) ? Math.PI / 2 : -Math.PI / 2) : (chance(world.rng, 0.5) ? 0 : Math.PI);
    const car = spawnCar(world, kind, x, y, angle, 'traffic');
    car.axis = vertical ? 'v' : 'h';
    car.road = road;
    car.dir = vertical ? (angle > 0 ? 1 : -1) : (angle === 0 ? 1 : -1);
    car.lane = chance(world.rng, 0.5) ? 24 : -24;
    car.speed = range(world.rng, 80, 180);
    void other;
  }
}

function seedPeds(world) {
  const colors = ['#e8b81a', '#2e8cc2', '#c23b2e', '#7a5ac2', '#3a8c5a', '#e88ca8', '#5a5a5a', '#d8d8d8'];
  for (let i = 0; i < 34; i++) {
    const pt = randomSidewalkPoint(world);
    world.peds.push({
      x: pt.x, y: pt.y, angle: world.rng() * TAU, speed: range(world.rng, 40, 70),
      state: 'walk', tx: pt.x, ty: pt.y, color: pick(world.rng, colors),
      callTimer: 0, hp: 50, radius: 13, panic: 0,
    });
  }
}

export function randomSidewalkPoint(world) {
  // A point just off a road (on the sidewalk), anywhere in the city.
  const road = pick(world.rng, ROADS);
  const along = range(world.rng, 200, WORLD - 200);
  const off = pick(world.rng, [-66, 66]);
  return chance(world.rng, 0.5)
    ? { x: road + off, y: along }
    : { x: along, y: road + off };
}

// ---------------------------------------------------------------------------
// Main simulation step. `input` is the object from input.js.
// ---------------------------------------------------------------------------
export function updateWorld(world, input, dt) {
  world.elapsed += dt;
  world.time = (world.time + dt * (86400 / world.dayLength)) % 86400;
  updateWeather(world, dt);
  updatePlayer(world, input, dt);
  updateTraffic(world, dt);
  updatePeds(world, dt);
  updateCops(world, dt);
  separateCars(world);
  updateHeli(world, dt);
  updateRoadblocks(world, dt);
  updateBullets(world, dt);
  updateParticles(world, dt);
  updateFares(world, dt);
  updatePackages(world);
  updateWanted(world, dt);
  updateMissions(world, dt);
  updateGangs(world, dt);
  updateCamera(world, dt);
  for (const m of world.messages) m.t += dt;
  world.messages = world.messages.filter((m) => m.t < 6);
  world.audio.music(dt);
  world.audio.siren(world.wanted.state === 'solid' && world.wanted.stars > 0);
  // Keep the world populated.
  if (world.cars.filter((c) => c.driver === 'traffic').length < 22) spawnTrafficCar(world);
  if (world.peds.length < 30) spawnPed(world);
  // Engine sound follows the player's car.
  const car = world.player.inCar;
  world.audio.engine(car ? Math.abs(car.speed) / VEHICLES[car.kind].top : 0);
}

// Keep cars from stacking on top of each other (pursuits, traffic jams):
// push any overlapping pair apart along their centre line.
function separateCars(world) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 72;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

function updateWeather(world, dt) {
  const w = world.weather;
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer = 70 + world.rng() * 60;
    const roll = world.rng();
    w.type = roll < 0.55 ? 'clear' : roll < 0.82 ? 'rain' : 'fog';
    w.intensity = w.type === 'clear' ? 0 : 0.5 + world.rng() * 0.5;
    if (w.type === 'rain') world.message('Rain rolling in — roads are slick.', '#8cb8d8');
    if (w.type === 'fog') world.message('Fog over the bay — visibility down.', '#b8b8b8');
  }
  if (w.type === 'rain') {
    if (world.rainDrops.length < 90) {
      world.rainDrops.push({ x: world.rng() * 1280, y: -10, s: 500 + world.rng() * 300 });
    }
  }
}

function isNight(world) {
  const h = world.time / 3600;
  return h < 6 || h > 19;
}

export function daylight(world) {
  // 0 = deep night, 1 = full day.
  const h = world.time / 3600;
  if (h >= 7 && h <= 17) return 1;
  if (h >= 19 || h <= 5) return 0.22;
  if (h > 17) return 1 - (h - 17) / 2 * 0.78;
  return 0.22 + (h - 5) / 2 * 0.78;
}

// --- player ---------------------------------------------------------------
function updatePlayer(world, input, dt) {
  const p = world.player;
  if (p.dead) {
    world.gameOverTimer += dt;
    return;
  }
  p.shootTimer = Math.max(0, p.shootTimer - dt);
  const car = p.inCar;

  if (car) {
    // Driving: W/S throttle, A/D steer, E exit, mouse aims nothing.
    let throttle = 0;
    if (input.down.up) throttle += 1;
    if (input.down.down) throttle -= 1;
    let steer = 0;
    if (input.down.left) steer -= 1;
    if (input.down.right) steer += 1;
    const gripMul = world.weather.type === 'rain' ? 0.75 : 1;
    stepCar(car, VEHICLES[car.kind], throttle, steer, dt, gripMul);
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    collideCarWithWorld(world, car);
    if (input.wasPressed('enter')) {
      exitCar(world);
    }
    if (input.wasPressed('weapon')) cycleWeapon(world);
  } else {
    // On foot: WASD, shift to sprint, mouse aims.
    let mx = 0, my = 0;
    if (input.down.up) my -= 1;
    if (input.down.down) my += 1;
    if (input.down.left) mx -= 1;
    if (input.down.right) mx += 1;
    const len = Math.hypot(mx, my);
    const sprint = input.down.sprint ? 1.45 : 1;
    if (len > 0) {
      const sp = 195 * sprint;
      p.x += (mx / len) * sp * dt;
      p.y += (my / len) * sp * dt;
      p.angle = Math.atan2(input.mouseY - 360, input.mouseX - 640); // aim at mouse (screen centre-ish)
    }
    // Aim: player faces the mouse in screen space; main.js stores screen pos.
    p.angle = world.aimAngle ?? p.angle;
    for (const b of world.city.buildings) resolveCircleRect(p, 15, b);
    p.x = clamp(p.x, 50, WORLD - 50);
    p.y = clamp(p.y, 50, WORLD - 50);

    if (input.wasPressed('enter')) tryEnterCar(world);
    if (input.wasPressed('interact')) tryInteract(world);
    if (input.wasPressed('weapon')) cycleWeapon(world);
    if (input.mousePressed || input.mouseDown) tryAttack(world, input);
  }

  // Under cover? Inside (or tight against) a building, or under the pier.
  p.underCover = false;
  for (const b of world.city.buildings) {
    if (p.x > b.x - 24 && p.x < b.x + b.w + 24 && p.y > b.y - 24 && p.y < b.y + b.h + 24) { p.underCover = true; break; }
  }
  if (!p.underCover) {
    const pier = world.city.pier;
    if (p.x > pier.x && p.x < pier.x + pier.w && p.y > pier.y && p.y < pier.y + pier.h) p.underCover = true;
  }
}

function collideCarWithWorld(world, car) {
  const def = VEHICLES[car.kind];
  for (const b of world.city.buildings) {
    for (const c of carCircles(car, def)) {
      const probe = { x: c.x, y: c.y };
      if (resolveCircleRect(probe, c.r, b)) {
        // Push the whole car back along the probe correction and scrub speed.
        car.x += probe.x - c.x;
        car.y += probe.y - c.y;
        car.speed *= 0.55;
        if (Math.abs(car.speed) > 200) {
          car.hp -= 4;
          world.audio.thud();
          spawnSparks(world, car.x, car.y);
        }
      }
    }
  }
  car.x = clamp(car.x, 40, WORLD - 40);
  car.y = clamp(car.y, 40, WORLD - 40);
}

function spawnSparks(world, x, y) {
  for (let i = 0; i < 8; i++) {
    world.particles.push({ x, y, vx: (world.rng() - 0.5) * 260, vy: (world.rng() - 0.5) * 260, life: 0.4, max: 0.4, color: '#e8b81a', size: 3 });
  }
}

function tryEnterCar(world) {
  const p = world.player;
  let best = null, bestD = 130;
  for (const car of world.cars) {
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  const wasTraffic = best.driver === 'traffic';
  if (wasTraffic) {
    // Steal it: the driver bails and runs, witnesses may report it.
    const driver = { x: best.x + 30, y: best.y + 30, angle: 0, speed: 150, state: 'flee', tx: best.x + 300, ty: best.y + 300, color: '#d8d8d8', callTimer: 2.5, hp: 50, radius: 13, panic: 3 };
    world.peds.push(driver);
    world.stats.carsStolen += 1;
    const witnesses = world.peds.some((pd) => pd !== driver && dist(pd.x, pd.y, p.x, p.y) < 320);
    addCrime(world, 'steal', p.x, p.y, witnesses || true);
    world.message(`Stole a ${VEHICLES[best.kind].name}!`, '#e8b81a');
  }
  best.driver = 'player';
  p.inCar = best;
  world.audio.blip(520);
}

export function exitCar(world) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = 'parked';
  car.speed = 0;
  p.inCar = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 46;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 46;
}

function cycleWeapon(world) {
  const order = ['fist', 'pistol', 'shotgun'];
  const owned = order.filter((w) => world.player.weapons[w]);
  if (owned.length <= 1) return;
  const i = owned.indexOf(world.player.weapon);
  world.player.weapon = owned[(i + 1) % owned.length];
  world.audio.blip(700);
}

function tryAttack(world, input) {
  const p = world.player;
  if (p.shootTimer > 0) return;
  const wdef = WEAPONS[p.weapon];
  p.shootTimer = wdef.rate;
  const angle = world.aimAngle ?? p.angle;
  if (p.weapon === 'fist') {
    world.audio.thud();
    // Melee arc in front of the player.
    const targets = [...world.peds, ...world.gangs.active, ...world.cops];
    for (const t of targets) {
      if (t.hp <= 0) continue;
      const d = dist(p.x, p.y, t.x, t.y);
      const a = Math.atan2(t.y - p.y, t.x - p.x);
      if (d < 56 && Math.abs(angleDiff(angle, a)) < 1.1) {
        damagePerson(world, t, 25, 'player');
      }
    }
    return;
  }
  if ((p.ammo[p.weapon] ?? 0) <= 0) {
    world.audio.blip(220);
    world.message('Out of ammo — visit Iron & Lead.', '#e85a5a');
    return;
  }
  p.ammo[p.weapon] -= 1;
  world.stats.shotsFired += 1;
  const pellets = wdef.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const spread = pellets > 1 ? (world.rng() - 0.5) * 0.22 : (world.rng() - 0.5) * 0.03;
    world.spawnBullet(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, angle + spread, 780, wdef.dmg, 'player');
  }
  world.audio.shoot(true);
  // Gunfire is heard: nearby peds panic and may call the police.
  for (const pd of world.peds) {
    if (dist(pd.x, pd.y, p.x, p.y) < 520) {
      pd.state = 'flee';
      pd.panic = 4;
      if (pd.callTimer <= 0) pd.callTimer = 2 + world.rng() * 2;
    }
  }
  const witnessed = world.peds.some((pd) => dist(pd.x, pd.y, p.x, p.y) < 520)
    || world.cops.some((c) => dist(c.x, c.y, p.x, p.y) < 600);
  addCrime(world, 'shot', p.x, p.y, witnessed);
}

function damagePerson(world, t, dmg, from) {
  t.hp -= dmg;
  if (t.hp > 0) return;
  if (from === 'player') {
    world.stats.kills += 1;
    if (world.mission.active) {
      const s = world.mission.def?.steps[world.mission.step];
      if (s && s.type === 'kill') world.mission.progress += 1;
    }
    addCrime(world, 'kill', t.x, t.y, true);
    world.player.money += 20;
  }
  // Blood-ish particles.
  for (let i = 0; i < 10; i++) {
    world.particles.push({ x: t.x, y: t.y, vx: (world.rng() - 0.5) * 200, vy: (world.rng() - 0.5) * 200, life: 0.5, max: 0.5, color: '#a01818', size: 4 });
  }
}

// --- interaction: shops, mission giver, fares ------------------------------
function tryInteract(world) {
  const p = world.player;
  // Mission giver first.
  const giver = missionGiverPos(world);
  if (dist(p.x, p.y, giver.x, giver.y) < 100) {
    if (!world.mission.active && world.mission.index < 8) {
      world.beginMission();
      return;
    }
  }
  // Shops.
  for (const shop of world.city.shops) {
    if (dist(p.x, p.y, shop.x, shop.y) < 110) {
      doShop(world, shop);
      return;
    }
  }
  // Taxi fare pickup handled by proximity in updateFares; F also hails one.
  if (p.inCar) return;
}

export function missionGiverPos(world) {
  // Mara waits at Mercado before job 1, at Rosa's Diner after that.
  return world.mission.index === 0 ? { x: 2640, y: 720 } : { x: 720, y: 2640 };
}

// --- interaction: shops, mission giver, fares ------------------------------
function doShop(world, shop) {
  const p = world.player;
  if (shop.kind === 'gun') {
    if (!p.weapons.pistol) {
      if (p.money >= 450) { p.money -= 450; p.weapons.pistol = true; p.ammo.pistol = 24; p.weapon = 'pistol'; world.message('Bought P9 Pistol + ammo.', '#7ae88c'); }
      else world.message('P9 Pistol costs $450.', '#e85a5a');
    } else if (!p.weapons.shotgun) {
      if (p.money >= 900) { p.money -= 900; p.weapons.shotgun = true; p.ammo.shotgun = 12; p.weapon = 'shotgun'; world.message('Bought Scattergun.', '#7ae88c'); }
      else world.message('Scattergun costs $900.', '#e85a5a');
    } else {
      if (p.money >= 50) { p.money -= 50; p.ammo.pistol += 12; p.ammo.shotgun += 6; world.message('Ammo restocked.', '#7ae88c'); }
      else world.message('Ammo costs $50.', '#e85a5a');
    }
  } else if (shop.kind === 'spray') {
    if (p.inCar) {
      if (p.money >= 150) { p.money -= 150; clearCarEvidence(world); world.message('Repainted! CAR evidence cleared.', '#7ae88c'); }
      else world.message('Respray costs $150 — bring the car.', '#e85a5a');
    } else world.message('Bring a car into the spray shop.', '#e8b81a');
  } else if (shop.kind === 'diner') {
    if (p.money >= 25) { p.money -= 25; p.hp = Math.min(100, p.hp + 60); world.message("Rosa's special — health restored.", '#7ae88c'); }
    else world.message('A meal costs $25.', '#e85a5a');
  } else if (shop.kind === 'clothes') {
    if (p.money >= 80) { p.money -= 80; clearOutfitEvidence(world); world.message('New outfit! OUTFIT + FACE evidence cleared.', '#7ae88c'); }
    else world.message('A new outfit costs $80.', '#e85a5a');
  } else if (shop.kind === 'armor') {
    if (p.money >= 200) { p.money -= 200; p.armor = 100; world.message('Body armor fitted (100).', '#7ae88c'); }
    else world.message('Body armor costs $200.', '#e85a5a');
  }
  world.audio.cash();
}

// --- traffic ----------------------------------------------------------------
function spawnTrafficCar(world) {
  const p = world.player;
  const road = pick(world.rng, ROADS);
  const vertical = chance(world.rng, 0.5);
  const along = p.x + (world.rng() < 0.5 ? -1 : 1) * range(world.rng, 700, 1100);
  const kind = pick(world.rng, ['sedan', 'sedan', 'taxi', 'van', 'pickup', 'coupe', 'bike', 'muscle']);
  const x = vertical ? road : clamp(along, 200, WORLD - 200);
  const y = vertical ? clamp(along, 200, WORLD - 200) : road;
  const angle = vertical ? (chance(world.rng, 0.5) ? Math.PI / 2 : -Math.PI / 2) : (chance(world.rng, 0.5) ? 0 : Math.PI);
  const car = spawnCar(world, kind, x, y, angle, 'traffic');
  car.axis = vertical ? 'v' : 'h';
  car.road = road;
  car.dir = vertical ? (angle > 0 ? 1 : -1) : (angle === 0 ? 1 : -1);
  car.lane = chance(world.rng, 0.5) ? 24 : -24;
  car.speed = range(world.rng, 100, 180);
}

function lightState(world, ix, iy) {
  // Lights cycle every 12s; offset per intersection so the city isn't in sync.
  const light = world.city.lights[ix * ROADS.length + iy];
  const cycle = (world.elapsed + light.timer) % 12;
  return cycle < 6 ? 'v' : 'h'; // which axis has green
}

function updateTraffic(world, dt) {
  const p = world.player;
  for (const car of world.cars) {
    if (car.driver !== 'traffic') continue;
    const def = VEHICLES[car.kind];
    // Lane position: road centreline + lane offset.
    const laneOff = car.lane;
    let tx, ty;
    if (car.axis === 'v') { tx = car.road + laneOff; ty = car.y + car.dir * 100; }
    else { tx = car.x + car.dir * 100; ty = car.road + laneOff; }
    const wantAngle = Math.atan2(ty - car.y, tx - car.x);
    car.angle = turnToward(car.angle, wantAngle, 2.4 * dt);

    // Car-following: slow down for the car ahead in the same lane.
    let target = car.targetSpeed;
    for (const other of world.cars) {
      if (other === car || other.driver === 'player') continue;
      if (other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
      const ahead = car.axis === 'v' ? (other.y - car.y) * car.dir : (other.x - car.x) * car.dir;
      const lateral = car.axis === 'v' ? Math.abs(other.x - car.x) : Math.abs(other.y - car.y);
      if (ahead > 0 && ahead < 120 && lateral < 44) {
        target = Math.min(target, Math.max(0, other.speed - 20));
        if (ahead < 70) target = 0;
      }
    }
    // Red light: stop before the intersection.
    const nextRoad = nearestCrossing(car);
    if (nextRoad) {
      const d = dist(car.x, car.y, nextRoad.x, nextRoad.y);
      const ix = ROADS.indexOf(nextRoad.rx), iy = ROADS.indexOf(nextRoad.ry);
      if (ix >= 0 && iy >= 0) {
        const green = lightState(world, ix, iy);
        const myAxis = car.axis;
        if (green !== myAxis && d < 130 && d > 10) target = 0;
      }
    }
    // Overtake: if blocked for a while and the other lane is clear, shift lane.
    if (target === 0) {
      car.blockedTimer += dt;
      if (car.blockedTimer > 2.5) {
        car.lane = -car.lane;
        car.blockedTimer = 0;
        car.honk = 0.4;
      }
      if (car.blockedTimer > 1 && car.honk <= 0) {
        car.honk = 0.5;
        if (dist(car.x, car.y, p.x, p.y) < 500) world.audio.blip(340);
      }
    } else {
      car.blockedTimer = Math.max(0, car.blockedTimer - dt);
    }
    car.honk = Math.max(0, car.honk - dt);
    car.speed += clamp(target - car.speed, -260 * dt, 200 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;

    // At an intersection, sometimes turn onto the cross road.
    if (nextRoad && dist(car.x, car.y, nextRoad.x, nextRoad.y) < 26 && chance(world.rng, 0.3)) {
      if (car.axis === 'v') {
        car.axis = 'h'; car.road = nextRoad.ry;
        car.dir = chance(world.rng, 0.5) ? 1 : -1;
      } else {
        car.axis = 'v'; car.road = nextRoad.rx;
        car.dir = chance(world.rng, 0.5) ? 1 : -1;
      }
      car.lane = chance(world.rng, 0.5) ? 24 : -24;
    }
    // Despawn far-away cars so the array stays bounded.
    if (dist(car.x, car.y, p.x, p.y) > 1600) {
      car.dead = true;
    }
  }
  world.cars = world.cars.filter((c) => !c.dead);
}

function nearestCrossing(car) {
  // The next intersection ahead of the car along its axis.
  let best = null, bestD = Infinity;
  for (const rx of ROADS) {
    for (const ry of ROADS) {
      const ahead = car.axis === 'v' ? (ry - car.y) * car.dir : (rx - car.x) * car.dir;
      const lateral = car.axis === 'v' ? Math.abs(rx - car.x) : Math.abs(ry - car.y);
      if (ahead > 0 && ahead < 400 && lateral < 60 && ahead < bestD) {
        bestD = ahead;
        best = { x: rx, y: ry, rx, ry };
      }
    }
  }
  return best;
}

// --- pedestrians ------------------------------------------------------------
function spawnPed(world) {
  const pt = randomSidewalkPoint(world);
  world.peds.push({
    x: pt.x, y: pt.y, angle: world.rng() * TAU, speed: range(world.rng, 40, 70),
    state: 'walk', tx: pt.x, ty: pt.y, color: pick(world.rng, ['#e8b81a', '#2e8cc2', '#c23b2e', '#7a5ac2', '#3a8c5a']),
    callTimer: 0, hp: 50, radius: 13, panic: 0,
  });
}

function updatePeds(world, dt) {
  const p = world.player;
  for (const pd of world.peds) {
    if (pd.hp <= 0) continue;
    if (pd.state === 'flee') {
      pd.panic -= dt;
      const away = Math.atan2(pd.y - p.y, pd.x - p.x);
      pd.x += Math.cos(away) * 170 * dt;
      pd.y += Math.sin(away) * 170 * dt;
      pd.angle = away;
      if (pd.panic <= 0) pd.state = 'walk';
    } else {
      const d = dist(pd.x, pd.y, pd.tx, pd.ty);
      if (d < 20) {
        const pt = randomSidewalkPoint(world);
        pd.tx = pt.x; pd.ty = pt.y;
      }
      const a = Math.atan2(pd.ty - pd.y, pd.tx - pd.x);
      pd.angle = a;
      pd.x += Math.cos(a) * pd.speed * dt;
      pd.y += Math.sin(a) * pd.speed * dt;
    }
    // Calling the police after witnessing a shooting.
    if (pd.callTimer > 0) {
      pd.callTimer -= dt;
      if (pd.callTimer <= 0) {
        addCrime(world, 'shot', p.x, p.y, true);
        world.message('A witness called the police!', '#e85a5a');
      }
    }
    pd.x = clamp(pd.x, 60, WORLD - 60);
    pd.y = clamp(pd.y, 60, WORLD - 60);
  }
  world.peds = world.peds.filter((pd) => pd.hp > 0);
}

// --- police -----------------------------------------------------------------
function updateCops(world, dt) {
  const w = world.wanted;
  const p = world.player;
  const wantCops = w.stars === 0 ? 0 : w.stars <= 2 ? 2 : w.stars <= 4 ? 4 : 6;
  // Spawn cops until the wanted level's quota is met.
  if (world.cops.length < wantCops && w.stars > 0) {
    spawnCop(world);
  }
  for (const cop of world.cops) {
    if (cop.hp <= 0) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    const chasing = w.state === 'solid' || w.state === 'hollow';
    const searchAt = w.state === 'flashing' ? w.lastSeen : null;
    const tx = chasing ? p.x : searchAt ? searchAt.x : p.x;
    const ty = chasing ? p.y : searchAt ? searchAt.y : p.y;
    if (cop.car) {
      // Cop car: steer toward the target, faster than traffic — but hold off
      // at close range instead of ramming straight through the player.
      const want = Math.atan2(ty - cop.car.y, tx - cop.car.x);
      cop.car.angle = turnToward(cop.car.angle, want, 2.8 * dt);
      const playerSpeed = p.inCar ? Math.abs(p.inCar.speed) : 200;
      const targetSpeed = chasing ? (d < 170 ? Math.max(140, playerSpeed) : 430) : 200;
      cop.car.speed += clamp(targetSpeed - cop.car.speed, -300 * dt, 320 * dt);
      cop.car.x += Math.cos(cop.car.angle) * cop.car.speed * dt;
      cop.car.y += Math.sin(cop.car.angle) * cop.car.speed * dt;
      collideCarWithWorld(world, cop.car);
      cop.x = cop.car.x; cop.y = cop.car.y; cop.angle = cop.car.angle;
      // Close enough and player on foot: get out and chase on foot.
      if (chasing && d < 90 && !p.inCar) {
        cop.car.driver = 'parked';
        cop.car.speed = 0;
        cop.car = null;
      }
    } else {
      const want = Math.atan2(ty - cop.y, tx - cop.x);
      cop.angle = want;
      const sp = chasing ? 215 : 120;
      cop.x += Math.cos(want) * sp * dt;
      cop.y += Math.sin(want) * sp * dt;
      for (const b of world.city.buildings) resolveCircleRect(cop, 14, b);
      // Touching the player: busted / beaten.
      if (d < 30) {
        if (w.stars >= 3 && !p.inCar) {
          bustPlayer(world);
        } else {
          hurtPlayer(world, 12 * dt);
        }
      }
      // Far away and the player is driving: get back in a car.
      if (p.inCar && d > 500 && world.cops.length < 8) {
        const car = spawnCar(world, 'police', cop.x + 40, cop.y, cop.angle, 'police');
        cop.car = car;
      }
    }
    // Cop shooting when close and chasing.
    cop.shootTimer = (cop.shootTimer ?? 1) - dt;
    if (chasing && d < 420 && cop.shootTimer <= 0) {
      cop.shootTimer = 1.4;
      const a = Math.atan2(p.y - cop.y, p.x - cop.x) + (world.rng() - 0.5) * 0.2;
      world.spawnBullet(cop.x, cop.y, a, 520, 8, 'cop');
      world.audio.shoot(false);
    }
  }
  // Remove dead cops and their cars fade out.
  world.cops = world.cops.filter((c) => c.hp > 0);
}

function spawnCop(world) {
  const p = world.player;
  const angle = world.rng() * TAU;
  const x = clamp(p.x + Math.cos(angle) * range(world.rng, 500, 800), 80, 3760);
  const y = clamp(p.y + Math.sin(angle) * range(world.rng, 500, 800), 80, 3760);
  const inCar = world.wanted.stars >= 2 || dist(x, y, p.x, p.y) > 400;
  const cop = { x, y, angle: 0, hp: 100, car: null, shootTimer: 1 + world.rng() };
  if (inCar) {
    const pt = nearestRoadPoint(x, y);
    const car = spawnCar(world, 'police', pt.x, pt.y, 0, 'police');
    car.road = pt.x; car.axis = 'v';
    cop.car = car;
    cop.x = car.x; cop.y = car.y;
  }
  world.cops.push(cop);
}

function bustPlayer(world) {
  const p = world.player;
  p.hp = 100;
  p.money = Math.max(0, p.money - 300);
  world.wanted = createWanted();
  world.cops = [];
  world.heli.active = false;
  p.x = 1200; p.y = 1200; // SMPD precinct
  if (p.inCar) { p.inCar.driver = 'parked'; p.inCar = null; }
  world.message('BUSTED! $300 fine. The precinct lets you go... this time.', '#e85a5a');
}

export function hurtPlayer(world, dmg) {
  const p = world.player;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, dmg);
    p.armor -= absorbed;
    dmg -= absorbed;
  }
  p.hp -= dmg;
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    world.screen = 'gameover';
    world.gameOverTimer = 0;
    world.audio.thud();
  }
}

// --- helicopter -------------------------------------------------------------
function updateHeli(world, dt) {
  const w = world.wanted;
  const p = world.player;
  const heli = world.heli;
  if (w.stars >= 5 && w.state !== 'none') {
    if (!heli.active) {
      heli.active = true;
      heli.x = p.x - 400; heli.y = p.y - 400;
      world.message('SMPD helicopter overhead!', '#e85a5a');
    }
    const want = Math.atan2(p.y - heli.y, p.x - heli.x);
    heli.angle = want;
    const d = dist(heli.x, heli.y, p.x, p.y);
    if (d > 260) {
      heli.x += Math.cos(want) * 300 * dt;
      heli.y += Math.sin(want) * 300 * dt;
    } else {
      heli.x += Math.cos(want + Math.PI / 2) * 180 * dt;
      heli.y += Math.sin(want + Math.PI / 2) * 180 * dt;
    }
    if (p.underCover) {
      heli.coverTimer += dt;
      if (heli.coverTimer > 8) {
        heli.active = false;
        heli.coverTimer = 0;
        w.heat = Math.max(0, w.heat - 20);
        world.message('Lost the helicopter under cover.', '#7ae88c');
      }
    } else heli.coverTimer = 0;
  } else if (heli.active) {
    heli.active = false;
    heli.coverTimer = 0;
  }
}

// --- roadblocks ---------------------------------------------------------------
function updateRoadblocks(world, dt) {
  const w = world.wanted;
  const rb = world.roadblock;
  if (w.stars >= 4 && w.state === 'solid') {
    rb.timer -= dt;
    if (rb.timer <= 0) {
      rb.timer = 22;
      const p = world.player;
      const pt = nearestRoadPoint(p.x + Math.cos(p.angle) * 500, p.y + Math.sin(p.angle) * 500);
      if (pt) {
        for (let i = -1; i <= 1; i += 2) {
          const car = spawnCar(world, 'police', pt.x + i * 40, pt.y, Math.PI / 2, 'police');
          car.speed = 0;
          rb.cars.push(car);
        }
        world.message('Roadblock ahead!', '#e85a5a');
      }
    }
  }
  rb.cars = rb.cars.filter((c) => c.hp > 0 && dist(c.x, c.y, world.player.x, world.player.y) < 1200);
}

// --- bullets / particles ------------------------------------------------------
function updateBullets(world, dt) {
  const p = world.player;
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    // Buildings stop bullets.
    for (const bd of world.city.buildings) {
      if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { b.life = 0; break; }
    }
    if (b.life <= 0) continue;
    const targets = b.from === 'player'
      ? [...world.peds, ...world.gangs.active, ...world.cops]
      : b.from === 'gang' || b.from === 'cop'
        ? [p, ...world.cops.filter((c) => b.from === 'gang')]
        : [p];
    for (const t of targets) {
      if (!t || t.hp <= 0) continue;
      const r = t.radius ?? 14;
      if (dist(b.x, b.y, t.x, t.y) < r + 4) {
        b.life = 0;
        if (t === p) hurtPlayer(world, b.dmg);
        else damagePerson(world, t, b.dmg, b.from === 'player' ? 'player' : 'other');
        break;
      }
    }
    // Cars absorb bullets too.
    if (b.life > 0) {
      for (const car of world.cars) {
        if (car.driver === 'player' && b.from === 'player') continue;
        const def = VEHICLES[car.kind];
        for (const c of carCircles(car, def)) {
          if (dist(b.x, b.y, c.x, c.y) < c.r) {
            b.life = 0;
            car.hp -= b.dmg;
            if (car.hp <= 0 && !car.dead) {
              car.dead = true;
              for (let i = 0; i < 16; i++) world.particles.push({ x: car.x, y: car.y, vx: (world.rng() - 0.5) * 320, vy: (world.rng() - 0.5) * 320, life: 0.7, max: 0.7, color: '#e86a1a', size: 5 });
              if (car.driver === 'player') { world.player.inCar = null; hurtPlayer(world, 30); }
            }
            break;
          }
        }
        if (b.life <= 0) break;
      }
    }
  }
  world.bullets = world.bullets.filter((b) => b.life > 0);
}

function updateParticles(world, dt) {
  for (const pt of world.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);
}

// --- taxi fares ---------------------------------------------------------------
function updateFares(world, dt) {
  const p = world.player;
  const f = world.fare;
  const inTaxi = p.inCar && (p.inCar.kind === 'taxi' || world.mission.active);
  if (!f.active && inTaxi && p.inCar.kind === 'taxi') {
    // Offer a fare: a passenger waits at a roadside nearby.
    const pt = randomSidewalkPoint(world);
    f.active = true;
    f.stage = 'pickup';
    f.x = pt.x; f.y = pt.y;
    f.pay = int(world.rng, 40, 120);
  }
  if (!f.active) return;
  const d = dist(p.x, p.y, f.x, f.y);
  if (f.stage === 'pickup' && d < 80 && p.inCar) {
    f.stage = 'dropoff';
    const dest = randomSidewalkPoint(world);
    f.x = dest.x; f.y = dest.y;
    world.message('Passenger aboard — drive to the marker.', '#e8b81a');
  } else if (f.stage === 'dropoff' && d < 90) {
    p.money += f.pay;
    world.stats.fares += 1;
    world.audio.cash();
    world.message(`Fare complete! +$${f.pay}`, '#7ae88c');
    if (world.mission.active) {
      const s = world.mission.def?.steps[world.mission.step];
      if (s && s.type === 'fare') world.mission.progress += 1;
    }
    f.active = false;
    f.stage = 'none';
  }
}

// --- hidden packages ----------------------------------------------------------
function updatePackages(world) {
  const p = world.player;
  if (p.inCar) return;
  for (const pk of world.city.packages) {
    if (!pk.found && dist(p.x, p.y, pk.x, pk.y) < 40) {
      pk.found = true;
      world.stats.packages += 1;
      world.player.money += 100;
      world.audio.cash();
      world.message(`Hidden package ${world.stats.packages}/${HIDDEN_PACKAGES}! +$100`, '#7ae88c');
    }
  }
}

// --- camera -------------------------------------------------------------------
function updateCamera(world, dt) {
  const p = world.player;
  const cam = world.camera;
  const tx = clamp(p.x, 640, WORLD - 640);
  const ty = clamp(p.y, 360, WORLD - 360);
  cam.x += (tx - cam.x) * Math.min(1, dt * 5);
  cam.y += (ty - cam.y) * Math.min(1, dt * 5);
}

export { isNight };
