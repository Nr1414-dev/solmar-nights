// SOLMAR NIGHTS — missions.js
// The eight-job story arc: Dana Reyes runs errands for fixer Mara Solis
// against the Salt Kings, ending at Marina Pier. Each mission is a list of
// steps; this module tracks progress, moves the objective marker, pays out
// rewards and unlocks vehicles and weapons. Steps are plain data in
// config.js (MISSIONS); the step semantics live here.

import { MISSIONS } from './config.js';
import { dist } from './physics.js';

export function createMissionState() {
  return {
    active: false,
    index: 0, // next mission to start (0-based)
    def: null,
    step: 0,
    progress: 0, // kills / fares / waves counted for the current step
    marker: null, // {x, y, label} or null
    timer: 0,
    completedCount: 0,
    failed: false,
  };
}

export function currentStep(m) {
  return m.def ? m.def.steps[m.step] : null;
}

export function objectiveText(m) {
  if (!m.active || !m.def) return 'Free roam — press F near the gold M to start a job.';
  const s = currentStep(m);
  if (!s) return m.def.title;
  let label = s.label;
  if (s.type === 'kill') label += ` (${m.progress}/${s.count})`;
  if (s.type === 'fare') label += ` (${m.progress}/${s.count})`;
  if (s.type === 'survive') label += ` (${m.progress}/${s.waves} waves)`;
  return `${m.def.title}: ${label}`;
}

export function startMission(world, index) {
  const m = world.mission;
  const def = MISSIONS[index];
  if (!def) return false;
  m.active = true;
  m.def = def;
  m.step = 0;
  m.progress = 0;
  m.failed = false;
  m.timer = 0;
  world.message(`JOB ${def.id}: ${def.title} — ${def.text}`, '#e8b81a');
  world.audio.blip(880);
  refreshMarker(world);
  // Mission-specific setup.
  if (def.id === 4) spawnSportTarget(world);
  if (def.id === 5) spawnDeliveryVan(world);
  if (def.id === 6) spawnConvoy(world);
  if (def.id === 7) {
    world.gangs.wave = 0;
    world.gangs.spawnTimer = 9999;
    startSurvivalWave(world);
  }
  return true;
}

function refreshMarker(world) {
  const m = world.mission;
  const s = currentStep(m);
  if (!s) { m.marker = null; return; }
  if (s.type === 'goto' || s.type === 'pickup' || s.type === 'deliver') {
    m.marker = { x: s.x, y: s.y, label: s.label };
  } else if (s.type === 'steal') {
    const car = world.cars.find((c) => c.kind === s.kind && c.missionTarget);
    m.marker = car ? { x: car.x, y: car.y, label: s.label } : null;
  } else {
    m.marker = null;
  }
}

function spawnSportTarget(world) {
  const car = world.spawnCar('sport', 3360, 2640, Math.PI, 'parked');
  car.missionTarget = true;
  car.color = '#e8b81a';
}

function spawnDeliveryVan(world) {
  const p = world.player;
  const car = world.spawnCar('delivery', p.x + 120, p.y, 0, 'parked');
  car.missionTarget = true;
  car.color = '#e8e8e8';
  world.message('The delivery van is parked nearby — get in and drive!', '#e8b81a');
}

function spawnConvoy(world) {
  for (let i = 0; i < 4; i++) {
    const g = { x: 3120, y: 720 + i * 90, hp: 80, angle: 0, speed: 120, isEnforcer: false, weapon: 'pistol', shootTimer: 1, color: '#7a1a8c', radius: 15 };
    world.gangs.active.push(g);
    const car = world.spawnCar('van', 3120, 720 + i * 90, 0, 'parked');
    car.gangCar = true;
  }
  world.message('Salt Kings convoy spotted on the east road!', '#e8b81a');
}

function startSurvivalWave(world) {
  // Waves are driven by gangs.js; kick the first one off via the world hook.
  world.startGangWave();
}

export function completeStep(world) {
  const m = world.mission;
  m.step += 1;
  m.progress = 0;
  if (m.step >= m.def.steps.length) {
    completeMission(world);
  } else {
    refreshMarker(world);
    world.audio.cash();
  }
}

export function completeMission(world) {
  const m = world.mission;
  const def = m.def;
  world.player.money += def.reward;
  world.stats.reputation += 2;
  if (def.unlock) {
    if (def.unlock === 'pistol' || def.unlock === 'shotgun') {
      world.player.weapons[def.unlock] = true;
      world.player.ammo[def.unlock] = 24;
      world.message(`Unlocked: ${def.unlock}!`, '#7ae88c');
    } else {
      world.player.unlockedCars.push(def.unlock);
      world.message(`Unlocked vehicle: ${def.unlock}!`, '#7ae88c');
    }
  }
  world.message(`JOB COMPLETE: ${def.title}  +$${def.reward}`, '#7ae88c');
  world.audio.cash();
  m.completedCount += 1;
  m.index = Math.min(m.index + 1, MISSIONS.length);
  m.active = false;
  m.def = null;
  m.marker = null;
}

export function failMission(world, reason) {
  const m = world.mission;
  if (!m.active) return;
  world.message(`JOB FAILED: ${reason} — talk to Mara to retry.`, '#e85a5a');
  m.active = false;
  m.def = null;
  m.marker = null;
  m.progress = 0;
}

// Called every frame while playing. Checks step completion and drives
// mission-only spawns (hit squads during delivery, escape checks, ...).
export function updateMissions(world, dt) {
  const m = world.mission;
  if (!m.active || !m.def) return;
  const s = currentStep(m);
  if (!s) return;
  const p = world.player;

  if (s.type === 'goto' || s.type === 'pickup' || s.type === 'deliver') {
    const d = dist(p.x, p.y, s.x, s.y);
    const inCar = !!p.inCar;
    const ok = s.type === 'deliver' ? (inCar && d < 130) : d < 90;
    if (ok) {
      if (s.type === 'pickup') {
        world.player.money += 50;
        world.message('Package secured.', '#7ae88c');
      }
      completeStep(world);
    }
  } else if (s.type === 'steal') {
    if (p.inCar && p.inCar.kind === 'sport' && p.inCar.missionTarget) {
      completeStep(world);
      world.message('Nice wheels. Now lose the cops!', '#e8b81a');
    }
  } else if (s.type === 'escape') {
    if (world.wanted.stars === 0) completeStep(world);
  } else if (s.type === 'kill') {
    if (m.progress >= s.count) completeStep(world);
  } else if (s.type === 'fare') {
    if (m.progress >= s.count) completeStep(world);
  } else if (s.type === 'survive') {
    if (m.progress >= s.waves) completeStep(world);
    else if (!world.gangs.waveInProgress && world.gangs.wave > 0 && m.progress < s.waves) {
      // Between waves: short breather, then the next wave.
      m.timer += dt;
      if (m.timer > 6) {
        m.timer = 0;
        world.startGangWave();
      }
    }
  }
  refreshMarker(world);
}

// The mission giver marker: Mara waits at Mercado until job 1 starts, then
// at the diner between jobs.
export function giverPosition(world) {
  return world.mission.index === 0
    ? { x: 2640, y: 720 }
    : { x: 720, y: 2640 };
}
