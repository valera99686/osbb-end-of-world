const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PACE, Pacer } = require('../.test-build/pace.js');

// A pacer for a 1080p window whose fight is past its warm-up.
function seasoned() {
  const p = new Pacer();
  p.ratio(1, 1920, 1080);
  for (let ms = 0; ms < PACE.warm; ms += 50) p.frame(50);
  p.skip = 0;
  return p;
}
// Whole windows of equal frames.
function feed(p, ms, windows = 1) {
  for (let i = 0; i < windows * (PACE.window + PACE.settle); i++) p.frame(ms);
}

test('a small canvas keeps the sharpest ratio the display has, up to the top', () => {
  const p = new Pacer();
  assert.equal(p.ratio(1, 800, 400), 1);
  assert.equal(p.ratio(1.5, 800, 400), 1.5);
  assert.equal(p.ratio(3, 800, 400), PACE.top);
});

test('a big canvas is held to the pixel budget', () => {
  const p = new Pacer();
  const r = p.ratio(2, 1693, 692);
  assert.ok(r < 2);
  assert.ok(Math.round(1693 * r) * Math.round(692 * r) <= PACE.budget * 1.01);
  // A 1080p window, even on a dense display, is still sharp enough.
  assert.ok(new Pacer().ratio(1, 1920, 1080) > 0.99);
  assert.ok(new Pacer().ratio(1.5, 1920, 1080) >= 1.38);
});

test('the ratio never leaves the floor or the display', () => {
  const p = new Pacer();
  p.detail = PACE.least;
  assert.ok(p.ratio(1, 4000, 2000) >= PACE.floor);
  assert.ok(p.ratio(1, 300, 200) <= 1);
  assert.equal(new Pacer().ratio(NaN, 800, 400), 1);
  assert.equal(new Pacer().ratio(-2, 800, 400), 1);
});

test('slow frames take detail away, in proportion', () => {
  const p = seasoned();
  feed(p, 70);
  assert.ok(p.detail < 0.7, `detail ${p.detail}`);
  assert.ok(p.detail >= PACE.least);
  const mild = seasoned();
  feed(mild, 30);
  assert.ok(mild.detail > p.detail);
  assert.ok(mild.detail < 1);
});

test('detail never goes below its least', () => {
  const p = seasoned();
  feed(p, 90, 12);
  assert.equal(p.detail, PACE.least);
});

test('steady 60 fps changes nothing', () => {
  const p = seasoned();
  feed(p, 16.7, 5);
  assert.equal(p.detail, 1);
});

test('the start of a fight is not judged', () => {
  const p = new Pacer();
  p.ratio(1, 1920, 1080);
  // Everything is slow while the sprites are decoded...
  for (let ms = 0; ms < PACE.warm - 100; ms += 60) p.frame(60);
  assert.equal(p.detail, 1);
  // ...and a new fight starts the wait again.
  const q = seasoned();
  q.begin();
  for (let ms = 0; ms < PACE.warm - 100; ms += 60) q.frame(60);
  assert.equal(q.detail, 1);
  feed(q, 60, 2);
  assert.ok(q.detail < 1);
});

test('detail comes back when frames are quick, but not above a level that was too slow', () => {
  const p = seasoned();
  feed(p, 70, 2);
  const low = p.detail;
  assert.ok(low < 0.6);
  // Quick again: it climbs...
  feed(p, 10, 2);
  assert.ok(p.detail > low);
  // ...and stops under the level it was cut from (1), whatever follows.
  feed(p, 10, 40);
  assert.ok(p.detail <= 1 * PACE.left + 1e-9, `detail ${p.detail}`);
  // A level that fails again is remembered lower still.
  const before = p.detail;
  feed(p, 70, 1);
  assert.ok(p.detail < before);
  feed(p, 10, 40);
  assert.ok(p.detail < before * PACE.left + 1e-9);
});

test('a hidden tab and nonsense frame times are not slow frames', () => {
  const p = seasoned();
  for (let i = 0; i < PACE.window * 3; i++) p.frame(PACE.gap + 1);
  for (const bad of [NaN, -5, 0, Infinity, undefined])
    for (let i = 0; i < 400; i++) p.frame(bad);
  assert.equal(p.detail, 1);
  // A single hiccup cannot decide a window of quick frames.
  feed(p, 16.7, 1);
  p.frame(200);
  feed(p, 16.7, 1);
  assert.equal(p.detail, 1);
});

test('a very different screen is judged afresh', () => {
  const p = seasoned();
  feed(p, 70, 2);
  assert.ok(p.detail < 1);
  // A little resize keeps what was learned.
  const kept = p.detail;
  p.ratio(1, 1900, 1060);
  assert.equal(p.detail, kept);
  p.ratio(1, 640, 360);
  assert.equal(p.detail, 1);
});
