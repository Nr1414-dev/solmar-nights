// SOLMAR NIGHTS v2.3 — main.js
// Boot and the one loop. Input is read every frame, the world advances in
// fixed 1/60s steps, the renderer draws the current screen. Menus are
// keyboard-driven lists; the title screen shows the live city behind it.
// ?shot=cover|drive|foot|title plays a screenshot scene instead and sets
// window.__shotReady when the frame is drawn, so the shot script can
// capture it. Saving happens on pause-quit and on mission completion.

import { STEP, VIEW_H, VIEW_W } from './config.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_SETTINGS, ACTION_MINIMAP } from './input.js';
import { createWorld, updateWorld } from './world.js';
import { createRenderer, SCREEN_TITLE, SCREEN_HOWTO, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_ENDING, SCREEN_SETTINGS } from './render.js';
import { createAudio } from './audio.js';
import { readSave, readSettings, writeSave, writeSettings, clearSave, readBest, saveBest } from './save.js';
import { runShotScene } from './shots.js';
import { nextMissionIndex } from './missions.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();
const settings = readSettings();
audio.applySettings(settings);

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = Number(params.get('seed') ?? 20261118);
const seed = Number.isFinite(seedParam) ? seedParam : 20261118;

let G = createWorld(seed, readSave(), settings);
let screen = SCREEN_TITLE;
let menu = { items: [], selected: 0 };
let returnScreen = SCREEN_TITLE;
let accumulator = 0;
let lastTime = performance.now();

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function titleItems() {
  const items = [];
  if (readSave()) items.push('Continue');
  items.push('New Game');
  items.push('How to Play');
  items.push('Settings');
  return items;
}

function pauseItems() {
  return ['Resume', 'How to Play', 'Settings', 'Save & Quit to Title'];
}

function applySettings() {
  audio.applySettings(settings);
  writeSettings(settings);
}

function startGame(continueSave) {
  G = createWorld(seed, continueSave ? readSave() : null, settings);
  screen = SCREEN_PLAY;
  announce('Game started. Reach Mara\u2019s Office and press F to take the first job.');
  audio.unlock();
}

function handleTitle(actions) {
  menu.items = titleItems();
  if (input.down('ArrowUp') && !handleTitle._up) { menu.selected = (menu.selected + menu.items.length - 1) % menu.items.length; }
  if (input.down('ArrowDown') && !handleTitle._down) { menu.selected = (menu.selected + 1) % menu.items.length; }
  handleTitle._up = input.down('ArrowUp');
  handleTitle._down = input.down('ArrowDown');
  if (actions & ACTION_CONFIRM || input.consumeAnyKey() && false) {
    const choice = menu.items[menu.selected];
    audio.unlock();
    if (choice === 'Continue') startGame(true);
    else if (choice === 'New Game') { clearSave(); startGame(false); }
    else if (choice === 'How to Play') { returnScreen = SCREEN_TITLE; screen = SCREEN_HOWTO; }
    else if (choice === 'Settings') { returnScreen = SCREEN_TITLE; screen = SCREEN_SETTINGS; menu.selected = 0; }
  }
  if (actions & ACTION_SETTINGS) { returnScreen = SCREEN_TITLE; screen = SCREEN_SETTINGS; menu.selected = 0; }
}

function handleHowTo(actions) {
  if ((actions & ACTION_CONFIRM) || (actions & ACTION_PAUSE)) screen = returnScreen;
}

function handlePaused(actions) {
  menu.items = pauseItems();
  if (input.down('ArrowUp') && !handlePaused._up) { menu.selected = (menu.selected + menu.items.length - 1) % menu.items.length; }
  if (input.down('ArrowDown') && !handlePaused._down) { menu.selected = (menu.selected + 1) % menu.items.length; }
  handlePaused._up = input.down('ArrowUp');
  handlePaused._down = input.down('ArrowDown');
  if (actions & ACTION_CONFIRM) {
    const choice = menu.items[menu.selected];
    if (choice === 'Resume') screen = SCREEN_PLAY;
    else if (choice === 'How to Play') { returnScreen = SCREEN_PAUSED; screen = SCREEN_HOWTO; }
    else if (choice === 'Settings') { returnScreen = SCREEN_PAUSED; screen = SCREEN_SETTINGS; menu.selected = 0; }
    else if (choice === 'Save & Quit to Title') {
      writeSave(G);
      screen = SCREEN_TITLE;
      menu.selected = 0;
    }
  }
  if (actions & ACTION_PAUSE) screen = SCREEN_PLAY;
}

function handleSettings(actions) {
  const rows = 6;
  if (input.down('ArrowUp') && !handleSettings._up) { menu.selected = (menu.selected + rows - 1) % rows; }
  if (input.down('ArrowDown') && !handleSettings._down) { menu.selected = (menu.selected + 1) % rows; }
  handleSettings._up = input.down('ArrowUp');
  handleSettings._down = input.down('ArrowDown');
  const left = input.down('ArrowLeft');
  const right = input.down('ArrowRight');
  if ((left && !handleSettings._left) || (right && !handleSettings._right)) {
    const dir = right ? 1 : -1;
    if (menu.selected === 0) settings.music = Math.min(1, Math.max(0, settings.music + dir * 0.1));
    if (menu.selected === 1) settings.sfx = Math.min(1, Math.max(0, settings.sfx + dir * 0.1));
    if (menu.selected === 2) settings.minimap = (settings.minimap + dir + 3) % 3;
    if (menu.selected === 3) settings.shake = !settings.shake;
    if (menu.selected === 4) settings.hints = !settings.hints;
    applySettings();
  }
  handleSettings._left = left;
  handleSettings._right = right;
  if (actions & ACTION_CONFIRM && menu.selected === 5) screen = returnScreen;
  if (actions & ACTION_PAUSE) screen = returnScreen;
}

function handleOver(actions) {
  menu.items = ['Retry from last save', 'New Game', 'Title'];
  if (input.down('ArrowUp') && !handleOver._up) { menu.selected = (menu.selected + menu.items.length - 1) % menu.items.length; }
  if (input.down('ArrowDown') && !handleOver._down) { menu.selected = (menu.selected + 1) % menu.items.length; }
  handleOver._up = input.down('ArrowUp');
  handleOver._down = input.down('ArrowDown');
  if (actions & ACTION_CONFIRM) {
    const choice = menu.items[menu.selected];
    if (choice === 'Retry from last save') startGame(true);
    else if (choice === 'New Game') { clearSave(); startGame(false); }
    else { screen = SCREEN_TITLE; menu.selected = 0; }
  }
}

function handleEnding(actions) {
  menu.items = ['Keep playing — free roam', 'Title'];
  if (input.down('ArrowUp') && !handleEnding._up) { menu.selected = (menu.selected + menu.items.length - 1) % menu.items.length; }
  if (input.down('ArrowDown') && !handleEnding._down) { menu.selected = (menu.selected + 1) % menu.items.length; }
  handleEnding._up = input.down('ArrowUp');
  handleEnding._down = input.down('ArrowDown');
  if (actions & ACTION_CONFIRM) {
    if (menu.selected === 0) { G.ending = false; screen = SCREEN_PLAY; }
    else { writeSave(G); screen = SCREEN_TITLE; menu.selected = 0; }
  }
}

function silentAudio() {
  // The screenshot scenes run without a user gesture, so audio is a
  // no-op stand-in with the same method names.
  return {
    unlock() {}, applySettings() {}, setMusic() {},
    shoot() {}, shotgun() {}, punch() {}, crash() {}, explosion() {},
    horn() {}, pickup() {}, cash() {}, denied() {}, siren() {}, heli() {},
    engine() {}, phone() {}, success() {}, fail() {},
  };
}

function runShot(name) {
  const quiet = silentAudio();
  runShotScene(G, name, quiet);
  const drawScreen = name === 'title' ? SCREEN_TITLE : SCREEN_PLAY;
  if (name === 'title') menu.items = titleItems();
  renderer.draw(G, drawScreen, menu, settings);
  window.__shotReady = true;
  announce(`Screenshot scene ${name} ready`);
}

function runGame() {
  function frame(now) {
    const dt = Math.min(0.25, (now - lastTime) / 1000);
    lastTime = now;
    const actions = input.takeActions();
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) { screen = SCREEN_PAUSED; menu.selected = 0; }
      else if (actions & ACTION_SETTINGS) { returnScreen = SCREEN_PAUSED; screen = SCREEN_SETTINGS; menu.selected = 0; }
      else if (actions & ACTION_MINIMAP) { settings.minimap = (settings.minimap + 1) % 3; applySettings(); }
      else {
        accumulator += dt;
        let firstStep = true;
        while (accumulator >= STEP) {
          const stepActions = firstStep ? actions : 0;
          firstStep = false;
          updateWorld(G, input, audio, STEP, SCREEN_PLAY, stepActions);
          accumulator -= STEP;
          if (G.gameOver) { screen = SCREEN_OVER; menu.selected = 0; audio.fail(); saveBest(G.campaign.bestStars); break; }
          if (G.ending) { screen = SCREEN_ENDING; menu.selected = 0; audio.success(); writeSave(G); break; }
        }
        if (G.mission.active && G.campaign.missionsDone.length > 0) {
          // Autosave quietly after each completed job.
          if (runGame._savedJobs !== G.campaign.missionsDone.length) {
            runGame._savedJobs = G.campaign.missionsDone.length;
            writeSave(G);
          }
        }
      }
    } else if (screen === SCREEN_TITLE) handleTitle(actions);
    else if (screen === SCREEN_HOWTO) handleHowTo(actions);
    else if (screen === SCREEN_PAUSED) handlePaused(actions);
    else if (screen === SCREEN_SETTINGS) handleSettings(actions);
    else if (screen === SCREEN_OVER) handleOver(actions);
    else if (screen === SCREEN_ENDING) handleEnding(actions);
    renderer.draw(G, screen, menu, settings);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (shotName) {
  // Screenshot mode: play the scene synchronously, draw once, signal.
  try {
    runShot(shotName);
  } catch (e) {
    console.error(e);
    window.__shotReady = true;
    window.__shotError = String(e);
  }
} else {
  menu.items = titleItems();
  runGame();
}
