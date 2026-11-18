// SOLMAR NIGHTS — main.js
// Boot and the one loop. Input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// how to play, play, paused, busted/wasted, and the ending.
//
// ?seed=N fixes the city. ?shot=cover|drive|foot|title (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { ECONOMY, MAX_FRAME, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, updateWorld } from './world.js';
import { ACTION_ATTACK, ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_ENDING, SCREEN_HOWTO, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { readSave, saveBest, writeSave } from './save.js';
import { stageShot } from './shots.js';
import { startMission } from './missions.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);
const input = createInput(canvas);

let save = readSave();
let world = createWorld(seed, null);
let screen = SCREEN_TITLE;
let selected = 0;
let overKind = 'wasted';
let overSub = '';
let muteLatch = false;

function announce(message) {
  status.textContent = message;
}

function titleItems() {
  return save ? ['CONTINUE', 'NEW GAME', 'HOW TO PLAY'] : ['NEW GAME', 'HOW TO PLAY'];
}

function startGame(continueSave) {
  const data = continueSave ? save : null;
  world = createWorld(seed, data);
  screen = SCREEN_PLAY;
  selected = 0;
  audio.unlock();
  if (continueSave) {
    world.toast = { text: `Welcome back, Dana. ${world.missionIndex < 6 ? 'Mara has work at the safehouse.' : 'The city is yours.'}`, t: 0, dur: 5 };
  } else {
    world.banner = {
      title: 'SOLMAR NIGHTS',
      sub: 'Dana Reyes owes the Salt Kings $12,000. Mara Solis has work — start at the safehouse.',
      t: 0, dur: 6,
    };
  }
  announce('Playing. WASD to move, E to enter cars, Space to punch, click to shoot.');
}

function handleTitle() {
  const actions = input.takeActions();
  const axes = input.axes();
  const items = titleItems();
  if (axes.y < 0) selected = (selected + items.length - 1) % items.length;
  else if (axes.y > 0) selected = (selected + 1) % items.length;
  const clicked = (actions & ACTION_ATTACK) !== 0;
  if (clicked) {
    // Clicking a menu row picks it.
    const my = input.mouse.y;
    for (let i = 0; i < items.length; i++) {
      if (Math.abs(my - (430 + i * 56)) < 26) selected = i;
    }
  }
  if ((actions & ACTION_CONFIRM) || clicked) {
    audio.unlock();
    const choice = items[selected];
    if (choice === 'CONTINUE') startGame(true);
    else if (choice === 'NEW GAME') startGame(false);
    else if (choice === 'HOW TO PLAY') { screen = SCREEN_HOWTO; selected = 0; }
  }
}

function handleHowTo() {
  const actions = input.takeActions();
  if (actions & (ACTION_CONFIRM | ACTION_ATTACK)) {
    screen = SCREEN_TITLE;
    selected = 0;
  }
}

function handlePaused() {
  const actions = input.takeActions();
  const axes = input.axes();
  const items = ['RESUME', 'RESTART CURRENT JOB', 'SAVE & QUIT TO TITLE', audio.isMuted() ? 'SOUND: OFF' : 'SOUND: ON'];
  if (axes.y < 0) selected = (selected + items.length - 1) % items.length;
  else if (axes.y > 0) selected = (selected + 1) % items.length;
  if (actions & ACTION_PAUSE) {
    screen = SCREEN_PLAY;
    return;
  }
  if (!(actions & ACTION_CONFIRM)) return;
  const choice = items[selected];
  if (choice === 'RESUME') screen = SCREEN_PLAY;
  else if (choice === 'RESTART CURRENT JOB') {
    if (world.mission.active) {
      const idx = world.mission.index;
      world.mission.active = false;
      startMission(world, idx);
    }
    screen = SCREEN_PLAY;
  } else if (choice === 'SAVE & QUIT TO TITLE') {
    writeSave(world);
    save = readSave();
    screen = SCREEN_TITLE;
    selected = 0;
  } else if (choice.startsWith('SOUND')) {
    audio.setMuted(!audio.isMuted());
  }
}

function handleOver() {
  const actions = input.takeActions();
  if (!(actions & ACTION_CONFIRM)) return;
  const p = world.player;
  const fine = overKind === 'busted' ? ECONOMY.BUSTED_FINE : ECONOMY.WASTED_FINE;
  p.cash = Math.max(0, p.cash - fine);
  p.ammo = Math.ceil(p.ammo / 2);
  p.hp = 100;
  p.inCar = null;
  world.wanted.heat = 0;
  world.wanted.stars = 0;
  world.cars = world.cars.filter((c) => c.ai !== 'police');
  world.police = [];
  if (world.mission.active) {
    world.mission.active = false;
    world.banner = { title: 'JOB FAILED', sub: 'Mara will let you try again.', t: 0, dur: 4 };
  }
  if (overKind === 'wasted') {
    p.x = 2850;
    p.y = 2850;
  } else {
    p.x = 700;
    p.y = 780;
  }
  world.camera.x = p.x;
  world.camera.y = p.y;
  world.flags.busted = false;
  world.flags.wasted = false;
  world.saveNeeded = true;
  screen = SCREEN_PLAY;
  announce('Back on the street.');
}

function handleEnding() {
  const actions = input.takeActions();
  if (actions & ACTION_CONFIRM) {
    world.flags.ending = false;
    screen = SCREEN_PLAY;
  }
}

function runShot(name) {
  const scene = stageShot(name, world, audio);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, input, { selected: 0, saveExists: !!save, muted: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let prevMute = false;

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // Mute is a latched key, not an action.
    const muteDown = input.down('mute');
    if (muteDown && !prevMute) audio.setMuted(!audio.isMuted());
    prevMute = muteDown;

    if (screen === SCREEN_TITLE) handleTitle();
    else if (screen === SCREEN_HOWTO) handleHowTo();
    else if (screen === SCREEN_PAUSED) handlePaused();
    else if (screen === SCREEN_OVER) handleOver();
    else if (screen === SCREEN_ENDING) handleEnding();
    else if (screen === SCREEN_PLAY) {
      const actions = input.takeActions();
      // Mouse position in logical 1280x720 space, for aiming and the crosshair.
      const view = renderer.getView();
      input.mouse.lx = (input.mouse.x - view.ox) / view.scale;
      input.mouse.ly = (input.mouse.y - view.oy) / view.scale;
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        selected = 0;
        announce('Paused.');
      } else {
        while (accumulator >= STEP) {
          updateWorld(world, input, audio, STEP, screen, actions);
          accumulator -= STEP;
          if (world.flags.busted || world.flags.wasted) {
            overKind = world.flags.busted ? 'busted' : 'wasted';
            const fine = overKind === 'busted' ? ECONOMY.BUSTED_FINE : ECONOMY.WASTED_FINE;
            overSub = overKind === 'busted'
              ? `The Solmar PD took you in. Fine: $${fine}. Your ammo was confiscated.`
              : `You woke up at Solmar General. Hospital bill: $${fine}.`;
            screen = SCREEN_OVER;
            saveBest(world.player.cash);
            announce(overKind === 'busted' ? 'Busted.' : 'Wasted.');
            break;
          }
          if (world.flags.ending) {
            screen = SCREEN_ENDING;
            saveBest(world.player.cash);
            break;
          }
        }
        if (world.saveNeeded) {
          world.saveNeeded = false;
          writeSave(world);
          save = readSave();
        }
      }
      if (screen === SCREEN_PLAY && accumulator >= STEP) accumulator = 0;
    }

    const ui = {
      selected,
      saveExists: !!save,
      muted: audio.isMuted(),
      kind: overKind,
      sub: overSub,
    };
    renderer.draw(world, screen, input, ui);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      selected = 0;
      // Hiding the tab mid-job saves the run first: a closed tab no longer
      // loses the mission in progress.
      writeSave(world);
      save = readSave();
      announce('Paused — progress saved.');
    }
  });

  // Losing the window (Alt-Tab, a clicked notification) pauses too, so the
  // world never keeps running while the player is not looking at it.
  window.addEventListener('blur', () => {
    if (screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      selected = 0;
      announce('Paused.');
    }
  });

  announce('Solmar Nights. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
