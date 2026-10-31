import { CHARACTERS } from './data';
import type { HeatEffects } from './modes';

// Co-op, local or online: two houses, two players. The first player drives the
// house; the second one drives a second house on its own legs, with a build of
// its own (model.ts mateItems: its own cannon or core and modules in the same
// rooms), its own health, a dash and the ability of their own head of ОСББ.
// The rooms, perks, experience and coins are shared, and so is the life of the
// raid (the first house's health). Every reward is two rows of finds, one for
// each house, and the shop sells to either; money comes twice as fast.
export const COOP = {
  // The second house's health and damage as a share of what its own build
  // gives (a build of its own is already half of the finds, so no handicap).
  hp: 1,
  damage: 1,
  range: 1,
  fireGap: 1,
  speed: 1,
  regen: 0.5,
  // The number of players a fight is made for. A fight with a partner has
  // this many times the enemies (they come this much faster and in packs this
  // much bigger) and this many leaders, each as tough as a lone player's one.
  // Heat for enemies only: the ladder and the records of solo play are not
  // touched.
  players: 2,
  enemyHealth: 1,
  spawnRate: 2,
  leaders: 2,
  // Two leaders attack at once, and their patterns are made for one target:
  // each one is a little weaker and swings a little less often.
  leaderHealth: 0.9,
  bossTime: 1.35,
  // Revive: the house stands next to the fallen one for this long. Alone the
  // partner gets up after `autoRise` seconds with a part of their health.
  reviveSeconds: 2.5,
  reviveRadius: 95,
  autoRise: 22,
  riseHp: 0.35,
  reviveHp: 0.5,
  // Safe time after getting up.
  riseGuard: 1.6,
  // The partner never goes further than this from the house, so both stay in
  // the picture on a small screen.
  spreadX: 1180,
  spreadY: 560,
  // Radius around the partner that draws enemy fire like the house does.
  hitRadius: 24,
  // Leaders have this much more time to fall: there are two of them, and the
  // clock of a fight is made for one set of guns.
  leaderTime: 1.25,
  // Two guns kill a third more enemies, so crystals from the floor count at
  // this share: the levels keep the pace of solo play.
  xp: 0.5,
  // Coins from the floor count in full and every other gain of coins is
  // multiplied: two houses are kitted out from one till.
  coins: 1,
  money: 2,
  // Online, a link and a person react late: every hit leaves this many more
  // seconds of safety, for both players (it is part of the shared simulation).
  netGrace: 0.15,
} as const;

// Keyboard of the first player and of the second one. In solo play the arrows
// still move the house, so nothing changes for anyone who plays alone.
export const P1_KEYS = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  dash: ['Space'],
  pulse: ['KeyE'],
} as const;
export const P2_KEYS = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  dash: ['Slash', 'Numpad0', 'ShiftRight'],
  pulse: ['Period', 'NumpadDecimal', 'ControlRight'],
} as const;
export const SOLO_KEYS = {
  ...P1_KEYS,
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
} as const;
export type KeyLayout = {
  readonly left: readonly string[];
  readonly right: readonly string[];
  readonly up: readonly string[];
  readonly down: readonly string[];
  readonly dash: readonly string[];
  readonly pulse: readonly string[];
};
// Every code the second player owns; the UI must not leave them to the page.
export const P2_CODES: readonly string[] = [
  ...P2_KEYS.left,
  ...P2_KEYS.right,
  ...P2_KEYS.up,
  ...P2_KEYS.down,
  ...P2_KEYS.dash,
  ...P2_KEYS.pulse,
];

// A direction from the keys held down: -1..1 on both axes.
export function keyVector(
  held: { has(code: string): boolean },
  layout: KeyLayout,
): { x: number; y: number } {
  const on = (codes: readonly string[]) => codes.some((c) => held.has(c));
  return {
    x: (on(layout.right) ? 1 : 0) - (on(layout.left) ? 1 : 0),
    y: (on(layout.down) ? 1 : 0) - (on(layout.up) ? 1 : 0),
  };
}

// What the guest of an online room earns for helping: cores for every fight
// they played and a share of the cores the host's raid brings. The guest's own
// profile pays them out, so playing as a neighbour is a way forward too.
export const GUEST = {
  // A fight won, a leader (miniboss or boss) won on top of it, and one more
  // for every `per` kills, up to `cap`.
  win: 1,
  leader: 2,
  per: 15,
  cap: 3,
  // A lost fight still pays one for every `per` kills, at most one.
  lostCap: 1,
  // The share of the host's cores at the end of the raid.
  share: 0.5,
} as const;
export function guestFightCores(
  won: boolean,
  leader: boolean,
  kills: number,
): number {
  const hits = Math.max(0, Math.floor(kills / GUEST.per));
  return won
    ? GUEST.win + (leader ? GUEST.leader : 0) + Math.min(GUEST.cap, hits)
    : Math.min(GUEST.lostCap, hits);
}
export function guestRunCores(hostCores: number): number {
  return Math.max(0, Math.ceil(hostCores * GUEST.share));
}

// Online, where the raid goes next is decided by both players: each one picks
// a node of the same map. The same pick goes there; different picks are settled
// by a coin, the same on both ends (it comes from the run's seed). A guest who
// stays silent does not hold the host up for ever.
export const VOTE = {
  // Seconds the host's pick waits for a silent guest.
  silent: 20,
} as const;
export interface Ballot {
  // The step of the map and the columns that can be picked on it.
  step: number;
  options: number[];
  host: number | null;
  guest: number | null;
  // The verdict, once there is one.
  done?: { col: number; coin: boolean };
}
export function newBallot(step: number, options: readonly number[]): Ballot {
  return { step, options: [...options], host: null, guest: null };
}
// A pick counts only for a column of the step, and only until the verdict.
export function castVote(
  b: Ballot,
  who: 'host' | 'guest',
  col: unknown,
): Ballot {
  if (
    b.done ||
    typeof col !== 'number' ||
    !Number.isInteger(col) ||
    !b.options.includes(col)
  )
    return b;
  return { ...b, [who]: col };
}
// The column the vote picks, and whether a coin settled a disagreement; null
// while somebody has still to choose. The host's own pick is always needed.
export function ballotResult(
  b: Ballot,
  seed: number,
  silent = false,
): { col: number; coin: boolean } | null {
  if (b.done) return b.done;
  if (b.host === null) return null;
  if (b.guest === null) return silent ? { col: b.host, coin: false } : null;
  if (b.host === b.guest) return { col: b.host, coin: false };
  const flip = (Math.imul((seed >>> 0) + b.step * 7919, 2654435761) >>> 16) & 1;
  return { col: flip ? b.guest : b.host, coin: true };
}
// A ballot that came over the wire, or null if it is not one.
export function readBallot(m: unknown): Ballot | null {
  if (!m || typeof m !== 'object') return null;
  const v = m as Record<string, unknown>;
  const ints = (x: unknown): x is number =>
    typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 64;
  const pick = (x: unknown) => (x === null ? null : ints(x) ? x : undefined);
  if (!ints(v.step) || !Array.isArray(v.options) || !v.options.every(ints))
    return null;
  const host = pick(v.host),
    guest = pick(v.guest);
  if (host === undefined || guest === undefined) return null;
  const b: Ballot = {
    step: v.step,
    options: v.options.slice(0, 16),
    host,
    guest,
  };
  const d = v.done as Record<string, unknown> | undefined;
  if (d && typeof d === 'object' && ints(d.col))
    b.done = { col: d.col, coin: d.coin === true };
  return b;
}

// The partner a run may bring: any head of ОСББ already opened by the profile
// (the same hero as the first player is allowed). '' means "alone".
export function coopHero(
  wins: number,
  id: unknown,
): string {
  if (typeof id !== 'string') return '';
  const hero = CHARACTERS.find((c) => c.id === id);
  return hero && hero.win <= wins ? hero.id : '';
}
export const coopPartners = (wins: number) =>
  CHARACTERS.filter((c) => c.win <= wins);

// The partner's health for a given house health.
export const allyHealth = (houseHealth: number) =>
  Math.max(20, Math.round(houseHealth * COOP.hp));

// Enemies of a co-op fight: more of them and a little tougher.
export function coopHeat(heat: HeatEffects): HeatEffects {
  return {
    ...heat,
    enemyHealth: heat.enemyHealth * COOP.enemyHealth,
    spawnRate: heat.spawnRate * COOP.spawnRate,
    bossTime: heat.bossTime * COOP.bossTime,
  };
}

// Progress of a revive (0..1). The house next to the fallen partner fills it;
// away from them it drains at half the speed.
export function reviveStep(progress: number, near: boolean, dt: number) {
  const next = near
    ? progress + dt / COOP.reviveSeconds
    : progress - (dt / COOP.reviveSeconds) * 0.5;
  return Math.max(0, Math.min(1, next));
}

// Keeps two heroes inside one screen: if the gap is bigger than allowed, both
// step back by half of the excess. Returns the corrections for each of them.
export function spreadFix(
  a: { x: number; y: number },
  b: { x: number; y: number },
  maxX: number = COOP.spreadX,
  maxY: number = COOP.spreadY,
): { ax: number; ay: number; bx: number; by: number } {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const ex = Math.max(0, Math.abs(dx) - maxX) * Math.sign(dx),
    ey = Math.max(0, Math.abs(dy) - maxY) * Math.sign(dy);
  // `|| 0` keeps a negative zero out of the result.
  return { ax: ex / 2 || 0, ay: ey / 2 || 0, bx: -ex / 2 || 0, by: -ey / 2 || 0 };
}
