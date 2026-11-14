// The room a device was in, kept so that a player thrown out of a game (a
// closed tab, a dropped link, a phone that slept) can come back to the very
// same raid: a guest keeps its seat and its token, the host keeps the code of
// the room and the tokens of its guests.
import type { SavedSeat } from '@/lib/game/session';

export const GUEST_ROOM_KEY = 'osbb.room';
export const HOST_ROOM_KEY = 'osbb.hostroom';
// A room is remembered for this long (ms).
const KEEP = 6 * 3600 * 1000;

export interface GuestRoom {
  code: string;
  seat: number;
  token: string;
  build: string;
  at: number;
}
export interface HostRoom {
  code: string;
  build: string;
  mode: 'sync' | 'host';
  seats: SavedSeat[];
  at: number;
}
const read = (key: string): Record<string, unknown> | null => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Only a convenience: the way back is lost.
  }
};
const fresh = (at: unknown) =>
  typeof at === 'number' && Date.now() - at < KEEP && Date.now() >= at - 60000;
const code = (x: unknown) =>
  typeof x === 'string' && /^[A-Z0-9]{5}$/.test(x) ? x : '';

export function loadGuestRoom(build: string): GuestRoom | null {
  const v = read(GUEST_ROOM_KEY);
  if (
    !v ||
    !code(v.code) ||
    typeof v.token !== 'string' ||
    v.token.length < 8 ||
    v.token.length > 64 ||
    !Number.isInteger(v.seat) ||
    (v.seat as number) < 1 ||
    (v.seat as number) > 3 ||
    v.build !== build ||
    !fresh(v.at)
  )
    return null;
  return v as unknown as GuestRoom;
}
export const saveGuestRoom = (room: GuestRoom | null) =>
  write(GUEST_ROOM_KEY, room);

export function loadHostRoom(build: string): HostRoom | null {
  const v = read(HOST_ROOM_KEY);
  if (
    !v ||
    !code(v.code) ||
    v.build !== build ||
    !fresh(v.at) ||
    !Array.isArray(v.seats) ||
    v.seats.length < 1 ||
    v.seats.length > 3 ||
    !v.seats.every(
      (s: unknown) =>
        !!s &&
        typeof s === 'object' &&
        typeof (s as SavedSeat).token === 'string' &&
        typeof (s as SavedSeat).hero === 'string' &&
        typeof (s as SavedSeat).name === 'string',
    )
  )
    return null;
  return {
    code: v.code as string,
    build,
    mode: v.mode === 'host' ? 'host' : 'sync',
    seats: (v.seats as SavedSeat[]).map((s) => ({
      token: s.token.slice(0, 64),
      hero: s.hero.slice(0, 40),
      name: s.name.slice(0, 40),
    })),
    at: v.at as number,
  };
}
export const saveHostRoom = (room: HostRoom | null) =>
  write(HOST_ROOM_KEY, room);
