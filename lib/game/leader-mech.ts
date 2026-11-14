import type { Enemy } from './battle-core';
import type { BossPattern, Hazard } from './bosses';

// What makes each of the 9 bosses and 9 mini-bosses itself: a mechanic of its
// own that the fight turns on (an armour to go round, antennas to cut, a
// flood to drain, a floor plan to stand on...). The patterns of encounters.ts
// and minibosses.ts say WHAT a leader throws; this says what the leader IS.
//
// A mechanic is a few hooks the engine calls (engine.ts leader sections). They
// only touch what a snapshot of the mirror already carries (enemies, zones,
// the numbers of the leader's `mech` bag), they draw their dice from the
// battle's seeded generator and read time from the battle's clock, so every
// player of a lockstep fight and every replay sees the same fight.

// The enemy type of a leader's helpers (antennas, pods, eggs, guards...). They
// have no row in ENEMY_DEFS, never score a kill, a crystal or a coin, and go
// with the leader.
export const MECH_TYPE = 97;
export const isMinion = (type: number) => type === MECH_TYPE;
export const ARENA = { w: 1600, h: 1000 } as const;
// The last fifth of a boss's health is its fury; mini-bosses have none.
export const RAGE_AT = 0.2;
// What the leaders' own state is made of: plain numbers and lists of numbers.
export type MechBag = Record<string, number | number[]>;
export interface MechFields {
  // A leader: the key of its mechanic. A helper: what kind of helper it is.
  tag?: string;
  mech?: MechBag;
}
export type Unit = Enemy & MechFields;
export type MinionTag =
  | 'antenna'
  | 'pod'
  | 'egg'
  | 'valve'
  | 'node'
  | 'guard'
  | 'decoy';
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
// What a mechanic may ask of the fight (engine.ts Battle implements it).
export interface MechHost {
  readonly elapsed: number;
  // The location, 0..2, for the weight of its zones.
  readonly chapter: number;
  // Houses in the fight, 1..4.
  readonly party: number;
  rng(): number;
  enemies: Unit[];
  hazards: Hazard[];
  // The houses that stand (the first is the one the leader aims at).
  bodies(): Body[];
  minion(
    tag: MinionTag,
    x: number,
    y: number,
    hp: number,
    speed?: number,
  ): Unit;
  spawnAt(type: number, x: number, y: number, affix?: string): void;
  shoot(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
  ): void;
  heal(e: Unit, amount: number): void;
  stagger(e: Unit, seconds: number): void;
  burst(x: number, y: number, color: string, n: number): void;
  // A helper leaves without dying (nothing drops, nothing counts).
  vanish(m: Unit): void;
}
export interface Mechanic {
  name: string;
  boss: boolean;
  // The line under the leader's health bar.
  note(e: Unit): string;
  // Turn speed of its aim as a share of a shield bearer's; none = at once.
  turn?: number;
  start?(h: MechHost, e: Unit): void;
  tick?(h: MechHost, e: Unit, dt: number): void;
  // Share of the damage that gets through (1 = all of it, 0 = none). The angle
  // is the direction the hit came flying in; undefined for a hit that has none.
  armor?(h: MechHost, e: Unit, angle?: number): number;
  // Time stands still for the leader: it holds its attack and its place.
  frozen?(h: MechHost, e: Unit): boolean;
  // The attack is released; the mechanic may add zones to it.
  onAttack?(h: MechHost, e: Unit, pattern: BossPattern): void;
  onPhase?(h: MechHost, e: Unit, phase: number): void;
  onMinionDeath?(h: MechHost, e: Unit, m: Unit): void;
  end?(h: MechHost, e: Unit): void;
}

// ---- small tools ----------------------------------------------------------

const num = (e: Unit, key: string, fallback = 0): number => {
  const v = e.mech?.[key];
  return typeof v === 'number' ? v : fallback;
};
const list = (e: Unit, key: string): number[] => {
  const v = e.mech?.[key];
  return Array.isArray(v) ? v : [];
};
const put = (e: Unit, key: string, v: number | number[]) => {
  (e.mech ??= {})[key] = v;
};
const bump = (e: Unit, key: string, by = 1) => put(e, key, num(e, key) + by);
const alive = (h: MechHost, tag: MinionTag): Unit[] =>
  h.enemies.filter((m) => m.type === MECH_TYPE && m.tag === tag && m.hp > 0);
const extra = (h: MechHost) => Math.max(0, h.party - 2);
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const weight = (h: MechHost) => 10 + h.chapter * 3;
// The body the leader is after (the first of those on their feet).
const target = (h: MechHost, e: Unit): Body =>
  h
    .bodies()
    .reduce<Body | undefined>(
      (best, b) =>
        !best ||
        Math.hypot(b.x - e.x, b.y - e.y) <
          Math.hypot(best.x - e.x, best.y - e.y)
          ? b
          : best,
      undefined,
    ) ?? { x: ARENA.w / 2, y: ARENA.h / 2, vx: 0, vy: 0 };
// Is a hit that flew in at `angle` landing on the leader's front (`cos` is the
// cosine of the half of its arc)?
export const frontal = (e: Enemy, angle: number | undefined, cos: number) =>
  angle !== undefined && Math.cos(angle + Math.PI - e.aim) > cos;
const COS_70 = Math.cos((70 * Math.PI) / 180);
const COS_SHIELD = 0.25;

interface Strike {
  x: number;
  y: number;
  radius: number;
  arm: number;
  duration: number;
  // Of the weight of a boss's ordinary zone.
  scale: number;
  color: string;
  extra?: Partial<Hazard>;
}
// A zone that is marked for `arm` seconds and then hurts for `duration`.
function strike(h: MechHost, s: Strike): Hazard {
  const z: Hazard = {
    x: s.x,
    y: s.y,
    radius: s.radius,
    age: -s.arm,
    duration: s.duration,
    damage: s.scale > 0 ? Math.max(2, Math.round(weight(h) * s.scale)) : 0,
    color: s.color,
    ...s.extra,
  };
  h.hazards.push(z);
  return z;
}
function slab(
  h: MechHost,
  cx: number,
  cy: number,
  rw: number,
  rh: number,
  s: Omit<Strike, 'x' | 'y' | 'radius'>,
): Hazard {
  return strike(h, {
    ...s,
    x: cx,
    y: cy,
    radius: Math.max(rw, rh),
    extra: { rw, rh, ...s.extra },
  });
}
const keyed = (h: MechHost, key: string) =>
  h.hazards.filter((z) => z.key === key && z.age < z.duration);
const expire = (h: MechHost, key: string) => {
  for (const z of keyed(h, key)) z.age = z.duration;
};
const expireAll = (h: MechHost, prefix: string) => {
  for (const z of h.hazards)
    if (z.key?.startsWith(prefix) && z.age < z.duration) z.age = z.duration;
};

// ---- the 9 bosses ----------------------------------------------------------

const ANTENNAS: [number, number][] = [
  [300, 230],
  [1300, 230],
  [800, 820],
  [300, 780],
  [1300, 780],
];
function addAntenna(h: MechHost, e: Unit, slot: number, share = 0.04) {
  const [x, y] = ANTENNAS[slot];
  const m = h.minion('antenna', x, y, Math.round(e.max * share));
  put(m, 'slot', slot);
  put(m, 'call', h.elapsed + 6 + slot * 2);
  return m;
}
const antennaCount = (h: MechHost) => Math.min(5, 3 + extra(h));

// A pod, egg or the like that stands apart from the leader.
function around(h: MechHost, e: Unit, near: number, far: number) {
  const a = h.rng() * Math.PI * 2,
    r = near + h.rng() * (far - near);
  return {
    x: clamp(e.x + Math.cos(a) * r, 70, ARENA.w - 70),
    y: clamp(e.y + Math.sin(a) * r, 70, ARENA.h - 70),
  };
}
// At most four stand at once, however many times they are called for.
function addPods(h: MechHost, e: Unit, count: number) {
  const room = 4 + extra(h) - alive(h, 'pod').length;
  for (let i = 0; i < Math.min(count, room); i++) {
    const p = around(h, e, 170, 300);
    h.minion('pod', p.x, p.y, Math.round(e.max * 0.05));
  }
}

const NODES: [number, number][] = [
  [400, 300],
  [1200, 300],
  [800, 780],
  [400, 800],
  [1200, 800],
];
function addNode(h: MechHost, e: Unit, slot: number) {
  const [x, y] = NODES[slot];
  const m = h.minion('node', x, y, Math.round(e.max * 0.045));
  put(m, 'slot', slot);
  return m;
}
// The wires: each node to the leader, and the nodes in a ring.
function rewire(h: MechHost, e: Unit) {
  expireAll(h, 'wire');
  const nodes = alive(h, 'node').sort(
    (a, b) => num(a, 'slot') - num(b, 'slot'),
  );
  const wire = (key: string, x: number, y: number, x2: number, y2: number) =>
    strike(h, {
      x,
      y,
      radius: 9,
      arm: 0.7,
      duration: 9999,
      scale: 0.5,
      color: '#7fd7ff',
      extra: { x2, y2, key },
    });
  nodes.forEach((n, i) => {
    wire(`wire-l${num(n, 'slot')}`, n.x, n.y, e.x, e.y);
    if (nodes.length > 2 || (nodes.length === 2 && i === 0)) {
      const next = nodes[(i + 1) % nodes.length];
      wire(`wire-n${num(n, 'slot')}`, n.x, n.y, next.x, next.y);
    }
  });
}

const CELLS = { cols: 6, rows: 3 };
// One floor plan: some cells stay whole, the rest is pulled down.
function blueprint(h: MechHost, e: Unit, arm: number) {
  const total = CELLS.cols * CELLS.rows;
  const safeCount =
    Math.min(total - 1, (e.phase >= 2 ? 3 : e.phase >= 1 ? 4 : 5) + extra(h)) ||
    1;
  const pool = Array.from({ length: total }, (_, i) => i);
  const safe: number[] = [];
  for (let i = 0; i < safeCount; i++)
    safe.push(pool.splice(Math.floor(h.rng() * pool.length), 1)[0]);
  const cw = ARENA.w / CELLS.cols,
    ch = ARENA.h / CELLS.rows;
  for (let i = 0; i < total; i++) {
    if (safe.includes(i)) continue;
    const col = i % CELLS.cols,
      row = Math.floor(i / CELLS.cols);
    slab(h, col * cw + cw / 2, row * ch + ch / 2, cw / 2 - 3, ch / 2 - 3, {
      arm,
      duration: 0.4,
      scale: 0.7,
      color: '#ffd27a',
      extra: { key: 'plan' },
    });
  }
  put(e, 'safe', safe);
  put(e, 'planUntil', h.elapsed + arm + 0.5);
}

const SAMPLE_EVERY = 0.5;
const TRAIL = 12;

export const MECHANICS: Record<string, Mechanic> = {
  // --- location 1 ---
  commandant: {
    name: 'Броня воріт',
    boss: true,
    turn: 0.6,
    note: (e) =>
      (e.stagger ?? 0) > 0
        ? 'Броню збито: бий!'
        : e.phase >= 2
          ? 'Броня тріснула: спереду все ще міцна'
          : 'Спереду броня: обходь із флангу',
    start: (h, e) => put(e, 'bar', h.elapsed + 10),
    armor: (_h, e, angle) => {
      if ((e.stagger ?? 0) > 0 || !frontal(e, angle, COS_70)) return 1;
      return e.phase >= 2 ? 0.75 : 0.5;
    },
    tick: (h, e) => {
      if (e.phase < 1 || h.elapsed < num(e, 'bar')) return;
      // A bar through the gate that turns: nine positions in turn.
      const body = target(h, e),
        a0 = Math.atan2(body.y - e.y, body.x - e.x) - 0.7;
      for (let k = 0; k < 9; k++) {
        const a = a0 + k * 0.35;
        strike(h, {
          x: e.x - Math.cos(a) * 1000,
          y: e.y - Math.sin(a) * 1000,
          radius: 16,
          arm: 1.3 + k * 0.3,
          duration: 0.28,
          scale: 0.8,
          color: '#e8c36a',
          extra: { x2: e.x + Math.cos(a) * 1000, y2: e.y + Math.sin(a) * 1000 },
        });
      }
      put(e, 'bar', h.elapsed + (e.phase >= 2 ? 10 : 14));
    },
    onAttack: (h, e) => {
      // In fury the commandant rams the house on every second attack.
      if (e.phase < 2 || e.pattern % 2 !== 0) return;
      const body = target(h, e);
      e.lockedAim = Math.atan2(body.y - e.y, body.x - e.x);
      e.chargeLeft = 0.5;
    },
  },
  'scrap-press': {
    name: 'Стіни-преси',
    boss: true,
    note: (e) =>
      e.phase >= 2
        ? 'Одна плита лишилась назавжди'
        : 'Плити сходяться: тримайся центру',
    start: (h, e) => put(e, 'next', h.elapsed + 8),
    tick: (h, e) => {
      if (e.phase >= 2 && keyed(h, 'plate').length === 0)
        slab(h, 200, 500, 200, 520, {
          arm: 1.5,
          duration: 9999,
          scale: 0.9,
          color: '#c98c4b',
          extra: { key: 'plate' },
        });
      if (h.elapsed < num(e, 'next')) return;
      const vertical = e.phase >= 1 && num(e, 'n') % 2 === 1;
      bump(e, 'n');
      const style = {
        arm: 1.5,
        duration: 5,
        scale: 0.8,
        color: '#c98c4b',
        extra: { key: 'wall' },
      };
      if (vertical) {
        slab(h, ARENA.w / 2, 100, ARENA.w / 2 + 20, 100, style);
        slab(h, ARENA.w / 2, ARENA.h - 100, ARENA.w / 2 + 20, 100, style);
      } else {
        slab(h, 180, ARENA.h / 2, 180, ARENA.h / 2 + 20, style);
        slab(h, ARENA.w - 180, ARENA.h / 2, 180, ARENA.h / 2 + 20, style);
      }
      put(e, 'next', h.elapsed + (e.phase >= 2 ? 9 : e.phase >= 1 ? 11 : 13));
    },
  },
  signalman: {
    name: 'Антени зв’язку',
    boss: true,
    note: (e) => {
      const n = e.mech ? num(e, 'up') : 0;
      return n > 0
        ? `Антен ще ${n}: кожна додає захист і кличе патруль`
        : 'Антени збито: бий диспетчера';
    },
    start: (h, e) => {
      for (let i = 0; i < antennaCount(h); i++) addAntenna(h, e, i);
    },
    armor: (h) => Math.max(0.5, 1 - 0.12 * alive(h, 'antenna').length),
    tick: (h, e) => {
      const up = alive(h, 'antenna');
      put(e, 'up', up.length);
      for (const m of up)
        if (h.elapsed >= num(m, 'call')) {
          h.spawnAt(1, m.x, m.y);
          put(m, 'call', h.elapsed + 12);
        }
      for (let slot = 0; slot < antennaCount(h); slot++) {
        const at = num(e, `g${slot}`, -1);
        if (at >= 0 && h.elapsed >= at) {
          put(e, `g${slot}`, -1);
          if (!up.some((m) => num(m, 'slot') === slot)) addAntenna(h, e, slot);
        }
      }
    },
    onPhase: (h, e, phase) => {
      const up = alive(h, 'antenna');
      for (let slot = 0; slot < antennaCount(h); slot++) {
        if (up.some((m) => num(m, 'slot') === slot)) continue;
        if (phase >= 2) addAntenna(h, e, slot, 0.025);
        else put(e, `g${slot}`, h.elapsed + 35);
      }
    },
    onMinionDeath: (h, e, m) => {
      h.burst(m.x, m.y, '#8fd0ff', 10);
      if (e.phase >= 1 && e.phase < 2)
        put(e, `g${num(m, 'slot')}`, h.elapsed + 35);
    },
  },
  // --- location 2 ---
  'root-mother': {
    name: 'Кокони',
    boss: true,
    note: (e) => {
      const n = e.mech ? num(e, 'up') : 0;
      return n > 0
        ? `Кокони лікують її й гасять удари (${n}): руби їх першими`
        : 'Кокони зрубано: бий матір';
    },
    start: (h, e) => addPods(h, e, 2 + extra(h)),
    // Each cocoon takes a few blows off her, and feeds her.
    armor: (h) => Math.max(0.8, 1 - 0.04 * alive(h, 'pod').length),
    tick: (h, e, dt) => {
      const pods = alive(h, 'pod');
      put(e, 'up', pods.length);
      if (pods.length)
        h.heal(e, e.max * 0.0003 * pods.length * (e.phase >= 2 ? 1.5 : 1) * dt);
      if (e.hp < e.max * 0.66 && !num(e, 'w66')) {
        put(e, 'w66', 1);
        addPods(h, e, 2);
      }
      if (e.hp < e.max * 0.33 && !num(e, 'w33')) {
        put(e, 'w33', 1);
        addPods(h, e, 2);
      }
      if (e.phase < 1) return;
      for (const m of pods) {
        if (!num(m, 'fire')) put(m, 'fire', h.elapsed + 3);
        if (h.elapsed < num(m, 'fire')) continue;
        put(m, 'fire', h.elapsed + 4);
        const b = target(h, m),
          a = Math.atan2(b.y - m.y, b.x - m.x);
        for (const d of [-0.25, 0, 0.25])
          h.shoot(m.x, m.y, a + d, 150, weight(h));
      }
    },
    onPhase: (h, e, phase) => {
      if (phase >= 2)
        addPods(h, e, Math.max(0, 3 + extra(h) - alive(h, 'pod').length));
    },
    onMinionDeath: (h, _e, m) => {
      h.burst(m.x, m.y, '#9ccf6a', 12);
      strike(h, {
        x: m.x,
        y: m.y,
        radius: 70,
        arm: 0.2,
        duration: 4,
        scale: 0,
        color: '#9ccf6a',
        extra: { slow: 0.5, key: 'spore' },
      });
    },
  },
  irrigator: {
    name: 'Потоп і клапан',
    boss: true,
    note: (e) =>
      valveUp(e)
        ? 'Клапан! Збий його — вода зійде'
        : 'Вода повільнить: збий клапан, коли він з’явиться',
    start: (h, e) => put(e, 'flood', h.elapsed + 6),
    tick: (h, e) => {
      const valves = alive(h, 'valve');
      put(e, 'valve', valves.length);
      const cap = 4 + e.phase;
      if (h.elapsed >= num(e, 'flood') && keyed(h, 'flood').length < cap) {
        strike(h, {
          x: 250 + h.rng() * 1100,
          y: 200 + h.rng() * 600,
          radius: 170,
          arm: 0.8,
          duration: 60,
          scale: 0,
          color: '#6cc7e8',
          extra: { slow: 0.55, key: 'flood' },
        });
        put(e, 'flood', h.elapsed + (e.phase >= 2 ? 5 : e.phase >= 1 ? 6 : 8));
      }
      const wanted =
        (e.hp < e.max * 0.66 && !num(e, 'v66') ? 66 : 0) ||
        (e.hp < e.max * 0.33 && !num(e, 'v33') ? 33 : 0);
      if (wanted && !valves.length) {
        put(e, wanted === 66 ? 'v66' : 'v33', 1);
        addValve(h, e);
      } else if (e.phase >= 2 && !valves.length && h.elapsed >= num(e, 'vat'))
        addValve(h, e);
    },
    // The water carries her current: when she attacks, every pool is struck.
    onAttack: (h, _e, pattern) => {
      if (!pattern.name) return;
      for (const z of keyed(h, 'flood').slice(0, 6))
        strike(h, {
          x: z.x,
          y: z.y,
          radius: z.radius,
          arm: 0.9,
          duration: 0.3,
          scale: 0.5,
          color: '#bfeaff',
          extra: { key: 'zap' },
        });
    },
    onMinionDeath: (h, e, m) => {
      h.burst(m.x, m.y, '#6cc7e8', 16);
      expire(h, 'flood');
      h.stagger(e, 2);
      put(e, 'flood', h.elapsed + 10);
      put(e, 'vat', h.elapsed + 25);
    },
  },
  queen: {
    name: 'Кладка',
    boss: true,
    note: (e) => {
      const n = e.mech ? num(e, 'up') : 0;
      return n > 0
        ? `Яйця (${n}): знищ до вилуплення`
        : 'Королева кладе яйця раз на кілька секунд';
    },
    start: (h, e) => put(e, 'lay', h.elapsed + 6),
    tick: (h, e) => {
      const eggs = alive(h, 'egg');
      put(e, 'up', eggs.length);
      for (const egg of eggs) {
        if (h.elapsed < num(egg, 'hatch')) continue;
        h.vanish(egg);
        h.burst(egg.x, egg.y, '#d6e38a', 14);
        h.spawnAt(0, egg.x - 14, egg.y, 'swift');
        h.spawnAt(0, egg.x + 14, egg.y, 'swift');
        h.heal(e, e.max * 0.01);
      }
      if (h.elapsed < num(e, 'lay') || eggs.length > 8) return;
      const count = (e.phase >= 2 ? 4 : e.phase >= 1 ? 3 : 2) + extra(h);
      for (let i = 0; i < count; i++) {
        const p = around(h, e, 150, 320),
          egg = h.minion('egg', p.x, p.y, Math.round(e.max * 0.015));
        put(egg, 'hatch', h.elapsed + (e.phase >= 1 ? 5 : 7));
        put(egg, 'laid', h.elapsed);
      }
      put(e, 'lay', h.elapsed + (e.phase >= 1 ? 11 : 15));
    },
  },
  // --- location 3 ---
  architect: {
    name: 'Креслення',
    boss: true,
    note: (e) =>
      num(e, 'planUntil') > 0
        ? 'Стань на ціле місце креслення'
        : 'Креслення знесення скоро',
    start: (h, e) => put(e, 'next', h.elapsed + 8),
    tick: (h, e) => {
      if (h.elapsed >= num(e, 'next')) {
        blueprint(h, e, 2.4);
        put(
          e,
          'next',
          h.elapsed + (e.phase >= 2 ? 17 : e.phase >= 1 ? 20 : 22),
        );
        if (e.phase >= 1) put(e, 'second', h.elapsed + 2.4 + 0.4 + 1.2);
      }
      const second = num(e, 'second');
      if (second && h.elapsed >= second) {
        put(e, 'second', 0);
        blueprint(h, e, 2);
      }
    },
  },
  collector: {
    name: 'Кабельна мережа',
    boss: true,
    note: (e) => {
      const n = e.mech ? num(e, 'up') : 0;
      return n > 0
        ? `Вузлів ${n}: знищений вузол оглушує колектора`
        : 'Вузли знищено: колектор відкритий';
    },
    start: (h, e) => {
      for (let i = 0; i < Math.min(5, 3 + extra(h)); i++) addNode(h, e, i);
      rewire(h, e);
    },
    tick: (h, e) => {
      const nodes = alive(h, 'node');
      put(e, 'up', nodes.length);
      let regrown = false;
      for (let slot = 0; slot < Math.min(5, 3 + extra(h)); slot++) {
        const at = num(e, `g${slot}`, -1);
        if (at >= 0 && h.elapsed >= at) {
          put(e, `g${slot}`, -1);
          if (!nodes.some((m) => num(m, 'slot') === slot)) {
            addNode(h, e, slot);
            regrown = true;
          }
        }
      }
      if (regrown) rewire(h, e);
      const pulse = e.phase >= 2 && Math.floor(h.elapsed / 1.5) % 2 === 1;
      for (const z of h.hazards) {
        if (!z.key?.startsWith('wire') || z.age >= z.duration) continue;
        if (z.key.startsWith('wire-l')) {
          z.x2 = e.x;
          z.y2 = e.y;
        }
        z.off = pulse;
      }
    },
    onMinionDeath: (h, e, m) => {
      h.burst(m.x, m.y, '#7fd7ff', 16);
      h.stagger(e, 2);
      if (e.phase >= 1) put(e, `g${num(m, 'slot')}`, h.elapsed + 30);
      rewire(h, e);
    },
    onPhase: (h, e, phase) => {
      if (phase < 1) return;
      const up = alive(h, 'node');
      for (let slot = 0; slot < Math.min(5, 3 + extra(h)); slot++)
        if (!up.some((m) => num(m, 'slot') === slot))
          put(e, `g${slot}`, h.elapsed + 30);
    },
  },
  chronarch: {
    name: 'Зупинка часу',
    boss: true,
    note: (e) =>
      num(e, 'until') > num(e, 'now')
        ? 'Час зупинено: він невразливий, рухайся'
        : 'Зони з’являються там, де ти був 3 с тому: не стій',
    start: (h, e) => {
      put(e, 'stop', h.elapsed + 12);
      put(e, 'echo', h.elapsed + 6);
    },
    armor: (h, e) => (h.elapsed < num(e, 'until') ? 0 : 1),
    frozen: (h, e) => h.elapsed < num(e, 'until'),
    tick: (h, e) => {
      put(e, 'now', h.elapsed);
      const bodies = h.bodies().slice(0, 4);
      if (h.elapsed >= num(e, 'smp')) {
        put(e, 'smp', h.elapsed + SAMPLE_EVERY);
        bodies.forEach((b, i) => {
          const trail = list(e, `tr${i}`).slice(-(TRAIL - 2));
          put(e, `tr${i}`, [...trail, Math.round(b.x), Math.round(b.y)]);
        });
      }
      if (h.elapsed >= num(e, 'echo')) {
        put(e, 'echo', h.elapsed + (e.phase >= 2 ? 9 : e.phase >= 1 ? 11 : 13));
        bodies.forEach((_b, i) => {
          const trail = list(e, `tr${i}`);
          // The oldest four places: where the house was 3 to 1.5 s ago.
          for (let k = 0; k < 4 && k * 2 + 1 < trail.length; k++)
            strike(h, {
              x: trail[k * 2],
              y: trail[k * 2 + 1],
              radius: 62,
              arm: 1 + k * 0.35,
              duration: 0.4,
              scale: 0.8,
              color: '#c9b6ff',
            });
        });
      }
      if (h.elapsed >= num(e, 'stop')) {
        put(e, 'until', h.elapsed + 3);
        put(
          e,
          'stop',
          h.elapsed + (e.phase >= 2 ? 14 : e.phase >= 1 ? 18 : 22),
        );
        h.burst(e.x, e.y, '#c9b6ff', 20);
      }
    },
  },

  // --- the mini-bosses ---
  'mini-0-0': {
    name: 'Щит маршу',
    boss: false,
    note: (e) =>
      (e.windup ?? 0) > 0
        ? 'Щит опущено: бий!'
        : 'Щит спереду, поки він іде: чекай замаху',
    armor: (h, e, angle) => {
      if ((e.windup ?? 0) > 0 || h.elapsed < num(e, 'open')) return 1;
      return frontal(e, angle, COS_SHIELD) ? 0.6 : 1;
    },
    onAttack: (h, e) => put(e, 'open', h.elapsed + 1),
  },
  'mini-0-1': {
    name: 'Втягування',
    boss: false,
    note: () => 'Магніт тягне будинок: ривок виводить із поля',
    start: (h, e) => put(e, 'pull', h.elapsed + 6),
    tick: (h, e) => {
      if (h.elapsed < num(e, 'pull')) return;
      strike(h, {
        x: e.x,
        y: e.y,
        radius: 320,
        arm: 1.2,
        duration: 1.5,
        scale: 0,
        color: '#9db4ff',
        extra: { pull: 45, key: 'magnet' },
      });
      put(e, 'pull', h.elapsed + (e.phase >= 1 ? 12 : 15));
    },
  },
  'mini-0-2': {
    name: 'Парова завіса',
    boss: false,
    note: () => 'Стіна пари з проходом: біжи в підсвічений прохід',
    start: (h, e) => put(e, 'at', h.elapsed + 6),
    tick: (h, e) => {
      if (h.elapsed < num(e, 'at')) return;
      const body = target(h, e);
      let gap = 200 + h.rng() * 1200;
      for (let i = 0; i < 6 && Math.abs(gap - body.x) < 260; i++)
        gap = 200 + h.rng() * 1200;
      if (Math.abs(gap - body.x) < 260) gap = body.x < 800 ? 1200 : 400;
      const left = gap - 120,
        right = ARENA.w - gap - 120;
      // The whole floor but the doorway, all at one moment: a dash on the
      // last beat covers it, as it does any other strike.
      const style = {
        arm: 3.5,
        duration: 0.5,
        scale: 0.35,
        color: '#e9eef2',
        extra: { key: 'steam' },
      };
      if (left > 0)
        slab(h, left / 2, ARENA.h / 2, left / 2, ARENA.h / 2, style);
      if (right > 0)
        slab(
          h,
          ARENA.w - right / 2,
          ARENA.h / 2,
          right / 2,
          ARENA.h / 2,
          style,
        );
      put(e, 'gap', gap);
      put(e, 'gapUntil', h.elapsed + 4);
      put(e, 'at', h.elapsed + (e.phase >= 1 ? 16 : 20));
    },
  },
  'mini-1-0': {
    name: 'Спорові мітки',
    boss: false,
    note: () => 'Три мітки спор вкорінюють будинок: ривок скидає їх',
    onAttack: (_h, _e, pattern) => {
      for (const z of pattern.hazards) z.mark = true;
    },
  },
  'mini-1-1': {
    name: 'Охорона рою',
    boss: false,
    note: (e) => {
      const n = e.mech ? num(e, 'up') : 0;
      return n > 0
        ? `Охоронців ${n}: поки є хоч один, матка майже невразлива`
        : 'Охорону знищено: бий матку, поки охорона відростає';
    },
    start: (h, e) => {
      for (let i = 0; i < Math.min(6, 4 + extra(h)); i++) {
        const m = h.minion('guard', e.x, e.y, Math.round(e.max * 0.03), 0);
        put(m, 'slot', i);
      }
    },
    armor: (h) => (alive(h, 'guard').length ? 0.4 : 1),
    tick: (h, e) => {
      const guards = alive(h, 'guard'),
        count = Math.min(6, 4 + extra(h));
      put(e, 'up', guards.length);
      for (const m of guards) {
        const a = h.elapsed * 1.5 + (num(m, 'slot') * Math.PI * 2) / count;
        m.x = e.x + Math.cos(a) * 95;
        m.y = e.y + Math.sin(a) * 95;
      }
      for (let slot = 0; slot < count; slot++) {
        const at = num(e, `r${slot}`, -1);
        if (at >= 0 && h.elapsed >= at) {
          put(e, `r${slot}`, -1);
          const m = h.minion('guard', e.x, e.y, Math.round(e.max * 0.03), 0);
          put(m, 'slot', slot);
        }
      }
    },
    onMinionDeath: (h, e, m) => {
      h.burst(m.x, m.y, '#e3c94a', 8);
      put(e, `r${num(m, 'slot')}`, h.elapsed + 12);
    },
  },
  'mini-1-2': {
    name: 'Коренева пастка',
    boss: false,
    note: () => 'Коріння замикається навколо: вийди крізь прохід',
    start: (h, e) => put(e, 'at', h.elapsed + 7),
    tick: (h, e) => {
      if (h.elapsed < num(e, 'at')) return;
      put(e, 'at', h.elapsed + (e.phase >= 1 ? 14 : 17));
      const bodies = h.bodies(),
        b = bodies[Math.floor(h.rng() * bodies.length)] ?? target(h, e),
        gap = Math.floor(h.rng() * 8);
      for (let i = 0; i < 8; i++) {
        if (i === gap) continue;
        const a = (i * Math.PI) / 4;
        strike(h, {
          x: clamp(b.x + Math.cos(a) * 165, 40, ARENA.w - 40),
          y: clamp(b.y + Math.sin(a) * 165, 40, ARENA.h - 40),
          radius: 55,
          arm: 3.3,
          duration: 0.5,
          scale: 0.6,
          color: '#8fae52',
        });
      }
      strike(h, {
        x: b.x,
        y: b.y,
        radius: 95,
        arm: 3.3,
        duration: 0.5,
        scale: 0.6,
        color: '#8fae52',
      });
    },
  },
  'mini-2-0': {
    name: 'Камуфляж',
    boss: false,
    note: (e) =>
      num(e, 'cloak')
        ? 'Він не видний здалеку: підійди ближче 420'
        : 'Він видний: бий, поки не сховався',
    armor: (_h, e) => (num(e, 'cloak') ? 0.15 : 1),
    tick: (h, e) => {
      const body = target(h, e),
        far = Math.hypot(body.x - e.x, body.y - e.y) > 420;
      put(
        e,
        'cloak',
        far && !((e.windup ?? 0) > 0) && h.elapsed >= num(e, 'reveal') ? 1 : 0,
      );
    },
    onAttack: (h, e) => put(e, 'reveal', h.elapsed + 0.8),
  },
  'mini-2-1': {
    name: 'Підміна',
    boss: false,
    note: () => 'Двійники напівпрозорі й міняються з ним місцями',
    start: (h, e) => {
      for (let i = 0; i < 2; i++) {
        const p = around(h, e, 120, 220);
        h.minion('decoy', p.x, p.y, Math.round(e.max * 0.015), e.speed * 0.8);
      }
      put(e, 'swap', h.elapsed + 10);
    },
    armor: (_h, e, angle) => (frontal(e, angle, COS_SHIELD) ? 0.55 : 1),
    turn: 0.8,
    tick: (h, e) => {
      if (h.elapsed < num(e, 'swap')) return;
      put(e, 'swap', h.elapsed + 10);
      const copies = alive(h, 'decoy');
      if (!copies.length) return;
      const m = copies[Math.floor(h.rng() * copies.length)];
      [e.x, m.x] = [m.x, e.x];
      [e.y, m.y] = [m.y, e.y];
      h.burst(e.x, e.y, '#bfd7e6', 10);
      h.burst(m.x, m.y, '#bfd7e6', 10);
    },
  },
  'mini-2-2': {
    name: 'Двічі',
    boss: false,
    note: () => 'Кожна зона спрацьовує вдруге: не повертайся на місце',
    onAttack: (_h, _e, pattern) => {
      const again = pattern.hazards.map((z) => ({
        ...z,
        age: z.age - 1.8,
        color: '#cfe3ff',
        key: 'again',
      }));
      pattern.hazards.push(...again);
    },
  },
};

function addValve(h: MechHost, e: Unit) {
  h.minion(
    'valve',
    400 + h.rng() * 800,
    300 + h.rng() * 400,
    Math.round(e.max * 0.05),
    0,
  );
}
function valveUp(e: Unit) {
  return !!e.mech && num(e, 'valve') > 0;
}

// ---- what the engine calls --------------------------------------------------

export const bossKey = (id: string) => id;
export const miniKey = (location: number, variant: number) =>
  `mini-${location}-${variant}`;
export const mechanicOf = (e: { tag?: string }): Mechanic | undefined =>
  e.tag ? MECHANICS[e.tag] : undefined;
// Which phase a leader of this health is in: 0 at the start, 1 below a half,
// 2 (bosses only) in the last fifth.
export function leaderPhase(e: Enemy, boss: boolean): number {
  if (boss && e.hp < e.max * RAGE_AT) return 2;
  return e.hp < e.max * 0.5 ? 1 : 0;
}
// The gap between a boss's attacks shrinks as it gets angrier.
export const leaderTempo = (boss: boolean, phase: number) =>
  boss ? (phase >= 2 ? 0.78 : phase >= 1 ? 0.9 : 1) : 1;

export function startLeader(h: MechHost, e: Unit, key: string) {
  e.tag = key;
  e.mech = {};
  mechanicOf(e)?.start?.(h, e);
}
export function tickLeader(h: MechHost, e: Unit, dt: number) {
  mechanicOf(e)?.tick?.(h, e, dt);
}
export const leaderArmor = (h: MechHost, e: Unit, angle?: number): number =>
  mechanicOf(e)?.armor?.(h, e, angle) ?? 1;
export const leaderFrozen = (h: MechHost, e: Unit): boolean =>
  mechanicOf(e)?.frozen?.(h, e) ?? false;
export const leaderTurn = (e: Unit): number => mechanicOf(e)?.turn ?? 0;
export function leaderAttack(h: MechHost, e: Unit, pattern: BossPattern) {
  mechanicOf(e)?.onAttack?.(h, e, pattern);
}
export function leaderShift(h: MechHost, e: Unit, phase: number) {
  mechanicOf(e)?.onPhase?.(h, e, phase);
}
export function minionDied(h: MechHost, leader: Unit, m: Unit) {
  mechanicOf(leader)?.onMinionDeath?.(h, leader, m);
}
// The leader is down: its helpers and zones go with it.
export function endLeader(h: MechHost, e: Unit) {
  mechanicOf(e)?.end?.(h, e);
  for (const m of h.enemies) if (m.type === MECH_TYPE && m.hp > 0) h.vanish(m);
  for (const z of h.hazards)
    if (z.key && z.age < z.duration) z.age = z.duration;
}
// The line for the top of the screen.
export function leaderNote(
  e: Unit,
): { name: string; note: string } | undefined {
  const m = mechanicOf(e);
  return m ? { name: m.name, note: m.note(e) } : undefined;
}
