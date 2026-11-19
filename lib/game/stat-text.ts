import type { Stat } from './data';

// Ukrainian plural: 1 снаряд, 2 снаряди, 5 снарядів.
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100,
    b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

const num = (n: number) =>
  Math.abs(n).toLocaleString('uk-UA', { maximumFractionDigits: 2 });

// One stat as a player reads it: «+6 шкоди», «−20% темпу стрільби».
// Luck is the chance of a coin from an enemy: 1 luck = 12 percentage points.
export function statText(stat: Stat, value: number): string {
  const sign = value < 0 ? '−' : '+';
  const n = Math.abs(value);
  switch (stat) {
    case 'damage':
      return `${sign}${num(n)} шкоди`;
    case 'rate':
      return `${sign}${num(n * 100)}% темпу стрільби`;
    case 'speed':
      return `${sign}${num(n)} швидкості`;
    case 'health':
      return `${sign}${num(n)} міцності`;
    case 'armor':
      return `${sign}${num(n)} броні`;
    case 'regen':
      return `${sign}${num(n)} відновлення/с`;
    case 'range':
      return `${sign}${num(n)} дальності`;
    case 'crit':
      return `${sign}${num(n * 100)}% критичного удару`;
    case 'shots':
      return `${sign}${num(n)} ${plural(n, 'снаряд', 'снаряди', 'снарядів')} у залпі`;
    case 'chain':
      return `${sign}${num(n)} ${plural(n, 'ланцюговий удар', 'ланцюгові удари', 'ланцюгових ударів')}`;
    case 'explosion':
      return `${sign}${num(n)} радіусу вибуху снарядів`;
    case 'vampire':
      return `${sign}${num(n)} міцності за кожне вбивство`;
    case 'magnet':
      return `${sign}${num(n)} радіусу збору`;
    case 'drones':
      return `${sign}${num(n)} ${plural(n, 'бойовий дрон', 'бойові дрони', 'бойових дронів')}`;
    case 'orbit':
      return `${sign}${num(n)} ${plural(n, 'орбітальний супутник', 'орбітальні супутники', 'орбітальних супутників')}`;
    case 'luck': {
      const points = Math.round(n * 12 * 10) / 10;
      const word = Number.isInteger(points)
        ? plural(
            points,
            'відсотковий пункт',
            'відсоткові пункти',
            'відсоткових пунктів',
          )
        : 'відсоткового пункта';
      return `${sign}${num(points)} ${word} шансу монет`;
    }
    case 'thorns':
      return `${sign}${num(n)} шкоди у відповідь`;
  }
}

// «+40% темпу стрільби, +6 шкоди. Мінус: −20 міцності.»
export function describeStats(stats: Partial<Record<Stat, number>>): string {
  const entries = Object.entries(stats) as [Stat, number][];
  const plus = entries.filter(([, v]) => v > 0).map(([s, v]) => statText(s, v));
  const minus = entries
    .filter(([, v]) => v < 0)
    .map(([s, v]) => statText(s, v));
  const text = plus.join(', ') + '.';
  return minus.length ? `${text} Мінус: ${minus.join(', ')}.` : text;
}
