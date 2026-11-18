// SOLMAR NIGHTS — render.js
// Every pixel of Solmar is drawn here: the city, the cars and people, the
// helicopter, the weather, and the whole HUD — wanted stars, the five
// evidence icons, health, money, mission objective and the minimap.
// The minimap lives top-right; the evidence row lives top-left under the
// stars, so the two never overlap.

import { WORLD_SIZE, ROAD_LINES, ROAD_WIDTH, VEHICLES, WEAPONS, DISTRICTS } from './config.js';
import { districtAt, lightState } from './city.js';
import { clamp } from './physics.js';
import { EVIDENCE_LABELS as EV_LABELS } from './wanted.js';

const OUTFIT_COLORS = ['#c94a4a', '#2f6a8a', '#3d8a4a', '#8a6a3d'];

export function drawWorld(ctx, world, w, h) {
  const cam = world.camera;
  const vw = w, vh = h;
  ctx.save();
  ctx.clearRect(0, 0, vw, vh);

  // ---- ground: district tint ------------------------------------------
  ctx.fillStyle = '#7a9a5a';
  ctx.fillRect(0, 0, vw, vh);
  const x0 = Math.max(0, Math.floor(cam.x) - 40), y0 = Math.max(0, Math.floor(cam.y) - 40);
  const x1 = Math.min(WORLD_SIZE, cam.x + vw + 40), y1 = Math.min(WORLD_SIZE, cam.y + vh + 40);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  for (const d of DISTRICTS) {
    ctx.fillStyle = groundColor(d.id);
    ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
  }
  // Beach sand + sea.
  ctx.fillStyle = '#d9c48a';
  ctx.fillRect(0, 3568, WORLD_SIZE, 152);
  ctx.fillStyle = '#2f7a9a';
  ctx.fillRect(0, 3720, WORLD_SIZE, 120);
  ctx.fillStyle = '#2f7a9a';
  ctx.fillRect(3660, 2560, 180, 1160);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 3720); ctx.lineTo(WORLD_SIZE, 3720); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3660, 2560); ctx.lineTo(3660, 3720); ctx.stroke();

  // ---- parks ------------------------------------------------------------
  for (const park of world.city.parks) {
    if (!onScreen(park, cam, vw, vh)) continue;
    ctx.fillStyle = '#5a8a4a';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.strokeStyle = '#4a7a3d'; ctx.lineWidth = 4;
    ctx.strokeRect(park.x, park.y, park.w, park.h);
  }

  // ---- roads ------------------------------------------------------------
  ctx.fillStyle = '#3a3d44';
  for (const l of ROAD_LINES) {
    ctx.fillRect(l - ROAD_WIDTH / 2, 0, ROAD_WIDTH, WORLD_SIZE);
    ctx.fillRect(0, l - ROAD_WIDTH / 2, WORLD_SIZE, ROAD_WIDTH);
  }
  // Sidewalks.
  ctx.fillStyle = '#9a9a92';
  for (const l of ROAD_LINES) {
    ctx.fillRect(l - ROAD_WIDTH / 2 - 14, 0, 14, WORLD_SIZE);
    ctx.fillRect(l + ROAD_WIDTH / 2, 0, 14, WORLD_SIZE);
    ctx.fillRect(0, l - ROAD_WIDTH / 2 - 14, WORLD_SIZE, 14);
    ctx.fillRect(0, l + ROAD_WIDTH / 2, WORLD_SIZE, 14);
  }
  // Centre dashes.
  ctx.strokeStyle = '#e8d44a';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  for (const l of ROAD_LINES) {
    ctx.beginPath(); ctx.moveTo(l, 0); ctx.lineTo(l, WORLD_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, l); ctx.lineTo(WORLD_SIZE, l); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(240,240,240,0.75)';
  for (const lx of ROAD_LINES) for (const ly of ROAD_LINES) {
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(lx + i * 18 - 6, ly - ROAD_WIDTH / 2 - 8, 12, 16);
      ctx.fillRect(lx + i * 18 - 6, ly + ROAD_WIDTH / 2 - 8, 12, 16);
      ctx.fillRect(lx - ROAD_WIDTH / 2 - 8, ly + i * 18 - 6, 16, 12);
      ctx.fillRect(lx + ROAD_WIDTH / 2 - 8, ly + i * 18 - 6, 16, 12);
    }
  }

  // ---- piers ------------------------------------------------------------
  for (const pier of world.city.piers) {
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2;
    ctx.strokeRect(pier.x, pier.y, pier.w, pier.h);
  }

  // ---- buildings --------------------------------------------------------
  for (const b of world.city.buildings) {
    if (!onScreen(b, cam, vw, vh)) continue;
    // Height shadow, cast south-east.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + b.height * 3, b.y + b.height * 3, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    // Windows along the walls.
    ctx.fillStyle = '#ffd94a';
    const cols = Math.max(2, Math.floor(b.w / 42));
    const rows = Math.max(2, Math.floor(b.h / 42));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if ((i * 7 + j * 3 + b.height) % 4 === 0) continue;
      ctx.fillRect(b.x + 10 + i * ((b.w - 20) / cols), b.y + 10 + j * ((b.h - 20) / rows), 8, 10);
    }
    if (b.height >= 5) {
      ctx.fillStyle = '#c23b2e';
      ctx.fillRect(b.x + b.w / 2 - 4, b.y + b.h / 2 - 4, 8, 8);
    }
  }

  // ---- trees & lamps ----------------------------------------------------
  for (const t of world.city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = '#2f5a2f';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a8a3d';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  for (const lamp of world.city.lamps) {
    if (lamp.x < x0 || lamp.x > x1 || lamp.y < y0 || lamp.y > y1) continue;
    ctx.fillStyle = '#4a4d55';
    ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
  }

  // ---- traffic lights ---------------------------------------------------
  for (const l of world.city.lights) {
    if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
    const state = lightState(l, world.timeHours * 3600 / 10);
    ctx.fillStyle = '#22242a';
    ctx.fillRect(l.x + 52, l.y - 34, 12, 28);
    ctx.fillStyle = state === 'h' ? '#3dc94a' : '#c23b2e';
    ctx.beginPath(); ctx.arc(l.x + 58, l.y - 20, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22242a';
    ctx.fillRect(l.x - 64, l.y + 6, 12, 28);
    ctx.fillStyle = state === 'v' ? '#3dc94a' : '#c23b2e';
    ctx.beginPath(); ctx.arc(l.x - 58, l.y + 20, 4, 0, Math.PI * 2); ctx.fill();
  }

  // ---- shops & packages -------------------------------------------------
  for (const s of world.city.shops) {
    if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - 44, s.y - 26, 88, 52);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.name, s.x, s.y + 4);
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(s.x, s.y - 34, 5, 0, Math.PI * 2); ctx.fill();
  }
  for (const pkg of world.city.packages) {
    if (pkg.found) continue;
    if (pkg.x < x0 || pkg.x > x1 || pkg.y < y0 || pkg.y > y1) continue;
    const pulse = 0.6 + 0.4 * Math.sin(world.timeHours * 20 + pkg.x);
    ctx.fillStyle = `rgba(255,217,74,${pulse})`;
    ctx.beginPath(); ctx.arc(pkg.x, pkg.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(pkg.x - 6, pkg.y - 5, 12, 10);
  }

  // ---- roadblocks -------------------------------------------------------
  for (const rb of world.roadblocks) {
    ctx.fillStyle = '#c23b2e';
    ctx.fillRect(rb.x - 60, rb.y - 12, 120, 24);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) ctx.fillRect(rb.x - 56 + i * 20, rb.y - 12, 10, 24);
  }

  // ---- cars -------------------------------------------------------------
  for (const car of world.cars) {
    if (car.x < x0 - 80 || car.x > x1 + 80 || car.y < y0 - 80 || car.y > y1 + 80) continue;
    drawCar(ctx, car);
  }

  // ---- pedestrians ------------------------------------------------------
  for (const ped of world.peds) {
    if (ped.x < x0 || ped.x > x1 || ped.y < y0 || ped.y > y1) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.skin, ped.shirt, ped.state === 'flee');
    if (ped.phoneTimer > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('📱', ped.x, ped.y - 24);
    }
  }

  // ---- taxi client ------------------------------------------------------
  if (world.taxi.waiting && !world.taxi.active) {
    const t = world.taxi.waiting;
    if (t.x > x0 && t.x < x1 && t.y > y0 && t.y < y1) {
      drawPerson(ctx, t.x, t.y, -Math.PI / 2, '#e8b88a', '#e8b90a', false);
      ctx.fillStyle = '#ffd94a';
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('$ TAXI', t.x, t.y - 26);
    }
  }

  // ---- enemies ----------------------------------------------------------
  for (const e of world.enemies) {
    drawPerson(ctx, e.x, e.y, e.angle, '#d98a5a', e.shirt, false);
    ctx.fillStyle = e.kind === 'enforcer' ? '#c9a227' : '#c23b2e';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(e.kind === 'enforcer' ? '★ ENFORCER' : 'SALT KINGS', e.x, e.y - 24);
    drawHealthBar(ctx, e.x, e.y - 32, e.health, e.kind === 'enforcer' ? 220 : 80);
    drawGun(ctx, e.x, e.y, e.angle);
  }

  // ---- cops -------------------------------------------------------------
  for (const c of world.cops) {
    if (c.onFoot) {
      drawPerson(ctx, c.x, c.y, c.angle, '#e8b88a', '#1c2f4a', false);
      ctx.fillStyle = '#7ab5ff';
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('SPPD', c.x, c.y - 24);
    }
  }

  // ---- player -----------------------------------------------------------
  const p = world.player;
  if (p.car) {
    // Drawn already in the cars loop (it is in world.cars).
  } else {
    drawPerson(ctx, p.x, p.y, p.angle, '#d98a5a', OUTFIT_COLORS[p.outfit], p.running);
    // Aim direction tick.
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aimAngle) * 16, p.y + Math.sin(p.aimAngle) * 16);
    ctx.lineTo(p.x + Math.cos(p.aimAngle) * 30, p.y + Math.sin(p.aimAngle) * 30);
    ctx.stroke();
    if (p.weapon !== 'fists') drawGun(ctx, p.x, p.y, p.aimAngle);
  }

  // ---- mission marker ---------------------------------------------------
  const step = world.missions.stepDef();
  if (step && (step.x !== undefined)) {
    const bob = Math.sin(world.timeHours * 30) * 6;
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(step.x, step.y, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.moveTo(step.x, step.y - 52 + bob);
    ctx.lineTo(step.x - 10, step.y - 34 + bob);
    ctx.lineTo(step.x + 10, step.y - 34 + bob);
    ctx.closePath(); ctx.fill();
  }
  if (world.taxi.active && world.taxi.fare) {
    const f = world.taxi.fare;
    ctx.strokeStyle = '#e8b90a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.destX, f.destY, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e8b90a';
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('$', f.destX, f.destY + 5);
  }

  // ---- bullets & particles ----------------------------------------------
  for (const b of world.bullets) {
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const pt of world.particles) {
    ctx.globalAlpha = clamp(pt.life * 2, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  // ---- helicopter -------------------------------------------------------
  if (world.heli.active) {
    const heli = world.heli;
    ctx.save();
    ctx.translate(heli.x, heli.y);
    // Searchlight cone down to the player.
    ctx.fillStyle = 'rgba(255,255,200,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(world.player.x - heli.x - 60, world.player.y - heli.y);
    ctx.lineTo(world.player.x - heli.x + 60, world.player.y - heli.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#22242a';
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 14, heli.angle, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7ab5ff';
    ctx.beginPath(); ctx.ellipse(8, 0, 10, 8, heli.angle, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#22242a'; ctx.lineWidth = 3;
    const spin = world.timeHours * 40;
    ctx.beginPath();
    ctx.moveTo(Math.cos(spin) * 44, Math.sin(spin) * 44);
    ctx.lineTo(-Math.cos(spin) * 44, -Math.sin(spin) * 44);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // ---- day / night & weather (screen space) ------------------------------
  const night = nightFactor(world.timeHours);
  if (night > 0) {
    ctx.fillStyle = `rgba(10,16,48,${(night * 0.45).toFixed(3)})`;
    ctx.fillRect(0, 0, vw, vh);
    // Lamp glow at night.
    ctx.fillStyle = `rgba(255,217,74,${(night * 0.12).toFixed(3)})`;
    for (const lamp of world.city.lamps) {
      const sx = lamp.x - cam.x, sy = lamp.y - cam.y;
      if (sx < -40 || sx > vw + 40 || sy < -40 || sy > vh + 40) continue;
      ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (world.weather.type === 'rain') {
    ctx.strokeStyle = 'rgba(180,200,220,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const rx = (i * 137.5 + world.timeHours * 9000) % vw;
      const ry = (i * 89.3 + world.timeHours * 14000) % vh;
      ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 16);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(60,80,110,0.12)';
    ctx.fillRect(0, 0, vw, vh);
  }
  if (world.weather.type === 'fog') {
    ctx.fillStyle = 'rgba(200,205,210,0.28)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = 'rgba(200,205,210,0.2)';
    ctx.beginPath(); ctx.arc(vw * 0.3, vh * 0.4, 260, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(vw * 0.7, vh * 0.6, 320, 0, Math.PI * 2); ctx.fill();
  }

  // Vignette for the sun-soaked look.
  const grad = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.45, vw / 2, vh / 2, vh * 0.95);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);
  ctx.restore();
}

export function nightFactor(hours) {
  if (hours >= 19 || hours < 6) return 1;
  if (hours >= 17.5) return (hours - 17.5) / 1.5;
  if (hours < 7.5) return (7.5 - hours) / 1.5;
  return 0;
}

function groundColor(id) {
  return {
    downtown: '#8a8a80', commercial: '#9a8a72', suburb: '#8aa86a',
    marina: '#7a9a92', oldtown: '#a89a7a', beach: '#d9c48a',
  }[id] || '#8aa86a';
}

function onScreen(r, cam, vw, vh) {
  return r.x + (r.w || 0) > cam.x - 60 && r.x < cam.x + vw + 60 && r.y + (r.h || 0) > cam.y - 60 && r.y < cam.y + vh + 60;
}

export function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const half = car.len / 2, hw = car.w / 2;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-half + 3, -hw + 4, car.len, car.w);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -half, -hw, car.len, car.w, 9);
  ctx.fill();
  // Cabin / windshield.
  ctx.fillStyle = car.type === 'police' ? '#dfe8f2' : 'rgba(20,28,38,0.85)';
  const cab = car.len * 0.34;
  roundRect(ctx, -cab / 2, -hw + 5, cab, car.w - 10, 5);
  ctx.fill();
  // Headlights + taillights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(half - 4, -hw + 3, 3, 6);
  ctx.fillRect(half - 4, hw - 9, 3, 6);
  ctx.fillStyle = '#c23b2e';
  ctx.fillRect(-half + 1, -hw + 3, 3, 6);
  ctx.fillRect(-half + 1, hw - 9, 3, 6);
  if (car.type === 'police') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-half + 8, -hw + 2, car.len - 16, 5);
    ctx.fillRect(-half + 8, hw - 7, car.len - 16, 5);
    ctx.fillStyle = '#1c2f4a';
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SPPD', 0, 3);
    const blink = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = blink ? '#ff3b30' : '#3b7bff';
    ctx.beginPath(); ctx.arc(-4, -hw + 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = blink ? '#3b7bff' : '#ff3b30';
    ctx.beginPath(); ctx.arc(6, -hw + 2, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#22242a';
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
    ctx.fillStyle = '#ffd94a';
    ctx.fillRect(-8, -hw - 3, 16, 5);
  }
  if (car.playerDriven) {
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 2;
    ctx.strokeRect(-half - 4, -hw - 4, car.len + 8, car.w + 8);
  }
  ctx.restore();
}

export function drawPerson(ctx, x, y, angle, skin, shirt, running) {
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(2, 4, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(angle + Math.PI / 2);
  const bob = running ? Math.sin(performance.now() / 90) * 2 : 0;
  // Legs.
  ctx.fillStyle = '#2a2f38';
  ctx.fillRect(-7, 2 + bob, 5, 12);
  ctx.fillRect(2, 2 - bob, 5, 12);
  // Body.
  ctx.fillStyle = shirt;
  roundRect(ctx, -9, -10, 18, 16, 6);
  ctx.fill();
  // Arms.
  ctx.fillStyle = skin;
  ctx.fillRect(-13, -8 + bob, 4, 12);
  ctx.fillRect(9, -8 - bob, 4, 12);
  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -16, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#22242a';
  ctx.beginPath(); ctx.arc(0, -19, 8, Math.PI, 0); ctx.fill();
  ctx.restore();
}

function drawGun(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#22242a';
  ctx.fillRect(8, -2, 16, 4);
  ctx.restore();
}

function drawHealthBar(ctx, x, y, hp, max) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 18, y, 36, 5);
  ctx.fillStyle = hp > max * 0.4 ? '#3dc94a' : '#c23b2e';
  ctx.fillRect(x - 18, y, 36 * clamp(hp / max, 0, 1), 5);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- HUD ----------------------------------------------------------------
export function drawHUD(ctx, world, w, h) {
  const p = world.player;
  const wanted = world.wanted;
  ctx.save();
  ctx.textAlign = 'left';

  // Wanted stars, top-left.
  ctx.font = 'bold 26px sans-serif';
  for (let i = 0; i < 6; i++) {
    const style = wanted.starStyle(i);
    const x = 18 + i * 30, y = 34;
    if (style === 'empty') {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
      drawStar(ctx, x, y, 11, 'stroke');
    } else if (style === 'hollow') {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      drawStar(ctx, x, y, 11, 'stroke');
    } else if (style === 'red') {
      drawStar(ctx, x, y, 11, '#ff3b30');
    } else if (style === 'dim') {
      drawStar(ctx, x, y, 11, 'rgba(255,255,255,0.35)');
    } else {
      drawStar(ctx, x, y, 11, '#fff');
    }
  }
  // Wanted state label.
  if (wanted.stars > 0) {
    const label = { hollow: 'REPORTED — POLICE EN ROUTE', solid: 'WANTED — PURSUIT ACTIVE', flashing: 'SEARCHING LAST KNOWN POSITION', red: 'HOT AREA — LAY LOW' }[wanted.state] || '';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = wanted.state === 'red' ? '#ff6a5a' : '#fff';
    ctx.fillText(label, 18, 58);
  }
  // Evidence row, top-left under the stars — clear of the minimap.
  ctx.font = 'bold 10px sans-serif';
  let ex = 18;
  for (const ev of EV_LABELS) {
    const on = wanted.evidence[ev.id];
    ctx.fillStyle = on ? 'rgba(255,59,48,0.9)' : 'rgba(0,0,0,0.45)';
    const tw = ctx.measureText(ev.label).width + 12;
    roundRect(ctx, ex, 66, tw, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(ev.label, ex + 6, 79);
    ex += tw + 6;
  }

  // Money + rep, top centre-right of the stars block.
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#7ee787';
  ctx.fillText(`$${world.money.toLocaleString()}`, 18, 116);
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#ffd94a';
  ctx.fillText(`REP ${world.rep}   PACKAGES ${world.packagesFound}/12`, 18, 136);

  // Health + armor, bottom-left.
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 16, h - 58, 220, 42, 8);
  ctx.fill();
  ctx.fillStyle = '#3dc94a';
  ctx.fillRect(28, h - 46, 196 * clamp(p.health / 100, 0, 1), 10);
  ctx.fillStyle = '#7ab5ff';
  ctx.fillRect(28, h - 30, 196 * clamp(p.armor / 100, 0, 1), 6);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`HEALTH ${Math.ceil(p.health)}`, 28, h - 38);
  ctx.fillText('ARMOR', 28, h - 18);

  // Weapon + ammo, bottom-right.
  const wdef = WEAPONS[p.weapon];
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, w - 216, h - 58, 200, 42, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(wdef.name.toUpperCase(), w - 204, h - 34);
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#ffd94a';
  const ammoText = wdef.ammo === Infinity ? '∞' : `${p.mag[p.weapon]} / ${p.reserve[p.weapon]}`;
  ctx.fillText(ammoText, w - 204, h - 18);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.fillText('[Q] switch  [R] reload', w - 120, h - 18);

  // Speed, when driving.
  if (p.car) {
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.18)} mph`, w - 24, h - 76);
    ctx.textAlign = 'left';
  }

  // Mission objective, under the minimap.
  drawMinimap(ctx, world, w, h);
  const mmSize = [150, 210, 300][world.minimapSize];
  const objY = 24 + mmSize + 16;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const obj = world.missions.objectiveText();
  ctx.font = 'bold 13px sans-serif';
  const objW = Math.min(360, ctx.measureText(obj).width + 24);
  roundRect(ctx, w - objW - 16, objY, objW, 44, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd94a';
  ctx.fillText('◆ ' + (world.missions.active ? world.missions.active.mission.title.toUpperCase() : 'SOLMAR'), w - objW - 4, objY + 17);
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  wrapText(ctx, obj, w - objW - 4, objY + 34, objW - 24, 15);

  // Clock + weather + district, top-centre.
  const hh = Math.floor(world.timeHours);
  const mm = Math.floor((world.timeHours - hh) * 60);
  const d = districtAt(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, w / 2 - 150, 12, 300, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${d.name}  •  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  •  ${world.weather.type.toUpperCase()}`, w / 2, 30);
  ctx.textAlign = 'left';

  // Toasts, centre-bottom.
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px sans-serif';
  let ty = h - 96;
  for (const t of world.toasts) {
    ctx.globalAlpha = clamp(t.timer, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const tw = ctx.measureText(t.text).width + 24;
    roundRect(ctx, w / 2 - tw / 2, ty - 18, tw, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(t.text, w / 2, ty);
    ty -= 32;
  }
  ctx.globalAlpha = 1;

  // Centre banner.
  if (world.message) {
    ctx.globalAlpha = clamp(world.message.timer, 0, 1);
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#ffd94a';
    ctx.fillText(world.message.text, w / 2, h * 0.32);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawStar(ctx, x, y, r, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill === 'stroke') ctx.stroke();
  else { ctx.fillStyle = fill; ctx.fill(); }
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

// ---- minimap -------------------------------------------------------------
export function drawMinimap(ctx, world, w, h) {
  const size = [150, 210, 300][world.minimapSize];
  const mx = w - size - 16, my = 16;
  const scale = size / WORLD_SIZE;
  ctx.save();
  ctx.fillStyle = 'rgba(10,16,24,0.78)';
  roundRect(ctx, mx - 6, my - 6, size + 12, size + 12, 10);
  ctx.fill();
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 2;
  ctx.strokeRect(mx - 6, my - 6, size + 12, size + 12);
  ctx.beginPath();
  ctx.rect(mx, my, size, size);
  ctx.clip();
  // Ground.
  ctx.fillStyle = '#5a7a4a';
  ctx.fillRect(mx, my, size, size);
  ctx.fillStyle = '#2f7a9a';
  ctx.fillRect(mx, my + 3720 * scale, size, 120 * scale);
  ctx.fillRect(mx + 3660 * scale, my + 2560 * scale, 180 * scale, 1160 * scale);
  // Roads.
  ctx.fillStyle = '#3a3d44';
  for (const l of ROAD_LINES) {
    ctx.fillRect(mx + (l - ROAD_WIDTH / 2) * scale, my, ROAD_WIDTH * scale, size);
    ctx.fillRect(mx, my + (l - ROAD_WIDTH / 2) * scale, size, ROAD_WIDTH * scale);
  }
  // Buildings.
  ctx.fillStyle = '#8a8a80';
  for (const b of world.city.buildings) {
    ctx.fillRect(mx + b.x * scale, my + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
  }
  // Mission marker.
  const step = world.missions.stepDef();
  if (step && step.x !== undefined) {
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(mx + step.x * scale, my + step.y * scale, 5, 0, Math.PI * 2); ctx.fill();
  }
  // Taxi destination.
  if (world.taxi.active && world.taxi.fare) {
    ctx.fillStyle = '#e8b90a';
    ctx.beginPath(); ctx.arc(mx + world.taxi.fare.destX * scale, my + world.taxi.fare.destY * scale, 5, 0, Math.PI * 2); ctx.fill();
  }
  // Hot area.
  if (world.wanted.state === 'red') {
    ctx.strokeStyle = 'rgba(255,59,48,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx + world.wanted.hotX * scale, my + world.wanted.hotY * scale, 700 * scale, 0, Math.PI * 2); ctx.stroke();
  }
  // Traffic dots.
  ctx.fillStyle = '#e8e8e8';
  for (const car of world.cars) {
    ctx.fillRect(mx + car.x * scale - 1, my + car.y * scale - 1, 2, 2);
  }
  // Cop dots.
  ctx.fillStyle = '#3b7bff';
  for (const c of world.cops) {
    ctx.beginPath(); ctx.arc(mx + c.x * scale, my + c.y * scale, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Enemy dots.
  ctx.fillStyle = '#ff3b30';
  for (const e of world.enemies) {
    ctx.beginPath(); ctx.arc(mx + e.x * scale, my + e.y * scale, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Heli.
  if (world.heli.active) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('H', mx + world.heli.x * scale, my + world.heli.y * scale + 4);
  }
  // Player arrow.
  const p = world.player;
  ctx.save();
  ctx.translate(mx + p.x * scale, my + p.y * scale);
  ctx.rotate(p.angle + Math.PI / 2);
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  // Viewport box.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + world.camera.x * scale, my + world.camera.y * scale, 1280 * scale, 720 * scale);
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('SOLMAR  •  [N] MAP SIZE', mx, my + size + 20);
}

// ---- menus ---------------------------------------------------------------
export function drawTitle(ctx, w, h, selected) {
  ctx.save();
  // Sunset gradient sky over a stylised skyline.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#ff9a3d');
  grad.addColorStop(0.45, '#e85a6a');
  grad.addColorStop(1, '#2f2a5a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath(); ctx.arc(w * 0.72, h * 0.26, 52, 0, Math.PI * 2); ctx.fill();
  // Skyline.
  ctx.fillStyle = 'rgba(30,24,54,0.9)';
  const skyline = [120, 200, 150, 260, 180, 320, 210, 160, 240, 300, 170, 220];
  let sx = 0;
  for (const bh of skyline) {
    ctx.fillRect(sx, h - bh - 90, 110, bh + 90);
    sx += 110;
  }
  ctx.fillStyle = '#ffd94a';
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(20 + ((i * 197) % (w - 40)), h - 90 - ((i * 53) % 260), 5, 7);
  }
  // Sea strip.
  ctx.fillStyle = '#2f7a9a';
  ctx.fillRect(0, h - 90, w, 90);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, h - 90, w, 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 76px sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 18;
  ctx.fillText('SOLMAR', w / 2, h * 0.30);
  ctx.font = 'bold 34px sans-serif';
  ctx.fillStyle = '#ffd94a';
  ctx.fillText('N I G H T S', w / 2, h * 0.30 + 46);
  ctx.shadowBlur = 0;
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('An open-world crime story on the Solmar coast — drive, steal, run jobs for Mara Solis,', w / 2, h * 0.30 + 84);
  ctx.fillText('and stay one step ahead of the SPPD.', w / 2, h * 0.30 + 108);

  const items = ['New Game', 'How to Play', 'Continue', 'Settings'];
  ctx.font = 'bold 22px sans-serif';
  items.forEach((item, i) => {
    const y = h * 0.52 + i * 52;
    if (i === selected) {
      ctx.fillStyle = 'rgba(255,217,74,0.95)';
      roundRect(ctx, w / 2 - 170, y - 28, 340, 40, 20);
      ctx.fill();
      ctx.fillStyle = '#22242a';
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, w / 2 - 170, y - 28, 340, 40, 20);
      ctx.fill();
      ctx.fillStyle = '#fff';
    }
    ctx.fillText((i === selected ? '▸ ' : '') + item, w / 2, y);
  });
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('WASD move / drive  •  Mouse aim  •  Click attack  •  E enter car  •  F interact  •  Q weapon  •  P pause', w / 2, h - 24);
  ctx.restore();
}

export function drawHowTo(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(16,20,32,0.96)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('HOW TO PLAY', 80, 90);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  const lines = [
    'MOVE / DRIVE — WASD or arrows. Shift runs on foot. Steer with A / D while driving.',
    'AIM & FIGHT — Mouse aims, click (or Space) attacks. Q switches weapon, R reloads.',
    'STEAL CARS — Press E next to any car. If it has a driver, they run — and may call the police.',
    'WANTED — 6 stars, 4 states: hollow (reported), solid (chased), flashing (searching),',
    '    red (hot area — police remember your description). Crimes only count when witnessed.',
    'EVIDENCE — CCTV, outfit, face, car, weapon. Clear each its own way: change clothes,',
    '    respray the car, ditch the weapon, leave the hot area, wait out the tape.',
    'POLICE — Patrols, chases, roadblocks at 4+ stars, helicopter at 5+ stars.',
    '    Lose the helicopter under cover, under a roof or between tall buildings.',
    'JOBS — Talk to Mara at Sol Diner (F) to start story missions. 8 jobs, finale at Marina Pier.',
    'MONEY — Taxi fares, hidden packages (12), mission pay. Spend it at gun stores,',
    '    spray shops, diners and clothing stores. [F] interacts, [N] changes map size.',
    'SAVE — Progress saves automatically at mission checkpoints. [P] pauses.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, 80, 140 + i * 32));
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Press ESC / Enter to go back', 80, h - 60);
  ctx.restore();
}

export function drawPause(ctx, w, h, selected) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,24,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('PAUSED', w / 2, h * 0.3);
  const items = ['Resume', 'How to Play', 'Settings', 'Save & Quit to Title'];
  ctx.font = 'bold 20px sans-serif';
  items.forEach((item, i) => {
    const y = h * 0.42 + i * 48;
    if (i === selected) {
      ctx.fillStyle = 'rgba(255,217,74,0.95)';
      roundRect(ctx, w / 2 - 190, y - 26, 380, 38, 19);
      ctx.fill();
      ctx.fillStyle = '#22242a';
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, w / 2 - 190, y - 26, 380, 38, 19);
      ctx.fill();
      ctx.fillStyle = '#fff';
    }
    ctx.fillText(item, w / 2, y);
  });
  ctx.restore();
}

export function drawSettings(ctx, w, h, settings, selected) {
  ctx.save();
  ctx.fillStyle = 'rgba(16,20,32,0.96)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('SETTINGS', 80, 90);
  const rows = [
    `Volume: ${Math.round(settings.volume * 100)}%   (← / → to change)`,
    `Music: ${settings.music ? 'ON' : 'OFF'}   (M to toggle)`,
    `Minimap: ${['Small', 'Medium', 'Large'][settings.minimap]}   (N to change)`,
    `Quality: ${settings.quality}   (L to toggle)`,
  ];
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  rows.forEach((r, i) => {
    if (i === selected) {
      ctx.fillStyle = '#ffd94a';
      ctx.fillText('▸ ' + r, 80, 160 + i * 44);
      ctx.fillStyle = '#fff';
    } else ctx.fillText(r, 80, 160 + i * 44);
  });
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Press ESC / Enter to go back', 80, h - 60);
  ctx.restore();
}

export function drawShop(ctx, world, w, h, selected) {
  const kind = world.shopOpen;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,24,0.75)';
  ctx.fillRect(0, 0, w, h);
  const items = shopItems(kind, world);
  const pw = 460, ph = 110 + items.length * 40;
  const px = w / 2 - pw / 2, py = h / 2 - ph / 2;
  ctx.fillStyle = '#1c2432';
  roundRect(ctx, px, py, pw, ph, 14);
  ctx.fill();
  ctx.strokeStyle = '#ffd94a'; ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(shopTitle(kind), px + 24, py + 40);
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`Cash: $${world.money}`, px + pw - 140, py + 40);
  ctx.font = '16px sans-serif';
  items.forEach((it, i) => {
    const y = py + 76 + i * 40;
    if (i === selected) {
      ctx.fillStyle = 'rgba(255,217,74,0.25)';
      ctx.fillRect(px + 12, y - 22, pw - 24, 32);
      ctx.fillStyle = '#ffd94a';
    } else ctx.fillStyle = '#fff';
    ctx.fillText(it.label, px + 24, y);
    ctx.fillText(`$${it.price}`, px + pw - 90, y);
  });
  ctx.fillStyle = '#aaa';
  ctx.font = '13px sans-serif';
  ctx.fillText('↑ ↓ choose   Enter buy   F / Esc close', px + 24, py + ph - 18);
  ctx.restore();
}

export function shopTitle(kind) {
  return { gun: 'IRONWORKS GUNS', spray: 'CHROMA SPRAY', diner: 'SOL DINER', clothes: 'THREADS & CO' }[kind] || 'SHOP';
}

export function shopItems(kind, world) {
  const P = {
    pistol: 450, pistolAmmo: 60, shotgun: 900, shotgunAmmo: 120,
    smg: 1600, smgAmmo: 180, armor: 250, meal: 40, outfit: 120, bribe: 800, respray: 150,
  };
  if (kind === 'gun') return [
    { id: 'pistol', label: 'P9 Pistol', price: P.pistol },
    { id: 'pistolAmmo', label: 'Pistol ammo ×24', price: P.pistolAmmo },
    { id: 'shotgun', label: 'Riot 12 Shotgun', price: P.shotgun },
    { id: 'shotgunAmmo', label: 'Shotgun shells ×12', price: P.shotgunAmmo },
    { id: 'smg', label: 'Wasp SMG', price: P.smg },
    { id: 'smgAmmo', label: 'SMG ammo ×60', price: P.smgAmmo },
    { id: 'armor', label: 'Body armor', price: P.armor },
  ];
  if (kind === 'spray') return [
    { id: 'respray', label: 'Respray — new colour, clears CAR evidence', price: P.respray },
    { id: 'bribe', label: 'Pay off the heat (clears wanted)', price: P.bribe },
  ];
  if (kind === 'diner') return [
    { id: 'meal', label: 'House special — restores 50 health', price: P.meal },
    { id: 'armor', label: 'Body armor (sold under the counter)', price: P.armor },
  ];
  if (kind === 'clothes') return [
    { id: 'outfit', label: 'New outfit — clears OUTFIT + FACE evidence', price: P.outfit },
  ];
  return [];
}

export function drawGameOver(ctx, w, h, win, stats) {
  ctx.save();
  ctx.fillStyle = win ? 'rgba(20,60,30,0.9)' : 'rgba(40,10,10,0.9)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(win ? 'SOLMAR IS YOURS' : 'BUSTED', w / 2, h * 0.34);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText(win ? 'The Salt Kings are finished. Dana Reyes runs Solmar now.' : 'The SPPD finally caught up with you.', w / 2, h * 0.34 + 40);
  ctx.font = '16px sans-serif';
  ctx.fillText(`Missions done: ${stats.missionsDone}   Cars stolen: ${stats.carsStolen}   Fares: ${stats.fares}`, w / 2, h * 0.5);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Press Enter to return to the title screen', w / 2, h * 0.62);
  ctx.restore();
}
