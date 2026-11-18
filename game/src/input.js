// SOLMAR NIGHTS v2.3 — input.js
// Keyboard + mouse, read once a frame. Movement axes are analogue-style
// (-1..1) from WASD/arrows; actions are edge-triggered bit flags so a
// single keypress fires exactly one event even if the frame rate wobbles.
// The game never reads keys directly — it reads this object, which is why
// the screenshot autopilot can drive the same world with a fake input.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_ATTACK = 8;
export const ACTION_HORN = 16;
export const ACTION_INTERACT = 32;
export const ACTION_SETTINGS = 64;
export const ACTION_MINIMAP = 128;
export const ACTION_WEAPON = 256;
export const ACTION_SPRINT = 512;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  KeyE: ACTION_ENTER_CAR,
  KeyF: ACTION_INTERACT,
  KeyH: ACTION_HORN,
  KeyO: ACTION_SETTINGS,
  KeyN: ACTION_MINIMAP,
  KeyQ: ACTION_WEAPON,
};

export function createInput(canvas) {
  const keys = new Set();
  let queued = 0;
  let anyKey = false;
  const mouse = { x: 640, y: 360, down: false, clicked: false };

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    const bit = KEY_ACTIONS[e.code];
    if (bit) queued |= bit;
    anyKey = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  }
  function onMouseDown(e) {
    onMouseMove(e);
    mouse.down = true;
    mouse.clicked = true;
    queued |= ACTION_ATTACK;
  }
  function onMouseUp() { mouse.down = false; }
  function onBlur() { keys.clear(); mouse.down = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    mouse,
    down(code) { return keys.has(code); },
    axes() {
      let x = 0; let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
      return { x, y, sprint };
    },
    // Edge-triggered actions since the last call; calling twice in a
    // frame returns the bits once, then zero.
    takeActions() {
      const out = queued;
      queued = 0;
      return out;
    },
    consumeAnyKey() {
      const out = anyKey;
      anyKey = false;
      return out;
    },
    // For tests / the autopilot: inject an action bit directly.
    inject(bit) { queued |= bit; },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}
