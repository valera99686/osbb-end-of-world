// The way out when two devices cannot connect directly (mobile internet, strict
// routers; there is no free relay of the WebRTC kind left, see net.ts): the
// game's messages go through a public, free MQTT broker on the internet, over a
// secure WebSocket, which needs no account and no setting up. It is slower
// (a quarter of a second or so) and the broker is somebody else's, so it is
// used only when the direct connection did not come up, and the host then
// counts the fights alone (net.ts ShareMode 'host'), which a late link suits.
//
// A room is the topics `osbb17/CODE/up` (guest to host) and
// `osbb17/CODE/to/GUEST` (host to one guest). The host listens on every broker
// it can reach; a guest tries them one after the other until the host answers.
import {
  connectPacket,
  DISCONNECT,
  PING,
  publishPacket,
  Reader,
  subscribePacket,
} from '@/lib/game/mqtt';
import type { Link, Msg } from '@/lib/game/net';

export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/',
  'wss://mqtt.eclipseprojects.io:443/mqtt',
];
const CONNECT_TIMEOUT = 6000;
const KNOCK_EVERY = 1200;
const KNOCK_TIMEOUT = 4500;
// A link that has heard nothing for this long is gone.
const SILENCE = 20000;
const BEAT = 5000;

const root = (code: string) => `osbb17/${code}`;
const rand = () => Math.random().toString(36).slice(2, 10);

// One connection to one broker.
class Broker {
  private ws: WebSocket | null = null;
  private reader = new Reader();
  private timer = 0;
  private nextId = 1;
  onPublish: ((topic: string, body: unknown) => void) | null = null;
  onClose: (() => void) | null = null;
  constructor(readonly url: string) {}
  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(limit);
        if (!ok) this.close();
        resolve(ok);
      };
      const limit = setTimeout(() => done(false), CONNECT_TIMEOUT);
      try {
        const ws = new WebSocket(this.url, 'mqtt');
        ws.binaryType = 'arraybuffer';
        this.ws = ws;
        ws.onopen = () => ws.send(connectPacket('osbb-' + rand()));
        ws.onerror = () => done(false);
        ws.onclose = () => {
          if (!settled) done(false);
          else {
            window.clearInterval(this.timer);
            this.onClose?.();
          }
        };
        ws.onmessage = (ev) => {
          try {
            for (const p of this.reader.push(new Uint8Array(ev.data))) {
              if (p.type === 'connack') {
                if (p.code === 0) {
                  this.timer = window.setInterval(
                    () => this.raw(PING),
                    BEAT * 3,
                  );
                  done(true);
                } else done(false);
              } else if (p.type === 'publish') {
                let body: unknown = null;
                try {
                  body = JSON.parse(p.payload);
                } catch {
                  // Not ours: ignored.
                }
                if (body && typeof body === 'object')
                  this.onPublish?.(p.topic, body);
              }
            }
          } catch {
            this.close();
          }
        };
      } catch {
        done(false);
      }
    });
  }
  private raw(data: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
  }
  subscribe(topic: string) {
    this.raw(subscribePacket(this.nextId++, topic));
  }
  publish(topic: string, body: unknown) {
    this.raw(publishPacket(topic, JSON.stringify(body)));
  }
  close() {
    window.clearInterval(this.timer);
    try {
      this.raw(DISCONNECT);
      this.ws?.close();
    } catch {
      // Already closed.
    }
    this.ws = null;
  }
}

// One end of a relayed conversation, as a Link for the NetSession.
class RelayLink implements Link {
  readonly kind = 'relay' as const;
  onMessage: ((msg: Msg) => void) | null = null;
  onClose: (() => void) | null = null;
  open = true;
  private heard = Date.now();
  private beat = 0;
  constructor(
    private out: (body: unknown) => void,
    private release: () => void,
  ) {
    // A heartbeat each way, so that a vanished partner is noticed.
    this.beat = window.setInterval(() => {
      if (!this.open) return;
      this.out({ k: 'beat' });
      if (Date.now() - this.heard > SILENCE) this.shut();
    }, BEAT);
  }
  send(msg: Msg) {
    if (this.open) this.out({ m: msg });
  }
  // What came from the other end.
  take(body: Record<string, unknown>) {
    this.heard = Date.now();
    if (body.k === 'bye') this.shut();
    else if (body.m && typeof body.m === 'object')
      this.onMessage?.(body.m as Msg);
  }
  shut() {
    if (!this.open) return;
    this.open = false;
    window.clearInterval(this.beat);
    this.release();
    this.onClose?.();
  }
  close() {
    if (this.open) this.out({ k: 'bye' });
    this.shut();
  }
}

export interface RelayHandle {
  close(): void;
}

// Host: waits on every broker it can reach, and hands over a link when a guest
// knocks (a second guest is turned away while the first one is in).
export async function listenRelay(
  code: string,
  on: { guest: (link: Link) => void; taken: () => boolean },
): Promise<RelayHandle> {
  const up = `${root(code)}/up`;
  const brokers: Broker[] = [];
  let guest: { id: string; link: RelayLink } | null = null;
  let closed = false;
  const listen = async (url: string) => {
    const b = new Broker(url);
    if (!(await b.connect()) || closed) {
      b.close();
      return;
    }
    brokers.push(b);
    b.subscribe(up);
    const to = (id: string) => `${root(code)}/to/${id}`;
    b.onPublish = (_topic, body) => {
      const m = body as Record<string, unknown>;
      const id = typeof m.g === 'string' && /^[a-z0-9]{4,16}$/.test(m.g) ? m.g : '';
      if (!id) return;
      if (guest && guest.id === id) {
        if (m.k === 'knock') b.publish(to(id), { k: 'ack' });
        else guest.link.take(m);
        return;
      }
      if (m.k !== 'knock') return;
      if ((guest && guest.link.open) || on.taken()) {
        b.publish(to(id), { k: 'busy' });
        return;
      }
      const link = new RelayLink(
        (out) => b.publish(to(id), out),
        () => {
          if (guest?.link === link) guest = null;
        },
      );
      guest = { id, link };
      b.publish(to(id), { k: 'ack' });
      on.guest(link);
    };
  };
  await Promise.all(BROKERS.map(listen));
  return {
    close() {
      closed = true;
      guest?.link.close();
      for (const b of brokers) b.close();
    },
  };
}

// Guest: knocks on the broker, one after the other, until the host answers.
export function joinRelay(
  code: string,
  on: { link: (link: Link) => void; busy: () => void; fail: () => void },
): RelayHandle {
  const id = rand();
  let stopped = false;
  let current: Broker | null = null;
  let link: RelayLink | null = null;
  const run = async () => {
    for (const url of BROKERS) {
      if (stopped) return;
      const b = new Broker(url);
      current = b;
      if (!(await b.connect())) continue;
      const answer = await new Promise<'ack' | 'busy' | ''>((resolve) => {
        let knock = 0;
        const stop = (v: 'ack' | 'busy' | '') => {
          clearInterval(knock);
          clearTimeout(limit);
          resolve(v);
        };
        const limit = setTimeout(() => stop(''), KNOCK_TIMEOUT);
        b.subscribe(`${root(code)}/to/${id}`);
        b.onPublish = (_t, body) => {
          const m = body as Record<string, unknown>;
          if (m.k === 'ack') {
            // From here on, what the host says is for the link.
            link = new RelayLink(
              (out) => b.publish(`${root(code)}/up`, { g: id, ...(out as object) }),
              () => b.close(),
            );
            b.onPublish = (_x, more) => link?.take(more as Record<string, unknown>);
            b.onClose = () => link?.shut();
            stop('ack');
          } else if (m.k === 'busy') stop('busy');
        };
        const send = () => b.publish(`${root(code)}/up`, { g: id, k: 'knock' });
        // Subscribed first, so that the answer is not missed.
        setTimeout(send, 250);
        knock = window.setInterval(send, KNOCK_EVERY);
      });
      if (stopped) {
        b.close();
        return;
      }
      if (answer === 'ack' && link) {
        on.link(link);
        return;
      }
      b.close();
      if (answer === 'busy') {
        on.busy();
        return;
      }
    }
    if (!stopped) on.fail();
  };
  void run();
  return {
    close() {
      stopped = true;
      if (link) link.close();
      else current?.close();
    },
  };
}
