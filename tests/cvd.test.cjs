// The colour filters for colour blindness: the matrices are sound, and each
// really pulls apart colours that its kind of eye mixes up.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../.test-build/cvd.js');
const M = require('../.test-build/model.js');

const clamp = (v) => Math.max(0, Math.min(1, v));
const apply = (m, c) => m.map((r) => clamp(r[0] * c[0] + r[1] * c[1] + r[2] * c[2]));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// How far apart two colours look to the eye of this kind, with and without the filter.
const apart = (kind, a, b) => dist(C.seen(kind, a), C.seen(kind, b));
const apartAfter = (kind, a, b) => {
  const m = C.cvdMatrix(kind);
  return dist(C.seen(kind, apply(m, a)), C.seen(kind, apply(m, b)));
};

test('Every filter is a finite 3x3 matrix, written as the 4x5 text of an SVG colour matrix', () => {
  for (const kind of C.CVD_KINDS) {
    const m = C.cvdMatrix(kind);
    assert.equal(m.length, 3);
    for (const row of m) {
      assert.equal(row.length, 3);
      for (const v of row) assert.ok(Number.isFinite(v) && Math.abs(v) < 3, `${kind}: ${v}`);
    }
    const text = C.cvdValues(kind).trim().split(/\s+/).map(Number);
    assert.equal(text.length, 20);
    assert.ok(text.every(Number.isFinite));
    // Alpha is left alone: the last row is 0 0 0 1 0, and the other rows add nothing.
    assert.deepEqual(text.slice(15), [0, 0, 0, 1, 0]);
    assert.deepEqual([text[3], text[4], text[8], text[9], text[13], text[14]], [0, 0, 0, 0, 0, 0]);
  }
});

test('Red and green are pulled apart for the red-blind and the green-blind, blue and green for the blue-blind', () => {
  const redGreen = [[0.9, 0.25, 0.25], [0.3, 0.7, 0.3]];
  const orangeGreen = [[0.9, 0.55, 0.2], [0.4, 0.75, 0.25]];
  for (const kind of ['protan', 'deutan'])
    for (const [a, b] of [redGreen, orangeGreen])
      assert.ok(
        apartAfter(kind, a, b) > apart(kind, a, b) * 1.15,
        `${kind}: ${apart(kind, a, b).toFixed(2)} -> ${apartAfter(kind, a, b).toFixed(2)}`,
      );
  const blueGreen = [[0.2, 0.3, 0.9], [0.2, 0.7, 0.5]];
  const yellowPink = [[0.9, 0.9, 0.3], [0.9, 0.7, 0.8]];
  for (const [a, b] of [blueGreen, yellowPink])
    assert.ok(
      apartAfter('tritan', a, b) > apart('tritan', a, b) * 1.15,
      `tritan: ${apart('tritan', a, b).toFixed(2)} -> ${apartAfter('tritan', a, b).toFixed(2)}`,
    );
});

test('Black stays black, white stays white, and plain light and dark stay far apart', () => {
  for (const kind of C.CVD_KINDS) {
    const m = C.cvdMatrix(kind);
    const black = apply(m, [0, 0, 0]);
    assert.ok(black.every((v) => v < 0.01), `${kind} black ${black}`);
    const white = apply(m, [1, 1, 1]);
    assert.ok(white.every((v) => v > 0.97), `${kind} white ${white}`);
    assert.ok(dist(apply(m, [0.9, 0.9, 0.9]), apply(m, [0.1, 0.1, 0.1])) > 1.2, `${kind} contrast`);
  }
});

test('The setting is one of four and anything else is off, also in saved profiles', () => {
  assert.equal(M.DEFAULT_SETTINGS.cvd, 'off');
  for (const ok of ['off', 'protan', 'deutan', 'tritan'])
    assert.equal(M.sanitizeSettings({ cvd: ok }).cvd, ok);
  for (const bad of [undefined, null, 1, true, 'x', 'Protan', {}, []])
    assert.equal(M.sanitizeSettings({ cvd: bad }).cvd, 'off', String(bad));
  assert.equal(M.sanitizeSettings(null).cvd, 'off');
  assert.deepEqual(Object.keys(C.CVD_LABELS), ['off', 'protan', 'deutan', 'tritan']);
});
