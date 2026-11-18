// SOLMAR NIGHTS — input.js
// Keyboard + mouse state with edge detection ("pressed this frame").
// The game polls `down` for held keys and consumes `pressed` once per frame
// via wasPressed(), so menu navigation and one-shot actions never double-fire.

const KEY_ALIASES = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyE: 'enter', KeyF: 'interact', KeyQ: 'weapon',
  KeyP: 'pause', KeyN: 'minimap', KeyO: 'settings',
  KeyM: 'mute', Enter: 'confirm', Escape: 'escape',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint',
};

export function createInput(canvas) {
  const input = {
    down: {}, // action -> boolean, held
    pressed: {}, // action -> boolean, set on keydown, cleared each frame
    mouseX: 0, mouseY: 0, mouseDown: false, mousePressed: false,
    wheel: 0,
    // True once for the frame the key went down; call after handling.
    wasPressed(action) {
      return !!this.pressed[action];
    },
    endFrame() {
      this.pressed = {};
      this.mousePressed = false;
      this.wheel = 0;
    },
  };

  function actionFor(code) {
    return KEY_ALIASES[code] || null;
  }

  window.addEventListener('keydown', (e) => {
    const a = actionFor(e.code);
    if (a) {
      if (!input.down[a]) input.pressed[a] = true;
      input.down[a] = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const a = actionFor(e.code);
    if (a) input.down[a] = false;
  });
  window.addEventListener('blur', () => {
    input.down = {};
  });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left;
    input.mouseY = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      input.mouseDown = true;
      input.mousePressed = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    input.wheel = e.deltaY;
    e.preventDefault();
  }, { passive: false });

  return input;
}

// Aim angle from a screen point (the player, in screen space) to the mouse.
export function aimAngle(px, py, input) {
  return Math.atan2(input.mouseY - py, input.mouseX - px);
}
