// Procedural sound. SFX are layered one-shot voices; music is a lookahead
// sequencer whose instruments are shared by live play and offline previews.
// Nothing touches Web Audio until unlock(), so the module is Node-safe.

export type SfxKind =
  | 'shoot'
  | 'hit'
  | 'coin'
  | 'dash'
  | 'win'
  | 'pulse'
  | 'kill'
  | 'eliteKill'
  | 'bossPhase'
  | 'pickup'
  | 'heal'
  | 'lowHp'
  | 'ui'
  | 'achievement'
  | 'combo'
  | 'explosion'
  | 'lose'
  | 'bossIntro'
  // Reward reveals: an epic or newly unlocked card, a legendary card.
  | 'rare'
  | 'legendary';
export type MusicTheme = 'hub' | 'rust' | 'green' | 'core';
export type MusicLayer = 'calm' | 'battle' | 'boss';
export const MUSIC_THEMES: MusicTheme[] = ['hub', 'rust', 'green', 'core'];

type Ctx = BaseAudioContext;
type Rng = () => number;

const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const FADE = 1.2;
// Music that starts from silence swells in over this long: a first listener was startled by it.
const COLD_FADE = 3;
const MUSIC_LEVEL = 0.55;
const SFX_LEVEL = 0.9;
const MAX_VOICES = 24;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const clamp01 = (v: number) =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
// Sliders feel linear in loudness when the gain follows a square curve.
const curve = (v: number) => clamp01(v) ** 2;

function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- voices

interface Osc {
  type: OscillatorType;
  mul?: number;
  cents?: number;
  level?: number;
}
interface Tone {
  t: number;
  f: number;
  fs?: number[];
  peak: number;
  d: number;
  a?: number;
  hold?: number;
  osc?: Osc[];
  to?: number;
  glide?: number;
  lp?: number;
  lpTo?: number;
  lpTime?: number;
  q?: number;
  hp?: number;
  vib?: number;
  vibRate?: number;
  pan?: number;
  send?: AudioNode | null;
  wet?: number;
}
interface Hiss {
  t: number;
  f: number;
  peak: number;
  d: number;
  a?: number;
  hold?: number;
  type?: BiquadFilterType;
  to?: number;
  sweep?: number;
  q?: number;
  hp?: number;
  rate?: number;
  pan?: number;
  send?: AudioNode | null;
  wet?: number;
}

// Layers that share a detune and sit on harmonic ratios are merged into one
// PeriodicWave (see plan()), so most presets cost one or two oscillators.
const SINE: Osc[] = [{ type: 'sine' }];
const TRI: Osc[] = [{ type: 'triangle' }];
const SQUARE: Osc[] = [{ type: 'square' }];
const SAW2: Osc[] = [
  { type: 'sawtooth', cents: -8 },
  { type: 'sawtooth', cents: 8 },
];
const WARM: Osc[] = [
  { type: 'triangle', cents: -5 },
  { type: 'sawtooth', cents: 6 },
];
const SOFT: Osc[] = [
  { type: 'triangle', cents: -7 },
  { type: 'sine', cents: 7 },
];
const SUPER: Osc[] = [
  { type: 'sawtooth', cents: -13 },
  { type: 'sawtooth', cents: 13 },
];
// Triangle body with a quiet octave, doubled a few cents flat: the slow
// beating between the pair is what makes it read as a struck string.
const KEYS: Osc[] = [
  { type: 'triangle' },
  { type: 'sine', mul: 2, level: 0.3 },
  { type: 'triangle', cents: -3 },
];
const GLASS: Osc[] = [
  { type: 'triangle' },
  { type: 'sine', mul: 2, level: 0.35 },
];
const RUSTY: Osc[] = [{ type: 'square' }, { type: 'sawtooth', cents: 9 }];
const ARP: Osc[] = [
  { type: 'sawtooth', cents: -5 },
  { type: 'square', cents: 5 },
];
const LEAD: Osc[] = [
  { type: 'sawtooth', cents: -6 },
  { type: 'sawtooth', cents: 6 },
];
const FLUTE: Osc[] = [
  { type: 'sine' },
  { type: 'triangle', mul: 2, level: 0.12 },
];
const SIREN: Osc[] = [{ type: 'square' }, { type: 'sawtooth', cents: 15 }];
const BASS_SAW: Osc[] = [
  { type: 'sawtooth', cents: -9 },
  { type: 'sawtooth', cents: 9 },
  { type: 'square', mul: 0.5, cents: 9, level: 0.55 },
];
const BASS_ROUND: Osc[] = [
  { type: 'triangle' },
  { type: 'sine', mul: 0.5, level: 0.8 },
];
const BASS_SYNTH: Osc[] = [
  { type: 'sawtooth' },
  { type: 'square', mul: 0.5, level: 0.5 },
];
const CLANG: Osc[] = [
  { type: 'square' },
  { type: 'square', mul: 1.483 },
  { type: 'square', mul: 2.137 },
];
const WOOD: Osc[] = [
  { type: 'triangle' },
  { type: 'sine', mul: 2.4, level: 0.35 },
];
const DRUM: Osc[] = [{ type: 'sine' }, { type: 'triangle', level: 0.25 }];
const CHIME: Osc[] = [
  { type: 'sine' },
  { type: 'triangle', mul: 2, level: 0.2 },
];
const BELL: Osc[] = [
  { type: 'sine' },
  { type: 'sine', mul: 2.76, level: 0.25 },
  { type: 'sine', mul: 5.4, level: 0.08 },
];
const RING: Osc[] = [
  { type: 'sine' },
  { type: 'sine', mul: 1.54, level: 0.7 },
  { type: 'sine', mul: 2.37, level: 0.4 },
];
const GONG: Osc[] = [
  { type: 'sine' },
  { type: 'sine', mul: 2.76, level: 0.5 },
  { type: 'sine', mul: 5.4, level: 0.25 },
  { type: 'sine', mul: 8.93, level: 0.1 },
];
const BRASS: Osc[] = [
  { type: 'sawtooth', cents: -4 },
  { type: 'triangle', cents: 4 },
];

const noiseCache = new WeakMap<Ctx, AudioBuffer>();
function noise(ctx: Ctx) {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    const rate = ctx.sampleRate,
      rng = mulberry(417);
    buffer = ctx.createBuffer(1, rate * 2, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
    noiseCache.set(ctx, buffer);
  }
  return buffer;
}

function gainNode(ctx: Ctx, value: number, bag?: AudioNode[]) {
  const g = ctx.createGain();
  g.gain.value = value;
  bag?.push(g);
  return g;
}

function filterNode(
  ctx: Ctx,
  type: BiquadFilterType,
  f: number,
  q: number,
  t: number,
) {
  const node = ctx.createBiquadFilter();
  // Per-quantum coefficients halve the cost of sweeps and are inaudible.
  if ('automationRate' in node.frequency) {
    node.frequency.automationRate = 'k-rate';
    node.Q.automationRate = 'k-rate';
  }
  node.type = type;
  node.Q.value = q;
  node.frequency.value = f;
  node.frequency.setValueAtTime(f, t);
  return node;
}

// filters -> envelope -> pan -> out (+ optional wet send). Returns the stages
// so the caller can wire its sources into stages[0].
function voiceChain(
  ctx: Ctx,
  out: AudioNode,
  v: Tone | Hiss,
  t: number,
  end: number,
  first: BiquadFilterNode | null,
) {
  const a = Math.max(0.001, v.a ?? 0.004),
    hold = Math.max(0, v.hold ?? 0),
    stages: AudioNode[] = [],
    env = ctx.createGain();
  if (first) stages.push(first);
  if (v.hp) stages.push(filterNode(ctx, 'highpass', v.hp, 0.7, t));
  // Intrinsic values matter: sub-sample starts can leak a frame before the
  // first event, and a default gain of 1 turns that frame into a click.
  env.gain.value = 0;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(v.peak, t + a);
  if (hold) env.gain.setValueAtTime(v.peak, t + a + hold);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  stages.push(env);
  if (v.pan && ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, v.pan));
    stages.push(pan);
  }
  for (let k = 0; k + 1 < stages.length; k++) stages[k].connect(stages[k + 1]);
  const last = stages[stages.length - 1];
  last.connect(out);
  if (v.send && v.wet) {
    const wet = gainNode(ctx, v.wet, stages);
    last.connect(wet);
    wet.connect(v.send);
  }
  return stages;
}

const span = (v: Tone | Hiss) =>
  Math.max(0.001, v.a ?? 0.004) +
  Math.max(0, v.hold ?? 0) +
  Math.max(0.01, v.d);

// Fourier series of the built-in shapes, as the Web Audio spec defines them.
const SERIES: Record<string, (n: number) => number> = {
  sine: (n) => (n === 1 ? 1 : 0),
  square: (n) => (n % 2 ? 4 / (Math.PI * n) : 0),
  sawtooth: (n) => ((n % 2 ? 2 : -2) / Math.PI) * (1 / n),
  triangle: (n) =>
    n % 2 ? ((((n - 1) / 2) % 2 ? -8 : 8) / Math.PI ** 2) * (1 / (n * n)) : 0,
};
const HARMONICS = 128;

interface Part {
  mul: number;
  cents: number;
  type: OscillatorType | null; // null: needs a merged PeriodicWave
  layers: Osc[];
}
const plans = new WeakMap<Osc[], Part[]>();
const waves = new WeakMap<Ctx, Map<string, PeriodicWave>>();

// Group layers by detune; a group on harmonic ratios becomes one oscillator
// with its levels baked in, which saves an oscillator and a gain per layer.
function plan(oscs: Osc[]) {
  let parts = plans.get(oscs);
  if (parts) return parts;
  parts = [];
  const byCents = new Map<number, Osc[]>();
  for (const o of oscs) {
    const cents = o.cents ?? 0;
    byCents.set(cents, [...(byCents.get(cents) ?? []), o]);
  }
  for (const [cents, list] of byCents) {
    const base = Math.min(...list.map((o) => o.mul ?? 1)),
      harmonic = list.every((o) => {
        const r = (o.mul ?? 1) / base;
        return Math.abs(r - Math.round(r)) < 1e-6;
      });
    for (const layers of harmonic ? [list] : list.map((o) => [o])) {
      const one = layers[0],
        plain = layers.length === 1 && (one.level ?? 1) === 1;
      parts.push({
        mul: harmonic ? base : (one.mul ?? 1),
        cents,
        type: plain && one.type !== 'custom' ? one.type : null,
        layers,
      });
    }
  }
  plans.set(oscs, parts);
  return parts;
}

function waveFor(ctx: Ctx, part: Part) {
  const key = part.layers
    .map((o) => `${o.type}*${(o.mul ?? 1) / part.mul}*${o.level ?? 1}`)
    .join('+');
  let cache = waves.get(ctx);
  if (!cache) waves.set(ctx, (cache = new Map()));
  let wave = cache.get(key);
  if (!wave) {
    const real = new Float32Array(HARMONICS),
      imag = new Float32Array(HARMONICS);
    for (const o of part.layers) {
      const step = Math.round((o.mul ?? 1) / part.mul),
        series = SERIES[o.type] ?? SERIES.sine;
      for (let n = 1; n * step < HARMONICS; n++)
        imag[n * step] += series(n) * (o.level ?? 1);
    }
    wave = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    cache.set(key, wave);
  }
  return wave;
}

// One enveloped voice: oscillators -> filters -> gain -> pan. `fs` stacks a
// whole chord on one chain. Every node is disconnected when the voice ends,
// so long sessions do not pile up nodes.
function tone(ctx: Ctx, out: AudioNode, v: Tone) {
  const t = Math.max(0, v.t),
    end = t + span(v),
    freqs = v.fs ?? [v.f];
  if (!(v.peak > 0.0002) || !freqs.every((f) => f > 0)) return t;
  let lp: BiquadFilterNode | null = null;
  if (v.lp) {
    lp = filterNode(ctx, 'lowpass', v.lp, v.q ?? 0.7, t);
    if (v.lpTo)
      lp.frequency.exponentialRampToValueAtTime(
        Math.max(20, v.lpTo),
        t + Math.max(0.01, v.lpTime ?? end - t),
      );
  }
  const stages = voiceChain(ctx, out, v, t, end, lp),
    input = stages[0],
    sources: OscillatorNode[] = [];
  let depth: GainNode | null = null;
  if (v.vib) {
    const lfo = ctx.createOscillator();
    depth = ctx.createGain();
    lfo.frequency.value = v.vibRate ?? 5.5;
    depth.gain.value = 0;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(v.vib, t + Math.min(0.35, end - t));
    lfo.connect(depth);
    stages.push(depth);
    sources.push(lfo);
  }
  for (const f of freqs)
    for (const part of plan(v.osc ?? SINE)) {
      const osc = ctx.createOscillator(),
        mul = part.mul;
      if (part.type) osc.type = part.type;
      else osc.setPeriodicWave(waveFor(ctx, part));
      osc.frequency.value = f * mul;
      osc.frequency.setValueAtTime(f * mul, t);
      if (v.to && !v.fs)
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, v.to * mul),
          t + Math.max(0.005, v.glide ?? end - t),
        );
      if (part.cents) osc.detune.value = part.cents;
      if (depth) depth.connect(osc.detune);
      osc.connect(input);
      sources.push(osc);
    }
  for (const s of sources) {
    s.start(t);
    s.stop(end + 0.02);
  }
  sources[0].onended = () => {
    for (const n of sources) n.disconnect();
    for (const n of stages) n.disconnect();
  };
  return end;
}

// Filtered white noise from one shared buffer, read from a random offset so
// repeated hits never sound machine-identical.
function hiss(ctx: Ctx, out: AudioNode, v: Hiss) {
  const t = Math.max(0, v.t),
    end = t + span(v);
  if (!(v.peak > 0.0002) || !(v.f > 0)) return t;
  const main = filterNode(ctx, v.type ?? 'bandpass', v.f, v.q ?? 1, t);
  if (v.to)
    main.frequency.exponentialRampToValueAtTime(
      Math.max(20, v.to),
      t + Math.max(0.01, v.sweep ?? end - t),
    );
  const stages = voiceChain(ctx, out, v, t, end, main),
    src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  src.playbackRate.value = v.rate ?? 1;
  src.connect(stages[0]);
  src.start(t, Math.random() * 1.5);
  src.stop(end + 0.02);
  src.onended = () => {
    src.disconnect();
    for (const n of stages) n.disconnect();
  };
  return end;
}

// Smoothly retarget a parameter that may already be moving.
function glide(p: AudioParam, value: number, now: number, time: number) {
  const current = p.value;
  p.cancelScheduledValues(now);
  p.setValueAtTime(current, now);
  p.setTargetAtTime(value, now, time / 3);
}

// ------------------------------------------------------------------ space

// Convolution-free room: two Schroeder allpasses for diffusion feeding six
// damped feedback combs spread across the stereo field.
class Verb {
  nodes: AudioNode[] = [];
  input: GainNode;
  output: GainNode;
  constructor(ctx: Ctx, size: number, damp: number, decay: number) {
    const bag = this.nodes;
    this.input = gainNode(ctx, 1, bag);
    this.output = gainNode(ctx, 0.14, bag);
    const cut = filterNode(ctx, 'highpass', 260, 0.5, 0);
    bag.push(cut);
    this.input.connect(cut);
    let head: AudioNode = cut;
    for (const d of [0.0071, 0.0113]) {
      const sum = gainNode(ctx, 1, bag),
        delay = ctx.createDelay(0.1),
        back = gainNode(ctx, 0.6, bag),
        front = gainNode(ctx, -0.6, bag),
        out = gainNode(ctx, 1, bag);
      delay.delayTime.value = d * size;
      bag.push(delay);
      head.connect(sum);
      sum.connect(delay);
      delay.connect(back);
      back.connect(sum);
      sum.connect(front);
      front.connect(out);
      delay.connect(out);
      head = out;
    }
    [0.0297, 0.0371, 0.0411, 0.0437, 0.0503, 0.0571].forEach((d, k) => {
      const delay = ctx.createDelay(0.5),
        lp = filterNode(ctx, 'lowpass', damp, -3, 0),
        back = gainNode(ctx, decay, bag);
      delay.delayTime.value = d * size;
      bag.push(delay, lp);
      head.connect(delay);
      delay.connect(lp);
      lp.connect(back);
      back.connect(delay);
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = k % 2 ? 0.75 : -0.75;
        bag.push(pan);
        lp.connect(pan);
        pan.connect(this.output);
      } else lp.connect(this.output);
    });
  }
}

// Tempo-synced ping-pong delay, darkened on every repeat.
class Echo {
  nodes: AudioNode[] = [];
  input: GainNode;
  output: GainNode;
  constructor(ctx: Ctx, time: number, feedback: number, tone: number) {
    const bag = this.nodes;
    this.input = gainNode(ctx, 1, bag);
    this.output = gainNode(ctx, 1, bag);
    const damp = filterNode(ctx, 'lowpass', tone, -3, 0),
      left = ctx.createDelay(2),
      right = ctx.createDelay(2),
      across = gainNode(ctx, feedback, bag),
      back = gainNode(ctx, feedback, bag);
    left.delayTime.value = time;
    right.delayTime.value = time;
    bag.push(damp, left, right);
    this.input.connect(damp);
    damp.connect(left);
    left.connect(across);
    across.connect(right);
    right.connect(back);
    back.connect(damp);
    for (const [node, side] of [
      [left, -0.65],
      [right, 0.65],
    ] as const) {
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = side;
        bag.push(pan);
        node.connect(pan);
        pan.connect(this.output);
      } else node.connect(this.output);
    }
  }
}

// While a voice line plays the music sinks to this share of its level, fast on
// the way down and slower on the way back so the line is never fighting it.
export const VOICE_DUCK = { level: 0.3, attack: 0.18, release: 0.5 };

// sfx + music -> compressor -> master. Music has its own pause duck/muffle and
// a voice duck; sound effects stay at full level.
class Bus {
  master: GainNode;
  music: GainNode;
  muffle: BiquadFilterNode;
  duck: GainNode;
  talk: GainNode;
  sfx: GainNode;
  verb: Verb | null;
  constructor(ctx: Ctx, v: { music: number; sfx: number }, effects: boolean) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master = gainNode(ctx, 1);
    comp.connect(this.master);
    this.master.connect(ctx.destination);
    this.music = gainNode(ctx, curve(v.music) * MUSIC_LEVEL);
    this.muffle = filterNode(ctx, 'lowpass', 20000, 0.5, 0);
    this.duck = gainNode(ctx, 1);
    this.music.connect(this.muffle);
    this.muffle.connect(this.duck);
    this.talk = gainNode(ctx, 1);
    this.duck.connect(this.talk);
    this.talk.connect(comp);
    this.sfx = gainNode(ctx, curve(v.sfx) * SFX_LEVEL);
    this.sfx.connect(comp);
    this.verb = effects ? new Verb(ctx, 0.8, 4200, 0.74) : null;
    this.verb?.output.connect(this.sfx);
  }
  volumes(v: { music: number; sfx: number }, now: number) {
    glide(this.music.gain, curve(v.music) * MUSIC_LEVEL, now, 0.15);
    glide(this.sfx.gain, curve(v.sfx) * SFX_LEVEL, now, 0.15);
  }
  speaking(on: boolean, now: number) {
    glide(
      this.talk.gain,
      on ? VOICE_DUCK.level : 1,
      now,
      on ? VOICE_DUCK.attack : VOICE_DUCK.release,
    );
  }
  pause(paused: boolean, now: number) {
    glide(this.duck.gain, paused ? 0.35 : 1, now, 0.35);
    glide(this.muffle.frequency, paused ? 900 : 20000, now, 0.35);
  }
}

// ------------------------------------------------------------- sequencer

interface Chord {
  bass: number;
  pad: number[];
}
interface TrackDef {
  level: number;
  layers: MusicLayer[];
  verb?: number;
  echo?: number;
  duck?: boolean;
  pan?: number;
}
interface Track {
  def: TrackDef;
  input: GainNode;
  gate: GainNode;
  on: boolean;
  until: number;
}
interface MelNote {
  s: number;
  n: number;
  len: number;
  prev: number;
}
interface Step {
  s: number; // 16th inside the bar
  bar: number;
  phrase: number; // bar inside the progression
  t: number; // swung start time
  chord: Chord;
  next: Chord;
  rng: Rng; // seeded per bar
  layer: MusicLayer;
  entered: boolean; // the layer changed on this bar
}
interface ThemeDef {
  bpm: number;
  swing: number;
  seed: number;
  scale: number[];
  chords: Chord[];
  room: [size: number, damp: number, decay: number];
  echo: [sixteenths: number, feedback: number, tone: number];
  melody: {
    low: number;
    high: number;
    max: number;
    rhythms: number[][];
    cadences: number[][];
  };
  tracks: Record<string, TrackDef>;
  play: (m: Sequencer, i: Step) => void;
}

// Snap scale degrees to chromatic chord tones (G -> G# over E major).
function fitScale(scale: number[], pcs: Set<number>) {
  return scale.map((pc) => {
    if (pcs.has(pc)) return pc;
    const up = (pc + 1) % 12,
      down = (pc + 11) % 12;
    if (pcs.has(up) && !scale.includes(up)) return up;
    if (pcs.has(down) && !scale.includes(down)) return down;
    return pc;
  });
}

// Melodies are composed per bar from a motif rhythm and a weighted walk:
// chord tones on beats, mostly stepwise motion, cadences resolve home.
// The same variant repeats for two loops, then A -> B -> C -> A.
function melodyFor(
  def: ThemeDef,
  phrase: number,
  variant: number,
  prev: number,
) {
  const mel = def.melody,
    pick = mulberry(def.seed + variant * 7919),
    motifA = mel.rhythms[Math.floor(pick() * mel.rhythms.length)],
    motifB = mel.rhythms[Math.floor(pick() * mel.rhythms.length)],
    cadenceRhythm = mel.cadences[Math.floor(pick() * mel.cadences.length)],
    cadence = phrase % 4 === 3,
    rhythm = cadence ? cadenceRhythm : phrase % 2 ? motifB : motifA,
    // Bars 5-6 restate bars 1-2 over their chords: an a-b-a'-c period.
    rng = mulberry(
      def.seed +
        variant * 7919 +
        (phrase % 8 === 4 || phrase % 8 === 5 ? phrase - 4 : phrase) * 104729 +
        17,
    ),
    chord = def.chords[phrase],
    pcs = new Set([chord.bass % 12, ...chord.pad.map((n) => n % 12)]),
    scale = fitScale(def.scale, pcs),
    center = (mel.low + mel.high) / 2,
    half = (mel.high - mel.low) / 2,
    notes: MelNote[] = [];
  let p = prev,
    dir = 0;
  rhythm.forEach((s, k) => {
    const last = k === rhythm.length - 1,
      end = last ? 16 : rhythm[k + 1],
      len = cadence && last ? 16 - s : Math.min(end - s, mel.max),
      strong = s % 4 === 0 || (cadence && last);
    if (k > 0 && !last && rng() < 0.1) return;
    const options: [number, number][] = [];
    let total = 0;
    for (let n = mel.low; n <= mel.high; n++) {
      const pc = n % 12,
        chordTone = pcs.has(pc);
      if (!scale.includes(pc) || (strong && !chordTone)) continue;
      const dist = Math.abs(n - p);
      let w =
        dist === 0
          ? 0.3
          : dist <= 2
            ? 1
            : dist <= 4
              ? 0.7
              : dist <= 7
                ? 0.35
                : 0.06;
      if (dir && Math.sign(n - p) === dir) w *= 1.25;
      w *= 1 - 0.55 * Math.min(1, Math.abs(n - center) / half);
      if (
        !chordTone &&
        len >= 3 &&
        [...pcs].some(
          (c) => (pc - c + 12) % 12 === 1 || (c - pc + 12) % 12 === 1,
        )
      )
        w *= 0.25;
      if (cadence && last && pc === chord.bass % 12) w *= 3;
      options.push([n, w]);
      total += w;
    }
    let r = rng() * total,
      chosen = p;
    for (const [n, w] of options) {
      chosen = n;
      r -= w;
      if (r <= 0) break;
    }
    notes.push({ s, n: chosen, len: Math.max(1, len), prev: p });
    dir = Math.sign(chosen - p);
    p = chosen;
  });
  return notes;
}

class Sequencer {
  def: ThemeDef;
  out: GainNode;
  sixteenth: number;
  tracks: Record<string, Track> = {};
  ducks: GainNode[] = [];
  nodes: AudioNode[] = [];
  step = 0;
  bar = -1;
  time: number;
  layer: MusicLayer;
  pending: MusicLayer;
  stopAt = Infinity;
  mel: MelNote[] = [];
  melPrev = 0;
  duckFree = 0;
  cur: Step;
  constructor(
    public ctx: Ctx,
    dest: AudioNode,
    theme: MusicTheme,
    layer: MusicLayer,
    public seed: number,
    start: number,
    fadeIn: number,
  ) {
    const def = (this.def = THEMES[theme]),
      bag = this.nodes;
    this.sixteenth = 60 / def.bpm / 4;
    this.time = start;
    this.layer = this.pending = layer;
    this.out = gainNode(ctx, 0, bag);
    this.out.gain.setValueAtTime(0, start);
    this.out.gain.linearRampToValueAtTime(1, start + Math.max(0.05, fadeIn));
    this.out.connect(dest);
    const verb = new Verb(ctx, ...def.room),
      echo = new Echo(
        ctx,
        def.echo[0] * this.sixteenth,
        def.echo[1],
        def.echo[2],
      ),
      echoRoom = gainNode(ctx, 0.3, bag);
    bag.push(...verb.nodes, ...echo.nodes);
    verb.output.connect(this.out);
    echo.output.connect(this.out);
    echo.output.connect(echoRoom);
    echoRoom.connect(verb.input);
    for (const [name, td] of Object.entries(def.tracks)) {
      const on = td.layers.includes(layer),
        input = gainNode(ctx, td.level, bag),
        gate = gainNode(ctx, on ? 1 : 0, bag);
      let head: AudioNode = input;
      if (td.pan && ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = td.pan;
        bag.push(pan);
        head.connect(pan);
        head = pan;
      }
      if (td.duck) {
        const duck = gainNode(ctx, 1, bag);
        head.connect(duck);
        head = duck;
        this.ducks.push(duck);
      }
      head.connect(gate);
      gate.connect(this.out);
      for (const [amount, target] of [
        [td.verb, verb.input],
        [td.echo, echo.input],
      ] as const) {
        if (!amount) continue;
        const send = gainNode(ctx, amount, bag);
        gate.connect(send);
        send.connect(target);
      }
      this.tracks[name] = { def: td, input, gate, on, until: 0 };
    }
    this.cur = {
      s: 0,
      bar: 0,
      phrase: 0,
      t: start,
      chord: def.chords[0],
      next: def.chords[1 % def.chords.length],
      rng: mulberry(seed),
      layer,
      entered: true,
    };
  }
  on(name: string, t: number) {
    const tr = this.tracks[name];
    return !!tr && (tr.on || t < tr.until);
  }
  input(name: string) {
    return this.tracks[name].input;
  }
  // Sidechain-style pump: pads dip under every kick and swell back.
  duck(t: number) {
    if (t < this.duckFree || !this.ducks.length) return;
    const back = t + this.sixteenth * 3;
    for (const d of this.ducks) {
      d.gain.setValueAtTime(1, t);
      d.gain.linearRampToValueAtTime(0.3, t + 0.012);
      d.gain.linearRampToValueAtTime(1, back);
    }
    this.duckFree = back;
  }
  schedule(until: number) {
    while (this.time < until && this.time < this.stopAt) {
      this.playStep(this.step, this.time);
      this.step++;
      this.time += this.sixteenth;
    }
  }
  // After a stall (hidden tab, mute, or a main-thread hitch longer than the
  // lookahead) jump forward on the grid, never burst. A skipped downbeat
  // still sounds, late: pads, bass roots and layer entries start only on
  // step 0, and a bar without them would play hollow for its whole length.
  resync(now: number) {
    if (this.time >= now) return;
    const skip = Math.ceil((now - this.time) / this.sixteenth),
      from = this.step;
    this.step += skip;
    this.time += skip * this.sixteenth;
    const last = this.step - 1,
      down = last - (last % 16);
    // Not when the next step is a downbeat itself: the bar is over.
    if (down >= from && this.step % 16 && now < this.stopAt)
      this.playStep(down, now + 0.005);
  }
  private playStep(step: number, time: number) {
    const s = step % 16,
      bar = (step - s) / 16;
    if (bar !== this.bar) this.newBar(bar, time);
    this.cur.s = s;
    this.cur.t = time + (s % 2 ? this.def.swing * this.sixteenth : 0);
    this.def.play(this, this.cur);
  }
  fadeOut(now: number, len: number) {
    glide(this.out.gain, 0, now, len);
    this.stopAt = now + len;
  }
  dispose() {
    for (const n of this.nodes) n.disconnect();
  }
  private newBar(bar: number, t: number) {
    const def = this.def,
      count = def.chords.length,
      phrase = bar % count,
      first = this.bar < 0,
      entered = first || this.pending !== this.layer;
    if (this.pending !== this.layer) this.switchLayer(this.pending, t);
    this.bar = bar;
    if (phrase % 4 === 0 || first)
      this.melPrev = Math.round((def.melody.low + def.melody.high) / 2);
    this.mel = melodyFor(
      def,
      phrase,
      Math.floor(bar / (count * 2)) % 3,
      this.melPrev,
    );
    if (this.mel.length) this.melPrev = this.mel[this.mel.length - 1].n;
    const i = this.cur;
    i.bar = bar;
    i.phrase = phrase;
    i.chord = def.chords[phrase];
    i.next = def.chords[(phrase + 1) % count];
    i.rng = mulberry(this.seed + Math.imul(bar + 1, 0x9e3779b1));
    i.layer = this.layer;
    i.entered = entered;
  }
  // Layers crossfade on the downbeat: new parts enter at once, departing
  // parts keep playing under a FADE-long ramp.
  private switchLayer(layer: MusicLayer, t: number) {
    this.layer = layer;
    for (const tr of Object.values(this.tracks)) {
      const on = tr.def.layers.includes(layer);
      if (on === tr.on) continue;
      const g = tr.gate.gain;
      if (on) {
        g.setValueAtTime(0, Math.max(0, t - 0.03));
        g.linearRampToValueAtTime(1, t + 0.02);
        tr.until = 0;
      } else {
        g.setValueAtTime(1, t);
        g.linearRampToValueAtTime(0, t + FADE);
        tr.until = t + FADE;
      }
      tr.on = on;
    }
  }
}

// ------------------------------------------------------------ instruments

function padChord(
  m: Sequencer,
  track: string,
  t: number,
  notes: number[],
  len: number,
  peak: number,
  lp: number,
  osc: Osc[],
  attack: number,
  release: number,
) {
  // Alternate chord tones between two panned chains: stereo width for the
  // price of two envelopes instead of one per note.
  const out = m.input(track);
  for (const side of [0, 1]) {
    const fs = notes.filter((_, k) => k % 2 === side).map(hz);
    if (fs.length)
      tone(m.ctx, out, {
        t,
        f: fs[0],
        fs,
        osc,
        peak,
        lp,
        q: 0.4,
        a: attack,
        hold: Math.max(0, len - attack),
        d: release,
        pan: side ? 0.35 : -0.35,
      });
  }
}

function pluck(
  m: Sequencer,
  track: string,
  t: number,
  n: number,
  len: number,
  peak: number,
  bright: number,
  osc: Osc[],
  pan = 0,
) {
  tone(m.ctx, m.input(track), {
    t,
    f: hz(n),
    osc,
    peak,
    a: 0.003,
    d: len,
    lp: bright,
    lpTo: Math.max(250, bright * 0.18),
    lpTime: len * 0.6,
    q: 1,
    pan,
  });
}

interface LeadOpts {
  osc: Osc[];
  lp: number;
  vib?: number;
  from?: number;
  attack?: number;
  release?: number;
}
function lead(
  m: Sequencer,
  track: string,
  t: number,
  n: number,
  len: number,
  peak: number,
  o: LeadOpts,
) {
  const slide = o.from !== undefined && o.from !== n;
  tone(m.ctx, m.input(track), {
    t,
    f: hz(slide ? (o.from as number) : n),
    to: slide ? hz(n) : undefined,
    glide: 0.07,
    osc: o.osc,
    peak,
    a: o.attack ?? 0.015,
    hold: len,
    d: o.release ?? 0.2,
    lp: o.lp,
    q: 1.5,
    vib: o.vib,
    vibRate: 5.6,
  });
}

function bass(
  m: Sequencer,
  t: number,
  n: number,
  len: number,
  vel: number,
  kind: 'saw' | 'round' | 'synth',
) {
  const round = kind === 'round';
  tone(m.ctx, m.input('bass'), {
    t,
    f: hz(n),
    osc: round ? BASS_ROUND : kind === 'saw' ? BASS_SAW : BASS_SYNTH,
    peak: 0.14 * vel,
    a: 0.004,
    hold: len * 0.5,
    d: len * 0.5 + 0.1,
    lp: round ? 700 : kind === 'saw' ? 700 + 900 * vel : 1200 + 1000 * vel,
    lpTo: round ? 380 : 170,
    lpTime: len + 0.05,
    q: round ? 0.5 : 6,
  });
}

function kick(
  m: Sequencer,
  t: number,
  vel: number,
  f0: number,
  d: number,
  click: number,
) {
  const out = m.input('kick');
  tone(m.ctx, out, { t, f: f0, to: 44, glide: 0.09, peak: 0.9 * vel, d });
  if (click)
    hiss(m.ctx, out, {
      t,
      type: 'highpass',
      f: 2600,
      q: 0.5,
      peak: 0.16 * vel * click,
      a: 0.001,
      d: 0.012,
    });
  m.duck(t);
}

function snare(m: Sequencer, t: number, vel: number, tune = 1, tail = 1) {
  const out = m.input('snare');
  hiss(m.ctx, out, {
    t,
    f: 1900 * tune,
    q: 0.6,
    hp: 600,
    peak: 0.6 * vel,
    a: 0.001,
    d: 0.17 * tail,
  });
  tone(m.ctx, out, {
    t,
    f: 210 * tune,
    to: 160 * tune,
    glide: 0.05,
    osc: TRI,
    peak: 0.4 * vel,
    a: 0.001,
    d: 0.1,
  });
}

function clap(m: Sequencer, t: number, vel: number) {
  const out = m.input('snare');
  for (let k = 0; k < 3; k++)
    hiss(m.ctx, out, {
      t: t + k * 0.011,
      f: 1250,
      q: 1.3,
      peak: 0.4 * vel,
      a: 0.001,
      d: k === 2 ? 0.16 : 0.012,
    });
}

function hat(m: Sequencer, t: number, vel: number, open: boolean, tint = 1) {
  hiss(m.ctx, m.input('hat'), {
    t,
    type: 'highpass',
    f: 7200 * tint,
    q: 1,
    peak: 0.32 * vel,
    a: 0.001,
    d: open ? 0.24 : 0.055,
  });
}

function shaker(m: Sequencer, track: string, t: number, vel: number) {
  hiss(m.ctx, m.input(track), {
    t,
    f: 6400,
    q: 1.2,
    peak: 0.28 * vel,
    a: 0.01,
    d: 0.05,
  });
}

// Inharmonic square partials plus a narrow noise ring: a struck pipe.
function clank(
  m: Sequencer,
  track: string,
  t: number,
  vel: number,
  pitch: number,
  pan = 0,
) {
  const out = m.input(track);
  tone(m.ctx, out, {
    t,
    f: 560 * pitch,
    osc: CLANG,
    peak: 0.045 * vel,
    a: 0.001,
    d: 0.22,
    hp: 700,
    pan,
  });
  hiss(m.ctx, out, {
    t,
    f: 3200 * pitch,
    q: 9,
    peak: 0.5 * vel,
    a: 0.001,
    d: 0.08,
    pan,
  });
}

function wood(m: Sequencer, t: number, vel: number, pitch = 1) {
  tone(m.ctx, m.input('wood'), {
    t,
    f: 780 * pitch,
    osc: WOOD,
    peak: 0.3 * vel,
    a: 0.001,
    d: 0.06,
    hp: 300,
  });
}

function tom(
  m: Sequencer,
  track: string,
  t: number,
  n: number,
  vel: number,
  d = 0.3,
) {
  tone(m.ctx, m.input(track), {
    t,
    f: hz(n) * 1.5,
    to: hz(n),
    glide: 0.06,
    osc: DRUM,
    peak: 0.4 * vel,
    a: 0.002,
    d,
  });
}

function crash(m: Sequencer, t: number, vel: number) {
  hiss(m.ctx, m.input('fx'), {
    t,
    type: 'highpass',
    f: 4800,
    q: 0.6,
    peak: 0.22 * vel,
    a: 0.002,
    d: 1.7,
  });
}

function riser(m: Sequencer, t: number, len: number, vel: number) {
  hiss(m.ctx, m.input('fx'), {
    t,
    f: 350,
    to: 6500,
    q: 2.2,
    peak: 0.24 * vel,
    a: len,
    d: 0.05,
  });
}

function drone(
  m: Sequencer,
  track: string,
  t: number,
  n: number,
  len: number,
  peak: number,
) {
  tone(m.ctx, m.input(track), {
    t,
    f: hz(n),
    osc: SAW2,
    peak,
    a: len * 0.3,
    hold: len * 0.4,
    d: len * 0.4,
    lp: 320,
    lpTo: 1100,
    lpTime: len * 0.7,
    q: 3,
  });
}

const toward = (n: number, rng: Rng) => n + (rng() < 0.5 ? -1 : 2);

type Riff = Record<number, [note: number, len: number, from?: number]>;

function riff(m: Sequencer, i: Step, notes: Riff, peak: number, lp: number) {
  const r = notes[i.s];
  if (r)
    lead(m, 'alarm', i.t, r[0], r[1] * m.sixteenth, peak, {
      osc: SIREN,
      lp,
      vib: 30,
      from: r[2],
      release: 0.12,
    });
}

// Crash on the downbeat a layer arrives (and every 4 bars), riser before.
function transitions(m: Sequencer, i: Step, boss: boolean) {
  if (i.s !== 0 || !m.on('fx', i.t)) return;
  if (i.layer !== 'calm' && (i.entered || i.phrase % 4 === 0))
    crash(m, i.t, i.entered ? 1 : 0.6);
  if (boss && i.phrase % 4 === 3) riser(m, i.t, 16 * m.sixteenth, 1);
}

// ----------------------------------------------------------------- themes

const ALL: MusicLayer[] = ['calm', 'battle', 'boss'];
const FIGHT: MusicLayer[] = ['battle', 'boss'];
const BOSS: MusicLayer[] = ['boss'];
const TUNE: MusicLayer[] = ['calm', 'battle'];

// Hub: A minor, 80 bpm. Warm pad, a broken-chord "piano" and a slow singing
// line; the progression lifts to C and G before falling back through E.
const HUB_ARP = [0, 2, 3, 4, 1, 3, 2, 4];
function playHub(m: Sequencer, i: Step) {
  const { s, t, chord, next, rng, phrase } = i,
    d = m.sixteenth;
  if (s === 0 && m.on('pad', t))
    padChord(m, 'pad', t, chord.pad, 16 * d, 0.03, 1200, WARM, 1.1, 2);
  if (s % 2 === 0 && m.on('keys', t)) {
    const tones = [chord.bass + 12, ...chord.pad],
      accent = s === 0 ? 1 : s === 8 ? 0.8 : 0.6;
    pluck(
      m,
      'keys',
      t,
      tones[HUB_ARP[s / 2] % tones.length],
      s === 0 ? 2.4 : 1.5,
      0.07 * accent * (0.9 + rng() * 0.2),
      2200,
      KEYS,
      (s / 16 - 0.5) * 0.5,
    );
  }
  if (s === 14 && phrase % 2 === 1 && m.on('keys', t) && rng() < 0.6)
    pluck(m, 'keys', t, next.pad[next.pad.length - 1], 1, 0.035, 2600, KEYS);
  if (m.on('bell', t))
    for (const n of m.mel)
      if (n.s === s)
        pluck(
          m,
          'bell',
          t,
          n.n,
          Math.max(0.9, n.len * d * 2),
          0.08,
          3400,
          KEYS,
          0.1,
        );
  if (m.on('bass', t)) {
    if (s === 0) bass(m, t, chord.bass, 6 * d, 1, 'round');
    else if (s === 10)
      bass(m, t, chord.bass + (rng() < 0.5 ? 7 : 12), 4 * d, 0.7, 'round');
    else if (s === 14 && rng() < 0.5)
      bass(m, t, toward(next.bass, rng), 2 * d, 0.6, 'round');
  }
  if (m.on('kick', t) && (s === 0 || s === 10 || (s === 7 && rng() < 0.3)))
    kick(m, t, s === 0 ? 0.8 : 0.55, 110, 0.4, 0.3);
  if (m.on('snare', t)) {
    if (s === 8) snare(m, t, 0.45, 0.9, 1.4);
    else if (phrase === 7 && s >= 12 && rng() < 0.7)
      tom(m, 'snare', t, 52 - (s - 12) * 2, 0.45);
  }
  if (m.on('hat', t)) {
    if (s % 2 === 0) hat(m, t, s % 4 === 2 ? 0.5 : 0.3, false, 0.8);
    else if (rng() < 0.25) shaker(m, 'hat', t, 0.3);
  }
  if (m.on('tense', t)) {
    if (s === 0 && phrase % 2 === 0)
      drone(m, 'tense', t, chord.bass - 12, 32 * d, 0.05);
    if (s % 4 === 0) tom(m, 'tense', t, 38, s === 0 ? 0.7 : 0.45, 0.5);
  }
  transitions(m, i, i.layer === 'boss');
}

// Rust: D minor, 112 bpm. Detuned saw bass, pipe clanks and dry hats over a
// dark pad; the A major bar at the end of the loop keeps it pulling forward.
const RUST_BASS: [step: number, interval: number, vel: number][] = [
  [0, 0, 1],
  [3, 0, 0.6],
  [6, 12, 0.8],
  [8, 0, 0.9],
  [10, 7, 0.7],
  [11, 0, 0.5],
  [14, 12, 0.7],
];
const RUST_DRIVE = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 7, 0, 12, 10];
const RUST_ALARM: Riff = {
  0: [69, 5, 64],
  6: [70, 2],
  8: [69, 5, 67],
  14: [72, 2],
};
function playRust(m: Sequencer, i: Step) {
  const { s, t, chord, rng, phrase, layer } = i,
    d = m.sixteenth,
    boss = layer === 'boss';
  if (s === 0 && m.on('pad', t))
    padChord(m, 'pad', t, chord.pad, 16 * d, 0.03, 650, SAW2, 0.5, 1.2);
  if (m.on('lead', t))
    for (const n of m.mel)
      if (n.s === s)
        lead(m, 'lead', t, n.n, n.len * d * 0.75, 0.035, {
          osc: RUSTY,
          lp: 1500,
          vib: 8,
          from: Math.abs(n.n - n.prev) <= 2 && rng() < 0.4 ? n.prev : undefined,
        });
  if (m.on('metal', t)) {
    if (layer === 'calm') {
      if (s === 6 && phrase % 2 === 1 && rng() < 0.8)
        clank(m, 'metal', t, 0.5, 0.9 + rng() * 0.2, -0.4);
    } else if ((s === 3 || s === 14) && rng() < 0.55)
      clank(m, 'metal', t, 0.5, s === 3 ? 1 : 1.26, s === 3 ? -0.35 : 0.35);
  }
  if (m.on('bass', t)) {
    if (boss)
      bass(
        m,
        t,
        chord.bass + RUST_DRIVE[s],
        d * 0.9,
        s % 4 === 0 ? 1 : 0.65,
        'saw',
      );
    else
      for (const [step, interval, vel] of RUST_BASS)
        if (step === s) bass(m, t, chord.bass + interval, d * 1.6, vel, 'saw');
  }
  if (m.on('kick', t)) {
    const hit = boss
      ? s % 4 === 0 || (phrase % 4 === 3 && s >= 13)
      : s === 0 || s === 6 || s === 10 || (s === 8 && phrase % 2 === 1);
    if (hit) kick(m, t, s === 0 ? 1 : 0.8, 150, 0.3, 1);
  }
  if (m.on('snare', t)) {
    if (s === 4 || s === 12) {
      snare(m, t, 0.8);
      clank(m, 'snare', t, 0.25, 1.5);
    } else if (phrase % 4 === 3 && s >= 13 && rng() < 0.8)
      snare(m, t, 0.3 + (s - 13) * 0.15, 1.1);
    else if (s === 15 && rng() < 0.2) snare(m, t, 0.2, 1.2);
  }
  if (m.on('hat', t) && (boss || s % 2 === 0 || rng() < 0.6)) {
    const open = s % 4 === 2;
    hat(m, t, open ? 0.6 : s % 2 ? 0.25 : 0.35, open, open ? 0.85 : 1.1);
  }
  if (m.on('alarm', t)) riff(m, i, RUST_ALARM, 0.032, 2600);
  transitions(m, i, boss);
}

// Green: E minor pentatonic with a raised fourth over C, 100 bpm, swung.
// Glassy arpeggios cascade through a long echo; a far-off voice slides down
// a semitone every few bars so the calm never quite settles.
const GREEN_ARP = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 4, 3, 2, 1, 3, 4];
const GREEN_TRIBAL = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
const GREEN_ALARM: Riff = { 0: [71, 6, 69], 8: [72, 4], 12: [71, 4, 72] };
function playGreen(m: Sequencer, i: Step) {
  const { s, t, chord, next, rng, phrase, layer } = i,
    d = m.sixteenth,
    calm = layer === 'calm',
    boss = layer === 'boss';
  if (s === 0 && m.on('pad', t))
    padChord(m, 'pad', t, chord.pad, 16 * d, 0.035, 1500, SOFT, 1.2, 2);
  if (m.on('arp', t) && (!calm || s % 2 === 0)) {
    const p = chord.pad,
      tones = [p[0] + 12, p[1] + 12, p[2] + 12, p[3] + 12, p[1] + 24];
    pluck(
      m,
      'arp',
      t,
      tones[GREEN_ARP[s]],
      0.45,
      (s % 4 === 0 ? 0.06 : 0.04) * (calm ? 0.8 : 1),
      calm ? 1800 : 2600,
      GLASS,
      s % 2 ? 0.35 : -0.35,
    );
  }
  if (m.on('flute', t))
    for (const n of m.mel)
      if (n.s === s)
        lead(m, 'flute', t, n.n, n.len * d, 0.06, {
          osc: FLUTE,
          lp: 3000,
          vib: 14,
          attack: 0.05,
          release: 0.3,
          from: Math.abs(n.n - n.prev) <= 3 && rng() < 0.3 ? n.prev : undefined,
        });
  if (s === 8 && phrase % 4 === 1 && m.on('eerie', t)) {
    const n = chord.pad[3] + 24;
    tone(m.ctx, m.input('eerie'), {
      t,
      f: hz(n),
      to: hz(n - 1),
      glide: 12 * d,
      a: 0.8,
      hold: 0.5,
      d: 1.5,
      peak: 0.025,
      vib: 20,
      vibRate: 3,
    });
  }
  if (m.on('bass', t)) {
    if (s === 0) bass(m, t, chord.bass, 5 * d, 1, 'round');
    else if (s === 7) bass(m, t, chord.bass + 7, 2 * d, 0.6, 'round');
    else if (s === 10) bass(m, t, chord.bass + 12, 3 * d, 0.7, 'round');
    else if (s === 14 && rng() < 0.6)
      bass(m, t, toward(next.bass, rng), 2 * d, 0.55, 'round');
  }
  if (m.on('kick', t) && (boss ? s % 4 === 0 || s === 7 : s === 0 || s === 10))
    kick(m, t, s === 0 ? 0.85 : 0.65, 120, 0.35, 0.4);
  if (m.on('wood', t)) {
    if (s === 4 || s === 12) wood(m, t, 0.6);
    else if (s === 15 && rng() < 0.35) wood(m, t, 0.25, 1.25);
  }
  if (m.on('shaker', t))
    shaker(
      m,
      'shaker',
      t,
      [0.35, 0.15, 0.55, 0.2][s % 4] * (0.85 + rng() * 0.3),
    );
  if (m.on('conga', t) && [3, 6, 11, 14].includes(s) && rng() < 0.8)
    tom(m, 'conga', t, s % 2 ? 62 : 57, 0.35, 0.18);
  if (m.on('toms', t) && (GREEN_TRIBAL[s] || (phrase % 4 === 3 && s >= 12)))
    tom(m, 'toms', t, s % 8 < 4 ? 45 : 50, s % 4 === 0 ? 0.8 : 0.55, 0.35);
  if (s === 0 && phrase % 2 === 0 && m.on('drone', t)) {
    drone(m, 'drone', t, 40, 32 * d, 0.04);
    drone(m, 'drone', t, 41, 32 * d, 0.018);
  }
  if (m.on('alarm', t)) riff(m, i, GREEN_ALARM, 0.028, 2200);
  transitions(m, i, boss);
}

// Core: C minor synthwave, 124 bpm. Sixteenth arpeggio through a dotted
// echo, a pad that pumps under the kick, gated snare and an octave bass.
const CORE_ARP = [0, 1, 2, 3, 4, 3, 2, 1];
const CORE_ALARM: Riff = {
  0: [79, 5, 74],
  6: [80, 2],
  8: [79, 3],
  12: [77, 2],
  14: [75, 2],
};
function playCore(m: Sequencer, i: Step) {
  const { s, t, chord, rng, phrase, layer } = i,
    d = m.sixteenth,
    calm = layer === 'calm',
    boss = layer === 'boss';
  if (s === 0 && m.on('pad', t))
    padChord(
      m,
      'pad',
      t,
      chord.pad,
      16 * d,
      0.022,
      calm ? 1400 : 2200,
      SUPER,
      0.25,
      0.9,
    );
  if (m.on('arp', t)) {
    const tones = [...chord.pad.map((n) => n + 12), chord.pad[0] + 24];
    pluck(
      m,
      'arp',
      t,
      tones[CORE_ARP[(s + (phrase % 2) * 2) % 8]],
      0.22,
      0.035 * (s % 4 === 0 ? 1 : 0.7),
      calm ? 900 : boss ? 3200 : 2200,
      ARP,
      s % 2 ? 0.3 : -0.3,
    );
  }
  if (m.on('lead', t))
    for (const n of m.mel)
      if (n.s === s)
        lead(m, 'lead', t, n.n, n.len * d * 0.85, 0.04, {
          osc: LEAD,
          lp: 2800,
          vib: 12,
          release: 0.25,
          from:
            Math.abs(n.n - n.prev) <= 5 && rng() < 0.35 ? n.prev : undefined,
        });
  if (m.on('bass', t)) {
    if (boss)
      bass(
        m,
        t,
        chord.bass + (s % 4 === 2 ? 12 : 0),
        d * 0.9,
        s % 4 === 0 ? 1 : 0.7,
        'synth',
      );
    else if (s % 2 === 0)
      bass(
        m,
        t,
        chord.bass + (s % 4 === 2 ? 12 : 0),
        d * 1.7,
        s % 4 === 0 ? 1 : 0.75,
        'synth',
      );
  }
  if (m.on('kick', t) && (s % 4 === 0 || (boss && phrase % 4 === 3 && s >= 14)))
    kick(m, t, s % 4 === 0 ? 1 : 0.7, 165, 0.32, 1);
  if (m.on('snare', t)) {
    if (s === 4 || s === 12) {
      snare(m, t, 0.75, 1.1);
      clap(m, t, 0.55);
    } else if (
      (phrase === 7 || (boss && phrase % 4 === 3)) &&
      s >= 8 &&
      s % 2 === 0
    )
      snare(m, t, 0.25 + (s - 8) * 0.07, 1.15);
  }
  if (m.on('hat', t)) {
    if (s % 4 === 2) hat(m, t, 0.45, true, 0.9);
    else if (s % 2 || boss) hat(m, t, 0.2 + rng() * 0.08, false);
  }
  if (m.on('alarm', t)) riff(m, i, CORE_ALARM, 0.028, 3000);
  transitions(m, i, boss);
}

const THEMES: Record<MusicTheme, ThemeDef> = {
  hub: {
    bpm: 80,
    swing: 0.12,
    seed: 11,
    scale: [9, 11, 0, 2, 4, 5, 7],
    chords: [
      { bass: 45, pad: [57, 60, 64, 71] }, // Am(add9)
      { bass: 41, pad: [53, 57, 60, 64] }, // Fmaj7
      { bass: 48, pad: [55, 60, 62, 64] }, // C(add9)
      { bass: 43, pad: [55, 59, 62, 64] }, // G6
      { bass: 45, pad: [55, 60, 64, 69] }, // Am7
      { bass: 41, pad: [57, 60, 64, 67] }, // Fmaj9
      { bass: 50, pad: [53, 57, 60, 62] }, // Dm7
      { bass: 40, pad: [52, 56, 59, 64] }, // E
    ],
    room: [1.35, 3200, 0.82],
    echo: [3, 0.45, 2400],
    melody: {
      low: 69,
      high: 84,
      max: 6,
      rhythms: [
        [0, 4, 6, 8, 12],
        [0, 6, 8, 12],
        [2, 4, 8, 10, 12],
        [0, 3, 4, 8, 12, 14],
        [0, 8, 10, 12],
      ],
      cadences: [
        [0, 4, 8],
        [0, 2, 4, 8],
        [0, 6],
      ],
    },
    tracks: {
      pad: { level: 1.45, layers: ALL, verb: 0.5 },
      keys: { level: 1.7, layers: ALL, verb: 0.35, echo: 0.1 },
      bell: { level: 1.85, layers: TUNE, verb: 0.45, echo: 0.3 },
      bass: { level: 0.85, layers: FIGHT, verb: 0.05 },
      kick: { level: 1.15, layers: FIGHT },
      snare: { level: 2.9, layers: FIGHT, verb: 0.3 },
      hat: { level: 2.2, layers: FIGHT, verb: 0.1, pan: 0.2 },
      tense: { level: 0.8, layers: BOSS, verb: 0.4, echo: 0.15 },
      fx: { level: 1.9, layers: FIGHT, verb: 0.3 },
    },
    play: playHub,
  },
  rust: {
    bpm: 112,
    swing: 0,
    seed: 23,
    scale: [2, 4, 5, 7, 9, 10, 0],
    chords: [
      { bass: 38, pad: [53, 57, 62] }, // Dm
      { bass: 38, pad: [53, 57, 62, 65] }, // Dm
      { bass: 34, pad: [53, 58, 62] }, // Bb
      { bass: 36, pad: [52, 55, 60] }, // C
      { bass: 38, pad: [53, 57, 62] }, // Dm
      { bass: 38, pad: [57, 62, 65] }, // Dm
      { bass: 43, pad: [55, 58, 62] }, // Gm
      { bass: 45, pad: [52, 57, 61] }, // A
    ],
    room: [1, 2600, 0.78],
    echo: [3, 0.5, 1800],
    melody: {
      low: 62,
      high: 77,
      max: 4,
      rhythms: [
        [0, 3, 6, 8, 11],
        [0, 2, 6, 10, 12],
        [0, 3, 6, 10, 14],
        [2, 4, 7, 8, 12],
      ],
      cadences: [
        [0, 3, 6],
        [0, 6, 8],
      ],
    },
    tracks: {
      pad: { level: 1.6, layers: ALL, verb: 0.35, duck: true },
      lead: { level: 1.5, layers: TUNE, verb: 0.25, echo: 0.35 },
      metal: { level: 2.5, layers: ALL, verb: 0.3, echo: 0.3 },
      bass: { level: 0.82, layers: FIGHT },
      kick: { level: 0.93, layers: FIGHT },
      snare: { level: 1.55, layers: FIGHT, verb: 0.25 },
      hat: { level: 1.4, layers: FIGHT, verb: 0.08, pan: 0.2 },
      alarm: { level: 1.5, layers: BOSS, verb: 0.2, echo: 0.25 },
      fx: { level: 1.25, layers: FIGHT, verb: 0.3 },
    },
    play: playRust,
  },
  green: {
    bpm: 100,
    swing: 0.16,
    seed: 37,
    scale: [4, 6, 7, 9, 11, 2],
    chords: [
      { bass: 40, pad: [55, 59, 62, 66] }, // Em9
      { bass: 36, pad: [55, 59, 64, 66] }, // Cmaj7#11
      { bass: 45, pad: [55, 60, 64, 71] }, // Am9
      { bass: 47, pad: [57, 62, 64, 66] }, // Bm11
      { bass: 40, pad: [55, 59, 62, 66] }, // Em9
      { bass: 36, pad: [55, 59, 64, 66] }, // Cmaj7#11
      { bass: 38, pad: [57, 62, 64, 66] }, // D6/9
      { bass: 47, pad: [57, 59, 64, 66] }, // B7sus4
    ],
    room: [1.4, 4200, 0.83],
    echo: [3, 0.55, 3000],
    melody: {
      low: 67,
      high: 83,
      max: 6,
      rhythms: [
        [0, 6, 8, 12],
        [0, 4, 10],
        [2, 6, 8, 14],
        [0, 3, 8, 12],
      ],
      cadences: [
        [0, 8],
        [0, 4, 6],
      ],
    },
    tracks: {
      pad: { level: 0.9, layers: ALL, verb: 0.6 },
      arp: { level: 2.5, layers: ALL, verb: 0.3, echo: 0.4 },
      flute: { level: 0.9, layers: TUNE, verb: 0.5, echo: 0.3 },
      eerie: { level: 2, layers: ALL, verb: 0.8, echo: 0.5 },
      bass: { level: 0.93, layers: FIGHT, verb: 0.05 },
      kick: { level: 1.05, layers: FIGHT },
      wood: { level: 2, layers: FIGHT, verb: 0.2 },
      shaker: { level: 2.5, layers: FIGHT, verb: 0.1, pan: -0.25 },
      conga: { level: 1.4, layers: FIGHT, verb: 0.15 },
      toms: { level: 0.9, layers: BOSS, verb: 0.2 },
      drone: { level: 1.2, layers: BOSS, verb: 0.3 },
      alarm: { level: 1.5, layers: BOSS, verb: 0.4, echo: 0.3 },
      fx: { level: 1.9, layers: FIGHT, verb: 0.3 },
    },
    play: playGreen,
  },
  core: {
    bpm: 124,
    swing: 0,
    seed: 53,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [
      { bass: 36, pad: [55, 60, 63, 67] }, // Cm
      { bass: 32, pad: [56, 60, 63, 68] }, // Ab
      { bass: 39, pad: [55, 58, 63, 67] }, // Eb
      { bass: 34, pad: [53, 58, 62, 65] }, // Bb
      { bass: 36, pad: [55, 60, 63, 67] }, // Cm
      { bass: 32, pad: [55, 60, 63, 68] }, // Abmaj7
      { bass: 41, pad: [56, 60, 65, 68] }, // Fm
      { bass: 43, pad: [55, 59, 62, 67] }, // G
    ],
    room: [1.1, 3000, 0.8],
    echo: [3, 0.5, 2600],
    melody: {
      low: 67,
      high: 84,
      max: 4,
      rhythms: [
        [0, 3, 6, 8, 10, 12],
        [0, 2, 4, 8, 11, 14],
        [0, 6, 8, 12, 14],
        [0, 3, 6, 10, 12, 14],
      ],
      cadences: [
        [0, 3, 6, 8],
        [0, 4, 8],
      ],
    },
    tracks: {
      pad: { level: 2.1, layers: ALL, verb: 0.35, duck: true },
      arp: { level: 3.4, layers: ALL, verb: 0.15, echo: 0.3 },
      lead: { level: 1.4, layers: TUNE, verb: 0.25, echo: 0.35 },
      bass: { level: 1, layers: FIGHT },
      kick: { level: 0.85, layers: FIGHT },
      snare: { level: 1.8, layers: FIGHT, verb: 0.3 },
      hat: { level: 1.55, layers: FIGHT, verb: 0.08, pan: 0.2 },
      alarm: { level: 1.6, layers: BOSS, verb: 0.2, echo: 0.3 },
      fx: { level: 1.4, layers: FIGHT, verb: 0.3 },
    },
    play: playCore,
  },
};

// -------------------------------------------------------------------- sfx

const PENTA = [0, 2, 4, 7, 9];
// Musical cues stay in tune; everything else gets a little random pitch.
// 'pickup' climbs 4% per crystal in a streak, finer than the ±7% jitter.
const TUNED = new Set<SfxKind>([
  'pickup',
  'win',
  'lose',
  'achievement',
  'combo',
  'heal',
  'lowHp',
  'bossIntro',
  'ui',
  'rare',
  'legendary',
]);
const PRIORITY = new Set<SfxKind>([
  'win',
  'lose',
  'bossIntro',
  'bossPhase',
  'achievement',
  'hit',
  'lowHp',
  'rare',
  'legendary',
]);
const MIN_GAP: Partial<Record<SfxKind, number>> = {
  lowHp: 0.5,
  bossIntro: 1,
  bossPhase: 0.6,
  win: 0.5,
  lose: 0.5,
  achievement: 0.25,
  combo: 0.05,
  rare: 0.4,
  legendary: 1,
};

function playSfx(
  ctx: Ctx,
  out: AudioNode,
  wet: AudioNode | null,
  kind: SfxKind,
  t: number,
  p: number,
  v: number,
  combo: number,
): number {
  const T = (o: Tone) => tone(ctx, out, { ...o, peak: o.peak * v, send: wet }),
    N = (o: Hiss) => hiss(ctx, out, { ...o, peak: o.peak * v, send: wet }),
    notes = (
      list: number[],
      gap: number,
      make: (n: number, k: number) => Tone,
    ) =>
      Math.max(t, ...list.map((n, k) => T({ ...make(n, k), t: t + k * gap })));
  switch (kind) {
    case 'shoot':
      N({ t, type: 'highpass', f: 5200, peak: 0.02, a: 0.001, d: 0.025 });
      return T({
        t,
        f: 1300 * p,
        to: 540 * p,
        glide: 0.045,
        osc: TRI,
        a: 0.001,
        d: 0.05,
        peak: 0.05,
        hp: 350,
      });
    case 'hit':
      N({
        t,
        type: 'lowpass',
        f: 2600 * p,
        to: 380,
        q: 0.8,
        peak: 0.22,
        a: 0.001,
        d: 0.11,
      });
      return T({
        t,
        f: 210 * p,
        to: 58 * p,
        glide: 0.13,
        osc: [{ type: 'square', level: 0.45 }, { type: 'sine' }],
        a: 0.002,
        d: 0.2,
        peak: 0.26,
        lp: 1800,
        lpTo: 260,
      });
    case 'coin':
      T({ t, f: hz(83) * p, osc: CHIME, a: 0.002, d: 0.12, peak: 0.08 });
      return T({
        t: t + 0.055,
        f: hz(88) * p,
        osc: CHIME,
        a: 0.002,
        d: 0.3,
        peak: 0.09,
        wet: 0.2,
      });
    case 'dash':
      T({
        t,
        f: 170 * p,
        to: 440 * p,
        glide: 0.14,
        a: 0.01,
        d: 0.14,
        peak: 0.07,
      });
      return N({
        t,
        f: 450 * p,
        to: 3400 * p,
        q: 1.3,
        a: 0.035,
        d: 0.17,
        peak: 0.28,
      });
    case 'win':
      T({
        t,
        f: hz(48),
        osc: SAW2,
        a: 0.05,
        hold: 0.4,
        d: 0.9,
        peak: 0.04,
        lp: 900,
        wet: 0.3,
      });
      return notes([72, 76, 79, 84], 0.09, (n, k) => ({
        t,
        f: hz(n),
        osc: BRASS,
        a: 0.01,
        hold: k === 3 ? 0.25 : 0,
        d: k === 3 ? 0.9 : 0.25,
        peak: 0.07,
        lp: 3200,
        wet: 0.35,
      }));
    case 'pulse':
      T({
        t,
        f: 440 * p,
        to: 110 * p,
        glide: 0.25,
        osc: [{ type: 'sawtooth' }],
        lp: 1800,
        lpTo: 200,
        a: 0.004,
        d: 0.3,
        peak: 0.05,
      });
      N({
        t,
        type: 'lowpass',
        f: 3000 * p,
        to: 150,
        q: 1.2,
        a: 0.004,
        d: 0.42,
        peak: 0.28,
        wet: 0.25,
      });
      return T({
        t,
        f: 115 * p,
        to: 34 * p,
        glide: 0.35,
        a: 0.004,
        d: 0.45,
        peak: 0.42,
      });
    case 'kill':
      T({
        t,
        f: 430 * p,
        to: 140 * p,
        glide: 0.07,
        osc: SQUARE,
        lp: 2400,
        a: 0.001,
        d: 0.08,
        peak: 0.04,
      });
      return N({
        t,
        f: 1700 * p,
        to: 650 * p,
        q: 1.4,
        a: 0.001,
        d: 0.09,
        peak: 0.15,
      });
    case 'eliteKill':
      N({ t, f: 1900 * p, to: 500 * p, q: 1.2, a: 0.001, d: 0.14, peak: 0.22 });
      T({
        t,
        f: 130 * p,
        to: 42 * p,
        glide: 0.3,
        a: 0.002,
        d: 0.35,
        peak: 0.34,
      });
      return T({
        t: t + 0.02,
        f: 660 * p,
        osc: RING,
        a: 0.002,
        d: 0.6,
        peak: 0.05,
        wet: 0.35,
      });
    case 'bossPhase':
      N({ t, f: 250, to: 4200, q: 1.6, a: 0.3, d: 0.25, peak: 0.16, wet: 0.3 });
      T({
        t: t + 0.3,
        f: 72 * p,
        to: 30,
        glide: 0.5,
        a: 0.003,
        d: 0.6,
        peak: 0.45,
      });
      return notes([38, 45, 50, 53], 0, (n) => ({
        t,
        f: hz(n) * p,
        osc: SAW2,
        a: 0.3,
        hold: 0.25,
        d: 0.9,
        peak: 0.045,
        lp: 400,
        lpTo: 2400,
        lpTime: 0.55,
        wet: 0.35,
      }));
    case 'pickup':
      T({
        t,
        f: 520 * p,
        to: 990 * p,
        glide: 0.06,
        a: 0.002,
        d: 0.1,
        peak: 0.08,
      });
      return T({
        t: t + 0.04,
        f: 1320 * p,
        osc: TRI,
        a: 0.002,
        d: 0.08,
        peak: 0.035,
      });
    case 'heal':
      T({
        t,
        f: 392 * p,
        to: 784 * p,
        glide: 0.3,
        a: 0.05,
        d: 0.3,
        peak: 0.04,
        wet: 0.3,
      });
      return notes([76, 79, 84], 0.06, (n) => ({
        t,
        f: hz(n) * p,
        osc: CHIME,
        a: 0.004,
        d: 0.4,
        peak: 0.05,
        wet: 0.35,
      }));
    case 'lowHp':
      T({
        t,
        f: 72,
        to: 46,
        glide: 0.1,
        a: 0.004,
        d: 0.14,
        peak: 0.34,
        lp: 220,
      });
      return T({
        t: t + 0.19,
        f: 66,
        to: 44,
        glide: 0.1,
        a: 0.004,
        d: 0.16,
        peak: 0.24,
        lp: 200,
      });
    case 'ui':
      N({ t, type: 'highpass', f: 6000, peak: 0.02, a: 0.001, d: 0.015 });
      return T({
        t,
        f: 1500 * p,
        to: 1100 * p,
        glide: 0.03,
        osc: TRI,
        a: 0.001,
        d: 0.04,
        peak: 0.07,
      });
    case 'achievement':
      N({
        t: t + 0.05,
        type: 'highpass',
        f: 7000,
        a: 0.12,
        d: 0.4,
        peak: 0.03,
        wet: 0.5,
      });
      return notes([79, 83, 86, 91], 0.075, (n, k) => ({
        t,
        f: hz(n),
        osc: BELL,
        a: 0.002,
        d: k === 3 ? 1.3 : 0.7,
        peak: 0.06,
        wet: 0.45,
      }));
    case 'combo': {
      const k = Math.min(12, Math.floor(Math.max(0, combo) / 5)),
        n = 67 + 12 * Math.floor(k / 5) + PENTA[k % 5];
      T({
        t,
        f: hz(n),
        osc: [{ type: 'square', level: 0.3 }, { type: 'triangle' }],
        lp: 4200,
        a: 0.002,
        d: 0.12,
        peak: 0.06,
      });
      return T({
        t: t + 0.045,
        f: hz(n + 7),
        osc: TRI,
        a: 0.002,
        d: 0.16,
        peak: 0.045,
        wet: 0.2,
      });
    }
    case 'explosion':
      T({ t, f: 95 * p, to: 30 * p, glide: 0.4, a: 0.003, d: 0.55, peak: 0.5 });
      N({ t: t + 0.025, f: 1300 * p, q: 3, a: 0.001, d: 0.14, peak: 0.14 });
      return N({
        t,
        type: 'lowpass',
        f: 4200 * p,
        to: 170,
        q: 0.8,
        a: 0.003,
        d: 0.75,
        peak: 0.42,
        wet: 0.25,
      });
    case 'lose':
      T({
        t,
        f: hz(45),
        osc: SAW2,
        lp: 320,
        a: 0.3,
        hold: 0.7,
        d: 1.3,
        peak: 0.05,
        wet: 0.35,
      });
      return notes([69, 67, 64, 57], 0.24, (n, k) => ({
        t,
        f: hz(n),
        osc: KEYS,
        lp: 1800,
        lpTo: 400,
        a: 0.004,
        d: k === 3 ? 1.6 : 0.6,
        peak: 0.07,
        wet: 0.4,
      }));
    case 'bossIntro':
      T({ t, f: 62, to: 27, glide: 1.1, a: 0.004, d: 1.6, peak: 0.5 });
      N({
        t,
        type: 'lowpass',
        f: 2400,
        to: 120,
        q: 0.7,
        a: 0.004,
        d: 0.9,
        peak: 0.3,
        wet: 0.3,
      });
      T({
        t: t + 0.02,
        f: 110,
        osc: GONG,
        a: 0.003,
        d: 2.2,
        peak: 0.07,
        wet: 0.5,
      });
      return notes([38, 45, 50], 0, (n) => ({
        t: t + 0.08,
        f: hz(n),
        osc: SAW2,
        a: 0.12,
        hold: 0.5,
        d: 1.1,
        peak: 0.05,
        lp: 300,
        lpTo: 1900,
        lpTime: 0.7,
        wet: 0.35,
      }));
    case 'rare': {
      // An airy lift into a glassy four-note climb over a soft major pad.
      const lift = N({
        t,
        f: 800,
        to: 5600,
        q: 1.1,
        a: 0.14,
        d: 0.32,
        peak: 0.09,
        wet: 0.4,
      });
      const pad = T({
        t: t + 0.08,
        f: hz(64),
        fs: [hz(64), hz(68), hz(71)],
        osc: SOFT,
        a: 0.06,
        hold: 0.2,
        d: 0.8,
        peak: 0.022,
        lp: 2600,
        wet: 0.4,
      });
      const climb = Math.max(
        ...[76, 80, 83, 88].map((n, k) =>
          T({
            t: t + 0.1 + k * 0.07,
            f: hz(n),
            osc: k === 3 ? BELL : GLASS,
            a: 0.003,
            d: k === 3 ? 1.1 : 0.5,
            peak: k === 3 ? 0.06 : 0.045,
            wet: 0.45,
          }),
        ),
      );
      const spark = T({
        t: t + 0.42,
        f: hz(100),
        osc: CHIME,
        a: 0.002,
        d: 0.5,
        peak: 0.022,
        wet: 0.6,
      });
      return Math.max(lift, pad, climb, spark);
    }
    case 'legendary': {
      // A riser, then a low hit with a gong, a brass chord and a bell cascade
      // with a glittering tail: the one sound that should stop the room.
      const hit = t + 0.34;
      const riser = N({
        t,
        f: 320,
        to: 6400,
        q: 1.4,
        a: 0.3,
        d: 0.08,
        peak: 0.13,
        wet: 0.35,
      });
      const boom = T({
        t: hit,
        f: 92,
        to: 36,
        glide: 0.5,
        a: 0.003,
        d: 0.85,
        peak: 0.42,
      });
      const gong = T({
        t: hit + 0.01,
        f: hz(48),
        osc: GONG,
        a: 0.003,
        d: 2.4,
        peak: 0.055,
        wet: 0.5,
      });
      const brass = T({
        t: hit,
        f: hz(60),
        fs: [hz(60), hz(64), hz(67), hz(72)],
        osc: BRASS,
        a: 0.02,
        hold: 0.35,
        d: 1.2,
        peak: 0.032,
        lp: 3400,
        wet: 0.4,
      });
      const bells = Math.max(
        ...[84, 88, 91, 96, 100].map((n, k) =>
          T({
            t: hit + 0.06 + k * 0.06,
            f: hz(n),
            osc: BELL,
            a: 0.002,
            d: k === 4 ? 1.6 : 0.8,
            peak: 0.045,
            wet: 0.5,
          }),
        ),
      );
      const glitter = N({
        t: hit + 0.05,
        type: 'highpass',
        f: 7200,
        a: 0.05,
        d: 1.2,
        peak: 0.035,
        wet: 0.6,
      });
      return Math.max(riser, boom, gong, brass, bells, glitter);
    }
  }
  return t;
}

// ----------------------------------------------------------------- engine

type AudioCtor = typeof AudioContext;
function audioContextClass(): AudioCtor | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { webkitAudioContext?: AudioCtor })
    .webkitAudioContext;
}

export class AudioEngine {
  context: AudioContext | null = null;
  private on = true;
  private bus: Bus | null = null;
  private seq: Sequencer | null = null;
  private fading: Sequencer[] = [];
  private theme: MusicTheme | null = null;
  private layer: MusicLayer = 'calm';
  private levels = { music: 0.4, sfx: 0.8 };
  private paused = false;
  private hidden = false;
  private talking = false;
  private seed = Math.floor(Math.random() * 2 ** 31);
  private timer: ReturnType<typeof setInterval> | null = null;
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  private recent = new Map<SfxKind, number[]>();
  private voices: number[] = [];
  private onVisibility: (() => void) | null = null;

  // Master mute (the top-bar toggle); ramps instead of cutting.
  get enabled() {
    return this.on;
  }
  set enabled(value: boolean) {
    if (this.on === !!value) return;
    this.on = !!value;
    this.applyMaster();
  }

  unlock() {
    if (!this.context) {
      const Ctor = audioContextClass();
      if (!Ctor) return;
      try {
        this.context = new Ctor({ latencyHint: 'interactive' });
      } catch {
        try {
          this.context = new Ctor();
        } catch {
          return;
        }
      }
      const bus = (this.bus = new Bus(this.context, this.levels, true));
      bus.master.gain.value = this.on && !this.hidden ? 1 : 0;
      if (this.paused) bus.pause(true, 0);
      if (this.talking) bus.speaking(true, 0);
      this.watch();
      if (this.theme) this.startTheme(this.theme);
    }
    if (this.context.state !== 'running' && !this.hidden)
      this.context.resume().catch(() => {});
  }

  play(
    kind: SfxKind,
    opts: { pitch?: number; combo?: number; volume?: number } = {},
  ) {
    const c = this.context,
      bus = this.bus;
    if (!this.on || !c || !bus || c.state !== 'running') return;
    const now = c.currentTime,
      gap = MIN_GAP[kind] ?? 0,
      recent = (this.recent.get(kind) ?? []).filter(
        (at) => now - at < Math.max(0.06, gap),
      );
    if (recent.length >= (gap ? 1 : 3)) return;
    this.voices = this.voices.filter((end) => end > now);
    if (this.voices.length >= MAX_VOICES && !PRIORITY.has(kind)) return;
    const pitch =
        (opts.pitch !== undefined &&
        opts.pitch > 0 &&
        Number.isFinite(opts.pitch)
          ? opts.pitch
          : 1) * (TUNED.has(kind) ? 1 : 1 + (Math.random() * 2 - 1) * 0.07),
      volume =
        opts.volume !== undefined && Number.isFinite(opts.volume)
          ? Math.min(2, Math.max(0, opts.volume))
          : 1,
      combo =
        opts.combo !== undefined && Number.isFinite(opts.combo)
          ? opts.combo
          : 0;
    try {
      const end = playSfx(
        c,
        bus.sfx,
        bus.verb?.input ?? null,
        kind,
        now + 0.005,
        pitch,
        volume,
        combo,
      );
      recent.push(now);
      this.recent.set(kind, recent);
      this.voices.push(end);
    } catch {
      // A broken voice must never take the game loop down with it.
    }
  }

  setVolumes(v: { music: number; sfx: number }) {
    this.levels = { music: clamp01(v.music), sfx: clamp01(v.sfx) };
    if (this.context && this.bus)
      this.bus.volumes(this.levels, this.context.currentTime);
  }

  // null fades the music out; switching themes crossfades over FADE.
  setMusic(theme: MusicTheme | null, layer?: MusicLayer) {
    if (layer) this.layer = layer;
    if (theme && !THEMES[theme]) theme = null;
    if (theme === this.theme) {
      if (this.seq) this.seq.pending = this.layer;
      return;
    }
    this.theme = theme;
    this.fadeCurrent();
    if (theme && this.context && this.bus) this.startTheme(theme);
  }

  // Takes effect on the next bar so drums never enter mid-phrase.
  setLayer(layer: MusicLayer) {
    this.layer = layer;
    if (this.seq) this.seq.pending = layer;
  }

  // The voice-over sits outside Web Audio, so the app reports when a line
  // starts and ends and the music ducks under it.
  setSpeaking(on: boolean) {
    this.talking = !!on;
    if (this.context && this.bus)
      this.bus.speaking(this.talking, this.context.currentTime);
  }

  setPaused(paused: boolean) {
    this.paused = !!paused;
    if (this.context && this.bus)
      this.bus.pause(this.paused, this.context.currentTime);
  }

  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts.clear();
    for (const seq of [this.seq, ...this.fading]) seq?.dispose();
    this.seq = null;
    this.fading = [];
    if (this.onVisibility && typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.onVisibility);
    this.onVisibility = null;
    this.context?.close().catch(() => {});
    this.context = null;
    this.bus = null;
  }

  private applyMaster() {
    if (this.context && this.bus)
      glide(
        this.bus.master.gain,
        this.on && !this.hidden ? 1 : 0,
        this.context.currentTime,
        0.08,
      );
  }

  private startTheme(theme: MusicTheme) {
    const c = this.context,
      bus = this.bus;
    if (!c || !bus) return;
    this.seed = (this.seed + 0x9e3779b1) >>> 0;
    this.seq = new Sequencer(
      c,
      bus.music,
      theme,
      this.layer,
      this.seed,
      c.currentTime + 0.06,
      this.fading.length ? FADE : COLD_FADE,
    );
    if (this.timer === null && typeof setInterval !== 'undefined')
      this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private fadeCurrent() {
    const seq = this.seq,
      c = this.context;
    this.seq = null;
    if (!seq || !c) return;
    seq.fadeOut(c.currentTime, FADE);
    this.fading.push(seq);
    this.later(
      () => {
        seq.dispose();
        this.fading = this.fading.filter((s) => s !== seq);
      },
      (FADE + 4) * 1000,
    );
  }

  private tick() {
    const c = this.context,
      live = this.seq ? [this.seq, ...this.fading] : this.fading;
    if (!c || !live.length) {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    // Silent music costs nothing: the grid resyncs once it is audible again.
    if (!this.on || this.hidden || !this.levels.music || c.state !== 'running')
      return;
    const now = c.currentTime;
    try {
      for (const seq of live) {
        seq.resync(now);
        seq.schedule(now + LOOKAHEAD);
      }
    } catch {
      // Stop the music rather than throwing every 25 ms.
      for (const seq of live) seq.dispose();
      this.seq = null;
      this.fading = [];
    }
  }

  private later(fn: () => void, ms: number) {
    if (typeof setTimeout === 'undefined') return fn();
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, ms);
    this.timeouts.add(id);
  }

  // Hidden tabs throttle timers, so mute and suspend instead of letting the
  // scheduler stutter; resume where the grid left off. The suspend is
  // immediate: Android's WebView.pauseTimers() freezes setTimeout for a
  // backgrounded app, so a deferred one would leave the context rendering
  // silence (and draining the battery) until the app came back.
  private watch() {
    if (this.onVisibility || typeof document === 'undefined') return;
    this.onVisibility = () => {
      const c = this.context;
      this.hidden = document.hidden;
      if (!c) return;
      this.applyMaster();
      // Resume even while 'running': a suspend still in flight from a quick
      // hide/show would otherwise land after it and leave the game silent.
      if (this.hidden) c.suspend().catch(() => {});
      else c.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  }
}

// ---------------------------------------------------------------- preview

export function encodeWav(channels: Float32Array[], rate: number) {
  const count = Math.max(1, channels.length),
    frames = channels[0]?.length ?? 0,
    bytes = frames * count * 2,
    view = new DataView(new ArrayBuffer(44 + bytes)),
    text = (at: number, s: string) => {
      for (let k = 0; k < s.length; k++) view.setUint8(at + k, s.charCodeAt(k));
    };
  text(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes, true);
  let at = 44;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < count; c++) {
      const x = Math.max(-1, Math.min(1, channels[c]?.[i] || 0));
      view.setInt16(at, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      at += 2;
    }
  return view.buffer;
}

// Renders a theme through the exact live instruments, sequenced up front in
// an OfflineAudioContext, and returns a 16-bit stereo WAV.
export async function renderThemePreview(
  theme: MusicTheme,
  layer: MusicLayer,
  seconds: number,
): Promise<Blob> {
  const rate = 44100,
    length = Math.ceil(Math.min(120, Math.max(1, seconds || 0)) * rate),
    Offline =
      typeof OfflineAudioContext !== 'undefined'
        ? OfflineAudioContext
        : undefined;
  if (!Offline || !THEMES[theme])
    return new Blob([encodeWav([], rate)], { type: 'audio/wav' });
  const ctx = new Offline(2, length, rate),
    bus = new Bus(ctx, { music: 1, sfx: 0 }, false),
    end = length / rate,
    tail = Math.min(1.5, end / 4),
    seq = new Sequencer(
      ctx,
      bus.music,
      theme,
      layer,
      THEMES[theme].seed,
      0.05,
      0.3,
    );
  // Feed the sequencer a second at a time, like the live scheduler does:
  // idle future voices would otherwise be pulled through the graph too.
  if (typeof ctx.suspend === 'function') {
    seq.schedule(Math.min(end, 1.5));
    for (let at = 1; at < end; at++) {
      const until = Math.min(end, at + 1.5);
      ctx
        .suspend(at)
        .then(() => {
          seq.schedule(until);
          return ctx.resume();
        })
        .catch(() => {});
    }
  } else seq.schedule(end);
  bus.master.gain.setValueAtTime(1, end - tail);
  bus.master.gain.linearRampToValueAtTime(0, end);
  const out = await ctx.startRendering(),
    channels: Float32Array[] = [];
  for (let c = 0; c < out.numberOfChannels; c++)
    channels.push(out.getChannelData(c));
  return new Blob([encodeWav(channels, rate)], { type: 'audio/wav' });
}
