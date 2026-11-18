// SOLMAR NIGHTS — input.js
// Keyboard + mouse, read once a frame. Actions are edge-triggered (pressed
// this frame) so menus and car entry never double-fire.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_ATTACK = 8;
export const ACTION_HORN = 16;
export const ACTION_INTERACT = 32;

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'attack',
  KeyE: 'enter',
  KeyF: 'interact',
  KeyQ: 'horn',
  KeyM: 'mute',
  KeyP: 'pause', Escape: 'pause',
  Enter: 'confirm',
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let anyKey = false;

  function onKeyDown(e) {
    const name = KEYMAP[e.code];
    if (name) {
      if (!keys.has(name)) pressed.add(name);
      keys.add(name);
      anyKey = true;
      if (name === 'attack' || name === 'pause' || name === 'confirm') e.preventDefault();
    }
  }
  function onKeyUp(e) {
    const name = KEYMAP[e.code];
    if (name) keys.delete(name);
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }
  function onMouseDown(e) {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
      anyKey = true;
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
  }
  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return {
    mouse,
    /** -1/0/1 drive + strafe axes for this frame. */
    axes() {
      const x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const y = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
      return { x, y, sprint: keys.has('sprint') };
    },
    down(name) {
      return keys.has(name);
    },
    /** Edge-triggered actions since the last takeActions call. */
    takeActions() {
      let a = 0;
      if (pressed.has('confirm')) a |= ACTION_CONFIRM;
      if (pressed.has('pause')) a |= ACTION_PAUSE;
      if (pressed.has('enter')) a |= ACTION_ENTER_CAR;
      if (pressed.has('attack')) a |= ACTION_ATTACK;
      if (pressed.has('interact')) a |= ACTION_INTERACT;
      if (pressed.has('horn')) a |= ACTION_HORN;
      pressed.clear();
      if (mouse.clicked) {
        a |= ACTION_ATTACK;
        mouse.clicked = false;
      }
      return a;
    },
    consumeAnyKey() {
      const v = anyKey;
      anyKey = false;
      return v;
    },
  };
}
