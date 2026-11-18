// SOLMAR NIGHTS — config.js
// One source of truth for every tunable number in the game. Units are pixels,
// seconds and radians; angle 0 points +x and grows clockwise (y-down screen space).

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60;
export const MAX_FRAME = 0.25;

// The city: a 3840 x 3840 island of roads on a 480 px pitch. Road centres sit at
// 480, 960, ... 3360; the strips outside the outer roads are beach (west),
// hills (north), docks (east) and old town (south).
export const WORLD = 3840;
export const ROAD_PITCH = 480;
export const ROAD_W = 96;
export const LANE_OFFSET = 24;
export const FIRST_ROAD = 480;
export const LAST_ROAD = 3360;

export const PLAYER = {
  WALK_SPEED: 175,
  SPRINT_SPEED: 268,
  RADIUS: 13,
  MAX_HP: 100,
  PUNCH_RANGE: 34,
  PUNCH_DAMAGE: 16,
  PUNCH_COOLDOWN: 0.34,
  SHOOT_COOLDOWN: 0.26,
  SHOOT_RANGE: 460,
  SHOOT_DAMAGE: 34,
  REGEN_DELAY: 6,
  REGEN_RATE: 5,
};

// Vehicle handling. Grip is the whole drift model: lateral velocity decays as
// exp(-grip * dt); the handbrake swaps in gripHand so the car slides.
export const VEHICLE_TYPES = {
  sedan:   { accel: 210, vMax: 300, revMax: 95,  brake: 520, coast: 110, steer: 2.7, grip: 8.0, gripHand: 2.4, w: 46, h: 22, hp: 120, mass: 1.0, price: 0 },
  taxi:    { accel: 200, vMax: 295, revMax: 95,  brake: 520, coast: 110, steer: 2.7, grip: 8.0, gripHand: 2.4, w: 46, h: 22, hp: 120, mass: 1.0, price: 0 },
  sports:  { accel: 300, vMax: 420, revMax: 110, brake: 620, coast: 90,  steer: 3.1, grip: 9.5, gripHand: 2.6, w: 44, h: 20, hp: 100, mass: 0.9, price: 0 },
  // A bike is the fastest thing on the street and the most fragile: huge
  // acceleration and top speed, a narrow body that threads traffic, but
  // low grip, a light frame that gets thrown around in a bump, and only
  // 70 hp before it is a fireball. Steal one if you dare.
  bike:    { accel: 330, vMax: 430, revMax: 110, brake: 560, coast: 80,  steer: 3.4, grip: 7.5, gripHand: 2.0, w: 32, h: 14, hp: 70,  mass: 0.45, price: 0 },
  pickup:  { accel: 180, vMax: 270, revMax: 85,  brake: 480, coast: 120, steer: 2.4, grip: 7.0, gripHand: 2.0, w: 50, h: 23, hp: 160, mass: 1.3, price: 0 },
  van:     { accel: 150, vMax: 240, revMax: 80,  brake: 450, coast: 130, steer: 2.2, grip: 6.5, gripHand: 1.8, w: 54, h: 24, hp: 180, mass: 1.5, price: 0 },
  truck:   { accel: 130, vMax: 210, revMax: 70,  brake: 420, coast: 140, steer: 1.9, grip: 6.0, gripHand: 1.6, w: 66, h: 26, hp: 220, mass: 1.9, price: 0 },
  police:  { accel: 290, vMax: 400, revMax: 110, brake: 640, coast: 95,  steer: 3.2, grip: 9.0, gripHand: 2.6, w: 46, h: 22, hp: 160, mass: 1.1, price: 0 },
  rival:   { accel: 285, vMax: 405, revMax: 105, brake: 600, coast: 90,  steer: 3.0, grip: 9.2, gripHand: 2.5, w: 44, h: 20, hp: 120, mass: 0.95, price: 0 },
};

// How many police cars chase at each wanted level, and how long the player must
// stay unseen (seconds) to drop one star. Modelled on the classic crime-game
// curve: a small visible signal, an escalating response, and an escape that
// takes longer the hotter you are.
export const WANTED = {
  HEAT_PER_STAR: [0, 25, 50, 70, 85, 100],
  CHASE_CARS: [0, 1, 2, 3, 4, 5],
  HIDE_TIME: [0, 22, 30, 40, 55, 75],
  SIGHT_RANGE: 520,
  CRIME_RADIUS: 420,
  CRIME: { stealCar: 26, punch: 14, shoot: 26, killPed: 42, killCop: 65, runOver: 24, explosion: 30 },
};

export const ECONOMY = {
  START_CASH: 250,
  AMMO_PRICE: 150,
  AMMO_AMOUNT: 24,
  ARMOR_PRICE: 120,
  ARMOR_AMOUNT: 50,
  ARMOR_MAX: 100,
  GANG_BOUNTY: 150,
  WAVE_BONUS: 200,
  SPRAY_PRICE: 150,
  HEAL_PRICE: 40,
  PACKAGE_VALUE: 250,
  BUSTED_FINE: 150,
  WASTED_FINE: 200,
};

// Weather: storms roll in off the bay every few minutes and pass. Rain
// slicks the roads — every car's grip drops by a quarter while it falls,
// so a handbrake turn slides further and braking distances grow.
export const WEATHER = {
  CLEAR_MIN: 100,
  CLEAR_MAX: 200,
  STORM_MIN: 25,
  STORM_MAX: 45,
  GRIP_WET: 0.75,
};

export const DAY_LENGTH = 360; // seconds for a full day/night cycle
export const SAVE_KEY = 'solmar-nights-save-v1';
export const BEST_KEY = 'solmar-nights-best-v1';

// Colour palette: a sun-soaked coastal city at golden hour — warm asphalt,
// teal water, sand, terracotta roofs and neon that wakes up after dark.
export const PALETTE = {
  water: '#1d7f9e',
  waterDeep: '#14607e',
  sand: '#e3c98f',
  grass: '#7fae62',
  grassDark: '#6b9a52',
  asphalt: '#3d3a38',
  asphaltLight: '#4a4642',
  roadLine: '#e8d44d',
  sidewalk: '#9a938a',
  sidewalkEdge: '#7d766d',
  curb: '#c9c2b8',
  buildingRoof: ['#b5673f', '#8a6f4d', '#5d7a8c', '#a34d4d', '#6f7f5e', '#7d6a9a', '#c08a3e', '#4d6b6b'],
  buildingWall: ['#d8cfc0', '#c9b8a3', '#b8c4c9', '#d3a08a', '#c2b49a', '#a8b5a0'],
  neon: ['#ff2e88', '#00e5ff', '#ffd23e', '#7cff4d', '#ff7a1a'],
};
