// The smallest piece of MQTT 3.1.1 that a game needs to talk through a public
// broker: connect, subscribe to a topic, publish, keep alive, and read what
// comes back (QoS 0 only). It is the way out when two devices cannot connect
// directly (see app/relay-link.ts): a broker on the internet carries the
// messages instead. Nothing here knows about the browser.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytes = (...parts: (ArrayLike<number> | number)[]): Uint8Array => {
  const flat: number[] = [];
  for (const p of parts)
    if (typeof p === 'number') flat.push(p);
    else for (let i = 0; i < p.length; i++) flat.push(p[i]);
  return Uint8Array.from(flat);
};
const text = (s: string) => {
  const b = encoder.encode(s);
  return bytes(b.length >> 8, b.length & 255, b);
};
// The "remaining length" of a packet: seven bits per byte, up to four bytes.
function length(n: number): number[] {
  const out: number[] = [];
  do {
    let digit = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) digit |= 128;
    out.push(digit);
  } while (n > 0);
  return out;
}
const packet = (first: number, body: Uint8Array) =>
  bytes(first, length(body.length), body);

export function connectPacket(clientId: string, keepAlive = 30): Uint8Array {
  return packet(
    0x10,
    bytes(text('MQTT'), 4, 0x02, keepAlive >> 8, keepAlive & 255, text(clientId)),
  );
}
export function subscribePacket(id: number, topic: string): Uint8Array {
  return packet(0x82, bytes(id >> 8, id & 255, text(topic), 0));
}
export function publishPacket(topic: string, payload: string): Uint8Array {
  return packet(0x30, bytes(text(topic), encoder.encode(payload)));
}
export const PING = bytes(0xc0, 0);
export const DISCONNECT = bytes(0xe0, 0);

export type Packet =
  | { type: 'connack'; code: number }
  | { type: 'suback' }
  | { type: 'pingresp' }
  | { type: 'publish'; topic: string; payload: string }
  | { type: 'other'; id: number };

// Packets can arrive whole or in pieces: feed what comes, get whole packets.
export class Reader {
  private buf = new Uint8Array(0);
  // A packet longer than this is not ours: the connection is dropped.
  static readonly MAX = 1 << 20;
  push(chunk: Uint8Array): Packet[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    const out: Packet[] = [];
    for (;;) {
      const b = this.buf;
      if (b.length < 2) break;
      let size = 0,
        mult = 1,
        at = 1,
        done = false;
      while (at < b.length && at <= 4) {
        const d = b[at++];
        size += (d & 127) * mult;
        mult *= 128;
        if (!(d & 128)) {
          done = true;
          break;
        }
      }
      if (!done) {
        // Four length bytes and no end, or not all of them yet.
        if (at > 4) throw new Error('mqtt: bad length');
        break;
      }
      if (size > Reader.MAX) throw new Error('mqtt: too long');
      if (b.length < at + size) break;
      const body = b.subarray(at, at + size);
      this.buf = b.slice(at + size);
      out.push(this.read(b[0], body));
    }
    return out;
  }
  private read(first: number, body: Uint8Array): Packet {
    const type = first >> 4;
    if (type === 2) return { type: 'connack', code: body[1] ?? 255 };
    if (type === 9) return { type: 'suback' };
    if (type === 13) return { type: 'pingresp' };
    if (type === 3) {
      const qos = (first >> 1) & 3,
        n = (body[0] << 8) | body[1],
        topic = decoder.decode(body.subarray(2, 2 + n)),
        start = 2 + n + (qos > 0 ? 2 : 0);
      return { type: 'publish', topic, payload: decoder.decode(body.subarray(start)) };
    }
    return { type: 'other', id: type };
  }
}
