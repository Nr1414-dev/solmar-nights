// SOLMAR NIGHTS — main.js
// Boot + game loop + screen state machine. The simulation lives in world.js
// and the drawing in render.js; this file only wires them together, handles
// menus, saving, the aim angle, and the ?shot= staging used for screenshots.

import { createWorld, updateWorld } from './world.js';
import { createInput } from './input.js';
import { render } from './render.js';
import { applyShot } from './shots.js';
import { saveGame, loadGame, applySave, hasSave } from './save.js';
import { seedFromString } from './random.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const seed = seedParam ? seedFromString(`solmar-${seedParam}`) : seedFromString('solmar-7');
const shotName = params.get('shot');

const world = createWorld(seed);
world.hasSave = hasSave();
const input = createInput(canvas);
window.__game = world;
window.__shotReady = false;

// Settings keys 1/2/3 (handled here so input.js stays about movement).
window.addEventListener('keydown', (e) => {
  if (world.screen !== 'settings') return;
  if (e.code === 'Digit1') { world.settings.music = !world.settings.music; world.audio.musicOn = world.settings.music; }
  if (e.code === 'Digit2') { world.settings.sfx = !world.settings.sfx; world.audio.sfxOn = world.settings.sfx; }
  if (e.code === 'Digit3') { world.settings.minimap = (world.settings.minimap + 1) % 4; }
});

if (shotName) {
  applyShot(world, shotName);
  // Pre-run the simulation so traffic, cops and the helicopter are already
  // in motion when the screenshot lands.
  const dummy = { down: {}, wasPressed: () => false, mousePressed: false, mouseDown: false, mouseX: 640, mouseY: 360 };
  for (let i = 0; i < 90; i++) updateWorld(world, dummy, 1 / 60);
  render(ctx, world, input);
  window.__shotReady = true;
}

let last = performance.now();
let returnScreen = 'title';

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  handleScreens(dt);
  if (world.screen === 'play') {
    // Aim angle: player position in screen space vs the mouse.
    const W = canvas.width, H = canvas.height;
    const p = world.player;
    const sx = W / 2 + (p.x - world.camera.x);
    const sy = H / 2 + (p.y - world.camera.y);
    world.aimAngle = Math.atan2(input.mouseY - sy, input.mouseX - sx);
    updateWorld(world, input, dt);
    // Minimap size + mute are live keys.
    if (input.wasPressed('minimap')) world.settings.minimap = (world.settings.minimap + 1) % 4;
    if (input.wasPressed('mute')) {
      world.audio.ensure();
      world.audio.setMuted(!world.audio.muted);
    }
    if (input.wasPressed('pause')) {
      world.screen = 'pause';
      world.audio.ensure();
      saveGame(world);
    }
    if (input.wasPressed('settings')) {
      returnScreen = 'pause';
      world.screen = 'settings';
    }
  }

  render(ctx, world, input);
  input.endFrame();
  requestAnimationFrame(frame);
}

function handleScreens(dt) {
  const s = world.screen;
  if (s === 'title') {
    if (input.wasPressed('up')) { world.titleChoice = (world.titleChoice + 3) % 4; world.audio.ensure(); world.audio.blip(600); }
    if (input.wasPressed('down')) { world.titleChoice = (world.titleChoice + 1) % 4; world.audio.ensure(); world.audio.blip(600); }
    if (input.wasPressed('confirm') || input.mousePressed) {
      world.audio.ensure();
      const choice = world.titleChoice;
      if (choice === 0) {
        world.screen = 'play';
        world.message('Welcome to Solmar, Dana. Mara is waiting at Mercado.', '#e8b81a');
      } else if (choice === 1) {
        world.screen = 'howto';
      } else if (choice === 2) {
        const data = loadGame();
        if (data) {
          applySave(world, data);
          world.screen = 'play';
          world.message('Save loaded. Welcome back, Dana.', '#7ae88c');
        } else {
          world.screen = 'play';
        }
      } else {
        returnScreen = 'title';
        world.screen = 'settings';
      }
    }
    return;
  }
  if (s === 'howto') {
    if (input.wasPressed('confirm') || input.wasPressed('escape')) world.screen = 'title';
    return;
  }
  if (s === 'settings') {
    if (input.wasPressed('confirm') || input.wasPressed('escape')) world.screen = returnScreen;
    return;
  }
  if (s === 'pause') {
    if (input.wasPressed('pause')) world.screen = 'play';
    else if (input.wasPressed('escape')) { world.screen = 'title'; world.titleChoice = 0; }
    else if (input.wasPressed('confirm')) {
      if (saveGame(world)) world.message('Game saved.', '#7ae88c');
    } else if (input.wasPressed('settings')) {
      returnScreen = 'pause';
      world.screen = 'settings';
    }
    return;
  }
  if (s === 'gameover') {
    world.gameOverTimer += dt;
    if (world.gameOverTimer > 0.8 && input.wasPressed('confirm')) {
      const p = world.player;
      p.dead = false;
      p.hp = 100;
      p.money = Math.max(0, p.money - 200);
      p.x = 720; p.y = 2640; // clinic next to Rosa's Diner
      if (p.inCar) { p.inCar.driver = 'parked'; p.inCar = null; }
      world.wanted.stars = 0;
      world.wanted.state = 'none';
      world.wanted.heat = 0;
      world.cops = [];
      world.heli.active = false;
      world.screen = 'play';
      world.message('Patched up at the clinic. $200 lighter.', '#e8b81a');
    }
    return;
  }
  void dt;
}

requestAnimationFrame(frame);
