// SOLMAR NIGHTS — gangs.js
// The Salt Kings. After the story heats up they send hit squads after the
// player; every third wave is led by a tougher Enforcer in gold.

import { GANG } from './config.js';
import { Rng } from './random.js';

export class GangManager {
  constructor() {
    this.wave = 0;
    this.timer = 90; // first squad comes after a quiet opening
    this.squadAlive = 0;
    this.active = false;
  }

  update(dt, world) {
    if (world.missions.index < 3) return; // the Kings only notice you later
    if (this.squadAlive > 0) {
      this.active = true;
      return;
    }
    this.active = false;
    this.timer -= dt;
    if (this.timer <= 0) this.sendSquad(world);
  }

  sendSquad(world) {
    this.wave++;
    const p = world.player;
    const rng = new Rng((world.seed + this.wave * 7919) >>> 0);
    const size = 2 + Math.min(3, Math.floor(this.wave / 2));
    const enforcer = this.wave % GANG.enforcerEveryWave === 0;
    for (let i = 0; i < size; i++) {
      const a = rng.float(0, Math.PI * 2);
      const x = p.x + Math.cos(a) * 420;
      const y = p.y + Math.sin(a) * 420;
      world.spawnEnemy(x, y, enforcer && i === 0 ? 'enforcer' : 'gunman');
    }
    this.squadAlive = size;
    world.addToast(enforcer
      ? `Salt Kings hit squad — an Enforcer leads them!`
      : `Salt Kings hit squad is after you!`);
    world.audio.phone();
    this.timer = 120 + rng.float(0, 60);
  }

  onSquadMemberDown(world) {
    this.squadAlive = Math.max(0, this.squadAlive - 1);
    if (this.squadAlive === 0) {
      world.addToast('Hit squad dealt with. For now.');
      world.rep += 2;
    }
  }
}
