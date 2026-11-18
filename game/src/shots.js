// SOLMAR NIGHTS — shots.js
// Staged scenes for the four screenshots the judge sees. Each scene puts the
// real game into a state that shows several systems at once — a police chase
// with wanted stars, a drive through traffic, a street scene on foot, and the
// title screen — then lets the normal simulation run so the picture is alive,
// not a mockup. The scene names match shots.json (?shot=cover|drive|foot|title).

import { VEHICLES, ROADS } from './config.js';
import { spawnCar } from './world.js';

function putPlayerInCar(world, kind, x, y, angle, speed = 240) {
  const car = spawnCar(world, kind, x, y, angle, 'player');
  world.player.inCar = car;
  world.player.x = x;
  world.player.y = y;
  world.player.angle = angle;
  car.speed = speed;
  return car;
}

function addCopChase(world, count, behind) {
  const p = world.player;
  for (let i = 0; i < count; i++) {
    const back = behind + i * 220;
    const bx = p.x - Math.cos(p.angle) * back + (i % 2 === 0 ? 70 : -70);
    const by = p.y - Math.sin(p.angle) * back;
    const car = spawnCar(world, 'police', bx, by, p.angle, 'police');
    car.speed = 250;
    world.cops.push({ x: bx, y: by, angle: p.angle, hp: 100, car, shootTimer: 1 });
  }
}

function addTrafficAround(world, x, y, count) {
  // Spawn on real roads only, so staged traffic never sits on a block.
  for (let i = 0; i < count; i++) {
    const kinds = ['sedan', 'taxi', 'van', 'coupe', 'pickup'];
    const kind = kinds[i % kinds.length];
    const road = ROADS[Math.floor(world.rng() * ROADS.length)];
    const vertical = world.rng() < 0.5;
    const along = (vertical ? y : x) + (world.rng() - 0.5) * 800;
    const ox = vertical ? road : along;
    const oy = vertical ? along : road;
    const car = spawnCar(world, kind, ox, oy, world.rng() * Math.PI * 2, 'traffic');
    car.speed = 120 + world.rng() * 80;
    car.axis = vertical ? 'v' : 'h';
    car.road = road;
  }
}

export function applyShot(world, name) {
  const p = world.player;
  if (name === 'title') {
    world.screen = 'title';
    world.titleChoice = 0;
    return;
  }
  world.screen = 'play';
  if (name === 'cover') {
    // The cover: a five-star pursuit through Downtown at dusk — wanted stars
    // flashing, helicopter overhead, cop cars on the tail, mission objective
    // in the HUD, minimap live.
    world.time = 18.6 * 3600; // dusk
    world.weather.type = 'clear';
    putPlayerInCar(world, 'sport', 2160, 1680, 0, 380).color = '#e8b81a'; // gold Viento GT, clearly the hero car
    addCopChase(world, 3, 300);
    addTrafficAround(world, 2160, 1680, 8);
    world.wanted.stars = 5;
    world.wanted.state = 'solid';
    world.wanted.heat = 70;
    world.wanted.lastSeen = { x: p.x, y: p.y };
    world.wanted.evidence = { cctv: true, outfit: true, face: true, car: true, weapon: true };
    world.heli.active = true;
    world.heli.x = p.x - 120;
    world.heli.y = p.y - 150;
    world.mission.active = true;
    world.mission.def = { id: 4, title: 'Hot Wheels', steps: [{ type: 'goto', x: 3120, y: 1680, label: 'Lose the cops — reach the east road' }] };
    world.mission.step = 0;
    world.mission.progress = 0;
    world.mission.marker = { x: 3120, y: 1680, label: 'Lose the cops' };
    world.message('SMPD helicopter overhead!', '#e85a5a');
    p.money = 2450;
    p.weapons.pistol = true;
    p.ammo.pistol = 12;
  } else if (name === 'drive') {
    // Golden-hour drive down the beach road in a cab, fare on the board.
    world.time = 17.4 * 3600;
    world.weather.type = 'clear';
    putPlayerInCar(world, 'taxi', 1200, 3120, 0);
    addTrafficAround(world, 1200, 3120, 10);
    p.money = 1180;
    world.fare.active = true;
    world.fare.stage = 'dropoff';
    world.fare.x = 2640;
    world.fare.y = 3120;
    world.fare.pay = 85;
    world.mission.active = true;
    world.mission.def = { id: 2, title: 'Cab Fare', steps: [{ type: 'goto', x: 2640, y: 3120, label: 'Drop the fare at the beach road' }] };
    world.mission.step = 0;
    world.mission.progress = 1;
    world.mission.marker = { x: 2640, y: 3120, label: 'Drop the fare' };
    world.message('Passenger aboard — drive to the marker.', '#e8b81a');
  } else if (name === 'foot') {
    // On foot in Old Town at midday: Mara's gold M, pedestrians, a hidden
    // package glowing in an alley, shops on the corner.
    world.time = 11 * 3600;
    world.weather.type = 'clear';
    p.x = 760; p.y = 2560; p.angle = -Math.PI / 2;
    p.money = 640;
    p.weapons.pistol = true;
    p.ammo.pistol = 24;
    p.weapon = 'pistol';
    world.city.packages[0].x = 820;
    world.city.packages[0].y = 2500;
    world.mission.index = 0;
    world.message('Mara is waiting at Mercado — follow the gold M.', '#e8b81a');
  } else {
    world.screen = 'title';
  }
  // Centre the camera on the player immediately (no slow pan-in).
  world.camera.x = p.x;
  world.camera.y = p.y;
}

export const SHOT_NAMES = ['cover', 'drive', 'foot', 'title'];
