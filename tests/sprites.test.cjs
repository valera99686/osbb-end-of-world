const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fast } = require('../.test-build/sprites.js');

const realBitmap = globalThis.createImageBitmap;
afterEach(() => {
  if (realBitmap) globalThis.createImageBitmap = realBitmap;
  else delete globalThis.createImageBitmap;
});
const later = () => new Promise((resolve) => setTimeout(resolve, 5));

test('a sprite is drawn from its canvas until the decoded copy is ready', async () => {
  const bitmap = { decoded: true };
  let encoded = 0;
  globalThis.createImageBitmap = async (blob) => {
    assert.deepEqual(blob, { png: true });
    return bitmap;
  };
  const canvas = {
    toBlob(done) {
      encoded++;
      done({ png: true });
    },
  };
  assert.equal(fast(canvas), canvas);
  assert.equal(fast(canvas), canvas);
  await later();
  assert.equal(fast(canvas), bitmap);
  assert.equal(fast(canvas), bitmap);
  // Decoded once, however often it was asked for.
  assert.equal(encoded, 1);
});

test('each canvas gets its own decoded copy', async () => {
  globalThis.createImageBitmap = async () => ({ id: Math.random() });
  const a = { toBlob: (done) => done({}) },
    b = { toBlob: (done) => done({}) };
  fast(a);
  fast(b);
  await later();
  assert.notEqual(fast(a), fast(b));
  assert.equal(fast(a), fast(a));
});

test('a canvas that cannot be decoded keeps being drawn as it is', async () => {
  globalThis.createImageBitmap = async () => {
    throw new Error('no decoder');
  };
  const broken = { toBlob: (done) => done({}) };
  const empty = { toBlob: (done) => done(null) };
  const throws = {
    toBlob() {
      throw new Error('tainted');
    },
  };
  const plain = {};
  for (const canvas of [broken, empty, throws, plain]) {
    assert.equal(fast(canvas), canvas);
    await later();
    assert.equal(fast(canvas), canvas);
  }
  // No decoder at all, as in Node or an old browser.
  delete globalThis.createImageBitmap;
  const old = { toBlob: (done) => done({}) };
  assert.equal(fast(old), old);
  await later();
  assert.equal(fast(old), old);
});
