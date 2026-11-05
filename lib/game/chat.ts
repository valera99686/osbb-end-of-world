// Chat of an online room: text lines and quick phrases between the two players.
// Pure rules only (what a line may be, how fast a partner may send them); the
// session (session.ts) keeps the log and the screens (app/chat-dock.tsx) show it.

export const CHAT = {
  // The longest line, in characters.
  max: 200,
  // How many lines the log keeps.
  keep: 60,
  // A partner who sends more than `burst` lines in `window` ms is not heard
  // (a stuck key or a bad actor cannot flood the other screen).
  burst: 6,
  window: 4000,
} as const;

// Quick phrases: one tap in a fight, where there is no time to type. They are
// sent as their number, so each end writes them in its own words.
export const QUICK = [
  'Уперед!',
  'Допоможи!',
  'Підніми мене',
  'Стій там',
  'Дякую!',
  'Іду до магазину',
  'Береш цей предмет?',
  'Гаразд',
  'Ні',
  'Зачекай',
] as const;

export interface ChatLine {
  // A number that only grows, for the list keys and for «what is new».
  id: number;
  // Whose line it is.
  mine: boolean;
  text: string;
  // The number of the quick phrase it was sent as, if it was one.
  quick?: number;
  // When it was said (ms since 1970, at this end).
  at: number;
}

// What is left of a line a person typed (or a link sent): no control
// characters, runs of spaces folded to one, at most CHAT.max characters.
// Null when nothing is left to say.
export function cleanChat(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  let out = '';
  for (const ch of text.slice(0, CHAT.max * 2)) {
    const c = ch.codePointAt(0)!;
    const hidden =
      c < 32 ||
      (c >= 0x7f && c <= 0x9f) ||
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x2028 && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069);
    out += hidden ? ' ' : ch;
  }
  // Counted by code point on purpose, so an emoji is one character.
  // oxlint-disable-next-line typescript/no-misused-spread
  const line = [...out.replace(/\s+/g, ' ').trim()]
    .slice(0, CHAT.max)
    .join('')
    .trim();
  return line || null;
}

// The words of a quick phrase by its number, or null if there is no such one.
export function quickText(q: unknown): string | null {
  return typeof q === 'number' && Number.isInteger(q) && q >= 0 && q < QUICK.length
    ? QUICK[q]
    : null;
}

// Counts what a partner sends: `allow` is false once they are over the limit.
export class ChatLimiter {
  private times: number[] = [];
  allow(now: number, burst: number = CHAT.burst, window: number = CHAT.window) {
    this.times = this.times.filter((t) => now - t < window);
    if (this.times.length >= burst) return false;
    this.times.push(now);
    return true;
  }
}
