// SOLMAR NIGHTS — render.js
// Everything the player sees: the city, the cars and people in it, the
// weather and day/night light, the HUD with its wanted stars and evidence
// icons, the minimap, and the title / pause / how-to / settings / game-over
// screens. Pure drawing — no simulation happens here.

import { WORLD, ROADS, ROAD_W, VEHICLES, WEAPONS, DISTRICTS, districtAt, SHOP_KINDS, MISSIONS } from './config.js';
import { daylight } from './world.js';
import { objectiveText, currentStep } from './missions.js';
import { clamp } from './physics.js';

const OUTFIT_COLORS = ['#2e6bc2', '#c23b2e', '#2e8c5a', '#e8b81a', '#7a5ac2'];

export function render(ctx, world, input) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (world.screen === 'title') { renderTitle(ctx, world, W, H); return; }
  if (world.screen === 'howto') { renderHowto(ctx, world, W, H); return; }
  if (world.screen === 'settings') { renderSettings(ctx, world, W, H); return; }

  const cam = world.camera;
  const day = daylight(world);
  ctx.save();
  ctx.translate(W / 2 - cam.x, H / 2 - cam.y);
  drawGround(ctx, world);
  drawRoads(ctx, world);
  drawParksAndPier(ctx, world);
  drawShops(ctx, world);
  drawPackages(ctx, world);
  drawMissionMarkers(ctx, world);
  drawBuildings(ctx, world);
  drawTrees(ctx, world);
  drawCars(ctx, world);
  drawPeds(ctx, world);
  drawGangs(ctx, world);
  drawCops(ctx, world);
  drawPlayer(ctx, world);
  drawHeli(ctx, world);
  drawBullets(ctx, world);
  drawParticles(ctx, world);
  drawFare(ctx, world);
  ctx.restore();

  drawWeather(ctx, world, W, H);
  drawNight(ctx, world, W, H, day);
  drawHUD(ctx, world, W, H);
  drawMinimap(ctx, world, W, H);
  drawMessages(ctx, world, W, H);
  if (world.screen === 'pause') renderPause(ctx, world, W, H);
  if (world.screen === 'gameover') renderGameOver(ctx, world, W, H);
  if (world.screen === 'shot') { /* staged scenes still draw the HUD */ }
}

// --- ground -----------------------------------------------------------------
function drawGround(ctx, world) {
  // Base: grass-green outskirts, then one fill per block in its district tone.
  ctx.fillStyle = '#4d6b3f';
  ctx.fillRect(0, 0, WORLD, WORLD);
  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 7; by++) {
      const d = DISTRICTS[districtAt(bx, by)];
      ctx.fillStyle = d.ground;
      ctx.fillRect(ROADS[bx] + ROAD_W / 2, ROADS[by] + ROAD_W / 2, 480 - ROAD_W, 480 - ROAD_W);
    }
  }
  // Beach sand along the south edge, water beyond it.
  ctx.fillStyle = '#c2a878';
  ctx.fillRect(0, 3600 + ROAD_W / 2, WORLD, WORLD - 3600 - ROAD_W / 2);
  ctx.fillStyle = '#2e6b8c';
  ctx.fillRect(0, 3720, WORLD, WORLD - 3720);
  // Marina water along the east edge.
  ctx.fillStyle = '#2e6b8c';
  ctx.fillRect(3720, 0, WORLD - 3720, 3600);
  // Wave lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let y = 3740; y < WORLD; y += 26) {
    ctx.beginPath();
    for (let x = 0; x < WORLD; x += 60) ctx.lineTo(x, y + Math.sin(x / 90 + world.elapsed) * 3);
    ctx.stroke();
  }
}

function drawRoads(ctx, world) {
  // Asphalt.
  ctx.fillStyle = '#33363d';
  for (const r of ROADS) {
    ctx.fillRect(0, r - ROAD_W / 2, WORLD, ROAD_W);
    ctx.fillRect(r - ROAD_W / 2, 0, ROAD_W, WORLD);
  }
  // Sidewalk edging (lighter strips just outside the kerb).
  ctx.fillStyle = '#6b6f78';
  for (const r of ROADS) {
    ctx.fillRect(0, r - ROAD_W / 2 - 10, WORLD, 10);
    ctx.fillRect(0, r + ROAD_W / 2, WORLD, 10);
    ctx.fillRect(r - ROAD_W / 2 - 10, 0, 10, WORLD);
    ctx.fillRect(r + ROAD_W / 2, 0, 10, WORLD);
  }
  // Centre dashes.
  ctx.strokeStyle = '#e8c81a';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (const r of ROADS) {
    ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(WORLD, r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(r, WORLD); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of ROADS) {
    for (const ry of ROADS) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx - 44 + i * 13, ry - ROAD_W / 2 - 14, 7, 12);
        ctx.fillRect(rx - 44 + i * 13, ry + ROAD_W / 2 + 2, 7, 12);
      }
    }
  }
  // Traffic lights.
  for (let ix = 0; ix < ROADS.length; ix++) {
    for (let iy = 0; iy < ROADS.length; iy++) {
      const light = world.city.lights[ix * ROADS.length + iy];
      const cycle = (world.elapsed + light.timer) % 12;
      const vGreen = cycle < 6;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(ROADS[ix] + 52, ROADS[iy] - 58, 10, 22);
      ctx.fillStyle = vGreen ? '#2ee85a' : '#e83a2e';
      ctx.beginPath(); ctx.arc(ROADS[ix] + 57, ROADS[iy] - 52, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = vGreen ? '#e83a2e' : '#2ee85a';
      ctx.beginPath(); ctx.arc(ROADS[ix] + 57, ROADS[iy] - 42, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawParksAndPier(ctx, world) {
  for (const park of world.city.parks) {
    ctx.fillStyle = '#3f7a35';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    // Pond.
    ctx.fillStyle = '#4a90b8';
    ctx.beginPath(); ctx.ellipse(park.x + park.w / 2, park.y + park.h / 2, 70, 46, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Marina pier: wooden boards over the water.
  const pier = world.city.pier;
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  for (let y = pier.y; y < pier.y + pier.h; y += 24) {
    ctx.beginPath(); ctx.moveTo(pier.x, y); ctx.lineTo(pier.x + pier.w, y); ctx.stroke();
  }
  // Moored boats.
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath(); ctx.ellipse(3740, 2100, 26, 12, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c23b2e';
  ctx.beginPath(); ctx.ellipse(3740, 3100, 26, 12, -0.3, 0, Math.PI * 2); ctx.fill();
}

function drawShops(ctx, world) {
  for (const shop of world.city.shops) {
    const kind = SHOP_KINDS[shop.kind];
    ctx.fillStyle = kind.color;
    ctx.fillRect(shop.x - 44, shop.y - 30, 88, 60);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(shop.x - 44, shop.y + 16, 88, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(shop.kind.toUpperCase(), shop.x, shop.y - 36);
    // Door glow.
    ctx.fillStyle = '#ffe89a';
    ctx.fillRect(shop.x - 10, shop.y + 4, 20, 26);
  }
}

function drawPackages(ctx, world) {
  const bob = Math.sin(world.elapsed * 3) * 3;
  for (const pk of world.city.packages) {
    if (pk.found) continue;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = 'rgba(232,184,26,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b81a';
    ctx.fillRect(-9, -7, 18, 14);
    ctx.fillStyle = '#8a6a00';
    ctx.fillRect(-9, -2, 18, 3);
    ctx.restore();
  }
}

function drawMissionMarkers(ctx, world) {
  const m = world.mission;
  // Mission giver: gold M.
  const giver = world.mission.index < 8 ? (world.mission.index === 0 ? { x: 2640, y: 720 } : { x: 720, y: 2640 }) : null;
  if (giver && !m.active) {
    const bob = Math.sin(world.elapsed * 2.5) * 4;
    ctx.fillStyle = '#e8b81a';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('M', giver.x, giver.y - 34 + bob);
    ctx.strokeStyle = '#e8b81a';
    ctx.beginPath(); ctx.arc(giver.x, giver.y, 26, 0, Math.PI * 2); ctx.stroke();
  }
  if (m.marker) {
    const bob = Math.sin(world.elapsed * 4) * 5;
    ctx.fillStyle = '#ffd81a';
    ctx.beginPath();
    ctx.moveTo(m.marker.x, m.marker.y - 52 + bob);
    ctx.lineTo(m.marker.x - 13, m.marker.y - 78 + bob);
    ctx.lineTo(m.marker.x + 13, m.marker.y - 78 + bob);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,216,26,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.marker.x, m.marker.y, 34 + Math.sin(world.elapsed * 4) * 4, 0, Math.PI * 2); ctx.stroke();
  }
  // Taxi fare marker.
  if (world.fare.active) {
    ctx.fillStyle = '#18c2e8';
    ctx.beginPath(); ctx.arc(world.fare.x, world.fare.y - 40, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', world.fare.x, world.fare.y - 36);
  }
}

function drawBuildings(ctx, world) {
  for (const b of world.city.buildings) {
    // Drop shadow (fake height).
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    // Roof detail: AC units / skylights for tall towers.
    if (b.floors > 5) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 14, 28, 28);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 10, b.y + 10, 16, 16);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 8, 16, 16);
    }
    // Lit windows at night.
    const day = daylight(world);
    if (day < 0.6) {
      ctx.fillStyle = 'rgba(255,220,120,0.85)';
      const cols = Math.floor(b.w / 26), rows = Math.floor(b.h / 26);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (((i * 7 + j * 13 + b.floors) % 5) < 2) {
            ctx.fillRect(b.x + 10 + i * 26, b.y + 10 + j * 26, 8, 10);
          }
        }
      }
    }
  }
}

function drawTrees(ctx, world) {
  for (const t of world.city.trees) {
    ctx.fillStyle = t.palm ? '#7a5a2e' : '#2e5a2e';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.palm ? '#5a8c3a' : '#3f7a35';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.75, 0, Math.PI * 2); ctx.fill();
  }
}
// --- cars, people, effects --------------------------------------------------
function drawCarShape(ctx, x, y, angle, def, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const L = def.len, Wd = def.wid;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-L / 2 + 4, -Wd / 2 + 5, L, Wd);
  ctx.fillStyle = color;
  roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 10);
  ctx.fill();
  // Windshield + rear window.
  ctx.fillStyle = '#1a2a3a';
  ctx.fillRect(L * 0.08, -Wd / 2 + 4, L * 0.16, Wd - 8);
  ctx.fillRect(-L * 0.34, -Wd / 2 + 4, L * 0.12, Wd - 8);
  // Roof.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-L * 0.22, -Wd / 2 + 6, L * 0.28, Wd - 12);
  if (opts.police) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-L * 0.22, -Wd / 2 + 6, L * 0.28, Wd - 12);
    ctx.fillStyle = '#1a2a4a';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SMPD', 0, 4);
    ctx.fillStyle = '#e83a2e';
    ctx.fillRect(-6, -Wd / 2 - 2, 5, 4);
    ctx.fillStyle = '#2e6be8';
    ctx.fillRect(1, -Wd / 2 - 2, 5, 4);
  }
  if (opts.taxi) {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
    ctx.fillStyle = '#e8b81a';
    ctx.fillRect(-8, -Wd / 2 - 4, 16, 5);
  }
  // Headlights.
  ctx.fillStyle = '#fff8c2';
  ctx.fillRect(L / 2 - 3, -Wd / 2 + 5, 4, 6);
  ctx.fillRect(L / 2 - 3, Wd / 2 - 11, 4, 6);
  ctx.restore();
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

function drawCars(ctx, world) {
  for (const car of world.cars) {
    const def = VEHICLES[car.kind];
    const opts = {};
    if (car.kind === 'police') opts.police = true;
    if (car.kind === 'taxi') opts.taxi = true;
    drawCarShape(ctx, car.x, car.y, car.angle, def, car.color, opts);
    if (car.missionTarget) {
      ctx.strokeStyle = '#ffd81a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(car.x, car.y, def.len * 0.75, 0, Math.PI * 2); ctx.stroke();
    }
    if (car.honk > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', car.x, car.y - def.wid);
    }
    // Damage smoke.
    if (car.hp < 45) {
      ctx.fillStyle = 'rgba(120,120,120,0.6)';
      ctx.beginPath(); ctx.arc(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 8 + Math.sin(world.elapsed * 9) * 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawPerson(ctx, x, y, angle, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Body.
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, opts.big ? 17 : 13, 0, Math.PI * 2); ctx.fill();
  // Head.
  ctx.fillStyle = '#e8b88c';
  ctx.beginPath(); ctx.arc(9, 0, 7, 0, Math.PI * 2); ctx.fill();
  // Direction tick (facing).
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(20, 0); ctx.stroke();
  if (opts.weapon) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(12, -2, 14, 4);
  }
  if (opts.enforcer) {
    ctx.strokeStyle = '#c2a018';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  if (opts.label) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(opts.label, x, y - 24);
  }
}

function drawPeds(ctx, world) {
  for (const pd of world.peds) {
    if (pd.hp <= 0) continue;
    drawPerson(ctx, pd.x, pd.y, pd.angle, pd.color, { label: pd.state === 'flee' ? '!' : null });
  }
}

function drawGangs(ctx, world) {
  for (const m of world.gangs.active) {
    if (m.hp <= 0) continue;
    drawPerson(ctx, m.x, m.y, m.angle, m.color, { big: m.isEnforcer, enforcer: m.isEnforcer, weapon: true, label: m.isEnforcer ? 'ENFORCER' : null });
    // HP bar for enforcers.
    if (m.isEnforcer) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(m.x - 22, m.y - 34, 44, 5);
      ctx.fillStyle = '#e83a2e';
      ctx.fillRect(m.x - 22, m.y - 34, 44 * (m.hp / 220), 5);
    }
  }
}

function drawCops(ctx, world) {
  for (const cop of world.cops) {
    if (cop.hp <= 0) continue;
    if (cop.car) continue; // the car itself is drawn in drawCars
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#1a2a4a', { weapon: true, label: 'SMPD' });
  }
}

function drawPlayer(ctx, world) {
  const p = world.player;
  if (p.dead || p.inCar) return;
  const color = OUTFIT_COLORS[p.outfit % OUTFIT_COLORS.length];
  drawPerson(ctx, p.x, p.y, p.angle, color, { weapon: p.weapon !== 'fist', big: true });
  // Aim line (short, subtle).
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22);
  ctx.lineTo(p.x + Math.cos(p.angle) * 40, p.y + Math.sin(p.angle) * 40);
  ctx.stroke();
  // Name tag.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DANA', p.x, p.y - 26);
}

function drawHeli(ctx, world) {
  const h = world.heli;
  if (!h.active) return;
  // Ground shadow + searchlight cone.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(h.x, h.y, 46, 30, 0, 0, Math.PI * 2); ctx.fill();
  const grad = ctx.createRadialGradient(h.x, h.y, 10, h.x, h.y, 190);
  grad.addColorStop(0, 'rgba(255,255,200,0.30)');
  grad.addColorStop(1, 'rgba(255,255,200,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(h.x, h.y, 190, 0, Math.PI * 2); ctx.fill();
  // Body (drawn large, with a white outline so it reads against rooftops).
  ctx.save();
  ctx.translate(h.x, h.y - 26);
  ctx.rotate(h.angle);
  ctx.fillStyle = '#e8e8e8';
  roundRect(ctx, -36, -16, 72, 32, 12);
  ctx.fill();
  ctx.fillStyle = '#1a2a4a';
  roundRect(ctx, -32, -12, 64, 24, 10);
  ctx.fill();
  ctx.fillStyle = '#8cb8d8';
  ctx.fillRect(14, -8, 14, 16);
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-40, 0); ctx.stroke();
  ctx.restore();
  // Rotor blur.
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(h.x, h.y - 26, 42, world.elapsed * 30, world.elapsed * 30 + Math.PI); ctx.stroke();
}

function drawBullets(ctx, world) {
  ctx.fillStyle = '#ffe89a';
  for (const b of world.bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawParticles(ctx, world) {
  for (const pt of world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawFare(ctx, world) {
  // Off-screen objective arrow at the screen edge.
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const cam = world.camera;
  const target = world.mission.marker || (world.fare.active ? { x: world.fare.x, y: world.fare.y } : null);
  if (!target) return;
  const sx = target.x - (cam.x - W / 2), sy = target.y - (cam.y - H / 2);
  if (sx > 0 && sx < W && sy > 0 && sy < H) return;
  const cx = clamp(sx, 40, W - 40), cy = clamp(sy, 40, H - 40);
  const a = Math.atan2(sy - H / 2, sx - W / 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = '#ffd81a';
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// --- atmosphere ---------------------------------------------------------------
function drawWeather(ctx, world, W, H) {
  if (world.weather.type === 'rain') {
    ctx.strokeStyle = 'rgba(180,200,220,0.5)';
    ctx.lineWidth = 1;
    for (const d of world.rainDrops) {
      d.y += d.s * 0.016;
      d.x -= d.s * 0.004;
      if (d.y > H) { d.y = -10; d.x = Math.random() * W; }
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 4, d.y + 14); ctx.stroke();
    }
  }
  if (world.weather.type === 'fog') {
    ctx.fillStyle = 'rgba(200,200,200,0.16)';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawNight(ctx, world, W, H, day) {
  if (day >= 0.95) return;
  const dark = (1 - day) * 0.55;
  ctx.fillStyle = `rgba(8,10,28,${dark.toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
}

// --- HUD ----------------------------------------------------------------------
function drawHUD(ctx, world, W, H) {
  const p = world.player;
  const w = world.wanted;
  // Top-left: money + health/armor.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 12, 12, 250, 64, 8); ctx.fill();
  ctx.fillStyle = '#7ae88c';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${p.money.toLocaleString()}`, 24, 40);
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.fillText(`Rep ${world.stats.reputation}   Jobs ${world.mission.completedCount}/8   📦 ${world.stats.packages}/12`, 24, 60);
  // Health bar.
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(24, 66, 150, 8);
  ctx.fillStyle = p.hp > 30 ? '#2ee85a' : '#e83a2e';
  ctx.fillRect(24, 66, 150 * (p.hp / 100), 8);
  if (p.armor > 0) {
    ctx.fillStyle = '#2e6bc2';
    ctx.fillRect(178, 66, 60 * (p.armor / 100), 8);
  }
  // Top-right: wanted stars.
  drawStars(ctx, world, W - 16, 24);
  // Evidence icons under the stars.
  const ev = w.evidence;
  const icons = [
    ['CCTV', ev.cctv], ['OUTFIT', ev.outfit], ['FACE', ev.face], ['CAR', ev.car], ['WEAPON', ev.weapon],
  ];
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'right';
  icons.forEach(([label, on], i) => {
    ctx.fillStyle = on ? '#e8b81a' : 'rgba(255,255,255,0.25)';
    ctx.fillText(label, W - 16, 58 + i * 12);
  });
  // Objective line, top centre.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const obj = objectiveText(world.mission);
  ctx.font = 'bold 14px sans-serif';
  const tw = ctx.measureText(obj).width;
  roundRect(ctx, W / 2 - tw / 2 - 12, 12, tw + 24, 26, 8); ctx.fill();
  ctx.fillStyle = '#ffd81a';
  ctx.textAlign = 'center';
  ctx.fillText(obj, W / 2, 30);
  // Bottom-left: weapon + ammo + vehicle.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 12, H - 64, 260, 52, 8); ctx.fill();
  const wdef = WEAPONS[p.weapon];
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  const ammo = wdef.ammo === Infinity ? '∞' : String(p.ammo[p.weapon] ?? 0);
  ctx.fillText(`${wdef.name}  ${ammo}`, 24, H - 40);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#c8c8c8';
  const carText = p.inCar ? `${VEHICLES[p.inCar.kind].name} — ${Math.round(Math.abs(p.inCar.speed) * 2.2)} km/h` : 'On foot — E to steal a car';
  ctx.fillText(carText, 24, H - 22);
  // Bottom-right: clock + weather.
  const h = Math.floor(world.time / 3600), m = Math.floor((world.time % 3600) / 60);
  const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const weatherLabel = world.weather.type === 'rain' ? '🌧 Rain' : world.weather.type === 'fog' ? '🌫 Fog' : '☀ Clear';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, W - 150, H - 64, 138, 52, 8); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(clock, W - 24, H - 40);
  ctx.font = '13px sans-serif';
  ctx.fillText(weatherLabel, W - 24, H - 22);
  // Wanted state label.
  if (w.stars > 0) {
    const label = { hollow: 'REPORTED — police en route', solid: 'PURSUIT — lose the cops!', flashing: 'SEARCHING — stay out of sight', red: 'HOT AREA — they remember you' }[w.state] || '';
    ctx.fillStyle = w.state === 'red' ? '#e83a2e' : '#ffd81a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, 52);
  }
  // Controls hint.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WASD move/drive · Mouse aim · Click attack · E enter car · F interact · Q weapon · N minimap · P pause', W / 2, H - 8);
}

function drawStars(ctx, world, rightX, y) {
  const w = world.wanted;
  ctx.textAlign = 'center';
  for (let i = 0; i < 6; i++) {
    const x = rightX - i * 26;
    const filled = i < w.stars;
    let color = '#888';
    let alpha = 1;
    if (filled) {
      if (w.state === 'hollow') { color = '#fff'; alpha = 0.45; }
      else if (w.state === 'solid') color = '#fff';
      else if (w.state === 'flashing') { color = '#fff'; alpha = (Math.floor(world.elapsed * 4) % 2 === 0) ? 1 : 0.25; }
      else if (w.state === 'red') color = '#e83a2e';
      else color = '#fff';
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = '26px sans-serif';
    ctx.fillText('★', x, y + 8);
    ctx.globalAlpha = 1;
    if (!filled) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeText('★', x, y + 8);
    }
  }
  ctx.textAlign = 'left';
}

function drawMinimap(ctx, world, W, H) {
  const size = [0, 150, 220, 300][world.settings.minimap] ?? 150;
  if (size === 0) return;
  const scale = size / WORLD;
  const x0 = W - size - 12, y0 = 140;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, x0 - 4, y0 - 4, size + 8, size + 8, 8); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, size, size); ctx.clip();
  ctx.fillStyle = '#2a3a2a';
  ctx.fillRect(x0, y0, size, size);
  // Roads.
  ctx.fillStyle = '#55585f';
  for (const r of ROADS) {
    ctx.fillRect(x0, y0 + r * scale - 2, size, 4);
    ctx.fillRect(x0 + r * scale - 2, y0, 4, size);
  }
  // Water.
  ctx.fillStyle = '#2e6b8c';
  ctx.fillRect(x0, y0 + 3720 * scale, size, size - 3720 * scale);
  ctx.fillRect(x0 + 3720 * scale, y0, size - 3720 * scale, size);
  // Shops.
  ctx.fillStyle = '#e8b81a';
  for (const s of world.city.shops) ctx.fillRect(x0 + s.x * scale - 2, y0 + s.y * scale - 2, 4, 4);
  // Mission marker.
  if (world.mission.marker) {
    ctx.fillStyle = '#ffd81a';
    ctx.beginPath(); ctx.arc(x0 + world.mission.marker.x * scale, y0 + world.mission.marker.y * scale, 5, 0, Math.PI * 2); ctx.fill();
  }
  // Cops.
  ctx.fillStyle = '#2e6be8';
  for (const c of world.cops) ctx.fillRect(x0 + c.x * scale - 2, y0 + c.y * scale - 2, 4, 4);
  // Gang.
  ctx.fillStyle = '#c22ae8';
  for (const g of world.gangs.active) ctx.fillRect(x0 + g.x * scale - 2, y0 + g.y * scale - 2, 4, 4);
  // Player.
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x0 + world.player.x * scale, y0 + world.player.y * scale, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e8b81a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x0 + world.player.x * scale, y0 + world.player.y * scale, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // Viewport box.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  const cam = world.camera;
  ctx.strokeRect(x0 + (cam.x - W / 2) * scale, y0 + (cam.y - H / 2) * scale, W * scale, H * scale);
  // Hot area.
  if (world.wanted.hot) {
    ctx.strokeStyle = 'rgba(232,58,46,0.7)';
    ctx.beginPath(); ctx.arc(x0 + world.wanted.hot.x * scale, y0 + world.wanted.hot.y * scale, world.wanted.hot.r * scale, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawMessages(ctx, world, W, H) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px sans-serif';
  let y = 84;
  for (const m of world.messages) {
    ctx.globalAlpha = Math.max(0, 1 - m.t / 6);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const tw = ctx.measureText(m.text).width;
    roundRect(ctx, W / 2 - tw / 2 - 10, y - 16, tw + 20, 22, 6); ctx.fill();
    ctx.fillStyle = m.color;
    ctx.fillText(m.text, W / 2, y);
    y += 26;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// --- screens ------------------------------------------------------------------
function screenBackdrop(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a2a4a');
  g.addColorStop(0.55, '#c26a2e');
  g.addColorStop(1, '#2e1a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Sun + skyline silhouette.
  ctx.fillStyle = '#ffd81a';
  ctx.beginPath(); ctx.arc(W * 0.86, H * 0.2, 46, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(20,16,32,0.85)';
  const skyline = [0.42, 0.55, 0.38, 0.62, 0.5, 0.66, 0.44, 0.58, 0.4];
  let x = 0;
  for (const hgt of skyline) {
    const bw = W / skyline.length;
    ctx.fillRect(x, H - H * hgt, bw * 0.8, H * hgt);
    x += bw;
  }
  ctx.fillStyle = '#2e6b8c';
  ctx.fillRect(0, H - 40, W, 40);
}

function renderTitle(ctx, world, W, H) {
  screenBackdrop(ctx, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SOLMAR NIGHTS', W / 2, H * 0.26);
  ctx.fillStyle = '#ffd81a';
  ctx.font = '20px sans-serif';
  ctx.fillText('An open-world crime story on the Solmar coast', W / 2, H * 0.26 + 34);
  const items = ['New Game', 'How to Play', world.hasSave ? 'Continue' : 'Continue (no save)', 'Settings'];
  ctx.font = 'bold 22px sans-serif';
  items.forEach((label, i) => {
    const y = H * 0.48 + i * 44;
    const selected = world.titleChoice === i;
    if (selected) {
      ctx.fillStyle = 'rgba(255,216,26,0.9)';
      roundRect(ctx, W / 2 - 170, y - 28, 340, 38, 8); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
    } else {
      ctx.fillStyle = '#fff';
    }
    ctx.fillText(label, W / 2, y);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '14px sans-serif';
  ctx.fillText('↑↓ choose · Enter start · Dana Reyes vs the Salt Kings · 8 story jobs · 6-star wanted system', W / 2, H - 56);
  ctx.fillText('Drive, steal cars, outrun the SMPD helicopter — and mind the witnesses.', W / 2, H - 34);
  ctx.textAlign = 'left';
}

function renderHowto(ctx, world, W, H) {
  screenBackdrop(ctx, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, W / 2 - 360, 60, 720, H - 140, 12); ctx.fill();
  ctx.fillStyle = '#ffd81a';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HOW TO PLAY', W / 2, 104);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  const lines = [
    'WASD — move on foot / drive a car (W accelerate, S brake/reverse, A/D steer)',
    'Mouse — aim · Click — attack / shoot · Q — switch weapon',
    'E — enter or steal a car (drivers bail; witnesses call the police)',
    'F — interact: shops, the mission giver (gold M), taxi fares',
    'N — minimap size · P — pause · O — settings · M — mute',
    '',
    'WANTED: crimes only count when witnessed. Stars go 1–6 with four states:',
    '  hollow — reported, police en route but no description yet',
    '  solid white — they see you, active pursuit',
    '  flashing — they lost sight, searching your last seen spot',
    '  red — you escaped, but the area is hot and they remember you',
    'Evidence (CCTV / outfit / face / car / weapon) clears its own way:',
    '  new clothes, respray the car, ditch the weapon, leave the hot area.',
    '',
    'MONEY: jobs for Mara Solis, taxi fares, 12 hidden packages ($100 each).',
    'SHOPS: Iron & Lead (guns), Chroma (respray), Rosa’s Diner (heal),',
    '  Vestir (outfits), SafeGuard (armor). Helicopters come at 5 stars —',
    '  shake them off under a roof or the pier.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, W / 2 - 330, 140 + i * 24));
  ctx.fillStyle = '#ffd81a';
  ctx.textAlign = 'center';
  ctx.fillText('Enter / Esc — back', W / 2, H - 100);
  ctx.textAlign = 'left';
}

function renderSettings(ctx, world, W, H) {
  screenBackdrop(ctx, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, W / 2 - 300, H / 2 - 160, 600, 320, 12); ctx.fill();
  ctx.fillStyle = '#ffd81a';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SETTINGS', W / 2, H / 2 - 116);
  const s = world.settings;
  const rows = [
    `Music: ${s.music ? 'ON' : 'OFF'}  (1)`,
    `Sound effects: ${s.sfx ? 'ON' : 'OFF'}  (2)`,
    `Minimap: ${['OFF', 'SMALL', 'MEDIUM', 'LARGE'][s.minimap]}  (3 / N in game)`,
    `Mute all: ${world.audio.muted ? 'ON' : 'OFF'}  (M)`,
  ];
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  rows.forEach((row, i) => ctx.fillText(row, W / 2, H / 2 - 64 + i * 36));
  ctx.fillStyle = '#ffd81a';
  ctx.font = '14px sans-serif';
  ctx.fillText('Press 1 / 2 / 3 to toggle · Enter / Esc — back', W / 2, H / 2 + 116);
  ctx.textAlign = 'left';
}

function renderPause(ctx, world, W, H) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', W / 2, H / 2 - 60);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = '#c8c8c8';
  const p = world.player;
  ctx.fillText(`$${p.money} · ${world.stats.kills} takedowns · ${world.stats.carsStolen} cars stolen · ${world.stats.fares} fares · Jobs ${world.mission.completedCount}/8`, W / 2, H / 2 - 16);
  ctx.fillStyle = '#ffd81a';
  ctx.fillText('P — resume · O — settings · Enter — save game · Esc — quit to title', W / 2, H / 2 + 24);
  ctx.textAlign = 'left';
}

function renderGameOver(ctx, world, W, H) {
  ctx.fillStyle = 'rgba(40,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e83a2e';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WASTED', W / 2, H / 2 - 30);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText('Dana wakes up at the Solmar clinic, $200 lighter and wiser.', W / 2, H / 2 + 12);
  ctx.fillStyle = '#ffd81a';
  ctx.fillText('Press Enter to get back on your feet', W / 2, H / 2 + 52);
  ctx.textAlign = 'left';
}
