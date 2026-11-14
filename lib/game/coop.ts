import { CHARACTERS } from './data';
import type { HeatEffects } from './modes';

// Co-op, local or online: two houses, two players. The first player drives the
// house; the second one drives a second house on its own legs, with a build of
// its own (model.ts mateItems: its own cannon or core and modules in the same
// rooms), its own health, a dash and the ability of their own head of ОСББ.
// The rooms, perks, experience and coins are shared, and so is the life of the
// raid (the first house's health). Every reward is two rows of finds, one for
// each house, and the shop sells to either; money comes twice as fast.
// A raid has one to four houses: the host's (seat 0) and up to three partners'
// (seats 1..3; on one device there is one partner at most).
export const MAX_PLAYERS = 4;
// What a fight and a raid are made of for a party of 1..4 players. With two it
// is what a raid for two has always been: twice the enemies, half the crystals
// from the floor each, twice the money. With three and four the enemies do not
// come three and four times as often (a phone would have to draw 200 of them):
// fewer, and tougher, so the party has as much to shoot through as it has guns.
// There is one leader whatever the party: tougher by the party's size, and its
// marked zones open under every player standing (engine.ts leaderEcho).
// Heat for enemies only: the ladder and the records of solo play are not
// touched.
// The colour of each seat's plate, ring and bar (amber, teal, red, violet),
// used when there are more than two players.
export const SEAT_COLORS = ['#e0b060', '#5fd3c4', '#ef6f5e', '#a98cf0'];
export interface PartyScale {
  // How much more often enemies come, and how many may be alive at once.
  spawnRate: number;
  enemyHealth: number;
  // The one leader's health, the clock of its fight and the gap between its
  // attacks (below 1 is faster).
  leaderHealth: number;
  leaderTime: number;
  bossTime: number;
  // The share of a crystal and of a coin from the floor that counts, and what
  // every other gain of coins is multiplied by (one till kits out every house).
  xp: number;
  coins: number;
  money: number;
}
export const PARTY: readonly PartyScale[] = [
  {
    spawnRate: 1,
    enemyHealth: 1,
    leaderHealth: 1,
    leaderTime: 1,
    bossTime: 1,
    xp: 1,
    coins: 1,
    money: 1,
  },
  {
    spawnRate: 2,
    enemyHealth: 1,
    leaderHealth: 1.8,
    leaderTime: 1.25,
    bossTime: 1,
    xp: 0.5,
    coins: 1,
    money: 2,
  },
  {
    spawnRate: 2.5,
    enemyHealth: 1.2,
    leaderHealth: 2.7,
    leaderTime: 1.4,
    bossTime: 1,
    xp: 0.4,
    coins: 1.2,
    money: 3,
  },
  {
    spawnRate: 3,
    enemyHealth: 1.33,
    leaderHealth: 3.6,
    leaderTime: 1.5,
    bossTime: 1,
    xp: 1 / 3,
    coins: 4 / 3,
    money: 4,
  },
];
// The scale for a party of `players` (1..4; anything else is the nearest).
export function party(players: number): PartyScale {
  const n = Number.isFinite(players) ? Math.round(players) : 1;
  return PARTY[Math.max(1, Math.min(MAX_PLAYERS, n)) - 1];
}
export const COOP = {
  // A partner house's health and damage as a share of what its own build
  // gives (a build of its own is already its share of the finds, so no
  // handicap).
  hp: 1,
  damage: 1,
  range: 1,
  fireGap: 1,
  speed: 1,
  regen: 0.5,
  // A leader's marked zone that opens under a player who is not its main
  // target hurts this share of the pattern's own.
  echoDamage: 1,
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
  // The share of the host's cores at the end of the raid: the same as the
  // host's (both players get as many cores for a raid made together).
  share: 1,
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
// At the end of the raid the guest gets as many cores as the host; what the
// fights of this raid already paid it is an advance on that (so a guest who
// leaves early keeps what it earned, and the two end up even).
export function guestRunCores(hostCores: number, advance = 0): number {
  return Math.max(0, Math.ceil(hostCores * GUEST.share) - Math.max(0, advance));
}

// Online, where the raid goes next is decided by all the players: each one
// picks a node of the same map. The pick most of them made goes there; a tie is
// settled by a coin between the leaders, the same on every end (it comes from
// the run's seed). A guest who stays silent does not hold the host up for ever,
// and one who is not here does not count.
export const VOTE = {
  // Seconds the host's pick waits for a silent guest.
  silent: 20,
} as const;
export interface Ballot {
  // The step of the map and the columns that can be picked on it.
  step: number;
  options: number[];
  // The pick of each seat (0 is the host), null while it has not picked.
  votes: (number | null)[];
  // Seats that are not here: nobody waits for them.
  away?: number[];
  // The verdict, once there is one.
  done?: { col: number; coin: boolean };
}
export function newBallot(
  step: number,
  options: readonly number[],
  seats = 2,
  away: readonly number[] = [],
): Ballot {
  return {
    step,
    options: [...options],
    votes: Array.from({ length: Math.max(2, Math.min(MAX_PLAYERS, seats)) }, () => null),
    ...(away.length ? { away: [...away] } : {}),
  };
}
// A pick counts only for a column of the step, and only until the verdict.
// `who` is a seat (0 is the host; 'host' and 'guest' are seats 0 and 1).
export function castVote(
  b: Ballot,
  who: 'host' | 'guest' | number,
  col: unknown,
): Ballot {
  const seat = who === 'host' ? 0 : who === 'guest' ? 1 : who;
  if (
    b.done ||
    !Number.isInteger(seat) ||
    seat < 0 ||
    seat >= b.votes.length ||
    typeof col !== 'number' ||
    !Number.isInteger(col) ||
    !b.options.includes(col)
  )
    return b;
  const votes = [...b.votes];
  votes[seat] = col;
  return { ...b, votes };
}
// The column the vote picks, and whether a coin settled a tie; null while
// somebody here has still to choose. The host's own pick is always needed.
export function ballotResult(
  b: Ballot,
  seed: number,
  silent = false,
): { col: number; coin: boolean } | null {
  if (b.done) return b.done;
  if (b.votes[0] === null) return null;
  const counted = b.votes
    .map((col, seat) => ({ col, seat }))
    .filter((v) => !b.away?.includes(v.seat));
  if (!silent && counted.some((v) => v.col === null)) return null;
  const picks = counted.flatMap((v) => (v.col === null ? [] : [v.col]));
  const tally = new Map<number, number>();
  for (const col of picks) tally.set(col, (tally.get(col) ?? 0) + 1);
  const top = Math.max(...tally.values());
  // The leaders, in the order of the seats that picked them first.
  const leaders = [...tally].filter(([, n]) => n === top).map(([col]) => col);
  if (leaders.length === 1) return { col: leaders[0], coin: false };
  const flip = Math.imul((seed >>> 0) + b.step * 7919, 2654435761) >>> 16;
  return { col: leaders[flip % leaders.length], coin: true };
}
// A ballot that came over the wire, or null if it is not one.
export function readBallot(m: unknown): Ballot | null {
  if (!m || typeof m !== 'object') return null;
  const v = m as Record<string, unknown>;
  const ints = (x: unknown): x is number =>
    typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 64;
  if (
    !ints(v.step) ||
    !Array.isArray(v.options) ||
    !v.options.every(ints) ||
    !Array.isArray(v.votes) ||
    v.votes.length < 2 ||
    v.votes.length > MAX_PLAYERS
  )
    return null;
  const votes: (number | null)[] = [];
  for (const x of v.votes) {
    if (x === null) votes.push(null);
    else if (ints(x)) votes.push(x);
    else return null;
  }
  const b: Ballot = {
    step: v.step,
    options: v.options.slice(0, 16),
    votes,
  };
  if (Array.isArray(v.away))
    b.away = v.away.filter(
      (x): x is number => ints(x) && x > 0 && x < votes.length,
    );
  if (b.away && !b.away.length) delete b.away;
  const d = v.done as Record<string, unknown> | undefined;
  if (d && typeof d === 'object' && ints(d.col))
    b.done = { col: d.col, coin: d.coin === true };
  return b;
}

// The partner a run may bring: any head of ОСББ already opened by the profile
// (the same hero as the first player is allowed). '' means "alone".
export function coopHero(wins: number, id: unknown): string {
  if (typeof id !== 'string') return '';
  const hero = CHARACTERS.find((c) => c.id === id);
  return hero && hero.win <= wins ? hero.id : '';
}
export const coopPartners = (wins: number) =>
  CHARACTERS.filter((c) => c.win <= wins);

// The partner's health for a given house health.
export const allyHealth = (houseHealth: number) =>
  Math.max(20, Math.round(houseHealth * COOP.hp));

// Enemies of a fight for a party: more of them, and tougher past two players.
export function coopHeat(heat: HeatEffects, players = 2): HeatEffects {
  const p = party(players);
  return {
    ...heat,
    enemyHealth: heat.enemyHealth * p.enemyHealth,
    spawnRate: heat.spawnRate * p.spawnRate,
    bossTime: heat.bossTime * p.bossTime,
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
  return {
    ax: ex / 2 || 0,
    ay: ey / 2 || 0,
    bx: -ex / 2 || 0,
    by: -ey / 2 || 0,
  };
}
