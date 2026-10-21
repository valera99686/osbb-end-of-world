// What the E key does for each head of ОСББ. The numbers are here, not in the
// engine, so the UI text, the tests and the fight all read one source.
export interface HeroAbility {
  id:
    | 'quake'
    | 'discharge'
    | 'bloom'
    | 'audit'
    | 'scald'
    | 'volley'
    | 'ward'
    | 'express'
    | 'jam';
  name: string;
  // The word on the touch button.
  button: string;
  text: string;
  color: string;
}

export const HERO_ABILITIES: Record<string, HeroAbility> = {
  mechanic: {
    id: 'quake',
    name: 'Удар опор',
    button: 'УДАР',
    text: 'Кільцева хвиля б’є й відкидає всіх навколо будинку.',
    color: '#7ecce0',
  },
  spark: {
    id: 'discharge',
    name: 'Розряд',
    button: 'РОЗРЯД',
    text: 'Блискавка перестрибує між шістьма ворогами й оглушує їх на 0,8 с: оглушені отримують більше шкоди.',
    color: '#c9ecff',
  },
  flora: {
    id: 'bloom',
    name: 'Цвітіння',
    button: 'ЦВІТІННЯ',
    text: 'Лікує 12% міцності, сповільнює ворогів навколо на 3,5 с і колить їх.',
    color: '#9dd88a',
  },
  boris: {
    id: 'audit',
    name: 'Ревізія',
    button: 'РЕВІЗІЯ',
    text: 'Забирає частку здоров’я у ворогів навколо й на 5 с підвищує монети за вбивства в півтора раза.',
    color: '#f0c466',
  },
  nina: {
    id: 'scald',
    name: 'Окріп',
    button: 'ОКРІП',
    text: 'Обдає окропом усіх навколо будинку: вони горять 3,5 с і отримують шкоду щосекунди.',
    color: '#ff9a6b',
  },
  lev: {
    id: 'volley',
    name: 'Залп з даху',
    button: 'ЗАЛП',
    text: 'Шістнадцять куль на всі боки: кожна пробиває першого ворога й б’є наступного.',
    color: '#a8c4dc',
  },
  marta: {
    id: 'ward',
    name: 'Щеплення',
    button: 'ЩИТ',
    text: 'Дає будинку два щити (кожен блокує удар, до чотирьох) і лікує 6% міцності.',
    color: '#8be0c3',
  },
  danilo: {
    id: 'express',
    name: 'Експрес',
    button: 'ЕКСПРЕС',
    text: 'Скидає перезарядку ривка, на 4 с додає швидкість на 40% і на мить робить невразливим.',
    color: '#f0c15e',
  },
  solomia: {
    id: 'jam',
    name: 'Глушилка',
    button: 'ГЛУШИЛКА',
    text: 'Знищує всі ворожі снаряди поруч і на 1,3 с оглушує ворогів у великому колі.',
    color: '#c4a8ee',
  },
};
export const heroAbility = (hero: string) =>
  HERO_ABILITIES[hero] ?? HERO_ABILITIES.mechanic;

export const QUAKE = { radius: 235, damage: 3.5, push: 60 };
export const DISCHARGE = {
  first: 380,
  jump: 200,
  max: 6,
  damage: 3.2,
  falloff: 0.9,
  stagger: 0.8,
};
export const BLOOM = { radius: 270, heal: 0.12, slow: 3.5, damage: 1.6 };
export const AUDIT = {
  radius: 300,
  damage: 1.5,
  share: 0.2,
  leaderShare: 0.02,
  seconds: 5,
  coins: 1.5,
  perEnemy: 1,
  cap: 6,
};

export const SCALD = { radius: 260, hit: 0.8, dps: 0.8, seconds: 3.5 };
export const VOLLEY = { count: 16, damage: 1.3, speed: 620, life: 0.6, pierce: 1 };
export const WARD = { charges: 2, cap: 4, heal: 0.06 };
export const EXPRESS = { haste: 1.4, seconds: 4, guard: 0.5 };
export const JAM = { radius: 420, stagger: 1.3, damage: 0.6 };

// The enemies a chain of lightning visits: the nearest one in reach of the
// origin, then each time the nearest unvisited one within a jump of the last.
export function chainTargets<T extends { x: number; y: number; hp: number }>(
  from: { x: number; y: number },
  pool: readonly T[],
  opts: { first: number; jump: number; max: number },
): T[] {
  const out: T[] = [];
  let x = from.x,
    y = from.y,
    reach = opts.first;
  while (out.length < opts.max) {
    let best: T | null = null,
      bestD = reach;
    for (const e of pool) {
      if (e.hp <= 0 || out.includes(e)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) break;
    out.push(best);
    x = best.x;
    y = best.y;
    reach = opts.jump;
  }
  return out;
}
