import { CHAPTERS, ITEM_BY_ID, FAMILY } from './data';
import { seeded, statsFor, type Run, type Meta, type Stats } from './model';
export interface Enemy {
  x: number;
  y: number;
  hp: number;
  max: number;
  r: number;
  type: number;
  speed: number;
  hit: number;
  timer: number;
  phase: number;
}
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  enemy: boolean;
  crit: boolean;
}
interface Drop {
  x: number;
  y: number;
  kind: 'coin' | 'xp' | 'heal';
  value: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  text?: string;
}
export interface Hud {
  hp: number;
  max: number;
  coins: number;
  kills: number;
  level: number;
  xp: number;
  need: number;
  time: number;
  duration: number;
  dash: number;
  pulse: number;
  boss: number;
  bossMax: number;
  enemies: number;
}
export type BattleResult = { run: Run; won: boolean; boss: boolean };
export class AudioEngine {
  context: AudioContext | null = null;
  enabled = true;
  unlock() {
    if (!this.context && typeof AudioContext !== 'undefined')
      this.context = new AudioContext();
    this.context?.resume().catch(() => {});
  }
  play(kind: 'shoot' | 'hit' | 'coin' | 'dash' | 'win' | 'pulse') {
    if (!this.enabled || !this.context || this.context.state !== 'running')
      return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    const t = c.currentTime;
    const f = {
      shoot: 170,
      hit: 64,
      coin: 780,
      dash: 280,
      win: 520,
      pulse: 85,
    }[kind];
    o.type = kind === 'coin' || kind === 'win' ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(
      kind === 'coin' ? f * 1.8 : Math.max(25, f * 0.35),
      t + 0.12,
    );
    g.gain.setValueAtTime(kind === 'shoot' ? 0.018 : 0.045, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(t + 0.16);
  }
}
export class Battle {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  run: Run;
  stats: Stats;
  audio: AudioEngine;
  x = 800;
  y = 500;
  keys = new Set<string>();
  stick = { x: 0, y: 0 };
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  drops: Drop[] = [];
  particles: Particle[] = [];
  elapsed = 0;
  duration: number;
  spawnTimer = 0;
  shotTimer = 0;
  droneTimer = 0;
  hudTimer = 0;
  dashCd = 0;
  pulseCd = 0;
  invincible = 1;
  dashing = 0;
  facing = { x: 1, y: 0 };
  pulseRing = 0;
  shake = 0;
  paused = false;
  ended = false;
  frame = 0;
  last = 0;
  bossSpawned = false;
  rng: () => number;
  onHud: (h: Hud) => void;
  onEnd: (r: BattleResult) => void;
  constructor(
    canvas: HTMLCanvasElement | null,
    run: Run,
    meta: Meta,
    audio: AudioEngine,
    onHud: (h: Hud) => void,
    onEnd: (r: BattleResult) => void,
  ) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') ?? null;
    this.run = { ...run, items: [...run.items] };
    this.stats = statsFor(run, meta);
    this.audio = audio;
    this.onHud = onHud;
    this.onEnd = onEnd;
    this.rng = seeded(run.seed + run.step * 719);
    this.duration =
      run.kind === 'boss'
        ? 180
        : (run.kind === 'elite' ? 62 : 48) + run.step * 3;
    this.run.hp = Math.min(this.run.hp, this.stats.health);
  }
  start() {
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.04, (t - this.last) / 1000);
      this.last = t;
      if (!this.paused && !this.ended) this.update(dt);
      this.draw();
      if (!this.ended) this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.frame);
    this.keys.clear();
    this.stick = { x: 0, y: 0 };
  }
  dash() {
    if (this.dashCd > 0 || this.paused || this.ended) return;
    this.dashCd = 3.8;
    this.dashing = 0.22;
    this.invincible = 0.55;
    this.run.dashes++;
    this.audio.play('dash');
    this.burst(this.x, this.y, '#7cbef4', 15);
  }
  pulse() {
    if (this.pulseCd > 0 || this.paused || this.ended) return;
    this.pulseCd = 12;
    this.pulseRing = 0.55;
    this.shake = 7;
    this.audio.play('pulse');
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < 235) {
        this.damage(e, this.stats.damage * 3.5);
        if (e.type !== 6) {
          e.x += ((e.x - this.x) / Math.max(1, d)) * 60;
          e.y += ((e.y - this.y) / Math.max(1, d)) * 60;
        }
      }
    }
  }
  burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2,
        v = 30 + this.rng() * 100;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.3 + this.rng() * 0.4,
        max: 0.7,
        color,
        size: 2 + this.rng() * 3,
      });
    }
  }
  label(x: number, y: number, text: string, color: string) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -35,
      life: 0.75,
      max: 0.75,
      color,
      size: 14,
      text,
    });
  }
  spawn(type?: number) {
    const boss = type === 6;
    const angle = this.rng() * Math.PI * 2,
      d = boss ? 320 : 430 + this.rng() * 100;
    const t =
      type ?? Math.min(5, Math.floor(this.rng() * (3 + this.run.chapter)));
    const r = boss ? 46 : t === 2 ? 22 : 12;
    const scale = 1 + this.run.chapter * 0.36 + this.run.step * 0.12;
    const hp = boss
      ? 800 + this.run.chapter * 470
      : [22, 19, 75, 32, 38, 42][t] * scale;
    this.enemies.push({
      x: Math.max(50, Math.min(1550, this.x + Math.cos(angle) * d)),
      y: Math.max(50, Math.min(950, this.y + Math.sin(angle) * d)),
      hp,
      max: hp,
      r,
      type: t,
      speed:
        (boss ? 38 : [62, 95, 38, 55, 45, 72][t]) *
        (1 + this.run.chapter * 0.06),
      hit: 0,
      timer: 1 + this.rng() * 2,
      phase: 0,
    });
  }
  damage(e: Enemy, amount: number, crit = false) {
    if (e.hp <= 0) return;
    e.hp -= amount;
    e.hit = 0.12;
    this.burst(e.x, e.y, crit ? '#ffcd82' : '#b0ded4', crit ? 5 : 2);
    if (crit) this.label(e.x, e.y - 10, Math.round(amount) + '!', '#ffd38a');
    if (e.hp <= 0) {
      this.run.kills++;
      this.burst(
        e.x,
        e.y,
        [
          '#d69765',
          '#7db8dd',
          '#b497cc',
          '#81c496',
          '#75b7c7',
          '#c68fad',
          '#edbb70',
        ][e.type],
        e.type === 6 ? 55 : 12,
      );
      this.drops.push({
        x: e.x,
        y: e.y,
        kind: 'xp',
        value: e.type === 2 ? 3 : 1,
      });
      this.drops.push({
        x: e.x + 8,
        y: e.y + 5,
        kind: 'coin',
        value: (e.type === 2 ? 3 : 1) + (this.rng() < this.stats.luck ? 1 : 0),
      });
      if (this.rng() < 0.055)
        this.drops.push({ x: e.x - 10, y: e.y, kind: 'heal', value: 12 });
      this.run.hp = Math.min(
        this.stats.health,
        this.run.hp + this.stats.vampire,
      );
      if (e.type === 6) {
        this.run.coins += 45 + this.run.chapter * 15;
        this.finish(true);
      }
    }
  }
  nearest(x: number, y: number, range: number) {
    let best: Enemy | undefined;
    let dist = range;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < dist) {
        best = e;
        dist = d;
      }
    }
    return best;
  }
  shoot(x: number, y: number, e: Enemy, drone = false) {
    const a = Math.atan2(e.y - y, e.x - x);
    const shots = drone ? 1 : this.stats.shots;
    const crit = this.rng() < this.stats.crit;
    let damage =
      this.stats.damage *
      (1 + (this.run.level - 1) * 0.07) *
      (crit ? 1.8 : 1) *
      (drone ? 0.45 : 1);
    if (!drone && this.run.items.includes('coinshot') && this.run.coins > 0) {
      this.run.coins--;
      damage *= 3;
    }
    for (let i = 0; i < shots; i++) {
      const angle = a + (i - (shots - 1) / 2) * 0.12;
      this.bullets.push({
        x,
        y,
        vx: Math.cos(angle) * 540,
        vy: Math.sin(angle) * 540,
        life: 1.5,
        damage,
        enemy: false,
        crit,
      });
    }
    if (!drone) this.audio.play('shoot');
  }
  finish(won: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.run.time += this.elapsed;
    this.audio.play(won ? 'win' : 'hit');
    this.onEnd({ run: { ...this.run }, won, boss: this.run.kind === 'boss' });
  }
  update(dt: number) {
    if (this.ended || this.paused) return;
    this.elapsed += dt;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.pulseCd = Math.max(0, this.pulseCd - dt);
    this.invincible -= dt;
    this.dashing -= dt;
    this.pulseRing = Math.max(0, this.pulseRing - dt);
    this.shake = Math.max(0, this.shake - dt * 25);
    let dx =
      this.stick.x +
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    let dy =
      this.stick.y +
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) -
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      dx /= Math.max(1, length);
      dy /= Math.max(1, length);
      const directionLength = Math.hypot(dx, dy);
      this.facing = { x: dx / directionLength, y: dy / directionLength };
    }
    if (this.dashing > 0) {
      dx = this.facing.x * 3.8;
      dy = this.facing.y * 3.8;
    }
    this.x = Math.max(55, Math.min(1545, this.x + dx * this.stats.speed * dt));
    this.y = Math.max(55, Math.min(945, this.y + dy * this.stats.speed * dt));
    this.run.hp = Math.min(
      this.stats.health,
      this.run.hp + this.stats.regen * dt,
    );
    this.spawnTimer -= dt;
    if (this.run.kind === 'boss' && !this.bossSpawned) {
      this.spawn(6);
      this.bossSpawned = true;
    }
    if (this.spawnTimer <= 0 && this.enemies.length < 90) {
      const count =
        this.run.kind === 'boss'
          ? 2
          : 2 +
            Math.floor(this.elapsed / 24) +
            (this.run.kind === 'elite' ? 1 : 0);
      for (let i = 0; i < count; i++) this.spawn();
      this.spawnTimer =
        this.run.kind === 'boss'
          ? 4
          : Math.max(
              0.65,
              1.85 -
                this.run.chapter * 0.16 -
                this.run.step * 0.05 -
                this.elapsed * 0.006,
            );
    }
    this.shotTimer -= dt;
    if (this.shotTimer <= 0) {
      const enemy = this.nearest(this.x, this.y, this.stats.range);
      if (enemy) {
        this.shoot(this.x, this.y - 20, enemy);
        this.shotTimer = 1 / this.stats.rate;
      }
    }
    this.droneTimer -= dt;
    if (this.droneTimer <= 0 && this.stats.drones) {
      for (let i = 0; i < this.stats.drones; i++) {
        const a = this.elapsed * 0.8 + (i * Math.PI * 2) / this.stats.drones;
        const x = this.x + Math.cos(a) * 85,
          y = this.y + Math.sin(a) * 65;
        const e = this.nearest(x, y, this.stats.range);
        if (e) this.shoot(x, y, e, true);
      }
      this.droneTimer = 0.7;
    }
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.hit = Math.max(0, e.hit - dt);
      const dist = Math.hypot(this.x - e.x, this.y - e.y) || 1;
      const ex = (this.x - e.x) / dist,
        ey = (this.y - e.y) / dist;
      e.timer -= dt;
      if (e.type === 6) {
        e.phase = e.hp < e.max * 0.45 ? 1 : 0;
        if (e.timer <= 0) {
          const n = 8 + this.run.chapter * 2 + e.phase * 4;
          for (let i = 0; i < n; i++) {
            const a = (i * Math.PI * 2) / n + this.elapsed * 0.25;
            this.bullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * (140 + e.phase * 45),
              vy: Math.sin(a) * (140 + e.phase * 45),
              life: 5,
              damage: 12 + this.run.chapter * 3,
              enemy: true,
              crit: false,
            });
          }
          e.timer = e.phase ? 1.7 : 2.8;
          this.burst(e.x, e.y, '#ef9680', 15);
        }
      } else if (e.type === 4 && e.timer <= 0) {
        this.bullets.push({
          x: e.x,
          y: e.y,
          vx: ex * 200,
          vy: ey * 200,
          life: 4,
          damage: 9 + this.run.chapter * 2,
          enemy: true,
          crit: false,
        });
        e.timer = 2.2;
      }
      const moving = e.type !== 4 || dist > 260;
      if (moving) {
        e.x += ex * e.speed * dt;
        e.y += ey * e.speed * dt;
      }
      if (dist < e.r + 24 && this.invincible <= 0) {
        const hit = Math.max(
          2,
          (e.type === 6 ? 22 : e.type === 2 ? 17 : 9) +
            this.run.chapter * 2 -
            this.stats.armor,
        );
        this.run.hp -= hit;
        this.invincible = 0.7;
        this.shake = 5;
        this.audio.play('hit');
        this.label(this.x, this.y - 55, '−' + hit, '#ff8e82');
        if (this.stats.thorns) this.damage(e, this.stats.thorns);
        if (e.type !== 6) {
          e.x -= ex * 32;
          e.y -= ey * 32;
        }
      }
      for (let i = 0; i < this.stats.orbit; i++) {
        const a = this.elapsed * 2 + (i * Math.PI * 2) / this.stats.orbit;
        const ox = this.x + Math.cos(a) * 105,
          oy = this.y + Math.sin(a) * 85;
        if (Math.hypot(ox - e.x, oy - e.y) < e.r + 14)
          this.damage(e, this.stats.damage * 2 * dt);
      }
    }
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.enemy) {
        if (
          Math.hypot(b.x - this.x, b.y - this.y) < 27 &&
          this.invincible <= 0
        ) {
          this.run.hp -= Math.max(2, b.damage - this.stats.armor);
          this.invincible = 0.45;
          b.life = 0;
          this.shake = 3;
          this.audio.play('hit');
        }
      } else {
        for (const e of this.enemies) {
          if (e.hp <= 0 || Math.hypot(b.x - e.x, b.y - e.y) > e.r + 6) continue;
          this.damage(e, b.damage, b.crit);
          b.life = 0;
          if (this.stats.explosion) {
            this.burst(e.x, e.y, '#dab97b', 8);
            for (const other of this.enemies)
              if (
                other !== e &&
                Math.hypot(other.x - e.x, other.y - e.y) < this.stats.explosion
              )
                this.damage(other, b.damage * 0.5);
          }
          if (this.stats.chain) {
            const neighbors = this.enemies
              .filter(
                (n) =>
                  n !== e && n.hp > 0 && Math.hypot(n.x - e.x, n.y - e.y) < 170,
              )
              .slice(0, this.stats.chain);
            for (const n of neighbors) {
              this.damage(n, b.damage * 0.6);
              for (let j = 0; j < 6; j++)
                this.particles.push({
                  x: e.x + ((n.x - e.x) * j) / 6,
                  y: e.y + ((n.y - e.y) * j) / 6,
                  vx: 0,
                  vy: 0,
                  life: 0.15,
                  max: 0.15,
                  color: '#86c9ff',
                  size: 3,
                });
            }
          }
          break;
        }
      }
    }
    for (const d of this.drops) {
      const dist = Math.hypot(d.x - this.x, d.y - this.y);
      if (dist < this.stats.magnet) {
        const speed = Math.max(90, 500 - dist) * dt;
        d.x += ((this.x - d.x) / Math.max(1, dist)) * speed;
        d.y += ((this.y - d.y) / Math.max(1, dist)) * speed;
      }
      if (dist < 32) {
        if (d.kind === 'coin') {
          this.run.coins += d.value;
          if (this.rng() < 0.15) this.audio.play('coin');
        }
        if (d.kind === 'heal')
          this.run.hp = Math.min(this.stats.health, this.run.hp + d.value);
        if (d.kind === 'xp') this.run.xp += d.value;
        d.value = 0;
      }
    }
    const need = 10 + this.run.level * 5;
    if (this.run.xp >= need) {
      this.run.xp -= need;
      this.run.level++;
      this.run.hp = Math.min(this.stats.health, this.run.hp + 18);
      this.label(this.x, this.y - 65, `РІВЕНЬ ${this.run.level}`, '#aee6cb');
      this.burst(this.x, this.y, '#aee6cb', 30);
      this.audio.play('win');
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.bullets = this.bullets.filter((b) => b.life > 0).slice(-450);
    this.drops = this.drops.filter((d) => d.value > 0).slice(-400);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0).slice(-500);
    if (this.run.hp <= 0) {
      this.run.hp = 0;
      this.finish(false);
      return;
    }
    if (this.elapsed >= this.duration) {
      if (this.run.kind === 'boss') {
        this.finish(false);
      } else {
        for (const d of this.drops)
          if (d.kind === 'coin') this.run.coins += d.value;
        this.run.coins += 12;
        this.run.scrap += this.run.kind === 'elite' ? 4 : 2;
        this.finish(true);
      }
      return;
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      const boss = this.enemies.find((e) => e.type === 6);
      this.onHud({
        hp: this.run.hp,
        max: this.stats.health,
        coins: this.run.coins,
        kills: this.run.kills,
        level: this.run.level,
        xp: this.run.xp,
        need: 10 + this.run.level * 5,
        time: this.elapsed,
        duration: this.duration,
        dash: this.dashCd,
        pulse: this.pulseCd,
        boss: boss?.hp ?? 0,
        bossMax: boss?.max ?? 0,
        enemies: this.enemies.length,
      });
    }
  }
  drawHouse(c: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    const walk = this.elapsed * 10;
    c.fillStyle = '#0006';
    c.beginPath();
    c.ellipse(0, 23, 45, 17, 0, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1,
        j = i % 3;
      const kneeX = side * (34 + Math.sin(walk + j) * 5),
        kneeY = -10 + j * 14;
      const footX = side * (43 + Math.cos(walk + j) * 7),
        footY = 15 + j * 10;
      c.strokeStyle = '#091116';
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(side * 22, -15 + j * 15);
      c.lineTo(kneeX, kneeY);
      c.lineTo(footX, footY);
      c.stroke();
      c.strokeStyle = '#667984';
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = '#c29a5c';
      c.fillRect(kneeX - 3, kneeY - 3, 6, 6);
    }
    c.fillStyle = '#0a1218';
    c.fillRect(-29, -54, 58, 80);
    c.fillStyle =
      this.invincible > 0 && Math.floor(this.elapsed * 16) % 2
        ? '#687e88'
        : '#3a505d';
    c.fillRect(-26, -52, 52, 72);
    c.strokeStyle = '#91a9af';
    c.lineWidth = 1;
    c.strokeRect(-26, -52, 52, 72);
    for (let i = 0; i < 9; i++) {
      const id = this.run.items[i],
        xx = -21 + (i % 3) * 15,
        yy = -44 + Math.floor(i / 3) * 19;
      const col = id ? FAMILY[ITEM_BY_ID[id].family].color : '#243844';
      c.fillStyle = '#182630';
      c.fillRect(xx - 1, yy - 1, 12, 15);
      c.fillStyle = col;
      c.shadowBlur = id ? 6 : 0;
      c.shadowColor = col;
      c.fillRect(xx, yy, 10, 12);
      c.shadowBlur = 0;
      c.fillStyle = '#14212b';
      c.fillRect(xx + 4, yy, 2, 12);
      c.fillRect(xx, yy + 5, 10, 2);
    }
    c.fillStyle = '#a17f54';
    c.fillRect(-30, -58, 60, 7);
    c.fillStyle = '#253b46';
    c.fillRect(-18, -68, 8, 12);
    c.strokeStyle = '#aac0c4';
    c.beginPath();
    c.moveTo(15, -57);
    c.lineTo(15, -78);
    c.moveTo(8, -73);
    c.lineTo(23, -73);
    c.stroke();
    c.fillStyle = '#f1be69';
    c.fillRect(-5, 5, 10, 15);
    c.restore();
  }
  draw() {
    const c = this.ctx,
      canvas = this.canvas;
    if (!c || !canvas) return;
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio || 1);
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
    const cameraX = Math.max(
      w / 2 / zoom - 25,
      Math.min(1625 - w / 2 / zoom, this.x),
    );
    const cameraY = Math.max(
      h / 2 / zoom - 25,
      Math.min(1025 - h / 2 / zoom, this.y),
    );
    c.save();
    c.translate(
      w / 2 - cameraX * zoom + Math.sin(this.elapsed * 93) * this.shake,
      h / 2 - cameraY * zoom + Math.sin(this.elapsed * 93) * this.shake,
    );
    c.scale(zoom, zoom);
    const bg = c.createLinearGradient(0, 0, 1600, 1000);
    bg.addColorStop(0, '#172a34');
    bg.addColorStop(1, '#0d1a22');
    c.fillStyle = bg;
    c.fillRect(0, 0, 1600, 1000);
    c.strokeStyle = '#26394266';
    c.lineWidth = 1;
    for (let x = 0; x <= 1600; x += 80) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 1000);
      c.stroke();
    }
    for (let y = 0; y <= 1000; y += 80) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(1600, y);
      c.stroke();
    }
    c.fillStyle = '#0b151b80';
    for (let i = 0; i < 45; i++) {
      const xx = (i * 293 + (this.run.seed % 177)) % 1520,
        yy = (i * 173 + 77) % 950;
      c.fillRect(xx, yy, 18 + (i % 4) * 7, 9 + (i % 3) * 8);
      c.fillStyle = '#4b64722b';
      c.fillRect(xx + 3, yy + 2, 9, 2);
      c.fillStyle = '#0b151b80';
    }
    c.strokeStyle = CHAPTERS[this.run.chapter].color + '65';
    c.lineWidth = 4;
    c.setLineDash([16, 12]);
    c.strokeRect(25, 25, 1550, 950);
    c.setLineDash([]);
    for (const d of this.drops) {
      c.fillStyle =
        d.kind === 'coin'
          ? '#eeb657'
          : d.kind === 'heal'
            ? '#ed9d8c'
            : '#79c8b3';
      c.shadowBlur = 6;
      c.shadowColor = c.fillStyle as string;
      c.beginPath();
      if (d.kind === 'xp') {
        c.moveTo(d.x, d.y - 5);
        c.lineTo(d.x + 4, d.y);
        c.lineTo(d.x, d.y + 5);
        c.lineTo(d.x - 4, d.y);
      } else c.arc(d.x, d.y, d.kind === 'heal' ? 5 : 3, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }
    for (const e of [...this.enemies].sort((a, b) => a.y - b.y)) {
      c.save();
      c.translate(e.x, e.y);
      const col = [
        '#d9996b',
        '#88b9da',
        '#b296c7',
        '#90c590',
        '#81beca',
        '#d594b3',
        CHAPTERS[this.run.chapter].color,
      ][e.type];
      c.fillStyle = '#0005';
      c.beginPath();
      c.ellipse(0, e.r * 0.8, e.r * 1.2, e.r * 0.55, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = e.hit > 0 ? '#f4e7d2' : col;
      c.strokeStyle = '#091219';
      c.lineWidth = 3;
      if (e.type === 6) {
        const bob = Math.sin(this.elapsed * 3) * 3;
        c.translate(0, bob);
        for (let i = 0; i < 4; i++) {
          c.fillStyle = '#75828b';
          c.fillRect(-55 + i * 28, 20, 10, 24);
        }
        c.fillStyle = e.hit > 0 ? '#eee5cd' : col;
        c.fillRect(-45, -45, 90, 72);
        c.strokeRect(-45, -45, 90, 72);
        c.fillStyle = '#172530';
        c.fillRect(-32, -31, 64, 35);
        for (let i = 0; i < 4; i++) {
          c.fillStyle = e.phase ? '#fa7469' : '#efc079';
          c.fillRect(-26 + i * 15, -25, 8, 20);
        }
        c.fillStyle = '#354652';
        c.fillRect(-57, 0, 22, 12);
        c.fillRect(35, 0, 22, 12);
        c.fillStyle = '#f1a471';
        c.fillRect(-10, -60, 20, 15);
      } else if (e.type === 1 || e.type === 4) {
        c.beginPath();
        c.moveTo(0, -e.r);
        c.lineTo(e.r + 4, 0);
        c.lineTo(0, e.r);
        c.lineTo(-e.r - 4, 0);
        c.closePath();
        c.fill();
        c.stroke();
        c.strokeStyle = col;
        c.beginPath();
        c.moveTo(-20, -6);
        c.lineTo(20, -6);
        c.stroke();
      } else if (e.type === 2) {
        c.fillRect(-20, -23, 40, 41);
        c.strokeRect(-20, -23, 40, 41);
        c.fillStyle = '#21303a';
        c.fillRect(-12, -13, 24, 13);
      } else {
        c.beginPath();
        c.ellipse(0, 0, e.r, e.r * (e.type === 3 ? 0.7 : 1), 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      c.fillStyle = '#ffe5ac';
      c.fillRect(-6, -4, 3, 3);
      c.fillRect(3, -4, 3, 3);
      if (e.hp < e.max && e.type !== 6) {
        c.fillStyle = '#091218';
        c.fillRect(-e.r, -e.r - 10, e.r * 2, 3);
        c.fillStyle = col;
        c.fillRect(-e.r, -e.r - 10, e.r * 2 * Math.max(0, e.hp / e.max), 3);
      }
      c.restore();
    }
    this.drawHouse(c, this.x, this.y);
    for (let i = 0; i < this.stats.drones; i++) {
      const a = this.elapsed * 0.8 + (i * Math.PI * 2) / this.stats.drones;
      const x = this.x + Math.cos(a) * 85,
        y = this.y + Math.sin(a) * 65;
      c.fillStyle = '#e8bd74';
      c.fillRect(x - 7, y - 4, 14, 8);
      c.strokeStyle = '#78a7bb';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x - 15, y - 6);
      c.lineTo(x + 15, y - 6);
      c.stroke();
    }
    for (let i = 0; i < this.stats.orbit; i++) {
      const a = this.elapsed * 2 + (i * Math.PI * 2) / this.stats.orbit,
        x = this.x + Math.cos(a) * 105,
        y = this.y + Math.sin(a) * 85;
      c.fillStyle = '#8cc5ed';
      c.shadowColor = '#6abbff';
      c.shadowBlur = 14;
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }
    for (const b of this.bullets) {
      c.fillStyle = b.enemy ? '#f38c7d' : b.crit ? '#ffe3a2' : '#a9d8d0';
      c.shadowBlur = 6;
      c.shadowColor = c.fillStyle as string;
      c.beginPath();
      c.arc(b.x, b.y, b.enemy ? 5 : b.crit ? 5 : 3, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }
    if (this.pulseRing) {
      c.strokeStyle = `rgba(126,204,223,${this.pulseRing})`;
      c.lineWidth = 5;
      c.beginPath();
      c.arc(this.x, this.y, (0.55 - this.pulseRing) * 470, 0, Math.PI * 2);
      c.stroke();
    }
    for (const p of this.particles) {
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.color;
      if (p.text) {
        c.font = 'bold 14px Segoe UI';
        c.textAlign = 'center';
        c.fillText(p.text, p.x, p.y);
      } else c.fillRect(p.x, p.y, p.size, p.size);
    }
    c.globalAlpha = 1;
    c.restore();
    const vignette = c.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.25,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.68,
    );
    vignette.addColorStop(0, '#0000');
    vignette.addColorStop(1, '#03080bbb');
    c.fillStyle = vignette;
    c.fillRect(0, 0, w, h);
    if (this.paused) {
      c.fillStyle = '#07101755';
      c.fillRect(0, 0, w, h);
    }
  }
}
