// The relay (TURN) a player has set up for online co-op, kept on this device
// only (net.ts explains why there is none by default).
import { parseRelay, type Relay } from '@/lib/game/net';

const KEY = 'osbb.relay';

export function savedRelay(): Relay | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Relay> | null;
    return parseRelay(
      Array.isArray(o?.urls) ? o.urls.join(' ') : '',
      o?.username,
      o?.credential,
    );
  } catch {
    return null;
  }
}
export function saveRelay(relay: Relay | null) {
  try {
    if (relay) localStorage.setItem(KEY, JSON.stringify(relay));
    else localStorage.removeItem(KEY);
  } catch {
    // Without storage the relay only lasts until the page is closed.
  }
}
