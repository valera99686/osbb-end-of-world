const { test } = require('node:test');
const assert = require('node:assert/strict');
const Audio = require('../.test-build/audio.js');

const KINDS = [
  'shoot',
  'hit',
  'coin',
  'dash',
  'win',
  'pulse',
  'kill',
  'eliteKill',
  'bossPhase',
  'pickup',
  'heal',
  'lowHp',
  'ui',
  'achievement',
  'combo',
  'explosion',
  'lose',
  'bossIntro',
  'rare',
  'legendary',
];
const LAYERS = ['calm', 'battle', 'boss'];

// Minimal Web Audio stand-in that rejects what browsers reject: non-finite
// values, negative times, zero exponential targets, over-long delays.
function mockAudio() {
  const stats = { sources: 0, errors: [] };
  const bad = (what, v) => stats.errors.push(`${what}: ${v}`);
  const time = (what, t) => {
    if (!Number.isFinite(t) || t < 0) bad(what, t);
  };
  class Param {
    constructor(v, max = Infinity) {
      this.v = v;
      this.max = max;
      this.automationRate = 'a-rate';
    }
    get value() {
      return this.v;
    }
    set value(v) {
      if (!Number.isFinite(v) || v > this.max) bad('value', v);
      this.v = v;
    }
    setValueAtTime(v, t) {
      if (!Number.isFinite(v)) bad('setValueAtTime', v);
      time('setValueAtTime time', t);
      return this;
    }
    linearRampToValueAtTime(v, t) {
      if (!Number.isFinite(v)) bad('linearRamp', v);
      time('linearRamp time', t);
      return this;
    }
    exponentialRampToValueAtTime(v, t) {
      if (!Number.isFinite(v) || v === 0) bad('exponentialRamp', v);
      time('exponentialRamp time', t);
      return this;
    }
    setTargetAtTime(v, t, c) {
      if (!Number.isFinite(v) || !(c > 0)) bad('setTargetAtTime', v);
      time('setTargetAtTime time', t);
      return this;
    }
    cancelScheduledValues(t) {
      time('cancel time', t);
      return this;
    }
  }
  class Node {
    connect(target) {
      if (!(target instanceof Node || target instanceof Param))
        bad('connect', target);
      return target;
    }
    disconnect() {}
  }
  class Source extends Node {
    start(t = 0, offset = 0) {
      time('start', t);
      time('offset', offset);
      stats.sources++;
    }
    stop(t = 0) {
      time('stop', t);
    }
  }
  class Ctx {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.state = 'running';
      this.destination = new Node();
    }
    node(params) {
      const n = new Node();
      for (const [k, v] of Object.entries(params)) n[k] = new Param(v);
      return n;
    }
    createGain() {
      return this.node({ gain: 1 });
    }
    createBiquadFilter() {
      return this.node({ frequency: 350, Q: 1, gain: 0 });
    }
    createDelay(max = 1) {
      const n = new Node();
      n.delayTime = new Param(0, max);
      return n;
    }
    createStereoPanner() {
      return this.node({ pan: 0 });
    }
    createDynamicsCompressor() {
      return this.node({
        threshold: -24,
        knee: 30,
        ratio: 12,
        attack: 0.003,
        release: 0.25,
      });
    }
    createOscillator() {
      const n = new Source();
      n.frequency = new Param(440);
      n.detune = new Param(0);
      n.setPeriodicWave = (w) => {
        if (!w) bad('periodicWave', w);
      };
      return n;
    }
    createBufferSource() {
      const n = new Source();
      n.playbackRate = new Param(1);
      return n;
    }
    createBuffer(channels, length, rate) {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData: (c) => data[c],
      };
    }
    createPeriodicWave(real, imag) {
      if (real.length !== imag.length || ![...imag].every(Number.isFinite))
        bad('createPeriodicWave', imag.length);
      return {};
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
  }
  class Offline extends Ctx {
    constructor(channels, length, rate) {
      super();
      this.channels = channels;
      this.length = length;
      this.sampleRate = rate;
      this.stops = [];
    }
    suspend(at) {
      time('offline suspend', at);
      return new Promise((resolve) => this.stops.push({ at, resolve }));
    }
    // Walk the suspend points in order, letting each feed the sequencer.
    async startRendering() {
      for (const stop of this.stops.sort((a, b) => a.at - b.at)) {
        this.currentTime = stop.at;
        stop.resolve();
        await new Promise((r) => setImmediate(r));
      }
      return this.createBuffer(this.channels, this.length, this.sampleRate);
    }
  }
  return { Ctx, Offline, stats };
}

function withGlobals(values, fn) {
  const old = {};
  for (const key of Object.keys(values)) {
    old[key] = globalThis[key];
    globalThis[key] = values[key];
  }
  const restore = () => {
    for (const key of Object.keys(values))
      if (old[key] === undefined) delete globalThis[key];
      else globalThis[key] = old[key];
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function')
      return result.finally(restore);
    restore();
    return result;
  } catch (e) {
    restore();
    throw e;
  }
}

test('audio is import-safe and silent without Web Audio', async () => {
  assert.equal(typeof AudioContext, 'undefined');
  assert.deepEqual(Audio.MUSIC_THEMES, ['hub', 'rust', 'green', 'core']);
  const audio = new Audio.AudioEngine();
  assert.equal(audio.enabled, true);
  assert.equal(audio.context, null);
  audio.setVolumes({ music: 0.4, sfx: 0.9 });
  audio.setMusic('rust', 'battle');
  audio.setLayer('boss');
  audio.setPaused(true);
  audio.unlock();
  assert.equal(audio.context, null);
  for (const kind of KINDS) audio.play(kind, { combo: 30, pitch: 1.2 });
  audio.enabled = false;
  audio.setMusic(null);
  audio.dispose();
  const blob = await Audio.renderThemePreview('core', 'boss', 4);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(blob.size, 44);
});

test('encodeWav writes a 16-bit PCM header and clamps samples', () => {
  const left = new Float32Array([0, 1, -1, 2]),
    right = new Float32Array([0.5, -0.5, 0, -2]),
    view = new DataView(Audio.encodeWav([left, right], 44100)),
    text = (at) =>
      String.fromCharCode(...new Uint8Array(view.buffer, at, 4).values());
  assert.equal(text(0), 'RIFF');
  assert.equal(text(8), 'WAVE');
  assert.equal(text(36), 'data');
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 16);
  assert.equal(view.byteLength, 60);
  const samples = Array.from({ length: 8 }, (_, k) =>
    view.getInt16(44 + k * 2, true),
  );
  assert.deepEqual(
    samples,
    [0, 16383, 32767, -16384, -32768, 0, 32767, -32768],
  );
});

test('every theme and layer renders offline through valid automation', async () => {
  const { Offline, stats } = mockAudio();
  await withGlobals({ OfflineAudioContext: Offline }, async () => {
    for (const theme of Audio.MUSIC_THEMES)
      for (const layer of LAYERS) {
        const before = stats.sources,
          blob = await Audio.renderThemePreview(theme, layer, 26);
        assert.equal(blob.type, 'audio/wav');
        assert.equal(blob.size, 44 + 26 * 44100 * 4);
        assert.ok(stats.sources - before > 200, `${theme}/${layer} is silent`);
      }
  });
  assert.deepEqual(stats.errors, []);
});

test('live engine sequences music, limits voices and honours mute', () => {
  const { Ctx, stats } = mockAudio();
  withGlobals({ AudioContext: Ctx }, () => {
    const audio = new Audio.AudioEngine();
    audio.setMusic('rust', 'calm');
    audio.unlock();
    const c = audio.context;
    assert.ok(c);
    const run = (seconds) => {
      for (let k = 0; k < seconds * 40; k++) {
        c.currentTime += 0.025;
        audio.tick();
      }
    };
    run(3);
    const calm = stats.sources;
    assert.ok(calm > 0);
    audio.setLayer('battle');
    run(6);
    audio.setLayer('boss');
    run(6);
    for (const theme of ['green', 'core', 'hub']) {
      audio.setMusic(theme, 'battle');
      run(4);
      audio.setLayer('boss');
      run(5);
    }
    audio.setPaused(true);
    run(2);
    audio.setPaused(false);
    audio.setVolumes({ music: 0, sfx: 1 });
    let at = stats.sources;
    run(2);
    assert.equal(stats.sources, at, 'silent music is not sequenced');
    audio.setVolumes({ music: 0.2, sfx: 1 });
    run(2);
    assert.ok(stats.sources > at);
    for (const kind of KINDS) {
      c.currentTime += 1;
      audio.play(kind, { combo: 40 });
    }
    c.currentTime += 1;
    at = stats.sources;
    audio.play('kill');
    const one = stats.sources - at;
    assert.ok(one > 0);
    for (let k = 0; k < 9; k++) audio.play('kill');
    assert.equal(stats.sources - at, one * 3);
    c.currentTime += 1;
    audio.enabled = false;
    at = stats.sources;
    audio.play('hit');
    run(2);
    assert.equal(stats.sources, at);
    audio.enabled = true;
    audio.setMusic(null);
    run(3);
    audio.dispose();
    assert.equal(audio.context, null);
  });
  assert.deepEqual(stats.errors, []);
});

// A live engine that is always disposed: its sequencer interval would
// otherwise keep the test process alive after a failed assertion.
function withEngine(globals, fn) {
  return withGlobals(globals, () => {
    const audio = new Audio.AudioEngine();
    try {
      return fn(audio);
    } finally {
      audio.dispose();
    }
  });
}

test('a hitch that skips a downbeat still plays it, late and only once', () => {
  const { Ctx, stats } = mockAudio();
  withEngine({ AudioContext: Ctx }, (audio) => {
    audio.setMusic('rust', 'battle');
    audio.unlock();
    const c = audio.context,
      seq = audio.seq,
      played = [];
    const play = seq.def.play;
    seq.def = {
      ...seq.def,
      play: (m, cur) => {
        played.push({ s: cur.s, bar: cur.bar, t: cur.t });
        play(m, cur);
      },
    };
    for (let k = 0; k < 40; k++) {
      c.currentTime += 0.025;
      audio.tick();
    }
    // Stall past the next downbeat, but end inside that bar.
    const down = Math.ceil(seq.step / 16) * 16,
      at = seq.time + (down - seq.step) * seq.sixteenth;
    played.length = 0;
    c.currentTime = at + seq.sixteenth * 2.5;
    audio.tick();
    const first = played[0];
    assert.ok(first, 'something plays after the hitch');
    assert.equal(first.s, 0, 'the skipped downbeat plays first');
    assert.equal(first.bar, down / 16);
    assert.ok(first.t >= c.currentTime && first.t < c.currentTime + 0.02);
    assert.ok(played.slice(1).every((p) => p.s > 0 && p.t > c.currentTime));
    assert.equal(played.filter((p) => p.s === 0).length, 1);
    // A stall that ends right on the next downbeat adds no extra one.
    const next = Math.ceil(seq.step / 16) * 16;
    played.length = 0;
    c.currentTime = seq.time + (next - seq.step) * seq.sixteenth - 0.001;
    audio.tick();
    assert.equal(played.filter((p) => p.s === 0).length, 1);
    assert.ok(played[0].t >= c.currentTime - 0.001);
  });
  assert.deepEqual(stats.errors, []);
});

test('hiding the page suspends audio at once, without waiting on timers', () => {
  const { Ctx, stats } = mockAudio();
  let listener = null;
  const doc = {
    hidden: false,
    addEventListener: (type, fn) => {
      if (type === 'visibilitychange') listener = fn;
    },
    removeEventListener: () => {},
  };
  withEngine({ AudioContext: Ctx, document: doc }, (audio) => {
    audio.setMusic('hub', 'calm');
    audio.unlock();
    const c = audio.context;
    assert.equal(c.state, 'running');
    assert.ok(listener);
    doc.hidden = true;
    listener();
    // Android's pauseTimers() would freeze a setTimeout here.
    assert.equal(c.state, 'suspended');
    doc.hidden = false;
    listener();
    assert.equal(c.state, 'running');
    // A quick hide/show still ends running.
    doc.hidden = true;
    listener();
    doc.hidden = false;
    listener();
    assert.equal(c.state, 'running');
  });
  assert.deepEqual(stats.errors, []);
});

test('a pickup streak climbs in pitch without random detune', () => {
  const { Ctx } = mockAudio();
  withEngine({ AudioContext: Ctx }, (audio) => {
    audio.unlock();
    const c = audio.context,
      made = [];
    const create = c.createOscillator.bind(c);
    c.createOscillator = () => {
      const o = create();
      made.push(o);
      return o;
    };
    const pitchOf = (pitch, random) => {
      const real = Math.random;
      Math.random = () => random;
      try {
        c.currentTime += 1;
        made.length = 0;
        audio.play('pickup', { pitch });
        return made[0].frequency.value;
      } finally {
        Math.random = real;
      }
    };
    assert.equal(pitchOf(1.2, 0), pitchOf(1.2, 0.999));
    let last = 0;
    for (let streak = 0; streak <= 12; streak++) {
      const f = pitchOf(1 + streak * 0.04, streak % 2 ? 0 : 0.999);
      assert.ok(f > last, `step ${streak} climbs`);
      last = f;
    }
  });
});

test('a voice line ducks the music, then releases it', () => {
  assert.ok(Audio.VOICE_DUCK.level > 0 && Audio.VOICE_DUCK.level <= 0.35);
  assert.ok(Audio.VOICE_DUCK.attack <= 0.25 && Audio.VOICE_DUCK.release <= 0.6);
  const { Ctx, stats } = mockAudio();
  withEngine({ AudioContext: Ctx }, (audio) => {
    audio.setSpeaking(true); // before the context exists: remembered
    audio.setMusic('hub', 'calm');
    audio.unlock();
    const c = audio.context;
    const targets = [];
    const param = audio.bus.talk.gain;
    const set = param.setTargetAtTime.bind(param);
    param.setTargetAtTime = (v, t, k) => (targets.push(v), set(v, t, k));
    for (let k = 0; k < 80; k++) {
      c.currentTime += 0.025;
      audio.tick();
    }
    audio.setSpeaking(false);
    audio.setSpeaking(true);
    audio.setSpeaking(false);
    assert.deepEqual(targets, [1, Audio.VOICE_DUCK.level, 1]);
  });
  assert.deepEqual(stats.errors, []);
});
