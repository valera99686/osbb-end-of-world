import type { Stat } from './data';
import type { Run } from './model';

// Level-up perks: a 1-of-3 draft inside the battle. Each perk belongs to a
// resident who offers it (portrait + one line, see barks.ts). Stat perks feed
// statsFor; behaviour perks are read by the engine through perkLevel().
export type PerkId =
  | 'rivets'
  | 'hydraulics'
  | 'fire_trail'
  | 'overdrive'
  | 'arc'
  | 'shock_dash'
  | 'static'
  | 'ivy'
  | 'spores'
  | 'photosynthesis'
  | 'cashier'
  | 'interest'
  | 'lucky_shot'
  | 'tea'
  | 'blanket'
  | 'second_wind'
  | 'searchlight'
  | 'whistle'
  | 'short_fuse'
  | 'patrol'
  | 'complaint'
  | 'ricochet'
  | 'loud_voice'
  | 'homemade_drone'
  | 'homing'
  | 'shrapnel'
  | 'cold_shower'
  | 'rhythm';

export interface Perk {
  id: PerkId;
  name: string;
  text: string;
  owner: string;
  // 1 common, 2 rare, 3 legendary: weights 10 / 5 / 2.
  rarity: 1 | 2 | 3;
  max: number;
  stats?: Partial<Record<Stat, number>>;
  // Added to the fire-rate multiplier like item 'rate' stats.
  rate?: number;
}

export const PERKS: readonly Perk[] = [
  {
    id: 'rivets',
    name: 'Заклепки',
    text: '+3 броні. Петрович клепає листи прямо на ходу.',
    owner: 'mechanic',
    rarity: 1,
    max: 3,
    stats: { armor: 3 },
  },
  {
    id: 'hydraulics',
    name: 'Гідравліка ніг',
    text: '+18 швидкості ходу.',
    owner: 'mechanic',
    rarity: 1,
    max: 3,
    stats: { speed: 18 },
  },
  {
    id: 'fire_trail',
    name: 'Слід пального',
    text: 'Ривок лишає смугу вогню на 2 с, що палить ворогів.',
    owner: 'mechanic',
    rarity: 2,
    max: 2,
  },
  {
    id: 'overdrive',
    name: 'Форсаж',
    text: 'Вбивство під час ривка або одразу після нього повертає ривок.',
    owner: 'mechanic',
    rarity: 2,
    max: 1,
  },
  {
    id: 'arc',
    name: 'Дуга',
    text: 'Постріли перескакують ще на одного ворога поруч.',
    owner: 'spark',
    rarity: 1,
    max: 3,
    stats: { chain: 1 },
  },
  {
    id: 'shock_dash',
    name: 'Електроривок',
    text: 'Наприкінці ривка — розряд навколо будинку.',
    owner: 'spark',
    rarity: 2,
    max: 2,
  },
  {
    id: 'static',
    name: 'Статика',
    text: 'Критичні влучання б’ють блискавкою по двох сусідах.',
    owner: 'spark',
    rarity: 2,
    max: 1,
  },
  {
    id: 'ivy',
    name: 'Колючий плющ',
    text: '+6 шипів: хто торкнеться будинку, сам поранится.',
    owner: 'flora',
    rarity: 1,
    max: 3,
    stats: { thorns: 6 },
  },
  {
    id: 'spores',
    name: 'Спори',
    text: 'Влучання отруюють: ворог горить ще 2 с.',
    owner: 'flora',
    rarity: 2,
    max: 2,
  },
  {
    id: 'photosynthesis',
    name: 'Фотосинтез',
    text: '+0,6 відновлення міцності щосекунди.',
    owner: 'flora',
    rarity: 1,
    max: 3,
    stats: { regen: 0.6 },
  },
  {
    id: 'cashier',
    name: 'Касир',
    text: '+45 до магніту й +3% удачі.',
    owner: 'boris',
    rarity: 1,
    max: 2,
    stats: { magnet: 45, luck: 0.03 },
  },
  {
    id: 'interest',
    name: 'Відсотки',
    text: '+1 шкоди за кожні 10 монет у касі (до +10).',
    owner: 'boris',
    rarity: 2,
    max: 1,
  },
  {
    id: 'lucky_shot',
    name: 'Щасливий постріл',
    text: '+6% шансу критичного влучання.',
    owner: 'boris',
    rarity: 1,
    max: 3,
    stats: { crit: 0.06 },
  },
  {
    id: 'tea',
    name: 'Гарячий чай',
    text: '+25 міцності й одразу лікує на 25.',
    owner: 'nina',
    rarity: 1,
    max: 3,
    stats: { health: 25 },
  },
  {
    id: 'blanket',
    name: 'Ковдра',
    text: 'Ще один заблокований удар у кожному бою.',
    owner: 'nina',
    rarity: 2,
    max: 2,
  },
  {
    id: 'second_wind',
    name: 'Друге дихання',
    text: 'Раз за бій будинок не падає, а встає з третиною міцності.',
    owner: 'nina',
    rarity: 3,
    max: 1,
  },
  {
    id: 'searchlight',
    name: 'Прожектор',
    text: '+70 дальності стрільби.',
    owner: 'lev',
    rarity: 1,
    max: 2,
    stats: { range: 70 },
  },
  {
    id: 'whistle',
    name: 'Свисток',
    text: 'Хвиля не відкидає, а стягує ворогів до будинку й б’є на 30% сильніше.',
    owner: 'lev',
    rarity: 2,
    max: 1,
  },
  {
    id: 'short_fuse',
    name: 'Короткий гніт',
    text: 'Хвиля перезаряджається на 3 с швидше.',
    owner: 'lev',
    rarity: 1,
    max: 2,
  },
  {
    id: 'patrol',
    name: 'Обхід двору',
    text: 'Ще одна пилка кружляє навколо будинку.',
    owner: 'lev',
    rarity: 2,
    max: 2,
    stats: { orbit: 1 },
  },
  {
    id: 'complaint',
    name: 'Скарга № 311',
    text: 'Постріли пробивають ще одного ворога.',
    owner: 'marta',
    rarity: 2,
    max: 3,
  },
  {
    id: 'ricochet',
    name: 'Рикошет',
    text: 'Після влучання куля відскакує до іншого ворога.',
    owner: 'marta',
    rarity: 2,
    max: 2,
  },
  {
    id: 'loud_voice',
    name: 'Гучний голос',
    text: '+12% темпу стрільби.',
    owner: 'marta',
    rarity: 1,
    max: 3,
    rate: 0.12,
  },
  {
    id: 'homemade_drone',
    name: 'Саморобний дрон',
    text: 'Ще один дрон стріляє разом із будинком.',
    owner: 'danilo',
    rarity: 2,
    max: 2,
    stats: { drones: 1 },
  },
  {
    id: 'homing',
    name: 'Самонаведення',
    text: 'Кулі довертають до найближчого ворога.',
    owner: 'danilo',
    rarity: 2,
    max: 1,
  },
  {
    id: 'shrapnel',
    name: 'Осколки',
    text: 'Знищений ворог розлітається двома осколками.',
    owner: 'danilo',
    rarity: 2,
    max: 2,
  },
  {
    id: 'cold_shower',
    name: 'Холодний душ',
    text: 'Влучання сповільнюють ворога на третину на 1,2 с.',
    owner: 'solomia',
    rarity: 1,
    max: 2,
  },
  {
    id: 'rhythm',
    name: 'Ритм',
    text: 'Кожен четвертий залп — гарантоване критичне влучання.',
    owner: 'solomia',
    rarity: 3,
    max: 1,
  },
];

export const PERK_BY_ID = Object.fromEntries(
  PERKS.map((p) => [p.id, p]),
) as Record<PerkId, Perk>;

export function perkLevel(run: Pick<Run, 'perks'>, id: PerkId) {
  let n = 0;
  for (const p of run.perks ?? []) if (p === id) n++;
  return n;
}

// Stat and fire-rate totals of every perk taken this run.
export function perkStats(run: Pick<Run, 'perks'>) {
  const stats: Partial<Record<Stat, number>> = {};
  let rate = 0;
  for (const id of run.perks ?? []) {
    const perk = PERK_BY_ID[id as PerkId];
    if (!perk) continue;
    for (const [key, value] of Object.entries(perk.stats ?? {}))
      stats[key as Stat] = (stats[key as Stat] ?? 0) + value;
    rate += perk.rate ?? 0;
  }
  return { stats, rate };
}

const WEIGHT = { 1: 10, 2: 5, 3: 2 } as const;

// Three different perks that are not maxed out yet, weighted by rarity.
// Deterministic from its own seed so the combat RNG stays untouched.
export function perkOffers(run: Pick<Run, 'perks'>, seed: number, count = 3) {
  let state = seed >>> 0 || 1;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = PERKS.filter((p) => perkLevel(run, p.id) < p.max);
  const picked: PerkId[] = [];
  while (picked.length < count && pool.length) {
    const total = pool.reduce((sum, p) => sum + WEIGHT[p.rarity], 0);
    let roll = rand() * total;
    let index = 0;
    for (; index < pool.length - 1; index++) {
      roll -= WEIGHT[pool[index].rarity];
      if (roll < 0) break;
    }
    picked.push(pool[index].id);
    pool.splice(index, 1);
  }
  return picked;
}

export function isPerk(id: string): id is PerkId {
  return id in PERK_BY_ID;
}
