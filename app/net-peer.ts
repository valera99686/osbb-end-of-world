// The browser end of online co-op: PeerJS gives each room a name on its free
// public broker, which only passes the handshake along; the game itself runs
// over a direct WebRTC data channel between the two devices. When that does
// not come up (a router that will not connect them), a public MQTT broker
// carries the messages instead (relay-link.ts). The library is loaded on
// demand, so players who never go online never download it.
import type { DataConnection, Peer } from 'peerjs';
import { iceServers, makeCode, type Link, type Msg } from '@/lib/game/net';
import { savedRelay } from './relay';
import { joinRelay, listenRelay, type RelayHandle } from './relay-link';

// Keeps our rooms apart from any other program using the same broker.
const PREFIX = 'osbb17-';
// How long a direct connection gets before the relay joins in, and how long
// the whole attempt may take.
const DIRECT_WAIT = 7000;
const JOIN_TIMEOUT = 32000;
const OPEN_TIMEOUT = 15000;
// The default servers of PeerJS include a free relay that no longer exists, so
// the list is our own: public STUN, and the player's relay if they set one up.
const options = () => ({
  debug: 0,
  config: { iceServers: iceServers(savedRelay()) },
});
// ?relay=only in the address skips the direct connection (for testing, and for
// a player whose direct connection keeps failing).
const relayOnly = () =>
  typeof location !== 'undefined' && /[?&]relay=only\b/.test(location.search);

class PeerLink implements Link {
  readonly kind = 'p2p' as const;
  onMessage: ((msg: Msg) => void) | null = null;
  onClose: (() => void) | null = null;
  constructor(private conn: DataConnection) {
    conn.on('data', (data) => this.onMessage?.(data as Msg));
    conn.on('close', () => this.onClose?.());
    conn.on('error', () => this.onClose?.());
  }
  get open() {
    return this.conn.open;
  }
  send(msg: Msg) {
    if (this.conn.open) this.conn.send(msg);
  }
  close() {
    this.conn.close();
  }
}
// What a PeerJS error means for a person.
export function describeError(type: string | undefined): string {
  switch (type) {
    case 'peer-unavailable':
      return 'room:Кімнату не знайдено. Перевір код: його видно в господаря.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'net:Немає зв’язку з сервером кімнат. Перевір інтернет і спробуй ще раз.';
    case 'webrtc':
    case 'browser-incompatible':
      return 'net:Цей браузер не вміє пряме з’єднання між пристроями.';
    default:
      return 'net:Не вдалося з’єднатися. Спробуй ще раз.';
  }
}
const FAILED =
  'net:Не вдалося з’єднатися ні напряму, ні через резервний канал. Перевір інтернет і код, спробуй іншу мережу або додай свій релей нижче.';
export interface Handle {
  close(): void;
}
async function peerClass(): Promise<typeof Peer> {
  const lib = await import('peerjs');
  return lib.Peer ?? (lib as unknown as { default: typeof Peer }).default;
}

// Opens a room: calls back with its code once the broker knows it, and with a
// link each time a guest connects (a second guest is turned away while the
// first one is in). The relay listens from the moment the room has a code.
export async function createRoom(
  on: {
    code: (code: string) => void;
    guest: (link: Link) => void;
    error: (why: string) => void;
  },
): Promise<Handle> {
  const PeerCtor = await peerClass();
  let peer: Peer | null = null;
  let closed = false;
  let current: DataConnection | null = null;
  let relay: RelayHandle | null = null;
  let relayLink: Link | null = null;
  const taken = () => !!current?.open || !!relayLink?.open;
  const listen = (code: string) => {
    if (relay || closed) return;
    void listenRelay(code, {
      taken,
      guest: (link) => {
        if (closed) return link.close();
        relayLink = link;
        on.guest(link);
      },
    }).then((handle) => {
      if (closed) handle.close();
      else relay = handle;
    });
  };
  const attempt = (tries: number) => {
    const code = makeCode();
    const p = new PeerCtor(PREFIX + code, options());
    peer = p;
    // Without the PeerJS broker there are no direct connections, but the relay
    // can still carry a room.
    const offline = () => {
      p.destroy();
      if (closed) return;
      on.code(code);
      listen(code);
    };
    const timer = setTimeout(() => {
      if (!closed && !p.open) offline();
    }, OPEN_TIMEOUT);
    p.on('open', () => {
      clearTimeout(timer);
      on.code(code);
      listen(code);
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      if (closed) return;
      const type = (e as { type?: string }).type;
      if (type === 'unavailable-id' && tries < 6) {
        p.destroy();
        attempt(tries + 1);
      } else if (!p.open && type !== 'peer-unavailable') offline();
      else on.error(describeError(type));
    });
    p.on('connection', (conn) => {
      if (taken()) {
        // The room is taken: say so and leave.
        conn.on('open', () => {
          conn.send({ t: 'refuse', why: 'busy' } satisfies Msg);
          setTimeout(() => conn.close(), 300);
        });
        return;
      }
      current = conn;
      conn.on('open', () => {
        if (!closed && current === conn) on.guest(new PeerLink(conn));
      });
    });
  };
  if (relayOnly()) {
    const code = makeCode();
    on.code(code);
    listen(code);
  } else attempt(0);
  return {
    close() {
      closed = true;
      current?.close();
      peer?.destroy();
      relay?.close();
    },
  };
}

// Joins the room with this code and calls back with the open link. The direct
// connection gets a few seconds, then the relay tries as well, and the first
// one to open is the link.
export async function joinRoom(
  code: string,
  on: {
    link: (link: Link) => void;
    error: (why: string) => void;
    note?: (text: string) => void;
  },
): Promise<Handle> {
  const direct = !relayOnly();
  const PeerCtor = direct ? await peerClass() : null;
  const peer = PeerCtor ? new PeerCtor(options()) : null;
  let finished = false,
    relay: RelayHandle | null = null,
    directDone = !direct,
    relayDone = false;
  let wait = 0;
  const end = () => {
    finished = true;
    clearTimeout(timer);
    clearTimeout(wait);
  };
  const lose = (why: string) => {
    if (finished) return;
    end();
    on.error(why);
    peer?.destroy();
    relay?.close();
  };
  const win = (link: Link) => {
    if (finished) return link.close();
    end();
    on.link(link);
    // The one that did not make it is let go.
    if (link.kind === 'relay') peer?.destroy();
    else relay?.close();
  };
  const startRelay = () => {
    if (relay || finished) return;
    on.note?.('Пряме з’єднання не виходить, пробуємо резервний канал…');
    relay = joinRelay(code, {
      link: win,
      busy: () => lose('busy'),
      fail: () => {
        relayDone = true;
        if (directDone) lose(FAILED);
      },
    });
  };
  const directFailed = () => {
    directDone = true;
    startRelay();
    if (relayDone) lose(FAILED);
  };
  const timer = setTimeout(() => lose(FAILED), JOIN_TIMEOUT);
  if (!peer) startRelay();
  else {
    const p = peer;
    wait = window.setTimeout(startRelay, DIRECT_WAIT);
    p.on('error', (e) => {
      const type = (e as { type?: string }).type;
      // A room that does not exist is not for the relay to find either.
      if (type === 'peer-unavailable') lose(describeError(type));
      else directFailed();
    });
    p.on('open', () => {
      const conn = p.connect(PREFIX + code, {
        reliable: true,
        serialization: 'json',
      });
      conn.on('open', () => win(new PeerLink(conn)));
      conn.on('error', directFailed);
    });
  }
  return {
    close() {
      finished = true;
      end();
      peer?.destroy();
      relay?.close();
    },
  };
}
