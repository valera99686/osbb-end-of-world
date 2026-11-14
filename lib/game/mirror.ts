// Online co-op, the second way to share a fight: the host is the only one who
// simulates; the guest sends its stick and its presses and draws what the host
// streams (the "mirror"). It costs more traffic than lockstep (net.ts) and the
// guest feels the delay of the link, but nothing can drift apart and a slow
// guest does not slow the host. The tests and the balance of the fight are the
// same as for lockstep, because the host's engine is the very same.
//
// What travels: about 15 times a second a snapshot of the house, the partner,
// the changed fields of every enemy (a delta against what the guest already
// has), the bullets, drops, hazards and explosive props, the HUD numbers, and
// a list of effects (sparks, rings, labels, sounds) that happened meanwhile.
import type { Ally, Battle, Enemy, Hud } from './engine';
import type { FightLink, Lockstep, Msg, Wire } from './net';
import type { Hazard } from './bosses';

export const SNAP_HZ = 15;
export const PIN_HZ = 30;
// Over a relay (a public broker, see app/relay-link.ts) only about ten messages
// a second get through, and some may still be lost: fewer snapshots, the
// guest's stick sent when it changes, and now and then a snapshot that holds
// everything, so that a lost one cannot leave an enemy missing or a ghost.
export const RELAY_SNAP_HZ = 6;
export const RELAY_KEY_EVERY = 12;

type Fields = Record<string, unknown>;
// An effect that happened on the host: [kind, ...arguments].
export type Fx = unknown[];
export interface Snap {
  // Snapshot number and simulation second.
  n: number;
  el: number;
  hud: Hud;
  // House: x, y, vx, vy, facing x, facing y, dashing, invincible, muzzle,
  // muzzle angle, pulse ring, haste, audit.
  h: number[];
  // The partners, one row each (seat first, then the same order as Ally in
  // engine.ts, then whether they are away); none alone.
  a: (number | string | boolean)[][];
  // Run numbers the canvas reads: hp, coins, kills, level, xp.
  r: number[];
  // Enemies: uid -> fields changed since the last snapshot; gone uids.
  en: Record<number, Fields>;
  gone: number[];
  // A snapshot that holds everything: the uids of all enemies alive.
  live?: number[];
  // Bullets: x, y, vx, vy, life, enemy, crit, then the kind.
  bu: (number | string)[][];
  // Drops: x, y, kind code, value.
  dr: number[][];
  hz: Hazard[];
  // Explosive props: blown, fuse > 0, hit.
  ex: number[][];
  // Combo and its timer.
  cb: number[];
  ev: Fx[];
  end?: boolean;
}
const r2 = (v: number) => Math.round(v * 100) / 100;
const KIND = { coin: 0, xp: 1, heal: 2 } as const;
const KIND_NAME = ['coin', 'xp', 'heal'] as const;

function plain(e: Enemy): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(e)) {
    if (typeof v === 'number') out[k] = r2(v);
    else if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v) && v.every((n) => typeof n === 'number'))
      out[k] = v.map((n: number) => r2(n));
    else if (v && typeof v === 'object') out[k] = JSON.parse(JSON.stringify(v));
  }
  return out;
}

// What a Battle needs of the host's end of a mirror, whether it feeds one guest
// (HostFeed) or several (FeedGroup).
export interface FeedLike {
  closed?: boolean;
  battle: Battle | null;
  attach(b: Battle): void;
  pump(b: Battle, real: number): void;
  finish(b: Battle, result: unknown): void;
}
// The feeds that are attached to a fight: its effects (sparks, rings, sounds)
// are wrapped once, and each one is told to every feed.
const feedsOf = new WeakMap<Battle, HostFeed[]>();

// The host's end of the mirror for one guest: builds the snapshots and takes
// the guest's inputs. It is attached to a Battle that runs as usual.
export class HostFeed implements FeedLike, FightLink {
  closed = false;
  private n = 0;
  private acc = 0;
  private uid = 0;
  private sinceKey = 0;
  private known = new Map<Enemy, { uid: number; sent: Fields }>();
  private fx: Fx[] = [];
  onClosed?: () => void;
  onOver?: () => void;
  constructor(
    readonly sid: number,
    readonly link: Wire,
    // The seat of the guest this feed is for.
    readonly seat = 1,
  ) {}
  // Wraps the effect helpers of the fight so each one is also recorded (for
  // every guest the fight is fed to).
  attach(b: Battle) {
    b.hostRemote = true;
    const taken = feedsOf.get(b);
    if (taken) {
      if (!taken.includes(this)) taken.push(this);
      return;
    }
    const all = [this];
    feedsOf.set(b, all);
    const note = (item: unknown[]) => {
      for (const f of all) if (f.fx.length < 240) f.fx.push(item);
    };
    const tap = <
      K extends 'burst' | 'ring' | 'label' | 'debris' | 'banner' | 'addTrauma',
    >(
      name: K,
      code: string,
    ) => {
      const original = (b[name] as (...a: unknown[]) => unknown).bind(b);
      (b as unknown as Record<string, unknown>)[name] = (
        ...args: unknown[]
      ) => {
        note([code, ...args]);
        return original(...args);
      };
    };
    tap('burst', 'b');
    tap('ring', 'r');
    tap('label', 'l');
    tap('debris', 'd');
    tap('banner', 'n');
    tap('addTrauma', 't');
    const damage = b.damageNumber.bind(b);
    b.damageNumber = (e: Enemy, amount: number, crit: boolean) => {
      // The enemies are known to each feed by its own number.
      for (const f of all) {
        const k = f.known.get(e);
        if (k && f.fx.length < 240) f.fx.push(['h', k.uid, r2(amount), crit]);
      }
      return damage(e, amount, crit);
    };
    // The sounds too, through a stand-in: the shared audio engine stays as it is.
    const audio = b.audio;
    b.audio = new Proxy(audio, {
      get: (target, prop) => {
        if (prop === 'play')
          return (kind: string, opts?: unknown) => {
            note(['s', kind, opts ?? null]);
            return target.play(kind as never, opts as never);
          };
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  // Called every frame: sends a snapshot at its own rate.
  pump(b: Battle, real: number) {
    this.acc += real;
    const relay = (this.link.kindOf?.(this.seat) ?? this.link.kind) === 'relay';
    if (this.acc < 1 / (relay ? RELAY_SNAP_HZ : SNAP_HZ) || !this.link.open)
      return;
    this.acc = 0;
    const key = relay && ++this.sinceKey >= RELAY_KEY_EVERY;
    if (key) this.sinceKey = 0;
    this.link.send(
      {
        t: 'snap',
        sid: this.sid,
        s: this.snapshot(b, false, key),
      },
      [this.seat],
    );
  }
  snapshot(b: Battle, end = false, key = false): Snap {
    // A snapshot that holds everything: each enemy as if it were new.
    if (key) for (const k of this.known.values()) k.sent = {};
    const en: Record<number, Fields> = {};
    const alive = new Set<Enemy>();
    for (const e of b.enemies) {
      let k = this.known.get(e);
      const now = plain(e);
      if (!k) {
        k = { uid: ++this.uid, sent: {} };
        this.known.set(e, k);
      }
      alive.add(e);
      const delta: Fields = {};
      for (const [key, v] of Object.entries(now))
        if (JSON.stringify(v) !== JSON.stringify(k.sent[key])) delta[key] = v;
      for (const key of Object.keys(k.sent))
        if (!(key in now)) delta[key] = null;
      if (Object.keys(delta).length) {
        en[k.uid] = delta;
        k.sent = now;
      }
    }
    const gone: number[] = [];
    for (const [e, k] of this.known)
      if (!alive.has(e)) {
        gone.push(k.uid);
        this.known.delete(e);
      }
    const snap: Snap = {
      n: ++this.n,
      el: r2(b.elapsed),
      hud: b.hud(),
      h: [
        b.x,
        b.y,
        b.vx,
        b.vy,
        b.facing.x,
        b.facing.y,
        b.dashing,
        b.invincible,
        b.muzzle,
        b.muzzleAngle,
        b.pulseRing,
        b.hasteTime,
        b.auditTime,
      ].map(r2),
      a: b.allies.map((a) => [
        a.seat,
        a.hero,
        r2(a.x),
        r2(a.y),
        r2(a.vx),
        r2(a.vy),
        r2(a.hp),
        r2(a.max),
        a.down,
        r2(a.downTime),
        r2(a.revive),
        r2(a.dashing),
        r2(a.invincible),
        r2(a.hasteTime),
        r2(a.facing.x),
        r2(a.facing.y),
        r2(a.muzzle),
        r2(a.aim),
        r2(a.walk),
        !!a.away,
      ]),
      r: [b.run.hp, b.run.coins, b.run.kills, b.run.level, b.run.xp].map(r2),
      en,
      gone,
      bu: b.bullets
        .filter((x) => x.life > 0)
        .slice(-300)
        .map((x) => [
          r2(x.x),
          r2(x.y),
          r2(x.vx),
          r2(x.vy),
          r2(x.life),
          x.enemy ? 1 : 0,
          x.crit ? 1 : 0,
          (x as { kind?: string }).kind ?? '',
        ]),
      dr: b.drops
        .filter((d) => d.value > 0)
        .slice(-200)
        .map((d) => [r2(d.x), r2(d.y), KIND[d.kind], d.value]),
      hz: [
        ...b.hazards.filter((h) => h.key),
        ...b.hazards.filter((h) => !h.key).slice(-40),
      ].map((h) => ({ ...h })),
      ex: b.explosives.map((p) => [
        p.blown ? 1 : 0,
        p.fuse > 0 ? 1 : 0,
        r2(p.hit),
      ]),
      cb: [b.combo, r2(b.comboTimer)],
      ev: this.fx,
      ...(end ? { end: true } : {}),
      ...(key ? { live: [...this.known.values()].map((k) => k.uid) } : {}),
    };
    this.fx = [];
    return snap;
  }
  // The guest's input: where its stick points and what it pressed.
  receive(m: Msg) {
    if (m.t === 'pin') {
      const b = this.battle;
      if (!b) return;
      const v = { x: m.x / 100, y: m.y / 100 };
      const a = b.allyOf(this.seat) ?? null;
      // A fight the others simulate in lockstep makes this seat's frames from
      // the stick; one the host simulates alone steers the house directly.
      if (b.sync) b.sync.pin(this.seat, m.x, m.y, m.f);
      else {
        if (a) a.pin = v;
        if (this.seat === 1) b.stick2 = v;
        if (m.f & 1) b.allyDash(a);
        if (m.f & 2) b.allyPulse(a);
      }
    } else if (m.t === 'perk') {
      // The guest took a perk for its own house: the host's fight takes it (and,
      // in a lockstep fight, tells the others).
      const b = this.battle;
      if (b?.sync) b.sync.receive({ ...m, who: this.seat }, this.seat);
      else b?.chooseMatePerk(m.id as never, this.seat);
    } else if (m.t === 'over') this.onOver?.();
  }
  battle: Battle | null = null;
  handleClose() {
    this.closed = true;
    this.onClosed?.();
  }
  // The fight is over: the guest gets the result (and a last snapshot).
  finish(b: Battle, result: unknown) {
    this.link.send({ t: 'snap', sid: this.sid, s: this.snapshot(b, true) }, [
      this.seat,
    ]);
    this.link.send({ t: 'end', sid: this.sid, result }, [this.seat]);
  }
  leave() {
    this.link.send({ t: 'over', sid: this.sid }, [this.seat]);
  }
}

// The host's end of a mirror for several guests: one feed each, and the fight
// goes on while any of them is still there.
export class FeedGroup implements FeedLike, FightLink {
  closed = false;
  battle: Battle | null = null;
  readonly feeds = new Map<number, HostFeed>();
  onClosed?: () => void;
  onOver?: () => void;
  constructor(
    readonly sid: number,
    // The way to the guests, and the seats of those the fight is fed to.
    readonly link: Wire,
    seats: readonly number[],
  ) {
    for (const seat of seats) this.feeds.set(seat, new HostFeed(sid, link, seat));
  }
  attach(b: Battle) {
    this.battle = b;
    for (const f of this.feeds.values()) {
      f.battle = b;
      f.attach(b);
    }
  }
  pump(b: Battle, real: number) {
    for (const f of this.feeds.values()) f.pump(b, real);
  }
  receive(m: Msg, from?: number) {
    if (m.t === 'over') {
      // A guest left its fight: the others play on.
      if (from !== undefined) this.seatLost(from);
      else this.onOver?.();
      return;
    }
    if (from !== undefined) this.feeds.get(from)?.receive(m);
  }
  // A guest comes into the fight that is on (or comes back to it): it is fed
  // from the very next snapshot, a whole one.
  add(seat: number) {
    if (this.feeds.has(seat)) return;
    const feed = new HostFeed(this.sid, this.link, seat);
    this.feeds.set(seat, feed);
    const b = this.battle;
    if (!b) return;
    feed.battle = b;
    feed.attach(b);
    b.setAway(seat, false);
  }
  // One guest's device is gone: its house is nobody's, the rest go on (the host
  // alone, if it must).
  seatLost(seat: number) {
    if (!this.feeds.delete(seat)) return;
    this.battle?.setAway(seat, true);
  }
  handleClose() {
    this.closed = true;
    this.onClosed?.();
  }
  finish(b: Battle, result: unknown) {
    for (const f of this.feeds.values()) f.finish(b, result);
  }
  leave() {
    for (const f of this.feeds.values()) f.leave();
  }
}

// What the host's session hears of one fight: the guests that simulate it with
// the host (a lockstep) and the ones that only watch it (a mirror feed) are
// told apart by their seats, and a seat may pass from one to the other.
export class FightMux implements FightLink {
  closed = false;
  // When a seat's fight was started over, so that the old end's farewell is
  // not taken for it leaving.
  private restarted = new Map<number, number>();
  // A farewell is not believed at once: a screen that is built again says one
  // before it speaks anew. It counts if nothing more comes from the seat.
  private leaving = new Map<number, ReturnType<typeof setTimeout>>();
  constructor(
    readonly sid: number,
    readonly lock: Lockstep | null,
    readonly feeds: FeedGroup,
    // How long a farewell waits for a word from the same seat (ms).
    readonly grace = 1500,
  ) {}
  // A seat has been given the fight again (as a mirror).
  restart(seat: number) {
    this.restarted.set(seat, Date.now());
  }
  receive(m: Msg, from?: number) {
    if (from !== undefined && m.t !== 'over') {
      const wait = this.leaving.get(from);
      if (wait !== undefined) {
        clearTimeout(wait);
        this.leaving.delete(from);
      }
    }
    if (from !== undefined && m.t === 'over') {
      const at = this.restarted.get(from);
      if (at !== undefined && Date.now() - at < 4000) return;
      // A guest left its fight: its house stands there, the others play on.
      if (!this.leaving.has(from))
        this.leaving.set(
          from,
          setTimeout(() => {
            this.leaving.delete(from);
            this.seatLost(from);
          }, this.grace),
        );
      return;
    }
    if (from !== undefined && this.feeds.feeds.has(from))
      this.feeds.receive(m, from);
    else this.lock?.receive(m, from);
  }
  seatLost(seat: number) {
    this.feeds.seatLost(seat);
    this.lock?.seatLost(seat);
  }
  handleClose() {
    this.closed = true;
    for (const wait of this.leaving.values()) clearTimeout(wait);
    this.leaving.clear();
    this.lock?.handleClose();
    this.feeds.handleClose();
  }
}

const ENEMY_BASE: Fields = {
  x: 0,
  y: 0,
  hp: 1,
  max: 1,
  r: 14,
  type: 0,
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
};
// The guest's end: sends inputs, receives snapshots and writes them into a
// Battle that is only drawn, never simulated.
export class MirrorClient {
  closed = false;
  private acc = 0;
  private dash = false;
  private pulse = false;
  private latest = 0;
  private enemies = new Map<number, Enemy>();
  private goal = new Map<number, { x: number; y: number }>();
  private house = { x: 0, y: 0 };
  // Where each partner is as of the last snapshot, by seat.
  private mates = new Map<number, { x: number; y: number }>();
  private fresh = true;
  private lastAt = performance.now();
  private lastPin = '';
  onClosed?: () => void;
  onOver?: () => void;
  onEnd?: (result: unknown) => void;
  battle: Battle | null = null;
  // Real seconds since the host last sent anything.
  get stalled() {
    return (performance.now() - this.lastAt) / 1000;
  }
  constructor(
    readonly sid: number,
    readonly link: Wire,
    readonly aim: () => { x: number; y: number },
  ) {}
  press(kind: 'dash' | 'pulse') {
    if (kind === 'dash') this.dash = true;
    else this.pulse = true;
  }
  // The guest takes a perk for its own house; only the host's fight changes.
  choose(id: string) {
    if (this.link.open)
      this.link.send({ t: 'perk', sid: this.sid, id });
  }
  // How many messages of each kind have arrived (for tracing a lost one).
  seen: Record<string, number> = {};
  receive(m: Msg) {
    this.seen[m.t] = (this.seen[m.t] ?? 0) + 1;
    if (m.t === 'snap') this.apply(m.s as Snap);
    else if (m.t === 'end') this.onEnd?.(m.result);
    else if (m.t === 'over') this.onOver?.();
  }
  handleClose() {
    this.closed = true;
    this.onClosed?.();
  }
  // Every frame: send the input at its own rate, and glide what is drawn
  // toward the last snapshot.
  pump(b: Battle, real: number) {
    this.acc += real;
    const wants = this.dash || this.pulse;
    const relay = this.link.kind === 'relay';
    const v = this.aim();
    const len = Math.hypot(v.x, v.y),
      k = len > 1 ? 1 / len : 1;
    const x = Math.round(v.x * k * 100),
      y = Math.round(v.y * k * 100);
    // Over a relay the stick is sent when it moves (at most a few times a
    // second) and now and then when it does not.
    const gap = relay
      ? `${x},${y}` !== this.lastPin
        ? 0.15
        : 0.5
      : 1 / PIN_HZ;
    if ((this.acc >= gap || wants) && this.link.open) {
      this.acc = 0;
      this.lastPin = `${x},${y}`;
      this.link.send({
        t: 'pin',
        sid: this.sid,
        x,
        y,
        f: (this.dash ? 1 : 0) | (this.pulse ? 2 : 0),
      });
      this.dash = this.pulse = false;
    }
    const ease = 1 - Math.exp(-real * 16);
    for (const [uid, e] of this.enemies) {
      const g = this.goal.get(uid);
      if (g) {
        e.x += (g.x - e.x) * ease;
        e.y += (g.y - e.y) * ease;
      }
    }
    b.x += (this.house.x - b.x) * ease;
    b.y += (this.house.y - b.y) * ease;
    for (const a of b.allies) {
      const to = this.mates.get(a.seat);
      if (!to) continue;
      a.x += (to.x - a.x) * ease;
      a.y += (to.y - a.y) * ease;
    }
    for (const bullet of b.bullets) {
      bullet.x += bullet.vx * real;
      bullet.y += bullet.vy * real;
    }
  }
  apply(s: Snap) {
    const b = this.battle;
    if (!b || s.n <= this.latest) return;
    this.latest = s.n;
    this.lastAt = performance.now();
    b.elapsed = s.el;
    const [
      x,
      y,
      vx,
      vy,
      fx,
      fy,
      dashing,
      inv,
      muzzle,
      angle,
      ring,
      haste,
      audit,
    ] = s.h;
    this.house = { x, y };
    if (this.fresh) {
      b.x = x;
      b.y = y;
    }
    b.vx = vx;
    b.vy = vy;
    b.facing = { x: fx, y: fy };
    b.dashing = dashing;
    b.invincible = inv;
    b.muzzle = muzzle;
    b.muzzleAngle = angle;
    b.pulseRing = ring;
    b.hasteTime = haste;
    b.auditTime = audit;
    // The partners: each seat's house as the host has it, keeping what only this
    // end knows of it (its stats and perks, drawn from the same run).
    const seen = new Set<number>();
    const hudOf = new Map((s.hud.allies ?? []).map((h) => [h.seat, h]));
    const previous = new Map(b.allies.map((x) => [x.seat, x]));
    const rows: Ally[] = [];
    for (const row of s.a) {
      const [
        seat,
        hero,
        ax,
        ay,
        avx,
        avy,
        hp,
        max,
        down,
        downTime,
        revive,
        dashA,
        invA,
        hasteA,
        fax,
        fay,
        mz,
        aim,
        walk,
        away,
      ] = row as unknown as [
        number,
        string,
        number,
        number,
        number,
        number,
        number,
        number,
        boolean,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        boolean,
      ];
      seen.add(seat);
      this.mates.set(seat, { x: ax, y: ay });
      const old = previous.get(seat);
      const hud = hudOf.get(seat) ?? (seat === 1 ? s.hud.ally : undefined);
      rows.push({
        seat,
        name: old?.name,
        stats: old?.stats ?? b.stats,
        perks: old?.perks ?? {},
        draft: old?.draft ?? null,
        away,
        hero,
        x: this.fresh || !old ? ax : old.x,
        y: this.fresh || !old ? ay : old.y,
        vx: avx,
        vy: avy,
        hp,
        max,
        down,
        downTime,
        revive,
        dashCd: hud?.dash ?? 0,
        pulseCd: hud?.pulse ?? 0,
        dashing: dashA,
        invincible: invA,
        hasteTime: hasteA,
        facing: { x: fax, y: fay },
        shotTimer: 1,
        muzzle: mz,
        aim,
        walk,
      });
    }
    for (const seat of this.mates.keys())
      if (!seen.has(seat)) this.mates.delete(seat);
    b.allies = rows;
    b.allyFocus = rows.some((r) => !r.down && !r.away) ? 1 : 0;
    this.fresh = false;
    [b.run.hp, b.run.coins, b.run.kills, b.run.level, b.run.xp] = s.r;
    // Enemies: apply the deltas, let the vanished ones fall.
    for (const uid of s.gone) {
      const e = this.enemies.get(uid);
      if (e) {
        if (e.type !== -1) b.defeated.push({ ...e, life: 0.48 });
        this.enemies.delete(uid);
        this.goal.delete(uid);
      }
    }
    for (const [key, delta] of Object.entries(s.en)) {
      const uid = Number(key);
      let e = this.enemies.get(uid);
      const isNew = !e;
      if (!e) {
        e = { ...ENEMY_BASE } as unknown as Enemy;
        this.enemies.set(uid, e);
      }
      const fields = e as unknown as Fields;
      const g = this.goal.get(uid) ?? { x: 0, y: 0 };
      for (const [k, v] of Object.entries(delta)) {
        // A newcomer appears where it is; the others glide to the new spot.
        if (k === 'x' && !isNew) g.x = v as number;
        else if (k === 'y' && !isNew) g.y = v as number;
        else if (v === null) delete fields[k];
        else fields[k] = v;
      }
      if (isNew) {
        g.x = e.x;
        g.y = e.y;
      }
      this.goal.set(uid, g);
    }
    // A snapshot that holds everything: whoever is not in it is gone, even if
    // the snapshot that said so was lost on the way.
    if (s.live) {
      const keep = new Set(s.live);
      for (const uid of this.enemies.keys())
        if (!keep.has(uid)) {
          this.enemies.delete(uid);
          this.goal.delete(uid);
        }
    }
    b.enemies = [...this.enemies.values()];
    b.bullets = s.bu.map(([bx, by, bvx, bvy, life, enemy, crit, kind]) => ({
      x: bx as number,
      y: by as number,
      vx: bvx as number,
      vy: bvy as number,
      life: life as number,
      damage: 0,
      enemy: !!enemy,
      crit: !!crit,
      age: 0.2,
      ...(kind ? { kind: kind as never } : {}),
    }));
    b.drops = s.dr.map(([dx, dy, kind, value]) => ({
      x: dx,
      y: dy,
      kind: KIND_NAME[kind],
      value,
      t: 0,
    }));
    b.hazards = s.hz;
    s.ex.forEach(([blown, fuse, hit], i) => {
      const p = b.explosives[i];
      if (!p) return;
      p.blown = !!blown;
      p.fuse = fuse ? 0.1 : 0;
      p.hit = hit;
    });
    [b.combo, b.comboTimer] = s.cb;
    for (const ev of s.ev) this.replay(b, ev);
    b.onHud(s.hud);
  }
  private replay(b: Battle, ev: Fx) {
    const [code, ...a] = ev;
    switch (code) {
      case 'b':
        return b.burst(...(a as Parameters<Battle['burst']>));
      case 'r':
        return b.ring(...(a as Parameters<Battle['ring']>));
      case 'l':
        return b.label(...(a as Parameters<Battle['label']>));
      case 'd':
        return b.debris(...(a as Parameters<Battle['debris']>));
      case 'n':
        return b.banner(...(a as Parameters<Battle['banner']>));
      case 't':
        return b.addTrauma(...(a as Parameters<Battle['addTrauma']>));
      case 'h': {
        const e = this.enemies.get(a[0] as number);
        if (e) b.damageNumber(e, a[1] as number, !!a[2]);
        return;
      }
      case 's':
        return b.audio.play(a[0] as never, (a[1] ?? undefined) as never);
    }
  }
}
