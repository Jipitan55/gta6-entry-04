// HUD: health bar, cash, wanted stars, objective line, ammo, speed, toasts,
// context prompt, and a live canvas minimap (roads, player, mission marker,
// police, traffic). Screens (title / pause / busted / wasted / complete) are
// plain DOM overlays the game shows and hides.

import { CITY, PALETTE } from './config.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.minimap = this.el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.toastTimer = null;
    this.lastObjective = '';
  }

  setHealth(hp) {
    const pct = Math.max(0, Math.min(100, hp));
    this.el('health-fill').style.width = `${pct}%`;
    this.el('health-fill').style.background = pct > 50 ? '#7be382' : pct > 25 ? '#ffd23c' : '#ff4d4d';
    this.el('health-num').textContent = String(Math.ceil(pct));
  }

  setCash(cash) {
    this.el('cash').textContent = `$${cash.toLocaleString('en-US')}`;
  }

  setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < n ? '★' : '☆';
    const el = this.el('stars');
    el.textContent = s;
    el.style.color = n > 0 ? PALETTE.star : '#5a636e';
    el.style.textShadow = n > 0 ? '0 0 8px rgba(255,210,60,.8)' : 'none';
  }

  setAmmo(ammo, mag, reloading) {
    this.el('ammo').textContent = reloading ? 'RELOADING…' : `AMMO ${ammo} / ${mag}`;
  }

  setSpeed(speedKmh, inCar) {
    const el = this.el('speed');
    el.textContent = inCar ? `${Math.round(Math.abs(speedKmh))} km/h` : '';
  }

  setObjective(text, distance) {
    const line = distance == null ? text : `${text} — ${Math.round(distance)}m`;
    if (line !== this.lastObjective) {
      this.el('objective').textContent = line;
      this.lastObjective = line;
    }
  }

  setPrompt(text) {
    const el = this.el('prompt');
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
  }

  toast(text, ms) {
    const el = this.el('toast');
    el.textContent = text;
    el.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.style.opacity = '0';
    }, ms || 3200);
  }

  showCrosshair(show) {
    this.el('crosshair').style.display = show ? 'block' : 'none';
  }

  showScreen(name) {
    for (const id of ['screen-title', 'screen-pause', 'screen-busted', 'screen-wasted', 'screen-complete']) {
      this.el(id).style.display = id === `screen-${name}` ? 'flex' : 'none';
    }
    this.el('hud').style.display = name === 'none' ? 'block' : 'none';
  }

  setTitleButtons(hasSave) {
    this.el('btn-continue').style.display = hasSave ? 'inline-block' : 'none';
  }

  // Minimap: north-up, city fitted to the canvas.
  drawMinimap(world) {
    // world: {playerX, playerZ, playerHeading, inCar, marker:{x,z}|null,
    //         police:[{x,z}], traffic:[{x,z}], peds:[{x,z}]}
    const ctx = this.mm;
    const W = this.minimap.width;
    const H = this.minimap.height;
    const scale = W / (CITY.half * 2 + 20);
    const toX = (x) => W / 2 + x * scale;
    const toY = (z) => H / 2 + z * scale;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#10151c';
    ctx.fillRect(0, 0, W, H);
    // Blocks.
    ctx.fillStyle = '#2a3138';
    for (const bx of CITY.blockCentres) {
      for (const bz of CITY.blockCentres) {
        ctx.fillRect(toX(bx - 22), toY(bz - 22), 44 * scale, 44 * scale);
      }
    }
    // Roads.
    ctx.fillStyle = '#565e68';
    for (const r of CITY.roads) {
      ctx.fillRect(toX(-CITY.half - 4), toY(r - 7), (CITY.half * 2 + 8) * scale, 14 * scale);
      ctx.fillRect(toX(r - 7), toY(-CITY.half - 4), 14 * scale, (CITY.half * 2 + 8) * scale);
    }
    // Park.
    ctx.fillStyle = '#3f6b34';
    ctx.fillRect(toX(-20), toY(-20), 40 * scale, 40 * scale);
    // Traffic.
    ctx.fillStyle = '#c8ccd2';
    for (const c of world.traffic || []) {
      ctx.fillRect(toX(c.x) - 1.5, toY(c.z) - 1.5, 3, 3);
    }
    // Police.
    ctx.fillStyle = '#ff4d4d';
    for (const p of world.police || []) {
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mission marker.
    if (world.marker) {
      const mx = toX(world.marker.x);
      const my = toY(world.marker.z);
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath();
      ctx.moveTo(mx, my - 7);
      ctx.lineTo(mx + 6, my);
      ctx.lineTo(mx, my + 7);
      ctx.lineTo(mx - 6, my);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffd23c';
      ctx.beginPath();
      ctx.arc(mx, my, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Player arrow.
    const px = toX(world.playerX);
    const py = toY(world.playerZ);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-world.playerHeading); // arrow points along the forward vector
    ctx.fillStyle = world.inCar ? '#4fc3f7' : '#7be382';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Border.
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
}
