// SOLMAR NIGHTS — world.js
// The living city: the player, traffic AI, pedestrians, police, helicopter,
// combat, shops, taxi fares and weather. One World object owns all of it.

import {
  WORLD_SIZE, ROAD_LINES, ROAD_WIDTH, VEHICLES, WEAPONS, SHOP_PRICES,
  PLAYER_WALK_SPEED, PLAYER_RUN_SPEED, PLAYER_HEALTH_MAX, DAY_LENGTH,
  START_TIME, WANTED,
} from './config.js';
import { Rng } from './random.js';
import { buildCity, isOnRoad, nearestRoadPoint, collideBuildings, buildingHit, underCover, lightState, nearestShop } from './city.js';
import { clamp, dist, angleTo, angleDiff, turnToward, TAU } from './physics.js';
import { Wanted } from './wanted.js';
import { MissionManager } from './missions.js';
import { GangManager } from './gangs.js';
import { AudioSys } from './audio.js';

const TRAFFIC_COUNT = 26;
const PED_COUNT = 34;

function laneFor(axis, dir) {
  // Right-hand traffic: eastbound sits south of the line, southbound west.
  if (axis === 'h') return dir > 0 ? 26 : -26;
  return dir > 0 ? -26 : 26;
}

export class World {
  constructor(seed = 7) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.city = buildCity(seed);
    this.audio = new AudioSys();
    this.wanted = new Wanted();
    this.missions = new MissionManager();
    this.gangs = new GangManager();
    this.money = 250;
    this.rep = 0;
    this.timeHours = START_TIME;
    this.weather = { type: 'clear', timer: 90, intensity: 0 };
    this.toasts = [];
    this.particles = [];
    this.bullets = [];
    this.enemies = [];
    this.cops = [];
    this.cars = [];
    this.peds = [];
    this.heli = { x: 0, y: 0, active: false, coverTimer: 0, angle: 0 };
    this.roadblocks = [];
    this.taxi = { active: false, waiting: null, fare: null, timer: 0 };
    this.shopOpen = null;
    this.packagesFound = 0;
    this.unlocked = { pistol: false, shotgun: false, smg: false, armor: false };
    this.stats = { kills: 0, carsStolen: 0, shotsFired: 0, distance: 0, fares: 0 };
    this.camera = { x: 0, y: 0 };
    this.minimapSize = 1; // 0 small, 1 medium, 2 large
    this.message = null; // big centre banner {text, timer}
    this.gameOver = false;
    this.win = false;
    this.spawnCooldown = 0;

    this.player = {
      x: 1030, y: 1800, angle: -Math.PI / 2, health: PLAYER_HEALTH_MAX, armor: 0,
      speed: 0, car: null, weapon: 'fists', weapons: ['fists'],
      mag: { pistol: 12, shotgun: 6, smg: 30 },
      reserve: { pistol: 48, shotgun: 18, smg: 90 },
      outfit: 0, aimAngle: 0, fireTimer: 0, invuln: 0, running: false,
    };

    this.spawnTraffic();
    this.spawnPeds();
    this.spawnTaxiClient();
  }

  // ---- spawning ---------------------------------------------------------
  makeCar(typeId, x, y, angle) {
    const def = VEHICLES.find((v) => v.id === typeId) || VEHICLES[0];
    return {
      type: def.id, name: def.name, color: def.color, top: def.top,
      len: def.top, w: 30, accel: def.accel, max: def.max, turn: def.turn,
      x, y, angle, speed: 0, playerDriven: false, driver: true,
      lateral: 0, lateralTarget: 0, axis: 'h', dir: 1, line: 1600, pos: x,
      targetSpeed: 0, honkTimer: 0, blockedTimer: 0, overtakeTimer: 0, smoke: 0,
    };
  }

  spawnTraffic() {
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const line = this.rng.pick(ROAD_LINES);
      const axis = this.rng.chance(0.5) ? 'h' : 'v';
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const pos = this.rng.float(80, WORLD_SIZE - 80);
      const type = this.rng.pick(['sedan', 'sedan', 'compact', 'sport', 'van', 'taxi', 'pickup', 'muscle']);
      const car = this.makeCar(type, 0, 0, 0);
      car.axis = axis; car.dir = dir; car.line = line; car.pos = pos;
      car.lateral = laneFor(axis, dir); car.lateralTarget = car.lateral;
      car.targetSpeed = this.rng.float(140, 260);
      car.speed = car.targetSpeed * this.rng.float(0.5, 1);
      this.placeCarOnRoad(car);
      this.cars.push(car);
    }
    // A few parked cars on the roadside for the player to steal.
    for (let i = 0; i < 6; i++) {
      const line = this.rng.pick(ROAD_LINES);
      const axis = this.rng.chance(0.5) ? 'h' : 'v';
      const pos = this.rng.float(200, WORLD_SIZE - 200);
      const car = this.makeCar(this.rng.pick(['sedan', 'sport', 'compact', 'pickup']), 0, 0, 0);
      car.axis = axis; car.dir = 1; car.line = line; car.pos = pos;
      car.lateral = laneFor(axis, 1); car.lateralTarget = car.lateral;
      car.speed = 0; car.targetSpeed = 0; car.driver = false; car.parked = true;
      this.placeCarOnRoad(car);
      this.cars.push(car);
    }
  }

  placeCarOnRoad(car) {
    if (car.axis === 'h') {
      car.x = car.pos; car.y = car.line + car.lateral;
      car.angle = car.dir > 0 ? 0 : Math.PI;
    } else {
      car.x = car.line + car.lateral; car.y = car.pos;
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  spawnPeds() {
    const skins = ['#d98a5a', '#8a5a3a', '#e8b88a', '#5a3a2a', '#c98a6a'];
    const shirts = ['#c94a4a', '#4a7ac9', '#4ac94a', '#c9c94a', '#8a4ac9', '#e8e8e8', '#333a44'];
    for (let i = 0; i < PED_COUNT; i++) {
      const line = this.rng.pick(ROAD_LINES);
      const axis = this.rng.chance(0.5) ? 'h' : 'v';
      const pos = this.rng.float(80, WORLD_SIZE - 80);
      const side = this.rng.chance(0.5) ? 1 : -1;
      const x = axis === 'h' ? pos : line + side * (ROAD_WIDTH / 2 + 16);
      const y = axis === 'h' ? line + side * (ROAD_WIDTH / 2 + 16) : pos;
      this.peds.push({
        x, y, angle: this.rng.float(0, TAU), speed: this.rng.float(40, 70),
        skin: this.rng.pick(skins), shirt: this.rng.pick(shirts),
        state: 'walk', panic: 0, phoneTimer: 0, axis, dir: side, wait: 0,
      });
    }
  }

  spawnTaxiClient() {
    const line = this.rng.pick(ROAD_LINES);
    const pos = this.rng.float(300, WORLD_SIZE - 300);
    this.taxi.waiting = {
      x: line + ROAD_WIDTH / 2 + 16, y: pos, destX: 0, destY: 0, fare: 0,
    };
    const dl = this.rng.pick(ROAD_LINES);
    this.taxi.waiting.destX = dl; this.taxi.waiting.destY = this.rng.pick(ROAD_LINES);
    this.taxi.waiting.fare = 40 + Math.floor(this.rng.float(0, 50));
  }

  spawnEnemy(x, y, kind) {
    const boss = kind === 'enforcer';
    this.enemies.push({
      x: clamp(x, 40, WORLD_SIZE - 40), y: clamp(y, 40, WORLD_SIZE - 40),
      angle: 0, health: boss ? 220 : 80, kind,
      weapon: boss ? 'shotgun' : 'pistol', fireTimer: this.rng.float(0.5, 1.5),
      speed: boss ? 130 : 165, shirt: boss ? '#c9a227' : '#7a2f2f',
    });
  }

  spawnCopCar(x, y) {
    const car = this.makeCar('police', x, y, 0);
    car.playerDriven = false;
    car.police = true;
    this.cars.push(car);
    this.cops.push({ x, y, angle: 0, health: 100, car, onFoot: false, state: 'chase', fireTimer: 1 });
    return car;
  }

  spawnCopFoot(x, y) {
    this.cops.push({ x, y, angle: 0, health: 100, car: null, onFoot: true, state: 'chase', fireTimer: 1 });
  }

  // ---- helpers ----------------------------------------------------------
  addToast(text) {
    this.toasts.push({ text, timer: 4 });
    if (this.toasts.length > 4) this.toasts.shift();
  }
  banner(text) { this.message = { text, timer: 3 }; }
  unlock(id) {
    this.unlocked[id] = true;
    if (id === 'pistol' || id === 'shotgun' || id === 'smg') {
      if (!this.player.weapons.includes(id)) this.player.weapons.push(id);
      this.addToast(`Unlocked: ${WEAPONS[id].name}`);
    } else if (id === 'armor') {
      this.player.armor = 100;
      this.addToast('Unlocked: body armor fitted');
    } else if (id === 'finale') {
      this.addToast('Finale unlocked — finish it at Marina Pier');
    }
  }
  burst(x, y, color, n = 10, speed = 120) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.float(0, TAU);
      const s = this.rng.float(speed * 0.3, speed);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: this.rng.float(0.3, 0.8), color, size: this.rng.float(2, 5) });
    }
  }
  nearestCop(x, y, maxD) {
    let best = null, bestD = maxD;
    for (const c of this.cops) {
      const d = dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  anyPedNear(x, y, maxD) {
    for (const p of this.peds) if (dist(x, y, p.x, p.y) < maxD) return true;
    return false;
  }
  playerVisibleToCops() {
    // Cops see the player when close, or the heli is overhead and uncovered.
    if (this.heli.active && !underCover(this.city, this.player.x, this.player.y)) return true;
    for (const c of this.cops) {
      if (dist(c.x, c.y, this.player.x, this.player.y) < 520) return true;
    }
    return false;
  }

  // ---- main update ------------------------------------------------------
  update(dt, input) {
    if (this.gameOver || this.win) return;
    this.timeHours = (this.timeHours + (dt / DAY_LENGTH) * 24) % 24;
    this.updateWeather(dt);
    for (const t of this.toasts) t.timer -= dt;
    this.toasts = this.toasts.filter((t) => t.timer > 0);
    if (this.message) { this.message.timer -= dt; if (this.message.timer <= 0) this.message = null; }
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
    this.particles = this.particles.filter((p) => p.life > 0);

    this.updatePlayer(dt, input);
    this.updateTraffic(dt);
    this.updatePeds(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updatePolice(dt);
    this.updateHeli(dt);
    this.updateTaxi(dt);
    this.missions.update(dt, this);
    this.gangs.update(dt, this);
    this.wanted.update(dt, this.playerVisibleToCops(), this.player.x, this.player.y);
    this.checkPackages();
    this.updateCamera(dt);
    this.audio.siren(dt, this.wanted.stars > 0);
    this.audio.music(dt);
    const car = this.player.car;
    this.audio.engine(car ? Math.abs(car.speed) / car.max : 0, !!car);
    if (this.player.health <= 0) {
      this.gameOver = true;
      this.audio.engine(0, false);
    }
    if (this.missions.index >= 8 && !this.win) {
      this.win = true;
      this.banner('SOLMAR IS YOURS — story complete!');
    }
  }

  updateWeather(dt) {
    this.weather.timer -= dt;
    if (this.weather.timer <= 0) {
      const roll = this.rng.float(0, 1);
      if (roll < 0.55) this.weather.type = 'clear';
      else if (roll < 0.8) this.weather.type = 'rain';
      else this.weather.type = 'fog';
      this.weather.timer = this.rng.float(60, 150);
      this.weather.intensity = this.weather.type === 'clear' ? 0 : this.rng.float(0.4, 1);
      if (this.weather.type !== 'clear') this.addToast(this.weather.type === 'rain' ? 'Rain rolls in off the bay' : 'Fog drifts in from the marina');
    }
  }

  updateCamera(dt) {
    const p = this.player;
    const vw = 1280, vh = 720;
    const tx = clamp(p.x - vw / 2, 0, WORLD_SIZE - vw);
    const ty = clamp(p.y - vh / 2, 0, WORLD_SIZE - vh);
    this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 5);
    this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 5);
  }

  // ---- player -----------------------------------------------------------
  updatePlayer(dt, input) {
    const p = this.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.fireTimer > 0) p.fireTimer -= dt;

    // Aim follows the mouse in world space.
    const wx = this.camera.x + input.mouseX;
    const wy = this.camera.y + input.mouseY;
    p.aimAngle = angleTo(p.x, p.y, wx, wy);

    if (input.hit('q')) this.cycleWeapon();
    if (input.hit('r')) this.reload();
    if (input.hit('n')) this.minimapSize = (this.minimapSize + 1) % 3;
    if (input.hit('e')) this.tryEnterExitCar();
    if (input.hit('f')) this.tryInteract();

    if (p.car) this.driveCar(dt, input);
    else this.walkPlayer(dt, input);

    if (input.mouseDown || input.mouseClicked) this.tryFire();
    if (input.down(' ')) this.tryFire();
  }

  walkPlayer(dt, input) {
    const p = this.player;
    const a = input.axis();
    const run = input.down('Shift');
    const speed = run ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
    let mx = a.x, my = a.y;
    if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.speed = (mx !== 0 || my !== 0) ? speed : 0;
    p.running = run && p.speed > 0;
    if (p.speed > 0) p.angle = angleTo(0, 0, mx, my);
    const fixed = collideBuildings(this.city, p.x, p.y, 14);
    p.x = fixed.x; p.y = fixed.y;
    p.x = clamp(p.x, 20, WORLD_SIZE - 20);
    p.y = clamp(p.y, 20, WORLD_SIZE - 20);
    this.stats.distance += p.speed * dt;
  }

  driveCar(dt, input) {
    const p = this.player;
    const car = p.car;
    const grip = this.weather.type === 'rain' ? 0.75 : 1;
    const a = input.axis();
    // W/S accelerate and brake/reverse; A/D steer (inverted when reversing).
    if (a.y < 0) car.speed += car.accel * grip * dt;
    else if (a.y > 0) car.speed -= car.accel * 0.8 * dt;
    else car.speed -= car.speed * 1.4 * dt;
    car.speed = clamp(car.speed, -car.max * 0.45, car.max);
    const steer = a.x * (car.speed >= 0 ? 1 : -1);
    car.angle += steer * car.turn * clamp(Math.abs(car.speed) / 220, 0, 1) * dt * grip;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Building collision: stop and scrape, never pass through.
    const hit = buildingHit(this.city, nx, ny, 20);
    if (hit) {
      car.speed *= -0.25;
      this.burst(car.x, car.y, '#e8b90a', 6, 90);
      this.audio.noise(0.12, 0.25, 700);
    } else {
      car.x = nx; car.y = ny;
    }
    car.x = clamp(car.x, 20, WORLD_SIZE - 20);
    car.y = clamp(car.y, 20, WORLD_SIZE - 20);
    p.x = car.x; p.y = car.y;
    p.angle = car.angle;
    this.stats.distance += Math.abs(car.speed) * dt;
    // Running over a pedestrian is a witnessed crime.
    for (const ped of this.peds) {
      if (dist(car.x, car.y, ped.x, ped.y) < 34 && Math.abs(car.speed) > 120) {
        ped.state = 'flee'; ped.panic = 3;
        this.hurtPed(ped, 100, true);
      }
    }
    // Bumping other cars: push them aside, spark.
    for (const other of this.cars) {
      if (other === car) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < 46 && d > 0.01) {
        const push = (46 - d) * 0.5;
        const nx2 = (other.x - car.x) / d, ny2 = (other.y - car.y) / d;
        other.x += nx2 * push; other.y += ny2 * push;
        if (Math.abs(car.speed) > 200) {
          this.burst(other.x, other.y, '#e8b90a', 5, 80);
          car.speed *= 0.85;
        }
      }
    }
  }

  tryEnterExitCar() {
    const p = this.player;
    if (p.car) {
      const car = p.car;
      car.playerDriven = false;
      car.speed = 0;
      p.car = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
      return;
    }
    let best = null, bestD = 90;
    for (const car of this.cars) {
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return;
    if (best.driver) {
      // Steal it: the driver flees on foot, witnesses may report it.
      best.driver = false;
      this.peds.push({
        x: best.x + 30, y: best.y + 30, angle: 0, speed: 160,
        skin: '#d98a5a', shirt: '#4a7ac9', state: 'flee', panic: 4, phoneTimer: 0,
        axis: 'h', dir: 1, wait: 0,
      });
      this.stats.carsStolen++;
      const witnessed = this.anyPedNear(p.x, p.y, 420) || this.nearestCop(p.x, p.y, 600);
      this.wanted.commitCrime('steal', p.x, p.y, witnessed, !!this.nearestCop(p.x, p.y, 500), this);
      this.addToast(`Stole the ${best.name}`);
    }
    best.playerDriven = true;
    best.parked = false;
    p.car = best;
    p.x = best.x; p.y = best.y;
    this.audio.horn();
  }

  tryInteract() {
    const p = this.player;
    // Mission start point: Mara's diner.
    if (!this.missions.active && this.missions.currentDef()) {
      if (dist(p.x, p.y, 1050, 1740) < 130) { this.missions.start(this); return; }
    }
    if (this.missions.active) {
      const s = this.missions.stepDef();
      if (s && s.type === 'interact' && dist(p.x, p.y, s.x || 0, s.y || 0) < 120) {
        this.missions.onInteract(this);
        return;
      }
    }
    // Taxi client.
    if (this.taxi.waiting && !this.taxi.active && p.car && dist(p.x, p.y, this.taxi.waiting.x, this.taxi.waiting.y) < 110) {
      this.taxi.active = true;
      this.taxi.fare = this.taxi.waiting;
      this.taxi.timer = 120;
      this.addToast(`Fare: take them to the marker — $${this.taxi.fare.fare}`);
      return;
    }
    // Shops.
    const shop = nearestShop(this.city, p.x, p.y, 140);
    if (shop) {
      if (shop.kind === 'spray' && p.car) {
        this.resprayCar();
        return;
      }
      this.shopOpen = shop.kind;
      return;
    }
    // Mission interact step at a shop.
    if (this.missions.active) this.missions.onInteract(this);
  }

  resprayCar() {
    const p = this.player;
    if (this.money < SHOP_PRICES.respray) { this.addToast('Not enough cash for a respray'); return; }
    this.money -= SHOP_PRICES.respray;
    const colors = ['#4a7fb5', '#c23b2e', '#2e8b6a', '#e8b90a', '#6b4fa1', '#22242a'];
    p.car.color = colors[Math.floor(this.rng.float(0, colors.length))];
    this.wanted.clearEvidence('car');
    this.addToast('Respray done — the car is clean');
    this.audio.cash();
  }

  buyItem(id) {
    const p = this.player;
    const price = SHOP_PRICES[id];
    if (price === undefined) return;
    if (this.money < price) { this.addToast('Not enough cash'); return; }
    if (id === 'pistol' || id === 'shotgun' || id === 'smg') {
      if (p.weapons.includes(id)) { this.addToast('Already owned — buy ammo instead'); return; }
      p.weapons.push(id);
      this.money -= price;
      this.addToast(`Bought the ${WEAPONS[id].name}`);
    } else if (id === 'pistolAmmo') { this.player.reserve.pistol += 24; this.money -= price; }
    else if (id === 'shotgunAmmo') { this.player.reserve.shotgun += 12; this.money -= price; }
    else if (id === 'smgAmmo') { this.player.reserve.smg += 60; this.money -= price; }
    else if (id === 'armor') { p.armor = 100; this.money -= price; this.addToast('Body armor fitted'); }
    else if (id === 'meal') { p.health = Math.min(PLAYER_HEALTH_MAX, p.health + 50); this.money -= price; this.addToast('You feel better already'); }
    else if (id === 'outfit') {
      p.outfit = (p.outfit + 1) % 4;
      this.wanted.clearEvidence('outfit');
      this.wanted.clearEvidence('face');
      this.money -= price;
      this.addToast('New look — the description no longer fits');
    } else if (id === 'bribe') {
      if (this.wanted.stars === 0) { this.addToast('No heat to pay off'); return; }
      this.wanted.stars = 0; this.wanted.state = 'none'; this.wanted.clearAllEvidence();
      this.money -= price;
      this.addToast('The heat is gone. For now.');
    }
    this.audio.cash();
  }

  cycleWeapon() {
    const p = this.player;
    const i = p.weapons.indexOf(p.weapon);
    p.weapon = p.weapons[(i + 1) % p.weapons.length];
    this.addToast(WEAPONS[p.weapon].name);
  }
  reload() {
    const p = this.player;
    const w = WEAPONS[p.weapon];
    if (!w || w.ammo === Infinity) return;
    const need = w.ammo - p.mag[p.weapon];
    const take = Math.min(need, p.reserve[p.weapon]);
    if (take > 0) { p.mag[p.weapon] += take; p.reserve[p.weapon] -= take; }
  }

  tryFire() {
    const p = this.player;
    if (p.fireTimer > 0) return;
    const w = WEAPONS[p.weapon];
    p.fireTimer = w.rate;
    if (p.weapon === 'fists') {
      this.audio.punch();
      const tx = p.x + Math.cos(p.aimAngle) * 44;
      const ty = p.y + Math.sin(p.aimAngle) * 44;
      this.burst(tx, ty, '#e8e8e8', 4, 60);
      for (const e of this.enemies) {
        if (dist(tx, ty, e.x, e.y) < 40) this.hurtEnemy(e, w.damage, p.x, p.y);
      }
      for (const c of this.cops) {
        if (c.onFoot && dist(tx, ty, c.x, c.y) < 40) this.hurtCop(c, w.damage);
      }
      for (const ped of this.peds) {
        if (dist(tx, ty, ped.x, ped.y) < 40) this.hurtPed(ped, w.damage, false);
      }
      return;
    }
    if (p.mag[p.weapon] <= 0) {
      this.reload();
      if (p.mag[p.weapon] <= 0) { this.addToast('Out of ammo — visit Ironworks'); return; }
    }
    p.mag[p.weapon]--;
    this.stats.shotsFired++;
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = p.aimAngle + (this.rng.float(-1, 1)) * w.spread;
      const bx = p.x + Math.cos(a) * 26;
      const by = p.y + Math.sin(a) * 26;
      this.bullets.push({ x: bx, y: by, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: w.range / 900, damage: w.damage, friendly: true });
    }
    this.burst(p.x + Math.cos(p.aimAngle) * 30, p.y + Math.sin(p.aimAngle) * 30, '#ffd94a', 5, 140);
    this.audio.gunshot(p.weapon);
    // Gunfire is loud: nearby peds flee and call it in.
    const witnessed = this.anyPedNear(p.x, p.y, 500) || this.nearestCop(p.x, p.y, 600);
    const seenByCop = !!this.nearestCop(p.x, p.y, 500);
    this.wanted.commitCrime('gunshot', p.x, p.y, witnessed, seenByCop, this);
    for (const ped of this.peds) {
      if (dist(p.x, p.y, ped.x, ped.y) < 500) {
        ped.state = 'flee'; ped.panic = 4;
        if (ped.phoneTimer <= 0 && this.rng.chance(0.5)) ped.phoneTimer = 2;
      }
    }
    // Cameras at downtown intersections catch gunfire on tape.
    for (const l of this.city.lights) {
      if (dist(p.x, p.y, l.x, l.y) < 220) {
        this.wanted.evidence.cctv = true;
        this.wanted.cctvTimer = 90;
        break;
      }
    }
  }

  hurtPed(ped, dmg, runOver) {
    ped.health = (ped.health || 50) - dmg;
    ped.state = 'flee'; ped.panic = 4;
    if (ped.health <= 0) {
      this.burst(ped.x, ped.y, '#c23b2e', 12, 130);
      const witnessed = this.anyPedNear(ped.x, ped.y, 450) || this.nearestCop(ped.x, ped.y, 600);
      this.wanted.commitCrime('kill', ped.x, ped.y, witnessed, !!this.nearestCop(ped.x, ped.y, 500), this);
      this.peds.splice(this.peds.indexOf(ped), 1);
      this.stats.kills++;
      // Keep the streets populated.
      this.spawnPedsExtra(1);
    } else if (!runOver) {
      const witnessed = this.anyPedNear(ped.x, ped.y, 450);
      this.wanted.commitCrime('assault', ped.x, ped.y, witnessed, false, this);
    }
  }

  spawnPedsExtra(n) {
    for (let i = 0; i < n; i++) {
      const line = this.rng.pick(ROAD_LINES);
      const pos = this.rng.float(80, WORLD_SIZE - 80);
      this.peds.push({
        x: line + ROAD_WIDTH / 2 + 16, y: pos, angle: 0, speed: 55,
        skin: '#d98a5a', shirt: '#4a7ac9', state: 'walk', panic: 0, phoneTimer: 0,
        axis: 'h', dir: 1, wait: 0,
      });
    }
  }

  hurtEnemy(e, dmg, fromX, fromY) {
    e.health -= dmg;
    this.burst(e.x, e.y, '#c23b2e', 8, 120);
    if (e.health <= 0) {
      this.burst(e.x, e.y, '#c23b2e', 18, 180);
      this.enemies.splice(this.enemies.indexOf(e), 1);
      this.money += 25;
      this.stats.kills++;
      this.missions.onKill(this);
      this.gangs.onSquadMemberDown(this);
    }
  }

  hurtCop(c, dmg) {
    c.health -= dmg;
    this.burst(c.x, c.y, '#2f4a6a', 8, 120);
    if (c.health <= 0) {
      this.burst(c.x, c.y, '#2f4a6a', 16, 170);
      if (c.car) { const i = this.cars.indexOf(c.car); if (i >= 0) this.cars.splice(i, 1); }
      this.cops.splice(this.cops.indexOf(c), 1);
      this.stats.kills++;
      const witnessed = this.anyPedNear(c.x, c.y, 450) || this.nearestCop(c.x, c.y, 600);
      this.wanted.commitCrime('kill', c.x, c.y, witnessed, false, this);
    }
  }

  hurtPlayer(dmg) {
    const p = this.player;
    if (p.invuln > 0) return;
    p.invuln = 0.4;
    let rest = dmg;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, rest * 0.7);
      p.armor -= absorbed; rest -= absorbed;
    }
    p.health -= rest;
    this.burst(p.x, p.y, '#c23b2e', 6, 100);
  }

  // ---- traffic ----------------------------------------------------------
  updateTraffic(dt) {
    for (const car of this.cars) {
      if (car.playerDriven || car.police) continue;
      if (car.parked) continue;
      this.driveTrafficCar(car, dt);
    }
  }

  driveTrafficCar(car, dt) {
    // Find the light ahead, if any, and whether it is red for us.
    let wantSpeed = car.targetSpeed;
    const linePos = car.pos;
    let nearestLight = null, lightDist = Infinity;
    for (const l of this.city.lights) {
      if (car.axis === 'h' && Math.abs(l.y - car.line) < 1) {
        const d = (l.x - linePos) * car.dir;
        if (d > 0 && d < lightDist) { lightDist = d; nearestLight = l; }
      } else if (car.axis === 'v' && Math.abs(l.x - car.line) < 1) {
        const d = (l.y - linePos) * car.dir;
        if (d > 0 && d < lightDist) { lightDist = d; nearestLight = l; }
      }
    }
    if (nearestLight) {
      const green = lightState(nearestLight, this.timeHours * 3600 / 10) === (car.axis === 'h' ? 'h' : 'v');
      if (!green && lightDist < 130) {
        const stopDist = lightDist - (ROAD_WIDTH / 2 + 26);
        if (stopDist < car.speed * 0.6 + 12) wantSpeed = 0;
        else if (stopDist < 220) wantSpeed = Math.min(wantSpeed, 90);
      }
    }
    // Car-following: creep behind the car ahead, never reverse into it.
    let ahead = null, aheadGap = Infinity;
    for (const other of this.cars) {
      if (other === car || other.axis !== car.axis || other.dir !== car.dir || other.line !== car.line) continue;
      const gap = (other.pos - car.pos) * car.dir;
      if (gap > 0 && gap < aheadGap) { aheadGap = gap; ahead = other; }
    }
    const sameLane = ahead && Math.abs(ahead.lateral - car.lateral) < 20;
    if (sameLane) {
      if (aheadGap < 60) wantSpeed = 0;
      else if (aheadGap < 130) wantSpeed = Math.min(wantSpeed, Math.max(0, ahead.speed) * 0.9);
      // Overtake when stuck behind a slow car and the other lane is clear.
      if (aheadGap < 110 && ahead.speed < car.targetSpeed * 0.6 && car.overtakeTimer <= 0) {
        let clear = true;
        for (const other of this.cars) {
          if (other === car || other.axis !== car.axis || other.line !== car.line) continue;
          const gap = Math.abs(other.pos - car.pos);
          if (gap < 220 && Math.abs(other.lateral + car.lateral) < 20) { clear = false; break; }
        }
        if (clear) {
          car.lateralTarget = -car.lateral;
          car.overtakeTimer = 6;
        }
      }
      if (aheadGap > 160 && car.lateralTarget !== car.lateral) car.lateralTarget = car.lateral;
      if (aheadGap < 60) {
        car.blockedTimer += dt;
        if (car.blockedTimer > 3 && car.honkTimer <= 0) {
          this.audio.horn();
          car.honkTimer = 4;
          car.blockedTimer = 0;
        }
      } else car.blockedTimer = 0;
    }
    if (car.honkTimer > 0) car.honkTimer -= dt;
    if (car.overtakeTimer > 0) car.overtakeTimer -= dt;
    // Ease speed toward the target, never backwards.
    const accel = wantSpeed > car.speed ? 260 : 420;
    car.speed += clamp(wantSpeed - car.speed, -accel * dt, accel * dt);
    if (car.speed < 0) car.speed = 0;
    car.pos += car.speed * car.dir * dt;
    car.lateral += (car.lateralTarget - car.lateral) * Math.min(1, dt * 2.5);
    // Loop around the city edge onto the same road's other end.
    if (car.pos > WORLD_SIZE - 40) car.pos = 40;
    if (car.pos < 40) car.pos = WORLD_SIZE - 40;
    this.placeCarOnRoad(car);
  }

  // ---- pedestrians ------------------------------------------------------
  updatePeds(dt) {
    for (const ped of this.peds) {
      if (ped.phoneTimer > 0) {
        ped.phoneTimer -= dt;
        if (ped.phoneTimer <= 0) {
          this.wanted.commitCrime('gunshot', ped.x, ped.y, true, false, this);
          ped.phoneTimer = -1;
        }
        continue;
      }
      if (ped.state === 'flee') {
        ped.panic -= dt;
        const a = angleTo(this.player.x, this.player.y, ped.x, ped.y);
        ped.x += Math.cos(a) * 190 * dt;
        ped.y += Math.sin(a) * 190 * dt;
        ped.angle = a;
        const fixed = collideBuildings(this.city, ped.x, ped.y, 12);
        ped.x = fixed.x; ped.y = fixed.y;
        if (ped.panic <= 0) ped.state = 'walk';
        continue;
      }
      ped.wait -= dt;
      if (ped.wait <= 0) {
        ped.wait = this.rng.float(2, 6);
        ped.dir *= this.rng.chance(0.3) ? -1 : 1;
      }
      const step = ped.speed * ped.dir * dt;
      if (ped.axis === 'h') ped.x += step; else ped.y += step;
      if (ped.x < 60) { ped.x = 60; ped.dir = 1; }
      if (ped.x > WORLD_SIZE - 60) { ped.x = WORLD_SIZE - 60; ped.dir = -1; }
      if (ped.y < 60) { ped.y = 60; ped.dir = 1; }
      if (ped.y > WORLD_SIZE - 60) { ped.y = WORLD_SIZE - 60; ped.dir = -1; }
      ped.angle = ped.axis === 'h' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const fixed = collideBuildings(this.city, ped.x, ped.y, 12);
      ped.x = fixed.x; ped.y = fixed.y;
    }
  }

  // ---- bullets -----------------------------------------------------------
  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && buildingHit(this.city, b.x, b.y, 2)) {
        this.burst(b.x, b.y, '#c9c9c9', 4, 70);
        dead = true;
      }
      if (!dead && b.friendly) {
        for (const e of this.enemies) {
          if (dist(b.x, b.y, e.x, e.y) < 20) { this.hurtEnemy(e, b.damage, b.x - b.vx * 0.1, b.y - b.vy * 0.1); dead = true; break; }
        }
        if (!dead) for (const c of this.cops) {
          if (dist(b.x, b.y, c.x, c.y) < (c.onFoot ? 20 : 30)) {
            if (c.onFoot) this.hurtCop(c, b.damage);
            else { this.burst(b.x, b.y, '#e8b90a', 4, 80); }
            dead = true; break;
          }
        }
        if (!dead) for (const ped of this.peds) {
          if (dist(b.x, b.y, ped.x, ped.y) < 16) { this.hurtPed(ped, b.damage, false); dead = true; break; }
        }
      } else if (!dead && !b.friendly) {
        if (dist(b.x, b.y, this.player.x, this.player.y) < 18) {
          this.hurtPlayer(b.damage);
          dead = true;
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  // ---- gang enemies -----------------------------------------------------
  updateEnemies(dt) {
    const p = this.player;
    for (const e of [...this.enemies]) {
      const d = dist(e.x, e.y, p.x, p.y);
      const a = angleTo(e.x, e.y, p.x, p.y);
      e.angle = a;
      if (d > 60) {
        e.x += Math.cos(a) * e.speed * dt;
        e.y += Math.sin(a) * e.speed * dt;
        const fixed = collideBuildings(this.city, e.x, e.y, 14);
        e.x = fixed.x; e.y = fixed.y;
      }
      e.fireTimer -= dt;
      if (d < 430 && d > 40 && e.fireTimer <= 0) {
        e.fireTimer = e.kind === 'enforcer' ? 1.1 : 1.6;
        const spread = this.rng.float(-0.12, 0.12);
        const pellets = e.weapon === 'shotgun' ? 4 : 1;
        for (let i = 0; i < pellets; i++) {
          const aa = a + spread + (i - pellets / 2) * 0.08;
          this.bullets.push({ x: e.x + Math.cos(aa) * 24, y: e.y + Math.sin(aa) * 24, vx: Math.cos(aa) * 700, vy: Math.sin(aa) * 700, life: 0.7, damage: 9, friendly: false });
        }
        this.audio.gunshot(e.weapon);
        this.burst(e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, '#ffd94a', 4, 120);
      }
    }
  }

  // ---- police -----------------------------------------------------------
  updatePolice(dt) {
    const p = this.player;
    const stars = this.wanted.stars;
    const state = this.wanted.state;
    if (stars === 0) {
      // Stand down: cops drive off and despawn.
      for (let i = this.cops.length - 1; i >= 0; i--) {
        const c = this.cops[i];
        if (c.car) { const j = this.cars.indexOf(c.car); if (j >= 0) this.cars.splice(j, 1); }
        this.cops.splice(i, 1);
      }
      this.roadblocks = [];
      return;
    }
    const wantCars = Math.min(3, Math.ceil(stars / 2));
    const wantFoot = Math.min(4, stars);
    const carsNow = this.cops.filter((c) => !c.onFoot).length;
    const footNow = this.cops.filter((c) => c.onFoot).length;
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0 && (carsNow < wantCars || footNow < wantFoot)) {
      this.spawnCooldown = 2.5;
      const a = this.rng.float(0, TAU);
      const sx = clamp(p.x + Math.cos(a) * 700, 60, WORLD_SIZE - 60);
      const sy = clamp(p.y + Math.sin(a) * 700, 60, WORLD_SIZE - 60);
      const rp = nearestRoadPoint(sx, sy);
      if (carsNow < wantCars) this.spawnCopCar(rp.x, rp.y);
      else this.spawnCopFoot(sx, sy);
    }
    // Roadblocks at 4+ stars, ahead of the player on their road.
    if (stars >= WANTED.roadblockStars && this.roadblocks.length === 0) {
      const rp = nearestRoadPoint(p.x + 500, p.y);
      this.roadblocks.push({ x: rp.x, y: rp.y, timer: 40 });
    }
    for (const rb of this.roadblocks) rb.timer -= dt;
    this.roadblocks = this.roadblocks.filter((rb) => rb.timer > 0);

    for (const c of [...this.cops]) {
      const d = dist(c.x, c.y, p.x, p.y);
      if (c.onFoot) {
        if (state === 'hollow') {
          // Drive to the scene, no description: head to last known spot.
          const a = angleTo(c.x, c.y, this.wanted.lastSeenX, this.wanted.lastSeenY);
          c.angle = a;
          c.x += Math.cos(a) * 150 * dt;
          c.y += Math.sin(a) * 150 * dt;
        } else if (state === 'flashing') {
          const a = angleTo(c.x, c.y, this.wanted.lastSeenX, this.wanted.lastSeenY);
          c.angle = a;
          if (dist(c.x, c.y, this.wanted.lastSeenX, this.wanted.lastSeenY) > 40) {
            c.x += Math.cos(a) * 150 * dt;
            c.y += Math.sin(a) * 150 * dt;
          }
        } else {
          const a = angleTo(c.x, c.y, p.x, p.y);
          c.angle = a;
          if (d > 46) {
            c.x += Math.cos(a) * 175 * dt;
            c.y += Math.sin(a) * 175 * dt;
          }
          c.fireTimer -= dt;
          if (d < 380 && c.fireTimer <= 0) {
            c.fireTimer = 1.8;
            this.bullets.push({ x: c.x + Math.cos(a) * 22, y: c.y + Math.sin(a) * 22, vx: Math.cos(a) * 680, vy: Math.sin(a) * 680, life: 0.7, damage: 8, friendly: false });
            this.audio.gunshot('pistol');
          }
          if (d < 50) this.hurtPlayer(8 * dt * 3);
        }
        const fixed = collideBuildings(this.city, c.x, c.y, 13);
        c.x = fixed.x; c.y = fixed.y;
      } else {
        // Cop car: steer toward the player, but hold off instead of ramming
        // once close, and keep separation from other cop cars.
        const car = c.car;
        car.x = c.x; car.y = c.y;
        const target = state === 'solid' || state === 'red' ? { x: p.x, y: p.y } : { x: this.wanted.lastSeenX, y: this.wanted.lastSeenY };
        const ta = angleTo(car.x, car.y, target.x, target.y);
        const td = dist(car.x, car.y, target.x, target.y);
        let wantSpeed = 620;
        if (td < 130) wantSpeed = 200; // hold-off: don't pile into the player
        if (td < 60) wantSpeed = 0;
        car.angle = turnToward(car.angle, ta, 2.4 * dt);
        car.speed += clamp(wantSpeed - car.speed, -500 * dt, 420 * dt);
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        // Separation between cop cars so they never stack into one blob.
        for (const o of this.cops) {
          if (o === c || !o.car) continue;
          const od = dist(car.x, car.y, o.car.x, o.car.y);
          if (od < 90 && od > 0.01) {
            const push = (90 - od) * 0.5;
            const px = (car.x - o.car.x) / od, py = (car.y - o.car.y) / od;
            car.x += px * push; car.y += py * push;
          }
        }
        const hit = buildingHit(this.city, car.x, car.y, 20);
        if (hit) { car.speed *= -0.3; car.angle += 0.4; }
        c.x = car.x; c.y = car.y; c.angle = car.angle;
        if (td < 320 && state === 'solid') this.wanted.spotted(p.x, p.y);
      }
      // A cop that gets eyes on the player upgrades the chase.
      if (d < 520 && state !== 'solid') this.wanted.spotted(p.x, p.y);
    }
  }

  updateHeli(dt) {
    const p = this.player;
    const want = this.wanted.stars >= WANTED.heliStars;
    if (!want) {
      this.heli.active = false;
      this.heli.coverTimer = 0;
      return;
    }
    this.heli.active = true;
    const covered = underCover(this.city, p.x, p.y);
    if (covered) {
      this.heli.coverTimer += dt;
      if (this.heli.coverTimer > 5) {
        // Shook the heli: it drifts off and the search cools.
        this.heli.active = false;
        this.heli.coverTimer = 0;
        this.wanted.state = this.wanted.state === 'solid' ? 'flashing' : this.wanted.state;
        this.wanted.unseenTimer = WANTED.loseSightTime;
        this.addToast('Lost the helicopter under cover');
        return;
      }
    } else this.heli.coverTimer = 0;
    // Hover above and slightly behind the player, circling slowly.
    const t = this.timeHours * 10;
    const tx = p.x + Math.cos(t * 0.3) * 90;
    const ty = p.y - 160 + Math.sin(t * 0.3) * 60;
    this.heli.x += (tx - this.heli.x) * Math.min(1, dt * 1.5);
    this.heli.y += (ty - this.heli.y) * Math.min(1, dt * 1.5);
    this.heli.angle = angleTo(this.heli.x, this.heli.y, p.x, p.y);
  }

  // ---- taxi -------------------------------------------------------------
  updateTaxi(dt) {
    if (this.taxi.active && this.taxi.fare) {
      this.taxi.timer -= dt;
      const f = this.taxi.fare;
      if (dist(this.player.x, this.player.y, f.destX, f.destY) < 110) {
        this.money += f.fare;
        this.stats.fares++;
        this.addToast(`Fare complete — $${f.fare}`);
        this.audio.cash();
        this.taxi.active = false;
        this.taxi.fare = null;
        this.spawnTaxiClient();
      } else if (this.taxi.timer <= 0) {
        this.addToast('Fare cancelled — too slow');
        this.taxi.active = false;
        this.taxi.fare = null;
        this.spawnTaxiClient();
      }
    }
  }

  checkPackages() {
    const p = this.player;
    for (const pkg of this.city.packages) {
      if (!pkg.found && dist(p.x, p.y, pkg.x, pkg.y) < 40) {
        pkg.found = true;
        this.packagesFound++;
        this.money += 100;
        this.addToast(`Hidden package ${this.packagesFound}/12 — +$100`);
        this.audio.pickup();
        this.burst(pkg.x, pkg.y, '#ffd94a', 12, 130);
      }
    }
  }
}
