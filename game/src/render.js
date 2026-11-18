// SOLMAR NIGHTS — render.js
// Everything the eye sees: the city from above (roads, roofs, neon, palms),
// the cars and the crowd, the particles and the night, then the HUD —
// objective, cash, wanted stars, health, ammo, speed and the minimap —
// and the menu screens. All drawn on one canvas, no images, no fonts
// loaded from the network: the whole look is code.

import { LANDMARKS, ROAD_CENTRES } from './city.js';
import { PALETTE, ROAD_W, VIEW_H, VIEW_W, WORLD } from './config.js';
import { clamp, lerp } from './random.js';
import { missionTarget } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOWTO = 'howto';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_ENDING = 'ending';

const STAR = '★';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;

  function resize() {
    const cw = canvas.clientWidth || VIEW_W;
    const ch = canvas.clientHeight || VIEW_H;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    scale = Math.min(cw / VIEW_W, ch / VIEW_H);
    ox = (cw - VIEW_W * scale) / 2;
    oy = (ch - VIEW_H * scale) / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  function screenTransform() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  }

  function worldTransform(G) {
    const cam = G.camera;
    ctx.translate(VIEW_W / 2, VIEW_H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-(cam.x + cam.ox), -(cam.y + cam.oy));
  }

  function nightFactor(G) {
    // clock 0..1: 0.25 sunrise, 0.5 noon, 0.75 sunset. Night is 0.85..1..0.15.
    const c = G.clock;
    const night = c > 0.8 || c < 0.2;
    if (!night) return 0;
    const d = c > 0.8 ? (c - 0.8) / 0.2 : (0.2 - c) / 0.2;
    return clamp(d * 1.4, 0, 1);
  }

  function clockText(G) {
    const minutes = Math.floor(G.clock * 24 * 60);
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGround(G, view) {
    const city = G.city;
    // Base: the island is concrete and grass.
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    // Water and beach on the west edge.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(view.x0, view.y0, Math.max(0, 140 - view.x0), view.y1 - view.y0);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(Math.max(view.x0, 140), view.y0, Math.max(0, 432 - Math.max(view.x0, 140)), view.y1 - view.y0);
    // Hills park (north) and docks (east) ground.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, Math.max(0, 432 - view.y0));
    ctx.fillStyle = '#54504c';
    ctx.fillRect(Math.max(view.x0, WORLD - 432), view.y0, view.x1 - Math.max(view.x0, WORLD - 432), view.y1 - view.y0);
    // Roads.
    ctx.fillStyle = PALETTE.asphalt;
    for (const c of ROAD_CENTRES) {
      ctx.fillRect(c - ROAD_W / 2, view.y0, ROAD_W, view.y1 - view.y0);
      ctx.fillRect(view.x0, c - ROAD_W / 2, view.x1 - view.x0, ROAD_W);
    }
    // Centre dashes and edge lines.
    ctx.fillStyle = PALETTE.roadLine;
    for (const c of ROAD_CENTRES) {
      for (let v = Math.floor(view.y0 / 60) * 60; v < view.y1; v += 60) {
        ctx.fillRect(c - 2, v, 4, 30);
        ctx.fillRect(v, c - 2, 30, 4);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (const c of ROAD_CENTRES) {
      ctx.beginPath();
      ctx.moveTo(c - ROAD_W / 2 + 3, view.y0);
      ctx.lineTo(c - ROAD_W / 2 + 3, view.y1);
      ctx.moveTo(c + ROAD_W / 2 - 3, view.y0);
      ctx.lineTo(c + ROAD_W / 2 - 3, view.y1);
      ctx.moveTo(view.x0, c - ROAD_W / 2 + 3);
      ctx.lineTo(view.x1, c - ROAD_W / 2 + 3);
      ctx.moveTo(view.x0, c + ROAD_W / 2 - 3);
      ctx.lineTo(view.x1, c + ROAD_W / 2 - 3);
      ctx.stroke();
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const cx of ROAD_CENTRES) {
      for (const cy of ROAD_CENTRES) {
        if (cx < view.x0 - 60 || cx > view.x1 + 60 || cy < view.y0 - 60 || cy > view.y1 + 60) continue;
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(cx + i * 12 - 3, cy - ROAD_W / 2 + 6, 6, 14);
          ctx.fillRect(cx + i * 12 - 3, cy + ROAD_W / 2 - 20, 6, 14);
          ctx.fillRect(cx - ROAD_W / 2 + 6, cy + i * 12 - 3, 14, 6);
          ctx.fillRect(cx + ROAD_W / 2 - 20, cy + i * 12 - 3, 14, 6);
        }
      }
    }
    // Ponds in the hills.
    for (const pr of city.props) {
      if (pr.kind === 'pond') {
        ctx.fillStyle = '#4d9ec4';
        ctx.beginPath();
        ctx.ellipse(pr.x, pr.y, pr.w / 2, pr.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawBuildings(G, view, night) {
    const city = G.city;
    for (const b of city.buildings) {
      if (b.x > view.x1 || b.x + b.w < view.x0 || b.y > view.y1 || b.y + b.h < view.y0) continue;
      const sh = 6 + b.tier * 5;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + sh, b.y + sh, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Roof detail: inner panel, vents, and a window grid on tall slabs.
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 8, 16, 16);
      if (b.tier >= 2) {
        ctx.fillStyle = night > 0.3 ? 'rgba(255,214,120,0.85)' : 'rgba(255,255,255,0.35)';
        for (let wx = b.x + 14; wx < b.x + b.w - 14; wx += 22) {
          for (let wy = b.y + 14; wy < b.y + b.h - 14; wy += 22) {
            if (((wx * 7 + wy * 13) % 5) < 2) ctx.fillRect(wx, wy, 7, 7);
          }
        }
      }
      if (b.landmark) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(b.x, b.y + b.h - 22, b.w, 22);
      }
    }
    // Neon signs glow after dark.
    for (const s of city.signs) {
      if (s.x < view.x0 - 100 || s.x > view.x1 + 100 || s.y < view.y0 - 40 || s.y > view.y1 + 40) continue;
      ctx.save();
      ctx.globalAlpha = night > 0.2 ? 1 : 0.55;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = s.color;
      ctx.shadowBlur = night > 0.2 ? 16 : 4;
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
      if (s.sub) {
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(s.sub, s.x, s.y + 16);
      }
      ctx.restore();
    }
  }

  function drawProps(G, view, night) {
    const city = G.city;
    for (const t of city.trees) {
      if (t.x < view.x0 - 30 || t.x > view.x1 + 30 || t.y < view.y0 - 30 || t.y > view.y1 + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(t.x + 5, t.y + 6, t.r, t.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      if (t.palm) {
        ctx.strokeStyle = '#8a6f4d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y + 8);
        ctx.lineTo(t.x, t.y - 6);
        ctx.stroke();
        ctx.fillStyle = '#4d8a4d';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(t.x + Math.cos(a) * 9, t.y - 6 + Math.sin(a) * 6, 10, 4, a, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = t.shade > 1 ? '#8fbf74' : '#6b9a52';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(t.x - 3, t.y - 4, t.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const pr of city.props) {
      if (pr.x < view.x0 - 40 || pr.x > view.x1 + 40 || pr.y < view.y0 - 40 || pr.y > view.y1 + 40) continue;
      if (pr.kind === 'container') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(pr.x - pr.w / 2 + 4, pr.y - pr.h / 2 + 4, pr.w, pr.h);
        ctx.fillStyle = pr.color;
        ctx.fillRect(pr.x - pr.w / 2, pr.y - pr.h / 2, pr.w, pr.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(pr.x + i * 12, pr.y - pr.h / 2);
          ctx.lineTo(pr.x + i * 12, pr.y + pr.h / 2);
          ctx.stroke();
        }
      } else if (pr.kind === 'dumpster') {
        ctx.fillStyle = '#4d6b52';
        ctx.fillRect(pr.x - 11, pr.y - 8, 22, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(pr.x - 11, pr.y - 8, 22, 4);
      } else if (pr.kind === 'hydrant') {
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (pr.kind === 'tower') {
        ctx.fillStyle = '#e8dcc8';
        ctx.fillRect(pr.x - 13, pr.y - 13, 26, 26);
        ctx.fillStyle = '#ff5a5a';
        ctx.fillRect(pr.x - 13, pr.y - 13, 26, 8);
      }
    }
    // Street lamps: pole by day, pool of light by night.
    for (const l of city.lamps) {
      if (l.x < view.x0 - 20 || l.x > view.x1 + 20 || l.y < view.y0 - 20 || l.y > view.y1 + 20) continue;
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(l.x - 1, l.y - 1, 3, 3);
      if (night > 0.25) {
        ctx.save();
        ctx.globalAlpha = 0.35 * night;
        ctx.fillStyle = '#ffd98a';
        ctx.beginPath();
        ctx.arc(l.x, l.y, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(l.x, l.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawCar(G, car, night, t) {
    const w = car.type.w;
    const h = car.type.h;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 4, w / 2, h / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.color;
    roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(-w / 2, -h / 2, w, h / 2.4, 6);
    ctx.fill();
    // Cabin and windows.
    ctx.fillStyle = '#20262e';
    roundRect(-w * 0.18, -h / 2 + 3, w * 0.36, h - 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,235,0.5)';
    ctx.fillRect(-w * 0.1, -h / 2 + 4, w * 0.2, h - 8);
    // Headlights and taillights.
    ctx.fillStyle = night > 0.2 ? '#fff6c9' : '#f5e6a8';
    ctx.fillRect(w / 2 - 3, -h / 2 + 2, 3, 4);
    ctx.fillRect(w / 2 - 3, h / 2 - 6, 3, 4);
    ctx.fillStyle = '#ff2e2e';
    ctx.fillRect(-w / 2, -h / 2 + 2, 3, 4);
    ctx.fillRect(-w / 2, h / 2 - 6, 3, 4);
    if (car.typeKey === 'taxi') {
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    if (car.typeKey === 'police' || car.ai === 'police') {
      ctx.fillStyle = '#ecf0f1';
      ctx.fillRect(-w * 0.18, -h / 2, w * 0.36, h);
      ctx.fillStyle = '#1a5276';
      ctx.font = 'bold 7px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
      const blink = Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = blink ? '#ff2e2e' : '#2e7dff';
      ctx.beginPath();
      ctx.arc(-w * 0.05, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = blink ? '#2e7dff' : '#ff2e2e';
      ctx.beginPath();
      ctx.arc(w * 0.08, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.hp < car.maxHp * 0.35) {
      ctx.fillStyle = 'rgba(40,40,40,0.5)';
      ctx.beginPath();
      ctx.arc(w / 2 - 8, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Headlight cones after dark.
    if (night > 0.25 && Math.abs(car.speed) > 5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(
        car.x + Math.cos(car.angle) * (w / 2), car.y + Math.sin(car.angle) * (w / 2), 10,
        car.x + Math.cos(car.angle) * (w / 2), car.y + Math.sin(car.angle) * (w / 2), 150,
      );
      grad.addColorStop(0, `rgba(255,240,180,${0.20 * night})`);
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(car.x + Math.cos(car.angle) * (w / 2), car.y + Math.sin(car.angle) * (w / 2));
      ctx.arc(car.x + Math.cos(car.angle) * (w / 2), car.y + Math.sin(car.angle) * (w / 2), 150, car.angle - 0.32, car.angle + 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPerson(x, y, angle, shirt, skin, opts) {
    const o = opts ?? {};
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Shoulders point the way the person faces.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(7, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    if (o.cap) {
      ctx.fillStyle = '#1a2a4a';
      ctx.beginPath();
      ctx.arc(7, 0, 5.5, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.fill();
    }
    if (o.hailing) {
      ctx.rotate(-angle);
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7cff4d';
      ctx.fillText('$', 0, -20);
    }
    ctx.restore();
  }

  function drawWorld(G) {
    const cam = G.camera;
    const night = nightFactor(G);
    const vw = VIEW_W / cam.zoom / 2 + 80;
    const vh = VIEW_H / cam.zoom / 2 + 80;
    const view = { x0: cam.x - vw, x1: cam.x + vw, y0: cam.y - vh, y1: cam.y + vh };
    ctx.save();
    worldTransform(G);
    drawGround(G, view);
    // Skid marks under everything that moves.
    ctx.strokeStyle = 'rgba(20,20,20,0.4)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const s of G.skidmarks) {
      ctx.globalAlpha = clamp(s.life / 8, 0, 0.55);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 16, s.y - Math.sin(s.angle) * 16);
      ctx.lineTo(s.x + Math.cos(s.angle) * 16, s.y + Math.sin(s.angle) * 16);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawBuildings(G, view, night);
    drawProps(G, view, night);
    // Pickups.
    for (const pk of G.pickups) {
      if (pk.taken || pk.x < view.x0 || pk.x > view.x1 || pk.y < view.y0 || pk.y > view.y1) continue;
      const bob = Math.sin(pk.bob * 3) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'package') {
        ctx.shadowColor = '#ffd23e';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffd23e';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = '#8a6d00';
        ctx.fillRect(-9, -2, 18, 4);
      } else if (pk.kind === 'health') {
        ctx.shadowColor = '#ff5a5a';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(-2, -7, 4, 14);
        ctx.fillRect(-7, -2, 14, 4);
      } else if (pk.kind === 'cashbag') {
        ctx.shadowColor = '#7cff4d';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 5);
      }
      ctx.restore();
    }
    // Mission beacon: a pillar of light and a pulsing diamond.
    const target = missionTarget(G);
    if (target && G.mission.active) {
      const pulse = 0.5 + 0.5 * Math.sin(G.time * 4);
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.12 * pulse;
      ctx.fillStyle = '#ffd23e';
      ctx.fillRect(target.x - 14, target.y - 260, 28, 260);
      ctx.restore();
      ctx.save();
      ctx.translate(target.x, target.y - 30 - pulse * 8);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd23e';
      ctx.strokeStyle = '#8a6d00';
      ctx.lineWidth = 2;
      ctx.fillRect(-11, -11, 22, 22);
      ctx.strokeRect(-11, -11, 22, 22);
      ctx.restore();
    }
    // Taxi destination marker.
    if (G.taxi.state === 'toDest' && G.taxi.dest) {
      ctx.save();
      ctx.translate(G.taxi.dest.x, G.taxi.dest.y);
      ctx.fillStyle = '#7cff4d';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a3d16';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 5);
      ctx.restore();
    }
    // Cars, sorted so the ones further down the screen draw last.
    const cars = [...G.cars].filter((c) => !c.dead).sort((a, b) => a.y - b.y);
    for (const car of cars) drawCar(G, car, night, G.time);
    for (const ped of G.peds) {
      if (ped.dead) {
        ctx.save();
        ctx.translate(ped.x, ped.y);
        ctx.rotate(ped.angle);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.skin, { hailing: ped.hailing });
    }
    for (const cop of G.police) {
      if (cop.dead) continue;
      drawPerson(cop.x, cop.y, cop.angle, '#1a2a4a', '#e0ac69', { cap: true });
    }
    // The player, on foot.
    const p = G.player;
    if (!p.inCar) {
      drawPerson(p.x, p.y, p.angle, '#e74c3c', '#f1c27d', {});
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Particles.
    for (const pt of G.particles) {
      const a = clamp(pt.life / pt.max, 0, 1);
      if (pt.tracer) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#ffe9a8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pt.tracer.x, pt.tracer.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * a + 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Floating text.
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of G.floaters) {
      ctx.save();
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.fillStyle = f.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
    ctx.restore();

    // Night falls over the world, then the damage vignette.
    if (night > 0.02) {
      ctx.save();
      screenTransform();
      ctx.fillStyle = `rgba(8,12,44,${0.36 * night})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
    if (G.player.hp < 45 && G.player.hp > 0) {
      const pulse = 0.25 + 0.15 * Math.sin(G.time * 5);
      const grad = ctx.createRadialGradient(640, 360, 200, 640, 360, 560);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(1, `rgba(255,0,0,${pulse})`);
      ctx.save();
      screenTransform();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
  }

  function drawMinimap(G) {
    const cx = 118;
    const cy = VIEW_H - 118;
    const r = 92;
    const s = (r * 2) / WORLD;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#20262e';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(cx - r, cy - r, 140 * s, r * 2);
    ctx.fillStyle = '#6b6b66';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = PALETTE.asphalt;
    for (const c of ROAD_CENTRES) {
      ctx.fillRect(cx - r, cy - r + c * s - 2, r * 2, 4);
      ctx.fillRect(cx - r + c * s - 2, cy - r, 4, r * 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const b of G.city.buildings) {
      ctx.fillRect(cx - r + b.x * s, cy - r + b.y * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
    }
    const blip = (x, y, color, size) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx - r + x * s, cy - r + y * s, size, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of G.cars) {
      if (car.ai === 'police' && !car.dead) blip(car.x, car.y, Math.floor(G.time * 4) % 2 === 0 ? '#ff2e2e' : '#2e7dff', 4);
    }
    for (const cop of G.police) if (!cop.dead) blip(cop.x, cop.y, '#2e7dff', 3);
    if (G.taxi.state === 'toPickup' && G.taxi.passenger) blip(G.taxi.passenger.x, G.taxi.passenger.y, '#7cff4d', 4);
    if (G.taxi.state === 'toDest' && G.taxi.dest) blip(G.taxi.dest.x, G.taxi.dest.y, '#7cff4d', 5);
    const target = missionTarget(G);
    if (target && G.mission.active) {
      const pulse = 4 + 2 * Math.sin(G.time * 5);
      ctx.fillStyle = '#ffd23e';
      ctx.save();
      ctx.translate(cx - r + target.x * s, cy - r + target.y * s);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
      ctx.restore();
    }
    // Player arrow.
    ctx.save();
    ctx.translate(cx - r + G.player.x * s, cy - r + G.player.y * s);
    ctx.rotate(G.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // Ring, N marker and district label.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - r - 6);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(G.district, cx, cy + r + 18);
  }

  function drawHUD(G, input) {
    const p = G.player;
    ctx.save();
    screenTransform();
    // Objective panel, top left.
    if (G.mission.active) {
      const def = G.mission.def;
      const obj = def.objective(G);
      ctx.fillStyle = 'rgba(10,12,20,0.72)';
      roundRect(16, 14, 430, 66, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`JOB: ${def.title.toUpperCase()}  •  $${def.reward}`, 30, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(obj, 30, 58);
      const target = missionTarget(G);
      if (target) {
        ctx.fillStyle = '#ffd23e';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(Math.hypot(target.x - p.x, target.y - p.y))}m`, 432, 58);
        ctx.textAlign = 'left';
      }
    } else if (G.missionIndex < 6) {
      ctx.fillStyle = 'rgba(10,12,20,0.6)';
      roundRect(16, 14, 430, 40, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('No job running — visit Mara at the safehouse (yellow house icon).', 30, 39);
    }
    // Cash, stars, health — top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7cff4d';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, VIEW_W - 18, 44);
    const w = G.wanted;
    const flashing = w.stars > 0 && !w.seen;
    const starAlpha = flashing ? (Math.floor(G.time * 3) % 2 === 0 ? 1 : 0.25) : 1;
    ctx.save();
    ctx.globalAlpha = starAlpha;
    ctx.font = '22px system-ui, sans-serif';
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < w.stars ? STAR : '☆';
    ctx.fillStyle = w.stars > 0 ? '#ffd23e' : 'rgba(255,255,255,0.35)';
    ctx.fillText(stars, VIEW_W - 18, 74);
    ctx.restore();
    // Health bar.
    ctx.fillStyle = 'rgba(10,12,20,0.72)';
    roundRect(VIEW_W - 218, 84, 200, 18, 9);
    ctx.fill();
    const hpFrac = clamp(p.hp / 100, 0, 1);
    ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : hpFrac > 0.25 ? '#f39c12' : '#e74c3c';
    roundRect(VIEW_W - 216, 86, 196 * hpFrac, 14, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`HEALTH ${Math.ceil(p.hp)}`, VIEW_W - 118, 97);
    // Clock + district, top centre.
    ctx.fillStyle = 'rgba(10,12,20,0.6)';
    roundRect(VIEW_W / 2 - 70, 14, 140, 30, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`${nightFactor(G) > 0.4 ? '☾' : '☀'} ${clockText(G)}`, VIEW_W / 2, 34);
    // Weapon + ammo, bottom right.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(p.ammo > 0 ? `PISTOL  ${p.ammo}` : 'PISTOL  —', VIEW_W - 18, VIEW_H - 52);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Click to shoot  •  Space to punch  •  E car  •  P pause', VIEW_W - 18, VIEW_H - 28);
    if (p.inCar) {
      const mph = Math.round(Math.abs(p.inCar.speed) * 0.22);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillText(`${mph}`, VIEW_W - 18, VIEW_H - 92);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('MPH', VIEW_W - 18, VIEW_H - 74);
      ctx.fillStyle = p.inCar.hp < p.inCar.maxHp * 0.35 ? '#e74c3c' : 'rgba(255,255,255,0.7)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`CAR ${Math.max(0, Math.ceil((p.inCar.hp / p.inCar.maxHp) * 100))}%`, VIEW_W - 178, VIEW_H - 92);
      ctx.textAlign = 'right';
    }
    drawMinimap(G);
    // Prompt, bottom centre.
    if (G.prompt) {
      ctx.fillStyle = 'rgba(10,12,20,0.78)';
      ctx.font = 'bold 15px system-ui, sans-serif';
      const tw = ctx.measureText(G.prompt).width;
      roundRect(VIEW_W / 2 - tw / 2 - 16, VIEW_H - 66, tw + 32, 34, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd23e';
      ctx.textAlign = 'center';
      ctx.fillText(G.prompt, VIEW_W / 2, VIEW_H - 43);
    }
    // Phone toast from Mara.
    if (G.toast) {
      ctx.fillStyle = 'rgba(20,24,36,0.92)';
      ctx.font = '14px system-ui, sans-serif';
      const tw = ctx.measureText(G.toast.text).width;
      roundRect(VIEW_W / 2 - tw / 2 - 18, 96, tw + 36, 36, 12);
      ctx.fill();
      ctx.fillStyle = '#7cff4d';
      ctx.textAlign = 'center';
      ctx.fillText(`📱 ${G.toast.text}`, VIEW_W / 2, 119);
    }
    // Mission banner.
    if (G.banner) {
      const a = clamp(Math.min(G.banner.t * 4, (G.banner.dur - G.banner.t) * 2), 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(10,12,20,0.85)';
      ctx.fillRect(0, 200, VIEW_W, 120);
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(G.banner.title, VIEW_W / 2, 248);
      ctx.fillStyle = '#ffffff';
      ctx.font = '15px system-ui, sans-serif';
      const words = G.banner.sub.split(' ');
      let line = '';
      let y = 282;
      for (const word of words) {
        if (ctx.measureText(`${line} ${word}`).width > 900) {
          ctx.fillText(line.trim(), VIEW_W / 2, y);
          line = word;
          y += 20;
        } else line += ` ${word}`;
      }
      ctx.fillText(line.trim(), VIEW_W / 2, y);
      ctx.restore();
    }
    // Crosshair on foot.
    if (!p.inCar) {
      const mx = input.mouse.lx ?? input.mouse.x;
      const my = input.mouse.ly ?? input.mouse.y;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Off-screen objective arrow.
    const target = missionTarget(G);
    if (target && G.mission.active) {
      const wx = (target.x - G.camera.x) * G.camera.zoom + VIEW_W / 2;
      const wy = (target.y - G.camera.y) * G.camera.zoom + VIEW_H / 2;
      if (wx < 20 || wx > VIEW_W - 20 || wy < 20 || wy > VIEW_H - 20) {
        const ax = clamp(wx, 40, VIEW_W - 40);
        const ay = clamp(wy, 40, VIEW_H - 40);
        const ang = Math.atan2(wy - VIEW_H / 2, wx - VIEW_W / 2);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-8, -9);
        ctx.lineTo(-8, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawTitle(G, ui) {
    ctx.save();
    screenTransform();
    // Sunset gradient sky over a drawn skyline.
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#2b1055');
    grad.addColorStop(0.45, '#7597de');
    grad.addColorStop(0.7, '#ff7e5f');
    grad.addColorStop(1, '#feb47b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#ff9d5c';
    ctx.beginPath();
    ctx.arc(1080, 215, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,10,40,0.85)';
    const skyline = [120, 200, 150, 260, 180, 300, 140, 230, 190, 320, 170, 240, 210, 160, 280, 200, 150, 260, 190, 140];
    let x = 0;
    for (const h of skyline) {
      ctx.fillRect(x, VIEW_H - 180 - h * 0.5, 64, 180 + h * 0.5);
      x += 64;
    }
    ctx.fillStyle = 'rgba(20,10,40,0.95)';
    ctx.fillRect(0, VIEW_H - 180, VIEW_W, 180);
    // Palm silhouettes.
    ctx.strokeStyle = 'rgba(20,10,40,0.95)';
    ctx.lineWidth = 6;
    for (const px of [120, 1160]) {
      ctx.beginPath();
      ctx.moveTo(px, VIEW_H - 180);
      ctx.lineTo(px + 10, VIEW_H - 280);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 24;
    ctx.fillText('SOLMAR', VIEW_W / 2, 210);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('NIGHTS', VIEW_W / 2, 300);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('An open-world crime story in a sun-soaked coastal city', VIEW_W / 2, 348);
    const items = ui.saveExists
      ? ['CONTINUE', 'NEW GAME', 'HOW TO PLAY']
      : ['NEW GAME', 'HOW TO PLAY'];
    ctx.font = 'bold 24px system-ui, sans-serif';
    items.forEach((label, i) => {
      const y = 430 + i * 56;
      if (ui.selected === i) {
        ctx.fillStyle = '#ffd23e';
        ctx.fillText(`▶ ${label}`, VIEW_W / 2, y);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(label, VIEW_W / 2, y);
      }
    });
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('WASD move / drive  •  E steal & enter cars  •  Space punch & handbrake  •  Mouse aim, click to shoot', VIEW_W / 2, 640);
    ctx.fillText('Missions, wanted stars, police chases, taxi fares, hidden packages — all yours.  •  M mute', VIEW_W / 2, 664);
    ctx.fillText('A fan-made original. Not affiliated with Rockstar Games or Grand Theft Auto.', VIEW_W / 2, 692);
    ctx.restore();
  }

  function drawHowTo(G, ui) {
    ctx.save();
    screenTransform();
    ctx.fillStyle = '#14101f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HOW TO PLAY', VIEW_W / 2, 90);
    const lines = [
      ['WASD / Arrows', 'Move on foot, drive when in a car'],
      ['Shift', 'Sprint on foot'],
      ['E', 'Steal / enter a car, get out, use shops, take Mara\'s jobs'],
      ['Space', 'Punch on foot — handbrake while driving'],
      ['Mouse + Click', 'Aim and shoot your pistol'],
      ['Q', 'Horn — scatters pedestrians'],
      ['P / Esc', 'Pause'],
      ['M', 'Mute music and sound'],
      ['', ''],
      ['THE CITY', 'Steal cars, take jobs from Mara at the safehouse,'],
      ['', 'run taxi fares in a yellow cab, find 12 hidden packages,'],
      ['', 'buy ammo at Ironworks Arms, respray at Color Rush to lose heat.'],
      ['', ''],
      ['THE HEAT', 'Crimes count when someone sees them. Break line of sight'],
      ['', 'and stay hidden to cool the stars — or respray the car.'],
    ];
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    let y = 150;
    for (const [key, text] of lines) {
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(key, 300, y);
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(text, 520, y);
      y += 32;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ui.selected === 0 ? '▶ BACK TO TITLE' : 'BACK TO TITLE', VIEW_W / 2, 680);
    ctx.restore();
  }

  function drawPaused(G, ui) {
    drawWorld(G);
    ctx.save();
    screenTransform();
    ctx.fillStyle = 'rgba(8,10,18,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', VIEW_W / 2, 220);
    const items = ['RESUME', 'RESTART CURRENT JOB', 'SAVE & QUIT TO TITLE', ui.muted ? 'SOUND: OFF' : 'SOUND: ON'];
    ctx.font = 'bold 22px system-ui, sans-serif';
    items.forEach((label, i) => {
      const y = 320 + i * 52;
      ctx.fillStyle = ui.selected === i ? '#ffd23e' : 'rgba(255,255,255,0.8)';
      ctx.fillText(ui.selected === i ? `▶ ${label}` : label, VIEW_W / 2, y);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`Cash $${G.player.cash}  •  Jobs done ${G.stats.missionsDone}/6  •  Packages ${G.stats.packages}/12  •  Fares ${G.stats.fares}`, VIEW_W / 2, 580);
    ctx.restore();
  }

  function drawOver(G, ui) {
    drawWorld(G);
    ctx.save();
    screenTransform();
    ctx.fillStyle = 'rgba(8,8,12,0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = ui.kind === 'busted' ? '#2e7dff' : '#e74c3c';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ui.kind === 'busted' ? 'BUSTED' : 'WASTED', VIEW_W / 2, 300);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(ui.sub, VIEW_W / 2, 350);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('Press ENTER to get back on the street', VIEW_W / 2, 420);
    ctx.restore();
  }

  function drawEnding(G, ui) {
    ctx.save();
    screenTransform();
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(1, '#2c5364');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KING OF SOLMAR', VIEW_W / 2, 220);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('Every job done. The debt is cleared. The city is yours, Dana.', VIEW_W / 2, 280);
    ctx.font = '17px system-ui, sans-serif';
    const rows = [
      `Cash: $${G.player.cash.toLocaleString('en-US')}`,
      `Jobs completed: ${G.stats.missionsDone} / 6`,
      `Hidden packages: ${G.stats.packages} / 12`,
      `Taxi fares: ${G.stats.fares}`,
      `Cars stolen: ${G.stats.carsStolen}`,
      `Time on the street: ${Math.floor(G.playSeconds / 60)}m ${Math.floor(G.playSeconds % 60)}s`,
    ];
    rows.forEach((row, i) => ctx.fillText(row, VIEW_W / 2, 350 + i * 34));
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('Press ENTER to keep playing the city — free roam', VIEW_W / 2, 620);
    ctx.restore();
  }

  function draw(G, screen, input, ui) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (screen === SCREEN_TITLE) drawTitle(G, ui);
    else if (screen === SCREEN_HOWTO) drawHowTo(G, ui);
    else if (screen === SCREEN_PAUSED) drawPaused(G, ui);
    else if (screen === SCREEN_OVER) drawOver(G, ui);
    else if (screen === SCREEN_ENDING) drawEnding(G, ui);
    else {
      drawWorld(G);
      drawHUD(G, input);
    }
  }

  return { draw, resize, nightFactor, clockText, getView: () => ({ scale, ox, oy }) };
}
