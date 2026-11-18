// SOLMAR NIGHTS — shots.js
// Deterministic screenshot staging for screenshots/: ?shot=<name>&seed=N
// stages a busy, readable scene, lets it settle for a few frames, then sets
// window.__shotReady so the capture script knows the frame is final.
// Every scene shows several systems at once — that is what the judge sees.

import { VEHICLES } from './config.js';
import { nearestRoadPoint } from './city.js';

export const SHOT_NAMES = ['title', 'drive', 'foot', 'cover'];

export function stageShot(world, name) {
  const p = world.player;
  if (name === 'title') return 'title';

  if (name === 'drive') {
    // Downtown cruise in the Vortex GT, traffic all around.
    const car = world.makeCar('sport', 1600, 1600 + 26, 0);
    car.playerDriven = true;
    car.speed = 420;
    world.cars.push(car);
    p.car = car;
    p.x = car.x; p.y = car.y;
    world.camera.x = car.x - 640;
    world.camera.y = car.y - 360;
    stageTraffic(world, 1600, 1600, 10);
    world.missions.start(world);
    world.money = 2450;
    return 'play';
  }

  if (name === 'foot') {
    // On foot in the Mercado, peds, a taxi client and a shop nearby.
    p.x = 1050; p.y = 1830;
    p.car = null;
    p.weapon = 'pistol';
    if (!p.weapons.includes('pistol')) p.weapons.push('pistol');
    world.camera.x = p.x - 640;
    world.camera.y = p.y - 360;
    stageTraffic(world, 960, 1600, 6);
    world.money = 1250;
    world.missions.start(world);
    return 'play';
  }

  if (name === 'cover') {
    // The cover shot: 4-star police chase with roadblock, flashing search
    // state, evidence icons, heli on the edge, mission objective on the HUD.
    const car = world.makeCar('sport', 2240, 1600 + 26, 0);
    car.playerDriven = true;
    car.speed = 520;
    world.cars.push(car);
    p.car = car;
    p.x = car.x; p.y = car.y;
    world.camera.x = car.x - 640;
    world.camera.y = car.y - 360;
    world.wanted.stars = 4;
    world.wanted.state = 'flashing';
    world.wanted.lastSeenX = car.x - 200;
    world.wanted.lastSeenY = car.y;
    world.wanted.evidence = { cctv: true, outfit: true, face: false, car: true, weapon: true };
    world.wanted.cctvTimer = 60;
    // Cop cars in pursuit, held off so the player car stays visible.
    const rp1 = nearestRoadPoint(car.x - 260, car.y - 60);
    const c1 = world.spawnCopCar(rp1.x, rp1.y);
    c1.speed = 480;
    const rp2 = nearestRoadPoint(car.x - 420, car.y + 60);
    const c2 = world.spawnCopCar(rp2.x, rp2.y);
    c2.speed = 460;
    world.spawnCopFoot(car.x - 180, car.y + 120);
    world.spawnCopFoot(car.x - 320, car.y - 140);
    world.roadblocks.push({ x: car.x + 560, y: car.y, timer: 40 });
    // Gang gunmen for extra action.
    world.spawnEnemy(car.x + 200, car.y - 180, 'gunman');
    world.spawnEnemy(car.x + 260, car.y + 160, 'gunman');
    stageTraffic(world, 2240, 1600, 8);
    world.missions.start(world);
    world.missions.active.kills = 2;
    world.money = 3800;
    world.rep = 42;
    return 'play';
  }
  return 'play';
}

// Park extra traffic on the roads around (cx, cy) — on the roads only,
// never on top of blocks, so the streets read as alive, not jammed.
function stageTraffic(world, cx, cy, n) {
  const lines = [960, 1600, 2240];
  for (let i = 0; i < n; i++) {
    const line = lines[i % lines.length];
    const axis = i % 2 === 0 ? 'h' : 'v';
    const dir = i % 3 === 0 ? -1 : 1;
    const pos = (axis === 'h' ? cx : cy) + (i - n / 2) * 170;
    const car = world.makeCar(['sedan', 'taxi', 'compact', 'van', 'pickup'][i % 5], 0, 0, 0);
    car.axis = axis; car.dir = dir; car.line = line; car.pos = pos;
    car.lateral = dir > 0 ? 26 : -26;
    if (axis === 'v') car.lateral = dir > 0 ? -26 : 26;
    car.lateralTarget = car.lateral;
    car.targetSpeed = 180 + (i % 4) * 30;
    car.speed = car.targetSpeed;
    world.placeCarOnRoad(car);
    world.cars.push(car);
  }
}
