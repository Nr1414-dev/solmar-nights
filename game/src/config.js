// SOLMAR NIGHTS v2.3 — config.js
// Every tunable number for the game lives here. Units are pixels, seconds
// and radians. Angle 0 points east (+x) and grows clockwise because screen
// y grows downward. Nothing in this file touches the DOM or the network.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60;
export const MAX_FRAME = 0.25;

// The city is a 3840x3840 island. Roads run on a 480px grid: centres at
// 480, 960, 1440, 1920, 2400, 2880, 3360 in both directions. The strips
// outside the outer roads are beach (west), hills (north), docks (east)
// and the old town (south).
export const WORLD = 3840;
export const ROAD_PITCH = 480;
export const ROAD_W = 96;
export const LANE = 24;
export const FIRST_ROAD = 480;
export const LAST_ROAD = 3360;
export const ROAD_CENTRES = [480, 960, 1440, 1920, 2400, 2880, 3360];

export const PLAYER = {
  WALK: 178,
  SPRINT: 272,
  RADIUS: 13,
  MAX_HP: 100,
  PUNCH_RANGE: 36,
  PUNCH_DMG: 18,
  PUNCH_CD: 0.34,
  SHOT_CD: 0.24,
  SHOT_RANGE: 480,
  SHOT_DMG: 34,
  SHOTGUN_DMG: 26,
  SHOTGUN_PELLETS: 5,
  REGEN_DELAY: 6,
  REGEN_RATE: 5,
  ARMOR_MAX: 100,
};

// Vehicle handling. Grip is the whole drift model: lateral velocity decays
// like exp(-grip*dt); the handbrake swaps in a much lower grip so the car
// slides. vMax is px/s, accel px/s^2, steer rad/s at full lock.
export const VEHICLE_TYPES = {
  sedan:    { accel: 215, vMax: 305, revMax: 95,  brake: 540, coast: 110, steer: 2.7, grip: 8.0, gripHand: 2.4, w: 46, h: 22, hp: 120, mass: 1.0, price: 0 },
  taxi:     { accel: 205, vMax: 300, revMax: 95,  brake: 540, coast: 110, steer: 2.7, grip: 8.0, gripHand: 2.4, w: 46, h: 22, hp: 120, mass: 1.0, price: 0 },
  sports:   { accel: 305, vMax: 425, revMax: 110, brake: 640, coast: 90,  steer: 3.1, grip: 9.5, gripHand: 2.6, w: 44, h: 20, hp: 100, mass: 0.9, price: 0 },
  bike:     { accel: 335, vMax: 435, revMax: 110, brake: 570, coast: 80,  steer: 3.4, grip: 7.5, gripHand: 2.0, w: 32, h: 14, hp: 70,  mass: 0.45, price: 0 },
  pickup:   { accel: 185, vMax: 275, revMax: 85,  brake: 490, coast: 120, steer: 2.4, grip: 7.0, gripHand: 2.0, w: 50, h: 23, hp: 160, mass: 1.3, price: 0 },
  van:      { accel: 155, vMax: 245, revMax: 80,  brake: 460, coast: 130, steer: 2.2, grip: 6.5, gripHand: 1.8, w: 54, h: 24, hp: 180, mass: 1.5, price: 0 },
  delivery: { accel: 170, vMax: 255, revMax: 80,  brake: 480, coast: 125, steer: 2.3, grip: 6.8, gripHand: 1.9, w: 56, h: 24, hp: 200, mass: 1.6, price: 0 },
  truck:    { accel: 135, vMax: 215, revMax: 70,  brake: 430, coast: 140, steer: 1.9, grip: 6.0, gripHand: 1.6, w: 66, h: 26, hp: 220, mass: 1.9, price: 0 },
  police:   { accel: 295, vMax: 405, revMax: 110, brake: 650, coast: 95,  steer: 3.2, grip: 9.0, gripHand: 2.6, w: 46, h: 22, hp: 160, mass: 1.1, price: 0 },
  rival:    { accel: 290, vMax: 410, revMax: 105, brake: 610, coast: 90,  steer: 3.0, grip: 9.2, gripHand: 2.5, w: 44, h: 20, hp: 120, mass: 0.95, price: 0 },
};

export const VEHICLE_NAMES = {
  sedan: 'Solmar Sedan', taxi: 'City Taxi', sports: 'Vortex GT', bike: 'Street Bike',
  pickup: 'Dune Pickup', van: 'Cargo Van', delivery: 'Courier Van', truck: 'Haul Truck',
  police: 'SPD Interceptor', rival: 'Kings Runner',
};

// Wanted tuning. Heat is a 0..100 meter per star band; a crime adds heat
// only when a witness (pedestrian or cop) can see it or a camera does.
// CHASE_CARS is how many police cars hunt at each star level.
export const WANTED = {
  HEAT_PER_STAR: [0, 25, 50, 70, 85, 100, 115],
  CHASE_CARS: [0, 1, 2, 3, 4, 5, 6],
  HIDE_TIME: [0, 20, 28, 38, 52, 70, 90],
  SIGHT_RANGE: 540,
  CRIME_RADIUS: 430,
  HELI_STARS: 5,
  HELI_LEAVE_STARS: 3,
  HELI_SPOT_RADIUS: 270,
  HELI_COVER_SECONDS: 6,
  CRIME: { stealCar: 26, punch: 14, shoot: 26, killPed: 42, killCop: 65, runOver: 24, explosion: 30, robbery: 55 },
  // Evidence: each kind of proof the police hold about you. Each clears
  // its own way (see wanted.js): change outfit, change car, leave the hot
  // area, wait out the CCTV tape, ditch the weapon.
  EVIDENCE_KINDS: ['cctv', 'outfit', 'face', 'car', 'weapon'],
};

export const WEATHER = {
  CLEAR: 'clear', RAIN: 'rain', FOG: 'fog',
  RAIN_GRIP: 0.78, FOG_GRIP: 0.9,
};

// Money and progression.
export const ECONOMY = {
  START_CASH: 120,
  TAXI_FARE: 45,
  PACKAGE_CASH: 40,
  PISTOL_PRICE: 350,
  SHOTGUN_PRICE: 800,
  AMMO_PRICE: 60,
  AMMO_PACK: 24,
  ARMOR_PRICE: 220,
  SPRAY_PRICE: 150,
  HEAL_PRICE: 80,
  BRIBE_PER_STAR: 200,
  PICKUP_COUNT: 12,
};

export const DAY_LENGTH = 240; // seconds per full day/night cycle
export const SAVE_KEY = 'solmar-nights-save-v23';
export const SETTINGS_KEY = 'solmar-nights-settings-v23';
export const BEST_KEY = 'solmar-nights-best-v23';
