// SOLMAR NIGHTS — make.fun gta6-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, no library and
// no network request). This program hands it in: it copies game/ and
// screenshots/ from beside this file to the output directory and writes
// output/dossier.json, the summary the judge reads, with the vendored
// make.fun library (vendor/makefun-game.ts).
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
// The grader hands the entry /output; a local run takes MAKEFUN_OUTPUT_DIR.
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message: string): never {
  throw new Error(`SOLMAR NIGHTS build: ${message}`);
}

function requireFile(path: string, why: string): void {
  if (!existsSync(path) || !statSync(path).isFile()) fail(`missing ${path} — ${why}`);
}

// Pre-flight: the v2 systems the entry promises must be in the tree before
// anything is copied, so a half-built checkout fails loudly here instead of
// handing in a game without its bikes, hit squads or favicon.
const REQUIRED = [
  ['game/index.html', 'the playable page'],
  ['game/favicon.svg', 'the v2 favicon (linked from index.html)'],
  ['game/src/gangs.js', 'the v2 Salt Kings hit squads'],
  ['game/src/main.js', 'the game boot and loop'],
  ['game/src/wanted.js', 'the witness-based wanted system'],
] as const;
for (const [rel, why] of REQUIRED) requireFile(join(here, rel), why);

// The favicon must actually be wired: a file nobody links is dead weight.
const indexHtml = readFileSync(join(here, 'game/index.html'), 'utf8');
if (!indexHtml.includes('favicon.svg')) fail('game/index.html does not link game/favicon.svg');

// Screenshots: 3 or 4, each inside the gate's 256 KiB cap, before the
// dossier is built from them.
const shotsDir = join(here, 'screenshots');
const shotNames = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')) : [];
if (shotNames.length < 3 || shotNames.length > 4) {
  fail(`screenshots/ holds ${shotNames.length} images, need 3 or 4`);
}
for (const name of shotNames) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > 262144) fail(`screenshots/${name} is ${size} bytes, over the 256 KiB cap`);
}

function countFiles(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  }
  return n;
}

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(out, { recursive: true });
copyTree(join(here, 'game'), join(out, 'game'));
if (existsSync(join(here, 'screenshots'))) {
  copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// Build stamp: what went in and how close the dossier text sits to its cap.
const gameFiles = countFiles(join(out, 'game'));
const textBytes = new TextEncoder().encode(JSON.parse(new TextDecoder().decode(dossier)).text).length;
console.log(`SOLMAR NIGHTS v2 — ${gameFiles} game files, ${shotNames.length} screenshots`);
console.log(`Wrote ${join(out, 'dossier.json')} (${dossier.length} bytes, text ${textBytes} / 163840 bytes)`);
