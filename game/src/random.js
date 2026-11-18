// SOLMAR NIGHTS — random.js
// Deterministic seeded random numbers. The whole city is generated from one
// seed, so the same seed always builds the same Solmar, and replays match.

// mulberry32: small, fast, good enough for procedural generation.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) { this.next = makeRng(seed); }
  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min, max) { return Math.floor(this.float(min, max + 1)); }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
  chance(p) { return this.next() < p; }
  // Box-Muller-ish normal in [-1, 1], cheap and deterministic.
  normal() { return (this.next() + this.next() + this.next() - 1.5) / 1.5; }
}
