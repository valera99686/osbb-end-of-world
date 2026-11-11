// The vocabulary of a fight, shared by the simulation (engine.ts, class Battle)
// and its drawing (battle-view.ts): the shapes of enemies, bullets, particles
// and the HUD, the tuning constants of a fight and small drawing helpers. It
// holds no fight of its own: nothing here changes while a battle runs.
import type { AffixId, BattleEventId } from './modes';
import type { BossPattern } from './bosses';
import { ENEMY_DEFS, type EnemyBehavior } from './encounters';
import type { HostFeed, MirrorClient } from './mirror';
import type { Lockstep } from './net';
import { MINIBOSS_TYPE } from './minibosses';
import type { PerkId } from './upgrades';
import type { Run, Settings } from './model';

export const isLeader = (type: number) => type === 99 || type === MINIBOSS_TYPE;
// Event courier: not in ENEMY_DEFS, never attacks, drawn by the engine.
export const COURIER = -1;
export const clock = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();
export const FONT = '"Segoe UI", Roboto, system-ui, sans-serif';
// Screen pixels of camera offset at full trauma (before settings.shake).
export const SHAKE_MAX = 16;
export const LOW_HP = 0.25;
export const PAD_DEAD = 0.2;
export const PARTICLE_CAP = 500;
export const NUMBER_CAP = 40;
export const INTRO = 1.4;
// ?hitboxes in the address draws the hitboxes over the fight (drawHitboxes).
export const SHOW_HITBOXES =
  typeof location !== 'undefined' && /[?&]hitboxes\b/.test(location.search);
// How long the presentation of a boss or mini-boss lasts (seconds). With a
// canvas the fight is frozen meanwhile; a tap or key skips it.
export const STAGE_SECONDS = { boss: 4.6, miniboss: 3.6 } as const;
// How much tougher than their sheet the leaders of a location are, per chapter:
// the first boss fell too fast to be remembered, the last was already hard.
export const LEADER_TOUGHNESS = {
  boss: [3.75, 3.1, 2.5],
  miniboss: [3.25, 2.9, 2.5],
} as const;
// How long a leader fight lasts before it is lost on time. The leaders have
// two or three times the health they had, so the clock is two and a half times
// as long: a build that did 50 damage a second still kills the first boss.
export const LEADER_SECONDS = { boss: 480, miniboss: 330 } as const;
export const MUZZLE = 0.07;
// Roof turret height above the house's feet line (world px).
export const TURRET_Y = -66;
export const OUTRO = { leader: 1.3, lose: 1.1, win: 0.5 };
// Seconds without a kill before the streak resets.
export const COMBO_WINDOW = 2.5;
export const MEDIC_RANGE = 150;
// Share of an ally's max health healed per second inside a medic aura.
export const MEDIC_HEAL = 0.03;
export const MAGNET_RANGE = 170;
// Sideways pull on player bullets, px/s², at any distance inside the field.
export const MAGNET_PULL = 650;
export const COURIER_TIME = 12;
export const OVERLOAD_TIME = 10;
// Squad fights (regular and elite): seconds between the packs of a wave,
// the breather once a wave is mostly down, and how long a wave may linger
// before the next one comes anyway.
export const PACK_GAP = 1.4;
export const BREATHER = 3;
export const ELITE_BREATHER = 1;
export const BREATHER_SPREAD = 2;
export const WAVE_MAX = 13;
// Share of the squad (leader included) that must fall; stragglers flee.
export const SQUAD_QUOTA = 0.9;
// When a fight ends, coins dropped in the last FRESH_COINS seconds bank in
// full; older ones left on the floor bank at LOOSE_COINS of their value.
export const FRESH_COINS = 2;
export const LOOSE_COINS = 0.5;
// XP crystals fly to the house on their own after this delay.
export const XP_HOMING = 0.25;
// Ranged enemies follow the house with their aim through the windup and
// freeze it for the last AIM_LOCK seconds, so a late sidestep still works.
export const AIM_LOCK = 0.2;
// Farthest a predicted aim point runs ahead of the house, px.
export const LEAD_MAX = 200;
// Warning of small ground zones (mines, roots, acid) after the windup.
export const ZONE_ARM = 0.5;
// Shield bearers turn to face the house at this rate, rad/s.
export const SHIELD_TURN = 1.5;
// Aim tracks the house through the windup for these behaviours...
export const TRACKING: readonly EnemyBehavior[] = [
  'charge',
  'fan',
  'roots',
  'spit',
  'snipe',
  'mine',
  'weld',
  'strafe',
  'volley',
  'cross',
];
// ...and every other enemy of these aims where the house is heading.
export const LEADING: readonly EnemyBehavior[] = [
  'charge',
  'fan',
  'roots',
  'spit',
  'snipe',
  'mine',
  'weld',
  'strafe',
  'volley',
  'cross',
];
// Seconds between the release and the hit of attacks that leave a strip.
export const WELD_ARM = 0.55;
// Ground zones marked at the aim point during the windup, by radius.
export const ZONE_MARK: Partial<Record<EnemyBehavior, number>> = {
  mine: 38,
  roots: 55,
  spit: 42,
};
// Crystals needed for the next level.
export const xpNeed = (level: number) => 8 + 4 * level;
// Crystals one kill is worth: plain chasers 1, anything with a weapon or a
// trick 2, big bodies 3, 'Посилений' +2, a squad leader 5. The first level
// lands in the second wave of the first fight (~15 s).
export function xpValue(e: Enemy) {
  if (e.chief) return 5;
  const def = ENEMY_DEFS[e.type];
  const base = e.r > 20 ? 3 : !def || def.behavior === 'chase' ? 1 : 2;
  return base + (e.affix ? 2 : 0);
}
export const EVENT_COLOR: Record<BattleEventId, string> = {
  alarm: '#ff6b5a',
  courier: '#f5c65a',
  overload: '#7fd4ff',
};
// Explosive prop damage to enemies by location, plus 3x the house damage.
export const BLAST_DAMAGE = [40, 85, 140];
export const PALETTE = {
  normal: {
    enemy: '#f38c7d',
    player: '#a9d8d0',
    crit: '#ffe3a2',
    over: '#ffd166',
  },
  // High contrast for protanopia/deuteranopia: violet vs cyan/white (kept apart under protanopia and deuteranopia, see docs/qa/accessibility.md).
  colorblind: {
    enemy: '#a55aff',
    player: '#5fe0ff',
    crit: '#ffffff',
    over: '#fff1a6',
  },
};
export interface Enemy {
  // Perk statuses: burning (spores, fire trail) and slowed (cold shower).
  burn?: number;
  burnDps?: number;
  slow?: number;
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
  walk: number;
  facing: number;
  aim: number;
  attack: number;
  visualSeed: number;
  pattern: number;
  windup?: number;
  lockedAim?: number;
  targetX?: number;
  targetY?: number;
  chargeLeft?: number;
  pendingBoss?: BossPattern;
  // Knockback velocity, decays over ~0.3 s (see Battle.knock).
  knockX?: number;
  knockY?: number;
  // Elite affix ('Посилений' in the UI), rolled on spawn; see modes.ts.
  affix?: AffixId;
  // Draw scale; splitter halves are smaller and never split again.
  scale?: number;
  split?: boolean;
  // Swift afterimage: recent positions as x, y pairs, newest first.
  trail?: number[];
  trailAt?: number;
  // Member of an alarm-event wave.
  wave?: boolean;
  // Squad member: index of its wave (see Battle.plan).
  squad?: number;
  // The squad leader of the final wave: bigger, tougher, marked on the floor.
  chief?: boolean;
  // Aims where the house is heading instead of where it is.
  leads?: boolean;
  // Position after the last solid-prop check (see Battle.collideSolids).
  lx?: number;
  ly?: number;
  // Last stragglers of a squad close in instead of holding their range.
  rush?: boolean;
  // Leaders: simulation second when a heavy slam lands, then the seconds
  // left of the stagger that follows it.
  staggerAt?: number;
  stagger?: number;
}
export interface SpawnOptions {
  // undefined rolls the usual affix chance; null forces a plain enemy.
  affix?: AffixId | null;
  // Ignores the living-enemy cap (event waves, splitter halves).
  force?: boolean;
  x?: number;
  y?: number;
}
export interface BattleEvent {
  id: BattleEventId;
  // Simulation second when it starts: 35-50% into the battle.
  at: number;
  // ...or earlier, once this many squad members are down (same share).
  kills: number;
  state: 'wait' | 'live' | 'won' | 'lost';
  // Seconds left for the courier or the overload window.
  left: number;
  wave: Enemy[];
  courier: Enemy | null;
  // Overload: seconds to the next discharge.
  zap: number;
}
export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  enemy: boolean;
  crit: boolean;
  // Seconds in flight; fresh shots get no trail behind the muzzle.
  age?: number;
  // Fired during an overload event; drawn with the overload tint.
  over?: boolean;
  // Perks: enemies it may still pass through / bounce to, steering, and
  // the enemies already hit so a pierce never hits the same one twice.
  pierce?: number;
  bounce?: number;
  homing?: boolean;
  hitSet?: Enemy[];
  // Fired by the second house: its modules (explosion, chain) count.
  mate?: true;
  shard?: boolean;
  // Weapon-core projectile look and on-hit extras.
  kind?: 'pellet' | 'rail' | 'coin' | 'flame' | 'rocket';
  // Rocket: radius of the blast where it lands.
  blast?: number;
}
// A mortar shell in flight: lands at (tx, ty) after T seconds.
export interface Shell {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  T: number;
  damage: number;
  crit: boolean;
  radius: number;
  cluster: boolean;
}
export interface Drop {
  x: number;
  y: number;
  kind: 'coin' | 'xp' | 'heal';
  value: number;
  // Seconds on the floor.
  t?: number;
}
// Steps of fade the particles are drawn in (one path per colour and step).
export const FADE_STEPS = 6;
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  text?: string;
  shape?: 'spark' | 'shard' | 'leaf' | 'spore' | 'pixel';
  rot?: number;
  spin?: number;
  drag?: number;
  gravity?: number;
}
export interface Ring {
  x: number;
  y: number;
  radius: number;
  life: number;
  max: number;
  color: string;
  width: number;
}
export interface DamageNumber {
  x: number;
  y: number;
  // Sideways jitter so consecutive numbers on one target do not overlap.
  dx: number;
  vy: number;
  value: number;
  crit: boolean;
  life: number;
  max: number;
  // While open, further hits on the same target add up into this number.
  open: number;
  target: Enemy | null;
}
export interface Banner {
  title: string;
  text: string;
  color: string;
  life: number;
  max: number;
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
  bossAttack: string;
  bossPhase: number;
  // Squad fights only (the canvas draws them too): current wave (1-based,
  // 0 before the first), wave count, kills still needed, squad name.
  wave?: number;
  waves?: number;
  left?: number;
  squad?: string;
  // A perk draft is open (the fight waits); in co-op each house has its own:
  // the first one's offers and the second one's (null when taken).
  drafting?: boolean;
  hostDraft?: PerkId[] | null;
  mateDraft?: PerkId[] | null;
  // Co-op only: the second player's health, revive progress and cooldowns.
  ally?: {
    hp: number;
    max: number;
    down: boolean;
    revive: number;
    dash: number;
    pulse: number;
  };
}
// The second player of a co-op fight (coop.ts): a neighbour on foot who has the
// house's build, but their own body, dash and ability.
export interface Ally {
  hero: string;
  x: number;
  y: number;
  // Smoothed velocity, px/s, for enemies that aim ahead and for the walk cycle.
  vx: number;
  vy: number;
  hp: number;
  max: number;
  // Knocked out: the house has to stand close to get them up (revive 0..1).
  down: boolean;
  downTime: number;
  revive: number;
  dashCd: number;
  pulseCd: number;
  dashing: number;
  invincible: number;
  hasteTime: number;
  facing: { x: number; y: number };
  shotTimer: number;
  muzzle: number;
  aim: number;
  walk: number;
  // Perks of the second house (its own draft): the blows its blanket still
  // stops, the second wind used, the dash that a kill gives back, the discharge
  // at the end of a dash, the volleys counted for the rhythm.
  shields?: number;
  secondWind?: boolean;
  dashKill?: number;
  shockAt?: number;
  volleys?: number;
  trailGap?: number;
}
export type BattleResult = { run: Run; won: boolean; boss: boolean };
// How the last battle ended; tests and the balance audit read it.
export type EndReason = 'cleared' | 'overtime' | 'leader' | 'timeout' | 'lost';
// A boss or miniboss by its place in the catalogue (campaignBoss /
// minibossFor take the same location and variant).
export interface LeaderRef {
  kind: 'boss' | 'miniboss';
  location: number;
  variant: number;
}
// Beats of a fight in simulation order, for barks and UI cues; the engine
// itself only shows its banners. Squads are EncounterTemplate ids.
export type CombatBeat =
  // A wave is sent: wave 1 opens the fight, wave === waves is the final
  // one with the squad leader.
  | { kind: 'wave'; squad: string; wave: number; waves: number }
  // The squad leader is down.
  | { kind: 'chief'; squad: string }
  // The squad fight is over: broken, or sent home by the overtime clock.
  | { kind: 'broken'; squad: string; overtime: boolean }
  // A mid-battle event starts (modes.ts BATTLE_EVENTS).
  | { kind: 'event'; event: BattleEventId }
  // A leader crosses half health and switches to its phase-two moves.
  | { kind: 'phase'; leader: LeaderRef }
  // A leader's heavy slam landed; it takes +50% damage for STAGGER_TIME.
  | { kind: 'stagger'; leader: LeaderRef };
export interface BattleOptions {
  settings?: Settings;
  // Gamepad Start; the UI owns the pause menu and toggles Battle.paused.
  onPause?: () => void;
  // Called during update() right after the house reaches `level` (already
  // applied: +10 hp). The UI may pause the battle here to offer a choice.
  // XP banked when a fight ends (loose crystals, a leader kill) levels up
  // in the first frame of the next fight, so the call comes there.
  onLevelUp?: (level: number) => void;
  // Story and UI hook: see CombatBeat. Called synchronously from update().
  onBeat?: (beat: CombatBeat) => void;
  // Level-up perk draft: the battle holds still until choosePerk(id) (and, in
  // co-op, chooseMatePerk(id) for the second house, from its own offers). With
  // no handler the level-up keeps the old +10 hp only, unless autoPerks
  // (balance bots) takes the first offers at once.
  onPerkDraft?: (
    offers: PerkId[],
    level: number,
    mateOffers: PerkId[] | null,
  ) => void;
  autoPerks?: boolean;
  // The boss's line under its name on the intro card (story.ts bossQuote).
  introQuote?: string;
  // Online co-op (net.ts): both devices run this fight in lockstep and the
  // simulation takes its inputs from there instead of the keys and sticks.
  sync?: Lockstep;
  // A perk was taken (0 the first house, 1 the second): that draft is over.
  onPerkTaken?: (who: 0 | 1) => void;
  // Online, the other way (mirror.ts): the host streams its fight to a guest
  // who drives the partner, or the guest only draws what the host streams.
  feed?: HostFeed;
  client?: MirrorClient;
}
// Off-screen culling test for one frame; `margin` is how far the drawing
// reaches from (x, y), 60 world px unless given.
export type Visible = (x: number, y: number, margin?: number) => boolean;

export function rgba(hex: string, alpha: number) {
  let h = hex.replace('#', '');
  if (h.length < 6) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
// One soft glow per colour and size, drawn once and reused with drawImage;
// shadowBlur on every bullet and drop was the costliest part of a frame.
export const glows = new Map<string, HTMLCanvasElement | null>();
export function glow(color: string, radius: number) {
  const key = color + radius;
  const cached = glows.get(key);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') return null;
  let sprite: HTMLCanvasElement | null = document.createElement('canvas');
  sprite.width = sprite.height = radius * 2;
  const g = sprite.getContext('2d');
  if (g) {
    const fill = g.createRadialGradient(
      radius,
      radius,
      0,
      radius,
      radius,
      radius,
    );
    fill.addColorStop(0, rgba(color, 0.8));
    fill.addColorStop(0.35, rgba(color, 0.32));
    fill.addColorStop(1, rgba(color, 0));
    g.fillStyle = fill;
    g.fillRect(0, 0, radius * 2, radius * 2);
  } else sprite = null;
  glows.set(key, sprite);
  return sprite;
}
export function edgeLayer(
  w: number,
  h: number,
  inner: number,
  stops: [number, string][],
) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (g) {
    const fill = g.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * inner,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.68,
    );
    for (const [at, color] of stops) fill.addColorStop(at, color);
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
  }
  return canvas;
}
