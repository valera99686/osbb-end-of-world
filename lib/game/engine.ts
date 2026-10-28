import { asset } from './assets';
import {
  AUDIT,
  BLOOM,
  DISCHARGE,
  EXPRESS,
  JAM,
  QUAKE,
  SCALD,
  VOLLEY,
  WARD,
  chainTargets,
  heroAbility,
} from './heroes';
import {
  COOP,
  P1_KEYS,
  P2_KEYS,
  SOLO_KEYS,
  allyHealth,
  coopHeat,
  keyVector,
  reviveStep,
  spreadFix,
} from './coop';
import type { Lockstep } from './net';
import type { HostFeed, MirrorClient } from './mirror';
import { specialEffects } from './specials';
import {
  LOCATIONS,
  ENEMY_DEFS,
  RANGED_BEHAVIORS,
  campaignBoss,
  campaignBossPattern,
  encounterFor,
  encounterWaves,
  type CampaignEnemyDefinition,
  type EncounterTemplate,
  type EnemyBehavior,
} from './encounters';
import {
  COLORBLIND_HAZARD,
  STAGGER_DAMAGE,
  STAGGER_TIME,
  type BossPattern,
} from './bosses';
import { activeEquipment, equipmentTargets } from './equipment';
import { ITEM_BY_ID, FAMILY } from './data';
import {
  seeded,
  statsFor,
  minibossVariant,
  DEFAULT_SETTINGS,
  type Run,
  type Meta,
  type Stats,
  type Settings,
} from './model';
import type { AudioEngine } from './audio';
import {
  affixLook,
  drawEnemy,
  drawEnemyGhost,
  enemyReach,
  preloadEnemyArt,
  type AffixLook,
} from './enemy-art';
import { hazardContains, drawHazard, type Hazard } from './bosses';
import { perkOffers, type PerkId } from './upgrades';
import { EVOLUTION_BY_ID, WEAPONS } from './weapons';
import { RESIDENT_BY_ID } from './residents';
import {
  MINIBOSS_TYPE,
  hasMinibossPortrait,
  leaderHint,
  minibossFor,
  minibossPattern,
} from './minibosses';
import {
  AFFIX_BY_ID,
  BATTLE_EVENTS,
  ELITE_AFFIXES,
  COMBO_CAP,
  comboMultiplier,
  heatForRun,
  rollAffix,
  rollBattleEvent,
  type AffixId,
  type BattleEventId,
  type HeatEffects,
} from './modes';
import {
  ArenaAmbient,
  BLAST_RADIUS,
  PROP_CHARGE,
  drawArenaFloor,
  drawArenaLight,
  drawProps,
  generateProps,
  preloadArenaArt,
  propTarget,
  solidCircle,
  type ArenaProp,
  type ArenaView,
} from './arena';
export { AudioEngine } from './audio';
const isLeader = (type: number) => type === 99 || type === MINIBOSS_TYPE;
// Event courier: not in ENEMY_DEFS, never attacks, drawn by the engine.
const COURIER = -1;
const clock = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();
const FONT = '"Segoe UI", Roboto, system-ui, sans-serif';
// Screen pixels of camera offset at full trauma (before settings.shake).
const SHAKE_MAX = 16;
const LOW_HP = 0.25;
const PAD_DEAD = 0.2;
const PARTICLE_CAP = 500;
const NUMBER_CAP = 40;
const INTRO = 1.4;
// How long the presentation of a boss or mini-boss lasts (seconds). With a
// canvas the fight is frozen meanwhile; a tap or key skips it.
export const STAGE_SECONDS = { boss: 3, miniboss: 2.6 } as const;
const MUZZLE = 0.07;
// Roof turret height above the house's feet line (world px).
const TURRET_Y = -66;
const OUTRO = { leader: 1.3, lose: 1.1, win: 0.5 };
// Seconds without a kill before the streak resets.
export const COMBO_WINDOW = 2.5;
const MEDIC_RANGE = 150;
// Share of an ally's max health healed per second inside a medic aura.
const MEDIC_HEAL = 0.03;
const MAGNET_RANGE = 170;
// Sideways pull on player bullets, px/s², at any distance inside the field.
const MAGNET_PULL = 650;
const COURIER_TIME = 12;
const OVERLOAD_TIME = 10;
// Squad fights (regular and elite): seconds between the packs of a wave,
// the breather once a wave is mostly down, and how long a wave may linger
// before the next one comes anyway.
const PACK_GAP = 1.4;
const BREATHER = 3;
const ELITE_BREATHER = 1;
const BREATHER_SPREAD = 2;
const WAVE_MAX = 13;
// Share of the squad (leader included) that must fall; stragglers flee.
const SQUAD_QUOTA = 0.9;
// When a fight ends, coins dropped in the last FRESH_COINS seconds bank in
// full; older ones left on the floor bank at LOOSE_COINS of their value.
const FRESH_COINS = 2;
const LOOSE_COINS = 0.5;
// XP crystals fly to the house on their own after this delay.
const XP_HOMING = 0.25;
// Ranged enemies follow the house with their aim through the windup and
// freeze it for the last AIM_LOCK seconds, so a late sidestep still works.
const AIM_LOCK = 0.2;
// Farthest a predicted aim point runs ahead of the house, px.
const LEAD_MAX = 200;
// Warning of small ground zones (mines, roots, acid) after the windup.
const ZONE_ARM = 0.5;
// Shield bearers turn to face the house at this rate, rad/s.
const SHIELD_TURN = 1.5;
// Aim tracks the house through the windup for these behaviours...
const TRACKING: readonly EnemyBehavior[] = [
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
const LEADING: readonly EnemyBehavior[] = [
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
const WELD_ARM = 0.55;
// Ground zones marked at the aim point during the windup, by radius.
const ZONE_MARK: Partial<Record<EnemyBehavior, number>> = {
  mine: 38,
  roots: 55,
  spit: 42,
};
// Crystals needed for the next level.
export const xpNeed = (level: number) => 8 + 4 * level;
// Crystals one kill is worth: plain chasers 1, anything with a weapon or a
// trick 2, big bodies 3, 'Посилений' +2, a squad leader 5. The first level
// lands in the second wave of the first fight (~15 s).
function xpValue(e: Enemy) {
  if (e.chief) return 5;
  const def = ENEMY_DEFS[e.type];
  const base = e.r > 20 ? 3 : !def || def.behavior === 'chase' ? 1 : 2;
  return base + (e.affix ? 2 : 0);
}
const EVENT_COLOR: Record<BattleEventId, string> = {
  alarm: '#ff6b5a',
  courier: '#f5c65a',
  overload: '#7fd4ff',
};
// Explosive prop damage to enemies by location, plus 3x the house damage.
const BLAST_DAMAGE = [40, 85, 140];
const PALETTE = {
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
interface BattleEvent {
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
interface Bullet {
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
  shard?: boolean;
  // Weapon-core projectile look and on-hit extras.
  kind?: 'pellet' | 'rail' | 'coin' | 'flame' | 'rocket';
  // Rocket: radius of the blast where it lands.
  blast?: number;
}
// A mortar shell in flight: lands at (tx, ty) after T seconds.
interface Shell {
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
interface Drop {
  x: number;
  y: number;
  kind: 'coin' | 'xp' | 'heal';
  value: number;
  // Seconds on the floor.
  t?: number;
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
  shape?: 'spark' | 'shard' | 'leaf' | 'spore' | 'pixel';
  rot?: number;
  spin?: number;
  drag?: number;
  gravity?: number;
}
interface Ring {
  x: number;
  y: number;
  radius: number;
  life: number;
  max: number;
  color: string;
  width: number;
}
interface DamageNumber {
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
interface Banner {
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
  // Online: the host is choosing a perk (the guest only waits).
  drafting?: boolean;
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
  // Level-up perk draft: the battle holds still until choosePerk(id). With
  // no handler the level-up keeps the old +10 hp only, unless autoPerks
  // (balance bots) takes the first offer at once.
  onPerkDraft?: (offers: PerkId[], level: number) => void;
  autoPerks?: boolean;
  // The boss's line under its name on the intro card (story.ts bossQuote).
  introQuote?: string;
  // Online co-op (net.ts): both devices run this fight in lockstep and the
  // simulation takes its inputs from there instead of the keys and sticks.
  sync?: Lockstep;
  // The host's perk choice reached this end; the draft on screen is over.
  onPerkTaken?: () => void;
  // Online, the other way (mirror.ts): the host streams its fight to a guest
  // who drives the partner, or the guest only draws what the host streams.
  feed?: HostFeed;
  client?: MirrorClient;
}
// Off-screen culling test for one frame; `margin` is how far the drawing
// reaches from (x, y), 60 world px unless given.
type Visible = (x: number, y: number, margin?: number) => boolean;

function rgba(hex: string, alpha: number) {
  let h = hex.replace('#', '');
  if (h.length < 6) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
// One soft glow per colour and size, drawn once and reused with drawImage;
// shadowBlur on every bullet and drop was the costliest part of a frame.
const glows = new Map<string, HTMLCanvasElement | null>();
function glow(color: string, radius: number) {
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
function edgeLayer(
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

export class Battle {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  run: Run;
  stats: Stats;
  audio: AudioEngine;
  settings: Settings;
  onPause?: () => void;
  onLevelUp?: (level: number) => void;
  onBeat?: (beat: CombatBeat) => void;
  x = 800;
  y = 500;
  // Smoothed house velocity, px/s, for enemies that aim ahead of it.
  vx = 0;
  vy = 0;
  keys = new Set<string>();
  stick = { x: 0, y: 0 };
  pad = { x: 0, y: 0 };
  padHeld: boolean[] = [];
  // Co-op: the second player (null when playing alone) and their own input.
  ally: Ally | null = null;
  stick2 = { x: 0, y: 0 };
  pad2 = { x: 0, y: 0 };
  pad2Held: boolean[] = [];
  pad2Primed = false;
  // How far the camera leans toward the partner: 0 on the house, 1 in the
  // middle between the two.
  allyFocus = 0;
  // Online co-op: the lockstep this fight runs in, and the UI hook.
  sync: Lockstep | null = null;
  // The partner is a guest on another device whose input comes by the feed.
  hostRemote = false;
  feed: HostFeed | null = null;
  // A fight that is only drawn from what the host sends (never simulated).
  client: MirrorClient | null = null;
  // Fractions of coins and crystals left by the co-op loot share.
  coinCarry = 0;
  xpCarry = 0;
  onPerkTaken?: () => void;
  // Button edges restart after start, a reconnect or unpausing: whatever
  // is down then (the A that picked the fight or pressed "resume") has to
  // be released before it acts in battle.
  padPrimed = false;
  padPaused = false;
  enemies: Enemy[] = [];
  defeated: (Enemy & { life: number })[] = [];
  spawnCount = 0;
  hazards: Hazard[] = [];
  bossAttack = '';
  bullets: Bullet[] = [];
  drops: Drop[] = [];
  particles: Particle[] = [];
  rings: Ring[] = [];
  numbers: DamageNumber[] = [];
  banners: Banner[] = [];
  elapsed = 0;
  duration: number;
  // Leaders hold their first attack while the intro card is up.
  calm = 0;
  spawnTimer = 0;
  shotTimer = 0;
  housingHealTimer = 12;
  housingStrainTimer = 10;
  housingDefenseTimer = 6;
  housingVolley = 0;
  specials: ReturnType<typeof specialEffects>;
  shieldCharges = 0;
  dashCharged = false;
  droneTimer = 0;
  hudTimer = 0;
  dashCd = 0;
  pulseCd = 0;
  invincible = 1;
  dashing = 0;
  facing = { x: 1, y: 0 };
  pulseRing = 0;
  // Борис: seconds left of the audit that raises coins from kills.
  auditTime = 0;
  // Данило: seconds left of the express speed-up.
  hasteTime = 0;
  battleKills = 0;
  lowHpTimer = 0;
  explosionCd = 0;
  pickupStreak = 0;
  pickupGap = 0;
  muzzle = 0;
  muzzleAngle = 0;
  // Heat (and the daily modifier) on enemy stats; heat 0 is all ones.
  heat: HeatEffects;
  // Kill streak: resets COMBO_WINDOW seconds after the last kill.
  combo = 0;
  comboTimer = 0;
  // Fractional bonus coins carried between drops, so the multiplier holds
  // on average without spending combat rolls on rounding.
  comboCarry = 0;
  comboPop = 0;
  event: BattleEvent | null = null;
  props: ArenaProp[];
  explosives: ArenaProp[];
  // Footprints of the solid props: the house and walking enemies slide round them.
  solids: { x: number; y: number; r: number }[];
  ambient: ArenaAmbient | null = null;
  // Camera of the last drawn frame, for ambience and edge markers.
  view: ArenaView & { zoom: number } = { x: 800, y: 500, w: 1, h: 1, zoom: 1 };
  // Real-time feel, advanced by tick() only: update(dt) never reads these,
  // so headless simulations stay deterministic.
  running = false;
  hitStop = 0;
  freezeCd = 0;
  slowMo = 0;
  slowMoLength = 0;
  slowMoScale = 1;
  trauma = 0;
  hurtFlash = 0;
  flash = 0;
  fxClock = 0;
  intro = 0;
  // Seconds the intro lasts, and whether the fight waits for it.
  introTotal = INTRO;
  holdIntro = false;
  introCard: {
    quote?: string;
    kicker: string;
    title: string;
    text: string;
    color: string;
    // The boss's portrait, shown on the card once it has loaded.
    portrait?: HTMLImageElement | null;
    // A tip on how the fight goes and the leader's health.
    hint?: string;
    hp?: number;
  } | null = null;
  outro = 0;
  pendingEnd: BattleResult | null = null;
  buzzFree = 0;
  edges: {
    w: number;
    h: number;
    dark: HTMLCanvasElement;
    red: HTMLCanvasElement;
  } | null = null;
  // Backs the `paused` accessor below.
  halted = false;
  // Perk draft on screen (the simulation waits) and levels still to draft.
  drafting: PerkId[] | null = null;
  pendingLevels = 0;
  onPerkDraft?: (offers: PerkId[], level: number) => void;
  autoPerks = false;
  introQuote = '';
  meta: Meta;
  volleys = 0;
  secondWind = false;
  dashKill = 0;
  shockAt = 0;
  trailGap = 0;
  trails: { x: number; y: number; life: number }[] = [];
  perkCache: Record<string, number> = {};
  shells: Shell[] = [];
  // Pre-rendered facade: rebuilt when the layout or crew changes.
  facade: { key: string; canvas: HTMLCanvasElement | null } | null = null;
  // Lightning polylines of the arc core, for a few frames.
  // Lines of lightning (arc cores, Іскра); `bold` ones glow.
  arcs: { pts: number[]; life: number; bold?: boolean }[] = [];
  ended = false;
  frame = 0;
  last = 0;
  bossSpawned = false;
  // Squad of a regular or elite fight; null in leader fights.
  encounter: EncounterTemplate | null = null;
  // Wave lists: three regular waves, then the final escort (+ the chief).
  plan: number[][] = [];
  // Index of the last wave sent, -1 before the first one.
  wave = -1;
  // Packs of the current wave still to come.
  pending: number[][] = [];
  // The current wave is out; the next one waits for it to thin out.
  waveWait = false;
  // Counting down a breather between waves (for the tracker).
  breather = false;
  squadTotal = 0;
  squadKills = 0;
  quota = 0;
  chief: Enemy | null = null;
  endReason: EndReason | null = null;
  // Fresh packs: an arrow on the screen edge while they are off screen.
  incoming: { x: number; y: number; life: number; color: string }[] = [];
  minibossVariant: number;
  rng: () => number;
  // Visual-only randomness; particles never shift the combat rolls.
  fx: () => number;
  onHud: (h: Hud) => void;
  onEnd: (r: BattleResult) => void;
  constructor(
    canvas: HTMLCanvasElement | null,
    run: Run,
    meta: Meta,
    audio: AudioEngine,
    onHud: (h: Hud) => void,
    onEnd: (r: BattleResult) => void,
    options: BattleOptions = {},
  ) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') ?? null;
    if (canvas) preloadEnemyArt(run.chapter);
    this.run = { ...run, items: [...run.items] };
    this.minibossVariant = minibossVariant(run);
    this.stats = statsFor(run, meta);
    this.specials = specialEffects(run);
    // Марта starts every fight with one shield.
    this.shieldCharges = this.specials.shields + (run.character === 'marta' ? 1 : 0);
    this.audio = audio;
    this.settings = { ...DEFAULT_SETTINGS, ...options.settings };
    this.onPause = options.onPause;
    this.onLevelUp = options.onLevelUp;
    this.onBeat = options.onBeat;
    this.onPerkDraft = options.onPerkDraft;
    this.sync = options.sync ?? null;
    this.feed = options.feed ?? null;
    this.client = options.client ?? null;
    this.onPerkTaken = options.onPerkTaken;
    this.autoPerks = !!options.autoPerks;
    this.introQuote = options.introQuote ?? '';
    this.meta = meta;
    this.refreshPerks();
    this.shieldCharges += this.pk('blanket');
    if (this.stats.evolution) {
      const evo = EVOLUTION_BY_ID[this.stats.evolution];
      this.banner('ЕВОЛЮЦІЯ: ' + evo.name, evo.text, '#f0c060', 2.2);
    }
    this.onHud = onHud;
    this.onEnd = onEnd;
    this.rng = seeded(run.seed + run.chapter * 100003 + run.step * 719);
    this.fx = seeded(run.seed * 31 + run.chapter * 7919 + run.step * 131 + 17);
    // Squad fights end when the squad breaks; the clock is only an overtime
    // that sends the rest home. Leaders must be killed before it runs out.
    this.duration =
      run.kind === 'boss'
        ? 210
        : run.kind === 'miniboss'
          ? 150
          : 55 +
            run.chapter * 8 +
            run.step * 0.8 +
            (run.kind === 'elite' ? 10 : 0);
    this.run.hp = Math.min(this.run.hp, this.stats.health);
    this.run.battleDamage = 0;
    this.heat = heatForRun(run);
    if (run.coop && (run.kind === 'boss' || run.kind === 'miniboss'))
      this.duration *= COOP.leaderTime;
    if (run.coop) {
      this.heat = coopHeat(this.heat);
      this.ally = this.makeAlly(run.coop);
    }
    if (run.kind !== 'boss' && run.kind !== 'miniboss') {
      const column = run.path?.[run.step] ?? 0;
      this.encounter = encounterFor(run, `${run.step}:${column}`);
      this.plan = encounterWaves(
        this.encounter,
        run.step,
        run.kind === 'elite',
        this.heat.spawnRate,
      );
      this.squadTotal = this.plan.reduce((n, w) => n + w.length, 1);
      this.quota = Math.ceil(this.squadTotal * SQUAD_QUOTA);
      // The first pack shows up almost at once.
      this.spawnTimer = 0.35;
    }
    this.props = generateProps(
      run.seed + run.chapter * 100003 + run.step * 719,
      run.chapter,
    );
    this.explosives = this.props.filter((p) => p.explosive);
    this.solids = this.props.filter((p) => p.solid).map(solidCircle);
    if (canvas) {
      preloadArenaArt(run.chapter);
      this.ambient = new ArenaAmbient(run.chapter, run.seed + run.step);
    }
    const eventId = rollBattleEvent(this.rng, this.run);
    const share = eventId ? 0.35 + this.rng() * 0.15 : 0;
    if (eventId)
      this.event = {
        id: eventId,
        at: this.duration * share,
        kills: Math.max(1, Math.ceil(this.quota * share)),
        state: 'wait',
        left: 0,
        wave: [],
        courier: null,
        zap: 0,
      };
    if (run.kind === 'boss' || run.kind === 'miniboss') {
      const lead = this.leaderStyle(run.kind === 'boss' ? 99 : MINIBOSS_TYPE),
        def =
          run.kind === 'boss'
            ? campaignBoss(run.chapter, run.bossVariants[run.chapter])
            : minibossFor(run.chapter, this.minibossVariant),
        place = LOCATIONS[Math.min(2, run.chapter)]?.name ?? '',
        loop = run.loop ?? 0;
      this.introCard = {
        kicker: run.kind === 'boss' ? 'БОС ЛОКАЦІЇ' : 'МІНІБОС',
        title: lead.name,
        text: loop > 0 ? `${place} · коло ${loop + 1}` : place,
        color: lead.color,
        quote: this.introQuote || undefined,
        hint: leaderHint(def.guide),
        hp: def.health,
        // null reserves the room while the picture loads.
        portrait: undefined,
      };
      // Every boss has a portrait; a mini-boss has one once its id is listed
      // in MINIBOSS_PORTRAITS, otherwise the card keeps its own sprite.
      const file =
        run.kind === 'boss'
          ? `boss-${lead.id}`
          : hasMinibossPortrait(run.chapter, this.minibossVariant)
            ? `mini-${Math.min(2, run.chapter)}-${this.minibossVariant}`
            : '';
      if (file && typeof Image !== 'undefined') {
        this.introCard.portrait = null;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          if (this.introCard && img.naturalWidth) this.introCard.portrait = img;
        };
        // A missing file gives the room back instead of leaving a gap.
        img.onerror = () => {
          if (this.introCard) this.introCard.portrait = undefined;
        };
        img.src = asset(`art/${file}.webp`);
      }
      this.holdIntro = !!canvas;
      this.introTotal = canvas
        ? STAGE_SECONDS[run.kind === 'boss' ? 'boss' : 'miniboss']
        : INTRO;
      this.intro = this.introTotal;
      this.calm = 1;
    }
  }
  // Set by the UI; music ducking is the UI's call (AudioEngine.setPaused).
  // A decided battle never waits behind the pause menu: pausing during the
  // outro (keys, back, blur, Start) hands over the result at once, so
  // leaving from the menu or the OS killing the app cannot drop or undo it.
  get paused() {
    return this.halted;
  }
  set paused(value: boolean) {
    this.halted = value;
    if (value) this.flushEnd();
  }
  // Delivers a pending result now, skipping the rest of the outro.
  flushEnd() {
    const result = this.pendingEnd;
    if (!result) return;
    this.pendingEnd = null;
    this.onEnd(result);
  }
  refreshPerks() {
    this.perkCache = {};
    for (const id of this.run.perks ?? [])
      this.perkCache[id] = (this.perkCache[id] ?? 0) + 1;
  }
  pk(id: PerkId) {
    return this.perkCache[id] ?? 0;
  }
  // Offers the next queued level-up draft, if none is on screen.
  openDraft() {
    if (this.drafting || this.pendingLevels <= 0 || this.ended) return;
    if (!this.onPerkDraft && !this.autoPerks) {
      this.pendingLevels = 0;
      return;
    }
    const r = this.run;
    const offers = perkOffers(
      r,
      r.seed * 7 +
        r.level * 977 +
        r.chapter * 131 +
        r.step * 17 +
        (r.perks?.length ?? 0) * 3,
    );
    if (!offers.length) {
      this.pendingLevels = 0;
      return;
    }
    if (this.onPerkDraft) {
      this.drafting = offers;
      this.keys.clear();
      this.onPerkDraft(offers, r.level);
    } else this.choosePerk(offers[0]);
  }
  // Takes one offered perk, rebuilds the stats and resumes the fight.
  choosePerk(id: PerkId) {
    if (this.drafting && !this.drafting.includes(id)) return;
    this.drafting = null;
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    this.run.perks = [...(this.run.perks ?? []), id];
    this.onPerkTaken?.();
    this.refreshPerks();
    const before = this.stats.health;
    this.stats = statsFor(this.run, this.meta);
    this.run.hp = Math.min(
      this.stats.health,
      this.run.hp + Math.max(0, this.stats.health - before),
    );
    if (id === 'tea')
      this.run.hp = Math.min(this.stats.health, this.run.hp + 25);
    if (id === 'blanket') this.shieldCharges++;
    this.ring(this.x, this.y - 14, 150, '#ffd98a', 0.45, 4);
    this.burst(this.x, this.y, '#ffd98a', 24);
    this.freeze(0.05);
    this.openDraft();
  }
  setSettings(settings: Settings) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    if (!this.settings.damageNumbers) this.numbers = [];
    if (
      !this.settings.vibration &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    )
      try {
        navigator.vibrate(0);
      } catch {}
  }
  start() {
    if (this.feed) {
      this.feed.battle = this;
      this.feed.attach(this);
    }
    if (this.client) this.client.battle = this;
    this.running = true;
    this.last = clock();
    if (this.intro > 0) this.audio.play('bossIntro');
    const loop = (t: number) => {
      const real = Math.max(0, Math.min(0.1, (t - this.last) / 1000));
      this.last = t;
      this.pollGamepad();
      if (!this.paused) this.tick(real);
      this.draw();
      if (this.running && (!this.ended || this.pendingEnd))
        this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    if (typeof cancelAnimationFrame !== 'undefined')
      cancelAnimationFrame(this.frame);
    this.keys.clear();
    this.stick = { x: 0, y: 0 };
    this.pad = { x: 0, y: 0 };
    this.padHeld = [];
    this.padPrimed = false;
  }
  // One animation frame of real time: overlays, hit-stop and slow motion
  // wrap the fixed simulation step, then the outro before onEnd.
  tick(real: number) {
    this.fxClock += real;
    this.trauma = Math.max(0, this.trauma - real * 1.5);
    this.hurtFlash = Math.max(0, this.hurtFlash - real * 2.6);
    this.flash = Math.max(0, this.flash - real * 2.6);
    this.freezeCd = Math.max(0, this.freezeCd - real);
    this.intro = Math.max(0, this.intro - real);
    this.comboPop = Math.max(0, this.comboPop - real * 5);
    this.ambient?.update(real, this.view);
    for (const b of this.banners) b.life -= real;
    this.banners = this.banners.filter((b) => b.life > 0);
    // Online with a guest who only draws: the host streams its fight, and the
    // guest's copy only glides what the host last said (nothing is simulated).
    if (this.feed) this.feed.pump(this, real);
    if (this.client) {
      this.client.pump(this, real);
      this.updateFx(real);
      return;
    }
    // The presentation of a boss freezes the fight for a few seconds.
    if (this.presenting) return;
    if (this.drafting) return;
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - real);
      return;
    }
    const dt = Math.min(0.04, real) * this.timeScale();
    this.slowMo = Math.max(0, this.slowMo - real);
    if (!this.ended) {
      // Online the fixed steps come from the lockstep, in the same number at
      // both ends; slow motion is real-time and would tear them apart.
      if (this.sync) this.sync.pump(this, real);
      else this.update(dt);
    } else if (this.pendingEnd) {
      this.updateFx(dt);
      this.outro -= real;
      if (this.outro <= 0) this.flushEnd();
    }
  }
  timeScale() {
    if (this.slowMo <= 0 || this.slowMoLength <= 0) return 1;
    const p = 1 - this.slowMo / this.slowMoLength;
    return this.slowMoScale + (1 - this.slowMoScale) * p * p;
  }
  // Hit-stop; short freezes share a cooldown so crit streaks never stutter.
  freeze(seconds: number) {
    if (this.freezeCd > 0 && seconds < 0.08) return;
    this.hitStop = Math.max(this.hitStop, seconds);
    this.freezeCd = 0.28;
  }
  slow(seconds: number, scale: number) {
    if (this.slowMo > 0 && this.timeScale() < scale) return;
    this.slowMo = this.slowMoLength = seconds;
    this.slowMoScale = scale;
  }
  addTrauma(amount: number, cap = 1) {
    this.trauma = Math.max(this.trauma, Math.min(cap, 1, this.trauma + amount));
  }
  vibrate(pattern: number | number[]) {
    if (
      !this.settings.vibration ||
      typeof navigator === 'undefined' ||
      typeof navigator.vibrate !== 'function'
    )
      return;
    const t = clock();
    if (t < this.buzzFree) return;
    const length = Array.isArray(pattern)
      ? pattern.reduce((sum, part) => sum + part, 0)
      : pattern;
    this.buzzFree = t + Math.max(90, length);
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
  // One pad as a stick vector (with dead zone and D-pad) and the buttons down.
  readPad(pad: Gamepad) {
    const buttons = pad.buttons;
    const held = (i: number) =>
      !!buttons[i] && (buttons[i].pressed || buttons[i].value > 0.5);
    let x = pad.axes[0] ?? 0,
      y = pad.axes[1] ?? 0;
    const tilt = Math.hypot(x, y);
    // Radial dead zone, rescaled so speed starts from zero at its edge.
    if (tilt < PAD_DEAD) x = y = 0;
    else {
      const k = Math.min(1, (tilt - PAD_DEAD) / (1 - PAD_DEAD)) / tilt;
      x *= k;
      y *= k;
    }
    x += (held(15) ? 1 : 0) - (held(14) ? 1 : 0);
    y += (held(13) ? 1 : 0) - (held(12) ? 1 : 0);
    return {
      vec: {
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
      },
      now: buttons.map((_, i) => held(i)),
    };
  }
  // The first connected pad drives the house; in co-op the second one drives
  // the partner. A single pad always belongs to the first player.
  pollGamepad() {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.getGamepads !== 'function'
    )
      return;
    const pads: Gamepad[] = [];
    try {
      for (const p of navigator.getGamepads()) if (p?.connected) pads.push(p);
    } catch {
      return;
    }
    const resumed = this.padPaused && !this.paused;
    this.padPaused = this.paused;
    if (!pads[0]) {
      this.pad = { x: 0, y: 0 };
      this.padHeld = [];
      this.padPrimed = false;
    } else {
      const { vec, now } = this.readPad(pads[0]);
      this.pad = vec;
      if (!this.padPrimed || resumed) {
        this.padHeld = now;
        this.padPrimed = true;
      } else {
        const pressed = (...ids: number[]) =>
          ids.some((i) => now[i] && !this.padHeld[i]);
        const dash = pressed(0, 7),
          pulse = pressed(1, 5),
          start = pressed(9);
        this.padHeld = now;
        if (!((dash || pulse) && this.skipIntro())) {
          if (start) this.onPause?.();
          if (dash) this.localDash();
          if (pulse) this.localPulse();
        }
      }
    }
    if (!this.ally || !pads[1] || this.sync || this.hostRemote || this.client) {
      this.pad2 = { x: 0, y: 0 };
      this.pad2Held = [];
      this.pad2Primed = false;
      return;
    }
    const { vec, now } = this.readPad(pads[1]);
    this.pad2 = vec;
    if (!this.pad2Primed || resumed) {
      this.pad2Held = now;
      this.pad2Primed = true;
      return;
    }
    const pressed = (...ids: number[]) =>
      ids.some((i) => now[i] && !this.pad2Held[i]);
    const dash = pressed(0, 7),
      pulse = pressed(1, 5),
      start = pressed(9);
    this.pad2Held = now;
    if ((dash || pulse) && this.skipIntro()) return;
    if (start) this.onPause?.();
    if (dash) this.allyDash();
    if (pulse) this.allyPulse();
  }
  get presenting() {
    return this.holdIntro && this.intro > 0;
  }
  // Two players on this very device (not a partner on another one).
  get localDuo() {
    return !!this.ally && !this.sync && !this.hostRemote && !this.client;
  }
  // What a pickup is worth: whole with one player, COOP.loot of it with two,
  // the odd fractions carried over so nothing is lost on average.
  loot(value: number, kind: 'coin' | 'xp') {
    if (!this.ally) return value;
    const key = kind === 'coin' ? 'coinCarry' : 'xpCarry';
    const total = value * COOP.loot + this[key];
    const whole = Math.floor(total + 1e-9);
    this[key] = total - whole;
    return whole;
  }
  // The partner's device is gone: the fight goes on alone from here. It is no
  // longer shared with anyone, so nothing has to stay repeatable.
  dropPartner() {
    this.sync = null;
    this.feed = null;
    this.hostRemote = false;
    this.run.coop = '';
    this.ally = null;
    this.allyFocus = 0;
    this.stick2 = { x: 0, y: 0 };
  }
  // What the local player does with the keys, the stick and the pad.
  localAim() {
    const keys = keyVector(this.keys, SOLO_KEYS);
    return {
      x: this.stick.x + this.pad.x + keys.x,
      y: this.stick.y + this.pad.y + keys.y,
    };
  }
  // A press of the local player: in lockstep it travels with the next frame.
  localDash() {
    if (this.sync) this.sync.press('dash');
    else if (this.client) this.client.press('dash');
    else this.dash();
  }
  localPulse() {
    if (this.sync) this.sync.press('pulse');
    else if (this.client) this.client.press('pulse');
    else this.pulse();
  }
  // A short fingerprint of the fight for the two ends to compare.
  stateHash() {
    let h = 0x811c9dc5;
    const mix = (n: number) => {
      h = Math.imul(h ^ (Math.round(n * 100) | 0), 16777619);
    };
    mix(this.x);
    mix(this.y);
    mix(this.run.hp);
    mix(this.run.coins);
    mix(this.run.xp);
    mix(this.run.kills);
    mix(this.elapsed);
    mix(this.enemies.length);
    for (const e of this.enemies.slice(0, 40)) {
      mix(e.x);
      mix(e.y);
      mix(e.hp);
    }
    mix(this.bullets.length);
    mix(this.drops.length);
    if (this.ally) {
      mix(this.ally.x);
      mix(this.ally.y);
      mix(this.ally.hp);
    }
    return h >>> 0;
  }
  // A tap or key ends the presentation early (not in its first half second).
  // True while it is on, so the key press is not also a dash.
  skipIntro() {
    if (!this.presenting) return false;
    if (this.introTotal - this.intro >= 0.5)
      this.intro = Math.min(this.intro, 0.3);
    return true;
  }
  dash() {
    if (
      this.dashCd > 0 ||
      this.paused ||
      this.ended ||
      this.drafting ||
      this.presenting
    )
      return;
    this.dashCd = this.specials.dashCooldown;
    if (this.specials.dashShot) {
      this.dashCharged = true;
      this.label(this.x, this.y - 60, 'МАХОВИК ГОТОВИЙ', '#efbd68');
    }
    this.dashing = 0.22;
    this.invincible = 0.55;
    this.dashKill = 0.8;
    if (this.pk('shock_dash')) this.shockAt = 0.22;
    this.run.dashes++;
    this.audio.play('dash');
    this.burst(this.x, this.y, '#7cbef4', 15);
    this.ring(this.x, this.y - 14, 70, '#7cbef4', 0.25, 3);
    this.vibrate(12);
  }
  // The E key. Every head of ОСББ has their own ability (heroes.ts); they
  // share the cooldown, the sound, the shake and the healing room special.
  pulse() {
    if (
      this.pulseCd > 0 ||
      this.paused ||
      this.ended ||
      this.drafting ||
      this.presenting
    )
      return;
    this.pulseCd = 12 - 3 * this.pk('short_fuse');
    this.addTrauma(0.42);
    this.vibrate(25);
    const landed = this.castAbility(this.run.character);
    if (landed && this.specials.pulseHeal) {
      const healed = Math.min(
        this.specials.pulseHeal,
        this.stats.health - this.run.hp,
      );
      this.run.hp += healed;
      if (healed > 0)
        this.label(this.x, this.y - 65, '+' + Math.round(healed), '#8acdb6');
    }
  }
  // The sound and the effect of a hero's ability from the current position of
  // the house (the partner's casts borrow it, see allyPulse); true if it landed.
  castAbility(character: string) {
    const hero = heroAbility(character);
    this.audio.play('pulse', {
      pitch:
        (
          {
            discharge: 1.3,
            bloom: 0.85,
            audit: 1.1,
            scald: 0.95,
            volley: 1.2,
            ward: 0.8,
            express: 1.4,
            jam: 1.25,
          } as Record<string, number>
        )[hero.id] ?? 1,
    });
    const landed =
      hero.id === 'discharge'
        ? this.abilityDischarge()
        : hero.id === 'bloom'
          ? this.abilityBloom()
          : hero.id === 'audit'
            ? this.abilityAudit()
            : hero.id === 'scald'
              ? this.abilityScald()
              : hero.id === 'volley'
                ? this.abilityVolley()
                : hero.id === 'ward'
                  ? this.abilityWard()
                  : hero.id === 'express'
                    ? this.abilityExpress()
                    : hero.id === 'jam'
                      ? this.abilityJam()
                      : this.abilityQuake();
    // Healing flowers and the vaccine reach both players.
    const a = this.ally;
    if (a && !a.down && (hero.id === 'bloom' || hero.id === 'ward'))
      this.healAlly(a.max * (hero.id === 'bloom' ? BLOOM.heal : WARD.heal));
    return landed;
  }
  // ---- Co-op: the second player (coop.ts) ----
  makeAlly(hero: string): Ally {
    const max = allyHealth(this.stats.health);
    return {
      hero,
      x: this.x + 90,
      y: this.y + 40,
      vx: 0,
      vy: 0,
      hp: max,
      max,
      down: false,
      downTime: 0,
      revive: 0,
      dashCd: 0,
      pulseCd: 0,
      dashing: 0,
      invincible: 1,
      hasteTime: 0,
      facing: { x: 1, y: 0 },
      shotTimer: 0.4,
      muzzle: 0,
      aim: 0,
      walk: 0,
    };
  }
  // Who an enemy goes for: the house, unless the partner is clearly closer.
  goalOf(e: Enemy): { x: number; y: number; vx: number; vy: number } {
    const a = this.ally;
    if (!a || a.down) return this;
    const house = Math.hypot(this.x - e.x, this.y - e.y),
      near = Math.hypot(a.x - e.x, a.y - e.y);
    return near < house * 0.85 ? a : this;
  }
  healAlly(amount: number) {
    const a = this.ally;
    if (!a || a.down) return 0;
    const healed = Math.max(0, Math.min(amount, a.max - a.hp));
    a.hp += healed;
    if (healed >= 1)
      this.label(a.x, a.y - 55, '+' + Math.round(healed), '#8acdb6');
    return healed;
  }
  allyDash() {
    const a = this.ally;
    if (
      !a ||
      a.down ||
      a.dashCd > 0 ||
      this.paused ||
      this.ended ||
      this.drafting ||
      this.presenting
    )
      return;
    a.dashCd = this.specials.dashCooldown;
    a.dashing = 0.22;
    a.invincible = Math.max(a.invincible, 0.55);
    this.audio.play('dash', { volume: 0.7 });
    this.burst(a.x, a.y, '#f0c466', 12);
    this.ring(a.x, a.y - 8, 56, '#f0c466', 0.25, 3);
    this.vibrate(12);
  }
  // The partner's E: the ability of their own hero, cast from where they
  // stand. It is the house's code with the house moved for the moment; what
  // belongs to one body (the dash reset and the speed of Express) goes back.
  allyPulse() {
    const a = this.ally;
    if (
      !a ||
      a.down ||
      a.pulseCd > 0 ||
      this.paused ||
      this.ended ||
      this.drafting ||
      this.presenting
    )
      return;
    a.pulseCd = 12 - 3 * this.pk('short_fuse');
    this.addTrauma(0.42);
    this.vibrate(25);
    const hero = heroAbility(a.hero);
    const home = {
      x: this.x,
      y: this.y,
      dashCd: this.dashCd,
      haste: this.hasteTime,
      invincible: this.invincible,
      ring: this.pulseRing,
    };
    this.x = a.x;
    this.y = a.y;
    try {
      this.castAbility(a.hero);
    } finally {
      this.x = home.x;
      this.y = home.y;
      this.dashCd = home.dashCd;
      this.hasteTime = home.haste;
      this.invincible = home.invincible;
      if (hero.id === 'quake') {
        this.pulseRing = home.ring;
        this.ring(a.x, a.y, QUAKE.radius, hero.color, 0.45, 5);
      }
      if (hero.id === 'express') {
        a.dashCd = 0;
        a.hasteTime = EXPRESS.seconds;
        a.invincible = Math.max(a.invincible, EXPRESS.guard);
      }
    }
  }
  hurtAlly(amount: number, invincible: number, trauma: number) {
    const a = this.ally;
    if (!a || a.down) return 0;
    a.hp -= amount;
    a.invincible = invincible + (this.sync ? COOP.netGrace : 0);
    this.addTrauma(trauma * 0.6);
    this.audio.play('hit', { volume: 0.7 });
    this.label(a.x, a.y - 50, '−' + Math.round(amount), '#ff8e82');
    this.vibrate(14);
    if (a.hp <= 0) this.downAlly();
    return amount;
  }
  downAlly() {
    const a = this.ally;
    if (!a) return;
    a.hp = 0;
    a.down = true;
    a.downTime = 0;
    a.revive = 0;
    a.dashing = 0;
    this.burst(a.x, a.y, '#ff8e82', 22);
    this.ring(a.x, a.y, 90, '#ff8e82', 0.5, 4);
    this.freeze(0.08);
    this.banner(
      'НАПАРНИК ПАДАЄ',
      'Підійди будинком до нього, щоб підняти',
      '#ff8e82',
      1.8,
    );
  }
  reviveAlly(helped: boolean) {
    const a = this.ally;
    if (!a || !a.down) return;
    a.down = false;
    a.hp = Math.max(1, a.max * (helped ? COOP.reviveHp : COOP.riseHp));
    a.revive = 0;
    a.downTime = 0;
    a.invincible = COOP.riseGuard;
    if (helped) this.run.revives = (this.run.revives ?? 0) + 1;
    this.burst(a.x, a.y, '#8acdb6', 24);
    this.ring(a.x, a.y, 110, '#8acdb6', 0.5, 5);
    this.label(a.x, a.y - 60, helped ? 'ПІДНЯТО' : 'ВСТАЄ', '#8acdb6');
    this.audio.play('heal');
  }
  // Explosive props near a point take the ability's damage too.
  abilityProps(near: (x: number, y: number) => boolean, damage: number) {
    for (const p of this.explosives)
      if (!p.blown && near(p.x, p.y)) this.hitProp(p, damage);
  }
  // Петрович: a ring that hits and shoves everything around the house.
  abilityQuake() {
    this.pulseRing = 0.55;
    const landed = this.enemies.some(
      (e) => e.hp > 0 && Math.hypot(e.x - this.x, e.y - this.y) < QUAKE.radius,
    );
    // A snapshot: area damage reaches only enemies standing before it
    // landed, so splitter halves and brood young from its kills are spared.
    for (const e of this.enemies.slice()) {
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < QUAKE.radius) {
        const whistle = this.pk('whistle') > 0;
        this.damage(e, this.stats.damage * QUAKE.damage * (whistle ? 1.3 : 1));
        if (!isLeader(e.type)) {
          // Свисток pulls the yard in instead of pushing it away.
          const step = whistle ? -Math.max(0, d - 70) * 0.55 : QUAKE.push;
          e.x += ((e.x - this.x) / Math.max(1, d)) * step;
          e.y += ((e.y - this.y) / Math.max(1, d)) * step;
        }
      }
    }
    this.abilityProps(
      (x, y) => Math.hypot(x - this.x, y - this.y) < QUAKE.radius,
      this.stats.damage * QUAKE.damage,
    );
    return landed;
  }
  // Іскра: lightning jumps between up to six enemies and stuns them.
  abilityDischarge() {
    const color = heroAbility('spark').color;
    this.ring(this.x, this.y, 110, color, 0.35, 4);
    const targets = chainTargets(
      { x: this.x, y: this.y },
      this.enemies,
      DISCHARGE,
    );
    const pts = [this.x, this.y];
    let amount = this.stats.damage * DISCHARGE.damage;
    for (const e of targets) {
      pts.push(e.x, e.y);
      // Bosses have their own stagger rules; everyone else drops what they do.
      if (!isLeader(e.type))
        e.stagger = Math.max(e.stagger ?? 0, DISCHARGE.stagger);
      this.damage(e, amount);
      this.burst(e.x, e.y, color, 8);
      amount *= DISCHARGE.falloff;
      if (this.ended) break;
    }
    this.abilityProps((x, y) => {
      for (let i = 0; i < pts.length; i += 2)
        if (Math.hypot(x - pts[i], y - pts[i + 1]) < 70) return true;
      return false;
    }, this.stats.damage * DISCHARGE.damage);
    this.arcs.push({ pts, life: 0.32, bold: true });
    return targets.length > 0;
  }
  // Флора: heals the house, slows and pricks everything around it.
  abilityBloom() {
    const color = heroAbility('flora').color;
    const heal = Math.max(
      0,
      Math.min(this.stats.health * BLOOM.heal, this.stats.health - this.run.hp),
    );
    this.run.hp += heal;
    if (heal > 0)
      this.label(this.x, this.y - 65, '+' + Math.round(heal), color);
    this.ring(this.x, this.y, BLOOM.radius, color, 0.55, 5);
    this.ring(this.x, this.y, BLOOM.radius * 0.6, color, 0.4, 3);
    this.burst(this.x, this.y, color, 26);
    let landed = false;
    for (const e of this.enemies.slice()) {
      if (e.hp <= 0 || Math.hypot(e.x - this.x, e.y - this.y) >= BLOOM.radius)
        continue;
      landed = true;
      e.slow = Math.max(e.slow ?? 0, BLOOM.slow);
      this.damage(e, this.stats.damage * BLOOM.damage);
      this.burst(e.x, e.y, color, 6);
      if (this.ended) break;
    }
    this.abilityProps(
      (x, y) => Math.hypot(x - this.x, y - this.y) < BLOOM.radius,
      this.stats.damage * BLOOM.damage,
    );
    return landed;
  }
  // Борис: takes a share of the health of everything around the house and
  // makes kills pay more coins for a few seconds.
  abilityAudit() {
    const color = heroAbility('boris').color;
    this.ring(this.x, this.y, AUDIT.radius, color, 0.55, 5);
    this.auditTime = AUDIT.seconds;
    this.label(this.x, this.y - 65, 'РЕВІЗІЯ', color);
    let hit = 0;
    for (const e of this.enemies.slice()) {
      if (e.hp <= 0 || Math.hypot(e.x - this.x, e.y - this.y) >= AUDIT.radius)
        continue;
      hit++;
      const share = isLeader(e.type)
        ? AUDIT.leaderShare * e.max
        : AUDIT.share * e.hp;
      this.damage(e, this.stats.damage * AUDIT.damage + share);
      this.burst(e.x, e.y, color, 6);
      if (this.ended) break;
    }
    const coins = Math.min(AUDIT.cap, hit * AUDIT.perEnemy);
    if (coins > 0) {
      this.run.coins += coins;
      this.label(this.x + 26, this.y - 40, '+' + coins, color);
    }
    this.abilityProps(
      (x, y) => Math.hypot(x - this.x, y - this.y) < AUDIT.radius,
      this.stats.damage * AUDIT.damage,
    );
    return hit > 0;
  }
  // Is a living enemy within reach of the house?
  anyNear(radius: number) {
    return this.enemies.some(
      (e) => e.hp > 0 && Math.hypot(e.x - this.x, e.y - this.y) < radius,
    );
  }
  // Ніна: boiling water on everything around the house; it keeps burning.
  abilityScald() {
    const color = heroAbility('nina').color;
    this.ring(this.x, this.y, SCALD.radius, color, 0.5, 5);
    this.ring(this.x, this.y, SCALD.radius * 0.55, color, 0.35, 3);
    this.burst(this.x, this.y, color, 24);
    let landed = false;
    for (const e of this.enemies.slice()) {
      if (e.hp <= 0 || Math.hypot(e.x - this.x, e.y - this.y) >= SCALD.radius)
        continue;
      landed = true;
      e.burn = Math.max(e.burn ?? 0, SCALD.seconds);
      e.burnDps = Math.max(e.burnDps ?? 0, this.stats.damage * SCALD.dps);
      this.damage(e, this.stats.damage * SCALD.hit);
      this.burst(e.x, e.y, color, 5);
      if (this.ended) break;
    }
    this.abilityProps(
      (x, y) => Math.hypot(x - this.x, y - this.y) < SCALD.radius,
      this.stats.damage * SCALD.hit,
    );
    return landed;
  }
  // Микола: a ring of bullets from the roof, each one passing through the
  // first enemy it hits.
  abilityVolley() {
    const color = heroAbility('lev').color;
    this.ring(this.x, this.y, 90, color, 0.3, 4);
    const turn = (this.elapsed * 1.7) % (Math.PI * 2);
    for (let i = 0; i < VOLLEY.count; i++) {
      const a = turn + (i / VOLLEY.count) * Math.PI * 2;
      this.bullets.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(a) * VOLLEY.speed,
        vy: Math.sin(a) * VOLLEY.speed,
        life: VOLLEY.life,
        damage: this.stats.damage * VOLLEY.damage,
        enemy: false,
        crit: false,
        age: 0,
        kind: 'pellet',
        pierce: VOLLEY.pierce,
      });
    }
    this.burst(this.x, this.y, color, 16);
    return this.anyNear(VOLLEY.speed * VOLLEY.life);
  }
  // Марта: shields (each blocks one hit) and a little healing.
  abilityWard() {
    const color = heroAbility('marta').color;
    const before = this.shieldCharges;
    this.shieldCharges = Math.max(
      before,
      Math.min(WARD.cap, before + WARD.charges),
    );
    const gained = this.shieldCharges - before;
    const heal = Math.max(
      0,
      Math.min(this.stats.health * WARD.heal, this.stats.health - this.run.hp),
    );
    this.run.hp += heal;
    this.ring(this.x, this.y, 120, color, 0.5, 5);
    this.burst(this.x, this.y, color, 18);
    this.label(
      this.x,
      this.y - 65,
      gained > 0 ? 'ЩИТ +' + gained : 'ЩИТ ПОВНИЙ',
      color,
    );
    if (heal > 0)
      this.label(this.x + 26, this.y - 40, '+' + Math.round(heal), color);
    return this.anyNear(260);
  }
  // Данило: a fresh dash, a short burst of speed and a moment of safety.
  abilityExpress() {
    const color = heroAbility('danilo').color;
    this.dashCd = 0;
    this.hasteTime = EXPRESS.seconds;
    this.invincible = Math.max(this.invincible, EXPRESS.guard);
    this.ring(this.x, this.y, 110, color, 0.35, 4);
    this.burst(this.x, this.y, color, 20);
    this.label(this.x, this.y - 65, 'ЕКСПРЕС', color);
    return this.anyNear(260);
  }
  // Соломія: kills every hostile bullet near the house and stuns the yard.
  abilityJam() {
    const color = heroAbility('solomia').color;
    this.ring(this.x, this.y, JAM.radius, color, 0.55, 5);
    this.ring(this.x, this.y, JAM.radius * 0.5, color, 0.4, 3);
    let cleared = 0;
    for (const b of this.bullets) {
      if (
        b.enemy &&
        b.life > 0 &&
        Math.hypot(b.x - this.x, b.y - this.y) < JAM.radius
      ) {
        b.life = 0;
        cleared++;
        if (cleared <= 24) this.burst(b.x, b.y, color, 3);
      }
    }
    let stunned = 0;
    for (const e of this.enemies.slice()) {
      if (e.hp <= 0 || Math.hypot(e.x - this.x, e.y - this.y) >= JAM.radius)
        continue;
      stunned++;
      if (!isLeader(e.type))
        e.stagger = Math.max(e.stagger ?? 0, JAM.stagger);
      this.damage(e, this.stats.damage * JAM.damage);
      if (this.ended) break;
    }
    this.label(this.x, this.y - 65, 'ГЛУШИЛКА', color);
    return cleared > 0 || stunned > 0;
  }
  receiveHit(amount: number) {
    if (this.shieldCharges > 0) {
      this.shieldCharges--;
      this.burst(this.x, this.y, '#7cbef4', 22);
      this.label(this.x, this.y - 55, 'УДАР ЗАБЛОКОВАНО', '#7cbef4');
      return 0;
    }
    this.run.hp -= amount;
    this.run.damageTaken = (this.run.damageTaken ?? 0) + amount;
    this.run.battleDamage = (this.run.battleDamage ?? 0) + amount;
    return amount;
  }
  // Every source of player damage: numbers, flash, freeze and a buzz.
  hurt(amount: number, invincible: number, trauma: number) {
    const taken = this.receiveHit(amount);
    this.invincible = invincible + (this.sync ? COOP.netGrace : 0);
    this.addTrauma(taken ? trauma : trauma * 0.4);
    this.audio.play('hit');
    if (taken) {
      this.label(this.x, this.y - 55, '−' + Math.round(taken), '#ff8e82');
      this.hurtFlash = 1;
      this.freeze(0.06);
      this.vibrate(
        Math.round(Math.min(70, 18 + (taken / this.stats.health) * 220)),
      );
    }
    return taken;
  }
  burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = this.fx() * Math.PI * 2,
        v = 30 + this.fx() * 100;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.3 + this.fx() * 0.4,
        max: 0.7,
        color,
        size: 2 + this.fx() * 3,
      });
    }
  }
  // Death debris in the location's material: rust sparks and shards,
  // greenhouse leaves and spores, core pixels.
  debris(x: number, y: number, n: number, power = 1) {
    if (this.particles.length > PARTICLE_CAP * 0.75) n = Math.ceil(n / 3);
    const f = this.fx,
      chapter = Math.min(2, this.run.chapter);
    for (let i = 0; i < n; i++) {
      const a = f() * Math.PI * 2,
        v = (70 + f() * 170) * power;
      const p: Particle = {
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.4,
        max: 0.4,
        color: '#fff',
        size: 3,
        rot: f() * Math.PI * 2,
        spin: (f() - 0.5) * 16,
        drag: 3,
      };
      if (chapter === 0 && i % 2) {
        p.shape = 'spark';
        p.color = f() < 0.5 ? '#ffc27a' : '#ff9443';
        p.size = 1.6 + f() * 1.4;
        p.life = p.max = 0.22 + f() * 0.25;
      } else if (chapter === 0) {
        p.shape = 'shard';
        p.color = ['#b8764a', '#d9a06a', '#6f5846'][i % 3];
        p.size = 3 + f() * 4;
        p.gravity = 320;
        p.life = p.max = 0.45 + f() * 0.35;
      } else if (chapter === 1 && i % 3) {
        p.shape = 'leaf';
        p.color = ['#8fd06f', '#b5dc79', '#5f9f58'][i % 3];
        p.size = 3 + f() * 3;
        p.gravity = 70;
        p.drag = 3.6;
        p.life = p.max = 0.7 + f() * 0.5;
      } else if (chapter === 1) {
        p.shape = 'spore';
        p.color = '#e4f5b0';
        p.size = 1.5 + f() * 2;
        p.vy -= 40;
        p.life = p.max = 0.8 + f() * 0.5;
      } else {
        p.shape = 'pixel';
        p.color = ['#7fe8ff', '#b9f4ff', '#3fc6e8'][i % 3];
        p.size = 2 + Math.floor(f() * 3);
        p.life = p.max = 0.35 + f() * 0.4;
      }
      this.particles.push(p);
    }
  }
  ring(
    x: number,
    y: number,
    radius: number,
    color: string,
    life = 0.35,
    width = 3,
  ) {
    this.rings.push({ x, y, radius, life, max: life, color, width });
    if (this.rings.length > 24) this.rings.shift();
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
  // Canvas banner (phase change, events, combo milestones), newest last.
  banner(title: string, text: string, color: string, seconds = 1.6) {
    this.banners.push({ title, text, color, life: seconds, max: seconds });
    if (this.banners.length > 3) this.banners.shift();
  }
  damageNumber(e: Enemy, amount: number, crit: boolean) {
    const open = this.numbers.find((n) => n.target === e && n.open > 0);
    if (open) {
      open.value += amount;
      if (crit) open.crit = true;
      return;
    }
    if (this.numbers.length >= NUMBER_CAP) this.numbers.shift();
    const dx = (this.fx() - 0.5) * 22;
    this.numbers.push({
      x: e.x + dx,
      y: e.y - e.r - 14,
      dx,
      vy: -52,
      value: amount,
      crit,
      life: 0.9,
      max: 0.9,
      open: 0.15,
      target: e,
    });
  }
  knock(e: Enemy, vx: number, vy: number) {
    e.knockX = (e.knockX ?? 0) + vx;
    e.knockY = (e.knockY ?? 0) + vy;
  }
  leaderStyle(type: number) {
    const def =
      type === MINIBOSS_TYPE
        ? minibossFor(this.run.chapter, this.minibossVariant)
        : campaignBoss(
            this.run.chapter,
            this.run.bossVariants[this.run.chapter],
          );
    return { id: 'id' in def ? def.id : '', name: def.name, color: def.color };
  }
  spawn(type?: number, opts: SpawnOptions = {}): Enemy | undefined {
    const boss = type === 99;
    const mini = type === MINIBOSS_TYPE;
    const leaderFight =
      this.run.kind === 'boss' || this.run.kind === 'miniboss';
    const placed = opts.x !== undefined && opts.y !== undefined;
    const angle = placed
        ? Math.atan2(opts.y! - this.y, opts.x! - this.x)
        : this.rng() * Math.PI * 2,
      d = placed ? 0 : boss || mini ? 320 : 430 + this.rng() * 100;
    const pool = LOCATIONS[this.run.chapter].enemyTypes;
    const t = type ?? pool[Math.floor(this.rng() * pool.length)];
    const def = boss
      ? campaignBoss(this.run.chapter, this.run.bossVariants[this.run.chapter])
      : mini
        ? minibossFor(this.run.chapter, this.minibossVariant)
        : ENEMY_DEFS[t];
    if (
      !def ||
      (!opts.force &&
        this.enemies.filter((e) => e.hp > 0).length >=
          (this.run.kind === 'miniboss'
            ? 7
            : leaderFight
              ? 19
              : 55 + this.run.chapter * 10) *
            (this.ally ? COOP.players : 1))
    )
      return;
    // Leaders and early rooms never roll, so their combat rolls stay put.
    const affix =
      boss || mini
        ? null
        : opts.affix !== undefined
          ? opts.affix
          : rollAffix(this.rng, this.run);
    const r = def.radius;
    let hp =
      def.health *
      (boss || mini
        ? 1
        : (1 + this.run.step * 0.025) * (this.run.kind === 'elite' ? 1.2 : 1)) *
      this.heat.enemyHealth *
      (this.ally && (boss || mini) ? COOP.leaderHealth : 1);
    let speed = def.speed * this.heat.enemySpeed;
    if (affix === 'armored') hp *= 1.6;
    if (affix === 'swift') speed *= 1.45;
    const enemy: Enemy = {
      x: Math.max(
        50,
        Math.min(1550, placed ? opts.x! : this.x + Math.cos(angle) * d),
      ),
      y: Math.max(
        50,
        Math.min(950, placed ? opts.y! : this.y + Math.sin(angle) * d),
      ),
      hp,
      max: hp,
      r,
      type: t,
      speed,
      hit: 0,
      timer: 1 + this.rng() * 2,
      phase: 0,
      walk: 0,
      facing: Math.cos(angle) > 0 ? -1 : 1,
      aim: Math.atan2(-Math.sin(angle), -Math.cos(angle)),
      attack: 0,
      visualSeed: this.spawnCount++,
      pattern: 0,
    };
    if (affix) enemy.affix = affix;
    // Every other shooter, bomber and charger aims where the house is going;
    // in elite squads all of them do.
    if (
      !boss &&
      !mini &&
      (enemy.visualSeed % 2 === 0 || this.run.kind === 'elite') &&
      LEADING.includes(ENEMY_DEFS[t].behavior)
    )
      enemy.leads = true;
    this.enemies.push(enemy);
    return enemy;
  }
  // One pack of a squad wave: fodder in front, shooters behind, all from one
  // side that keeps them inside the arena and inside the gun's reach.
  spawnPack(types: number[], squad: number, chief?: number) {
    const base = this.rng() * Math.PI * 2;
    let angle = Math.atan2(500 - this.y, 800 - this.x);
    for (let k = 0; k < 6; k++) {
      const a = base + (k * Math.PI) / 3,
        px = this.x + Math.cos(a) * 400,
        py = this.y + Math.sin(a) * 400;
      if (px > 90 && px < 1510 && py > 90 && py < 910) {
        angle = a;
        break;
      }
    }
    const color = this.encounterColor();
    const members = chief === undefined ? types : [...types, chief];
    members.forEach((type, i) => {
      const def = ENEMY_DEFS[type];
      if (!def) return;
      const lead = chief !== undefined && i === members.length - 1,
        back = RANGED_BEHAVIORS.includes(def.behavior),
        d = (lead ? 380 : back ? 400 : 320) + this.rng() * 50,
        a =
          angle +
          (lead ? 0 : (i - (types.length - 1) / 2) * 0.17) +
          (this.rng() - 0.5) * 0.1;
      const e = this.spawn(type, {
        force: true,
        ...(lead
          ? {
              affix:
                this.run.kind === 'elite' || this.run.step >= 6
                  ? this.encounter!.leaderAffix
                  : null,
            }
          : {}),
        x: Math.max(60, Math.min(1540, this.x + Math.cos(a) * d)),
        y: Math.max(60, Math.min(940, this.y + Math.sin(a) * d)),
      });
      if (!e) return;
      e.squad = squad;
      // Freshly arrived shooters take a beat before their first shot.
      e.timer = Math.max(e.timer, 1.2);
      if (lead) {
        const k = this.run.kind === 'elite' ? 3 : 2.2;
        e.hp = e.max = e.max * k;
        e.r *= 1.2;
        e.scale = 1.3;
        e.chief = true;
        this.chief = e;
      }
    });
    const cx = this.x + Math.cos(angle) * 360,
      cy = this.y + Math.sin(angle) * 360;
    this.ring(cx, cy, 110, color, 0.5, 3);
    this.incoming.push({ x: cx, y: cy, life: 1.6, color });
  }
  encounterColor() {
    return LOCATIONS[Math.min(2, this.run.chapter)].color;
  }
  // Squad members still on the field for wave `index`.
  waveAlive(index: number) {
    let n = 0;
    for (const e of this.enemies) if (e.hp > 0 && e.squad === index) n++;
    return n;
  }
  // Kills the squad still needs: the quota, and the chief while it stands.
  squadLeft() {
    if (!this.encounter) return 0;
    const left = Math.max(0, this.quota - this.squadKills);
    return this.chief && this.chief.hp > 0 ? Math.max(1, left) : left;
  }
  // Waves go out one after another: packs PACK_GAP apart, then a breather
  // once the wave is mostly down (or WAVE_MAX seconds at the latest).
  updateSquad() {
    if (!this.encounter) return;
    const last = this.plan.length - 1;
    if (this.waveWait && this.wave < last) {
      // Elite squads press on: the next wave comes while half of this one
      // still stands, after a shorter breather.
      const elite = this.run.kind === 'elite',
        size = this.plan[this.wave].length;
      if (
        this.waveAlive(this.wave) <= Math.floor(size * (elite ? 0.5 : 0.25))
      ) {
        this.waveWait = false;
        this.breather = true;
        this.spawnTimer = Math.min(
          this.spawnTimer,
          ((elite ? ELITE_BREATHER : BREATHER) + this.rng() * BREATHER_SPREAD) /
            this.heat.spawnRate,
        );
      }
    }
    if (this.spawnTimer > 0) return;
    if (!this.pending.length) {
      if (this.wave >= last) {
        this.spawnTimer = 1e9;
        return;
      }
      this.wave++;
      this.breather = false;
      this.waveWait = false;
      const list = this.plan[this.wave];
      // Six or more come as two packs from different sides.
      const cut = list.length > 5 ? Math.ceil(list.length / 2) : list.length;
      this.pending = [list.slice(0, cut), list.slice(cut)].filter(
        (p) => p.length,
      );
      this.announceWave();
    }
    const first = this.pending.length === this.packsOf(this.wave);
    const pack = this.pending.shift()!;
    this.spawnPack(
      pack,
      this.wave,
      this.wave === last && first ? this.encounter.leader : undefined,
    );
    if (this.pending.length) this.spawnTimer = PACK_GAP / this.heat.spawnRate;
    else if (this.wave < last) {
      this.waveWait = true;
      this.spawnTimer =
        (WAVE_MAX + this.plan[this.wave].length * 0.4) / this.heat.spawnRate;
    } else this.spawnTimer = 1e9;
  }
  packsOf(wave: number) {
    return (this.plan[wave]?.length ?? 0) > 5 ? 2 : 1;
  }
  announceWave() {
    const t = this.encounter!,
      color = this.encounterColor(),
      last = this.wave === this.plan.length - 1;
    if (this.wave === 0) this.banner(t.name.toUpperCase(), t.text, color, 2.4);
    else if (last) {
      this.banner(
        'ФІНАЛЬНА ХВИЛЯ',
        `Ватажок: ${ENEMY_DEFS[t.leader]?.name ?? ''}`,
        color,
        1.8,
      );
      this.audio.play('bossPhase', { volume: 0.5 });
    } else {
      this.banner(`ХВИЛЯ ${this.wave + 1}`, '', color, 1.1);
      this.audio.play('ui');
    }
    this.onBeat?.({
      kind: 'wave',
      squad: t.id,
      wave: this.wave + 1,
      waves: this.plan.length,
    });
  }
  // Which boss or miniboss `type` is in this fight, for CombatBeat.
  leaderRef(type: number): LeaderRef {
    const location = Math.min(2, this.run.chapter);
    return type === MINIBOSS_TYPE
      ? { kind: 'miniboss', location, variant: this.minibossVariant }
      : {
          kind: 'boss',
          location,
          variant: this.run.bossVariants[this.run.chapter] ?? 0,
        };
  }
  // Squad broken: every quota kill made, the chief down, no event running
  // that still needs the field (alarm wave, courier chase).
  squadCleared() {
    if (!this.encounter || this.wave < this.plan.length - 1) return false;
    if (this.pending.length || this.squadLeft() > 0) return false;
    const ev = this.event;
    return !(
      ev?.state === 'live' &&
      (ev.id === 'alarm' || ev.id === 'courier')
    );
  }
  // End of a squad fight: loose coins bank (old ones at half value), XP
  // crystals still in flight count, a running overload counts as survived.
  bankLoose() {
    let fresh = 0,
      stale = 0;
    for (const d of this.drops) {
      if (d.kind === 'coin') {
        if ((d.t ?? 0) < FRESH_COINS) fresh += d.value;
        else stale += d.value;
      } else if (d.kind === 'xp') this.run.xp += d.value;
      else continue;
      d.value = 0;
    }
    this.run.coins += fresh + Math.floor(stale * LOOSE_COINS);
    const ev = this.event;
    if (ev?.id === 'overload' && ev.state === 'live')
      this.eventWon(ev, 'МЕРЕЖА СТАБІЛЬНА', 'Перевантаження минуло');
  }
  // Enemy damage under heat; exact at heat 0 (multiplying by one).
  threat(damage: number) {
    return damage * this.heat.enemyDamage;
  }
  // What an enemy's touch costs after armour, for the house or the partner.
  contactHit(e: Enemy) {
    return Math.max(
      2,
      this.threat(
        e.type === MINIBOSS_TYPE
          ? minibossFor(this.run.chapter, this.minibossVariant).contactDamage
          : e.type === 99
            ? 12 + this.run.chapter * 4
            : ENEMY_DEFS[e.type].contactDamage * (e.chief ? 1.5 : 1),
      ) - this.stats.armor,
    );
  }
  // The partner each frame: timers, the walk, the tether, the revive and the
  // plain gun. Without a partner this is never called with anything to do.
  updateAlly(dt: number) {
    const a = this.ally;
    if (!a) return;
    a.dashCd = Math.max(0, a.dashCd - dt);
    a.pulseCd = Math.max(0, a.pulseCd - dt);
    a.hasteTime = Math.max(0, a.hasteTime - dt);
    a.invincible -= dt;
    a.dashing -= dt;
    a.muzzle = Math.max(0, a.muzzle - dt);
    this.allyFocus += ((a.down ? 0 : 1) - this.allyFocus) * Math.min(1, dt * 3);
    if (a.down) {
      a.vx = a.vy = 0;
      a.downTime += dt;
      const near = Math.hypot(a.x - this.x, a.y - this.y) < COOP.reviveRadius;
      a.revive = reviveStep(a.revive, near, dt);
      if (a.revive >= 1) this.reviveAlly(true);
      else if (a.downTime >= COOP.autoRise) this.reviveAlly(false);
      return;
    }
    const net = this.sync?.cur;
    // A partner on another device is driven by its own input alone.
    const move =
      net || this.hostRemote ? { x: 0, y: 0 } : keyVector(this.keys, P2_KEYS);
    const pad = this.hostRemote ? { x: 0, y: 0 } : this.pad2;
    let dx = net ? net[1].x : this.stick2.x + pad.x + move.x;
    let dy = net ? net[1].y : this.stick2.y + pad.y + move.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      dx /= Math.max(1, length);
      dy /= Math.max(1, length);
      const unit = Math.hypot(dx, dy);
      a.facing = { x: dx / unit, y: dy / unit };
    }
    if (a.dashing > 0) {
      dx = a.facing.x * 3.8;
      dy = a.facing.y * 3.8;
    }
    const slow =
      a.dashing > 0
        ? 1
        : this.hazards.reduce(
            (speed, hazard) =>
              hazard.slow && hazardContains(hazard, a.x, a.y)
                ? Math.min(speed, hazard.slow)
                : speed,
            1,
          );
    const speed =
      this.stats.speed * COOP.speed * slow * (a.hasteTime > 0 ? EXPRESS.haste : 1);
    const fromX = a.x,
      fromY = a.y;
    a.x = Math.max(55, Math.min(1545, a.x + dx * speed * dt));
    a.y = Math.max(55, Math.min(945, a.y + dy * speed * dt));
    if (this.pushOutOfSolids(a, 18)) {
      a.x = Math.max(55, Math.min(1545, a.x));
      a.y = Math.max(55, Math.min(945, a.y));
    }
    // Both stay inside one picture: whoever walks away is pulled back, and
    // the house gives a little too.
    // The size of the screen is not a part of the simulation online.
    const small = this.view.w > 100 && !this.sync;
    const fix = spreadFix(
      this,
      a,
      small ? Math.max(260, Math.min(COOP.spreadX, this.view.w - 120)) : COOP.spreadX,
      small ? Math.max(200, Math.min(COOP.spreadY, this.view.h - 140)) : COOP.spreadY,
    );
    if (fix.ax || fix.ay) {
      this.x = Math.max(55, Math.min(1545, this.x + fix.ax));
      this.y = Math.max(55, Math.min(945, this.y + fix.ay));
      a.x = Math.max(55, Math.min(1545, a.x + fix.bx));
      a.y = Math.max(55, Math.min(945, a.y + fix.by));
    }
    const k = Math.min(1, dt * 10);
    a.vx += ((a.x - fromX) / Math.max(dt, 1e-3) - a.vx) * k;
    a.vy += ((a.y - fromY) / Math.max(dt, 1e-3) - a.vy) * k;
    a.walk += Math.hypot(a.vx, a.vy) * dt * 0.05;
    a.hp = Math.min(a.max, a.hp + this.stats.regen * COOP.regen * dt);
    a.shotTimer -= dt;
    if (a.shotTimer <= 0) {
      const target = this.nearest(a.x, a.y, this.stats.range * COOP.range);
      if (target) {
        a.aim = Math.atan2(target.y - a.y, target.x - a.x);
        a.muzzle = 0.09;
        this.shoot(a.x, a.y - 10, target, true, undefined, COOP.damage / 0.45);
        this.audio.play('shoot', { volume: 0.5, pitch: 1.25 });
        a.shotTimer =
          COOP.fireGap / (this.stats.rate * (this.overloaded() ? 2 : 1));
      } else if (length > 0) a.aim = Math.atan2(a.facing.y, a.facing.x);
    }
  }
  damage(
    e: Enemy,
    amount: number,
    crit = false,
    incomingAngle?: number,
    quiet = false,
  ) {
    if (e.hp <= 0) return;
    if (
      (e.type === 7 || this.mirrored(e)) &&
      incomingAngle !== undefined &&
      Math.cos(incomingAngle + Math.PI - e.aim) > 0.25
    )
      amount *= 0.55;
    if (e.affix === 'armored') amount *= 0.75;
    if ((e.stagger ?? 0) > 0) amount *= STAGGER_DAMAGE;
    e.hp -= amount;
    if (!quiet) {
      e.hit = 0.12;
      this.burst(e.x, e.y, crit ? '#ffcd82' : '#b0ded4', crit ? 5 : 2);
    }
    if (this.settings.damageNumbers) this.damageNumber(e, amount, crit);
    if (e.hp <= 0) {
      this.run.kills++;
      this.battleKills++;
      this.run.maxBattleKills = Math.max(
        this.run.maxBattleKills ?? 0,
        this.battleKills,
      );
      this.defeated.push({ ...e, life: 0.48 });
      this.countCombo();
      if (this.dashKill > 0 && this.dashCd > 0 && this.pk('overdrive')) {
        this.dashCd = 0;
        this.label(this.x, this.y - 62, 'ФОРСАЖ', '#efbd68');
      }
      const shards = this.pk('shrapnel') * 2;
      for (let i = 0; i < shards && e.type !== COURIER; i++) {
        const a = this.fx() * Math.PI * 2;
        this.bullets.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 420,
          vy: Math.sin(a) * 420,
          life: 0.45,
          damage: this.stats.damage * 0.5,
          enemy: false,
          crit: false,
          age: 0,
          shard: true,
          hitSet: [e],
        });
      }
      if (e.type === COURIER) {
        this.courierCaught(e);
        return;
      }
      if (e.squad !== undefined) {
        this.squadKills++;
        // The last few stop holding their range and close in.
        if (this.wave === this.plan.length - 1 && this.squadLeft() <= 3)
          for (const other of this.enemies)
            if (other.hp > 0 && other.squad !== undefined) other.rush = true;
      }
      if (e.chief) {
        this.banner(
          'ВАТАЖКА ЗБИТО',
          this.encounter?.name ?? '',
          '#ffd166',
          1.2,
        );
        if (this.encounter)
          this.onBeat?.({ kind: 'chief', squad: this.encounter.id });
        for (let i = 0; i < 3; i++)
          this.drops.push({
            x: e.x + (i - 1) * 12,
            y: e.y - 6,
            kind: 'coin',
            value: this.comboCoins(1),
          });
      }
      this.burst(
        e.x,
        e.y,
        isLeader(e.type)
          ? LOCATIONS[this.run.chapter].color
          : ENEMY_DEFS[e.type].color,
        isLeader(e.type) ? 55 : 12,
      );
      this.drops.push({
        x: e.x,
        y: e.y,
        kind: 'xp',
        value: xpValue(e),
      });
      if (this.rng() < 0.32 + Math.min(0.2, this.stats.luck * 0.12))
        this.drops.push({
          x: e.x + 8,
          y: e.y + 5,
          kind: 'coin',
          value: this.comboCoins(e.r > 20 ? 2 : 1),
        });
      if (this.rng() < 0.03)
        this.drops.push({ x: e.x - 10, y: e.y, kind: 'heal', value: 8 });
      if (e.affix) this.affixDown(e);
      this.run.hp = Math.min(
        this.stats.health,
        this.run.hp + this.stats.vampire,
      );
      if (e.type === 5)
        for (let i = 0; i < 2; i++) {
          const count = this.enemies.length;
          this.spawn(3);
          const child = this.enemies[this.enemies.length - 1];
          if (this.enemies.length > count) {
            child.x = Math.max(50, Math.min(1550, e.x + (i ? 30 : -30)));
            child.y = e.y;
          }
        }
      if (ENEMY_DEFS[e.type]?.behavior === 'burst')
        this.hazards.push({
          x: e.x,
          y: e.y,
          radius: 68,
          age: -1.15,
          duration: 0.35,
          damage: ENEMY_DEFS[e.type].damage,
          color: ENEMY_DEFS[e.type].color,
        });
      if (isLeader(e.type)) {
        if (e.type === MINIBOSS_TYPE)
          this.run.minibossKills = (this.run.minibossKills ?? 0) + 1;
        // With two leaders the first one's fall is only a beat: the fight
        // goes on until the last one is down.
        if (
          this.enemies.some((o) => o !== e && o.hp > 0 && isLeader(o.type))
        ) {
          this.leaderDown(e);
          this.banner('БОС ЗБИТО', 'Лишився ще один', '#ffd166', 1.4);
          return;
        }
        // Counted before finish() so the result already carries it.
        if (!this.run.battleDamage)
          this.run.bossNoHit = (this.run.bossNoHit ?? 0) + 1;
        for (const drop of this.drops)
          if (drop.kind === 'coin') this.run.coins += drop.value;
          else if (drop.kind === 'xp') this.run.xp += drop.value;
        this.drops = [];
        if (e.type === 99) this.run.coins += [65, 90, 120][this.run.chapter];
        this.leaderDown(e);
        this.endReason = 'leader';
        this.finish(true);
      } else this.killFx(e, crit);
    }
  }
  killFx(e: Enemy, crit: boolean) {
    const affix = this.affixStyle(e);
    this.ring(
      e.x,
      e.y,
      e.r * 2.2 + (affix ? 30 : 16),
      affix?.color ?? LOCATIONS[Math.min(2, this.run.chapter)].color,
      affix ? 0.4 : 0.3,
      affix ? 4 : 3,
    );
    this.debris(e.x, e.y, e.r > 20 || affix ? 12 : 8);
    this.addTrauma(affix ? 0.14 : 0.06, 0.28);
    if (affix) this.audio.play('eliteKill');
    else this.audio.play('kill', { pitch: e.r > 20 ? 0.85 : 1 });
    if (crit) this.freeze(0.045);
  }
  // Kill streak; every fifth kill chimes a step higher.
  countCombo() {
    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    this.comboPop = 1;
    this.run.bestCombo = Math.max(this.run.bestCombo ?? 0, this.combo);
    if (this.combo % 5 === 0) this.audio.play('combo', { combo: this.combo });
    if (this.combo === 25 || this.combo % 50 === 0)
      this.banner(
        `КОМБО ×${this.combo}`,
        `Монети ×${comboMultiplier(this.combo)}`,
        '#ffd166',
        1.2,
      );
  }
  // Coin value under the combo multiplier; exact below a streak of six.
  comboCoins(base: number) {
    const audit = this.auditTime > 0 ? AUDIT.coins : 1;
    const bonus =
      base * (comboMultiplier(this.combo) * audit - 1) + this.comboCarry;
    const extra = Math.floor(bonus);
    this.comboCarry = bonus - extra;
    return base + extra;
  }
  // 'Посилений' kill: a guaranteed coin drop plus the affix's death effect.
  // One coin, not two: two made affixed kills alone worth +20% (normal) to
  // +35% (elite) of 0.9 fight income; see docs/balance/2026-09-24.md.
  affixDown(e: Enemy) {
    this.run.elitesKilled = (this.run.elitesKilled ?? 0) + 1;
    this.drops.push({
      x: e.x - 7,
      y: e.y - 9,
      kind: 'coin',
      value: this.comboCoins(1),
    });
    const def = ENEMY_DEFS[e.type];
    if (e.affix === 'volatile')
      this.hazards.push({
        x: e.x,
        y: e.y,
        radius: 74,
        age: -0.7,
        duration: 0.3,
        damage: Math.max(10, def?.damage ?? 10),
        color: AFFIX_BY_ID.volatile.color,
        blast: true,
      });
    if (e.affix === 'splitter' && !e.split)
      for (const side of [-1, 1]) {
        const child = this.spawn(e.type, {
          affix: null,
          force: true,
          x: e.x + side * e.r,
          y: e.y,
        });
        if (!child) continue;
        child.hp = child.max = e.max * 0.4;
        child.r = Math.max(8, e.r * 0.72);
        child.scale = 0.72;
        child.split = true;
        child.speed *= 1.1;
        this.knock(child, side * 180, 0);
      }
  }
  leaderDown(e: Enemy) {
    const color = this.leaderStyle(e.type).color;
    this.ring(e.x, e.y, 150, '#fff3dc', 0.45, 7);
    this.ring(e.x, e.y, 280, color, 0.7, 6);
    this.ring(e.x, e.y, 420, LOCATIONS[this.run.chapter].color, 0.9, 4);
    this.debris(e.x, e.y, 40, 1.8);
    this.addTrauma(1);
    this.flash = 1;
    this.freeze(0.1);
    this.slow(0.8, 0.25);
    this.vibrate([70, 40, 140]);
    this.audio.play('explosion');
  }
  // Crossing half health: a readable beat before the harder pattern set.
  phaseShift(e: Enemy) {
    const style = this.leaderStyle(e.type);
    this.banner('ФАЗА 2', style.name, style.color, 1.6);
    this.onBeat?.({ kind: 'phase', leader: this.leaderRef(e.type) });
    this.freeze(0.08);
    this.slow(0.6, 0.35);
    this.addTrauma(0.6);
    this.vibrate([40, 30, 80]);
    this.audio.setLayer('boss');
    this.audio.play('bossPhase');
    this.ring(e.x, e.y, 260, '#fff3dc', 0.4, 5);
    this.ring(e.x, e.y, 420, style.color, 0.6, 8);
    for (const other of this.enemies) {
      if (other === e || other.hp <= 0 || isLeader(other.type)) continue;
      const d = Math.hypot(other.x - e.x, other.y - e.y) || 1;
      if (d > 420) continue;
      // ~push px of travel once the knockback velocity has decayed.
      const push = 60 + (1 - d / 420) * 160;
      this.knock(
        other,
        ((other.x - e.x) / d) * push * 7,
        ((other.y - e.y) / d) * push * 7,
      );
      other.hit = 0.12;
    }
  }
  // Short, telegraphed strikes land with a thump when close to the house.
  hazardFired(h: Hazard) {
    if (h.blast) {
      this.debris(h.x, h.y, 14, 1.2);
      this.burst(h.x, h.y, h.color, 16);
      this.ring(h.x, h.y, h.radius + 18, h.color, 0.35, 5);
      this.addTrauma(
        Math.hypot(h.x - this.x, h.y - this.y) < 400 ? 0.3 : 0.1,
        0.6,
      );
      if (this.explosionCd <= 0) {
        this.audio.play('explosion', { volume: 0.7 });
        this.explosionCd = 0.15;
      }
      return;
    }
    if (h.duration > 0.5 || h.slow) return;
    const x = h.x2 === undefined ? h.x : (h.x + h.x2) / 2,
      y = h.y2 === undefined ? h.y : (h.y + h.y2) / 2;
    if (Math.hypot(x - this.x, y - this.y) > 650) return;
    this.addTrauma(h.x2 === undefined ? 0.16 : 0.12, 0.5);
    if (this.explosionCd <= 0) {
      this.audio.play('explosion', { volume: 0.5 });
      this.explosionCd = 0.15;
    }
  }
  enemyAttack(e: Enemy) {
    e.attack = 0.18;
    const over = this.overloaded(),
      fast = this.heat.projectileSpeed;
    const shot = (angle: number, speed: number, damage: number) =>
      this.bullets.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(angle) * speed * fast,
        vy: Math.sin(angle) * speed * fast,
        life: 6,
        damage,
        enemy: true,
        crit: false,
        age: 0,
        ...(over ? { over } : {}),
      });
    if (isLeader(e.type) && e.pendingBoss) {
      const pattern = e.pendingBoss;
      for (const s of pattern.shots) shot(s.angle, s.speed, s.damage);
      this.hazards.push(...pattern.hazards);
      for (const type of pattern.summons) this.spawn(type);
      e.timer = pattern.cooldown * this.heat.bossTime;
      if (pattern.stagger) e.staggerAt = this.elapsed + pattern.stagger;
      e.pendingBoss = undefined;
      return;
    }
    const def = ENEMY_DEFS[e.type];
    if (!def) return;
    e.timer = def.cooldown;
    // Tracked through the windup (see aimAt); frozen only for its last beat.
    const angle = e.lockedAim ?? e.aim;
    const zone = (
      kind: 'circle' | 'line',
      x: number,
      y: number,
      r: number,
      duration: number,
      arm = 0.8,
    ) =>
      this.hazards.push({
        x,
        y,
        radius: r,
        ...(kind === 'line'
          ? { x2: x + Math.cos(angle) * 650, y2: y + Math.sin(angle) * 650 }
          : {}),
        age: -arm,
        duration,
        damage: def.damage,
        color: def.color,
      });
    switch (def.behavior) {
      case 'mine':
        zone(
          'circle',
          e.targetX ?? this.x,
          e.targetY ?? this.y,
          38,
          3.4,
          ZONE_ARM,
        );
        break;
      case 'weld':
        this.hazards.push({
          x: e.x,
          y: e.y,
          x2: e.x + Math.cos(angle) * 255,
          y2: e.y + Math.sin(angle) * 255,
          radius: 22,
          age: -WELD_ARM,
          duration: 0.4,
          damage: def.damage,
          color: def.color,
        });
        break;
      case 'repair':
        for (const ally of this.enemies
          .filter(
            (ally) =>
              ally !== e &&
              !isLeader(ally.type) &&
              ally.type !== COURIER &&
              ally.hp > 0 &&
              ally.hp < ally.max &&
              Math.hypot(ally.x - e.x, ally.y - e.y) < 180,
          )
          .slice(0, 4)) {
          ally.hp = Math.min(ally.max, ally.hp + 10);
          this.burst(ally.x, ally.y, def.color, 3);
        }
        break;
      case 'strafe':
        for (const offset of [-0.14, 0.14])
          shot(angle + offset, def.projectileSpeed, def.damage);
        break;
      case 'volley':
        for (let i = -2; i <= 2; i++)
          shot(angle + i * 0.27, def.projectileSpeed, def.damage);
        break;
      case 'blink':
        this.burst(e.x, e.y, def.color, 8);
        e.x = e.targetX ?? e.x;
        e.y = e.targetY ?? e.y;
        this.burst(e.x, e.y, def.color, 8);
        {
          const goal = this.goalOf(e);
          shot(
            Math.atan2(goal.y - e.y, goal.x - e.x),
            def.projectileSpeed,
            def.damage,
          );
        }
        break;
      case 'cross':
        for (const a of [0, Math.PI / 2])
          this.hazards.push({
            x: (e.targetX ?? this.x) - Math.cos(a) * 240,
            y: (e.targetY ?? this.y) - Math.sin(a) * 240,
            x2: (e.targetX ?? this.x) + Math.cos(a) * 240,
            y2: (e.targetY ?? this.y) + Math.sin(a) * 240,
            radius: 15,
            age: -0.9,
            duration: 0.35,
            damage: def.damage,
            color: def.color,
          });
        break;
      case 'jam':
        this.hazards.push({
          x: e.x,
          y: e.y,
          radius: 120,
          age: -1,
          duration: 3,
          damage: def.damage,
          color: def.color,
          slow: 0.55,
        });
        break;
      case 'charge':
        e.chargeLeft = def.chargeDuration ?? 0.65;
        break;
      case 'fan':
        for (let i = -1; i <= 1; i++)
          shot(angle + i * 0.22, def.projectileSpeed, def.damage);
        break;
      case 'roots':
        zone(
          'circle',
          e.targetX ?? this.x,
          e.targetY ?? this.y,
          55,
          2.2,
          ZONE_ARM + 0.08,
        );
        break;
      case 'spit':
        shot(angle, def.projectileSpeed, def.damage);
        zone(
          'circle',
          e.targetX ?? this.x,
          e.targetY ?? this.y,
          42,
          2.5,
          ZONE_ARM,
        );
        break;
      case 'brood':
        this.spawn(def.summonType);
        break;
      case 'snipe':
        zone('line', e.x, e.y, 18, 0.3, 0.7);
        break;
      case 'pulse':
        zone('circle', e.x, e.y, def.range, 0.4);
        break;
    }
  }
  // The ch3 mirror agent: frontal mirrors like the shield bearer.
  mirrored(e: Enemy) {
    return (
      e.type === MINIBOSS_TYPE &&
      this.run.chapter === 2 &&
      this.minibossVariant === 1
    );
  }
  // Where an attack released in `windup` seconds should land: the house
  // now, or for leading enemies, where it will be when the shot or zone
  // arrives on its current course.
  aimAt(e: Enemy, def: CampaignEnemyDefinition, windup: number) {
    const goal = this.goalOf(e);
    if (!e.leads) return { x: goal.x, y: goal.y };
    const zone = ZONE_MARK[def.behavior] !== undefined,
      fixed =
        zone ||
        def.behavior === 'cross' ||
        def.behavior === 'snipe' ||
        def.behavior === 'weld',
      speed =
        def.behavior === 'charge'
          ? e.speed * (def.chargeMultiplier ?? 3)
          : def.projectileSpeed * this.heat.projectileSpeed,
      delay =
        windup +
        (zone
          ? ZONE_ARM
          : def.behavior === 'cross'
            ? 0.9
            : def.behavior === 'weld'
              ? WELD_ARM
              : 0) +
        (def.behavior === 'snipe' ? 0.35 : 0);
    let t = delay,
      x = goal.x,
      y = goal.y;
    for (let i = 0; i < 2; i++) {
      let dx = goal.vx * t,
        dy = goal.vy * t;
      const len = Math.hypot(dx, dy);
      if (len > LEAD_MAX) {
        dx *= LEAD_MAX / len;
        dy *= LEAD_MAX / len;
      }
      x = Math.max(55, Math.min(1545, goal.x + dx));
      y = Math.max(55, Math.min(945, goal.y + dy));
      if (fixed || speed <= 0) break;
      t = delay + Math.hypot(x - e.x, y - e.y) / speed;
    }
    return { x, y };
  }
  // Windup aim: follows the house (or its lead point) until AIM_LOCK.
  track(e: Enemy, def: CampaignEnemyDefinition, windup: number) {
    const p = this.aimAt(e, def, windup);
    e.targetX = p.x;
    e.targetY = p.y;
    e.lockedAim = Math.atan2(p.y - e.y, p.x - e.x);
  }
  // A heavy slam has landed: the leader reels and takes extra damage.
  staggerStart(e: Enemy) {
    e.stagger = STAGGER_TIME;
    e.hit = 0.12;
    this.label(e.x, e.y - e.r - 34, 'ВРАЗЛИВИЙ!', '#ffd166');
    this.ring(e.x, e.y, e.r * 2.4, '#ffd166', 0.45, 5);
    this.debris(e.x, e.y, 10, 0.9);
    this.addTrauma(0.25, 0.5);
    this.audio.play('eliteKill', { volume: 0.7 });
    this.onBeat?.({ kind: 'stagger', leader: this.leaderRef(e.type) });
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
  // Magnetic affix: player bullets inside the field curve toward it at an
  // unchanged speed.
  bend(b: Bullet, magnets: Enemy[], dt: number) {
    const speed = Math.hypot(b.vx, b.vy);
    let bent = false;
    for (const m of magnets) {
      const dx = m.x - b.x,
        dy = m.y - b.y,
        d = Math.hypot(dx, dy);
      if (d > MAGNET_RANGE || d < 1) continue;
      b.vx += (dx / d) * MAGNET_PULL * dt;
      b.vy += (dy / d) * MAGNET_PULL * dt;
      bent = true;
    }
    if (!bent) return;
    const now = Math.hypot(b.vx, b.vy) || 1;
    b.vx *= speed / now;
    b.vy *= speed / now;
  }
  // A rocket lands: a blast around it for everything that stood there, and
  // the rocket is spent.
  rocketBlast(b: Bullet, hit: Enemy, around: Enemy[]) {
    const r = b.blast ?? 0;
    this.ring(b.x, b.y, r, '#ff9f6e', 0.3, 4);
    this.burst(b.x, b.y, '#ffb36b', 14);
    this.addTrauma(0.1, 0.4);
    if (this.explosionCd <= 0) {
      this.audio.play('explosion', { volume: 0.5 });
      this.explosionCd = 0.18;
    }
    for (const other of around)
      if (
        other !== hit &&
        other.hp > 0 &&
        Math.hypot(other.x - b.x, other.y - b.y) < r + other.r
      )
        this.damage(other, b.damage * 0.7);
    this.abilityProps(
      (x, y) => Math.hypot(x - b.x, y - b.y) < r,
      b.damage * 0.7,
    );
    b.life = 0;
  }
  // Weapon cores (weapons.ts): every kind but the plain cannon.
  fireCore(
    weapon: string,
    x: number,
    y: number,
    e: Enemy,
    a: number,
    damage: number,
    crit: boolean,
    shots: number,
    over: boolean,
  ) {
    const evo = this.stats.evolution,
      pierce = this.pk('complaint'),
      bounce = this.pk('ricochet'),
      homing = this.pk('homing') > 0;
    const bullet = (
      angle: number,
      speed: number,
      life: number,
      kind: Bullet['kind'],
      extra: Partial<Bullet> = {},
    ) =>
      this.bullets.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        damage,
        enemy: false,
        crit,
        age: 0,
        kind,
        ...(over ? { over } : {}),
        ...(pierce ? { pierce } : {}),
        ...(bounce ? { bounce } : {}),
        ...(homing ? { homing } : {}),
        ...extra,
      });
    if (weapon === 'spread') {
      const n = (evo === 'laundry_buckshot' ? 7 : 5) + shots - 1;
      for (let i = 0; i < n; i++)
        bullet(a + (i / Math.max(1, n - 1) - 0.5) * 0.7, 520, 0.5, 'pellet');
    } else if (weapon === 'rail') {
      if (evo === 'gauss') crit = true;
      for (let i = 0; i < shots; i++)
        bullet(a + (i - (shots - 1) / 2) * 0.08, 1500, 0.45, 'rail', {
          pierce: 99,
          crit,
          damage: crit && evo === 'gauss' ? damage * 1.8 : damage,
        });
    } else if (weapon === 'coins') {
      for (let i = 0; i < shots; i++)
        bullet(a + (i - (shots - 1) / 2) * 0.12, 560, 1.2, 'coin', {
          bounce: bounce + (evo === 'jackpot' ? 4 : 3),
          damage: damage * (evo === 'jackpot' ? 1.25 : 1),
        });
    } else if (weapon === 'rocket') {
      const n = (evo === 'magnet_swarm' ? 2 : 1) + shots - 1;
      for (let i = 0; i < n; i++)
        bullet(a + (i - (n - 1) / 2) * 0.32, 300, 1.9, 'rocket', {
          homing: true,
          blast: 85,
        });
    } else if (weapon === 'flame') {
      const n = 3 + shots - 1;
      for (let i = 0; i < n; i++)
        bullet(
          a + (this.fx() - 0.5) * 0.6,
          360 + this.fx() * 60,
          0.38,
          'flame',
          {
            pierce: pierce + 1,
          },
        );
    } else if (weapon === 'mortar') {
      // The densest spot among enemies in range.
      let best = e,
        most = -1;
      for (const c of this.enemies) {
        if (c.hp <= 0 || Math.hypot(c.x - x, c.y - y) > this.stats.range)
          continue;
        let n = 0;
        for (const o of this.enemies)
          if (o.hp > 0 && Math.hypot(o.x - c.x, o.y - c.y) < 95) n++;
        if (n > most) {
          most = n;
          best = c;
        }
      }
      for (let i = 0; i < shots; i++)
        this.shells.push({
          sx: x,
          sy: y,
          tx: best.x + (i ? (this.fx() - 0.5) * 90 : 0),
          ty: best.y + (i ? (this.fx() - 0.5) * 90 : 0),
          t: 0,
          T: 0.55,
          damage,
          crit,
          radius: 95,
          cluster: evo === 'cluster',
        });
    } else if (weapon === 'arc') {
      const jumps = (evo === 'storm' ? 6 : 3) + this.stats.chain;
      const pts = [x, y];
      const struck: Enemy[] = [];
      let cur: Enemy | null = e,
        dmg = damage;
      for (let j = 0; cur && j <= jumps; j++) {
        struck.push(cur);
        pts.push(cur.x, cur.y);
        this.damage(cur, dmg, crit);
        this.perkHit(cur, { damage: dmg, crit } as Bullet);
        dmg *= 0.8;
        const from: Enemy = cur;
        cur = null;
        let d = 170;
        for (const o of this.enemies) {
          if (o.hp <= 0 || struck.includes(o)) continue;
          const od = Math.hypot(o.x - from.x, o.y - from.y);
          if (od < d) {
            d = od;
            cur = o;
          }
        }
        if (this.ended) break;
      }
      this.arcs.push({ pts, life: 0.14 });
    }
  }
  // Mortar shells land, explode, and (evolved) scatter bomblets.
  updateShells(dt: number) {
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
    if (!this.shells.length) return;
    const landed: Shell[] = [];
    for (const sh of this.shells) {
      sh.t += dt;
      if (sh.t >= sh.T) landed.push(sh);
    }
    this.shells = this.shells.filter((sh) => sh.t < sh.T);
    for (const sh of landed) {
      this.ring(sh.tx, sh.ty, sh.radius, '#ffb36b', 0.3, 5);
      this.burst(sh.tx, sh.ty, '#ffb36b', 14);
      this.debris(sh.tx, sh.ty, 6, 0.8);
      this.addTrauma(0.12, 0.45);
      if (this.explosionCd <= 0) {
        this.audio.play('explosion', { volume: 0.5 });
        this.explosionCd = 0.12;
      }
      for (const e of this.enemies.slice()) {
        if (e.hp <= 0 || Math.hypot(e.x - sh.tx, e.y - sh.ty) > sh.radius + e.r)
          continue;
        this.damage(e, sh.damage, sh.crit);
        this.perkHit(e, { damage: sh.damage, crit: sh.crit } as Bullet);
        if (this.ended) return;
      }
      for (const p of this.explosives)
        if (!p.blown && Math.hypot(p.x - sh.tx, p.y - sh.ty) < sh.radius)
          this.hitProp(p, sh.damage);
      if (sh.cluster)
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + this.fx();
          this.shells.push({
            sx: sh.tx,
            sy: sh.ty,
            tx: sh.tx + Math.cos(a) * 70,
            ty: sh.ty + Math.sin(a) * 70,
            t: 0,
            T: 0.3,
            damage: sh.damage * 0.45,
            crit: false,
            radius: 55,
            cluster: false,
          });
        }
    }
  }
  // Статика, спори, холодний душ: statuses from one player hit.
  perkHit(e: Enemy, b: Bullet) {
    if (b.kind === 'flame' && e.hp > 0) {
      e.burn = Math.max(e.burn ?? 0, 1.5);
      e.burnDps = Math.max(
        e.burnDps ?? 0,
        b.damage * (this.stats.evolution === 'spore_blaze' ? 1 : 0.5),
      );
    }
    if (
      b.kind === 'pellet' &&
      this.stats.evolution === 'laundry_buckshot' &&
      e.hp > 0 &&
      !isLeader(e.type)
    ) {
      const d = Math.hypot(b.vx, b.vy) || 1;
      this.knock(e, (b.vx / d) * 160, (b.vy / d) * 160);
    }
    const spores = this.pk('spores');
    if (spores && e.hp > 0) {
      e.burn = 2;
      e.burnDps = Math.max(e.burnDps ?? 0, b.damage * 0.22 * spores);
    }
    if (this.pk('cold_shower') && e.hp > 0) e.slow = 1.2;
    if (b.crit && !b.shard && this.pk('static')) {
      const near = this.enemies
        .filter(
          (n) => n !== e && n.hp > 0 && Math.hypot(n.x - e.x, n.y - e.y) < 180,
        )
        .slice(0, 2);
      for (const n of near) {
        this.damage(n, b.damage * 0.5);
        for (let j = 0; j < 6; j++)
          this.particles.push({
            x: e.x + ((n.x - e.x) * j) / 6,
            y: e.y + ((n.y - e.y) * j) / 6,
            vx: 0,
            vy: 0,
            life: 0.15,
            max: 0.15,
            color: '#b6e3ff',
            size: 3,
          });
      }
    }
  }
  // Скарга № 311 passes through; Рикошет jumps to a fresh target.
  passOn(b: Bullet, e: Enemy) {
    const hit = (b.hitSet ??= []);
    hit.push(e);
    if (b.pierce && b.pierce > 0) {
      b.pierce--;
      return;
    }
    if (b.bounce && b.bounce > 0) {
      let best: Enemy | null = null,
        bestD = 280;
      for (const n of this.enemies) {
        if (n.hp <= 0 || hit.includes(n)) continue;
        const d = Math.hypot(n.x - e.x, n.y - e.y);
        if (d < bestD) {
          best = n;
          bestD = d;
        }
      }
      if (best) {
        b.bounce--;
        const a = Math.atan2(best.y - e.y, best.x - e.x),
          speed = Math.hypot(b.vx, b.vy);
        b.x = e.x;
        b.y = e.y;
        b.vx = Math.cos(a) * speed;
        b.vy = Math.sin(a) * speed;
        b.life = Math.max(b.life, 0.7);
        return;
      }
    }
    b.life = 0;
  }
  // Самонаведення: turns up to 5 rad/s toward the nearest enemy.
  steer(b: Bullet, dt: number) {
    const e = this.nearest(b.x, b.y, 240);
    if (!e || b.hitSet?.includes(e)) return;
    const want = Math.atan2(e.y - b.y, e.x - b.x),
      have = Math.atan2(b.vy, b.vx),
      speed = Math.hypot(b.vx, b.vy);
    let turn = want - have;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const a = have + Math.max(-5 * dt, Math.min(5 * dt, turn));
    b.vx = Math.cos(a) * speed;
    b.vy = Math.sin(a) * speed;
  }
  // Електроривок: a discharge around the house at the end of a dash.
  shock() {
    const level = this.pk('shock_dash');
    this.ring(this.x, this.y - 14, 130, '#86c9ff', 0.3, 5);
    this.burst(this.x, this.y, '#86c9ff', 18);
    this.audio.play('explosion', { volume: 0.35 });
    for (const e of this.enemies.slice())
      if (e.hp > 0 && Math.hypot(e.x - this.x, e.y - this.y) < 130 + e.r)
        this.damage(e, this.stats.damage * 1.6 * level);
  }
  // Слід пального: burning strips left by dashes; also ticks perk statuses.
  updatePerks(dt: number) {
    this.dashKill = Math.max(0, this.dashKill - dt);
    if (this.shockAt > 0) {
      this.shockAt -= dt;
      if (this.shockAt <= 0) this.shock();
    }
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      if (e.slow) e.slow = Math.max(0, e.slow - dt);
      if (e.burn) {
        e.burn = Math.max(0, e.burn - dt);
        this.damage(e, (e.burnDps ?? 0) * dt, false, undefined, true);
        if (!e.burn) e.burnDps = 0;
      }
    }
    if (this.dashing > 0 && this.pk('fire_trail')) {
      this.trailGap -= dt;
      if (this.trailGap <= 0) {
        this.trails.push({ x: this.x, y: this.y + 8, life: 2 });
        this.trailGap = 0.035;
      }
    }
    if (!this.trails.length) return;
    for (const t of this.trails) t.life -= dt;
    this.trails = this.trails.filter((t) => t.life > 0);
    const dps = this.stats.damage * 1.1 * this.pk('fire_trail');
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      if (
        this.trails.some((t) => Math.hypot(t.x - e.x, t.y - e.y) < 26 + e.r)
      ) {
        this.damage(e, dps * dt, false, undefined, true);
        e.burn = Math.max(e.burn ?? 0, 0.6);
        e.burnDps = Math.max(e.burnDps ?? 0, dps * 0.3);
      }
    }
  }
  shoot(
    x: number,
    y: number,
    e: Enemy,
    drone = false,
    replay?: { damage: number; crit: boolean; shots: number },
    power = 1,
  ) {
    const a = Math.atan2(e.y - y, e.x - x);
    const shots = replay?.shots ?? (drone ? 1 : this.stats.shots);
    let crit = replay?.crit ?? this.rng() < this.stats.crit;
    // Ритм: every fourth main volley is a sure crit.
    if (!drone && !replay && this.pk('rhythm'))
      if (++this.volleys % 4 === 0) crit = true;
    let damage =
      this.stats.damage *
      (1 + Math.min(0.6, (this.run.level - 1) * 0.04)) *
      (crit ? 1.8 : 1) *
      (drone ? 0.45 * power : 1);
    if (
      !drone &&
      !replay &&
      activeEquipment(this.run).some((item) => item.id === 'coinshot') &&
      this.run.coins > 0
    ) {
      this.run.coins--;
      damage *= 3;
    }
    if (!drone && !replay) {
      if (this.dashCharged) {
        damage *= 1.6;
        this.dashCharged = false;
      }
      if (this.specials.lastStand && this.run.hp < this.stats.health * 0.35)
        damage *= 1.3;
    }
    // Відсотки: +1 damage per 10 coins in the till, up to +10.
    if (!replay && this.pk('interest'))
      damage += Math.min(10, Math.floor(this.run.coins / 10));
    if (!drone && !replay) damage *= WEAPONS[this.stats.weapon].damage;
    if (replay) damage = replay.damage;
    const over = this.overloaded();
    const weapon = drone ? 'cannon' : this.stats.weapon;
    if (weapon !== 'cannon') {
      this.fireCore(weapon, x, y, e, a, damage, crit, shots, over);
      if (!drone) {
        this.audio.play('shoot');
        this.muzzle = MUZZLE;
        this.muzzleAngle = a;
      }
      return { damage, crit, shots };
    }
    const pierce = drone ? 0 : this.pk('complaint'),
      bounce = drone ? 0 : this.pk('ricochet'),
      homing = this.pk('homing') > 0;
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
        age: 0,
        ...(over ? { over } : {}),
        ...(pierce ? { pierce } : {}),
        ...(bounce ? { bounce } : {}),
        ...(homing ? { homing } : {}),
      });
    }
    if (!drone) {
      this.audio.play('shoot');
      this.muzzle = MUZZLE;
      this.muzzleAngle = a;
    }
    return { damage, crit, shots };
  }
  finish(won: boolean) {
    if (this.ended) return;
    this.ended = true;
    if (this.event && this.event.state !== 'won') this.event.state = 'lost';
    this.run.time += this.elapsed;
    this.audio.play(won ? 'win' : 'lose');
    const result: BattleResult = {
      run: { ...this.run },
      won,
      boss: this.run.kind === 'boss',
    };
    // Headless runs (tests) report at once; a live battle plays an outro.
    if (!this.running) {
      this.onEnd(result);
      return;
    }
    // Final HUD frame (empty boss bar, 0 hp) stays up during the outro.
    this.pushHud();
    const destroyed = !won && this.run.hp <= 0;
    if (destroyed) {
      this.burst(this.x, this.y - 14, '#f1be69', 24);
      for (const color of ['#3a505d', '#a17f54', '#91a9af'])
        for (let i = 0; i < 8; i++) {
          const a = this.fx() * Math.PI * 2,
            v = 90 + this.fx() * 220;
          this.particles.push({
            x: this.x,
            y: this.y - 14,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 60,
            life: 0.7 + this.fx() * 0.4,
            max: 1.1,
            color,
            size: 4 + this.fx() * 5,
            shape: 'shard',
            rot: this.fx() * 6,
            spin: (this.fx() - 0.5) * 14,
            drag: 2.2,
            gravity: 380,
          });
        }
      this.ring(this.x, this.y - 14, 220, '#ff8e82', 0.6, 6);
      this.addTrauma(0.9);
      this.hurtFlash = 1;
      this.slow(0.9, 0.3);
      this.vibrate([90, 50, 180]);
    } else if (won) this.clearField();
    this.pendingEnd = result;
    this.outro = destroyed
      ? OUTRO.lose
      : won && this.run.kind !== 'boss' && this.run.kind !== 'miniboss'
        ? OUTRO.win
        : won
          ? OUTRO.leader
          : OUTRO.lose * 0.6;
  }
  // Victory sweep for the outro only; runs after the result is captured.
  clearField() {
    let shown = 0;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      this.defeated.push({ ...e, life: 0.48 });
      e.hp = 0;
      if (shown++ < 24) this.debris(e.x, e.y, 5, 0.8);
    }
    this.enemies = [];
    this.hazards = [];
    for (const b of this.bullets)
      if (b.enemy && b.life > 0) {
        b.life = 0;
        if (shown++ < 60) this.burst(b.x, b.y, '#dfe9e6', 2);
      }
  }
  overloaded() {
    return this.event?.id === 'overload' && this.event.state === 'live';
  }
  // Explosive props: player bullets and the pulse wear them down.
  hitProp(p: ArenaProp, amount: number) {
    if (p.blown || this.ended) return;
    p.hp -= amount;
    p.hit = 0.1;
    if (p.hp <= 0) this.blowProp(p);
  }
  // Instant blast that hurts enemies only; nearby explosives catch a fuse.
  blowProp(p: ArenaProp) {
    if (p.blown) return;
    p.blown = true;
    p.hp = p.fuse = 0;
    const { x, y } = propTarget(p),
      theme = Math.min(2, Math.max(0, this.run.chapter)),
      color = this.settings.colorblind ? '#5fe0ff' : PROP_CHARGE[theme],
      amount = BLAST_DAMAGE[theme] + this.stats.damage * 3;
    this.ring(x, y, BLAST_RADIUS * 0.6, '#fff3dc', 0.25, 7);
    this.ring(x, y, BLAST_RADIUS * 1.15, color, 0.5, 5);
    this.burst(x, y, color, 24);
    this.burst(x, y, '#fff3dc', 10);
    this.debris(x, y, 18, 1.4);
    this.addTrauma(0.5, 0.75);
    this.vibrate(35);
    this.audio.play('explosion');
    this.explosionCd = 0.15;
    // Snapshot, as in pulse(): halves spawned by the blast sit it out.
    for (const e of this.enemies.slice()) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > BLAST_RADIUS + e.r) continue;
      if (!isLeader(e.type))
        this.knock(
          e,
          ((e.x - x) / (d || 1)) * 520,
          ((e.y - y) / (d || 1)) * 520,
        );
      this.damage(e, amount);
      if (this.ended) return;
    }
    for (const other of this.explosives)
      if (
        !other.blown &&
        other.fuse <= 0 &&
        Math.hypot(other.x - p.x, other.y - p.y) < BLAST_RADIUS * 1.35
      )
        other.fuse = 0.22;
  }
  // Fuses and hit flashes; true when a chain blast ended the battle.
  updateProps(dt: number) {
    for (const p of this.explosives) {
      if (p.blown) continue;
      p.hit = Math.max(0, p.hit - dt);
      if (p.fuse > 0) {
        p.fuse -= dt;
        if (p.fuse <= 0) this.blowProp(p);
        if (this.ended) return true;
      }
    }
    return false;
  }
  updateEvent(dt: number) {
    const ev = this.event;
    if (!ev || ev.state === 'won' || ev.state === 'lost') return;
    if (ev.state === 'wait') {
      if (
        this.elapsed >= ev.at ||
        (this.encounter && this.squadKills >= ev.kills)
      )
        this.startEvent(ev);
      return;
    }
    const color = EVENT_COLOR[ev.id],
      chapter = Math.min(2, this.run.chapter);
    if (ev.id === 'alarm') {
      if (ev.wave.some((e) => e.hp > 0)) return;
      const bonus = 10 + chapter * 5;
      this.run.coins += bonus;
      this.label(this.x, this.y - 70, `+${bonus}`, '#eeb657');
      this.eventWon(ev, 'ХВИЛЮ ВІДБИТО', `+${bonus} монет за тишу в дворі`);
    } else if (ev.id === 'courier') {
      ev.left -= dt;
      const courier = ev.courier;
      if (!courier || courier.hp <= 0 || ev.left > 0) return;
      // Out of time: it slips away with the parcel.
      courier.hp = 0;
      this.burst(courier.x, courier.y, color, 18);
      this.ring(courier.x, courier.y, 60, color, 0.35, 3);
      ev.state = 'lost';
      ev.courier = null;
      this.banner('КУР’ЄР УТІК', 'Посилку не перехоплено', '#b9c7c9', 1.4);
    } else {
      ev.left -= dt;
      ev.zap -= dt;
      if (ev.zap <= 0 && ev.left > 0.6) {
        ev.zap = 1.1 + this.rng() * 0.6;
        const a = this.rng() * Math.PI * 2,
          r = 40 + this.rng() * 160;
        this.hazards.push({
          x: Math.max(55, Math.min(1545, this.x + Math.cos(a) * r)),
          y: Math.max(55, Math.min(945, this.y + Math.sin(a) * r)),
          radius: 46,
          age: -0.9,
          duration: 0.25,
          damage: 6 + chapter * 3,
          color,
        });
      }
      if (ev.left <= 0)
        this.eventWon(ev, 'МЕРЕЖА СТАБІЛЬНА', 'Перевантаження минуло');
    }
  }
  startEvent(ev: BattleEvent) {
    const info = BATTLE_EVENTS.find((b) => b.id === ev.id);
    ev.state = 'live';
    if (info)
      this.banner(info.title.toUpperCase(), info.text, EVENT_COLOR[ev.id], 3);
    this.audio.play('bossPhase', { volume: 0.6 });
    this.vibrate([30, 40, 30]);
    this.onBeat?.({ kind: 'event', event: ev.id });
    if (ev.id === 'alarm') {
      const count = 4 + Math.floor(this.rng() * 3);
      for (let i = 0; i < count; i++) {
        const affix =
          ELITE_AFFIXES[Math.floor(this.rng() * ELITE_AFFIXES.length)].id;
        const e = this.spawn(undefined, { affix, force: true });
        if (!e) continue;
        e.wave = true;
        ev.wave.push(e);
      }
      if (!ev.wave.length) ev.state = 'lost';
    } else if (ev.id === 'courier') {
      ev.left = COURIER_TIME;
      ev.courier = this.spawnCourier();
    } else {
      ev.left = OVERLOAD_TIME;
      ev.zap = 1;
    }
  }
  eventWon(ev: BattleEvent, title: string, text: string) {
    ev.state = 'won';
    this.run.eventsCompleted = (this.run.eventsCompleted ?? 0) + 1;
    this.banner(title, text, EVENT_COLOR[ev.id], 1.8);
    this.audio.play('achievement');
  }
  spawnCourier(): Enemy {
    const a = this.rng() * Math.PI * 2,
      hp = (70 + Math.min(2, this.run.chapter) * 55) * this.heat.enemyHealth;
    const courier: Enemy = {
      x: Math.max(80, Math.min(1520, this.x + Math.cos(a) * 340)),
      y: Math.max(80, Math.min(920, this.y + Math.sin(a) * 260)),
      hp,
      max: hp,
      r: 17,
      type: COURIER,
      speed: 140 * this.heat.enemySpeed,
      hit: 0,
      timer: 0,
      phase: 0,
      walk: 0,
      facing: 1,
      aim: 0,
      attack: 0,
      visualSeed: this.spawnCount++,
      pattern: 0,
    };
    this.enemies.push(courier);
    this.ring(courier.x, courier.y, 70, EVENT_COLOR.courier, 0.4, 3);
    return courier;
  }
  // Runs from the house, weaving; walls turn it back, so corners trap it.
  flee(e: Enemy, dt: number) {
    const dx = e.x - this.x,
      dy = e.y - this.y,
      d = Math.hypot(dx, dy) || 1;
    const weave = Math.sin(this.elapsed * 2.3 + e.visualSeed) * 0.6;
    let fx = dx / d - (dy / d) * weave,
      fy = dy / d + (dx / d) * weave;
    if (e.x < 170) fx += (170 - e.x) / 60;
    else if (e.x > 1430) fx -= (e.x - 1430) / 60;
    if (e.y < 150) fy += (150 - e.y) / 60;
    else if (e.y > 850) fy -= (e.y - 850) / 60;
    const len = Math.hypot(fx, fy) || 1,
      speed = e.speed * (d < 260 ? 1.2 : d > 620 ? 0.45 : 0.9);
    e.x = Math.max(40, Math.min(1560, e.x + (fx / len) * speed * dt));
    e.y = Math.max(40, Math.min(960, e.y + (fy / len) * speed * dt));
    e.walk += (dt * speed) / 12;
    if (Math.abs(fx) > 0.1) e.facing = fx < 0 ? -1 : 1;
  }
  // Orbit blades wear down whatever they sweep through.
  orbitHit(e: Enemy, dt: number) {
    for (let i = 0; i < this.stats.orbit; i++) {
      const a = this.elapsed * 2 + (i * Math.PI * 2) / this.stats.orbit;
      const ox = this.x + Math.cos(a) * 105,
        oy = this.y + Math.sin(a) * 85;
      if (Math.hypot(ox - e.x, oy - e.y) < e.r + 14)
        this.damage(e, this.stats.damage * 2 * dt);
    }
  }
  // The parcel bursts open: coins, crystals and a repair kit.
  courierCaught(e: Enemy) {
    const ev = this.event,
      chapter = Math.min(2, this.run.chapter),
      coins = 5,
      each = 2 + chapter;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2,
        r = 14 + (i % 3) * 9;
      this.drops.push({
        x: e.x + Math.cos(a) * r,
        y: e.y + Math.sin(a) * r,
        kind: i < coins ? 'coin' : 'xp',
        value: i < coins ? each : 3,
      });
    }
    this.drops.push({
      x: e.x,
      y: e.y - 12,
      kind: 'heal',
      value: 20 + chapter * 6,
    });
    this.burst(e.x, e.y, EVENT_COLOR.courier, 26);
    this.ring(e.x, e.y, 90, EVENT_COLOR.courier, 0.45, 5);
    this.debris(e.x, e.y, 12);
    this.addTrauma(0.2, 0.4);
    this.audio.play('eliteKill');
    if (ev?.id === 'courier' && ev.state === 'live') {
      ev.courier = null;
      this.eventWon(
        ev,
        'ПОСИЛКУ ПЕРЕХОПЛЕНО',
        `+${coins * each} монет, досвід і ремкомплект`,
      );
    }
  }
  // Pushes a body out of every solid prop. Returns the contact normal of the
  // last prop it touched, if any.
  pushOutOfSolids(body: { x: number; y: number }, radius: number) {
    let touched: { nx: number; ny: number } | null = null;
    for (const c of this.solids) {
      const dx = body.x - c.x,
        dy = body.y - c.y,
        d = Math.hypot(dx, dy),
        reach = c.r + radius;
      if (d >= reach) continue;
      const nx = d > 1e-3 ? dx / d : 1,
        ny = d > 1e-3 ? dy / d : 0;
      body.x = c.x + nx * reach;
      body.y = c.y + ny * reach;
      touched = { nx, ny };
    }
    return touched;
  }
  // Walking enemies (the ones that moved this frame) slide round solid props
  // towards the house instead of pressing into them.
  collideSolids(dt: number) {
    if (!this.solids.length) return;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const moved = e.lx !== undefined && (e.x !== e.lx || e.y !== e.ly);
      if (moved && e.type !== COURIER) {
        const touched = this.pushOutOfSolids(e, e.r * 0.7);
        if (touched) {
          const side =
            -touched.ny * (this.x - e.x) + touched.nx * (this.y - e.y) >= 0
              ? 1
              : -1;
          e.x += -touched.ny * side * e.speed * dt * 0.6;
          e.y += touched.nx * side * e.speed * dt * 0.6;
        }
      }
      e.lx = e.x;
      e.ly = e.y;
    }
  }
  // Smoothed walking velocity for enemies that aim ahead; a dash does not
  // fling the estimate past walking speed.
  trackVelocity(fromX: number, fromY: number, dt: number) {
    if (dt <= 0) return;
    let vx = (this.x - fromX) / dt,
      vy = (this.y - fromY) / dt;
    const speed = Math.hypot(vx, vy),
      cap = this.stats.speed * (this.hasteTime > 0 ? EXPRESS.haste : 1);
    if (speed > cap) {
      vx *= cap / speed;
      vy *= cap / speed;
    }
    const k = 1 - Math.exp(-dt * 8);
    this.vx += (vx - this.vx) * k;
    this.vy += (vy - this.vy) * k;
  }
  update(dt: number) {
    if (this.ended || this.paused) return;
    this.elapsed += dt;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.pulseCd = Math.max(0, this.pulseCd - dt);
    this.auditTime = Math.max(0, this.auditTime - dt);
    this.hasteTime = Math.max(0, this.hasteTime - dt);
    this.invincible -= dt;
    this.dashing -= dt;
    this.pulseRing = Math.max(0, this.pulseRing - dt);
    this.explosionCd -= dt;
    this.pickupGap -= dt;
    if (this.combo) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.updateProps(dt)) return;
    // Alone, WASD and the arrows both drive the house; with a partner the
    // arrows belong to them.
    const net = this.sync?.cur;
    const move = net
      ? { x: 0, y: 0 }
      : keyVector(this.keys, this.ally ? P1_KEYS : SOLO_KEYS);
    let dx = net ? net[0].x : this.stick.x + this.pad.x + move.x;
    let dy = net ? net[0].y : this.stick.y + this.pad.y + move.y;
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
    const slow =
      this.dashing > 0
        ? 1
        : this.hazards.reduce(
            (speed, hazard) =>
              hazard.slow && hazardContains(hazard, this.x, this.y)
                ? Math.min(speed, hazard.slow)
                : speed,
            1,
          );
    const fromX = this.x,
      fromY = this.y,
      haste = this.hasteTime > 0 ? EXPRESS.haste : 1;
    this.x = Math.max(
      55,
      Math.min(1545, this.x + dx * this.stats.speed * slow * haste * dt),
    );
    this.y = Math.max(
      55,
      Math.min(945, this.y + dy * this.stats.speed * slow * haste * dt),
    );
    if (this.pushOutOfSolids(this, 24)) {
      this.x = Math.max(55, Math.min(1545, this.x));
      this.y = Math.max(55, Math.min(945, this.y));
    }
    this.trackVelocity(fromX, fromY, dt);
    this.updateAlly(dt);
    this.run.hp = Math.min(
      this.stats.health,
      this.run.hp + this.stats.regen * dt,
    );
    const home = this.stats.housing;
    this.housingHealTimer -= dt;
    this.housingStrainTimer -= dt;
    this.housingDefenseTimer -= dt;
    if (this.housingHealTimer <= 0) {
      this.housingHealTimer += 12;
      if (home.medicine) {
        const healed = Math.min(home.medicine, this.stats.health - this.run.hp);
        this.run.hp += healed;
        if (healed > 0)
          this.label(
            this.x,
            this.y - 60,
            `Аптека +${Math.round(healed)}`,
            '#96d5b5',
          );
      }
    }
    if (this.housingStrainTimer <= 0) {
      this.housingStrainTimer += 10;
      if (home.strain) {
        this.run.hp = Math.max(1, this.run.hp - home.strain);
        this.label(this.x, this.y - 60, `Витік −${home.strain}`, '#ffae84');
      }
    }
    if (this.housingDefenseTimer <= 0) {
      this.housingDefenseTimer += 20;
      if (home.defense) {
        this.pulseRing = 0.55;
        this.label(this.x, this.y - 65, 'Спільна оборона', '#96d5b5');
        for (const enemy of this.enemies)
          if (Math.hypot(enemy.x - this.x, enemy.y - this.y) <= 220)
            this.damage(enemy, home.defense);
        if (this.ended) return;
      }
    }
    this.spawnTimer -= dt;
    const leaderFight =
      this.run.kind === 'boss' || this.run.kind === 'miniboss';
    if (leaderFight && !this.bossSpawned) {
      const kind = this.run.kind === 'miniboss' ? MINIBOSS_TYPE : 99;
      // With a partner there is a leader for each of the two, on opposite
      // sides of the yard.
      const first = this.spawn(kind);
      if (first && this.ally)
        for (let i = 1; i < COOP.leaders; i++)
          this.spawn(kind, {
            x: Math.max(50, Math.min(1550, 1600 - first.x)),
            y: Math.max(50, Math.min(950, 1000 - first.y)),
            force: true,
          });
      this.bossSpawned = true;
    }
    if (!leaderFight) this.updateSquad();
    else if (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer =
        (this.run.kind === 'miniboss' ? 8 : 6 - this.run.chapter * 0.5) /
        this.heat.spawnRate;
    }
    this.updateEvent(dt);
    const over = this.overloaded();
    this.shotTimer -= dt;
    if (this.shotTimer <= 0) {
      // The fleeing courier is the priority target while in range.
      const courier = this.event?.courier;
      const enemy =
        courier &&
        courier.hp > 0 &&
        Math.hypot(courier.x - this.x, courier.y - this.y) < this.stats.range
          ? courier
          : this.nearest(this.x, this.y, this.stats.range);
      if (enemy) {
        const volley = this.shoot(this.x, this.y + TURRET_Y, enemy);
        this.housingVolley++;
        if (home.echo && this.housingVolley % 4 === 0) {
          this.shoot(this.x, this.y + TURRET_Y, enemy, false, volley);
          this.label(this.x, this.y - 60, 'Відлуння', '#cfb4f1');
        }
        this.shotTimer = 1 / (this.stats.rate * (over ? 2 : 1));
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
      e.attack = Math.max(0, e.attack - dt);
      const kx = e.knockX ?? 0,
        ky = e.knockY ?? 0;
      if (kx || ky) {
        e.x = Math.max(40, Math.min(1560, e.x + kx * dt));
        e.y = Math.max(40, Math.min(960, e.y + ky * dt));
        const fade = Math.exp(-7 * dt);
        e.knockX = Math.abs(kx * fade) < 4 ? 0 : kx * fade;
        e.knockY = Math.abs(ky * fade) < 4 ? 0 : ky * fade;
      }
      if (e.type === COURIER) {
        // It never touches the house, but the orbit blades still cut it.
        this.flee(e, dt);
        this.orbitHit(e, dt);
        continue;
      }
      if (e.affix === 'swift') {
        e.trailAt = (e.trailAt ?? 0) - dt;
        if (e.trailAt <= 0) {
          e.trailAt = 0.055;
          e.trail = [e.x, e.y, ...(e.trail ?? [])].slice(0, 8);
        }
      } else if (e.affix === 'medic')
        // Heals the others around it, never itself (as with 'repair').
        for (const ally of this.enemies)
          if (
            ally !== e &&
            ally.hp > 0 &&
            ally.hp < ally.max &&
            ally.type !== COURIER &&
            !isLeader(ally.type) &&
            Math.hypot(ally.x - e.x, ally.y - e.y) < MEDIC_RANGE
          )
            ally.hp = Math.min(ally.max, ally.hp + ally.max * MEDIC_HEAL * dt);
      const goal = this.goalOf(e);
      const dist = Math.hypot(goal.x - e.x, goal.y - e.y) || 1;
      const ex = (goal.x - e.x) / dist,
        ey = (goal.y - e.y) / dist;
      if (Math.abs(ex) > 0.08) e.facing = ex < 0 ? -1 : 1;
      const leader = isLeader(e.type);
      const def = leader ? null : ENEMY_DEFS[e.type];
      // Shields turn slowly, so going round them bares their flank.
      const turn =
        def?.behavior === 'shield'
          ? SHIELD_TURN
          : this.mirrored(e)
            ? SHIELD_TURN * 0.8
            : 0;
      if (turn) {
        const diff = Math.atan2(ey, ex) - e.aim,
          wrapped = Math.atan2(Math.sin(diff), Math.cos(diff)),
          step = turn * dt;
        e.aim += Math.max(-step, Math.min(step, wrapped));
      } else e.aim = Math.atan2(ey, ex);
      if (leader) {
        const phase = e.hp < e.max * 0.5 ? 1 : 0;
        if (phase > e.phase) this.phaseShift(e);
        e.phase = phase;
        if (e.staggerAt !== undefined && this.elapsed >= e.staggerAt) {
          e.staggerAt = undefined;
          this.staggerStart(e);
        }
      }
      // A staggered leader stands still and holds its next attack.
      const stunned = (e.stagger ?? 0) > 0;
      if (stunned) e.stagger = Math.max(0, e.stagger! - dt);
      // Overload also speeds up regular enemies' weapons.
      else e.timer -= over && !leader ? dt * 1.6 : dt;
      if ((e.windup ?? 0) > 0) {
        e.windup = Math.max(0, e.windup! - dt);
        if (def && e.windup > AIM_LOCK && TRACKING.includes(def.behavior))
          this.track(e, def, e.windup);
        e.aim = e.lockedAim ?? e.aim;
        if (e.windup === 0) this.enemyAttack(e);
      } else if (
        !stunned &&
        e.timer <= 0 &&
        this.elapsed >= this.calm &&
        (leader ||
          (def &&
            !['chase', 'shield', 'burst'].includes(def.behavior) &&
            dist <= def.range))
      ) {
        e.lockedAim = e.aim;
        e.targetX = goal.x;
        e.targetY = goal.y;
        if (def?.behavior === 'blink') {
          e.targetX = Math.max(
            55,
            Math.min(1545, goal.x + Math.cos(e.aim + Math.PI / 2) * 145),
          );
          e.targetY = Math.max(
            55,
            Math.min(945, goal.y + Math.sin(e.aim + Math.PI / 2) * 145),
          );
        }
        e.windup = leader ? 0.9 : def!.windup;
        if (def && TRACKING.includes(def.behavior))
          this.track(e, def, e.windup);
        if (leader) {
          e.pendingBoss =
            e.type === MINIBOSS_TYPE
              ? minibossPattern(
                  this.run.chapter,
                  e.phase,
                  e.pattern++,
                  e.x,
                  e.y,
                  goal.x,
                  goal.y,
                  this.minibossVariant,
                )
              : campaignBossPattern(
                  this.run.chapter,
                  this.run.bossVariants[this.run.chapter],
                  e.phase,
                  e.pattern++,
                  e.x,
                  e.y,
                  goal.x,
                  goal.y,
                  goal.vx,
                  goal.vy,
                );
          this.bossAttack = e.pendingBoss.name;
        }
      }
      const charging = (e.chargeLeft ?? 0) > 0;
      if (charging) {
        e.chargeLeft = Math.max(0, e.chargeLeft! - dt);
        e.aim = e.lockedAim ?? e.aim;
      }
      const moving =
        charging ||
        (!stunned &&
          !(e.windup ?? 0) &&
          (leader ||
            !def ||
            [
              'chase',
              'charge',
              'shield',
              'pulse',
              'brood',
              'burst',
              'strafe',
              'jam',
            ].includes(def.behavior) ||
            dist > def.range * 0.8 ||
            (e.rush && dist > 150)));
      if (moving) {
        const speed =
          e.speed *
          (charging ? (def?.chargeMultiplier ?? 3) : 1) *
          (e.slow ? (this.pk('cold_shower') > 1 ? 0.5 : 0.67) : 1);
        const strafe =
          def?.behavior === 'strafe' && dist < def.range * 0.9 && !e.rush;
        const strafeDirection = e.visualSeed % 2 ? 1 : -1;
        e.walk += (dt * speed) / 12;
        e.x = Math.max(
          40,
          Math.min(
            1560,
            e.x +
              (charging
                ? Math.cos(e.aim)
                : strafe
                  ? -ey * strafeDirection
                  : ex) *
                speed *
                dt,
          ),
        );
        e.y = Math.max(
          40,
          Math.min(
            960,
            e.y +
              (charging
                ? Math.sin(e.aim)
                : strafe
                  ? ex * strafeDirection
                  : ey) *
                speed *
                dt,
          ),
        );
      }
      const houseDist =
        goal === this ? dist : Math.hypot(this.x - e.x, this.y - e.y) || 1;
      if (houseDist < e.r + 24 && this.invincible <= 0) {
        e.attack = 0.18;
        const hit = this.contactHit(e);
        this.hurt(hit, 0.7, 0.4);
        if (this.stats.thorns) this.damage(e, this.stats.thorns);
        if (!leader) {
          e.x -= ((this.x - e.x) / houseDist) * 32;
          e.y -= ((this.y - e.y) / houseDist) * 32;
        }
      }
      const partner = this.ally;
      if (partner && !partner.down && partner.invincible <= 0) {
        const partnerDist =
          goal === partner
            ? dist
            : Math.hypot(partner.x - e.x, partner.y - e.y) || 1;
        if (partnerDist < e.r + COOP.hitRadius + 4) {
          e.attack = 0.18;
          this.hurtAlly(this.contactHit(e), 0.7, 0.4);
          if (this.stats.thorns) this.damage(e, this.stats.thorns);
          if (!leader) {
            e.x -= ((partner.x - e.x) / partnerDist) * 32;
            e.y -= ((partner.y - e.y) / partnerDist) * 32;
          }
        }
      }
      this.orbitHit(e, dt);
    }
    for (const hazard of this.hazards) {
      const armed = hazard.age >= 0;
      hazard.age += dt;
      if (!armed && hazard.age >= 0) this.hazardFired(hazard);
      if (this.invincible <= 0 && hazardContains(hazard, this.x, this.y)) {
        const taken = this.hurt(
          Math.max(2, this.threat(hazard.damage) - this.stats.armor),
          0.7,
          0.38,
        );
        if (taken)
          this.run.coins = Math.max(0, this.run.coins - (hazard.drain ?? 0));
      }
      const partner = this.ally;
      if (
        partner &&
        !partner.down &&
        partner.invincible <= 0 &&
        hazardContains(hazard, partner.x, partner.y)
      ) {
        const taken = this.hurtAlly(
          Math.max(2, this.threat(hazard.damage) - this.stats.armor),
          0.7,
          0.38,
        );
        if (taken)
          this.run.coins = Math.max(0, this.run.coins - (hazard.drain ?? 0));
      }
    }
    this.hazards = this.hazards.filter((h) => h.age < h.duration).slice(-40);
    const magnets = this.enemies.filter(
      (e) => e.hp > 0 && e.affix === 'magnetic',
    );
    this.collideSolids(dt);
    this.updatePerks(dt);
    this.updateShells(dt);
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      if (!b.enemy && magnets.length) this.bend(b, magnets, dt);
      if (!b.enemy && b.homing) this.steer(b, dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.age = (b.age ?? 0) + dt;
      if (b.enemy) {
        // A crate or a dumpster between the shooter and the house is cover.
        if (
          this.solids.some((c) => Math.hypot(b.x - c.x, b.y - c.y) < c.r)
        ) {
          b.life = 0;
          this.burst(b.x, b.y, '#b9a98a', 3);
          continue;
        }
        if (
          Math.hypot(b.x - this.x, b.y - this.y) < 27 &&
          this.invincible <= 0
        ) {
          this.hurt(
            Math.max(2, this.threat(b.damage) - this.stats.armor),
            0.45,
            0.3,
          );
          b.life = 0;
        }
        const partner = this.ally;
        if (
          b.life > 0 &&
          partner &&
          !partner.down &&
          partner.invincible <= 0 &&
          Math.hypot(b.x - partner.x, b.y - partner.y) < COOP.hitRadius + 7
        ) {
          this.hurtAlly(
            Math.max(2, this.threat(b.damage) - this.stats.armor),
            0.45,
            0.3,
          );
          b.life = 0;
        }
      } else {
        for (const e of this.enemies) {
          if (
            e.hp <= 0 ||
            b.hitSet?.includes(e) ||
            Math.hypot(b.x - e.x, b.y - e.y) > e.r + 6
          )
            continue;
          // Splash and chain reach only enemies standing before this hit:
          // halves and brood young spawned by its kills sit the frame out.
          const standing = this.enemies.length;
          this.damage(e, b.damage, b.crit, Math.atan2(b.vy, b.vx));
          this.perkHit(e, b);
          this.passOn(b, e);
          if (b.blast) this.rocketBlast(b, e, this.enemies.slice(0, standing));
          const around =
            this.stats.explosion || this.stats.chain
              ? this.enemies.slice(0, standing)
              : [];
          if (this.stats.explosion) {
            this.burst(e.x, e.y, '#dab97b', 8);
            this.ring(e.x, e.y, this.stats.explosion, '#dab97b', 0.25, 3);
            this.addTrauma(0.08, 0.4);
            if (this.explosionCd <= 0) {
              this.audio.play('explosion', { volume: 0.45 });
              this.explosionCd = 0.18;
            }
            for (const other of around)
              if (
                other !== e &&
                Math.hypot(other.x - e.x, other.y - e.y) < this.stats.explosion
              )
                this.damage(other, b.damage * 0.5);
          }
          if (this.stats.chain) {
            const neighbors = around
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
        if (b.life > 0 && !this.ended)
          for (const p of this.explosives) {
            if (p.blown) continue;
            const t = propTarget(p);
            if (Math.hypot(b.x - t.x, b.y - t.y) > t.r + 4) continue;
            this.hitProp(p, b.damage);
            b.life = 0;
            break;
          }
      }
    }
    for (const d of this.drops) {
      d.t = (d.t ?? 0) + dt;
      // Whoever is closer collects: the house, or the partner on their feet.
      const partner = this.ally && !this.ally.down ? this.ally : null;
      const toHouse = Math.hypot(d.x - this.x, d.y - this.y),
        toPartner = partner
          ? Math.hypot(d.x - partner.x, d.y - partner.y)
          : Infinity;
      const taker = toPartner < toHouse ? partner! : this;
      const dist = Math.min(toHouse, toPartner);
      // Crystals fly home from anywhere; coins and kits need the magnet.
      const homing = d.kind === 'xp' && d.t > XP_HOMING;
      if (homing || dist < this.stats.magnet) {
        const speed =
          (homing
            ? Math.min(1400, 260 + (d.t - XP_HOMING) * 1100)
            : Math.max(90, 500 - dist)) * dt;
        const step = Math.min(dist, speed);
        d.x += ((taker.x - d.x) / Math.max(1, dist)) * step;
        d.y += ((taker.y - d.y) / Math.max(1, dist)) * step;
      }
      if (dist < 32) {
        if (d.kind === 'coin') {
          this.run.coins += this.loot(d.value, 'coin');
          this.audio.play('coin');
        }
        if (d.kind === 'heal') {
          if (taker === this) {
            const healed = Math.max(
              0,
              Math.min(d.value, this.stats.health - this.run.hp),
            );
            this.run.hp = Math.min(this.stats.health, this.run.hp + d.value);
            this.audio.play('heal');
            if (healed >= 1)
              this.label(
                this.x,
                this.y - 62,
                '+' + Math.round(healed),
                '#8acdb6',
              );
          } else {
            this.healAlly(d.value);
            this.audio.play('heal');
          }
        }
        if (d.kind === 'xp') {
          this.run.xp += this.loot(d.value, 'xp');
          // A stream of crystals climbs in pitch.
          this.pickupStreak =
            this.pickupGap > 0 ? Math.min(12, this.pickupStreak + 1) : 0;
          this.pickupGap = 0.5;
          this.audio.play('pickup', { pitch: 1 + this.pickupStreak * 0.04 });
        }
        d.value = 0;
      }
    }
    const need = xpNeed(this.run.level);
    if (this.run.xp >= need) {
      this.run.xp -= need;
      this.run.level++;
      this.run.hp = Math.min(this.stats.health, this.run.hp + 10);
      this.label(this.x, this.y - 65, `РІВЕНЬ ${this.run.level}`, '#aee6cb');
      this.burst(this.x, this.y, '#aee6cb', 30);
      this.ring(this.x, this.y - 14, 120, '#aee6cb', 0.5, 4);
      this.audio.play('win');
      this.onLevelUp?.(this.run.level);
      this.pendingLevels++;
      this.openDraft();
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.bullets = this.bullets.filter((b) => b.life > 0).slice(-450);
    this.drops = this.drops.filter((d) => d.value > 0).slice(-400);
    for (const m of this.incoming) m.life -= dt;
    this.incoming = this.incoming.filter((m) => m.life > 0);
    this.updateFx(dt);
    this.lowHpTimer -= dt;
    if (
      this.run.hp > 0 &&
      this.run.hp < this.stats.health * LOW_HP &&
      this.lowHpTimer <= 0
    ) {
      this.audio.play('lowHp');
      this.lowHpTimer = 1.4;
    }
    if (this.run.hp <= 0 && !this.secondWind && this.pk('second_wind')) {
      this.secondWind = true;
      this.run.hp = this.stats.health / 3;
      this.invincible = 2;
      this.banner(
        'ДРУГЕ ДИХАННЯ',
        'Ніна не дала будинку впасти',
        '#8acdb6',
        1.4,
      );
      this.ring(this.x, this.y - 14, 200, '#8acdb6', 0.5, 6);
      this.slow(0.6, 0.35);
      for (const e of this.enemies) {
        if (e.hp <= 0 || isLeader(e.type)) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < 220)
          this.knock(
            e,
            ((e.x - this.x) / (d || 1)) * 480,
            ((e.y - this.y) / (d || 1)) * 480,
          );
      }
    }
    if (this.run.hp <= 0) {
      this.run.hp = 0;
      this.endReason = 'lost';
      this.finish(false);
      return;
    }
    if (leaderFight) {
      if (this.elapsed >= this.duration) {
        this.endReason = 'timeout';
        this.finish(false);
        return;
      }
    } else {
      const cleared = this.squadCleared();
      if (cleared || this.elapsed >= this.duration) {
        // Overtime: whatever is left of the squad goes home.
        this.endReason = cleared ? 'cleared' : 'overtime';
        this.banner(
          cleared ? 'ЗАГІН РОЗБИТО' : 'ЧАС ВИЙШОВ',
          cleared ? (this.encounter?.name ?? '') : 'Загін відступає',
          this.encounterColor(),
          1.2,
        );
        this.bankLoose();
        if (this.encounter)
          this.onBeat?.({
            kind: 'broken',
            squad: this.encounter.id,
            overtime: !cleared,
          });
        this.finish(true);
        return;
      }
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0 && !this.ended) {
      this.hudTimer = 0.1;
      this.pushHud();
    }
  }
  pushHud() {
    this.onHud(this.hud());
  }
  // The numbers of the screen's top (the guest of a mirror gets them too).
  hud(): Hud {
    const leaders = this.enemies.filter((e) => isLeader(e.type));
    const boss = leaders[0];
    return {
      drafting: !!this.drafting,
      hp: this.run.hp,
      max: this.stats.health,
      coins: this.run.coins,
      kills: this.run.kills,
      level: this.run.level,
      xp: this.run.xp,
      need: xpNeed(this.run.level),
      time: this.elapsed,
      duration: this.duration,
      dash: this.dashCd,
      pulse: this.pulseCd,
      boss: leaders.reduce((sum, l) => sum + Math.max(0, l.hp), 0),
      bossMax: leaders.reduce((sum, l) => sum + l.max, 0),
      enemies: this.enemies.length,
      bossAttack: this.bossAttack,
      bossPhase: leaders.reduce((top, l) => Math.max(top, l.phase), 0),
      ...(this.encounter
        ? {
            wave: this.wave + 1,
            waves: this.plan.length,
            left: this.squadLeft(),
            squad: this.encounter.name,
          }
        : {}),
      ...(this.ally
        ? {
            ally: {
              hp: this.ally.hp,
              max: this.ally.max,
              down: this.ally.down,
              revive: this.ally.revive,
              dash: this.ally.dashCd,
              pulse: this.ally.pulseCd,
            },
          }
        : {}),
    };
  }
  // Purely visual state in simulation time; also runs during the outro.
  updateFx(dt: number) {
    for (const e of this.defeated) e.life -= dt;
    this.defeated = this.defeated.filter((e) => e.life > 0).slice(-32);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.spin) p.rot = (p.rot ?? 0) + p.spin * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles
      .filter((p) => p.life > 0)
      .slice(-PARTICLE_CAP);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const n of this.numbers) {
      n.life -= dt;
      if (n.open > 0) {
        n.open -= dt;
        if (n.target && n.target.hp > 0) {
          n.x = n.target.x + n.dx;
          n.y = n.target.y - n.target.r - 14;
        }
      } else {
        n.y += n.vy * dt;
        n.vy *= Math.max(0, 1 - 2.5 * dt);
      }
    }
    this.numbers = this.numbers.filter((n) => n.life > 0);
    this.muzzle = Math.max(0, this.muzzle - dt);
  }
  // Static facade of the block: panels, windows lit by modules and crew.
  paintFacade(c: CanvasRenderingContext2D) {
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
    const targets = equipmentTargets(this.run),
      lit = new Map(activeEquipment(this.run).map((i) => [i.slot, i.id])),
      fw = Math.max(6, ...targets.map((t) => t.x + 1)),
      fh = Math.max(5, ...targets.map((t) => t.y + 1)),
      crew = (this.run.residents ?? []).map(
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
  drawTurret(c: CanvasRenderingContext2D) {
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
  drawHouse(c: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
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
    const key = [
      this.stats.weapon,
      this.stats.evolution,
      activeEquipment(this.run)
        .map((i) => i.slot + i.id)
        .join(','),
      (this.run.residents ?? []).map((r) => r.id).join(','),
    ].join('|');
    if (this.facade?.key !== key) {
      let canvas: HTMLCanvasElement | null = null;
      if (typeof document !== 'undefined') {
        canvas = document.createElement('canvas');
        canvas.width = 76 * 2;
        canvas.height = 104 * 2;
        const fc = canvas.getContext('2d');
        if (fc) {
          fc.scale(2, 2);
          fc.translate(0, 16);
          this.paintFacade(fc);
        } else canvas = null;
      }
      this.facade = { key, canvas };
    }
    c.translate(0, bob);
    if (this.facade.canvas) c.drawImage(this.facade.canvas, -38, -76, 76, 104);
    else {
      c.save();
      c.translate(-38, -60);
      this.paintFacade(c);
      c.restore();
    }
    this.drawTurret(c);
    c.restore();
  }
  // The partner: a neighbour in a coat of their hero's colour with a plain gun,
  // a plate with the player number and a small health bar. When down, they
  // lie in the yard and a ring shows how far the revive has come.
  drawAlly(c: CanvasRenderingContext2D) {
    const a = this.ally;
    if (!a) return;
    const color = heroAbility(a.hero).color,
      TAU = Math.PI * 2,
      speed = Math.min(1, Math.hypot(a.vx, a.vy) / 120);
    c.save();
    c.translate(a.x, a.y);
    c.fillStyle = '#0006';
    c.beginPath();
    c.ellipse(0, 16, a.down ? 22 : 15, 6, 0, 0, TAU);
    c.fill();
    if (a.down) {
      c.fillStyle = '#26343c';
      c.beginPath();
      c.ellipse(0, 4, 20, 9, 0, 0, TAU);
      c.fill();
      c.globalAlpha = 0.7;
      c.fillStyle = color;
      c.fillRect(-14, -3, 20, 11);
      c.globalAlpha = 1;
      c.fillStyle = '#e0c29c';
      c.beginPath();
      c.arc(14, 2, 6, 0, TAU);
      c.fill();
      // Where the house has to stand, and how much of the revive is done.
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
      c.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + TAU * a.revive);
      c.stroke();
      c.fillStyle = '#8acdb6';
      c.font = `700 11px ${FONT}`;
      c.textAlign = 'center';
      c.fillText('ПІДНІМИ', 0, -42);
    } else {
      const step = a.walk * 6,
        swing = Math.sin(step) * 5 * (0.3 + speed);
      if (a.invincible > 0 && Math.floor(this.elapsed * 16) % 2)
        c.globalAlpha = 0.55;
      c.strokeStyle = '#17232a';
      c.lineWidth = 4;
      c.lineCap = 'round';
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(side * 4, 0);
        c.lineTo(side * 4 + swing * side, 13);
        c.stroke();
      }
      c.lineCap = 'butt';
      c.fillStyle = color;
      c.fillRect(-9, -20, 18, 22);
      c.fillStyle = '#00000033';
      c.fillRect(-9, -4, 18, 3);
      c.strokeStyle = '#0b1217';
      c.lineWidth = 1.5;
      c.strokeRect(-9, -20, 18, 22);
      c.fillStyle = '#e0c29c';
      c.beginPath();
      c.arc(0, -27, 7, 0, TAU);
      c.fill();
      c.fillStyle = '#3a2f2a';
      c.beginPath();
      c.arc(0, -29, 7.5, Math.PI, TAU);
      c.fill();
      c.save();
      c.translate(0, -12);
      c.rotate(a.aim);
      c.fillStyle = '#2b3940';
      c.fillRect(4, -2.5, 17, 5);
      c.fillStyle = '#51636c';
      c.fillRect(4, -2.5, 6, 5);
      if (a.muzzle > 0) {
        c.fillStyle = '#ffe3a0';
        c.beginPath();
        c.arc(24, 0, 4, 0, TAU);
        c.fill();
      }
      c.restore();
      c.globalAlpha = 1;
      // Health bar and the number of the player.
      const share = Math.max(0, Math.min(1, a.hp / a.max));
      c.fillStyle = '#0b1217cc';
      c.fillRect(-18, -50, 36, 6);
      c.fillStyle = share < 0.35 ? '#e69080' : color;
      c.fillRect(-17, -49, 34 * share, 4);
    }
    c.fillStyle = a.down ? '#8acdb6' : color;
    c.beginPath();
    c.arc(a.down ? 0 : -26, a.down ? -58 : -48, 8, 0, TAU);
    c.fill();
    c.fillStyle = '#0b1217';
    c.font = `800 11px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('2', a.down ? 0 : -26, a.down ? -57.5 : -47.5);
    c.restore();
    c.textAlign = 'start';
    c.textBaseline = 'alphabetic';
  }
  glowAt(
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
    c.drawImage(sprite, x - radius, y - radius);
    c.globalAlpha = 1;
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
    drawProps(
      c,
      this.props,
      this.run.chapter,
      this.elapsed,
      false,
      colorblind,
      visible,
    );
    this.drawAuras(c, visible);
    for (const hazard of this.hazards) drawHazard(c, hazard, this.settings);
    for (const t of this.trails) {
      if (!visible(t.x, t.y)) continue;
      const k = Math.min(1, t.life / 2);
      this.glowAt(c, '#ff8a3d', t.x, t.y, 20, 0.55 * k);
      c.fillStyle = 'rgba(255,196,110,' + (0.5 * k).toFixed(3) + ')';
      c.beginPath();
      c.arc(
        t.x,
        t.y,
        7 + 3 * Math.sin(this.elapsed * 18 + t.x),
        0,
        Math.PI * 2,
      );
      c.fill();
    }
    this.drawTelegraphs(c, visible);
    for (const d of this.drops) {
      if (!visible(d.x, d.y)) continue;
      const color =
        d.kind === 'coin'
          ? '#eeb657'
          : d.kind === 'heal'
            ? '#ed9d8c'
            : '#79c8b3';
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
      ...this.enemies.map((enemy) => ({
        y: enemy.y,
        enemy,
        dying: 0,
        partner: false,
      })),
      ...this.defeated.map((enemy) => ({
        y: enemy.y,
        enemy,
        dying: 1 - enemy.life / 0.48,
        partner: false,
      })),
      { y: this.y, enemy: null, dying: 0, partner: false },
      ...(this.ally
        ? [{ y: this.ally.y, enemy: null, dying: 0, partner: true }]
        : []),
    ].sort((a, b) => a.y - b.y);
    const wrecked = this.ended && this.run.hp <= 0;
    for (const actor of actors) {
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
    if (this.muzzle > 0 && !wrecked) this.drawMuzzle(c);
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
      this.glowAt(c, '#6abbff', x, y, 22, 0.9);
      c.fillStyle = '#8cc5ed';
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.fill();
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
    c.restore();
    this.drawOverlay(c, w, h);
  }
  // Culling that never hides a visible part: the whole sprite (bosses are
  // tall), a swift afterimage, or a blink drone's landing ring, which sits
  // beside the house while the drone winds up off screen.
  onScreen(e: Enemy, dying: number, visible: Visible) {
    if (e.type === COURIER) return visible(e.x, e.y, 80);
    const reach = enemyReach(
      e,
      this.run.chapter,
      this.run.bossVariants[this.run.chapter],
      this.minibossVariant,
    );
    if (visible(e.x, e.y, reach)) return true;
    if (dying) return false;
    const trail = e.trail;
    if (
      trail?.length &&
      visible(trail[trail.length - 2], trail[trail.length - 1], reach)
    )
      return true;
    return (
      (e.windup ?? 0) > 0 &&
      e.targetX !== undefined &&
      ENEMY_DEFS[e.type]?.behavior === 'blink' &&
      visible(e.targetX, e.targetY ?? e.y, e.r + 12)
    );
  }
  // Affix outline colours, swapped for the colour-blind palette.
  affixStyle(e: Enemy): AffixLook | null {
    return e.affix
      ? affixLook(AFFIX_BY_ID[e.affix], this.settings.colorblind)
      : null;
  }
  drawMuzzle(c: CanvasRenderingContext2D) {
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
  drawShot(c: CanvasRenderingContext2D, b: Bullet, base: string) {
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
  drawShells(c: CanvasRenderingContext2D) {
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
  drawBullets(c: CanvasRenderingContext2D, visible: Visible) {
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
  drawAuras(c: CanvasRenderingContext2D, visible: Visible) {
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
      if (e.hp <= 0 || (e.affix !== 'medic' && e.affix !== 'magnetic'))
        continue;
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
  drawCourier(c: CanvasRenderingContext2D, e: Enemy, dying: number) {
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
  drawParticles(c: CanvasRenderingContext2D, visible: Visible) {
    const ts = this.settings.textScale || 1;
    c.textAlign = 'center';
    c.lineJoin = 'round';
    for (const p of this.particles) {
      if (!visible(p.x, p.y)) continue;
      c.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      c.fillStyle = p.color;
      if (p.text) {
        c.font = `700 ${Math.round(14 * ts)}px ${FONT}`;
        c.strokeStyle = '#081016';
        c.lineWidth = 3;
        c.strokeText(p.text, p.x, p.y);
        c.fillText(p.text, p.x, p.y);
        continue;
      }
      const s = p.size,
        rot = p.rot ?? 0;
      switch (p.shape) {
        case 'spark': {
          const v = Math.hypot(p.vx, p.vy) || 1;
          c.strokeStyle = p.color;
          c.lineWidth = s * 0.7;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - (p.vx / v) * s * 4, p.y - (p.vy / v) * s * 4);
          c.stroke();
          break;
        }
        case 'shard': {
          const cos = Math.cos(rot) * s,
            sin = Math.sin(rot) * s;
          c.beginPath();
          c.moveTo(p.x + cos, p.y + sin);
          c.lineTo(p.x - cos * 0.6 - sin * 0.7, p.y - sin * 0.6 + cos * 0.7);
          c.lineTo(p.x - cos * 0.4 + sin * 0.8, p.y - sin * 0.4 - cos * 0.8);
          c.closePath();
          c.fill();
          break;
        }
        case 'leaf':
          c.beginPath();
          c.ellipse(p.x, p.y, s, s * 0.45, rot, 0, Math.PI * 2);
          c.fill();
          break;
        case 'spore':
          c.beginPath();
          c.arc(p.x, p.y, s, 0, Math.PI * 2);
          c.fill();
          break;
        default:
          c.fillRect(p.x, p.y, s, s);
      }
    }
    c.globalAlpha = 1;
  }
  drawNumbers(c: CanvasRenderingContext2D) {
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
  drawOverlay(c: CanvasRenderingContext2D, w: number, h: number) {
    const reduced = this.settings.reducedFlashes;
    const edges = this.edgeLayers(w, h);
    if (edges) c.drawImage(edges.dark, 0, 0, w, h);
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
      c.drawImage(edges.red, 0, 0, w, h);
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
    const squad = this.client ? 0 : this.drawSquadTracker(c, w);
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
  edgeLayers(w: number, h: number) {
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
  drawEdgeArrow(
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
  drawCourierMarker(c: CanvasRenderingContext2D, w: number, h: number) {
    const e = this.event?.courier;
    if (!e || e.hp <= 0 || this.ended) return;
    this.drawEdgeArrow(c, w, h, e.x, e.y - 20, EVENT_COLOR.courier);
  }
  // Where a fresh pack comes from, for a moment after it appears.
  drawIncoming(c: CanvasRenderingContext2D, w: number, h: number) {
    if (this.ended) return;
    for (const m of this.incoming)
      this.drawEdgeArrow(c, w, h, m.x, m.y, m.color, Math.min(1, m.life));
  }
  // Squad status under the timer: name, wave and kills still needed.
  // Returns the height it takes, so the event tracker goes below it.
  drawSquadTracker(c: CanvasRenderingContext2D, w: number) {
    const t = this.encounter;
    if (!t || this.ended) return 0;
    const ts = this.settings.textScale || 1,
      color = this.encounterColor(),
      bw = Math.min(w - 40, 260 * ts),
      bh = 30 * ts,
      x = w / 2 - bw / 2,
      y = 88 * ts,
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
    return bh + 8 * ts;
  }
  // Windup read: a crosshair where a leading shot or charge is headed, and
  // the outline of the zone a mine, root or acid shot will leave.
  drawTelegraphs(c: CanvasRenderingContext2D, visible: Visible) {
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
  drawStagger(c: CanvasRenderingContext2D, e: Enemy) {
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
  drawEventTracker(c: CanvasRenderingContext2D, w: number, offset = 0) {
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
  drawCombo(c: CanvasRenderingContext2D, w: number, offset = 0) {
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
  drawBanners(c: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.banners.length) return;
    const ts = this.settings.textScale || 1;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let top = h * 0.22 - 29 * ts;
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
  // Greedy word wrap for canvas text, at most two lines.
  wrap(c: CanvasRenderingContext2D, text: string, width: number) {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && c.measureText(next).width > width && lines.length < 1) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  // Word wrap for canvas text with a line limit; what does not fit goes on the
  // last line and is cut with an ellipsis.
  wrapLines(
    c: CanvasRenderingContext2D,
    text: string,
    width: number,
    max: number,
  ) {
    const lines: string[] = [];
    const words = text.split(' ');
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const next = line ? line + ' ' + words[i] : words[i];
      if (line && c.measureText(next).width > width) {
        lines.push(line);
        line = words[i];
        if (lines.length === max - 1) {
          const rest = words.slice(i).join(' ');
          let cut = rest;
          while (cut.length > 4 && c.measureText(cut).width > width)
            cut = cut.slice(0, -2).trimEnd();
          lines.push(
            cut === rest ? rest : cut.replace(/[\s.,;:!?]+$/, '') + '…',
          );
          return lines;
        }
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
  // A leader with no portrait yet: its own sprite on a dark panel with rings.
  drawLeaderCameo(
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
  drawIntro(c: CanvasRenderingContext2D, w: number, h: number) {
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
      return { tk, small, nameSize, hint, quoteLines, line, gap, kicker, hp, height };
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
    const rise = (at: number) =>
      still ? 0 : (1 - clamp((age - at) / 0.3)) * 14;
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
      hint.forEach((l, i) =>
        c.fillText(l, tx, y + line * (i + 1) - small * 0.2),
      );
      y += hint.length * line;
    }
    // Health.
    if (words.hp) {
      y += gap * 1.6;
      c.globalAlpha = show(1.3);
      const label = 'ЗДОРОВ’Я ' + Math.round(card.hp ?? 0).toLocaleString('uk-UA'),
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
}
