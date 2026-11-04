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
import type { Link, Msg, VoiceLink } from '@/lib/game/net';
import {
  decodeLaw,
  Framer,
  JitterClock,
  readVox,
  toBase64,
  VOX,
} from '@/lib/game/vox';

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

// Messages that may be lost without harm: the next one replaces them. Every
// other message is delivered for certain (numbered, acknowledged and sent again
// until it is), because the public brokers drop messages when they come too
// fast (about ten a second were seen to get through).
const LOSSY = new Set(['snap', 'pin']);
// A message not acknowledged for this long is sent again.
const RESEND = 1200;
const RESEND_EVERY = 400;
const ACK_AFTER = 120;
const PENDING_MAX = 300;

// One end of a relayed conversation, as a Link for the NetSession.
class RelayLink implements Link {
  readonly kind = 'relay' as const;
  onMessage: ((msg: Msg) => void) | null = null;
  onClose: (() => void) | null = null;
  open = true;
  // The walkie-talkie voice of this link (see RelayVoice), once it is up.
  voice?: VoiceLink;
  voicePending = true;
  onVoice: (() => void) | null = null;
  private heard = Date.now();
  private beat = 0;
  private resend = 0;
  private ack = 0;
  // The numbered messages: sent and not yet acknowledged, and what the other
  // end has sent (the next number to hand on, and those that came early).
  private seq = 0;
  private pending = new Map<number, { body: Record<string, unknown>; at: number }>();
  private expect = 1;
  private early = new Map<number, Record<string, unknown>>();
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
    this.resend = window.setInterval(() => {
      if (!this.open) return;
      const now = Date.now();
      for (const entry of this.pending.values())
        if (now - entry.at > RESEND) {
          entry.at = now;
          this.out(entry.body);
        }
    }, RESEND_EVERY);
  }
  // How many messages came from / went to the other end, by kind (for tracing).
  seen: Record<string, number> = {};
  sent: Record<string, number> = {};
  send(msg: Msg) {
    this.sent[msg.t] = (this.sent[msg.t] ?? 0) + 1;
    if (!this.open) return;
    // A press of the dash or the ability must arrive: only plain steering of
    // the stick may be lost.
    const lossy = LOSSY.has(msg.t) && !(msg.t === 'pin' && msg.f);
    if (lossy) this.out({ m: msg });
    else {
      const q = ++this.seq;
      const body = { m: msg, q };
      if (this.pending.size >= PENDING_MAX)
        this.pending.delete(this.pending.keys().next().value as number);
      this.pending.set(q, { body, at: Date.now() });
      this.out(body);
    }
  }
  // What came from the other end.
  take(body: Record<string, unknown>) {
    this.heard = Date.now();
    if (body.k === 'bye') return this.shut();
    if (body.k === 'rcv') {
      // Everything up to this number has arrived.
      if (typeof body.a === 'number')
        for (const q of [...this.pending.keys()])
          if (q <= body.a) this.pending.delete(q);
      return;
    }
    if (typeof body.q === 'number') {
      this.acknowledge();
      // Handed on in order; a repeat is dropped, an early one waits its turn.
      if (body.q < this.expect) return;
      this.early.set(body.q, body);
      for (let next = this.early.get(this.expect); next; ) {
        this.early.delete(this.expect++);
        this.deliver(next);
        next = this.early.get(this.expect);
      }
      return;
    }
    this.deliver(body);
  }
  private deliver(body: Record<string, unknown>) {
    const msg = body.m as { t?: unknown } | undefined;
    if (!msg || typeof msg !== 'object') return;
    const kind = String(msg.t ?? '?');
    this.seen[kind] = (this.seen[kind] ?? 0) + 1;
    this.onMessage?.(msg as Msg);
  }
  // Tells the other end what has arrived, a moment after the last one.
  private acknowledge() {
    if (this.ack) return;
    this.ack = window.setTimeout(() => {
      this.ack = 0;
      if (this.open) this.out({ k: 'rcv', a: this.expect - 1 });
    }, ACK_AFTER);
  }
  shut() {
    if (!this.open) return;
    this.open = false;
    window.clearInterval(this.beat);
    window.clearInterval(this.resend);
    window.clearTimeout(this.ack);
    this.voice?.dispose();
    this.voice = undefined;
    this.voicePending = false;
    this.release();
    this.onClose?.();
  }
  // The voice connection is ready (or did not come up).
  giveVoice(voice: RelayVoice | null) {
    this.voicePending = false;
    if (voice && this.open) this.voice = voice;
    else voice?.dispose();
    this.onVoice?.();
  }
  close() {
    if (this.open) this.out({ k: 'bye' });
    this.shut();
  }
}

// Voice over the relay, as a walkie-talkie: a connection of its own to the same
// broker (the broker allows only about ten messages a second to one connection,
// and the game's own messages must not be crowded out) carries the sound as the
// small frames of lib/game/vox.ts, and the partner's frames come out as a
// MediaStream, so the screens treat it like a call.
class RelayVoice implements VoiceLink {
  onStream: ((stream: MediaStream | null) => void) | null = null;
  stream: MediaStream | null = null;
  private seq = 0;
  private mic: {
    ctx: AudioContext;
    src: MediaStreamAudioSourceNode;
    proc: ScriptProcessorNode;
    mute: GainNode;
  } | null = null;
  private play: {
    ctx: AudioContext;
    dest: MediaStreamAudioDestinationNode;
    clock: JitterClock;
  } | null = null;
  private constructor(
    private broker: Broker,
    // The topics: what this end sends on, and what it listens to.
    private out: string,
    private gid: string,
  ) {}
  static async open(
    url: string,
    code: string,
    role: 'host' | 'guest',
    gid: string,
  ): Promise<RelayVoice | null> {
    if (typeof AudioContext === 'undefined') return null;
    const b = new Broker(url);
    if (!(await b.connect())) return null;
    const mine = role === 'host' ? 'vh' : 'vg',
      theirs = role === 'host' ? 'vg' : 'vh';
    const voice = new RelayVoice(b, `${root(code)}/${mine}`, gid);
    b.subscribe(`${root(code)}/${theirs}`);
    b.onPublish = (_t, body) => voice.hear(body);
    b.onClose = () => voice.dispose();
    return voice;
  }
  send(stream: MediaStream) {
    this.stop();
    const ctx = new AudioContext();
    void ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const framer = new Framer(ctx.sampleRate);
    proc.onaudioprocess = (e) => {
      for (const frame of framer.push(e.inputBuffer.getChannelData(0)))
        this.broker.publish(this.out, {
          g: this.gid,
          n: ++this.seq,
          d: toBase64(frame),
        });
    };
    src.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
    this.mic = { ctx, src, proc, mute };
  }
  replace(stream: MediaStream) {
    if (!this.mic) return false;
    this.mic.src.disconnect();
    this.mic.src = this.mic.ctx.createMediaStreamSource(stream);
    this.mic.src.connect(this.mic.proc);
    return true;
  }
  stop() {
    const m = this.mic;
    if (!m) return;
    this.mic = null;
    m.proc.onaudioprocess = null;
    try {
      m.src.disconnect();
      m.proc.disconnect();
      m.mute.disconnect();
    } catch {
      // Already apart.
    }
    void m.ctx.close();
  }
  // A frame from the partner: played after the ones before it.
  private hear(body: unknown) {
    const frame = readVox(body, this.gid);
    if (!frame) return;
    if (!this.play) {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      this.play = { ctx, dest, clock: new JitterClock() };
      this.stream = dest.stream;
      this.onStream?.(this.stream);
    }
    const { ctx, dest, clock } = this.play;
    if (ctx.state !== 'running') void ctx.resume();
    const samples = decodeLaw(frame.bytes);
    const at = clock.place(ctx.currentTime, samples.length / VOX.rate, frame.n);
    if (at === null) return;
    const buffer = ctx.createBuffer(1, samples.length, VOX.rate);
    buffer.copyToChannel(samples, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(dest);
    source.start(at);
  }
  dispose() {
    this.stop();
    this.broker.onClose = null;
    this.broker.close();
    this.onStream?.(null);
    this.onStream = null;
    this.stream = null;
    void this.play?.ctx.close();
    this.play = null;
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
      void RelayVoice.open(b.url, code, 'host', id).then((v) => link.giveVoice(v));
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
            const made = link;
            void RelayVoice.open(b.url, code, 'guest', id).then((v) => made.giveVoice(v));
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
