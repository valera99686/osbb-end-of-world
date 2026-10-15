import { CHARACTERS } from './data';
import type { Meta, Run } from './model';

export type RunMode = 'campaign' | 'daily' | 'endless';
export type AffixId =
  | 'armored'
  | 'swift'
  | 'volatile'
  | 'medic'
  | 'splitter'
  | 'magnetic';
export type BattleEventId = 'alarm' | 'courier' | 'overload';
export interface HeatEffects {
  enemyHealth: number;
  enemyDamage: number;
  enemySpeed: number;
  projectileSpeed: number;
  // Multiplier on spawn frequency: above 1 means more enemies per second.
  spawnRate: number;
  // Added to the chance that a regular enemy spawns with an elite affix.
  affixBonus: number;
  repairCost: number;
  shopCost: number;
  // Multiplier on boss and miniboss attack cooldowns: below 1 is faster.
  bossTime: number;
  coreBonus: number;
}
export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
// The selectable ladder ends at 10; endless circuits keep adding +2 past it.
export const MAX_HEAT = 10;
export const MAX_ENDLESS_HEAT = 99;
export function heatCap(mode: RunMode | undefined): number {
  return mode === 'endless' ? MAX_ENDLESS_HEAT : MAX_HEAT;
}

// Same mulberry32 as model.seeded; duplicated to keep this module leaf-level.
function stream(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Local calendar day, so the daily run rolls over at the player's midnight.
export function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// FNV-1a with a murmur finaliser: stable across devices and sessions.
export function dailySeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
export const DAILY_MODIFIERS: { id: string; title: string; text: string }[] = [
  {
    id: 'swarm',
    title: 'Рій у під’їзді',
    text: 'Вороги з’являються на 25% частіше, але мають на 10% менше здоров’я.',
  },
  {
    id: 'glass',
    title: 'Скляні гармати',
    text: 'Вороги б’ють на 25% сильніше, але мають на 15% менше здоров’я.',
  },
  {
    id: 'rush',
    title: 'Пожежна тривога',
    text: 'Вороги та їхні снаряди рухаються на 15% швидше.',
  },
  {
    id: 'elite',
    title: 'Позачергові збори',
    text: 'Посилені вороги з особливими властивостями трапляються частіше.',
  },
  {
    id: 'inflation',
    title: 'Інфляція',
    text: 'Крамниця й ремонт дорожчі на 30%, зате ядер наприкінці на 20% більше.',
  },
  {
    id: 'sale',
    title: 'Розпродаж',
    text: 'Крамниця дешевша на 20%, але вороги мають на 10% більше здоров’я.',
  },
  {
    id: 'impatient',
    title: 'Нетерплячі боси',
    text: 'Боси й мінібоси атакують на 15% частіше, зате ядер на 15% більше.',
  },
];
export const HEAT_LEVELS: { level: number; title: string; text: string }[] = [
  {
    level: 1,
    title: 'Неспокійні сусіди',
    text: 'Вороги мають на 10% більше здоров’я.',
  },
  { level: 2, title: 'Дорогий ремонт', text: 'Ремонт дорожчий на 50%.' },
  {
    level: 3,
    title: 'Швидкі кроки',
    text: 'Вороги рухаються на 8% швидше.',
  },
  {
    level: 4,
    title: 'Гострі зуби',
    text: 'Вороги завдають на 15% більше шкоди.',
  },
  {
    level: 5,
    title: 'Еліта в під’їзді',
    text: 'Посилені вороги з особливими властивостями трапляються частіше.',
  },
  {
    level: 6,
    title: 'Щільна облога',
    text: 'Вороги з’являються на 15% частіше.',
  },
  {
    level: 7,
    title: 'Швидкі снаряди',
    text: 'Ворожі снаряди летять на 15% швидше.',
  },
  { level: 8, title: 'Націнка', text: 'Товари в крамниці дорожчі на 20%.' },
  {
    level: 9,
    title: 'Нетерплячі боси',
    text: 'Боси й мінібоси атакують на 15% частіше.',
  },
  {
    level: 10,
    title: 'Кінець світу',
    text: 'Вороги мають ще +20% здоров’я й завдають ще +15% шкоди.',
  },
];
const round = (n: number) => Math.round(n * 1e4) / 1e4;
// Each level adds one rule from HEAT_LEVELS and +10% cores. Heat 0 is neutral.
export function heatEffects(heat: number, modifier?: string): HeatEffects {
  const h = Number.isFinite(heat) ? Math.max(0, Math.floor(heat)) : 0;
  const at = (level: number) => (h >= level ? 1 : 0);
  // Beyond the ladder (deep endless circuits) enemies keep getting tougher.
  const beyond = Math.max(0, h - MAX_HEAT);
  const e: HeatEffects = {
    enemyHealth: 1 + 0.1 * at(1) + 0.2 * at(10) + 0.05 * beyond,
    enemyDamage: 1 + 0.15 * at(4) + 0.15 * at(10) + 0.03 * beyond,
    enemySpeed: 1 + 0.08 * at(3),
    projectileSpeed: 1 + 0.15 * at(7),
    spawnRate: 1 + 0.15 * at(6),
    affixBonus: 0.06 * at(5),
    repairCost: 1 + 0.5 * at(2),
    shopCost: 1 + 0.2 * at(8),
    bossTime: 1 - 0.15 * at(9),
    coreBonus: 1 + 0.1 * h,
  };
  if (modifier === 'swarm') {
    e.spawnRate *= 1.25;
    e.enemyHealth *= 0.9;
  } else if (modifier === 'glass') {
    e.enemyDamage *= 1.25;
    e.enemyHealth *= 0.85;
  } else if (modifier === 'rush') {
    e.enemySpeed *= 1.15;
    e.projectileSpeed *= 1.15;
  } else if (modifier === 'elite') e.affixBonus += 0.1;
  else if (modifier === 'inflation') {
    e.shopCost *= 1.3;
    e.repairCost *= 1.3;
    e.coreBonus += 0.2;
  } else if (modifier === 'sale') {
    e.shopCost *= 0.8;
    e.enemyHealth *= 1.1;
  } else if (modifier === 'impatient') {
    e.bossTime *= 0.85;
    e.coreBonus += 0.15;
  }
  for (const key of Object.keys(e) as (keyof HeatEffects)[])
    e[key] = round(e[key]);
  return e;
}
function dailyRoll(key: string) {
  const rng = stream(dailySeed(key) ^ 0x5bd1e995);
  // The character draw comes first and always consumes one value, so the
  // modifier and heat are the same for every player on that day.
  const pick = rng();
  const modifier =
    DAILY_MODIFIERS[Math.floor(rng() * DAILY_MODIFIERS.length)].id;
  const heat = 1 + Math.floor(rng() * 3);
  return { pick, modifier, heat };
}
export function dailyModifier(key: string): string {
  return DATE_KEY.test(key) ? dailyRoll(key).modifier : '';
}
export function dailySetup(
  key: string,
  meta: Meta,
): { seed: number; character: string; modifier: string; heat: number } {
  const roll = dailyRoll(key);
  const open = CHARACTERS.filter((c) => c.win <= (meta.wins ?? 0));
  const pool = open.length ? open : CHARACTERS;
  return {
    seed: dailySeed(key),
    character: pool[Math.floor(roll.pick * pool.length)].id,
    modifier: roll.modifier,
    heat: roll.heat,
  };
}
type ModeState = Partial<Pick<Run, 'heat' | 'mode' | 'daily'>>;
// Heat plus the daily modifier, if the run is a daily one.
export function heatForRun(run: ModeState): HeatEffects {
  return heatEffects(
    run.heat ?? 0,
    run.mode === 'daily' && run.daily ? dailyModifier(run.daily) : undefined,
  );
}
export function endlessHeat(loop: number, baseHeat: number): number {
  const l = Number.isFinite(loop) ? Math.max(0, Math.floor(loop)) : 0;
  const h = Number.isFinite(baseHeat) ? Math.max(0, Math.floor(baseHeat)) : 0;
  return Math.min(MAX_ENDLESS_HEAT, h + l * 2);
}
export const ELITE_AFFIXES: {
  id: AffixId;
  name: string;
  color: string;
  text: string;
}[] = [
  {
    id: 'armored',
    name: 'Броньований',
    color: '#9fb0c4',
    text: 'Товста броня: кожне влучання завдає менше шкоди.',
  },
  {
    id: 'swift',
    name: 'Прудкий',
    color: '#5fd8ff',
    text: 'Рухається значно швидше за родичів.',
  },
  {
    id: 'volatile',
    name: 'Вибуховий',
    color: '#ff7b3a',
    text: 'Вибухає після знищення — тримай дистанцію.',
  },
  {
    id: 'medic',
    name: 'Санітар',
    color: '#6fe38e',
    text: 'Поступово лікує ворогів поруч.',
  },
  {
    id: 'splitter',
    name: 'Подільник',
    color: '#c48cff',
    text: 'Після знищення розпадається на дрібніших ворогів.',
  },
  {
    id: 'magnetic',
    name: 'Магнітний',
    color: '#ffd84a',
    text: 'Магнітне поле притягує до себе кулі будинку.',
  },
];
export const AFFIX_BY_ID = Object.fromEntries(
  ELITE_AFFIXES.map((a) => [a.id, a]),
) as Record<AffixId, (typeof ELITE_AFFIXES)[number]>;
type AffixState = ModeState & Pick<Run, 'step' | 'kind'>;
export function affixChance(run: AffixState): number {
  if (run.step < 2 || run.kind === 'boss' || run.kind === 'miniboss') return 0;
  const base = 0.08 + Math.min(0.07, (run.step - 2) * 0.01);
  return Math.min(
    0.5,
    base + (run.kind === 'elite' ? 0.04 : 0) + heatForRun(run).affixBonus,
  );
}
// Draws nothing when affixes are impossible, so early rooms keep their rolls.
export function rollAffix(rng: () => number, run: AffixState): AffixId | null {
  const chance = affixChance(run);
  if (chance <= 0 || rng() >= chance) return null;
  return ELITE_AFFIXES[Math.floor(rng() * ELITE_AFFIXES.length)].id;
}
// +5% per kill after the fifth, capped at x1.5 from the 15th. The cap was x2
// at 25 kills; it pushed elite-fight coins to almost 3x of 0.9 (see
// docs/balance/2026-09-24.md), past what the shop economy is tuned for.
export const COMBO_CAP = 1.5;
export function comboMultiplier(combo: number): number {
  if (!Number.isFinite(combo) || combo <= 5) return 1;
  return Math.min(COMBO_CAP, round(1 + (Math.floor(combo) - 5) * 0.05));
}
export const BATTLE_EVENTS: {
  id: BattleEventId;
  title: string;
  text: string;
}[] = [
  {
    id: 'alarm',
    title: 'Сигналізація',
    text: 'Завила сигналізація: вороги сунуть хвилями. Протримайся — будуть монети.',
  },
  {
    id: 'courier',
    title: 'Кур’єр',
    text: 'Між ворогами тікає кур’єр із посилкою. Наздожени його до втечі.',
  },
  {
    id: 'overload',
    title: 'Перевантаження',
    text: 'Мережу перевантажено: по арені б’ють розряди, зате темп стрільби вищий.',
  },
];
// Half of the regular fights from step 1 get one (a quarter before 0.11:
// too rare to shape a run).
export function rollBattleEvent(
  rng: () => number,
  run: Pick<Run, 'step' | 'kind'>,
): BattleEventId | null {
  if (run.kind !== 'battle' || run.step < 1 || rng() >= 0.5) return null;
  return BATTLE_EVENTS[Math.floor(rng() * BATTLE_EVENTS.length)].id;
}
type ScoreState = Partial<
  Pick<
    Run,
    | 'kills'
    | 'bossesDefeated'
    | 'minibossKills'
    | 'elitesKilled'
    | 'step'
    | 'chapter'
    | 'loop'
    | 'heat'
  >
>;
// Pass `won` for the final boss, which bossesDefeated does not count yet.
export function runScore(run: ScoreState, won = false): number {
  const n = (v: number | undefined) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0;
  const score =
    n(run.kills) +
    50 * (n(run.bossesDefeated) + (won ? 1 : 0)) +
    25 * n(run.minibossKills) +
    10 * n(run.elitesKilled) +
    20 * n(run.step) +
    300 * n(run.chapter) +
    900 * n(run.loop) +
    (won ? 500 : 0);
  return Math.round(score * (1 + 0.1 * Math.floor(n(run.heat))));
}
