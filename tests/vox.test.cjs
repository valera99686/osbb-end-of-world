// Voice through a relay: the µ-law codec, the frames, the gate that keeps
// silence off the wire, the base64 limits and the clock that spaces the frames.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../.test-build/vox.js');

const tone = (n, hz = 440, rate = V.VOX.rate, amp = 0.5) =>
  Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

test('µ-law keeps a sample within its step and the sign and silence exactly', () => {
  assert.equal(V.unLaw(V.muLaw(0)) * 32768 | 0, 0 | 0, 'silence stays near zero');
  for (const x of [-1, -0.7, -0.25, -0.01, 0.01, 0.1, 0.5, 0.9, 1]) {
    const y = V.unLaw(V.muLaw(x));
    assert.equal(Math.sign(y), Math.sign(x), `sign of ${x}`);
    // The error of µ-law grows with the level: at most about 3% of it, plus a floor.
    assert.ok(Math.abs(y - x) <= Math.abs(x) * 0.04 + 0.002, `${x} -> ${y}`);
  }
  assert.ok(Math.abs(V.unLaw(V.muLaw(5))) <= 1, 'out of range is clipped');
  // All 256 bytes decode to something, and encoding that gives the byte back (but 0x7f/0xff are both zero).
  for (let b = 0; b < 256; b++) {
    const back = V.muLaw(V.unLaw(b));
    assert.ok(back === b || V.unLaw(back) === V.unLaw(b), `byte ${b}`);
  }
});

test('A tone survives encoding and decoding with a small error', () => {
  const x = tone(800);
  const y = V.decodeLaw(V.encodeLaw(x));
  assert.equal(y.length, x.length);
  let err = 0, power = 0;
  for (let i = 0; i < x.length; i++) {
    err += (x[i] - y[i]) ** 2;
    power += x[i] ** 2;
  }
  assert.ok(10 * Math.log10(power / err) > 28, 'better than 28 dB');
});

test('Samples are brought to 8 kHz from any rate, block by block, without losing any', () => {
  for (const rate of [48000, 44100, 16000, 8000]) {
    const d = new V.Downsampler(rate);
    const out = [];
    const total = rate; // one second
    const block = 1000;
    const x = tone(total, 300, rate);
    for (let i = 0; i < total; i += block) d.push(x.slice(i, i + block), out);
    assert.ok(Math.abs(out.length - V.VOX.rate) <= 1, `${rate}: ${out.length}`);
    // A low tone keeps its level.
    const peak = Math.max(...out.map(Math.abs));
    assert.ok(peak > 0.4 && peak < 0.55, `${rate}: peak ${peak}`);
  }
});

test('Speech goes in frames of 250 ms, silence does not go at all, and the ends of words are kept', () => {
  const f = new V.Framer(8000);
  // Silence: nothing.
  assert.equal(f.push(new Array(V.VOX.frame * 3).fill(0)).length, 0);
  // Speech: one frame per 2000 samples, each as many bytes as samples.
  const talk = f.push(tone(V.VOX.frame * 2));
  assert.equal(talk.length, 2);
  assert.ok(talk.every((b) => b.length === V.VOX.frame));
  // After the speech `hang` quiet frames still go, then the line is quiet again.
  const after = f.push(new Array(V.VOX.frame * 6).fill(0));
  assert.equal(after.length, V.VOX.hang);
  // Blocks that do not fit a frame wait for the next.
  const g = new V.Framer(8000);
  assert.equal(g.push(tone(1500)).length, 0);
  assert.equal(g.push(tone(600)).length, 1);
  // A very quiet hum is under the gate.
  const h = new V.Framer(8000);
  assert.equal(h.push(tone(V.VOX.frame * 2, 100, 8000, V.VOX.gate / 2)).length, 0);
  // From 48 kHz a second of speech is four frames.
  const k = new V.Framer(48000);
  assert.equal(k.push(tone(48000, 300, 48000)).length, 4);
});

test('Base64 round-trips a frame and refuses what is not one', () => {
  const bytes = V.encodeLaw(tone(V.VOX.frame));
  const text = V.toBase64(bytes);
  assert.equal(text.length, Math.ceil(bytes.length / 3) * 4);
  assert.deepEqual([...V.fromBase64(text)], [...bytes]);
  for (const bad of [null, undefined, 5, {}, '', '!!!not base64!!!', 'A'.repeat(V.VOX.max * 2 + 1)])
    assert.equal(V.fromBase64(bad), null, String(bad));
  // More bytes than a frame may have.
  assert.equal(V.fromBase64(V.toBase64(new Uint8Array(V.VOX.max + 1))), null);
});

test('A frame is read only if it is from the right guest and well formed', () => {
  const d = V.toBase64(new Uint8Array(100));
  assert.deepEqual(V.readVox({ g: 'abc', n: 4, d }, 'abc').n, 4);
  for (const bad of [
    null, 5, 'x', {}, { g: 'zzz', n: 1, d }, { g: 'abc', n: -1, d }, { g: 'abc', n: 1.5, d },
    { g: 'abc', n: '1', d }, { g: 'abc', n: 1, d: '' }, { g: 'abc', n: 1, d: 7 },
  ])
    assert.equal(V.readVox(bad, 'abc'), null, JSON.stringify(bad));
});

test('Frames are played one after another after a short wait, and what is late or repeated is not', () => {
  const c = new V.JitterClock();
  const len = V.VOX.frame / V.VOX.rate;
  const a = c.place(10, len, 1);
  assert.ok(Math.abs(a - (10 + V.VOX.jitter)) < 1e-9, 'the first one waits');
  assert.ok(Math.abs(c.place(10.1, len, 2) - (a + len)) < 1e-9, 'the next follows without a gap');
  assert.equal(c.place(10.2, len, 2), null, 'a repeat is dropped');
  assert.equal(c.place(10.2, len, 1), null, 'a frame from the past is dropped');
  // An underrun (nothing came for a while): the wait is made again.
  const late = c.place(20, len, 3);
  assert.ok(Math.abs(late - (20 + V.VOX.jitter)) < 1e-9);
  // Far behind the clock the frames are dropped rather than played late for ever.
  const d = new V.JitterClock();
  let n = 0;
  d.place(0, 0.25, ++n);
  let dropped = 0;
  for (let i = 0; i < 20; i++) if (d.place(0, 0.25, ++n) === null) dropped++;
  assert.ok(dropped > 5, 'a burst is trimmed to a bounded delay');
  const e = new V.JitterClock();
  e.place(0, 0.25, 1);
  e.reset();
  assert.ok(e.place(0, 0.25, 1) !== null, 'reset starts again');
});
