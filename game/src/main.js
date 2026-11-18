// SOLMAR NIGHTS — main.js
// Bootstrap, the game loop, and the menu state machine.
// Menu order: New Game / How to Play / Continue / Settings.

import { World } from './world.js';
import { Input } from './input.js';
import {
  drawWorld, drawHUD, drawTitle, drawHowTo, drawPause, drawSettings,
  drawShop, drawGameOver, shopItems,
} from './render.js';
import { stageShot } from './shots.js';
import { saveGame, loadGame, hasSave, clearSave, saveSettings, loadSettings } from './save.js';
import { hashSeed } from './random.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const seedParam = params.get('seed') || 'solmar-7';
const seed = hashSeed(seedParam);
const shotName = params.get('shot');

const settings = Object.assign(
  { volume: 0.7, music: true, minimap: 1, quality: 'high' },
  loadSettings() || {},
);

const world = new World(seed);
world.audio.setVolume(settings.volume);
world.audio.musicOn = settings.music;
world.minimapSize = settings.minimap;

const input = new Input(canvas);

let screen = 'title'; // title | howto | settings | play | pause | shop | over
let menuIndex = 0;
let pauseIndex = 0;
let settingsIndex = 0;
let shopIndex = 0;
let returnTo = 'title';
let lastTime = performance.now();
let shotFrames = 0;
let shotStaged = false;
let autosaveTimer = 0;

// Apply a saved game, if one exists and Continue is chosen.
function applySave(data) {
  if (!data) return;
  world.money = data.money;
  world.rep = data.rep;
  world.missions.index = data.missionIndex;
  world.missions.completed = data.completed || [];
  world.packagesFound = data.packages || 0;
  world.player.weapons = data.weapons || ['fists'];
  world.player.weapon = data.weapon || 'fists';
  world.player.mag = Object.assign(world.player.mag, data.ammo?.mag || {});
  world.player.reserve = Object.assign(world.player.reserve, data.ammo?.reserve || {});
  world.player.armor = data.armor || 0;
  world.player.health = data.health || 100;
  world.player.outfit = data.outfit || 0;
  world.timeHours = data.time || 10.2;
  world.player.x = data.x || 960;
  world.player.y = data.y || 1740;
  world.unlocked = Object.assign(world.unlocked, data.unlocked || {});
  world.stats = Object.assign(world.stats, data.stats || {});
  for (const pkg of world.city.packages) {
    // Packages are re-found per session; found count is restored as money only.
  }
  world.camera.x = world.player.x - 640;
  world.camera.y = world.player.y - 360;
}

function startNewGame() {
  clearSave();
  const fresh = new World(seed);
  Object.assign(world, fresh);
  world.audio.setVolume(settings.volume);
  world.audio.musicOn = settings.music;
  world.minimapSize = settings.minimap;
  screen = 'play';
  world.addToast('Welcome to Solmar. See Mara at Sol Diner to start work.');
  world.banner('SOLMAR NIGHTS');
}

function openSettings(from) {
  returnTo = from;
  screen = 'settings';
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (input.anyGesture) world.audio.unlock();

  if (screen === 'play') {
    if (input.hit('p') || input.hit('Escape')) {
      screen = 'pause';
      pauseIndex = 0;
    } else if (world.shopOpen) {
      screen = 'shop';
      shopIndex = 0;
    } else {
      world.update(dt, input);
      autosaveTimer += dt;
      if (autosaveTimer > 30) {
        autosaveTimer = 0;
        saveGame(world);
      }
      if (world.gameOver || world.win) screen = 'over';
    }
  } else if (screen === 'title') {
    if (input.hit('ArrowUp') || input.hit('w')) menuIndex = (menuIndex + 3) % 4;
    if (input.hit('ArrowDown') || input.hit('s')) menuIndex = (menuIndex + 1) % 4;
    if (input.hit('Enter') || input.hit(' ')) chooseTitle();
    if (input.mouseClicked) {
      const my = input.mouseY;
      const hit = Math.floor((my - canvas.height * 0.52 + 28) / 52);
      if (hit >= 0 && hit < 4) { menuIndex = hit; chooseTitle(); }
    }
  } else if (screen === 'howto') {
    if (input.hit('Escape') || input.hit('Enter')) screen = returnTo;
  } else if (screen === 'settings') {
    if (input.hit('ArrowUp')) settingsIndex = (settingsIndex + 3) % 4;
    if (input.hit('ArrowDown')) settingsIndex = (settingsIndex + 1) % 4;
    if (input.hit('ArrowLeft') || input.hit('ArrowRight')) {
      const dir = input.hit('ArrowRight') ? 1 : -1;
      if (settingsIndex === 0) settings.volume = Math.max(0, Math.min(1, settings.volume + dir * 0.1));
      if (settingsIndex === 1) settings.music = !settings.music;
      if (settingsIndex === 2) settings.minimap = (settings.minimap + dir + 3) % 3;
      if (settingsIndex === 3) settings.quality = settings.quality === 'high' ? 'low' : 'high';
      applySettings();
    }
    if (input.hit('m')) { settings.music = !settings.music; applySettings(); }
    if (input.hit('Escape') || input.hit('Enter')) {
      saveSettings(settings);
      screen = returnTo;
    }
  } else if (screen === 'pause') {
    if (input.hit('ArrowUp') || input.hit('w')) pauseIndex = (pauseIndex + 3) % 4;
    if (input.hit('ArrowDown') || input.hit('s')) pauseIndex = (pauseIndex + 1) % 4;
    if (input.hit('p') || input.hit('Escape')) screen = 'play';
    if (input.hit('Enter') || input.hit(' ')) {
      if (pauseIndex === 0) screen = 'play';
      else if (pauseIndex === 1) { returnTo = 'pause'; screen = 'howto'; }
      else if (pauseIndex === 2) openSettings('pause');
      else if (pauseIndex === 3) {
        saveGame(world);
        screen = 'title';
        menuIndex = 0;
      }
    }
  } else if (screen === 'shop') {
    const items = shopItems(world.shopOpen, world);
    if (input.hit('ArrowUp') || input.hit('w')) shopIndex = (shopIndex + items.length - 1) % items.length;
    if (input.hit('ArrowDown') || input.hit('s')) shopIndex = (shopIndex + 1) % items.length;
    if (input.hit('Enter') || input.hit(' ')) world.buyItem(items[shopIndex].id);
    if (input.hit('f') || input.hit('Escape')) {
      world.shopOpen = null;
      screen = 'play';
    }
  } else if (screen === 'over') {
    if (input.hit('Enter') || input.hit(' ')) {
      screen = 'title';
      menuIndex = 0;
    }
  }

  // ---- render -----------------------------------------------------------
  if (screen === 'title') {
    drawTitle(ctx, canvas.width, canvas.height, menuIndex);
  } else if (screen === 'howto') {
    drawHowTo(ctx, canvas.width, canvas.height);
  } else if (screen === 'settings') {
    drawSettings(ctx, canvas.width, canvas.height, settings, settingsIndex);
  } else if (screen === 'shop') {
    drawWorld(ctx, world, canvas.width, canvas.height);
    drawHUD(ctx, world, canvas.width, canvas.height);
    drawShop(ctx, world, canvas.width, canvas.height, shopIndex);
  } else if (screen === 'pause') {
    drawWorld(ctx, world, canvas.width, canvas.height);
    drawHUD(ctx, world, canvas.width, canvas.height);
    drawPause(ctx, canvas.width, canvas.height, pauseIndex);
  } else if (screen === 'over') {
    drawWorld(ctx, world, canvas.width, canvas.height);
    drawGameOver(ctx, canvas.width, canvas.height, world.win, world.stats);
  } else {
    drawWorld(ctx, world, canvas.width, canvas.height);
    drawHUD(ctx, world, canvas.width, canvas.height);
  }

  input.endFrame();

  // ---- screenshot staging ----------------------------------------------
  if (shotName && !shotStaged) {
    shotStaged = true;
    const mode = stageShot(world, shotName);
    screen = mode;
    if (mode === 'play') {
      // Let traffic and particles settle a few frames before signalling.
      shotFrames = 0;
      const settle = () => {
        world.update(1 / 60, input);
        drawWorld(ctx, world, canvas.width, canvas.height);
        drawHUD(ctx, world, canvas.width, canvas.height);
        input.endFrame();
        shotFrames++;
        if (shotFrames >= 12) {
          window.__shotReady = true;
          requestAnimationFrame(frame); // resume the normal loop
        } else requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
      return; // the settle loop hands control back to rAF below
    }
    window.__shotReady = true;
  } else if (shotName && shotStaged && screen === 'play') {
    // Normal play loop continues after staging; __shotReady already set.
  }
  requestAnimationFrame(frame);
}

function chooseTitle() {
  if (menuIndex === 0) startNewGame();
  else if (menuIndex === 1) { returnTo = 'title'; screen = 'howto'; }
  else if (menuIndex === 2) {
    const data = loadGame();
    if (data) {
      applySave(data);
      screen = 'play';
      world.addToast('Welcome back to Solmar.');
    } else {
      world.addToast('No save yet — starting a new game.');
      startNewGame();
    }
  } else if (menuIndex === 3) openSettings('title');
}

function applySettings() {
  world.audio.setVolume(settings.volume);
  world.audio.musicOn = settings.music;
  world.minimapSize = settings.minimap;
  saveSettings(settings);
}

// Resize the canvas to the window while keeping the 1280x720 playfield.
function fitCanvas() {
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  canvas.style.width = `${Math.floor(1280 * scale)}px`;
  canvas.style.height = `${Math.floor(720 * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// If there is a save, the title screen's Continue is live; otherwise it
// starts a new game (chooseTitle handles both).
void hasSave;
requestAnimationFrame(frame);
