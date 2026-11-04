// Voice through a relay: a public MQTT broker cannot carry a WebRTC call, so
// the sound is sent as small frames instead: 250 ms of speech, one byte a
// sample at 8 kHz (µ-law, telephone quality), about 3 KB a frame as text, four
// frames a second, and nothing at all while nobody speaks. These are the pure
// parts (the codec, the frames, the gate and the jitter clock); the browser
// parts that capture and play are in app/relay-voice.ts.

// What goes over the wire: 8 kHz, 250 ms a frame.
export const VOX = {
  rate: 8000,
  frame: 2000,
  // Loudness (0..1) above which a frame is speech, and how many frames still
  // go after the last one that was (so the ends of words are not cut).
  gate: 0.02,
  hang: 2,
  // A frame may not be larger than this (samples), whatever it claims.
  max: 4000,
  // How long the player waits before the first frame is played, and how far
  // behind the clock a frame may fall before the wait is made again (seconds).
  jitter: 0.4,
  late: 0.05,
  // Frames that would play later than this from now are dropped: the sound
  // would only fall further behind.
  ahead: 1.6,
} as const;

// µ-law (G.711) of one sample in -1..1.
export function muLaw(x: number): number {
  let s = Math.round(Math.max(-1, Math.min(1, x)) * 32767);
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  s = Math.min(s, 32635) + 0x84;
  let exp = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; mask >>= 1) exp--;
  const mant = (s >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mant) & 0xff;
}
// A byte of µ-law back to -1..1.
export function unLaw(b: number): number {
  const u = ~b & 0xff;
  const sign = u & 0x80;
  const exp = (u >> 4) & 0x07;
  const mant = u & 0x0f;
  const s = (((mant << 3) + 0x84) << exp) - 0x84;
  return (sign ? -s : s) / 32768;
}
export function encodeLaw(samples: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = muLaw(samples[i]);
  return out;
}
export function decodeLaw(bytes: ArrayLike<number>): Float32Array<ArrayBuffer> {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = unLaw(bytes[i]);
  return out;
}

// Takes samples at any rate and gives them at VOX.rate, each output sample the
// average of the input samples it covers (a plain low-pass), keeping what is
// left over between blocks.
export class Downsampler {
  private acc = 0;
  private n = 0;
  private t = 0;
  constructor(private from: number) {}
  push(x: ArrayLike<number>, out: number[]) {
    const r = this.from / VOX.rate;
    for (let i = 0; i < x.length; i++) {
      this.acc += x[i];
      this.n++;
      this.t++;
      if (this.t >= r) {
        out.push(this.acc / this.n);
        this.acc = 0;
        this.n = 0;
        this.t -= r;
      }
    }
  }
}

// Cuts the samples into frames and lets through only the speech.
export class Framer {
  private buf: number[] = [];
  private hang = 0;
  private down: Downsampler;
  constructor(from: number) {
    this.down = new Downsampler(from);
  }
  // Frames (as bytes) that are ready after these samples; those of silence are
  // not among them.
  push(x: ArrayLike<number>): Uint8Array[] {
    this.down.push(x, this.buf);
    const frames: Uint8Array[] = [];
    while (this.buf.length >= VOX.frame) {
      const part = this.buf.splice(0, VOX.frame);
      let peak = 0;
      for (const v of part) peak = Math.max(peak, Math.abs(v));
      if (peak > VOX.gate) this.hang = VOX.hang;
      else if (this.hang > 0) this.hang--;
      else continue;
      frames.push(encodeLaw(part));
    }
    return frames;
  }
}

// Base64 of bytes and back, with the limits of a frame.
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x2000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  return btoa(s);
}
export function fromBase64(text: unknown): Uint8Array | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > VOX.max * 2)
    return null;
  try {
    const s = atob(text);
    if (s.length > VOX.max) return null;
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// A frame on the wire and the frame read back (null if it is not one of ours).
export interface Vox {
  // Who speaks: the guest's id, so a frame of an old guest is not played.
  g: string;
  n: number;
  d: string;
}
export function readVox(x: unknown, guest: string): { n: number; bytes: Uint8Array } | null {
  if (!x || typeof x !== 'object') return null;
  const v = x as Partial<Vox>;
  if (v.g !== guest || typeof v.n !== 'number' || !Number.isInteger(v.n) || v.n < 0)
    return null;
  const bytes = fromBase64(v.d);
  return bytes && bytes.length > 0 ? { n: v.n, bytes } : null;
}

// Decides when each frame is played: one after another with no gap, after a
// short wait at the start (and after every underrun) so that a late frame does
// not make a hole. Returns the start time (in the context's seconds), or null
// when the frame is too far behind or ahead to be worth playing.
export class JitterClock {
  private next = 0;
  private last = -1;
  // `now` is the context's clock, `length` the frame's duration in seconds.
  place(now: number, length: number, n: number): number | null {
    // A repeat or a frame from the past is not played.
    if (n <= this.last) return null;
    this.last = n;
    if (this.next < now + VOX.late) this.next = now + VOX.jitter;
    if (this.next - now > VOX.ahead) return null;
    const at = this.next;
    this.next += length;
    return at;
  }
  reset() {
    this.next = 0;
    this.last = -1;
  }
}
