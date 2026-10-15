// Weapon cores decide HOW the house shoots. The first installed core (in
// slot order) arms the roof turret; without one the old cannon fires.
// An evolution needs a specific partner module in an adjacent apartment.
export type WeaponId =
  | 'cannon'
  | 'spread'
  | 'rail'
  | 'mortar'
  | 'arc'
  | 'coins'
  | 'flame';

export interface Weapon {
  id: WeaponId;
  name: string;
  // Multipliers on the house's fire rate and per-hit damage; range delta.
  rate: number;
  damage: number;
  range: number;
  color: string;
  text: string;
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  cannon: {
    id: 'cannon',
    name: 'Дахова гармата',
    rate: 1,
    damage: 1,
    range: 0,
    color: '#f2dca6',
    text: 'Стріляє в найближчого ворога.',
  },
  spread: {
    id: 'spread',
    name: 'Дробовик ЖЕК',
    rate: 0.8,
    damage: 0.42,
    range: -120,
    color: '#ffd08a',
    text: 'Віяло з п’яти дробин. Близько — боляче.',
  },
  rail: {
    id: 'rail',
    name: 'Рейковий пробійник',
    rate: 0.42,
    damage: 2.5,
    range: 160,
    color: '#9fe7ff',
    text: 'Повільний постріл, що прошиває всіх на лінії.',
  },
  mortar: {
    id: 'mortar',
    name: 'Міномет з балкона',
    rate: 0.55,
    damage: 1.7,
    range: 60,
    color: '#ffb36b',
    text: 'Навісний снаряд у найгустіший натовп, вибух по площі.',
  },
  arc: {
    id: 'arc',
    name: 'Дуговий трансформатор',
    rate: 1.05,
    damage: 0.85,
    range: -60,
    color: '#b6e3ff',
    text: 'Миттєва блискавка, що перескакує між трьома ворогами.',
  },
  coins: {
    id: 'coins',
    name: 'Монетомет',
    rate: 1.1,
    damage: 0.7,
    range: 0,
    color: '#f5c451',
    text: 'Монети рикошетять тричі. Грошей не витрачає.',
  },
  flame: {
    id: 'flame',
    name: 'Газова колонка',
    rate: 1.9,
    damage: 0.36,
    range: -190,
    color: '#ff8a3d',
    text: 'Струмінь полум’я впритул; вороги горять ще 1,5 с.',
  },
};

export interface Evolution {
  id: string;
  name: string;
  weapon: WeaponId;
  partner: string;
  text: string;
}

export const EVOLUTIONS: readonly Evolution[] = [
  {
    id: 'gauss',
    name: 'Гаус-рейка',
    weapon: 'rail',
    partner: 'scope',
    text: 'Кожен постріл рейки — критичний.',
  },
  {
    id: 'laundry_buckshot',
    name: 'Пральна картеч',
    weapon: 'spread',
    partner: 'laundry',
    text: 'Сім дробин замість п’яти, і вони відкидають.',
  },
  {
    id: 'cluster',
    name: 'Касетний міномет',
    weapon: 'mortar',
    partner: 'generator',
    text: 'Після вибуху розлітаються три малі бомби.',
  },
  {
    id: 'storm',
    name: 'Грозовий фронт',
    weapon: 'arc',
    partner: 'battery',
    text: 'Блискавка перескакує між шістьма ворогами.',
  },
  {
    id: 'jackpot',
    name: 'Джекпот',
    weapon: 'coins',
    partner: 'lucky',
    text: 'Ще один рикошет і +25% шкоди монет.',
  },
  {
    id: 'spore_blaze',
    name: 'Спалах спор',
    weapon: 'flame',
    partner: 'greenhouse',
    text: 'Горіння вдвічі сильніше.',
  },
];

export const EVOLUTION_BY_ID = Object.fromEntries(
  EVOLUTIONS.map((e) => [e.id, e]),
) as Record<string, Evolution>;

export interface Placed {
  id: string;
  slot: number;
  x: number;
  y: number;
}

// The armed core and its evolution for one house layout. `weaponOf` maps an
// item id to its core (data.ts Item.weapon), kept injectable for tests.
export function weaponFor(
  installed: readonly Placed[],
  weaponOf: (id: string) => WeaponId | undefined,
) {
  const core = [...installed]
    .sort((a, b) => a.slot - b.slot)
    .find((p) => weaponOf(p.id));
  if (!core) return { weapon: 'cannon' as WeaponId, evolution: '' };
  const weapon = weaponOf(core.id)!;
  const near = installed.filter(
    (p) =>
      p.slot !== core.slot &&
      Math.abs(p.x - core.x) + Math.abs(p.y - core.y) === 1,
  );
  const evo = EVOLUTIONS.find(
    (e) => e.weapon === weapon && near.some((p) => p.id === e.partner),
  );
  return { weapon, evolution: evo?.id ?? '' };
}

// Card hint: which neighbour evolves this core.
export function evolutionHint(weapon: WeaponId | undefined) {
  if (!weapon) return null;
  return EVOLUTIONS.find((e) => e.weapon === weapon) ?? null;
}
