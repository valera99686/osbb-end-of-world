// What the E key does for each head of ОСББ. The numbers are here, not in the
// engine, so the UI text, the tests and the fight all read one source.
export interface HeroAbility {
  id: 'quake' | 'discharge' | 'bloom' | 'audit';
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
