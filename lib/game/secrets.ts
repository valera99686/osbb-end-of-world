import type { Meta } from './model';

// Hidden achievements. A secret is found once and kept in Meta.secrets; the
// achievement list shows it as «???» until then.
export const SECRETS = ['konami', 'night'] as const;
export type SecretId = (typeof SECRETS)[number];
export const isSecret = (id: unknown): id is SecretId =>
  typeof id === 'string' && (SECRETS as readonly string[]).includes(id);

export function discover(meta: Meta, id: SecretId): Meta {
  const known = meta.secrets ?? [];
  return known.includes(id) ? meta : { ...meta, secrets: [...known, id] };
}

// The old cheat code: up up down down left right left right B A.
export const KONAMI: readonly string[] = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
];
// Feeds one key into the code: `at` is how many keys of it are already right.
// A wrong key starts over (and still counts as the first key when it is one).
export function konamiStep(
  at: number,
  key: string,
): { at: number; done: boolean } {
  const k = key.toLowerCase();
  const next = k === KONAMI[at] ? at + 1 : k === KONAMI[0] ? 1 : 0;
  return next === KONAMI.length ? { at: 0, done: true } : { at: next, done: false };
}

// For a touch screen: seven quick taps on the title do the same.
export const TAP_COUNT = 7;
export const TAP_WINDOW_MS = 3000;
export function tapStep(
  taps: readonly number[],
  now: number,
): { taps: number[]; done: boolean } {
  const recent = [...taps.filter((t) => now - t <= TAP_WINDOW_MS), now];
  return recent.length >= TAP_COUNT
    ? { taps: [], done: true }
    : { taps: recent, done: false };
}

// Quiet hours of the building: Марта complains about every raid that starts
// between 22:00 and 04:59 by the player's own clock.
export function isQuietHour(date: Date): boolean {
  const h = date.getHours();
  return h >= 22 || h < 5;
}
