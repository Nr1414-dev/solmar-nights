// SOLMAR NIGHTS — config.js
// Every tuning constant for the city, vehicles, weapons, police and story lives
// here, so balancing never means hunting through game logic.

export const WORLD_SIZE = 3840;
export const ROAD_WIDTH = 96;
export const LANE_OFFSET = 26;
// Road centre lines: a regular grid, so every road is fully drivable end to end.
export const ROAD_LINES = [320, 960, 1600, 2240, 2880, 3520];
export const BLOCK_INSET = 110; // buildings keep this far inside a block, off roads

export const DAY_LENGTH = 240; // seconds for a full day/night cycle
export const START_TIME = 10.2; // hours, late morning

export const PLAYER_WALK_SPEED = 210;
export const PLAYER_RUN_SPEED = 320;
export const PLAYER_HEALTH_MAX = 100;

export const VEHICLES = [
  { id: 'sedan',   name: 'Marlin Sedan',  color: '#4a7fb5', top: 58, accel: 420, max: 560, turn: 2.6, seats: 4 },
  { id: 'sport',   name: 'Vortex GT',     color: '#c23b2e', top: 46, accel: 640, max: 780, turn: 3.1, seats: 2 },
  { id: 'muscle',  name: 'Bison Muscle',  color: '#d97b1e', top: 62, accel: 520, max: 660, turn: 2.5, seats: 2 },
  { id: 'taxi',    name: 'Solmar Taxi',   color: '#e8b90a', top: 58, accel: 440, max: 580, turn: 2.7, seats: 4 },
  { id: 'van',     name: 'Cargo Van',     color: '#8a8f96', top: 96, accel: 320, max: 460, turn: 2.1, seats: 3 },
  { id: 'bike',    name: 'Stinger Bike',  color: '#2e8b6a', top: 40, accel: 700, max: 820, turn: 3.6, seats: 1 },
  { id: 'pickup',  name: 'Rancho Pickup', color: '#6b4fa1', top: 78, accel: 460, max: 600, turn: 2.4, seats: 3 },
  { id: 'police',  name: 'SPPD Cruiser',  color: '#1c2f4a', top: 58, accel: 560, max: 720, turn: 3.0, seats: 4 },
  { id: 'limo',    name: 'Palmera Limo',  color: '#22242a', top: 118, accel: 380, max: 560, turn: 2.0, seats: 6 },
  { id: 'compact', name: 'Pip Compact',   color: '#b5c94a', top: 48, accel: 480, max: 600, turn: 3.0, seats: 2 },
];

export const WEAPONS = {
  fists:   { name: 'Fists',    damage: 12, rate: 0.38, range: 46,  ammo: Infinity, auto: false, spread: 0 },
  pistol:  { name: 'P9 Pistol', damage: 22, rate: 0.24, range: 520, ammo: 12, auto: false, spread: 0.05 },
  shotgun: { name: 'Riot 12',  damage: 16, rate: 0.85, range: 300, ammo: 6,  auto: false, spread: 0.22, pellets: 6 },
  smg:     { name: 'Wasp SMG', damage: 11, rate: 0.09, range: 420, ammo: 30, auto: true,  spread: 0.11 },
};

export const SHOP_PRICES = {
  pistol: 450, pistolAmmo: 60, shotgun: 900, shotgunAmmo: 120, smg: 1600, smgAmmo: 180,
  armor: 250, respray: 150, meal: 40, outfit: 120, bribe: 800,
};

export const WANTED = {
  maxStars: 6,
  reportDelay: 4.0,      // seconds a witness needs on the phone before police know
  loseSightTime: 6.0,    // seconds unseen before solid -> flashing
  searchTime: 25.0,      // seconds police search last-known position
  hotTime: 60.0,         // seconds a red hot area stays hot
  heliStars: 5,
  roadblockStars: 4,
};

export const DISTRICTS = [
  { id: 'downtown', name: 'Downtown',   x0: 1280, y0: 1280, x1: 2560, y1: 2560, tall: true,  hue: '#3d5a78' },
  { id: 'commercial', name: 'Mercado District', x0: 0, y0: 1280, x1: 1280, y1: 2560, tall: false, hue: '#7a5a3d' },
  { id: 'suburb',  name: 'Palmera Suburb', x0: 2560, y0: 0, x1: 3840, y1: 1280, tall: false, hue: '#4a7a3d' },
  { id: 'marina',   name: 'Marina Bay', x0: 2560, y0: 2560, x1: 3840, y1: 3840, tall: false, hue: '#2f6a7a' },
  { id: 'oldtown',  name: 'Old Town',   x0: 0, y0: 0,    x1: 1280, y1: 1280, tall: false, hue: '#8a6a4a' },
  { id: 'beach',    name: 'Solmar Beach', x0: 0, y0: 3520, x1: 2560, y1: 3840, tall: false, hue: '#c9b078' },
];

export const SHOPS = [
  { id: 'gun',    kind: 'gun',    name: 'IRONWORKS GUNS',  x: 1690, y: 1180, color: '#8a2f2f' },
  { id: 'spray',  kind: 'spray',  name: 'CHROMA SPRAY',    x: 2330, y: 1500, color: '#2f6a8a' },
  { id: 'diner',  kind: 'diner',  name: 'SOL DINER',       x: 1050, y: 1740, color: '#8a6a2f' },
  { id: 'clothes', kind: 'clothes', name: 'THREADS & CO',   x: 2330, y: 2380, color: '#6a3d8a' },
  { id: 'diner2', kind: 'diner',  name: 'PIER CAFE',       x: 3200, y: 3200, color: '#8a6a2f' },
  { id: 'gun2',   kind: 'gun',    name: 'HARBOUR ARMS',    x: 3200, y: 1050, color: '#8a2f2f' },
];

export const GANG = { name: 'Salt Kings', color: '#c9a227', enforcerEveryWave: 3 };

export const MISSION_PAY = [300, 500, 800, 1200, 1500, 2000, 3000, 5000];

export const SAVE_KEY = 'solmar-nights-save-v25';
export const SETTINGS_KEY = 'solmar-nights-settings-v25';
