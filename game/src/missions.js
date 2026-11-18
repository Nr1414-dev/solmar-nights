// SOLMAR NIGHTS — missions.js
// Eight story jobs for fixer Mara Solis, closing the arc against the Salt
// Kings at Marina Pier. Each mission is a small state machine of objectives:
// go somewhere, talk, collect, chase, fight, deliver, escape.

import { MISSION_PAY } from './config.js';

export const MISSIONS = [
  {
    id: 'm1', title: 'First Errand', giver: 'Mara Solis',
    brief: 'Mara needs a package picked up from the pier and brought to the diner. Easy money. Don\'t make it complicated.',
    steps: [
      { type: 'goto', label: 'Pick up the package at Marina Pier', x: 3520, y: 3260, radius: 90 },
      { type: 'goto', label: 'Deliver it to Sol Diner', x: 1050, y: 1740, radius: 90 },
    ],
    unlock: 'pistol',
  },
  {
    id: 'm2', title: 'Taxi for Trouble', giver: 'Mara Solis',
    brief: 'A client of Mara\'s needs a ride across town, fast, and the Salt Kings are watching the bridges. Grab a taxi and don\'t stop for red lights.',
    steps: [
      { type: 'vehicle', label: 'Get a taxi (steal one or find one)', vehicle: 'taxi' },
      { type: 'goto', label: 'Pick up the client at Old Town', x: 960, y: 960, radius: 100 },
      { type: 'goto', label: 'Drop the client at the Marina', x: 3200, y: 3200, radius: 100 },
    ],
    unlock: null,
  },
  {
    id: 'm3', title: 'Kings in the Market', giver: 'Mara Solis',
    brief: 'Salt Kings runners are shaking down the Mercado stalls. Show them Solmar isn\'t theirs. Bring a gun.',
    steps: [
      { type: 'goto', label: 'Reach the Mercado', x: 960, y: 1600, radius: 120 },
      { type: 'kill', label: 'Clear the Salt Kings runners', count: 4, x: 960, y: 1600 },
      { type: 'goto', label: 'Report back to Mara\'s diner', x: 1050, y: 1740, radius: 90 },
    ],
    unlock: 'shotgun',
  },
  {
    id: 'm4', title: 'Hot Wheels', giver: 'Mara Solis',
    brief: 'A Vortex GT is parked downtown, owner "away". Take it, lose the cops if they notice, and bring it to the spray shop for a new identity.',
    steps: [
      { type: 'vehicle', label: 'Steal the Vortex GT downtown', vehicle: 'sport', x: 1600, y: 1600 },
      { type: 'goto', label: 'Get it to Chroma Spray', x: 2330, y: 1500, radius: 100 },
      { type: 'interact', label: 'Respray the car (press F at the shop)', shop: 'spray' },
    ],
    unlock: 'smg',
  },
  {
    id: 'm5', title: 'The Informant', giver: 'Mara Solis',
    brief: 'An informant at the beach has the Kings\' ledger. Meet him at the pier cafe, then get the ledger to Mara before the Kings\' hit squad arrives.',
    steps: [
      { type: 'goto', label: 'Meet the informant at Pier Cafe', x: 3200, y: 3200, radius: 90 },
      { type: 'collect', label: 'Take the ledger', x: 3200, y: 3200, radius: 70 },
      { type: 'escape', label: 'Lose the hit squad, then reach the diner', x: 1050, y: 1740, radius: 100 },
    ],
    unlock: null,
  },
  {
    id: 'm6', title: 'Warehouse Lights', giver: 'Mara Solis',
    brief: 'The Kings stash their product in the old warehouse by the marina. Burn it — quietly if you can, loudly if you must.',
    steps: [
      { type: 'goto', label: 'Reach the marina warehouse', x: 3200, y: 2560, radius: 120 },
      { type: 'kill', label: 'Clear the warehouse guards', count: 5, x: 3200, y: 2560 },
      { type: 'interact', label: 'Torch the stash (press F)', x: 3200, y: 2560, radius: 80 },
    ],
    unlock: 'armor',
  },
  {
    id: 'm7', title: 'The Last Delivery', giver: 'Mara Solis',
    brief: 'One last run: a delivery van full of "paperwork" has to cross town in five minutes while every King in Solmar hunts it. Drive like your life depends on it.',
    steps: [
      { type: 'vehicle', label: 'Take the delivery van', vehicle: 'van', x: 960, y: 960 },
      { type: 'goto', label: 'Deliver to the Marina, fast', x: 3200, y: 3200, radius: 110, timed: 300 },
    ],
    unlock: null,
  },
  {
    id: 'm8', title: 'Salt in the Wound', giver: 'Mara Solis',
    brief: 'It ends tonight. The Salt Kings\' boss, Rook, is at Marina Pier with his enforcers. Take the pier back and finish this.',
    steps: [
      { type: 'goto', label: 'Reach Marina Pier', x: 3520, y: 3260, radius: 120 },
      { type: 'kill', label: 'Defeat Rook and his enforcers', count: 6, x: 3520, y: 3260, boss: true },
      { type: 'goto', label: 'Meet Mara at the pier', x: 3520, y: 3260, radius: 80 },
    ],
    unlock: 'finale',
  },
];

export class MissionManager {
  constructor() {
    this.index = 0;          // next mission to start
    this.active = null;      // { mission, step, kills, timer, ... }
    this.completed = [];
    this.available = true;
  }
  currentDef() { return MISSIONS[this.index] || null; }
  get pay() { return MISSION_PAY[this.index] || 500; }

  start(world) {
    const def = this.currentDef();
    if (!def || this.active) return false;
    this.active = { mission: def, step: 0, kills: 0, timer: 0, collected: false, done: false };
    world.addToast(`New job: ${def.title} — ${def.giver}`);
    world.audio.phone();
    return true;
  }
  stepDef() {
    if (!this.active) return null;
    return this.active.mission.steps[this.active.step];
  }
  objectiveText() {
    if (!this.active) {
      const def = this.currentDef();
      return def ? `Job available: ${def.title} — press F near Mara's diner to start` : 'Story complete — Solmar is yours.';
    }
    const s = this.stepDef();
    if (!s) return '';
    if (s.type === 'kill') return `${s.label} (${this.active.kills}/${s.count})`;
    return s.label;
  }
  // Called by the world when the player does something a step cares about.
  onKill(world) {
    if (!this.active) return;
    const s = this.stepDef();
    if (s && s.type === 'kill') {
      this.active.kills++;
      if (this.active.kills >= s.count) this.advance(world);
    }
  }
  onCollect(world) {
    if (!this.active) return;
    const s = this.stepDef();
    if (s && s.type === 'collect') this.advance(world);
  }
  onInteract(world) {
    if (!this.active) return;
    const s = this.stepDef();
    if (s && s.type === 'interact') this.advance(world);
  }
  advance(world) {
    this.active.step++;
    this.active.kills = 0;
    if (this.active.step >= this.active.mission.steps.length) {
      this.complete(world);
    } else {
      world.addToast(`Objective updated: ${this.objectiveText()}`);
    }
  }
  complete(world) {
    const def = this.active.mission;
    const pay = MISSION_PAY[this.index] || 500;
    world.money += pay;
    world.rep += 10;
    this.completed.push(def.id);
    world.stats.missionsDone++;
    if (def.unlock) world.unlock(def.unlock);
    world.addToast(`Job complete: ${def.title} — $${pay}`);
    world.audio.cash();
    this.index++;
    this.active = null;
  }
  update(dt, world) {
    if (!this.active) return;
    const s = this.stepDef();
    if (!s) return;
    this.active.timer += dt;
    if (s.type === 'goto' || s.type === 'escape' || s.type === 'collect') {
      const p = world.player;
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < s.radius) {
        if (s.type === 'escape' && world.wanted.stars > 0) return; // must lose them first
        this.advance(world);
      }
    }
    if (s.type === 'vehicle') {
      const car = world.player.car;
      if (car && (!s.vehicle || car.type === s.vehicle)) this.advance(world);
    }
    if (s.timed) {
      const left = s.timed - this.active.timer;
      if (left <= 0) {
        world.addToast('Too slow — the job fell through. Talk to Mara to retry.');
        this.active = null;
      }
    }
  }
}
