// SOLMAR NIGHTS — config.js
// Every tunable number for the game lives here so the other modules stay
// free of magic constants. Nothing in this file touches the DOM or the
// network; it is pure data plus a few tiny lookup helpers.

export const WORLD = 3840; // city is WORLD x WORLD world units
export const ROAD_W = 96; // width of a road, kerb to kerb
export const GRID = 480; // distance between road centrelines
export const ROAD0 = 240; // centreline of the first road (both axes)
export const ROAD_COUNT = 8; // roads per axis: 240 .. 3600

// Road centrelines, shared by city generation, traffic and rendering.
export const ROADS = [];
for (let i = 0; i < ROAD_COUNT; i++) ROADS.push(ROAD0 + i * GRID);

// Districts, keyed by block column/row. A block is the square between four
// roads; bx,by run 0..6. The district decides ground colour, building style
// and how dense the buildings are.
export const DISTRICTS = {
  downtown: { name: 'Downtown Solmar', ground: '#3d4a3a', roof: ['#5a6b7d', '#6b7a8c', '#4d5a6b'], tall: true, density: 0.9 },
  commercial: { name: 'Mercado District', ground: '#4a4436', roof: ['#8c7a5a', '#7d6b4d', '#96855f'], tall: false, density: 0.75 },
  suburb: { name: 'Palmera Suburb', ground: '#4d6b3f', roof: ['#a85a4a', '#b06a3a', '#96504a'], tall: false, density: 0.55 },
  marina: { name: 'Marina Bay', ground: '#3a5a66', roof: ['#7d9aa8', '#6b8a99', '#8caab8'], tall: false, density: 0.6 },
  oldtown: { name: 'Old Town', ground: '#5a4a3a', roof: ['#9a6a3a', '#8a5a30', '#a87a45'], tall: false, density: 0.8 },
  beach: { name: 'Solmar Beach', ground: '#c2a878', roof: ['#e8d8a8', '#d8c890'], tall: false, density: 0.15 },
  park: { name: 'Palmera Park', ground: '#3f6b35', roof: ['#5a7d4a'], tall: false, density: 0.05 },
};

// Which district a block belongs to. Downtown sits in the middle, the beach
// hugs the south edge, the marina the east edge, suburb the north-west,
// old town the south-west, commercial the north-east.
export function districtAt(bx, by) {
  if (by >= 6) return 'beach';
  if (bx >= 6 && by >= 3) return 'marina';
  if (bx >= 2 && bx <= 4 && by >= 2 && by <= 4) return 'downtown';
  if (bx <= 1 && by <= 2) return 'suburb';
  if (bx <= 1 && by >= 4) return 'oldtown';
  if (bx === 3 && by === 0) return 'park';
  if (bx >= 5 && by <= 2) return 'commercial';
  return 'suburb';
}

// Ten drivable vehicle kinds. len/wid are in world units (top-down), top is
// max speed in units/second, accel in units/second^2.
export const VEHICLES = {
  sedan: { name: 'Solmar Sedan', len: 86, wid: 40, accel: 260, top: 330, reverse: 120, grip: 2.6, price: 1200, colors: ['#c23b2e', '#2e6bc2', '#d8d8d8', '#3a3a3a', '#2e8c5a'] },
  sport: { name: 'Viento GT', len: 88, wid: 40, accel: 420, top: 470, reverse: 140, grip: 3.4, price: 8500, colors: ['#e8b81a', '#c2181a', '#18a8c2', '#f0f0f0'] },
  taxi: { name: 'Solmar Cab', len: 86, wid: 40, accel: 280, top: 340, reverse: 120, grip: 2.7, price: 2200, colors: ['#f2c018'] },
  van: { name: 'Cargo Van', len: 104, wid: 46, accel: 200, top: 280, reverse: 110, grip: 2.2, price: 3200, colors: ['#d8d8d8', '#4a6b8c', '#8c8c8c'] },
  pickup: { name: 'Rancho Pickup', len: 96, wid: 44, accel: 300, top: 350, reverse: 130, grip: 2.8, price: 3800, colors: ['#7a3a1a', '#2e5a3a', '#5a5a5a'] },
  bike: { name: 'Falcon Bike', len: 64, wid: 22, accel: 460, top: 500, reverse: 60, grip: 4.2, price: 4200, colors: ['#c2181a', '#1a1a1a', '#2e6bc2'] },
  police: { name: 'SMPD Interceptor', len: 88, wid: 42, accel: 380, top: 440, reverse: 140, grip: 3.2, price: 0, colors: ['#1a2a4a'] },
  muscle: { name: 'Barracuda Muscle', len: 92, wid: 44, accel: 360, top: 400, reverse: 130, grip: 2.9, price: 6100, colors: ['#5a1a8c', '#c25a1a', '#1a1a1a'] },
  coupe: { name: 'Luna Coupe', len: 84, wid: 40, accel: 320, top: 380, reverse: 120, grip: 3.0, price: 5400, colors: ['#e88ca8', '#3a8c8c', '#d8d8d8'] },
  delivery: { name: 'Torta Truck', len: 116, wid: 48, accel: 180, top: 260, reverse: 100, grip: 2.0, price: 2800, colors: ['#e8e8e8', '#c2a018'] },
};
export const VEHICLE_KEYS = Object.keys(VEHICLES);

// Weapons. rate is seconds between shots, range in world units.
export const WEAPONS = {
  fist: { name: 'Fists', dmg: 25, rate: 0.45, range: 46, ammo: Infinity, price: 0, auto: false },
  pistol: { name: 'P9 Pistol', dmg: 34, rate: 0.28, range: 520, ammo: 12, price: 450, auto: false },
  shotgun: { name: 'Scattergun', dmg: 22, rate: 0.85, range: 320, ammo: 6, price: 900, auto: false, pellets: 6 },
};
export const WEAPON_KEYS = Object.keys(WEAPONS);

// Shops placed by the city generator (one of each kind, plus extras).
export const SHOP_KINDS = {
  gun: { name: 'Iron & Lead Guns', color: '#c23b2e', blurb: 'F — buy weapons & ammo' },
  spray: { name: 'Chroma Spray Shop', color: '#2e8cc2', blurb: 'F — repaint car ($150), clears CAR evidence' },
  diner: { name: "Rosa's Diner", color: '#e8b81a', blurb: 'F — eat ($25), restores health' },
  clothes: { name: 'Vestir Clothing', color: '#b83a8c', blurb: 'F — change outfit ($80), clears OUTFIT evidence' },
  armor: { name: 'SafeGuard Armor', color: '#3a8c5a', blurb: 'F — body armor ($200)' },
};

// Story missions. Each step is checked by missions.js; the fields are data,
// the logic lives there.
export const MISSIONS = [
  { id: 1, title: 'Welcome to Solmar', giver: 'Mara Solis', text: 'Drive to the Mercado meet and pick up the package.', reward: 300, unlock: 'pistol', steps: [{ type: 'goto', x: 2640, y: 720, label: 'Meet Mara at Mercado' }, { type: 'pickup', x: 2640, y: 720, label: 'Grab the package' }] },
  { id: 2, title: 'Cab Fare', giver: 'Mara Solis', text: 'Steal a cab and drop three fares around town.', reward: 450, unlock: null, steps: [{ type: 'fare', count: 3, label: 'Complete 3 taxi fares' }] },
  { id: 3, title: 'Salt in the Wound', giver: 'Mara Solis', text: 'The Salt Kings are moving product through Old Town. Hit their runners.', reward: 700, unlock: 'shotgun', steps: [{ type: 'kill', count: 5, label: 'Take out 5 Salt Kings runners' }] },
  { id: 4, title: 'Hot Wheels', giver: 'Mara Solis', text: 'Steal the Viento GT from the Marina showroom and lose the cops.', reward: 900, unlock: 'sport', steps: [{ type: 'steal', kind: 'sport', label: 'Steal the Viento GT' }, { type: 'escape', label: 'Lose your wanted level' }] },
  { id: 5, title: 'The Last Delivery', giver: 'Mara Solis', text: 'Deliver the van to the beach house. The Kings will try to stop you.', reward: 1100, unlock: null, steps: [{ type: 'deliver', x: 1200, y: 3600, label: 'Deliver the van to the beach house' }] },
  { id: 6, title: 'Kings Fall', giver: 'Mara Solis', text: 'Ambush the Salt Kings convoy on the east highway.', reward: 1400, unlock: 'muscle', steps: [{ type: 'kill', count: 8, label: 'Wreck the convoy (8 gang members)' }] },
  { id: 7, title: 'Storm Warning', giver: 'Mara Solis', text: 'Survive the hit squads until dawn. Enforcers lead every third wave.', reward: 1800, unlock: null, steps: [{ type: 'survive', waves: 4, label: 'Survive 4 hit-squad waves' }] },
  { id: 8, title: 'Paying the Debt', giver: 'Mara Solis', text: 'Finale: end the Salt Kings at Marina Pier. Bring it home, Dana.', reward: 3000, unlock: null, steps: [{ type: 'goto', x: 3600, y: 2640, label: 'Go to Marina Pier' }, { type: 'kill', count: 10, label: 'Defeat the Salt Kings at the pier' }] },
];

export const HIDDEN_PACKAGES = 12;
export const START_MONEY = 250;
export const SAVE_KEY = 'solmar-nights-save-v2';
