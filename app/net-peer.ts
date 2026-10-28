// The browser end of online co-op: PeerJS gives each room a name on its free
// public broker, which only passes the handshake along; the game itself runs
// over a direct WebRTC data channel between the two devices. The library is
// loaded on demand, so players who never go online never download it.
import type { DataConnection, Peer } from 'peerjs';
import { makeCode, type Link, type Msg } from '@/lib/game/net';

// Keeps our rooms apart from any other program using the same broker.
const PREFIX = 'osbb17-';
const JOIN_TIMEOUT = 20000;
const OPEN_TIMEOUT = 15000;

class PeerLink implements Link {
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
export interface Handle {
  close(): void;
}
async function peerClass(): Promise<typeof Peer> {
  const lib = await import('peerjs');
  return lib.Peer ?? (lib as unknown as { default: typeof Peer }).default;
}

// Opens a room: calls back with its code once the broker knows it, and with a
// link each time a guest connects (a second guest is turned away while the
// first one is in).
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
  const attempt = (tries: number) => {
    const code = makeCode();
    const p = new PeerCtor(PREFIX + code, { debug: 0 });
    peer = p;
    const timer = setTimeout(() => {
      if (!closed && !p.open) {
        p.destroy();
        on.error(describeError('network'));
      }
    }, OPEN_TIMEOUT);
    p.on('open', () => {
      clearTimeout(timer);
      on.code(code);
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      if (closed) return;
      const type = (e as { type?: string }).type;
      if (type === 'unavailable-id' && tries < 6) {
        p.destroy();
        attempt(tries + 1);
      } else on.error(describeError(type));
    });
    p.on('connection', (conn) => {
      if (current?.open) {
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
  attempt(0);
  return {
    close() {
      closed = true;
      current?.close();
      peer?.destroy();
    },
  };
}

// Joins the room with this code and calls back with the open link.
export async function joinRoom(
  code: string,
  on: { link: (link: Link) => void; error: (why: string) => void },
): Promise<Handle> {
  const PeerCtor = await peerClass();
  const peer = new PeerCtor({ debug: 0 });
  let finished = false;
  const fail = (why: string) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    on.error(why);
    peer.destroy();
  };
  const timer = setTimeout(
    () => fail('net:Не вдалося з’єднатися: мережа, схоже, не пускає пряме з’єднання між вами.'),
    JOIN_TIMEOUT,
  );
  peer.on('error', (e) => fail(describeError((e as { type?: string }).type)));
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code, {
      reliable: true,
      serialization: 'json',
    });
    conn.on('open', () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      on.link(new PeerLink(conn));
    });
    conn.on('error', () => fail(describeError('webrtc')));
  });
  return {
    close() {
      finished = true;
      clearTimeout(timer);
      peer.destroy();
    },
  };
}
