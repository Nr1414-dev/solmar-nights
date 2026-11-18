// SOLMAR NIGHTS v2.3 — world.js
// The living city: one state object and one update. The player (on foot
// or in a car), traffic that follows the road grid and stops at red
// lights, pedestrians who walk the sidewalks and run from gunfire, police
// who patrol, chase, roadblock and call in a helicopter, shops, pickups,
// weather and the day/night cycle — all of it advances here, in fixed
// 1/60s steps, from a seed.

import { ECONOMY, PLAYER, ROAD_CENTRES, STEP, VEHICLE_TYPES, WANTED, WORLD } from './config.js';
import { createCity, districtAt, isOnRoad, isSaltKingsTurf, landmarkByKind, lightPhase, nearestRoadCentre, nearestRoadPoint, randomSidewalkSpot, resolveCircle } from './city.js';
import { createGangs, gangAliveCount, killGangMember, updateGangs } from './gangs.js';
import { addCrime, clearWanted, createWanted, hasLineOfSight, updateWanted } from './wanted.js';
import { missionTarget, startMission, updateMission, nextMissionIndex } from './missions.js';
import { aheadBlocked, carStep, collideCars, heliStep, turnToward } from './physics.js';
import { createRandom, angleDiff, angleTo, clamp, dist, makeRng } from './random.js';

const TRAFFIC_COLORS = ['#d8dee9', '#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#95a5a6', '#2ecc71'];
const PED_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8'];

function randColor(rng, type) {
  if (type === 'taxi') return '#f7c948';
  if (type === 'police') return '#eef2f7';
  if (type === 'delivery') return '#ff8c42';
  return TRAFFIC_COLORS[Math.floor(rng.next() * TRAFFIC_COLORS.length)];
}

export function createWorld(seed, save, settings) {
  const rng = makeRng(seed);
  const city = createCity(seed);
  const G = {
    seed, city, rng,
    time: 0, dayTime: 8 * 3600, // 08:00
    weather: { kind: 'clear', rain: 0, fog: 0, timer: 90 },
    settings: settings ?? { music: 0.55, sfx: 0.8, minimap: 1, shake: true, hints: true },
    player: {
      x: 960, y: 2880, angle: -Math.PI / 2, vx: 0, vy: 0,
      hp: PLAYER.MAX_HP, armor: 0, cash: ECONOMY.START_CASH,
      weapon: 'fists', ammo: 0, outfit: 0,
      inCar: null, punchCd: 0, shootCd: 0, regenTimer: 0,
      lastHurt: 0, dead: false, walkPhase: 0, aiming: false,
    },
    campaign: {
      missionsDone: [], reputation: 0, kills: 0, carsStolen: 0,
      bestStars: 0, packages: [], taxiFares: 0,
    },
    wanted: createWanted(),
    gangs: createGangs(),
    mission: { active: false, index: -1, stage: '', timer: 0, target: null, targetName: '', checkpoint: 0, checkpoints: [], kills: 0, killsNeeded: 0, parcels: 0, parcelsDone: 0, robProgress: 0, startedAt: 0 },
    cars: [], peds: [], cops: [], particles: [], floaters: [], pickups: [],
    heli: { active: false, x: 0, y: 0, angle: 0, orbit: 0, coverTimer: 0 },
    camera: { x: 960, y: 2880, zoom: 1 },
    shake: 0, hudMessage: '', hudTimer: 0,
    taxi: { active: false, passenger: null, dest: null, fare: 0, timer: 0 },
    robHeld: false,
    ending: false, gameOver: false,
    stats: { shots: 0, hits: 0 },
    types: VEHICLE_TYPES,
  };
  if (save) {
    G.player.cash = save.cash ?? ECONOMY.START_CASH;
    G.player.weapon = save.weapon ?? 'fists';
    G.player.ammo = save.ammo ?? 0;
    G.player.armor = save.armor ?? 0;
    G.player.outfit = save.outfit ?? 0;
    G.player.x = save.x ?? 960; G.player.y = save.y ?? 2880;
    G.campaign.missionsDone = [...(save.missionsDone ?? [])];
    G.campaign.reputation = save.reputation ?? 0;
    G.campaign.kills = save.kills ?? 0;
    G.campaign.carsStolen = save.carsStolen ?? 0;
    G.campaign.bestStars = save.bestStars ?? 0;
    G.campaign.packages = [...(save.packages ?? [])];
    if (G.campaign.missionsDone.length > 0) G.gangs.active = true;
  }
  G.camera.x = G.player.x; G.camera.y = G.player.y;
  spawnParkedCars(G);
  spawnTraffic(G, 26);
  spawnPeds(G, 42);
  spawnPickups(G);
  return G;
}

function spawnPickups(G) {
  const rng = G.rng;
  for (let i = 0; i < 12; i++) {
    const spot = randomSidewalkSpot(G.city, rng, 1920, 1920, 1700);
    G.pickups.push({ x: spot.x, y: spot.y, kind: 'package', taken: G.campaign.packages.includes(i), id: i });
  }
  // Health + armor pickups near the hospital and the diner.
  G.pickups.push({ x: 1920, y: 2520, kind: 'health', taken: false, id: 100 });
  G.pickups.push({ x: 960, y: 2040, kind: 'health', taken: false, id: 101 });
  G.pickups.push({ x: 1440, y: 1560, kind: 'armor', taken: false, id: 102 });
}

function spawnCar(G, x, y, angle, typeKey, ai, color) {
  const t = VEHICLE_TYPES[typeKey];
  const car = {
    x, y, angle, vx: 0, vy: 0, speed: 0, slip: 0,
    type: t, typeKey, color: color ?? randColor(G.rng, typeKey),
    hp: t.hp, maxHp: t.hp, ai: ai ?? null, driver: ai ? 'ai' : null,
    dead: false, dir: 0, target: null, brakeTimer: 0, shootCd: 0,
    honkTimer: 0, stuckTimer: 0, lastX: x, lastY: y,
  };
  G.cars.push(car);
  return car;
}

function randomRoadPoint(G) {
  const horiz = G.rng.chance(0.5);
  const c = ROAD_CENTRES[G.rng.int(0, ROAD_CENTRES.length - 1)];
  const along = ROAD_CENTRES[G.rng.int(0, ROAD_CENTRES.length - 1)] + G.rng.range(-160, 160);
  return horiz ? { x: along, y: c } : { x: c, y: along };
}

function spawnParkedCars(G) {
  const types = ['sedan', 'sedan', 'taxi', 'sports', 'pickup', 'van', 'bike'];
  for (let i = 0; i < 16; i++) {
    const pt = randomRoadPoint(G);
    const angle = G.rng.chance(0.5) ? 0 : Math.PI / 2;
    const off = G.rng.chance(0.5) ? 30 : -30;
    const type = types[G.rng.int(0, types.length - 1)];
    spawnCar(G, pt.x + (angle === 0 ? 0 : off), pt.y + (angle === 0 ? off : 0), angle + (G.rng.chance(0.5) ? 0 : Math.PI), type, 'parked');
  }
  // The courier delivery van waits at the depot.
  spawnCar(G, 3360, 2760, Math.PI, 'delivery', 'parked');
  // A sports car waits in Downtown after mission 2.
  spawnCar(G, 2400, 1080, 0, 'sports', 'parked');
}

function spawnTraffic(G, n) {
  const types = ['sedan', 'sedan', 'taxi', 'pickup', 'van', 'sports', 'bike', 'truck', 'delivery'];
  for (let i = 0; i < n; i++) {
    const pt = randomRoadPoint(G);
    let angle = G.rng.chance(0.5) ? 0 : Math.PI / 2;
    if (G.rng.chance(0.5)) angle += Math.PI;
    const type = types[G.rng.int(0, types.length - 1)];
    const car = spawnCar(G, pt.x, pt.y, angle, type, 'traffic');
    car.dir = G.rng.chance(0.5) ? 1 : -1;
    car.target = nextIntersection(G, car);
  }
}

export function nextIntersection(G, car) {
  const cx = nearestRoadCentre(car.x);
  const cy = nearestRoadCentre(car.y);
  const horiz = Math.abs(car.y - cy) < Math.abs(car.x - cx);
  if (horiz) {
    const nx = cx + (Math.cos(car.angle) >= 0 ? ROAD_CENTRES[1] - ROAD_CENTRES[0] : -(ROAD_CENTRES[1] - ROAD_CENTRES[0]));
    return { x: clamp(nx, 480, 3360), y: cy };
  }
  const ny = cy + (Math.sin(car.angle) >= 0 ? 480 : -480);
  return { x: cx, y: clamp(ny, 480, 3360) };
}

function spawnPed(G, anywhere) {
  const spot = randomSidewalkSpot(G.city, G.rng, G.player.x, G.player.y, anywhere ? 1700 : 700);
  G.peds.push({
    x: spot.x, y: spot.y, angle: G.rng.range(0, Math.PI * 2),
    speed: G.rng.range(45, 75), color: PED_COLORS[G.rng.int(0, PED_COLORS.length - 1)],
    hp: 40, dead: false, fleeing: false, fleeTimer: 0,
    callTimer: -1, walkPhase: G.rng.range(0, 6), target: null, pauseTimer: G.rng.range(0, 3),
  });
}

function spawnPeds(G, n) { for (let i = 0; i < n; i++) spawnPed(G, true); }

export function addShake(G, amount) {
  if (G.settings.shake) G.shake = Math.min(14, G.shake + amount);
}

export function burst(G, x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const a = G.rng.range(0, Math.PI * 2);
    const s = G.rng.range(speed * 0.3, speed);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: G.rng.range(life * 0.5, life), size: G.rng.range(size * 0.5, size), color });
  }
}

export function floater(G, x, y, text, color) {
  G.floaters.push({ x, y, text, color, t: 0, life: 1.6 });
}

function explode(G, x, y, radius) {
  burst(G, x, y, 40, '#ff8c1a', 320, 0.9, 6);
  burst(G, x, y, 24, '#e74c3c', 200, 1.2, 8);
  burst(G, x, y, 16, '#555', 120, 1.6, 10);
  addShake(G, 10);
  for (const ped of G.peds) {
    if (!ped.dead && dist(ped.x, ped.y, x, y) < radius) killPed(G, ped, true);
  }
  const p = G.player;
  const d = dist(p.x, p.y, x, y);
  if (d < radius && !p.inCar) damagePlayer(G, 40);
  if (p.inCar && dist(p.inCar.x, p.inCar.y, x, y) < radius) damageCar(G, p.inCar, 60);
  addCrime(G, 'explosion', x, y, true);
}

function killPed(G, ped, silent) {
  if (ped.dead) return;
  ped.dead = true;
  burst(G, ped.x, ped.y, 10, '#c0392b', 140, 0.7, 4);
  if (!silent) {
    G.campaign.kills++;
    addCrime(G, 'killPed', ped.x, ped.y, true);
  }
}

function damagePed(G, ped, dmg, fromX, fromY) {
  if (ped.dead) return;
  ped.hp -= dmg;
  ped.fleeing = true; ped.fleeTimer = 4;
  const a = Math.atan2(ped.y - fromY, ped.x - fromX);
  ped.x += Math.cos(a) * 8; ped.y += Math.sin(a) * 8;
  if (ped.hp <= 0) killPed(G, ped, false);
}

export function damagePlayer(G, dmg) {
  const p = G.player;
  if (p.dead) return;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, dmg);
    p.armor -= absorbed; dmg -= absorbed;
  }
  p.hp -= dmg;
  p.regenTimer = PLAYER.REGEN_DELAY;
  p.lastHurt = G.time;
  addShake(G, 3);
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true; G.gameOver = true;
  }
}

export function damageCar(G, car, dmg) {
  if (car.dead) return;
  car.hp -= dmg;
  if (car.hp <= 0) {
    car.hp = 0; car.dead = true;
    explode(G, car.x, car.y, 130);
    if (car === G.player.inCar) {
      G.player.inCar = null;
      damagePlayer(G, 25);
      G.hudMessage = 'Your car exploded!'; G.hudTimer = 3;
    }
  }
}

function shootRay(G, fromX, fromY, angle) {
  // Step along the ray; return the first ped / gang member / cop hit, or null.
  for (let d = 14; d < PLAYER.SHOT_RANGE; d += 10) {
    const x = fromX + Math.cos(angle) * d;
    const y = fromY + Math.sin(angle) * d;
    if (G.city && (x < 40 || x > WORLD - 40 || y < 40 || y > WORLD - 40)) return { x, y, hit: null };
    for (const ped of G.peds) {
      if (!ped.dead && dist(ped.x, ped.y, x, y) < 14) return { x, y, hit: { kind: 'ped', ent: ped } };
    }
    for (const m of G.gangs.members) {
      if (!m.dead && dist(m.x, m.y, x, y) < 15) return { x, y, hit: { kind: 'gang', ent: m } };
    }
    for (const cop of G.cops) {
      if (!cop.dead && dist(cop.x, cop.y, x, y) < 14) return { x, y, hit: { kind: 'cop', ent: cop } };
    }
    // A building stops the bullet.
    if (G.city.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2)) {
      return { x, y, hit: null };
    }
  }
  return { x: fromX + Math.cos(angle) * PLAYER.SHOT_RANGE, y: fromY + Math.sin(angle) * PLAYER.SHOT_RANGE, hit: null };
}

export function screenToWorld(G, sx, sy) {
  return { x: G.camera.x + (sx - 640) / G.camera.zoom, y: G.camera.y + (sy - 360) / G.camera.zoom };
}

export function updateWorld(G, input, audio, dt, screen, passedActions) {
  if (screen !== 'play') return;
  const actions = passedActions ?? 0;
  G._input = input;
  G.time += dt;
  G.dayTime = (G.dayTime + dt) % 86400;
  if (G.hudTimer > 0) G.hudTimer -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 22);
  updateWeather(G, dt);
  updateMission(G, dt);
  updateWanted(G, dt);
  updateGangs(G, dt, {
    gangShoot(m, d, fog) {
      // Gang bullets: hit chance falls with distance and fog.
      const hitP = clamp(0.34 - d / 1400, 0.05, 0.34) * fog;
      if (G.rng.next() < hitP) damagePlayer(G, m.enforcer ? 12 : 8);
      burst(G, m.x, m.y, 2, '#ffd23e', 120, 0.2, 2);
      audio.shoot();
    },
    gangMelee(m) {
      if (G.rng.next() < dt * 1.2) damagePlayer(G, 6);
    },
  });
  updatePlayer(G, input, actions, audio, dt);
  updateCars(G, audio, dt);
  updatePeds(G, audio, dt);
  updatePolice(G, audio, dt);
  updateHeli(G, audio, dt);
  updateParticles(G, dt);
  updatePickups(G, audio, dt);
  updateTaxi(G, audio, dt);
  updateShops(G, actions, audio, dt);
  updateCamera(G, dt);
  // Keep the street populated.
  if (G.cars.filter((c) => c.ai === 'traffic').length < 20 && G.rng.chance(dt * 0.5)) {
    const pt = randomRoadPoint(G);
    const car = spawnCar(G, pt.x, pt.y, 0, 'sedan', 'traffic');
    car.target = nextIntersection(G, car);
  }
  if (G.peds.filter((p) => !p.dead).length < 30 && G.rng.chance(dt * 0.8)) spawnPed(G, false);
  G.peds = G.peds.filter((p) => !p.dead || G.time - (p.deathT ?? 0) < 6);
  G.cars = G.cars.filter((c) => !c.dead || c.driver === 'player' || G.time - (c.deathT ?? G.time) < 4);
  for (const c of G.cars) if (c.dead && c.deathT === undefined) c.deathT = G.time;
  for (const p of G.peds) if (p.dead && p.deathT === undefined) p.deathT = G.time;
  // Engine + siren ambience follow the state.
  const inCar = G.player.inCar;
  audio.engine(inCar ? clamp(Math.abs(inCar.speed) / 420, 0, 1) : 0, !!inCar);
  audio.siren(G.wanted.stars > 0);
}

function updatePlayer(G, input, actions, audio, dt) {
  const p = G.player;
  if (p.dead) return;
  const axes = input.axes();
  const mouseWorld = screenToWorld(G, input.mouse.x, input.mouse.y);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  if (p.regenTimer > 0) p.regenTimer -= dt;
  else if (p.hp < PLAYER.MAX_HP) p.hp = Math.min(PLAYER.MAX_HP, p.hp + PLAYER.REGEN_RATE * dt);
  G.robHeld = !!(actions & 32) || input.down('KeyF');

  if (p.inCar) {
    const car = p.inCar;
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    // Enter/exit, horn, handbrake.
    if (actions & 4) {
      G.player.inCar = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      resolveCircle(G.city, p, PLAYER.RADIUS);
      G.wanted.evidence.car = false; // ditching the car drops the car evidence
      audio.engine(0, false);
    }
    if (actions & 16) audio.horn();
    return;
  }

  // On foot: WASD moves, mouse aims, click / Space attacks.
  const speed = axes.sprint ? PLAYER.SPRINT : PLAYER.WALK;
  let mx = axes.x; let my = axes.y;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  p.vx = mx * speed; p.vy = my * speed;
  const nx = p.x + p.vx * dt;
  const ny = p.y + p.vy * dt;
  if (!G.city || true) {
    if (!isBlockedForPed(G, nx, p.y)) p.x = nx;
    if (!isBlockedForPed(G, p.x, ny)) p.y = ny;
  }
  p.x = clamp(p.x, 50, WORLD - 50);
  p.y = clamp(p.y, 50, WORLD - 50);
  p.walkPhase += (Math.abs(p.vx) + Math.abs(p.vy)) * dt * 0.06;
  p.angle = angleTo(p.x, p.y, mouseWorld.x, mouseWorld.y);
  p.aiming = input.mouse.down || axes.x !== 0 || axes.y !== 0;

  if (actions & 256) {
    // Q cycles weapon.
    const order = ['fists', 'pistol', 'shotgun'];
    const cur = order.indexOf(p.weapon);
    const owned = ['fists'];
    if (G.campaign.missionsDone.includes(1) || p.ammo > 0 || p.weapon !== 'fists') owned.push('pistol');
    if (G.campaign.missionsDone.includes(5)) owned.push('shotgun');
    const next = order[(cur + 1) % order.length];
    if (owned.includes(next) || next === 'fists') { p.weapon = next; G.hudMessage = `Weapon: ${next}`; G.hudTimer = 2; }
  }

  if (actions & 4) {
    // E: steal / enter the nearest car.
    const car = nearestCarTo(G, p.x, p.y, 64);
    if (car && !car.dead) {
      if (car.ai === 'traffic' || car.ai === 'parked') {
        const witnessed = pedWitnessNear(G, p.x, p.y, WANTED.CRIME_RADIUS) || copWitnessNear(G, p.x, p.y, WANTED.CRIME_RADIUS);
        addCrime(G, 'stealCar', p.x, p.y, witnessed);
        G.campaign.carsStolen++;
        car.ai = null; car.driver = 'player';
        G.player.inCar = car;
        G.hudMessage = `Stole the ${car.typeKey} — ${witnessed ? 'someone saw you!' : 'clean getaway'}`;
        G.hudTimer = 2.5;
        audio.horn();
      } else if (car.ai === 'police') {
        G.hudMessage = 'That car has a cop in it!'; G.hudTimer = 2;
      }
    }
  }

  if ((actions & 8) || input.mouse.down) {
    if (p.weapon === 'fists') {
      if (p.punchCd <= 0) {
        p.punchCd = PLAYER.PUNCH_CD;
        audio.punch();
        punchHit(G, p);
      }
    } else if (p.shootCd <= 0) {
      if (p.ammo <= 0) { audio.denied(); G.hudMessage = 'Out of ammo — buy more at Ironworks Arms'; G.hudTimer = 2.5; }
      else {
        p.shootCd = PLAYER.SHOT_CD;
        p.ammo--;
        G.stats.shots++;
        fireGun(G, p, audio);
      }
    }
  }

  if (actions & 32) {
    // F: interact — start a mission at Mara's office, take a taxi fare.
    const mara = landmarkByKind('office');
    if (dist(p.x, p.y, mara.x, mara.y) < 110) {
      const next = nextMissionIndex(G);
      if (next >= 0 && !G.mission.active) {
        startMission(G, next);
        audio.phone();
      } else if (G.mission.active) {
        G.hudMessage = 'Finish the current job first'; G.hudTimer = 2;
      } else {
        G.hudMessage = 'All jobs done — Solmar is yours'; G.hudTimer = 2;
      }
    }
  }
}

function isBlockedForPed(G, x, y) {
  // Pedestrians can walk anywhere except inside buildings and water.
  if (x < 45 || x > WORLD - 45 || y < 45 || y > WORLD - 45) return true;
  for (const b of G.city.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + 6 && Math.abs(y - b.y) < b.h / 2 + 6) return true;
  }
  return false;
}

function punchHit(G, p) {
  const reach = PLAYER.PUNCH_RANGE + 14;
  const fx = p.x + Math.cos(p.angle) * reach;
  const fy = p.y + Math.sin(p.angle) * reach;
  let hit = false;
  for (const ped of G.peds) {
    if (!ped.dead && dist(ped.x, ped.y, fx, fy) < 26) {
      damagePed(G, ped, PLAYER.PUNCH_DMG, p.x, p.y);
      addCrime(G, 'punch', ped.x, ped.y, pedWitnessNear(G, ped.x, ped.y, WANTED.CRIME_RADIUS));
      hit = true;
    }
  }
  for (const m of G.gangs.members) {
    if (!m.dead && dist(m.x, m.y, fx, fy) < 26) {
      m.hp -= PLAYER.PUNCH_DMG;
      if (m.hp <= 0) killGangMember(G, m);
      hit = true;
    }
  }
  for (const cop of G.cops) {
    if (!cop.dead && dist(cop.x, cop.y, fx, fy) < 26) {
      cop.hp -= PLAYER.PUNCH_DMG;
      addCrime(G, 'punch', cop.x, cop.y, true);
      if (cop.hp <= 0) { cop.dead = true; addCrime(G, 'killCop', cop.x, cop.y, true); }
      hit = true;
    }
  }
  if (hit) burst(G, fx, fy, 5, '#fff', 120, 0.3, 3);
}

function fireGun(G, p, audio) {
  const pellets = p.weapon === 'shotgun' ? PLAYER.SHOTGUN_PELLETS : 1;
  const spread = p.weapon === 'shotgun' ? 0.16 : 0.03;
  let anyHit = false;
  for (let i = 0; i < pellets; i++) {
    const a = p.angle + (G.rng.next() - 0.5) * spread * 2;
    const res = shootRay(G, p.x, p.y, a);
    burst(G, res.x, res.y, 3, '#ffd23e', 90, 0.25, 2);
    if (res.hit) {
      anyHit = true;
      G.stats.hits++;
      const dmg = p.weapon === 'shotgun' ? PLAYER.SHOTGUN_DMG : PLAYER.SHOT_DMG;
      if (res.hit.kind === 'ped') damagePed(G, res.hit.ent, dmg, p.x, p.y);
      if (res.hit.kind === 'gang') {
        const m = res.hit.ent;
        m.hp -= dmg;
        if (m.hp <= 0) killGangMember(G, m);
        if (G.mission.active && G.mission.index === 5) G.mission.kills = Math.min(G.mission.killsNeeded, G.mission.kills + (m.hp <= 0 ? 1 : 0));
      }
      if (res.hit.kind === 'cop') {
        const c = res.hit.ent;
        c.hp -= dmg;
        if (c.hp <= 0) { c.dead = true; addCrime(G, 'killCop', c.x, c.y, true); }
      }
    }
  }
  if (p.weapon === 'shotgun') audio.shotgun(); else audio.shoot();
  addShake(G, 1.5);
  // Gunfire is loud: nearby peds flee and call the police.
  for (const ped of G.peds) {
    if (!ped.dead && dist(ped.x, ped.y, p.x, p.y) < 420) {
      ped.fleeing = true; ped.fleeTimer = 5;
      if (ped.callTimer < 0) ped.callTimer = 2.5;
    }
  }
  const witnessed = pedWitnessNear(G, p.x, p.y, WANTED.CRIME_RADIUS) || copWitnessNear(G, p.x, p.y, WANTED.CRIME_RADIUS);
  addCrime(G, 'shoot', p.x, p.y, witnessed);
  G.wanted.evidence.weapon = true;
  if (!anyHit) { /* missed — the noise still counts */ }
}

function pedWitnessNear(G, x, y, radius) {
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (dist(ped.x, ped.y, x, y) < radius && hasLineOfSight(G, ped.x, ped.y, x, y)) return true;
  }
  return false;
}

function copWitnessNear(G, x, y, radius) {
  for (const cop of G.cops) {
    if (!cop.dead && dist(cop.x, cop.y, x, y) < radius) return true;
  }
  for (const car of G.cars) {
    if (car.ai === 'police' && !car.dead && dist(car.x, car.y, x, y) < radius) return true;
  }
  return false;
}

function nearestCarTo(G, x, y, maxD) {
  let best = null; let bd = maxD;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = dist(car.x, car.y, x, y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function trafficSteerTo(car, tx, ty) {
  const want = angleTo(car.x, car.y, tx, ty);
  return clamp(angleDiff(car.angle, want) * 2.4, -1, 1);
}

function updateCars(G, audio, dt) {
  const gripScale = wetGrip(G);
  for (const car of G.cars) {
    if (car.dead) continue;
    if (car.ai === 'traffic') updateTrafficCar(G, car, dt, gripScale);
    else if (car.ai === 'police') updatePoliceCar(G, car, dt, gripScale);
    else if (car.ai === 'rival') updateRivalCar(G, car, dt, gripScale);
    else if (car.driver === 'player') {
      // The player's car is driven from the input in updatePlayer's
      // car branch — handled by carStep here via the shared driver.
      const input = G._input;
      if (input) {
        const axes = input.axes();
        const throttle = axes.y < 0 ? 1 : axes.y > 0 ? -1 : 0;
        const steer = axes.x;
        carStep(car, { throttle, steer, handbrake: input.down('Space'), gripScale }, dt, G.city);
        if (Math.abs(car.speed) > 200 && G.rng.chance(dt * 2)) {
          burst(G, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 1, '#888', 40, 0.4, 3);
        }
      }
    }
    // Car-car collisions.
    for (const other of G.cars) {
      if (other === car || other.dead) continue;
      collideCars(car, other);
    }
    if (car.hp <= 0 && !car.dead) damageCar(G, car, 1);
  }
  // Running over a pedestrian while driving is a crime — if seen.
  const pc = G.player.inCar;
  if (pc && Math.abs(pc.speed) > 60) {
    for (const ped of G.peds) {
      if (!ped.dead && dist(ped.x, ped.y, pc.x, pc.y) < 24) {
        killPed(G, ped, false);
        addCrime(G, 'runOver', ped.x, ped.y, pedWitnessNear(G, ped.x, ped.y, WANTED.CRIME_RADIUS));
        addShake(G, 4);
        audio.crash();
      }
    }
  }
}

function updateTrafficCar(G, car, dt, gripScale) {
  // Follow the road grid: drive to the next intersection, then pick a
  // new one (straight, left or right — never a U-turn).
  const target = car.target ?? nextIntersection(G, car);
  const d = dist(car.x, car.y, target.x, target.y);
  if (d < 60) {
    car.target = nextIntersection(G, car);
    // At an intersection, sometimes turn: rotate the heading target.
    const r = G.rng.next();
    if (r < 0.3) {
      const turn = G.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      car.angle += turn;
      car.target = nextIntersection(G, car);
    }
  }
  let throttle = car.speed < 170 ? 0.8 : 0.3;
  // Red light: stop before the intersection.
  const atLight = Math.abs(car.x - nearestRoadCentre(car.x)) < 60 && Math.abs(car.y - nearestRoadCentre(car.y)) < 60;
  const horiz = Math.abs(car.y - nearestRoadCentre(car.y)) < 40;
  const phase = lightPhase(nearestRoadCentre(car.x), nearestRoadCentre(car.y), G.time);
  const myGreen = horiz ? phase === 'green' : phase === 'red';
  if (atLight && !myGreen && d < 130) throttle = -0.9;
  // Car-following: brake for the car ahead, honk if it sits too long.
  let blocked = false;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x; const dy = other.y - car.y;
    const fwd = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (fwd > 0 && fwd < 70 && side < 28) { blocked = true; break; }
  }
  if (blocked) {
    throttle = -0.9;
    car.brakeTimer += dt;
    if (car.brakeTimer > 3 && car.honkTimer <= 0) { car.honkTimer = 4; }
  } else car.brakeTimer = 0;
  car.honkTimer = Math.max(0, car.honkTimer - dt);
  if (aheadBlocked(G.city, car, 60)) throttle = -0.9;
  const steer = trafficSteerTo(car, target.x, target.y);
  carStep(car, { throttle, steer, handbrake: false, gripScale }, dt, G.city);
}

function updatePoliceCar(G, car, dt, gripScale) {
  const p = G.player;
  const tx = G.wanted.state === 'flashing' ? G.wanted.lastSeenX : p.x;
  const ty = G.wanted.state === 'flashing' ? G.wanted.lastSeenY : p.y;
  const d = dist(car.x, car.y, tx, ty);
  // Roadblock behaviour at 4+ stars: a couple of cars park across the
  // road ahead of the player instead of chasing.
  if (G.wanted.stars >= 4 && car.roadblock) {
    const bx = p.x + Math.cos(p.angle) * 260;
    const by = p.y + Math.sin(p.angle) * 260;
    const steer = trafficSteerTo(car, bx, by);
    carStep(car, { throttle: d > 40 ? 0.7 : 0, steer, handbrake: false, gripScale }, dt, G.city);
    return;
  }
  const steer = trafficSteerTo(car, tx, ty);
  let throttle = d > 60 ? 1 : 0.2;
  if (aheadBlocked(G.city, car, 70)) throttle = -0.8;
  // Ram the player's car.
  if (p.inCar && d < 70) {
    throttle = 1;
    if (G.rng.chance(dt * 0.8)) { damageCar(G, p.inCar, 6); }
  }
  carStep(car, { throttle, steer, handbrake: false, gripScale }, dt, G.city);
  // Foot cops shoot when close on foot.
  if (!p.inCar && d < 320) {
    car.shootCd -= dt;
    if (car.shootCd <= 0) {
      car.shootCd = 1.6;
      if (G.rng.chance(0.3)) damagePlayer(G, 7);
    }
  }
}

function updateRivalCar(G, car, dt, gripScale) {
  const p = G.player;
  const steer = trafficSteerTo(car, p.x, p.y);
  carStep(car, { throttle: 1, steer, handbrake: false, gripScale }, dt, G.city);
  if (dist(car.x, car.y, p.x, p.y) < 60) {
    damageCar(G, car, 0);
    if (p.inCar) damageCar(G, p.inCar, 4);
  }
}

function updatePeds(G, audio, dt) {
  for (const ped of G.peds) {
    if (ped.dead) continue;
    // A ped who heard gunfire calls the police after a few seconds.
    if (ped.callTimer > 0) {
      ped.callTimer -= dt;
      if (ped.callTimer <= 0) {
        ped.callTimer = -1;
        const w = G.wanted;
        if (w.stars === 0) {
          addCrime(G, 'shoot', ped.x, ped.y, true);
          G.hudMessage = 'A witness called the police!'; G.hudTimer = 3;
          audio.phone();
        }
      }
    }
    if (ped.fleeing) {
      ped.fleeTimer -= dt;
      const a = Math.atan2(ped.y - G.player.y, ped.x - G.player.x);
      ped.x += Math.cos(a) * 150 * dt;
      ped.y += Math.sin(a) * 150 * dt;
      ped.walkPhase += dt * 14;
      if (ped.fleeTimer <= 0) ped.fleeing = false;
      continue;
    }
    ped.pauseTimer -= dt;
    if (ped.pauseTimer > 0) continue;
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 20) {
      ped.target = randomSidewalkSpot(G.city, G.rng, ped.x, ped.y, 500);
      ped.pauseTimer = G.rng.range(0, 2);
    }
    const a = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    ped.angle = a;
    ped.x += Math.cos(a) * ped.speed * dt;
    ped.y += Math.sin(a) * ped.speed * dt;
    ped.walkPhase += dt * 8;
    if (isBlockedForPed(G, ped.x, ped.y)) {
      ped.x -= Math.cos(a) * ped.speed * dt * 2;
      ped.y -= Math.sin(a) * ped.speed * dt * 2;
      ped.target = null;
    }
  }
}

function spawnFootCop(G, x, y) {
  G.cops.push({ x, y, angle: 0, hp: 60, dead: false, shootCd: 1, walkPhase: 0 });
}

function updatePolice(G, audio, dt) {
  updatePoliceSpawns(G, dt);
  const p = G.player;
  for (const cop of G.cops) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    const tx = G.wanted.state === 'flashing' ? G.wanted.lastSeenX : p.x;
    const ty = G.wanted.state === 'flashing' ? G.wanted.lastSeenY : p.y;
    const a = Math.atan2(ty - cop.y, tx - cop.x);
    cop.angle = a;
    if (d > 40) {
      cop.x += Math.cos(a) * 145 * dt;
      cop.y += Math.sin(a) * 145 * dt;
      cop.walkPhase += dt * 9;
    }
    if (d < 26 && G.rng.chance(dt * 1.5)) damagePlayer(G, 5);
    cop.shootCd -= dt;
    if (cop.shootCd <= 0 && d < 380 && d > 60) {
      cop.shootCd = 1.8;
      if (G.rng.chance(0.32)) damagePlayer(G, 8);
      burst(G, cop.x, cop.y, 2, '#ffd23e', 100, 0.2, 2);
    }
  }
  G.cops = G.cops.filter((c) => !c.dead || G.time - (c.deathT ?? G.time) < 5);
  for (const c of G.cops) if (c.dead && c.deathT === undefined) c.deathT = G.time;
}

function updatePoliceSpawns(G, dt) {
  const w = G.wanted;
  if (w.stars === 0 || w.state === 'red') return;
  const wantCars = WANTED.CHASE_CARS[w.stars] ?? 0;
  const haveCars = G.cars.filter((c) => c.ai === 'police' && !c.dead).length;
  G._policeTimer = (G._policeTimer ?? 0) - dt;
  if (haveCars < wantCars && G._policeTimer <= 0) {
    G._policeTimer = 2.5;
    const p = G.player;
    const a = G.rng.range(0, Math.PI * 2);
    const spot = nearestRoadPoint(p.x + Math.cos(a) * 620, p.y + Math.sin(a) * 620);
    const x = spot.x;
    const y = spot.y;
    const car = spawnCar(G, clamp(x, 100, WORLD - 100), clamp(y, 100, WORLD - 100), a, 'police', 'police');
    car.roadblock = G.wanted.stars >= 4 && haveCars >= 2;
  }
  // Foot cops join at 2+ stars, up to a small squad.
  const wantCops = Math.min(4, Math.max(0, w.stars - 1));
  if (G.cops.filter((c) => !c.dead).length < wantCops && G._policeTimer <= 0) {
    G._policeTimer = 3;
    spawnFootCop(G, G.player.x + G.rng.range(-400, 400), G.player.y + G.rng.range(-400, 400));
  }
}

function wetGrip(G) {
  if (G.weather.kind === 'rain') return 0.78;
  if (G.weather.kind === 'fog') return 0.9;
  return 1;
}

function updateWeather(G, dt) {
  const w = G.weather;
  w.timer -= dt;
  if (w.timer <= 0) {
    w.timer = G.rng.range(70, 130);
    const roll = G.rng.next();
    w.kind = roll < 0.55 ? 'clear' : roll < 0.8 ? 'rain' : 'fog';
    if (w.kind !== 'clear') {
      G.hudMessage = w.kind === 'rain' ? 'Rain storm — roads are slick!' : 'Fog rolls in off the bay — visibility down';
      G.hudTimer = 3.5;
    }
  }
  w.rain = w.kind === 'rain' ? Math.min(1, w.rain + dt * 0.5) : Math.max(0, w.rain - dt * 0.5);
  w.fog = w.kind === 'fog' ? Math.min(1, w.fog + dt * 0.5) : Math.max(0, w.fog - dt * 0.5);
}

function updateHeli(G, audio, dt) {
  const h = G.heli;
  const want = G.wanted.stars >= WANTED.HELI_STARS;
  if (want && !h.active) {
    h.active = true;
    h.x = G.player.x - 400; h.y = G.player.y - 400;
    G.hudMessage = 'Police helicopter overhead — get under cover!'; G.hudTimer = 4;
  }
  if (!want && G.wanted.stars <= WANTED.HELI_LEAVE_STARS) h.active = false;
  if (!h.active) return;
  heliStep(h, G.player.x, G.player.y, dt, 260, 220, 30);
  // Under cover (off the road, between buildings) shakes the spotlight.
  const onRoad = isOnRoad(G.player.x, G.player.y);
  if (!onRoad) {
    h.coverTimer += dt;
    if (h.coverTimer > WANTED.HELI_COVER_SECONDS) {
      h.active = false; h.coverTimer = 0;
      G.wanted.state = 'flashing';
      G.hudMessage = 'Lost the helicopter in the backstreets!'; G.hudTimer = 3;
    }
  } else h.coverTimer = 0;
  if (G.rng.chance(dt * 0.5)) audio.heli();
}

function updateParticles(G, dt) {
  for (const pt of G.particles) {
    pt.t += dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= (1 - dt * 2); pt.vy *= (1 - dt * 2);
  }
  G.particles = G.particles.filter((p) => p.t < p.life);
  for (const f of G.floaters) { f.t += dt; f.y -= 22 * dt; }
  G.floaters = G.floaters.filter((f) => f.t < f.life);
}

function updatePickups(G, audio, dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    if (pk.taken) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 34) {
      pk.taken = true;
      if (pk.kind === 'package') {
        G.campaign.packages.push(pk.id);
        p.cash += ECONOMY.PACKAGE_CASH;
        floater(G, pk.x, pk.y, `Hidden package +$${ECONOMY.PACKAGE_CASH} (${G.campaign.packages.length}/12)`, '#ffd23e');
        audio.cash();
      } else if (pk.kind === 'health') {
        p.hp = Math.min(PLAYER.MAX_HP, p.hp + 50);
        floater(G, pk.x, pk.y, '+50 HP', '#2ecc71');
        audio.pickup();
      } else if (pk.kind === 'armor') {
        p.armor = Math.min(PLAYER.ARMOR_MAX, p.armor + 50);
        floater(G, pk.x, pk.y, '+50 Armor', '#3498db');
        audio.pickup();
      }
    }
  }
}

function updateTaxi(G, audio, dt) {
  const t = G.taxi;
  const p = G.player;
  if (!t.active) {
    // A taxi fare appears when you are driving a taxi with no job.
    if (p.inCar && p.inCar.typeKey === 'taxi' && !G.mission.active && G.rng.chance(dt * 0.08)) {
      t.active = true;
      t.dest = randomRoadPoint(G);
      t.fare = ECONOMY.TAXI_FARE;
      t.timer = 90;
      G.hudMessage = 'Taxi fare! Take the passenger to the marker'; G.hudTimer = 3.5;
      audio.phone();
    }
    return;
  }
  t.timer -= dt;
  if (t.timer <= 0 || !p.inCar || p.inCar.typeKey !== 'taxi') { t.active = false; return; }
  if (dist(p.x, p.y, t.dest.x, t.dest.y) < 80) {
    p.cash += t.fare;
    G.campaign.taxiFares++;
    floater(G, p.x, p.y, `Taxi fare +$${t.fare}`, '#ffd23e');
    audio.cash();
    t.active = false;
  }
}

function updateShops(G, actions, audio, dt) {
  const p = G.player;
  if (p.inCar) return;
  const tryShop = (kind, fn) => {
    const lm = landmarkByKind(kind);
    if (dist(p.x, p.y, lm.x, lm.y) < 100 && (actions & 32)) fn(lm);
  };
  tryShop('gun', () => {
    // Ironworks Arms: buy pistol / shotgun / ammo / armor.
    if (p.weapon === 'fists' && p.cash >= ECONOMY.PISTOL_PRICE) {
      p.cash -= ECONOMY.PISTOL_PRICE; p.weapon = 'pistol'; p.ammo += 24;
      G.hudMessage = 'Bought a pistol (+24 ammo)'; G.hudTimer = 3; audio.cash();
    } else if (p.weapon === 'pistol' && p.cash >= ECONOMY.AMMO_PRICE) {
      p.cash -= ECONOMY.AMMO_PRICE; p.ammo += ECONOMY.AMMO_PACK;
      G.hudMessage = `Bought ${ECONOMY.AMMO_PACK} rounds`; G.hudTimer = 2.5; audio.cash();
    } else if (G.campaign.missionsDone.includes(5) && p.weapon !== 'shotgun' && p.cash >= ECONOMY.SHOTGUN_PRICE) {
      p.cash -= ECONOMY.SHOTGUN_PRICE; p.weapon = 'shotgun'; p.ammo += 12;
      G.hudMessage = 'Bought a shotgun (+12 shells)'; G.hudTimer = 3; audio.cash();
    } else if (p.armor < PLAYER.ARMOR_MAX && p.cash >= ECONOMY.ARMOR_PRICE) {
      p.cash -= ECONOMY.ARMOR_PRICE; p.armor = Math.min(PLAYER.ARMOR_MAX, p.armor + 50);
      G.hudMessage = 'Body armor fitted (+50)'; G.hudTimer = 2.5; audio.cash();
    } else { G.hudMessage = 'Ironworks Arms: pistol $350 · ammo $60 · armor $220 · shotgun $800 (after Kings Turf)'; G.hudTimer = 4; audio.denied(); }
  });
  tryShop('spray', () => {
    if (p.cash >= ECONOMY.SPRAY_PRICE && (G.wanted.stars > 0 || G.wanted.evidence.cctv || p.inCar)) {
      p.cash -= ECONOMY.SPRAY_PRICE;
      if (p.inCar) { /* respray handled below via car color */ }
      clearWanted(G);
      G.hudMessage = 'Fresh paint — the heat is gone and the CCTV tape is wiped'; G.hudTimer = 3.5;
      audio.cash();
    } else { G.hudMessage = `Solmar Spray: respray $${ECONOMY.SPRAY_PRICE} — clears wanted + CCTV`; G.hudTimer = 3; }
  });
  tryShop('diner', () => {
    if (p.cash >= ECONOMY.HEAL_PRICE && p.hp < PLAYER.MAX_HP) {
      p.cash -= ECONOMY.HEAL_PRICE; p.hp = PLAYER.MAX_HP;
      G.hudMessage = 'Sunset Diner special — fully healed'; G.hudTimer = 2.5; audio.cash();
    } else { G.hudMessage = `Sunset Diner: full meal $${ECONOMY.HEAL_PRICE} restores all HP`; G.hudTimer = 3; }
  });
  tryShop('clothes', () => {
    if (p.cash >= 100) {
      p.cash -= 100;
      G.wanted.evidence.outfit = false;
      p.outfit = (p.outfit + 1) % 4;
      G.hudMessage = 'New outfit — the outfit evidence is gone'; G.hudTimer = 3; audio.cash();
    } else { G.hudMessage = 'Marina Threads: new outfit $100 — clears outfit evidence'; G.hudTimer = 3; }
  });
  // Spray shop also works from the car: drive in and press F.
  if (p.inCar) {
    const lm = landmarkByKind('spray');
    if (dist(p.x, p.y, lm.x, lm.y) < 110 && (actions & 32) && p.cash >= ECONOMY.SPRAY_PRICE) {
      p.cash -= ECONOMY.SPRAY_PRICE;
      p.inCar.color = TRAFFIC_COLORS[G.rng.int(0, TRAFFIC_COLORS.length - 1)];
      clearWanted(G);
      G.hudMessage = 'Resprayed — clean car, clean slate'; G.hudTimer = 3; audio.cash();
    }
  }
  // Bribe: press F near a cop car at low stars is not possible; instead
  // the diner owner offers a bribe contact when you are wanted.
  void audio; void dt;
}

function updateCamera(G, dt) {
  const p = G.player;
  const tx = p.x + (p.inCar ? Math.cos(p.angle) * 60 : 0);
  const ty = p.y + (p.inCar ? Math.sin(p.angle) * 60 : 0);
  const k = 1 - Math.exp(-4 * dt);
  G.camera.x += (tx - G.camera.x) * k;
  G.camera.y += (ty - G.camera.y) * k;
  G.camera.zoom = p.inCar ? 0.85 : 1;
}
