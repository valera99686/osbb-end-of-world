// Everything a fight draws on its canvas: the arena, the house and the partner,
// the enemies, bullets and effects, the trackers and banners, the boss cards.
// These are methods of Battle (engine.ts installs them on its prototype), kept
// here so that the simulation and its picture live apart: nothing in this file
// changes the state of a fight (two devices in lockstep draw the same fight at
// their own detail), it only reads it.
import type { Battle } from './engine';
import {
  AIM_LOCK,
  COMBO_WINDOW,
  COURIER,
  COURIER_TIME,
  EVENT_COLOR,
  FADE_STEPS,
  FONT,
  INTRO,
  LOW_HP,
  MAGNET_RANGE,
  MEDIC_RANGE,
  MUZZLE,
  OUTRO,
  OVERLOAD_TIME,
  PALETTE,
  SHAKE_MAX,
  SHOW_HITBOXES,
  TRACKING,
  TURRET_Y,
  ZONE_MARK,
  clock,
  edgeLayer,
  glow,
  isLeader,
  rgba,
  type Bullet,
  type Enemy,
  type Particle,
  type Visible,
} from './battle-core';
import { COLORBLIND_HAZARD, STAGGER_TIME, drawHazard } from './bosses';
import { COMBO_CAP, comboMultiplier } from './modes';
import { COOP } from './coop';
import { ENEMY_DEFS, LOCATIONS, campaignBoss } from './encounters';
import { FAMILY, ITEM_BY_ID } from './data';
import { MINIBOSS_TYPE, minibossFor } from './minibosses';
import { RESIDENT_BY_ID } from './residents';
import { type Run, mateRun } from './model';
import { WEAPONS } from './weapons';
import { activeEquipment, equipmentTargets } from './equipment';
import {
  drawArenaFloor,
  drawArenaLight,
  drawProp,
  drawProps,
  propBody,
} from './arena';
import { drawEnemy, drawEnemyGhost } from './enemy-art';
import { fast } from './sprites';
import { heroAbility } from './heroes';
import { pacer } from './pace';

// Static facade of the block: panels, windows lit by modules and crew.
function paintFacade(
  this: Battle,
  c: CanvasRenderingContext2D,
  house: Run = this.run,
) {
  const W = 76,
    H = 86;
  c.fillStyle = '#0a1218';
  c.fillRect(0, 6, W, H - 6);
  const body = c.createLinearGradient(0, 0, W, 0);
  body.addColorStop(0, '#4b606b');
  body.addColorStop(0.5, '#5a707b');
  body.addColorStop(1, '#40545f');
  c.fillStyle = body;
  c.fillRect(2, 8, W - 4, H - 10);
  // Panel seams of a 1970s block.
  c.strokeStyle = '#2f3f48';
  c.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    c.beginPath();
    c.moveTo(2, 8 + i * 15.5);
    c.lineTo(W - 2, 8 + i * 15.5);
    c.stroke();
  }
  for (let i = 1; i < 4; i++) {
    c.beginPath();
    c.moveTo(2 + i * 18, 8);
    c.lineTo(2 + i * 18, H - 2);
    c.stroke();
  }
  const targets = equipmentTargets(house),
    lit = new Map(activeEquipment(house).map((i) => [i.slot, i.id])),
    fw = Math.max(6, ...targets.map((t) => t.x + 1)),
    fh = Math.max(5, ...targets.map((t) => t.y + 1)),
    crew = (house.residents ?? []).map(
      (r) => RESIDENT_BY_ID[r.id]?.color ?? '#f1be69',
    );
  // 4 columns x 5 floors of windows; modules light theirs in family colour.
  const glowing = new Map<string, string>();
  for (const t of targets) {
    const id = lit.get(t.slot);
    if (!id) continue;
    const col = Math.min(3, Math.floor((t.x / fw) * 4)),
      row = Math.min(4, Math.floor((t.y / fh) * 5));
    glowing.set(col + ':' + row, FAMILY[ITEM_BY_ID[id].family].color);
  }
  let n = 0;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 4; col++) {
      const wx = 6 + col * 18,
        wy = 12 + row * 15.5;
      const mod = glowing.get(col + ':' + row);
      const home = !mod && crew.length && (row * 4 + col) % 3 === n++ % 2;
      const color = mod ?? (home ? crew[(row + col) % crew.length] : '');
      if (color) {
        c.globalAlpha = 0.35;
        c.fillStyle = color;
        c.fillRect(wx - 2, wy - 2, 14, 12);
        c.globalAlpha = 1;
        c.fillStyle = mod ? color : '#f1c77a';
      } else c.fillStyle = '#1b2a33';
      c.fillRect(wx, wy, 10, 8);
      c.fillStyle = '#0c151a';
      c.fillRect(wx + 4.5, wy, 1, 8);
      // Balconies on floors 2 and 4.
      if (row === 1 || row === 3) {
        c.fillStyle = '#7d8f96';
        c.fillRect(wx - 2, wy + 8, 14, 2.5);
        c.strokeStyle = '#9fb0b5';
        c.beginPath();
        for (let k = 0; k <= 3; k++) {
          c.moveTo(wx - 1 + k * 4, wy + 8);
          c.lineTo(wx - 1 + k * 4, wy + 4);
        }
        c.stroke();
      }
    }
  // Roof ledge, water tank and the old aerial.
  c.fillStyle = '#a17f54';
  c.fillRect(0, 2, W, 7);
  c.fillStyle = '#2b3f4a';
  c.fillRect(6, -6, 12, 9);
  c.strokeStyle = '#aac0c4';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(64, 3);
  c.lineTo(64, -14);
  c.moveTo(58, -10);
  c.lineTo(70, -10);
  c.moveTo(60, -6);
  c.lineTo(68, -6);
  c.stroke();
  // Entrance with the warm hallway light and the house number.
  c.fillStyle = '#f1be69';
  c.fillRect(W / 2 - 6, H - 16, 12, 14);
  c.fillStyle = '#3a2a16';
  c.fillRect(W / 2 - 6, H - 16, 12, 2);
  c.fillStyle = '#e8e1d2';
  c.font = 'bold 7px ' + FONT;
  c.textAlign = 'center';
  c.fillText('17', W / 2, H - 19);
}

// Roof turret of the armed core, rotating toward its last target.
function drawTurret(this: Battle, c: CanvasRenderingContext2D) {
  const weapon = this.stats.weapon,
    evo = !!this.stats.evolution,
    kick = (this.muzzle / MUZZLE) * 4,
    trim = evo ? '#f0c060' : '#8fa3ab';
  c.save();
  c.translate(0, TURRET_Y);
  c.fillStyle = '#1b2830';
  c.beginPath();
  c.ellipse(0, 4, 13, 6, 0, 0, Math.PI * 2);
  c.fill();
  c.rotate(this.muzzleAngle);
  c.translate(-kick, 0);
  const color = WEAPONS[weapon].color;
  c.strokeStyle = trim;
  c.lineWidth = 1.5;
  if (weapon === 'spread') {
    c.fillStyle = '#51636c';
    c.fillRect(-6, -8, 16, 16);
    c.strokeRect(-6, -8, 16, 16);
    c.fillStyle = '#2b3940';
    for (const o of [-5, 0, 5]) c.fillRect(8, o - 2, 10, 4);
  } else if (weapon === 'rail') {
    c.fillStyle = '#44565f';
    c.fillRect(-6, -4, 34, 8);
    c.strokeRect(-6, -4, 34, 8);
    c.fillStyle = color;
    for (const o of [6, 13, 20]) c.fillRect(o, -6, 3, 12);
  } else if (weapon === 'mortar') {
    c.rotate(
      -this.muzzleAngle - Math.PI / 2 + Math.cos(this.muzzleAngle) * 0.5,
    );
    c.fillStyle = '#5a4a36';
    c.fillRect(-7, -4, 22, 14);
    c.strokeRect(-7, -4, 22, 14);
    c.fillStyle = '#20180f';
    c.beginPath();
    c.arc(15, 3, 6, 0, Math.PI * 2);
    c.fill();
  } else if (weapon === 'arc') {
    c.fillStyle = '#4a5c66';
    c.fillRect(-3, -3, 12, 6);
    c.strokeStyle = color;
    c.lineWidth = 2;
    for (const r of [5, 8, 11]) {
      c.beginPath();
      c.arc(4, 0, r, -0.9, 0.9);
      c.stroke();
    }
    c.fillStyle = color;
    c.beginPath();
    c.arc(14, 0, 4.5, 0, Math.PI * 2);
    c.fill();
  } else if (weapon === 'coins') {
    c.fillStyle = '#6b5a2a';
    c.beginPath();
    c.arc(0, 0, 9, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = color;
    c.fillRect(-7, -2, 14, 4);
    c.fillStyle = '#3d3318';
    c.fillRect(8, -3, 11, 6);
  } else if (weapon === 'flame') {
    c.fillStyle = '#8a3b22';
    c.beginPath();
    c.ellipse(-3, 0, 9, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#39434a';
    c.fillRect(4, -3, 14, 6);
    c.fillStyle = color;
    c.fillRect(17, -2, 3, 4);
  } else {
    c.fillStyle = '#51636c';
    c.beginPath();
    c.arc(0, 0, 9, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#2b3940';
    c.fillRect(4, -3.5, 20, 7);
  }
  if (evo) {
    c.fillStyle = '#f0c060';
    c.beginPath();
    c.arc(-2, 0, 2.5, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function drawHouse(
  this: Battle,
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  const speed = Math.min(1, Math.hypot(this.vx, this.vy) / 120),
    walk = this.fxClock * (4 + speed * 9),
    bob = Math.sin(walk * 2) * (0.6 + speed * 1.6);
  c.fillStyle = '#0006';
  c.beginPath();
  c.ellipse(0, 24, 50, 17, 0, 0, Math.PI * 2);
  c.fill();
  // Four hydraulic legs, diagonal pairs stepping together.
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1,
      front = i < 2 ? -1 : 1,
      phase = walk + (i === 0 || i === 3 ? 0 : Math.PI),
      lift = Math.max(0, Math.sin(phase)) * 7 * (0.35 + speed),
      swing = Math.cos(phase) * 5 * (0.35 + speed);
    const hipX = side * 26,
      hipY = -6 + front * 8,
      kneeX = side * 44,
      kneeY = -18 + front * 8 - lift * 0.5,
      footX = side * 46 + swing,
      footY = 18 + front * 7 - lift;
    c.strokeStyle = '#091116';
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(hipX, hipY);
    c.lineTo(kneeX, kneeY);
    c.lineTo(footX, footY);
    c.stroke();
    c.strokeStyle = '#6d8290';
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = '#c29a5c';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo((hipX + kneeX) / 2, (hipY + kneeY) / 2 + 3);
    c.lineTo((kneeX + footX) / 2, (kneeY + footY) / 2);
    c.stroke();
    c.fillStyle = '#c29a5c';
    c.fillRect(kneeX - 3.5, kneeY - 3.5, 7, 7);
    c.fillStyle = '#26343c';
    c.fillRect(footX - 7, footY - 2, 14, 5);
  }
  c.lineCap = 'butt';
  const flicker = this.invincible > 0 && Math.floor(this.elapsed * 16) % 2;
  if (flicker) c.globalAlpha = 0.55;
  const mate = this.drawingMate,
    house = mate ? mateRun(this.run) : this.run;
  const key = [
    this.stats.weapon,
    this.stats.evolution,
    activeEquipment(house)
      .map((i) => i.slot + i.id)
      .join(','),
    (house.residents ?? []).map((r) => r.id).join(','),
  ].join('|');
  if ((mate ? this.mateFacade : this.facade)?.key !== key) {
    let canvas: HTMLCanvasElement | null = null;
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = 76 * 2;
      canvas.height = 104 * 2;
      const fc = canvas.getContext('2d');
      if (fc) {
        fc.scale(2, 2);
        fc.translate(0, 16);
        this.paintFacade(fc, house);
      } else canvas = null;
    }
    if (mate) this.mateFacade = { key, canvas };
    else this.facade = { key, canvas };
  }
  c.translate(0, bob);
  const made = mate ? this.mateFacade : this.facade;
  if (made?.canvas) c.drawImage(fast(made.canvas), -38, -76, 76, 104);
  else {
    c.save();
    c.translate(-38, -60);
    this.paintFacade(c, house);
    c.restore();
  }
  this.drawTurret(c);
  c.restore();
}

// The partner: a second house on its own legs, the very same build, with a
// ring of their hero's colour on the ground, a plate with the player number
// and a health bar. When down, the house lies dim in the yard and a ring
// shows how far the revive has come.
function drawAlly(this: Battle, c: CanvasRenderingContext2D) {
  const a = this.ally;
  if (!a) return;
  const color = heroAbility(a.hero).color,
    TAU = Math.PI * 2;
  // The house is drawn from the first house's own state (legs, muzzle,
  // flicker): lend it the partner's for the moment.
  const own = {
    vx: this.vx,
    vy: this.vy,
    muzzle: this.muzzle,
    angle: this.muzzleAngle,
    invincible: this.invincible,
    stats: this.stats,
  };
  // Its own weapon and modules on the facade.
  this.stats = this.mateStats;
  this.drawingMate = true;
  this.vx = a.down ? 0 : a.vx;
  this.vy = a.down ? 0 : a.vy;
  this.muzzle = a.muzzle;
  this.muzzleAngle = a.aim;
  this.invincible = a.invincible;
  c.save();
  c.translate(a.x, a.y);
  if (a.down) c.globalAlpha = 0.5;
  try {
    this.drawHouse(c, 0, a.down ? 8 : 0, a.down ? 0.94 : 1);
  } finally {
    this.stats = own.stats;
    this.drawingMate = false;
  }
  c.globalAlpha = 1;
  this.vx = own.vx;
  this.vy = own.vy;
  this.muzzle = own.muzzle;
  this.muzzleAngle = own.angle;
  this.invincible = own.invincible;
  // The player's colour under the house.
  c.strokeStyle = color;
  c.globalAlpha = a.down ? 0.3 : 0.6;
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(0, 24, 58, 21, 0, 0, TAU);
  c.stroke();
  c.globalAlpha = 1;
  if (a.down) {
    // Where the first house has to stand, and how much of the revive is done.
    c.strokeStyle = 'rgba(138,205,182,0.28)';
    c.lineWidth = 2;
    c.setLineDash([6, 8]);
    c.beginPath();
    c.arc(0, 0, COOP.reviveRadius, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#8acdb6';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + TAU * a.revive);
    c.stroke();
    c.fillStyle = '#8acdb6';
    c.font = `700 11px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('ПІДНІМИ', 0, -96);
  } else {
    const share = Math.max(0, Math.min(1, a.hp / a.max));
    c.fillStyle = '#0b1217cc';
    c.fillRect(-26, -96, 52, 7);
    c.fillStyle = share < 0.35 ? '#e69080' : color;
    c.fillRect(-25, -95, 50 * share, 5);
  }
  c.fillStyle = a.down ? '#8acdb6' : color;
  c.beginPath();
  c.arc(a.down ? 0 : -38, a.down ? -108 : -96, 8, 0, TAU);
  c.fill();
  c.fillStyle = '#0b1217';
  c.font = `800 11px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('2', a.down ? 0 : -38, a.down ? -107.5 : -95.5);
  c.restore();
  c.textAlign = 'start';
  c.textBaseline = 'alphabetic';
}

function glowAt(
  this: Battle,
  c: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  radius: number,
  alpha: number,
) {
  const sprite = glow(color, radius);
  if (!sprite || alpha <= 0) return;
  c.globalAlpha = Math.min(1, alpha);
  c.drawImage(fast(sprite), x - radius, y - radius, radius * 2, radius * 2);
  c.globalAlpha = 1;
}

function draw(this: Battle) {
  const c = this.ctx,
    canvas = this.canvas;
  if (!c || !canvas) return;
  const rect = canvas.getBoundingClientRect(),
    dpr = pacer.ratio(window.devicePixelRatio, rect.width, rect.height);
  if (
    canvas.width !== Math.round(rect.width * dpr) ||
    canvas.height !== Math.round(rect.height * dpr)
  ) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const w = rect.width,
    h = rect.height;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#0b171e';
  c.fillRect(0, 0, w, h);
  const zoom = Math.max(0.55, Math.min(1.08, Math.min(w / 850, h / 570)));
  // With a partner the camera sits between the two of them.
  const lean = this.ally ? this.allyFocus * 0.5 : 0,
    focusX = this.ally ? this.x + (this.ally.x - this.x) * lean : this.x,
    focusY = this.ally ? this.y + (this.ally.y - this.y) * lean : this.y;
  const cameraX = Math.max(
    w / 2 / zoom - 25,
    Math.min(1625 - w / 2 / zoom, focusX),
  );
  const cameraY = Math.max(
    h / 2 / zoom - 25,
    Math.min(1025 - h / 2 / zoom, focusY),
  );
  // Trauma only decays in tick(), so a paused frame holds still.
  const shake = this.paused
      ? 0
      : this.trauma * this.trauma * SHAKE_MAX * this.settings.shake,
    shakeAngle = Math.random() * Math.PI * 2;
  c.save();
  c.translate(
    w / 2 - cameraX * zoom + Math.cos(shakeAngle) * shake,
    h / 2 - cameraY * zoom + Math.sin(shakeAngle) * shake,
  );
  c.scale(zoom, zoom);
  const halfW = w / 2 / zoom,
    halfH = h / 2 / zoom;
  const visible: Visible = (x, y, margin = 60) =>
    Math.abs(x - cameraX) < halfW + margin &&
    Math.abs(y - cameraY) < halfH + margin;
  this.view = { x: cameraX, y: cameraY, w: w / zoom, h: h / zoom, zoom };
  const location = LOCATIONS[this.run.chapter],
    colorblind = this.settings.colorblind;
  if (!drawArenaFloor(c, this.run.chapter, location.background)) {
    // Procedural floor while the art loads or when it is missing.
    const bg = c.createLinearGradient(0, 0, 1600, 1000);
    bg.addColorStop(0, location.background[0]);
    bg.addColorStop(1, location.background[1]);
    c.fillStyle = bg;
    c.fillRect(0, 0, 1600, 1000);
    c.strokeStyle = '#26394266';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= 1600; x += 80) {
      c.moveTo(x, 0);
      c.lineTo(x, 1000);
    }
    for (let y = 0; y <= 1000; y += 80) {
      c.moveTo(0, y);
      c.lineTo(1600, y);
    }
    c.stroke();
    c.fillStyle = '#0b151b80';
    for (let i = 0; i < 45; i++) {
      const xx = (i * 293 + (this.run.seed % 177)) % 1520,
        yy = (i * 173 + 77) % 950;
      c.fillRect(xx, yy, 18 + (i % 4) * 7, 9 + (i % 3) * 8);
      c.fillStyle = '#4b64722b';
      c.fillRect(xx + 3, yy + 2, 9, 2);
      c.fillStyle = '#0b151b80';
    }
  }
  c.strokeStyle = location.color + '65';
  c.lineWidth = 4;
  c.setLineDash([16, 12]);
  c.strokeRect(25, 25, 1550, 950);
  c.setLineDash([]);
  drawProps(
    c,
    this.props,
    this.run.chapter,
    this.elapsed,
    true,
    colorblind,
    visible,
  );
  drawArenaLight(c, this.x, this.y - 10, '#ffd79a');
  if (this.ally && !this.ally.down)
    drawArenaLight(
      c,
      this.ally.x,
      this.ally.y - 6,
      heroAbility(this.ally.hero).color,
    );
  this.ambient?.draw(c);
  this.drawAuras(c, visible);
  for (const hazard of this.hazards) drawHazard(c, hazard, this.settings);
  for (const t of this.trails) {
    if (!visible(t.x, t.y)) continue;
    const k = Math.min(1, t.life / 2);
    this.glowAt(c, '#ff8a3d', t.x, t.y, 20, 0.55 * k);
    c.fillStyle = 'rgba(255,196,110,' + (0.5 * k).toFixed(3) + ')';
    c.beginPath();
    c.arc(t.x, t.y, 7 + 3 * Math.sin(this.elapsed * 18 + t.x), 0, Math.PI * 2);
    c.fill();
  }
  this.drawTelegraphs(c, visible);
  for (const d of this.drops) {
    if (!visible(d.x, d.y)) continue;
    const color =
      d.kind === 'coin' ? '#eeb657' : d.kind === 'heal' ? '#ed9d8c' : '#79c8b3';
    this.glowAt(c, color, d.x, d.y, d.kind === 'heal' ? 13 : 10, 0.85);
    c.fillStyle = color;
    c.beginPath();
    if (d.kind === 'xp') {
      c.moveTo(d.x, d.y - 5);
      c.lineTo(d.x + 4, d.y);
      c.lineTo(d.x, d.y + 5);
      c.lineTo(d.x - 4, d.y);
    } else c.arc(d.x, d.y, d.kind === 'heal' ? 5 : 3, 0, Math.PI * 2);
    c.fill();
  }
  const actors = [
    // Where each one stands on the ground (the house's shadow is 24 below
    // its centre, an enemy's feet are a little below its middle): what is
    // lower on the screen is nearer and is drawn later.
    ...this.enemies.map((enemy) => ({
      y: enemy.y + enemy.r * 0.5,
      enemy,
      dying: 0,
      partner: false,
    })),
    ...this.defeated.map((enemy) => ({
      y: enemy.y + enemy.r * 0.5,
      enemy,
      dying: 1 - enemy.life / 0.48,
      partner: false,
    })),
    { y: this.y + 24, enemy: null, dying: 0, partner: false },
    ...(this.ally
      ? [{ y: this.ally.y + 24, enemy: null, dying: 0, partner: true }]
      : []),
  ].sort((a, b) => a.y - b.y);
  const wrecked = this.ended && this.run.hp <= 0;
  // The standing props are drawn among them by depth: an object nearer to the
  // viewer than the house hides the part of it behind, instead of the house
  // being drawn over it.
  const standing = this.props.filter(
    (p) => !p.flat && visible(p.x, p.y, p.size),
  );
  let nextProp = 0;
  const propsBefore = (ground: number) => {
    while (nextProp < standing.length && standing[nextProp].y <= ground)
      drawProp(
        c,
        standing[nextProp++],
        this.run.chapter,
        this.elapsed,
        colorblind,
      );
  };
  for (const actor of actors) {
    propsBefore(actor.y);
    const e = actor.enemy;
    if (!e && actor.partner) {
      if (!wrecked) this.drawAlly(c);
    } else if (!e) {
      if (!wrecked) this.drawHouse(c, this.x, this.y);
      else if (this.outro > 0) {
        c.globalAlpha = Math.min(1, this.outro / OUTRO.lose);
        this.drawHouse(c, this.x, this.y + (1 - c.globalAlpha) * 10, 0.94);
        c.globalAlpha = 1;
      }
    } else if (!this.onScreen(e, actor.dying, visible)) continue;
    else if (e.type === COURIER) this.drawCourier(c, e, actor.dying);
    else {
      const affix = this.affixStyle(e);
      if (affix && e.trail && !actor.dying)
        for (let i = 0; i < e.trail.length; i += 2)
          drawEnemyGhost(
            c,
            e,
            this.run.chapter,
            e.trail[i],
            e.trail[i + 1],
            0.3 * (1 - i / e.trail.length),
            affix.color,
            this.run.bossVariants[this.run.chapter],
            this.minibossVariant,
          );
      drawEnemy(
        c,
        e,
        this.run.chapter,
        this.elapsed,
        actor.dying,
        this.run.bossVariants[this.run.chapter],
        this.minibossVariant,
        colorblind,
        affix,
      );
      if (!actor.dying && (e.stagger ?? 0) > 0) this.drawStagger(c, e);
      if (!actor.dying && (e.burn ?? 0) > 0)
        this.glowAt(
          c,
          '#ff8a3d',
          e.x,
          e.y - 6,
          e.r + 10,
          0.35 + 0.2 * Math.sin(this.elapsed * 20),
        );
      if (!actor.dying && (e.slow ?? 0) > 0) {
        c.strokeStyle = 'rgba(166,222,255,0.7)';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2);
        c.stroke();
      }
    }
  }
  propsBefore(Infinity);
  if (this.muzzle > 0 && !wrecked) this.drawMuzzle(c);
  for (const [at, st] of this.orbiters()) {
    for (let i = 0; i < st.drones; i++) {
      const a = this.elapsed * 0.8 + (i * Math.PI * 2) / st.drones;
      const x = at.x + Math.cos(a) * 85,
        y = at.y + Math.sin(a) * 65;
      c.fillStyle = '#e8bd74';
      c.fillRect(x - 7, y - 4, 14, 8);
      c.strokeStyle = '#78a7bb';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x - 15, y - 6);
      c.lineTo(x + 15, y - 6);
      c.stroke();
    }
    for (let i = 0; i < st.orbit; i++) {
      const a = this.elapsed * 2 + (i * Math.PI * 2) / st.orbit,
        x = at.x + Math.cos(a) * 105,
        y = at.y + Math.sin(a) * 85;
      this.glowAt(c, '#6abbff', x, y, 22, 0.9);
      c.fillStyle = '#8cc5ed';
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.fill();
    }
  }
  this.drawBullets(c, visible);
  this.drawShells(c);
  if (this.pulseRing) {
    c.strokeStyle = `rgba(126,204,223,${this.pulseRing})`;
    c.lineWidth = 5;
    c.beginPath();
    c.arc(this.x, this.y, (0.55 - this.pulseRing) * 470, 0, Math.PI * 2);
    c.stroke();
  }
  if (this.hasteTime > 0) {
    c.strokeStyle = `rgba(240,193,94,${Math.min(0.85, this.hasteTime)})`;
    c.lineWidth = 3;
    c.setLineDash([3, 9]);
    c.beginPath();
    c.arc(this.x, this.y, 48, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }
  if (this.auditTime > 0) {
    c.strokeStyle = `rgba(240,196,102,${Math.min(0.85, this.auditTime)})`;
    c.lineWidth = 3;
    c.setLineDash([8, 8]);
    c.beginPath();
    c.arc(this.x, this.y, 52, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }
  for (const r of this.rings) {
    const k = 1 - r.life / r.max,
      grow = 1 - (1 - k) * (1 - k);
    c.globalAlpha = (1 - k) * 0.85;
    c.strokeStyle = r.color;
    c.lineWidth = Math.max(0.5, r.width * (1 - k * 0.6));
    c.beginPath();
    c.arc(r.x, r.y, r.radius * (0.15 + 0.85 * grow), 0, Math.PI * 2);
    c.stroke();
  }
  c.globalAlpha = 1;
  this.drawParticles(c, visible);
  this.drawNumbers(c);
  c.globalAlpha = 1;
  if (SHOW_HITBOXES) this.drawHitboxes(c, visible);
  c.restore();
  this.drawOverlay(c, w, h);
  if (this.settings.fps) this.drawFps(c, w, h);
}

// ?hitboxes in the address: what blocks and what is hit, drawn over the fight
// (red: obstacles; orange: explosive props; blue: the house and the partner;
// yellow: enemies; the second yellow ring is where a walking enemy is stopped).
function drawHitboxes(
  this: Battle,
  c: CanvasRenderingContext2D,
  visible: Visible,
) {
  const ring = (
    x: number,
    y: number,
    r: number,
    color: string,
    dash = false,
  ) => {
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    c.setLineDash(dash ? [4, 3] : []);
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
  };
  c.save();
  c.globalAlpha = 0.9;
  for (const s of this.solids)
    if (visible(s.x, s.y, s.r)) ring(s.x, s.y, s.r, '#ff4040');
  for (const p of this.explosives)
    if (!p.blown) for (const s of propBody(p)) ring(s.x, s.y, s.r, '#ff9a2e');
  ring(this.x, this.y, 24, '#4aa3ff');
  if (this.ally) ring(this.ally.x, this.ally.y, 24, '#4aa3ff', true);
  for (const e of this.enemies) {
    if (e.hp <= 0 || !visible(e.x, e.y, e.r)) continue;
    ring(e.x, e.y, e.r, '#ffe14a');
    ring(e.x, e.y, e.r * 0.7, '#ffe14a', true);
  }
  c.setLineDash([]);
  c.restore();
}

function drawMuzzle(this: Battle, c: CanvasRenderingContext2D) {
  const k = this.muzzle / MUZZLE,
    soft = this.settings.reducedFlashes ? 0.5 : 1,
    x = this.x + Math.cos(this.muzzleAngle) * 26,
    y = this.y + TURRET_Y + Math.sin(this.muzzleAngle) * 26;
  this.glowAt(c, '#ffe2a8', x, y, 18, k * 0.9 * soft);
  c.save();
  c.translate(x, y);
  c.rotate(this.muzzleAngle);
  c.globalAlpha = k * soft;
  c.fillStyle = '#fff3cf';
  c.beginPath();
  c.moveTo(-2, -4 * k);
  c.lineTo(8 + 14 * k, 0);
  c.lineTo(-2, 4 * k);
  c.closePath();
  c.fill();
  c.restore();
}

// Weapon-core projectiles: pellets, rail slugs, coins and flame.
function drawShot(
  this: Battle,
  c: CanvasRenderingContext2D,
  b: Bullet,
  base: string,
) {
  const core = WEAPONS[this.stats.weapon].color,
    color = b.crit ? base : this.settings.colorblind ? base : core,
    speed = Math.hypot(b.vx, b.vy) || 1,
    ux = b.vx / speed,
    uy = b.vy / speed;
  if (b.kind === 'rail') {
    this.glowAt(c, color, b.x, b.y, 14, 0.9);
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.moveTo(b.x - ux * 70, b.y - uy * 70);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.globalAlpha = 1;
  } else if (b.kind === 'coin') {
    this.glowAt(c, color, b.x, b.y, 10, 0.7);
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(
      b.x,
      b.y,
      5 * Math.abs(Math.cos((b.age ?? 0) * 22)) + 1,
      5,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
  } else if (b.kind === 'rocket') {
    // A short body with a flame behind it, pointing where it flies.
    c.strokeStyle = 'rgba(255,170,90,0.55)';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(b.x - ux * 26, b.y - uy * 26);
    c.lineTo(b.x - ux * 8, b.y - uy * 8);
    c.stroke();
    this.glowAt(c, color, b.x - ux * 8, b.y - uy * 8, 11, 0.8);
    c.strokeStyle = '#e9ddc7';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(b.x - ux * 8, b.y - uy * 8);
    c.lineTo(b.x + ux * 4, b.y + uy * 4);
    c.stroke();
    c.fillStyle = '#ff7a3d';
    c.beginPath();
    c.arc(b.x + ux * 5, b.y + uy * 5, 2.6, 0, Math.PI * 2);
    c.fill();
  } else if (b.kind === 'flame') {
    const k = Math.min(1, (b.age ?? 0) / 0.38);
    c.globalAlpha = 0.75 * (1 - k * 0.8);
    this.glowAt(c, '#ff8a3d', b.x, b.y, 10 + k * 14, 0.8);
    c.fillStyle = k < 0.4 ? '#ffe7a8' : '#ff9a4d';
    c.beginPath();
    c.arc(b.x, b.y, 4 + k * 8, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  } else {
    this.glowAt(c, color, b.x, b.y, 7, 0.7);
    c.fillStyle = color;
    c.beginPath();
    c.arc(b.x, b.y, 2.6, 0, Math.PI * 2);
    c.fill();
  }
}

function drawShells(this: Battle, c: CanvasRenderingContext2D) {
  for (const sh of this.shells) {
    const k = sh.t / sh.T,
      x = sh.sx + (sh.tx - sh.sx) * k,
      y = sh.sy + (sh.ty - sh.sy) * k - Math.sin(k * Math.PI) * 120;
    c.strokeStyle = 'rgba(255,179,107,' + (0.25 + k * 0.5).toFixed(2) + ')';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(sh.tx, sh.ty, sh.radius * (0.4 + k * 0.6), 0, Math.PI * 2);
    c.stroke();
    this.glowAt(c, '#ffb36b', x, y, 12, 0.8);
    c.fillStyle = '#3a2a16';
    c.beginPath();
    c.arc(x, y, 5, 0, Math.PI * 2);
    c.fill();
  }
  for (const a of this.arcs) {
    c.strokeStyle = this.settings.colorblind ? '#ffffff' : '#c9ecff';
    c.lineWidth = 2.5;
    c.globalAlpha = Math.min(1, a.life / 0.14);
    c.beginPath();
    for (let i = 0; i < a.pts.length; i += 2) {
      if (!i) c.moveTo(a.pts[0], a.pts[1]);
      else {
        const mx = (a.pts[i - 2] + a.pts[i]) / 2 + (Math.random() - 0.5) * 18,
          my = (a.pts[i - 1] + a.pts[i + 1]) / 2 + (Math.random() - 0.5) * 18;
        c.lineTo(mx, my);
        c.lineTo(a.pts[i], a.pts[i + 1]);
      }
    }
    if (a.bold) {
      const alpha = c.globalAlpha;
      c.lineWidth = 10;
      c.globalAlpha = alpha * 0.28;
      c.stroke();
      c.lineWidth = 3.5;
      c.globalAlpha = alpha;
    }
    c.stroke();
    c.globalAlpha = 1;
  }
}

function drawBullets(
  this: Battle,
  c: CanvasRenderingContext2D,
  visible: Visible,
) {
  const palette = this.settings.colorblind
    ? PALETTE.colorblind
    : PALETTE.normal;
  for (const b of this.bullets) {
    if (b.life <= 0 || !visible(b.x, b.y)) continue;
    const color = b.enemy
        ? palette.enemy
        : b.crit
          ? palette.crit
          : b.over
            ? palette.over
            : palette.player,
      r = b.enemy || b.crit ? 5 : b.over ? 4 : 3,
      speed = Math.hypot(b.vx, b.vy) || 1,
      tail = Math.min(b.enemy ? 0.09 : 0.045, b.age ?? 1) * speed;
    if (tail > 2) {
      // Tapered trail along the velocity, thinning to a point.
      const ux = b.vx / speed,
        uy = b.vy / speed;
      c.globalAlpha = 0.42;
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(b.x - ux * tail, b.y - uy * tail);
      c.lineTo(b.x - uy * r * 0.8, b.y + ux * r * 0.8);
      c.lineTo(b.x + uy * r * 0.8, b.y - ux * r * 0.8);
      c.closePath();
      c.fill();
    }
    if (!b.enemy && b.kind) {
      this.drawShot(c, b, color);
      continue;
    }
    this.glowAt(c, color, b.x, b.y, r * 3, 0.85);
    c.fillStyle = color;
    c.beginPath();
    c.arc(b.x, b.y, r, 0, Math.PI * 2);
    c.fill();
    if (b.enemy && this.settings.colorblind) {
      c.strokeStyle = '#1a0014';
      c.lineWidth = 1.5;
      c.stroke();
    }
    if (b.enemy && b.over) {
      // Overloaded shots carry an electric ring.
      c.strokeStyle = palette.over;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(b.x, b.y, r + 3, 0, Math.PI * 2);
      c.stroke();
    }
  }
  c.globalAlpha = 1;
}

// Ground layer under actors: medic auras and magnetic fields.
function drawAuras(
  this: Battle,
  c: CanvasRenderingContext2D,
  visible: Visible,
) {
  const t = this.elapsed;
  for (const e of this.enemies) {
    if (e.chief && e.hp > 0 && visible(e.x, e.y, e.r * 2)) {
      // The squad leader: a gold double ring on the floor.
      const beat = 0.5 + 0.5 * Math.sin(t * 4 + e.visualSeed),
        y = e.y + e.r * 0.45 + 5;
      c.strokeStyle = this.settings.colorblind ? '#ffffff' : '#ffd166';
      c.lineWidth = 3;
      c.globalAlpha = 0.45 + beat * 0.3;
      c.beginPath();
      c.ellipse(e.x, y, e.r * 1.7, e.r * 0.75, 0, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 1.5;
      c.globalAlpha = 0.3;
      c.beginPath();
      c.ellipse(e.x, y, e.r * 2.1, e.r * 0.95, 0, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
    if (e.hp <= 0 || (e.affix !== 'medic' && e.affix !== 'magnetic')) continue;
    // The circle reaches its full radius from the enemy.
    const radius = e.affix === 'medic' ? MEDIC_RANGE : MAGNET_RANGE;
    if (!visible(e.x, e.y, radius + 4)) continue;
    if (e.affix === 'medic') {
      const color = this.affixStyle(e)!.color,
        beat = 0.5 + 0.5 * Math.sin(t * 3 + e.visualSeed);
      c.fillStyle = color;
      c.globalAlpha = 0.05 + beat * 0.04;
      c.beginPath();
      c.arc(e.x, e.y, MEDIC_RANGE, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.globalAlpha = 0.3 + beat * 0.2;
      c.setLineDash([10, 8]);
      c.lineDashOffset = -t * 20;
      c.stroke();
      c.setLineDash([]);
      c.lineDashOffset = 0;
    } else if (e.affix === 'magnetic') {
      const blue = '#7cc8ff';
      c.strokeStyle = blue;
      c.globalAlpha = 0.1;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(e.x, e.y, MAGNET_RANGE, 0, Math.PI * 2);
      c.stroke();
      // Two arcs spinning around the body.
      c.globalAlpha = 0.75;
      c.lineWidth = 2.5;
      for (let i = 0; i < 2; i++) {
        const a = t * 3.4 + i * Math.PI + e.visualSeed;
        c.beginPath();
        c.arc(e.x, e.y - e.r * 0.3, e.r + 14, a, a + 1.1);
        c.stroke();
      }
    }
  }
  c.globalAlpha = 1;
}

// Event courier: a wheeled robot hauling a parcel, with its escape timer.
function drawCourier(
  this: Battle,
  c: CanvasRenderingContext2D,
  e: Enemy,
  dying: number,
) {
  const gold = EVENT_COLOR.courier,
    t = this.elapsed,
    bounce = Math.abs(Math.sin(e.walk * 0.9)) * 2.5;
  const beat = 0.5 + 0.5 * Math.sin(t * 6);
  if (!dying) this.glowAt(c, gold, e.x, e.y - 16, 50, 0.7 + beat * 0.3);
  c.save();
  c.translate(e.x, e.y);
  if (dying) {
    c.globalAlpha = Math.max(0, 1 - dying);
    c.scale(1 + dying * 0.4, 1 - dying * 0.3);
  }
  c.fillStyle = '#050c1190';
  c.beginPath();
  c.ellipse(0, 14, 27, 9, 0, 0, Math.PI * 2);
  c.fill();
  // Pulsing gold ring on the ground: it reads apart from the decor.
  c.strokeStyle = gold;
  c.lineWidth = 2.5;
  c.globalAlpha *= 0.45 + beat * 0.45;
  c.beginPath();
  c.ellipse(0, 14, 30 + beat * 4, 11 + beat * 1.5, 0, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha = dying ? Math.max(0, 1 - dying) : 1;
  c.scale(e.facing * 1.3, 1.3);
  c.translate(0, -bounce);
  c.fillStyle = '#0a1116';
  for (const x of [-11, 11]) {
    c.beginPath();
    c.arc(x, 8 + bounce, 5.5, 0, Math.PI * 2);
    c.fill();
  }
  const lit = e.hit > 0;
  c.fillStyle = gold;
  c.fillRect(-17, -11, 34, 20);
  c.fillStyle = lit ? '#fff1d5' : '#40525f';
  c.fillRect(-15, -9, 30, 16);
  c.fillStyle = '#93e2ff';
  c.fillRect(6, -5, 6, 4);
  // Parcel strapped on top.
  c.fillStyle = gold;
  c.fillRect(-13, -28, 26, 21);
  c.fillStyle = lit ? '#fff6e6' : '#b87a40';
  c.fillRect(-11, -26, 22, 17);
  c.fillStyle = '#ffe9a8';
  c.fillRect(-11, -19, 22, 3);
  c.fillRect(-1.5, -26, 3, 17);
  // Antenna blinks faster as time runs out.
  const left = this.event?.courier === e ? this.event.left : COURIER_TIME;
  const blink = Math.sin(t * (left < 4 ? 22 : 8)) > 0;
  c.strokeStyle = '#9fb0c4';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-10, -8);
  c.lineTo(-14, -34);
  c.stroke();
  c.fillStyle = blink ? '#ff6b5a' : '#5a2320';
  c.fillRect(-16, -37, 4, 4);
  c.restore();
  if (dying || this.event?.courier !== e) return;
  const k = Math.max(0, this.event.left / COURIER_TIME),
    y = e.y - 62;
  c.fillStyle = '#08131c';
  c.fillRect(e.x - 18, y - 1, 36, 5);
  c.fillStyle = gold;
  c.fillRect(e.x - 17, y, 34 * k, 3);
  c.fillStyle = '#e9e2d4';
  c.fillRect(e.x - 17, y + 5, 34 * Math.max(0, e.hp / e.max), 2);
}

function drawParticles(
  this: Battle,
  c: CanvasRenderingContext2D,
  visible: Visible,
) {
  const ts = this.settings.textScale || 1;
  c.textAlign = 'center';
  c.lineJoin = 'round';
  // Particles of one colour and one step of fade go in one path: a burst of
  // twenty sparks is one stroke, not twenty (on a phone every fill and
  // stroke costs, much more than the shapes inside it).
  const groups = new Map<string, Particle[]>();
  // A weak screen draws every other one (pace.ts Pacer.lean); the words that
  // float up (a label, a bonus) are always drawn.
  let odd = false;
  for (const p of this.particles) {
    if (!visible(p.x, p.y)) continue;
    if (pacer.lean && !p.text && (odd = !odd)) continue;
    const alpha = Math.max(0, Math.min(1, p.life / p.max));
    if (p.text) {
      c.globalAlpha = alpha;
      c.fillStyle = p.color;
      c.font = `700 ${Math.round(14 * ts)}px ${FONT}`;
      c.strokeStyle = '#081016';
      c.lineWidth = 3;
      c.strokeText(p.text, p.x, p.y);
      c.fillText(p.text, p.x, p.y);
      continue;
    }
    const step = Math.min(FADE_STEPS - 1, Math.floor(alpha * FADE_STEPS));
    // Sparks are lines: their width goes in half-pixel steps.
    const key =
      p.shape === 'spark'
        ? `s|${p.color}|${step}|${Math.max(0.5, Math.round(p.size * 1.4) / 2)}`
        : `f|${p.color}|${step}`;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  for (const [key, list] of groups) {
    const [kind, color, step, width] = key.split('|');
    c.globalAlpha = (Number(step) + 0.5) / FADE_STEPS;
    c.beginPath();
    if (kind === 's') {
      for (const p of list) {
        const v = Math.hypot(p.vx, p.vy) || 1;
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - (p.vx / v) * p.size * 4, p.y - (p.vy / v) * p.size * 4);
      }
      c.strokeStyle = color;
      c.lineWidth = Number(width);
      c.stroke();
      continue;
    }
    for (const p of list) {
      const s = p.size,
        rot = p.rot ?? 0;
      switch (p.shape) {
        case 'shard': {
          const cos = Math.cos(rot) * s,
            sin = Math.sin(rot) * s;
          c.moveTo(p.x + cos, p.y + sin);
          c.lineTo(p.x - cos * 0.6 - sin * 0.7, p.y - sin * 0.6 + cos * 0.7);
          c.lineTo(p.x - cos * 0.4 + sin * 0.8, p.y - sin * 0.4 - cos * 0.8);
          c.closePath();
          break;
        }
        case 'leaf':
          c.moveTo(p.x + Math.cos(rot) * s, p.y + Math.sin(rot) * s);
          c.ellipse(p.x, p.y, s, s * 0.45, rot, 0, Math.PI * 2);
          break;
        case 'spore':
          c.moveTo(p.x + s, p.y);
          c.arc(p.x, p.y, s, 0, Math.PI * 2);
          break;
        default:
          c.rect(p.x, p.y, s, s);
      }
    }
    c.fillStyle = color;
    c.fill();
  }
  c.globalAlpha = 1;
}

function drawFps(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const m = this.fpsMeter,
    now = clock();
  if (m.last) m.worst = Math.max(m.worst, now - m.last);
  m.last = now;
  m.frames++;
  if (!m.at) m.at = now;
  if (now - m.at >= 1000) {
    const fps = Math.round((m.frames * 1000) / (now - m.at));
    m.text = `${fps} FPS · найдовший ${Math.round(m.worst)} мс · якість ${Math.round(pacer.detail * 100)}%${pacer.lean ? ' · ощадно' : ''}`;
    m.at = now;
    m.frames = 0;
    m.worst = 0;
  }
  if (!m.text) return;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  const scale = c.canvas.width / Math.max(1, w);
  c.scale(scale, scale);
  c.font = `700 11px ${FONT}`;
  c.textAlign = 'left';
  c.textBaseline = 'bottom';
  const tw = c.measureText(m.text).width;
  c.fillStyle = '#050b10cc';
  c.fillRect(6, h - 24, tw + 12, 18);
  c.fillStyle = '#9fe0c8';
  c.fillText(m.text, 12, h - 9);
  c.restore();
}

function drawNumbers(this: Battle, c: CanvasRenderingContext2D) {
  if (!this.numbers.length) return;
  const ts = this.settings.textScale || 1;
  c.textAlign = 'center';
  c.lineJoin = 'round';
  c.strokeStyle = '#081016';
  c.lineWidth = 3;
  for (const n of this.numbers) {
    const value = Math.round(n.value);
    if (value < 1) continue;
    const age = n.max - n.life,
      pop = age < 0.12 ? 1.35 - age * 2.9 : 1,
      text = n.crit ? value + '!' : String(value);
    c.globalAlpha = Math.max(0, Math.min(1, n.life / 0.3));
    c.font = `${n.crit ? 900 : 700} ${Math.round((n.crit ? 19 : 13) * ts * pop)}px ${FONT}`;
    c.strokeText(text, n.x, n.y);
    c.fillStyle = n.crit ? '#ffd24a' : '#f3ecdf';
    c.fillText(text, n.x, n.y);
  }
  c.globalAlpha = 1;
}

// Screen-space layers: vignette, hurt/low-HP edge, flashes, cards.
function drawOverlay(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const reduced = this.settings.reducedFlashes;
  const edges = this.edgeLayers(w, h);
  if (edges) c.drawImage(fast(edges.dark), 0, 0, w, h);
  let red = this.hurtFlash * (reduced ? 0.35 : 0.8);
  if (
    !this.ended &&
    this.run.hp > 0 &&
    this.run.hp < this.stats.health * LOW_HP
  ) {
    const beat = 0.5 + 0.5 * Math.sin((this.fxClock * Math.PI * 2) / 1.4);
    red = Math.max(red, 0.3 + (reduced ? 0.06 : 0.22) * beat);
  }
  if (edges && red > 0.01) {
    c.globalAlpha = Math.min(1, red);
    c.drawImage(fast(edges.red), 0, 0, w, h);
    c.globalAlpha = 1;
  }
  if (this.flash > 0) {
    c.globalAlpha = this.flash * this.flash * (reduced ? 0.15 : 0.65);
    c.fillStyle = '#fff6e6';
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }
  if (this.overloaded() && !this.ended) {
    // Electric tint on the frame for the whole overload window.
    const beat = 0.5 + 0.5 * Math.sin(this.fxClock * 7);
    c.fillStyle = EVENT_COLOR.overload;
    c.globalAlpha = 0.045;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.25 + (reduced ? 0.05 : 0.25) * beat;
    c.strokeStyle = EVENT_COLOR.overload;
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.globalAlpha = 1;
  }
  // A mirror has none of the simulation's inner state to draw these from.
  if (!this.client) {
    this.drawIncoming(c, w, h);
    this.drawCourierMarker(c, w, h);
  }
  const squad = this.client ? 0 : this.drawSquadTracker(c, w, h);
  if (!this.client) this.drawEventTracker(c, w, squad);
  this.drawCombo(c, w, squad);
  this.drawBanners(c, w, h);
  this.drawIntro(c, w, h);
  if (this.paused) {
    c.fillStyle = '#07101755';
    c.fillRect(0, 0, w, h);
  }
}

// Vignettes rendered once per viewport size at quarter resolution.
function edgeLayers(this: Battle, w: number, h: number) {
  if (typeof document === 'undefined') return null;
  const W = Math.max(1, Math.ceil(w / 4)),
    H = Math.max(1, Math.ceil(h / 4));
  if (this.edges?.w === W && this.edges.h === H) return this.edges;
  this.edges = {
    w: W,
    h: H,
    dark: edgeLayer(W, H, 0.25, [
      [0, '#0000'],
      [1, '#03080bbb'],
    ]),
    red: edgeLayer(W, H, 0.3, [
      [0, 'rgba(255,48,36,0)'],
      [0.55, 'rgba(255,48,36,0.12)'],
      [1, 'rgba(214,22,18,0.9)'],
    ]),
  };
  return this.edges;
}

// Arrow on the screen edge toward a world point that is out of view.
function drawEdgeArrow(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  wx: number,
  wy: number,
  color: string,
  alpha = 1,
) {
  const v = this.view,
    sx = w / 2 + (wx - v.x) * v.zoom,
    sy = h / 2 + (wy - v.y) * v.zoom,
    pad = 28;
  if (sx > pad && sx < w - pad && sy > pad && sy < h - pad) return;
  const x = Math.max(pad, Math.min(w - pad, sx)),
    y = Math.max(pad, Math.min(h - pad, sy)),
    a = Math.atan2(sy - h / 2, sx - w / 2),
    beat = 0.6 + 0.4 * Math.sin(this.fxClock * 8);
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.globalAlpha = beat * alpha;
  c.fillStyle = '#081016';
  c.beginPath();
  c.arc(0, 0, 13, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(12, 0);
  c.lineTo(-5, -8);
  c.lineTo(-1, 0);
  c.lineTo(-5, 8);
  c.closePath();
  c.fill();
  c.restore();
}

// Arrow on the screen edge while the courier runs out of view.
function drawCourierMarker(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const e = this.event?.courier;
  if (!e || e.hp <= 0 || this.ended) return;
  this.drawEdgeArrow(c, w, h, e.x, e.y - 20, EVENT_COLOR.courier);
}

// Where a fresh pack comes from, for a moment after it appears.
function drawIncoming(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  if (this.ended) return;
  for (const m of this.incoming)
    this.drawEdgeArrow(c, w, h, m.x, m.y, m.color, Math.min(1, m.life));
}

// Squad status under the timer: name, wave and kills still needed.
// Returns the height it takes, so the event tracker goes below it.
function drawSquadTracker(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const t = this.encounter;
  if (!t || this.ended) return 0;
  const ts = this.settings.textScale || 1,
    color = this.encounterColor(),
    bw = Math.min(w - 40, 260 * ts),
    bh = 30 * ts,
    x = w / 2 - bw / 2,
    // On an upright phone the health box is taller (two houses in it when
    // two play): the strip goes a little lower so the box does not cover it.
    y = (w < 520 && h > w ? 110 : 88) * ts,
    last = this.plan.length - 1,
    left = this.squadLeft();
  const status =
    this.wave < 0
      ? 'Загін наближається'
      : this.breather && this.wave < last && this.spawnTimer < 60
        ? `Передишка · ${Math.ceil(Math.max(0, this.spawnTimer))} с`
        : this.wave === last
          ? 'Фінальна хвиля'
          : `Хвиля ${this.wave + 1}/${this.plan.length}`;
  c.fillStyle = '#050b10c0';
  c.fillRect(x, y, bw, bh);
  c.fillStyle = color;
  c.fillRect(x, y, bw, 2);
  // One notch per wave: filled once it has been sent.
  const notch = (bw - 16) / this.plan.length;
  this.plan.forEach((_, i) => {
    c.globalAlpha = i <= this.wave ? 0.9 : 0.25;
    c.fillRect(x + 8 + i * notch, y + bh - 6 * ts, notch - 3, 3 * ts);
  });
  c.globalAlpha = 1;
  c.fillStyle = '#f3ecdf';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `800 ${Math.round(12 * ts)}px ${FONT}`;
  c.fillText(
    `${t.name.toUpperCase()} · ${status} · Лишилось ${left}`,
    w / 2,
    y + bh * 0.42,
    bw - 12,
  );
  c.textBaseline = 'alphabetic';
  // What is drawn below starts at 88: the strip's own drop counts too.
  return y - 88 * ts + bh + 8 * ts;
}

// Windup read: a crosshair where a leading shot or charge is headed, and
// the outline of the zone a mine, root or acid shot will leave.
function drawTelegraphs(
  this: Battle,
  c: CanvasRenderingContext2D,
  visible: Visible,
) {
  const warn = this.settings.colorblind ? COLORBLIND_HAZARD : null;
  for (const e of this.enemies) {
    if (
      e.hp <= 0 ||
      !(e.windup ?? 0) ||
      e.targetX === undefined ||
      e.targetY === undefined ||
      isLeader(e.type)
    )
      continue;
    const def = ENEMY_DEFS[e.type];
    if (!def || !TRACKING.includes(def.behavior)) continue;
    const zone = ZONE_MARK[def.behavior];
    if (zone === undefined && !e.leads) continue;
    const x = e.targetX,
      y = e.targetY;
    if (!visible(x, y, (zone ?? 0) + 30)) continue;
    const windup = e.windup ?? 0,
      k = Math.max(0, Math.min(1, 1 - windup / Math.max(0.1, def.windup))),
      locked = windup <= AIM_LOCK;
    c.save();
    c.strokeStyle = warn ?? def.color;
    c.globalAlpha = (warn ? 0.5 : 0.35) + k * 0.5;
    c.lineWidth = locked ? 2.5 : 1.5;
    if (zone !== undefined) {
      c.setLineDash([6, 6]);
      c.beginPath();
      c.arc(x, y, zone, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    if (e.leads) {
      const r = 8 + (1 - k) * 8;
      c.beginPath();
      for (const [ux, uy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        c.moveTo(x + ux * r, y + uy * r);
        c.lineTo(x + ux * (r + 9), y + uy * (r + 9));
      }
      c.stroke();
      if (def.behavior === 'charge') {
        c.globalAlpha *= 0.6;
        c.setLineDash([3, 7]);
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.lineTo(x, y);
        c.stroke();
      }
    }
    c.restore();
  }
}

// Staggered leader: cracks over the body and a ring that runs down.
function drawStagger(this: Battle, c: CanvasRenderingContext2D, e: Enemy) {
  const k = Math.max(0, Math.min(1, (e.stagger ?? 0) / STAGGER_TIME)),
    beat = this.settings.reducedFlashes
      ? 0.6
      : 0.5 + 0.5 * Math.sin(this.elapsed * 14);
  c.save();
  c.translate(e.x, e.y - e.r * 0.5);
  c.strokeStyle = '#fff3cf';
  c.lineWidth = 2.5;
  c.lineJoin = 'round';
  c.globalAlpha = 0.45 + 0.4 * beat;
  for (let i = 0; i < 5; i++) {
    let a = e.visualSeed * 1.7 + i * 1.26,
      x = 0,
      y = 0;
    c.beginPath();
    c.moveTo(0, 0);
    for (let j = 1; j <= 3; j++) {
      a += j % 2 ? 0.5 : -0.5;
      x += Math.cos(a) * e.r * 0.34;
      y += Math.sin(a) * e.r * 0.34;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  c.strokeStyle = this.settings.colorblind ? COLORBLIND_HAZARD : '#ffd166';
  c.globalAlpha = 0.8;
  c.lineWidth = 4;
  c.beginPath();
  c.arc(0, 0, e.r + 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
  c.stroke();
  c.restore();
}

// Live event status under the timer: wave left or seconds left.
function drawEventTracker(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  offset = 0,
) {
  const ev = this.event;
  if (!ev || ev.state !== 'live' || this.ended) return;
  const ts = this.settings.textScale || 1,
    color = EVENT_COLOR[ev.id],
    bw = Math.min(w - 40, 230 * ts),
    bh = 34 * ts,
    x = w / 2 - bw / 2,
    y = 88 * ts + offset;
  let text: string, k: number;
  if (ev.id === 'alarm') {
    const left = ev.wave.filter((e) => e.hp > 0).length;
    text = `СИГНАЛІЗАЦІЯ · ще ${left} з ${ev.wave.length}`;
    k = left / Math.max(1, ev.wave.length);
  } else if (ev.id === 'courier') {
    text = `КУР’ЄР · ${Math.ceil(Math.max(0, ev.left))} с`;
    k = ev.left / COURIER_TIME;
  } else {
    text = `ПЕРЕВАНТАЖЕННЯ · ${Math.ceil(Math.max(0, ev.left))} с`;
    k = ev.left / OVERLOAD_TIME;
  }
  c.fillStyle = '#050b10c0';
  c.fillRect(x, y, bw, bh);
  c.fillStyle = color;
  c.fillRect(x, y, bw, 2);
  c.fillRect(
    x + 8,
    y + bh - 7 * ts,
    (bw - 16) * Math.max(0, Math.min(1, k)),
    3 * ts,
  );
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `800 ${Math.round(12 * ts)}px ${FONT}`;
  c.fillText(text, w / 2, y + bh * 0.42, bw - 12);
  c.textBaseline = 'alphabetic';
}

// Kill streak, top centre-right: count, coin multiplier and decay bar.
function drawCombo(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  offset = 0,
) {
  if (this.combo < 3 || this.ended) return;
  const ts = this.settings.textScale || 1,
    mult = comboMultiplier(this.combo),
    pop = 1 + this.comboPop * 0.3,
    event = this.event?.state === 'live',
    // Narrow screens: below the trackers stacked under the timer.
    stacked = w < 720 && (event || offset > 0),
    boss = this.enemies.some((e) => isLeader(e.type) && e.hp > 0),
    x = Math.min(w - 18, w / 2 + 300 * ts),
    y = stacked
      ? (88 + (event ? 42 : 0) + 20) * ts + offset
      : (boss && w < 900 ? 196 : 112) * ts,
    hot = mult >= COMBO_CAP ? '#ff9f5a' : '#ffd166';
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.font = `900 ${Math.round(22 * ts * pop)}px ${FONT}`;
  const label = `КОМБО ×${this.combo}`;
  c.strokeStyle = '#081016';
  c.lineWidth = 4;
  c.strokeText(label, x, y);
  c.fillStyle = hot;
  c.fillText(label, x, y);
  c.font = `700 ${Math.round(11 * ts)}px ${FONT}`;
  const sub = mult > 1 ? `монети ×${mult.toFixed(2)}` : 'серія знищень';
  c.lineWidth = 3;
  c.strokeText(sub, x, y + 19 * ts);
  c.fillStyle = '#e9e2d4';
  c.fillText(sub, x, y + 19 * ts);
  const bw = 104 * ts,
    k = Math.max(0, Math.min(1, this.comboTimer / COMBO_WINDOW));
  c.fillStyle = '#081016c0';
  c.fillRect(x - bw, y + 29 * ts, bw, 4 * ts);
  c.fillStyle = hot;
  c.fillRect(x - bw * k, y + 29 * ts, bw * k, 4 * ts);
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
}

function drawBanners(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  if (!this.banners.length) return;
  const ts = this.settings.textScale || 1;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // A phone on its side: the top row of the screen (health, timer, the squad
  // strip) takes the first third, so the banners start under it.
  let top = w > h && h < 520 ? h * 0.36 : h * 0.22 - 29 * ts;
  for (const b of this.banners) {
    const age = b.max - b.life,
      pop = age < 0.18 ? 1.25 - (age / 0.18) * 0.25 : 1,
      bw = Math.min(w - 24, 420 * ts);
    // Long event texts wrap onto a second line.
    c.font = `600 ${Math.round(13 * ts)}px ${FONT}`;
    const lines = b.text ? this.wrap(c, b.text, bw - 24) : [];
    const bh = (lines.length ? 42 + lines.length * 16 : 40) * ts,
      y = top;
    top += bh + 8;
    c.globalAlpha = Math.max(0, Math.min(1, age / 0.12, b.life / 0.35));
    c.fillStyle = '#050b10c0';
    c.fillRect(w / 2 - bw / 2, y, bw, bh);
    c.fillStyle = b.color;
    c.fillRect(w / 2 - bw / 2, y, bw, 2);
    c.fillRect(w / 2 - bw / 2, y + bh - 2, bw, 2);
    c.font = `900 ${Math.round(24 * ts * pop)}px ${FONT}`;
    c.fillText(b.title, w / 2, y + 20 * ts, bw - 16);
    c.font = `600 ${Math.round(13 * ts)}px ${FONT}`;
    c.fillStyle = '#e9e2d4';
    lines.forEach((line, i) =>
      c.fillText(line, w / 2, y + (44 + i * 16) * ts, bw - 16),
    );
  }
  c.globalAlpha = 1;
  c.textBaseline = 'alphabetic';
}

// A leader with no portrait yet: its own sprite on a dark panel with rings.
function drawLeaderCameo(
  this: Battle,
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
) {
  const boss = this.run.kind === 'boss';
  const chapter = Math.min(2, this.run.chapter),
    variant = this.run.bossVariants[this.run.chapter] ?? 0;
  const def = boss
    ? campaignBoss(chapter, variant)
    : minibossFor(chapter, this.minibossVariant);
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, size * 0.75);
  g.addColorStop(0, '#182630');
  g.addColorStop(1, '#060b10');
  c.fillStyle = g;
  c.fillRect(cx - size / 2, cy - size / 2, size, size);
  c.strokeStyle = rgba(color, 0.45);
  c.lineWidth = 2;
  for (const r of [0.28, 0.42, 0.58]) {
    c.beginPath();
    c.arc(cx, cy, size * r, 0, Math.PI * 2);
    c.stroke();
  }
  const body = {
    x: 0,
    y: 0,
    hp: 1,
    max: 1,
    r: 30,
    type: boss ? 99 : MINIBOSS_TYPE,
    speed: 0,
    hit: 0,
    timer: 0,
    phase: 0,
    walk: 0,
    facing: 1,
    aim: 0,
    attack: 0,
    visualSeed: 0,
    pattern: 0,
  } as unknown as Enemy;
  const k = (size * 0.74) / def.size;
  c.save();
  c.translate(cx, cy + size * 0.04);
  c.scale(k, k);
  drawEnemy(
    c,
    body,
    chapter,
    this.fxClock,
    0,
    variant,
    this.minibossVariant,
    this.settings.colorblind,
    null,
  );
  c.restore();
}

// The presentation of a boss or mini-boss before the fight: a dark stage,
// the portrait sliding in, the name typed out, a tip, the health and the
// machine's taunt. A tap or a key skips it (skipIntro).
function drawIntro(
  this: Battle,
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const card = this.introCard;
  if (!card || this.intro <= 0) return;
  const total = this.introTotal || INTRO,
    ts = this.settings.textScale || 1,
    still = this.settings.reducedFlashes,
    age = total - this.intro,
    clamp = (t: number) => Math.max(0, Math.min(1, t)),
    ease = (t: number) => 1 - (1 - clamp(t)) ** 3,
    out = clamp(this.intro / 0.35),
    stage = clamp(age / 0.3) * out,
    // An element fades in over 0.3 s from `at`.
    show = (at: number) => clamp((age - at) / 0.3) * out;
  const wide = w >= h * 1.05,
    S = Math.round(
      wide ? Math.min(h * 0.62, w * 0.4) : Math.min(w * 0.62, h * 0.3),
    ),
    slide = still ? 0 : 1 - ease(age / 0.6),
    px0 = wide ? Math.round(w * 0.065) : Math.round((w - S) / 2),
    py0 = wide ? Math.round((h - S) / 2) : Math.round(h * 0.075) + 26,
    px = Math.round(px0 - (wide ? slide * w * 0.3 : 0)),
    py = Math.round(py0 - (wide ? 0 : slide * 70)),
    color = card.color;
  c.save();
  // The stage: dark cloth, stripes and a glow in the leader's colour.
  c.globalAlpha = stage * 0.88;
  c.fillStyle = '#03070b';
  c.fillRect(0, 0, w, h);
  c.globalAlpha = stage * 0.07;
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.beginPath();
  for (let x = -h; x < w; x += 44) {
    c.moveTo(x, h);
    c.lineTo(x + h, 0);
  }
  c.stroke();
  const gx = px0 + S / 2,
    gy = py0 + S / 2,
    glow = c.createRadialGradient(gx, gy, S * 0.1, gx, gy, S * 1.05);
  glow.addColorStop(0, rgba(color, 0.4));
  glow.addColorStop(1, rgba(color, 0));
  c.globalAlpha = stage;
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);
  // Cinema bars with a line in the leader's colour.
  const bar = Math.round(h * 0.075 * ease(age / 0.4));
  c.fillStyle = '#010305';
  c.fillRect(0, 0, w, bar);
  c.fillRect(0, h - bar, w, bar);
  c.globalAlpha = stage;
  c.fillStyle = color;
  c.fillRect(0, bar - 2, w * ease(age / 0.5), 2);
  c.fillRect(w * (1 - ease(age / 0.5)), h - bar, w * ease(age / 0.5), 2);

  // The portrait in its frame.
  const pa = show(0.05);
  c.globalAlpha = pa;
  c.fillStyle = rgba(color, 0.22);
  c.fillRect(px - 7, py - 7, S + 14, S + 14);
  c.fillStyle = '#05090d';
  c.fillRect(px, py, S, S);
  c.save();
  c.beginPath();
  c.rect(px, py, S, S);
  c.clip();
  if (card.portrait) {
    const z = S * (still ? 1 : 1.07 - 0.07 * clamp(age / total));
    c.drawImage(card.portrait, px - (z - S) / 2, py - (z - S) / 2, z, z);
  } else if (card.portrait === undefined)
    this.drawLeaderCameo(c, px + S / 2, py + S / 2, S, color);
  const shade = c.createLinearGradient(0, py + S * 0.62, 0, py + S);
  shade.addColorStop(0, 'rgba(3,7,11,0)');
  shade.addColorStop(1, 'rgba(3,7,11,0.7)');
  c.fillStyle = shade;
  c.fillRect(px, py, S, S);
  if (!still) {
    c.globalAlpha = pa * 0.16;
    c.fillStyle = color;
    c.fillRect(px, py + ((age * 0.7) % 1) * S, S, 3);
  }
  c.restore();
  c.globalAlpha = pa;
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.strokeRect(px, py, S, S);
  c.lineWidth = 5;
  for (const [sx, sy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const cx = sx ? px + S + 9 : px - 9,
      cy = sy ? py + S + 9 : py - 9,
      dx = sx ? -24 : 24,
      dy = sy ? -24 : 24;
    c.beginPath();
    c.moveTo(cx + dx, cy);
    c.lineTo(cx, cy);
    c.lineTo(cx, cy + dy);
    c.stroke();
  }

  // The words. Small screens get fewer of them: the taunt goes first, then
  // the health line, then the tip is cut short and the type shrinks, so
  // nothing runs under the cinema bar or over the "touch to start" line.
  const barEnd = Math.round(h * 0.075),
    footer = Math.round(28 * ts),
    tx = wide ? px0 + S + Math.round(w * 0.05) : Math.round(w * 0.07),
    tw = wide ? w - tx - Math.round(w * 0.06) : w - tx * 2,
    top = wide ? barEnd + 10 : py0 + S + Math.round(26 * ts),
    room = h - barEnd - footer - top;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const plan = (
    k: number,
    hintMax: number,
    withQuote: boolean,
    withHp: boolean,
  ) => {
    const tk = ts * k,
      small = Math.round(14 * tk),
      nameBase = (wide ? 54 : 38) * tk;
    c.font = `900 ${Math.round(nameBase)}px ${FONT}`;
    const nameW = c.measureText(card.title).width,
      nameSize = Math.round(nameW > tw ? (nameBase * tw) / nameW : nameBase);
    c.font = `600 ${small}px ${FONT}`;
    const hint =
      card.hint && hintMax ? this.wrapLines(c, card.hint, tw, hintMax) : [];
    c.font = `italic 600 ${small + 1}px ${FONT}`;
    const quoteLines =
      card.quote && withQuote
        ? this.wrapLines(c, '«' + card.quote + '»', tw, 2)
        : [];
    const line = Math.round(small * 1.4),
      gap = Math.round(14 * tk),
      kicker = Math.round(13 * tk),
      hp = !!card.hp && withHp;
    const height =
      kicker +
      gap +
      nameSize +
      gap * 0.8 +
      small +
      (hint.length ? gap * 1.6 + small + hint.length * line : 0) +
      (hp ? gap * 1.6 + 26 * tk : 0) +
      (quoteLines.length ? gap * 1.6 + quoteLines.length * line : 0);
    return {
      tk,
      small,
      nameSize,
      hint,
      quoteLines,
      line,
      gap,
      kicker,
      hp,
      height,
    };
  };
  let words = plan(1, wide ? 3 : 2, true, true);
  for (const [k, hintMax, quote, hp] of [
    [1, 2, true, true],
    [0.9, 2, false, true],
    [0.85, 1, false, true],
    [0.8, 1, false, false],
    [0.75, 0, false, false],
  ] as const) {
    if (words.height <= room) break;
    words = plan(k, hintMax, quote, hp);
  }
  const { tk, small, nameSize, hint, quoteLines, line, gap, kicker, height } =
    words;
  let y = wide ? 0 : top;
  if (wide) y = Math.max(barEnd + 10, (h - height) / 2);
  const rise = (at: number) => (still ? 0 : (1 - clamp((age - at) / 0.3)) * 14);
  // Kicker with a rule.
  y += kicker;
  c.globalAlpha = show(0.3);
  c.fillStyle = color;
  c.font = `800 ${kicker}px ${FONT}`;
  c.fillText(card.kicker, tx, y + rise(0.3));
  c.fillRect(
    tx + c.measureText(card.kicker).width + 12,
    y - kicker * 0.35,
    Math.max(
      0,
      (tw - c.measureText(card.kicker).width - 12) * ease((age - 0.4) / 0.6),
    ),
    2,
  );
  // The name, typed out.
  y += gap + nameSize;
  const shown = Math.floor(clamp((age - 0.5) / 0.9) * card.title.length);
  c.globalAlpha = out;
  c.font = `900 ${nameSize}px ${FONT}`;
  const typed = card.title.slice(0, shown);
  if (!still) {
    // A cheap glow: the name once more in the leader's colour, offset.
    c.globalAlpha = out * 0.4;
    c.fillStyle = color;
    c.fillText(typed, tx + 2, y + 2);
    c.fillText(typed, tx - 2, y - 1);
    c.globalAlpha = out;
  }
  c.fillStyle = '#fff6e6';
  c.fillText(typed, tx, y);
  // The place.
  y += gap * 0.8 + small;
  c.globalAlpha = show(1.0);
  c.font = `700 ${small}px ${FONT}`;
  c.fillStyle = '#b9c7c9';
  c.fillText(card.text, tx, y);
  // The tip: how the fight goes.
  if (hint.length) {
    y += gap * 1.6 + small;
    c.globalAlpha = show(1.15);
    c.font = `800 ${Math.round(11 * tk)}px ${FONT}`;
    c.fillStyle = color;
    c.fillText('ЯК ПЕРЕМОГТИ', tx, y - small * 0.2);
    c.font = `600 ${small}px ${FONT}`;
    c.fillStyle = '#e6ece9';
    hint.forEach((l, i) => c.fillText(l, tx, y + line * (i + 1) - small * 0.2));
    y += hint.length * line;
  }
  // Health.
  if (words.hp) {
    y += gap * 1.6;
    c.globalAlpha = show(1.3);
    const label =
        'ЗДОРОВ’Я ' + Math.round(card.hp ?? 0).toLocaleString('uk-UA'),
      ph = Math.round(26 * tk);
    c.font = `800 ${Math.round(12 * tk)}px ${FONT}`;
    const pw = c.measureText(label).width + 24;
    c.fillStyle = rgba(color, 0.16);
    c.fillRect(tx, y - ph * 0.7, pw, ph);
    c.strokeStyle = rgba(color, 0.7);
    c.lineWidth = 1.5;
    c.strokeRect(tx, y - ph * 0.7, pw, ph);
    c.fillStyle = '#fff6e6';
    c.fillText(label, tx + 12, y + ph * 0.08);
    y += ph * 0.3;
  }
  // The taunt, typed out.
  if (quoteLines.length) {
    y += gap * 1.6;
    c.font = `italic 600 ${small + 1}px ${FONT}`;
    c.fillStyle = color;
    c.globalAlpha = show(1.4);
    let left = Math.floor(clamp((age - 1.4) / 1.0) * 70);
    quoteLines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, left));
      left -= l.length;
      c.fillText(part, tx, y + line * (i + 1) - small * 0.2);
    });
  }
  // How to skip, once it is allowed.
  if (age > 0.6 && !still) {
    c.globalAlpha = out * (0.35 + 0.25 * Math.sin(this.fxClock * 5));
    c.textAlign = 'center';
    c.font = `700 ${Math.round(11 * ts)}px ${FONT}`;
    c.fillStyle = '#b9c7c9';
    c.fillText('Торкнись або натисни Space, щоб почати', w / 2, h - bar - 12);
  }
  c.restore();
  c.globalAlpha = 1;
  c.textBaseline = 'alphabetic';
}

// The drawing methods, installed on Battle.prototype by engine.ts.
export const view = {
  paintFacade,
  drawTurret,
  drawHouse,
  drawAlly,
  glowAt,
  draw,
  drawHitboxes,
  drawMuzzle,
  drawShot,
  drawShells,
  drawBullets,
  drawAuras,
  drawCourier,
  drawParticles,
  drawFps,
  drawNumbers,
  drawOverlay,
  edgeLayers,
  drawEdgeArrow,
  drawCourierMarker,
  drawIncoming,
  drawSquadTracker,
  drawTelegraphs,
  drawStagger,
  drawEventTracker,
  drawCombo,
  drawBanners,
  drawLeaderCameo,
  drawIntro,
};
export type BattleView = {
  [K in keyof typeof view]: OmitThisParameter<(typeof view)[K]>;
};
