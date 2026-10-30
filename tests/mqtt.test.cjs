const { test } = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../.test-build/mqtt.js');

test('The packets of a connection are the ones MQTT 3.1.1 asks for', () => {
  const connect = Q.connectPacket('osbb-1', 30);
  assert.deepEqual([...connect.slice(0, 2)], [0x10, 10 + 2 + 6]);
  assert.deepEqual([...connect.slice(2, 12)], [0, 4, 0x4d, 0x51, 0x54, 0x54, 4, 2, 0, 30]);
  assert.equal(new TextDecoder().decode(connect.slice(14)), 'osbb-1');
  const sub = Q.subscribePacket(7, 'a/b');
  assert.deepEqual([...sub], [0x82, 8, 0, 7, 0, 3, 0x61, 0x2f, 0x62, 0]);
  const pub = Q.publishPacket('a/b', 'hi');
  assert.deepEqual([...pub], [0x30, 7, 0, 3, 0x61, 0x2f, 0x62, 0x68, 0x69]);
  assert.deepEqual([...Q.PING], [0xc0, 0]);
  assert.deepEqual([...Q.DISCONNECT], [0xe0, 0]);
});

test('A long publish uses a multi-byte length and reads back unchanged, in Ukrainian too', () => {
  const body = JSON.stringify({ m: 'Привіт, світе! ' + 'я'.repeat(5000) });
  const pub = Q.publishPacket('osbb17/ABCDE/up', body);
  assert.ok(pub[1] & 128, 'the length takes more than one byte');
  const [got] = new Q.Reader().push(pub);
  assert.deepEqual(got, { type: 'publish', topic: 'osbb17/ABCDE/up', payload: body });
});

test('The reader joins pieces, splits a stream and knows the answers of a broker', () => {
  const reader = new Q.Reader();
  const a = Q.publishPacket('t', 'one'),
    b = Q.publishPacket('t', 'two');
  const stream = new Uint8Array([...a, ...b]);
  // Byte by byte: nothing until a packet is whole, then each one in order.
  const seen = [];
  for (const byte of stream) seen.push(...reader.push(Uint8Array.of(byte)));
  assert.deepEqual(seen.map((p) => p.payload), ['one', 'two']);
  assert.deepEqual(reader.push(Uint8Array.of(0x20, 2, 0, 0)), [{ type: 'connack', code: 0 }]);
  assert.deepEqual(reader.push(Uint8Array.of(0x20, 2, 0, 5)), [{ type: 'connack', code: 5 }]);
  assert.deepEqual(reader.push(Uint8Array.of(0x90, 3, 0, 1, 0)), [{ type: 'suback' }]);
  assert.deepEqual(reader.push(Uint8Array.of(0xd0, 0)), [{ type: 'pingresp' }]);
  assert.deepEqual(reader.push(Uint8Array.of(0x40, 2, 0, 1)), [{ type: 'other', id: 4 }]);
  // Two packets in one chunk.
  assert.equal(reader.push(new Uint8Array([...a, ...Q.PING.slice(0, 0), 0xd0, 0])).length, 2);
});

test('A publish with a QoS above 0 carries a packet id that is skipped', () => {
  const body = [0, 1, 0x74, 0, 9, 0x68, 0x69];
  const [p] = new Q.Reader().push(Uint8Array.from([0x32, body.length, ...body]));
  assert.deepEqual(p, { type: 'publish', topic: 't', payload: 'hi' });
});

test('A packet that is too long, or a length that never ends, is refused', () => {
  assert.throws(() => new Q.Reader().push(Uint8Array.of(0x30, 0xff, 0xff, 0xff, 0xff, 0x01)));
  assert.throws(() => new Q.Reader().push(Uint8Array.of(0x30, 0x80, 0x80, 0x80, 0x80, 0x80)));
  // The largest length that is allowed to be announced is waited for, not refused.
  assert.deepEqual(new Q.Reader().push(Uint8Array.of(0x30, 0x80, 0x80, 0x40)), []);
  assert.throws(() => new Q.Reader().push(Uint8Array.of(0x30, 0x81, 0x80, 0x80, 0x01)), /too long/);
});
