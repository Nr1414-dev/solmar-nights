// SOLMAR NIGHTS — wanted.js
// The six-star wanted system. Four states, five independent evidence flags,
// and one hard rule: a crime only counts when it is witnessed or reported.
//
// States:
//   hollow   — reported, but the police do not know who you are; units drive
//              to the scene with no description of you.
//   solid    — a cop has seen you directly; active chase.
//   flashing — line of sight broke; police search your last known position.
//   red      — you escaped, but the area stays "hot" and the police remember
//              your description; walk back in looking the same and the chase
//              starts again.
//
// Evidence (each cleared its own way):
//   CCTV   — seen on camera; wait it out (tape expires) or stay out of sight.
//   outfit — your clothes are on the description; change clothes.
//   face   — seen up close; wear a different look / lay low until it fades.
//   car    — your car is flagged; respray it or ditch it.
//   weapon — seen holding a weapon; holster / ditch the weapon.

import { WANTED } from './config.js';

export const EVIDENCE_LABELS = [
  { id: 'cctv', label: 'CCTV' },
  { id: 'outfit', label: 'OUTFIT' },
  { id: 'face', label: 'FACE' },
  { id: 'car', label: 'CAR' },
  { id: 'weapon', label: 'WEAPON' },
];

export class Wanted {
  constructor() {
    this.stars = 0;
    this.state = 'none'; // none | hollow | solid | flashing | red
    this.evidence = { cctv: false, outfit: false, face: false, car: false, weapon: false };
    this.unseenTimer = 0;
    this.searchTimer = 0;
    this.hotTimer = 0;
    this.hotX = 0; this.hotY = 0;
    this.lastSeenX = 0; this.lastSeenY = 0;
    this.cctvTimer = 0;
    this.faceTimer = 0;
    this.reportQueue = []; // {x, y, timer, stars} — witnesses phoning it in
  }

  // A crime happened. If nobody can see it, nothing happens.
  commitCrime(kind, x, y, witnessed, seenByCop, world) {
    const base = { gunshot: 2, kill: 2, steal: 1, assault: 1, speeding: 0 }[kind] || 1;
    if (seenByCop) {
      this.addStars(base, 'solid', x, y);
      if (kind === 'gunshot') this.evidence.weapon = true;
      if (kind === 'steal') this.evidence.car = true;
      return;
    }
    if (!witnessed) return; // nobody saw it: no wanted level, no report
    if (kind === 'gunshot') this.evidence.weapon = true;
    if (kind === 'steal') { this.evidence.car = true; this.evidence.face = true; this.faceTimer = 45; }
    if (kind === 'kill' || kind === 'assault') { this.evidence.face = true; this.faceTimer = 60; }
    // Witnesses phone the police; the report lands a few seconds later.
    this.reportQueue.push({ x, y, timer: WANTED.reportDelay, stars: base });
    if (world) world.addToast('Someone is calling the police…');
  }

  addStars(n, state, x, y) {
    const before = this.stars;
    this.stars = Math.min(WANTED.maxStars, this.stars + n);
    if (this.stars > 0 && state) {
      if (this.state === 'none' || this.state === 'red') this.state = state;
      else if (state === 'solid') this.state = 'solid';
    }
    if (x !== undefined) { this.lastSeenX = x; this.lastSeenY = y; }
    return this.stars > before;
  }

  // A cop (or the heli) has direct line of sight on the player.
  spotted(x, y) {
    if (this.stars === 0) return;
    this.state = 'solid';
    this.unseenTimer = 0;
    this.lastSeenX = x; this.lastSeenY = y;
    if (this.evidence.outfit) this.evidence.outfit = this.evidence.outfit; // description confirmed
  }

  clearEvidence(id) {
    this.evidence[id] = false;
    if (id === 'cctv') this.cctvTimer = 0;
    if (id === 'face') this.faceTimer = 0;
  }

  clearAllEvidence() {
    for (const k of Object.keys(this.evidence)) this.evidence[k] = false;
    this.cctvTimer = 0; this.faceTimer = 0;
  }

  update(dt, playerVisible, playerX, playerY) {
    // Witness reports land.
    for (let i = this.reportQueue.length - 1; i >= 0; i--) {
      const r = this.reportQueue[i];
      r.timer -= dt;
      if (r.timer <= 0) {
        this.reportQueue.splice(i, 1);
        if (this.stars === 0) {
          this.stars = Math.min(WANTED.maxStars, r.stars);
          this.state = 'hollow';
          this.lastSeenX = r.x; this.lastSeenY = r.y;
        } else {
          this.stars = Math.min(WANTED.maxStars, this.stars + r.stars);
        }
      }
    }
    if (this.stars === 0) { this.state = 'none'; return; }

    // CCTV tape expires on its own if the player stays out of camera range.
    if (this.evidence.cctv) {
      this.cctvTimer -= dt;
      if (this.cctvTimer <= 0) this.evidence.cctv = false;
    }
    if (this.evidence.face) {
      this.faceTimer -= dt;
      if (this.faceTimer <= 0) this.evidence.face = false;
    }

    if (this.state === 'solid') {
      if (playerVisible) {
        this.unseenTimer = 0;
        this.lastSeenX = playerX; this.lastSeenY = playerY;
      } else {
        this.unseenTimer += dt;
        if (this.unseenTimer >= WANTED.loseSightTime) {
          this.state = 'flashing';
          this.searchTimer = WANTED.searchTime;
        }
      }
    } else if (this.state === 'flashing') {
      this.searchTimer -= dt;
      if (playerVisible) { this.state = 'solid'; this.unseenTimer = 0; }
      else if (this.searchTimer <= 0) {
        // Escaped the search: area goes hot, police remember the description.
        this.state = 'red';
        this.hotTimer = WANTED.hotTime;
        this.hotX = this.lastSeenX; this.hotY = this.lastSeenY;
        this.stars = Math.max(1, this.stars - 1);
      }
    } else if (this.state === 'red') {
      this.hotTimer -= dt;
      const inHot = Math.hypot(playerX - this.hotX, playerY - this.hotY) < 700;
      const described = this.evidence.outfit || this.evidence.face || this.evidence.car;
      if (inHot && described && playerVisible) {
        this.state = 'solid'; // recognised: chase starts again
        this.unseenTimer = 0;
      } else if (this.hotTimer <= 0) {
        this.stars = 0;
        this.state = 'none';
        this.clearAllEvidence();
      }
    } else if (this.state === 'hollow') {
      // Hollow: police drive to the scene. If a unit gets eyes on the player
      // they upgrade to solid; if they arrive and find nobody, it fades.
      this.hotTimer += dt;
      if (this.hotTimer > 40) {
        this.stars = 0; this.state = 'none'; this.hotTimer = 0; this.clearAllEvidence();
      }
    }
  }

  // Star rendering info for the HUD.
  starStyle(i) {
    if (i >= this.stars) return 'empty';
    if (this.state === 'red') return 'red';
    if (this.state === 'flashing') return Math.floor(performance.now() / 350) % 2 === 0 ? 'solid' : 'dim';
    if (this.state === 'hollow') return 'hollow';
    return 'solid';
  }
}
