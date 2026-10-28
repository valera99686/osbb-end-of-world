import { CHARACTERS } from './data';
import type { HeatEffects } from './modes';

// Local co-op: two people, one device. The first player drives the house; the
// second one is a neighbour on foot who shoots on their own, has a dash and the
// ability of their own head of ОСББ. Everything the build gives (damage, rate,
// armour, perks) is shared, as are health of the house, coins and experience.
// Nothing here touches the network: the game stays offline.
export const COOP = {
  // Partner health as a share of the house's.
  hp: 0.6,
  // Partner gun: weaker than the cannon, in line with the house's range.
  damage: 0.7,
  range: 0.9,
  fireGap: 0.95,
  // The partner is a bit quicker than the heavy house, but not by much.
  speed: 1.08,
  regen: 0.5,
  // Two sets of guns need a bigger yard: heat for enemies only, so that the
  // ladder and the records of solo play are not touched.
  enemyHealth: 1.5,
  spawnRate: 1.3,
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
  hitRadius: 20,
  // Leaders have this much more time to fall: they are 50% tougher, and the
  // clock of a fight is made for one set of guns.
  leaderTime: 1.1,
  // Two guns kill a third more enemies, so coins and crystals from the floor
  // count at this share: the economy and the levels keep the pace of solo play.
  loot: 0.8,
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
