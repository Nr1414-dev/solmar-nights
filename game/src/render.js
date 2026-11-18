// SOLMAR NIGHTS v2.3 — render.js
// Everything the eye sees: the city from above (roads, roofs, neon,
// palms, beach and docks), the cars and people, the particles, and the
// HUD — wanted stars with their four states, the evidence icons, cash,
// health, the mission objective, the minimap, and every menu screen.
// All drawing is plain canvas 2D; the only images are the favicon.

import { DAY_LENGTH, ROAD_CENTRES, ROAD_W, VIEW_H, VIEW_W, WORLD } from './config.js';
import { districtAt, districtNameAt, isBeach, isOnRoad, isWater, LANDMARKS } from './city.js';
import { missionObjective, missionTarget, MISSIONS } from './missions.js';
import { wantedLabel } from './wanted.js';
import { clamp, dist } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_ENDING = 'ending';
export const SCREEN_SETTINGS = 'settings';

const OUTFIT_COLORS = ['#ffd23e', '#2ecc71', '#e67e22', '#9b59b6'];
const EVIDENCE_LABELS = { cctv: 'CCTV', outfit: 'OUTFIT', face: 'FACE', car: 'CAR', weapon: 'GUN' };

function skyColor(dayTime) {
  const h = (dayTime / 3600) % 24;
  if (h < 5 || h >= 21) return { ground: '#232838', road: '#232338', night: true };
  if (h < 7) return { ground: '#7d6a72', road: '#2e2a3d', night: false };
  if (h < 17) return { ground: '#8fae6b', road: '#3a3a3a', night: false };
  if (h < 19) return { ground: '#a0715e', road: '#33302e', night: false };
  return { ground: '#2a2440', road: '#262636', night: true };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;

  function draw(G, screen, menu, settings) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (screen === SCREEN_TITLE) { drawTitle(G, menu); return; }
    if (screen === SCREEN_HOWTO) { drawHowTo(menu); return; }
    if (screen === SCREEN_SETTINGS) { drawSettings(menu, settings); return; }
    drawWorld(G);
    drawHud(G, settings);
    if (screen === SCREEN_PAUSED) drawPaused(menu);
    if (screen === SCREEN_OVER) drawOver(G, menu);
    if (screen === SCREEN_ENDING) drawEnding(G, menu);
  }

  function drawWorld(G) {
    const cam = G.camera;
    const zoom = cam.zoom;
    const shx = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    const shy = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    ctx.save();
    ctx.translate(VIEW_W / 2 - cam.x * zoom + shx, VIEW_H / 2 - cam.y * zoom + shy);
    ctx.scale(zoom, zoom);
    const sky = skyColor(G.dayTime);
    const vx0 = cam.x - VIEW_W / 2 / zoom - 80;
    const vy0 = cam.y - VIEW_H / 2 / zoom - 80;
    const vx1 = cam.x + VIEW_W / 2 / zoom + 80;
    const vy1 = cam.y + VIEW_H / 2 / zoom + 80;

    // Ground: sand on the west, grass elsewhere, water at the edges.
    ctx.fillStyle = sky.ground;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    ctx.fillStyle = '#d9b96a';
    ctx.fillRect(Math.max(vx0, 150), vy0, Math.min(vx1, 320) - Math.max(vx0, 150), vy1 - vy0);
    ctx.fillStyle = '#1f6fb2';
    ctx.fillRect(vx0, vy0, Math.max(0, 150 - vx0), vy1 - vy0);
    ctx.fillRect(Math.min(vx1, WORLD) - 0, vy0, Math.max(0, vx1 - (WORLD - 150)), vy1 - vy0);
    // Docks on the east edge.
    ctx.fillStyle = '#6b4f2a';
    for (let y = 600; y < WORLD; y += 480) {
      if (y > vy0 && y < vy1) ctx.fillRect(WORLD - 190, y, 60, 90);
    }

    // Parks and plazas.
    for (const park of G.city.parks) {
      if (park.x < vx0 - 200 || park.x > vx1 + 200 || park.y < vy0 - 200 || park.y > vy1 + 200) continue;
      ctx.fillStyle = '#3f7a3a';
      ctx.beginPath(); ctx.arc(park.x, park.y, park.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2c5a28';
      for (let i = 0; i < park.trees; i++) {
        const a = (i / park.trees) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(park.x + Math.cos(a) * park.r * 0.6, park.y + Math.sin(a) * park.r * 0.6, 10, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const f of G.city.fountains) {
      ctx.fillStyle = '#4db2e8';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bfe8ff';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const pl of G.city.plazas) {
      ctx.fillStyle = '#b8a88a';
      ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, Math.PI * 2); ctx.fill();
    }

    drawRoads(G, vx0, vy0, vx1, vy1, sky);
    drawBuildings(G, vx0, vy0, vx1, vy1, sky);
    drawPalms(G, vx0, vy0, vx1, vy1);
    drawPickups(G, vx0, vy0, vx1, vy1);
    drawMissionMarker(G);
    drawPeds(G, vx0, vy0, vx1, vy1, sky);
    drawCars(G, vx0, vy0, vx1, vy1, sky);
    drawCops(G, vx0, vy0, vx1, vy1);
    drawGangs(G, vx0, vy0, vx1, vy1);
    drawPlayer(G, sky);
    drawParticles(G);
    drawHeli(G, sky);
    // Weather veils.
    if (G.weather.fog > 0.05) {
      ctx.fillStyle = `rgba(200,205,215,${G.weather.fog * 0.5})`;
      ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    }
    if (G.weather.rain > 0.05) {
      ctx.strokeStyle = `rgba(180,200,255,${G.weather.rain * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 60; i++) {
        const rx = vx0 + ((i * 137) % (vx1 - vx0));
        const ry = vy0 + ((i * 89 + G.time * 900) % (vy1 - vy0));
        ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 14);
      }
      ctx.stroke();
    }
    // Night: a soft dark veil with the headlights cut out is too costly;
    // a light veil plus glowing windows sells the hour instead.
    if (sky.night) {
      ctx.fillStyle = 'rgba(10,10,40,0.28)';
      ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    }
    ctx.restore();
  }

  function drawRoads(G, vx0, vy0, vx1, vy1, sky) {
    ctx.fillStyle = sky.road;
    for (const c of ROAD_CENTRES) {
      if (c > vy0 - ROAD_W && c < vy1 + ROAD_W) ctx.fillRect(vx0, c - ROAD_W / 2, vx1 - vx0, ROAD_W);
      if (c > vx0 - ROAD_W && c < vx1 + ROAD_W) ctx.fillRect(c - ROAD_W / 2, vy0, ROAD_W, vy1 - vy0);
    }
    // Centre dashes.
    ctx.fillStyle = '#f7d774';
    for (const c of ROAD_CENTRES) {
      for (let v = 0; v < WORLD; v += 80) {
        if (c > vy0 - 40 && c < vy1 + 40 && v > vx0 && v < vx1) ctx.fillRect(v, c - 2, 34, 4);
        if (c > vx0 - 40 && c < vx1 + 40 && v > vy0 && v < vy1) ctx.fillRect(c - 2, v, 4, 34);
      }
    }
    // Sidewalks: lighter strips along every road.
    ctx.fillStyle = 'rgba(220,220,210,0.25)';
    for (const c of ROAD_CENTRES) {
      if (c > vy0 - 80 && c < vy1 + 80) { ctx.fillRect(vx0, c - ROAD_W / 2 - 14, vx1 - vx0, 10); ctx.fillRect(vx0, c + ROAD_W / 2 + 4, vx1 - vx0, 10); }
      if (c > vx0 - 80 && c < vx1 + 80) { ctx.fillRect(c - ROAD_W / 2 - 14, vy0, 10, vy1 - vy0); ctx.fillRect(c + ROAD_W / 2 + 4, vy0, 10, vy1 - vy0); }
    }
    // Traffic lights at intersections.
    for (const cx of ROAD_CENTRES) {
      for (const cy of ROAD_CENTRES) {
        if (cx < vx0 - 60 || cx > vx1 + 60 || cy < vy0 - 60 || cy > vy1 + 60) continue;
        const phase = lightPhaseFor(G, cx, cy);
        ctx.fillStyle = '#222';
        ctx.fillRect(cx - ROAD_W / 2 - 6, cy - ROAD_W / 2 - 6, 8, 20);
        ctx.fillStyle = phase === 'green' ? '#2ecc71' : '#e74c3c';
        ctx.beginPath(); ctx.arc(cx - ROAD_W / 2 - 2, cy - ROAD_W / 2 + (phase === 'green' ? 14 : 4), 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function lightPhaseFor(G, x, y) {
    const idx = (Math.round(x / 480) + Math.round(y / 480)) % 2;
    const phase = (G.time + idx * 7) % 14;
    return phase < 7 ? 'green' : 'red';
  }

  function drawBuildings(G, vx0, vy0, vx1, vy1, sky) {
    for (const b of G.city.buildings) {
      if (b.x + b.w / 2 < vx0 || b.x - b.w / 2 > vx1 || b.y + b.h / 2 < vy0 || b.y - b.h / 2 > vy1) continue;
      const shade = b.shade;
      const base = shadeColor(b.district, shade);
      ctx.fillStyle = base;
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      // Roof detail: a lighter inner slab and a shadow edge.
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(b.x - b.w / 2 + 6, b.y - b.h / 2 + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x - b.w / 2, b.y + b.h / 2 - 6, b.w, 6);
      // Windows glow at night; a few lit by day.
      if (sky.night || b.neon) {
        ctx.fillStyle = sky.night ? '#ffd76a' : 'rgba(255,215,106,0.5)';
        for (let wx = -b.w / 2 + 14; wx < b.w / 2 - 10; wx += 26) {
          for (let wy = -b.h / 2 + 14; wy < b.h / 2 - 10; wy += 26) {
            if (((wx * 7 + wy * 13 + b.x) % 5) < 2) ctx.fillRect(b.x + wx, b.y + wy, 10, 12);
          }
        }
      }
      // Neon sign on some commercial roofs.
      if (b.neon && districtAt(b.x, b.y) !== 'suburb') {
        ctx.fillStyle = ['#ff2e88', '#00e5ff', '#ffd23e'][(b.hue ?? 0) % 3];
        ctx.fillRect(b.x - 16, b.y - b.h / 2 - 4, 32, 4);
      }
      // Height hint: a taller building casts a longer fake shadow.
      if (b.height > 60) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(b.x - b.w / 2 + 10, b.y - b.h / 2 + 10, b.w, b.h);
      }
    }
  }

  function shadeColor(district, shade) {
    const bases = { downtown: [58, 63, 92], commercial: [74, 58, 82], suburb: [61, 74, 58], marina: [47, 74, 85], oldtown: [84, 67, 47], beach: [184, 154, 94] };
    const c = bases[district] ?? bases.commercial;
    return `rgb(${Math.round(c[0] * shade)},${Math.round(c[1] * shade)},${Math.round(c[2] * shade)})`;
  }

  function drawPalms(G, vx0, vy0, vx1, vy1) {
    for (const palm of G.city.palms) {
      if (palm.x < vx0 || palm.x > vx1 || palm.y < vy0 || palm.y > vy1) continue;
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = 3 * palm.s;
      ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(palm.x, palm.y - 14 * palm.s); ctx.stroke();
      ctx.fillStyle = '#2f8f3a';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.ellipse(palm.x + Math.cos(a) * 9 * palm.s, palm.y - 14 * palm.s + Math.sin(a) * 5 * palm.s, 10 * palm.s, 4 * palm.s, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPickups(G, vx0, vy0, vx1, vy1) {
    for (const pk of G.pickups) {
      if (pk.taken || pk.x < vx0 || pk.x > vx1 || pk.y < vy0 || pk.y > vy1) continue;
      const bob = Math.sin(G.time * 3 + pk.id) * 3;
      if (pk.kind === 'package') {
        ctx.fillStyle = '#ffd23e';
        ctx.fillRect(pk.x - 8, pk.y - 8 + bob, 16, 16);
        ctx.fillStyle = '#b8860b';
        ctx.fillRect(pk.x - 8, pk.y - 2 + bob, 16, 3);
      } else if (pk.kind === 'health') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(pk.x - 10, pk.y - 10 + bob, 20, 20);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(pk.x - 3, pk.y - 8 + bob, 6, 16);
        ctx.fillRect(pk.x - 8, pk.y - 3 + bob, 16, 6);
      } else {
        ctx.fillStyle = '#3498db';
        ctx.fillRect(pk.x - 10, pk.y - 10 + bob, 20, 20);
        ctx.fillStyle = '#fff';
        ctx.fillRect(pk.x - 6, pk.y - 2 + bob, 12, 4);
      }
    }
  }

  function drawMissionMarker(G) {
    const t = missionTarget(G);
    if (t) {
      const bob = Math.sin(G.time * 4) * 6;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - 34 + bob);
      ctx.lineTo(t.x - 12, t.y - 58 + bob);
      ctx.lineTo(t.x + 12, t.y - 58 + bob);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, 26 + Math.sin(G.time * 3) * 4, 0, Math.PI * 2); ctx.stroke();
    }
    // Landmark labels: small signs so the player can read the city.
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const lm of Object.values(LANDMARKS)) {
      if (dist(lm.x, lm.y, G.camera.x, G.camera.y) > 700) continue;
      ctx.fillStyle = 'rgba(20,16,31,0.75)';
      const w = ctx.measureText(lm.name).width + 12;
      ctx.fillRect(lm.x - w / 2, lm.y - 46, w, 16);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(lm.name, lm.x, lm.y - 34);
    }
  }

  function drawCarShape(car, sky) {
    const t = car.type;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-t.w / 2 + 3, -t.h / 2 + 4, t.w, t.h);
    ctx.fillStyle = car.color;
    if (car.typeKey === 'bike') {
      ctx.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(-t.w / 2 + 4, 0, 5, 0, Math.PI * 2); ctx.arc(t.w / 2 - 4, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath();
      const r = 6;
      ctx.roundRect(-t.w / 2, -t.h / 2, t.w, t.h, r);
      ctx.fill();
      // Cabin + windshield.
      ctx.fillStyle = 'rgba(20,30,45,0.85)';
      ctx.fillRect(-t.w * 0.12, -t.h / 2 + 3, t.w * 0.28, t.h - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(t.w * 0.28, -t.h / 2 + 3, 4, t.h - 6);
      // Headlights at night.
      if (sky.night) {
        ctx.fillStyle = '#fff8c0';
        ctx.fillRect(t.w / 2 - 2, -t.h / 2 + 2, 3, 5);
        ctx.fillRect(t.w / 2 - 2, t.h / 2 - 7, 3, 5);
      }
      if (car.typeKey === 'police') {
        ctx.fillStyle = '#14101f';
        ctx.fillRect(-t.w / 2 + 4, -t.h / 2, t.w - 8, 4);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(-4, -t.h / 2 - 2, 4, 4);
        ctx.fillStyle = '#3498db';
        ctx.fillRect(0, -t.h / 2 - 2, 4, 4);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SPD', 0, 3);
      }
      if (car.typeKey === 'taxi') {
        ctx.fillStyle = '#14101f';
        ctx.font = 'bold 7px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TAXI', 0, 3);
      }
      if (car.typeKey === 'delivery') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 7px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('COURIER', 0, 3);
      }
      if (car.dead) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);
      }
    }
    // Damage smoke.
    if (car.hp < car.maxHp * 0.4 && !car.dead) {
      ctx.fillStyle = 'rgba(120,120,120,0.6)';
      ctx.beginPath(); ctx.arc(-t.w / 4, 0, 5 + Math.sin(G_time * 9) * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  let G_time = 0;

  function drawCars(G, vx0, vy0, vx1, vy1, sky) {
    G_time = G.time;
    for (const car of G.cars) {
      if (car.x < vx0 - 80 || car.x > vx1 + 80 || car.y < vy0 - 80 || car.y > vy1 + 80) continue;
      drawCarShape(car, sky);
      if (car.ai === 'police' && G.wanted.stars > 0) {
        // Flashing lightbar halo.
        ctx.fillStyle = (Math.floor(G.time * 4) % 2 === 0) ? 'rgba(231,76,60,0.35)' : 'rgba(52,152,219,0.35)';
        ctx.beginPath(); ctx.arc(car.x, car.y, 34, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Taxi destination marker.
    if (G.taxi.active && G.taxi.dest) {
      ctx.strokeStyle = '#f7c948';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(G.taxi.dest.x, G.taxi.dest.y, 24, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', G.taxi.dest.x, G.taxi.dest.y - 30);
    }
  }

  function drawPerson(x, y, angle, color, walkPhase, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    const swing = Math.sin(walkPhase) * 5 * scale;
    // Legs.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.moveTo(-3 * scale, 0); ctx.lineTo(-3 * scale + swing, 8 * scale);
    ctx.moveTo(3 * scale, 0); ctx.lineTo(3 * scale - swing, 8 * scale);
    ctx.stroke();
    // Body.
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, 9 * scale, 0, Math.PI * 2); ctx.fill();
    // Head.
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath(); ctx.arc(0, -11 * scale, 6 * scale, 0, Math.PI * 2); ctx.fill();
    // Arms swing opposite the legs.
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(-8 * scale, -2); ctx.lineTo(-10 * scale - swing, 5 * scale);
    ctx.moveTo(8 * scale, -2); ctx.lineTo(10 * scale + swing, 5 * scale);
    ctx.stroke();
    ctx.restore();
  }

  function drawPeds(G, vx0, vy0, vx1, vy1) {
    for (const ped of G.peds) {
      if (ped.dead || ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.walkPhase);
      if (ped.fleeing) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', ped.x, ped.y - 22);
      }
      if (ped.callTimer > 0) {
        ctx.fillStyle = '#ff5b5b';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CALLING POLICE…', ped.x, ped.y - 30);
      }
    }
  }

  function drawCops(G, vx0, vy0, vx1, vy1) {
    for (const cop of G.cops) {
      if (cop.dead || cop.x < vx0 || cop.x > vx1 || cop.y < vy0 || cop.y > vy1) continue;
      drawPerson(cop.x, cop.y, cop.angle, '#1a3a6b', cop.walkPhase);
      ctx.fillStyle = '#1a3a6b';
      ctx.beginPath(); ctx.arc(cop.x, cop.y - 11, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SPD', cop.x, cop.y + 2);
    }
  }

  function drawGangs(G, vx0, vy0, vx1, vy1) {
    for (const m of G.gangs.members) {
      if (m.dead || m.x < vx0 || m.x > vx1 || m.y < vy0 || m.y > vy1) continue;
      drawPerson(m.x, m.y, m.angle, m.color, m.walkPhase, m.enforcer ? 1.15 : 1);
      // Health bar.
      ctx.fillStyle = '#222';
      ctx.fillRect(m.x - 14, m.y - 26, 28, 4);
      ctx.fillStyle = m.enforcer ? '#ff8c1a' : '#e74c3c';
      ctx.fillRect(m.x - 14, m.y - 26, 28 * clamp(m.hp / m.maxHp, 0, 1), 4);
      if (m.enforcer) {
        ctx.fillStyle = '#ff8c1a';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ENFORCER', m.x, m.y - 32);
      }
    }
    // Escort driver.
    if (G.mission.active && G.mission.escort) {
      const e = G.mission.escort;
      drawPerson(e.x, e.y, 0, '#2ecc71', G.time * 6);
      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DRIVER', e.x, e.y - 24);
    }
  }

  function drawPlayer(G, sky) {
    const p = G.player;
    if (p.dead) return;
    if (p.inCar) {
      // A small marker ring so the player's car reads at a glance.
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.inCar.x, p.inCar.y, 32, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    drawPerson(p.x, p.y, p.angle, OUTFIT_COLORS[p.outfit % OUTFIT_COLORS.length], p.walkPhase);
    // Aim line when armed.
    if (p.weapon !== 'fists') {
      ctx.strokeStyle = 'rgba(255,210,62,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * 60, p.y + Math.sin(p.angle) * 60);
      ctx.stroke();
      ctx.fillStyle = '#333';
      ctx.save();
      ctx.translate(p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16);
      ctx.rotate(p.angle);
      ctx.fillRect(-6, -2, 14, 4);
      ctx.restore();
    }
    // Health ring under the player.
    ctx.strokeStyle = p.hp > 40 ? '#2ecc71' : '#e74c3c';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 18, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p.hp / 100)); ctx.stroke();
  }

  function drawParticles(G) {
    for (const pt of G.particles) {
      ctx.globalAlpha = clamp(1 - pt.t / pt.life, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of G.floaters) {
      ctx.globalAlpha = clamp(1 - f.t / f.life, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHeli(G, sky) {
    const h = G.heli;
    if (!h.active) return;
    // Spotlight cone on the player.
    const p = G.player;
    ctx.fillStyle = 'rgba(255,250,200,0.10)';
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(p.x - 60, p.y - 60);
    ctx.lineTo(p.x + 60, p.y + 60);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,200,0.22)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 70, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.angle);
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(-30, -2, 10, 4);
    // Rotor: a spinning blur line.
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    const ra = G.time * 30;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ra) * 34, Math.sin(ra) * 34);
    ctx.lineTo(-Math.cos(ra) * 34, -Math.sin(ra) * 34);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPD HELICOPTER', h.x, h.y - 36);
  }

  function drawHud(G, settings) {
    const p = G.player;
    const w = G.wanted;
    // Top-left: cash, health, armor, weapon.
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(20,16,31,0.7)';
    ctx.fillRect(12, 12, 250, 92);
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(`$${p.cash.toLocaleString()}`, 22, 38);
    ctx.fillStyle = '#ecf0f1';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`HP ${Math.round(p.hp)}  ${p.armor > 0 ? `ARMOR ${Math.round(p.armor)}` : ''}`, 22, 62);
    ctx.fillText(`Weapon: ${p.weapon}${p.ammo > 0 ? ` (${p.ammo})` : ''}  ·  Rep ${G.campaign.reputation}`, 22, 84);
    // Health bar.
    ctx.fillStyle = '#222';
    ctx.fillRect(22, 90, 200, 6);
    ctx.fillStyle = p.hp > 40 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(22, 90, 200 * clamp(p.hp / 100, 0, 1), 6);

    // Top-right: wanted stars with state, evidence icons, label.
    const stars = w.stars;
    const sx = VIEW_W - 250;
    ctx.fillStyle = 'rgba(20,16,31,0.7)';
    ctx.fillRect(sx - 10, 12, 248, 92);
    ctx.font = '28px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i < 6; i++) {
      const filled = i < stars;
      let color = '#555';
      let alpha = 1;
      if (filled) {
        if (w.state === 'red') color = '#e74c3c';
        else if (w.state === 'flashing') { color = '#fff'; alpha = (Math.floor(G.time * 4) % 2 === 0) ? 1 : 0.25; }
        else if (w.state === 'hollow') { color = '#fff'; }
        else color = '#fff';
      }
      ctx.globalAlpha = filled ? alpha : 0.5;
      ctx.fillStyle = color;
      ctx.fillText(filled ? '★' : '☆', sx + i * 34, 44);
      ctx.globalAlpha = 1;
    }
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = stars > 0 ? '#ffd23e' : '#9aa';
    ctx.fillText(stars > 0 ? `${wantedLabel(stars)} — ${w.state.toUpperCase()}` : 'CLEAN', sx, 66);
    // Evidence icons under the stars.
    const ev = w.evidence;
    const active = Object.keys(EVIDENCE_LABELS).filter((k) => ev[k]);
    ctx.font = '11px system-ui, sans-serif';
    if (active.length === 0) {
      ctx.fillStyle = '#888';
      ctx.fillText('No evidence', sx, 88);
    } else {
      active.forEach((k, i) => {
        ctx.fillStyle = '#ff8c42';
        ctx.fillRect(sx + i * 46, 76, 42, 16);
        ctx.fillStyle = '#14101f';
        ctx.fillText(EVIDENCE_LABELS[k], sx + i * 46 + 4, 88);
      });
    }
    if (G.heli.active) {
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('HELICOPTER OVERHEAD', sx, 128);
    }

    // District + clock, top centre.
    const h = Math.floor((G.dayTime / 3600) % 24);
    const min = Math.floor((G.dayTime / 60) % 60);
    const clock = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(20,16,31,0.7)';
    const dname = districtNameAt(p.x, p.y);
    const dw = ctx.measureText(`${dname}  ·  ${clock}`).width + 24;
    ctx.fillRect(VIEW_W / 2 - dw / 2, 12, dw, 28);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(`${dname}  ·  ${clock}${G.weather.kind !== 'clear' ? `  ·  ${G.weather.kind.toUpperCase()}` : ''}`, VIEW_W / 2, 32);

    // Mission objective, bottom-left.
    const obj = missionObjective(G);
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px system-ui, sans-serif';
    const ow = ctx.measureText(obj).width + 24;
    ctx.fillStyle = 'rgba(20,16,31,0.75)';
    ctx.fillRect(12, VIEW_H - 78, Math.min(ow, 640), 54);
    ctx.fillStyle = '#ffd23e';
    ctx.fillText(obj, 24, VIEW_H - 56);
    if (G.mission.active) {
      ctx.fillStyle = '#ecf0f1';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`${MISSIONS[G.mission.index].title} — ${Math.ceil(G.mission.timer)}s left · $${MISSIONS[G.mission.index].reward}`, 24, VIEW_H - 36);
    } else {
      ctx.fillStyle = '#bbb';
      ctx.font = '13px system-ui, sans-serif';
      const done = G.campaign.missionsDone.length;
      ctx.fillText(`Jobs done ${done}/8 · Packages ${G.campaign.packages.length}/12 · Press F at Mara's Office for the next job`, 24, VIEW_H - 36);
    }

    // HUD message banner.
    if (G.hudTimer > 0 && G.hudMessage) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px system-ui, sans-serif';
      const mw = ctx.measureText(G.hudMessage).width + 28;
      ctx.fillStyle = 'rgba(20,16,31,0.8)';
      ctx.fillRect(VIEW_W / 2 - mw / 2, 52, mw, 30);
      ctx.fillStyle = '#fff';
      ctx.fillText(G.hudMessage, VIEW_W / 2, 73);
    }

    // Hints line.
    if (settings.hints) {
      ctx.textAlign = 'center';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('WASD move · Mouse aim · Click attack · E enter/steal car · F interact · Q weapon · P pause · O settings · N minimap', VIEW_W / 2, VIEW_H - 8);
    }

    drawMinimap(G, settings);
    drawSpeedo(G);
  }

  function drawMinimap(G, settings) {
    const sizes = [110, 150, 200];
    const size = sizes[settings.minimap ?? 1] ?? 150;
    const mx = VIEW_W - size - 14;
    const my = VIEW_H - size - 14;
    const scale = size / WORLD;
    ctx.fillStyle = 'rgba(20,16,31,0.8)';
    ctx.fillRect(mx - 4, my - 4, size + 8, size + 8);
    ctx.fillStyle = '#2a2f45';
    ctx.fillRect(mx, my, size, size);
    // Water + beach.
    ctx.fillStyle = '#1f6fb2';
    ctx.fillRect(mx, my, 150 * scale, size);
    ctx.fillStyle = '#d9b96a';
    ctx.fillRect(mx + 150 * scale, my, 170 * scale, size);
    // Roads.
    ctx.fillStyle = '#888';
    for (const c of ROAD_CENTRES) {
      ctx.fillRect(mx, my + c * scale - 1, size, 2);
      ctx.fillRect(mx + c * scale - 1, my, 2, size);
    }
    // Hot area.
    if (G.wanted.state === 'red' && G.wanted.hotTimer > 0) {
      ctx.fillStyle = 'rgba(231,76,60,0.3)';
      ctx.beginPath(); ctx.arc(mx + G.wanted.hotX * scale, my + G.wanted.hotY * scale, G.wanted.hotRadius * scale, 0, Math.PI * 2); ctx.fill();
    }
    // Mission target.
    const t = missionTarget(G);
    if (t) {
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(mx + t.x * scale, my + t.y * scale, 5, 0, Math.PI * 2); ctx.fill();
    }
    // Police.
    ctx.fillStyle = '#3498db';
    for (const car of G.cars) {
      if (car.ai === 'police' && !car.dead) ctx.fillRect(mx + car.x * scale - 2, my + car.y * scale - 2, 4, 4);
    }
    ctx.fillStyle = '#e74c3c';
    for (const m of G.gangs.members) {
      if (!m.dead) ctx.fillRect(mx + m.x * scale - 2, my + m.y * scale - 2, 4, 4);
    }
    // Player arrow.
    const p = G.player;
    ctx.save();
    ctx.translate(mx + p.x * scale, my + p.y * scale);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    // North label + view box.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('N', mx + 4, my + 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(mx + (G.camera.x - 640) * scale, my + (G.camera.y - 360) * scale, 1280 * scale, 720 * scale);
  }

  function drawSpeedo(G) {
    const p = G.player;
    if (!p.inCar) return;
    const car = p.inCar;
    const kmh = Math.round(Math.abs(car.speed) * 0.45);
    ctx.textAlign = 'right';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(20,16,31,0.7)';
    ctx.fillRect(VIEW_W - 150, VIEW_H - 220, 136, 48);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${kmh} km/h`, VIEW_W - 24, VIEW_H - 200);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#bbb';
    ctx.fillText(`${car.typeKey} · HP ${Math.round(car.hp)}`, VIEW_W - 24, VIEW_H - 182);
  }

  function menuPanel(title, lines, items, selected) {
    ctx.fillStyle = 'rgba(20,16,31,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText(title, VIEW_W / 2, 150);
    ctx.fillStyle = '#ecf0f1';
    ctx.font = '17px system-ui, sans-serif';
    lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 200 + i * 26));
    ctx.font = 'bold 22px system-ui, sans-serif';
    items.forEach((it, i) => {
      const y = 360 + i * 44;
      if (i === selected) {
        ctx.fillStyle = '#ffd23e';
        ctx.fillText(`▶ ${it}`, VIEW_W / 2, y);
      } else {
        ctx.fillStyle = '#cfd6e4';
        ctx.fillText(it, VIEW_W / 2, y);
      }
    });
    ctx.fillStyle = '#888';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('↑ ↓ to choose · Enter to confirm', VIEW_W / 2, VIEW_H - 40);
  }

  function drawTitle(G, menu) {
    // The city behind the menu, dimmed.
    drawWorld(G);
    ctx.fillStyle = 'rgba(20,16,31,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillText('SOLMAR NIGHTS', VIEW_W / 2, 170);
    ctx.fillStyle = '#ff7e5f';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('A sun-soaked open-world crime story', VIEW_W / 2, 210);
    ctx.fillStyle = '#ecf0f1';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Dana Reyes owes the Salt Kings. Fixer Mara Solis has eight jobs that pay the debt —', VIEW_W / 2, 250);
    ctx.fillText('if the Solmar police, their helicopter and the Kings themselves don\u2019t get her first.', VIEW_W / 2, 274);
    const items = menu.items ?? [];
    ctx.font = 'bold 22px system-ui, sans-serif';
    items.forEach((it, i) => {
      const y = 350 + i * 44;
      if (i === menu.selected) { ctx.fillStyle = '#ffd23e'; ctx.fillText(`▶ ${it}`, VIEW_W / 2, y); }
      else { ctx.fillStyle = '#cfd6e4'; ctx.fillText(it, VIEW_W / 2, y); }
    });
    ctx.fillStyle = '#888';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('WASD move · Mouse aim · E steal a car · F interact · Q weapon · P pause · O settings', VIEW_W / 2, VIEW_H - 60);
    ctx.fillText('Keyboard + mouse · No network · Your progress saves on this machine', VIEW_W / 2, VIEW_H - 36);
  }

  function drawHowTo(menu) {
    ctx.fillStyle = '#14101f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('HOW TO PLAY', 60, 70);
    const cols = [
      ['MOVEMENT', 'WASD / arrows — walk', 'Shift — sprint', 'Mouse — aim', 'Click / Space — attack', 'E — enter / steal a car', 'F — interact / talk / shop', 'Q — switch weapon', 'N — minimap size', 'P / Esc — pause · O — settings'],
      ['THE CITY', 'Steal any car on the street', 'Taxi fares pay $45 a ride', '12 hidden packages pay $40 each', 'Ironworks Arms sells guns', 'Spray shop clears the heat', 'Diner heals · Threads hides you', 'Mara\u2019s Office starts each job', 'Wanted: hide to cool the stars', 'Hot areas remember your outfit'],
    ];
    ctx.font = '16px system-ui, sans-serif';
    cols.forEach((col, ci) => {
      const x = 60 + ci * 560;
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(col[0], x, 120);
      ctx.fillStyle = '#ecf0f1';
      ctx.font = '16px system-ui, sans-serif';
      col.slice(1).forEach((l, i) => ctx.fillText(l, x, 150 + i * 28));
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#888';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Press Enter or Esc to go back', VIEW_W / 2, VIEW_H - 40);
  }

  function drawSettings(menu, settings) {
    ctx.fillStyle = '#14101f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('SETTINGS', VIEW_W / 2, 90);
    const rows = [
      `Music volume — ${Math.round(settings.music * 100)}%  (← →)`,
      `Effects volume — ${Math.round(settings.sfx * 100)}%  (← →)`,
      `Minimap size — ${['Small', 'Medium', 'Large'][settings.minimap]}  (← →)`,
      `Screen shake — ${settings.shake ? 'ON' : 'OFF'}  (← →)`,
      `Hint line — ${settings.hints ? 'ON' : 'OFF'}  (← →)`,
      'Back to game',
    ];
    ctx.font = 'bold 20px system-ui, sans-serif';
    rows.forEach((r, i) => {
      const y = 170 + i * 48;
      if (i === menu.selected) { ctx.fillStyle = '#ffd23e'; ctx.fillText(`▶ ${r}`, VIEW_W / 2, y); }
      else { ctx.fillStyle = '#cfd6e4'; ctx.fillText(r, VIEW_W / 2, y); }
    });
    ctx.fillStyle = '#888';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('↑ ↓ to choose · ← → to change · Enter to confirm · Settings save on this machine', VIEW_W / 2, VIEW_H - 40);
  }

  function drawPaused(menu) {
    ctx.fillStyle = 'rgba(20,16,31,0.7)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    menuPanel('PAUSED', ['Take a breath. Solmar waits.'], menu.items ?? ['Resume', 'How to Play', 'Settings', 'Save & Quit to Title'], menu.selected ?? 0);
  }

  function drawOver(G, menu) {
    ctx.fillStyle = 'rgba(20,16,31,0.85)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const items = menu.items ?? ['Retry from last save', 'New Game', 'Title'];
    menuPanel('BUSTED — OR WORSE', [
      `Dana went down with $${G.player.cash} in her pocket.`,
      `Jobs done: ${G.campaign.missionsDone.length}/8 · Best wanted: ${G.campaign.bestStars} stars`,
      'The Kings will be pleased. Mara will not.',
    ], items, menu.selected ?? 0);
  }

  function drawEnding(G, menu) {
    ctx.fillStyle = 'rgba(20,16,31,0.85)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const items = menu.items ?? ['Keep playing — free roam', 'Title'];
    menuPanel('THE DEBT IS PAID', [
      'Dana delivered the payoff at dawn and walked away clean.',
      `Eight jobs · $${G.player.cash} earned · ${G.campaign.kills} Kings down · Best wanted ${G.campaign.bestStars} stars`,
      'Solmar is hers now. Free roam continues — the city never sleeps.',
    ], items, menu.selected ?? 0);
  }

  return { draw };
}
