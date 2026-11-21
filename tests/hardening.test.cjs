// What a stranger on the other end of a room, or in a pasted save code, can and
// cannot do. Every case here was found by feeding odd data to the real code
// (the 0.44.0 security review); all but the chat-seat guard failed before the fix.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const N = require('../.test-build/net.js');
const SS = require('../.test-build/session.js');
const M = require('../.test-build/model.js');
const D = require('../.test-build/data.js');
const A = require('../.test-build/achievements.js');
const U = require('../.test-build/upgrades.js');
const P = require('../.test-build/progression.js');

function link() {
  const sent = [];
  return {
    kind: 'p2p',
    open: true,
    sent,
    onMessage: null,
    onClose: null,
    send: (m) => sent.push(JSON.parse(JSON.stringify(m))),
    close() {},
  };
}
// A host with `n` greeted guests: [host, [links as the host holds them]].
function room(n = 1) {
  const host = new SS.NetSession('host', 'x', { hero: 'mechanic', name: 'H' });
  const links = [];
  for (let i = 0; i < n; i++) {
    const l = link();
    host.adopt(l);
    l.onMessage({
      t: 'hello',
      v: N.NET_PROTOCOL,
      build: 'x',
      hero: 'flora',
      name: 'G' + i,
    });
    links.push(l);
  }
  return [host, links];
}
// A guest that the host has welcomed: [guest, the link it listens on].
function guestOf() {
  const [, [hl]] = room(1);
  const guest = new SS.NetSession('guest', 'x', { hero: 'flora', name: 'G' });
  const gl = link();
  guest.adopt(gl);
  gl.onMessage(hl.sent.find((m) => m.t === 'welcome'));
  return [guest, gl];
}

test('A guest cannot speak for the host: its status and refusal are ignored', () => {
  const [host, [l]] = room(1);
  l.onMessage({ t: 'status', text: 'pwned' });
  l.onMessage({ t: 'refuse', why: 'version:9' });
  assert.equal(host.phase, 'connected', 'the room stands');
  assert.equal(host.error, '');
  assert.equal(host.status, '');
});

test('A host that sends text of the wrong kind leaves a guest with text', () => {
  const [guest, gl] = guestOf();
  gl.onMessage({ t: 'status', text: { a: 1 } });
  assert.equal(guest.status, '');
  gl.onMessage({ t: 'status', text: 'x'.repeat(5000) });
  assert.equal(guest.status.length, 200);
  gl.onMessage({ t: 'refuse', why: { a: 1 } });
  assert.equal(typeof guest.error, 'string');
  assert.equal(guest.phase, 'refused');
});

test('Anything that is not a message object is dropped by both ends', () => {
  const [host, [l]] = room(1);
  const [guest, gl] = guestOf();
  for (const junk of [null, undefined, 'x', 7, true, [], [1, 2]]) {
    assert.doesNotThrow(() => l.onMessage(junk), String(junk));
    assert.doesNotThrow(() => gl.onMessage(junk), String(junk));
  }
  assert.equal(host.phase, 'connected');
  assert.equal(guest.phase, 'connected');
});

test('A seat named in chat or on the microphone must be a seat of the room', () => {
  const [guest, gl] = guestOf();
  for (const seat of [-5, 1e12, 1.5, 'x', null, 4]) {
    gl.onMessage({ t: 'chat', seat, text: 'hi' });
    gl.onMessage({ t: 'voice', seat, on: true });
  }
  assert.deepEqual([...new Set(guest.chat.map((c) => c.seat))], [0]);
  assert.ok(guest.mics.every((_, s) => s < 4));
  assert.equal(guest.mics.length <= 4, true);
});

test("A guest cannot claim another seat in chat, and its own seat is the host's word", () => {
  const [host, links] = room(2);
  links[0].onMessage({ t: 'chat', text: 'from the first', seat: 2 });
  assert.deepEqual(
    host.chat.map((c) => [c.seat, c.text]),
    [[1, 'from the first']],
  );
});

test('Frames of a stranger are numbers inside the stick, or nothing', () => {
  const host = new N.Lockstep(
    0,
    7,
    { open: true, send() {} },
    () => ({ x: 0, y: 0 }),
    5,
    2,
  );
  const put = (row) => {
    host.receive({ t: 'in', sid: 7, f: [row] }, 1);
    return host.pool[1].get(row[0]);
  };
  assert.deepEqual(put([3, 50, -100, 3]), {
    x: 0.5,
    y: -1,
    dash: true,
    pulse: true,
  });
  for (const bad of [JSON.parse('1e999'), NaN, {}, 'abc', null, [1]]) {
    const f = put([4, bad, bad, bad]);
    assert.ok(f && f.x === 0 && f.y === 0 && f.dash === false, String(bad));
  }
  // A huge number is a full stick, not a faster house.
  assert.equal(put([5, 1e11, -1e11, 0]).x, 1);
  assert.equal(put([5, 1e11, -1e11, 0]).y, -1);
});

test('A guest cannot park a flood of rows, rows from far ahead or rows that are not rows', () => {
  const host = new N.Lockstep(
    0,
    7,
    { open: true, send() {} },
    () => ({ x: 0, y: 0 }),
    5,
    2,
  );
  const rows = Array.from({ length: 200000 }, (_, i) => [i + 1, 1, 1, 0]);
  host.receive({ t: 'in', sid: 7, f: rows }, 1);
  assert.ok(
    host.pool[1].size <= 600,
    'at most 600 rows from one message: ' + host.pool[1].size,
  );
  host.receive(
    {
      t: 'in',
      sid: 7,
      f: [[1e15, 1, 1, 0], ['9', 1, 1, 0], [1.5, 0, 0, 0], null, 5],
    },
    1,
  );
  assert.equal(host.pool[1].has(1e15), false);
  assert.equal(host.pool[1].has('9'), false);
  assert.equal(host.pool[1].has(1.5), false);
  for (const f of [5, null, { length: 1e9 }, 'abc'])
    assert.doesNotThrow(
      () => host.receive({ t: 'in', sid: 7, f }, 1),
      String(f),
    );
});

test('A save code cannot bring ids named like built-in object keys into the profile', () => {
  const KEYS = [
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
    'valueOf',
  ];
  const meta = { ...M.initialMeta(), wins: 3, runs: 5 };
  meta.unlocked = [...meta.unlocked, ...KEYS, 'rivets'];
  meta.seen = [...KEYS, 'lathe'];
  const back = M.readSave(M.saveData(meta, null)).meta;
  for (const k of KEYS) {
    assert.ok(!back.unlocked.includes(k), 'unlocked ' + k);
    assert.ok(!back.seen.includes(k), 'seen ' + k);
  }
  assert.ok(back.seen.includes('lathe'), 'a real piece of furniture stays');
  // The run: modules in a flat or the bag, and furniture.
  const m = { ...M.initialMeta(), wins: 8, unlocked: D.ITEMS.map((i) => i.id) };
  const run = M.makeRun(m, 'mechanic', 0, 5);
  run.backpack = [{ uid: 1, id: 'toString' }];
  const restored = M.readSave(M.saveData(m, run)).run;
  assert.ok(restored, 'the run itself is still loaded');
  assert.deepEqual(restored.backpack, [], 'no module called toString');
});

test('Lookup maps of ids have no prototype', () => {
  for (const [name, map] of Object.entries({
    ITEM_BY_ID: D.ITEM_BY_ID,
    ACHIEVEMENT_BY_ID: A.ACHIEVEMENT_BY_ID,
    PERK_BY_ID: U.PERK_BY_ID,
    BLUEPRINT_BY_ID: P.BLUEPRINT_BY_ID,
  })) {
    assert.equal(Object.getPrototypeOf(map), null, name);
    for (const k of ['constructor', '__proto__', 'toString'])
      assert.equal(map[k], undefined, name + '.' + k);
  }
});

test('Nobody in a room can pass for somebody else: a taken nick gets the seat number', () => {
  const host = new SS.NetSession('host', 'x', {
    hero: 'mechanic',
    name: 'Валера',
  });
  const hello = (name, extra = {}) => ({
    t: 'hello',
    v: N.NET_PROTOCOL,
    build: 'x',
    hero: 'flora',
    name,
    ...extra,
  });
  const join = (name) => {
    const l = link();
    host.adopt(l);
    l.onMessage(hello(name));
    return l;
  };
  join('валера');
  join('Господар');
  join('Кіт');
  const names = host.roomRoster().map((r) => host.nameOf(r.seat));
  assert.deepEqual(names, ['Валера', 'валера 2', 'Господар 3', 'Кіт']);
  assert.equal(
    new Set(names.map((n) => n.toLowerCase())).size,
    names.length,
    'all different',
  );
  // A long nick keeps its limit.
  const long = new SS.NetSession('host', 'x', {
    hero: 'mechanic',
    name: 'А'.repeat(20),
  });
  const l = link();
  long.adopt(l);
  l.onMessage(hello('А'.repeat(20)));
  assert.ok([...long.nameOf(1)].length <= 20, long.nameOf(1));
  assert.notEqual(long.nameOf(1), long.nameOf(0));
});

test('A guest that comes back to its seat keeps its own nick', () => {
  const host = new SS.NetSession('host', 'x', { hero: 'mechanic', name: 'H' });
  const first = link();
  host.adopt(first);
  first.onMessage({
    t: 'hello',
    v: N.NET_PROTOCOL,
    build: 'x',
    hero: 'flora',
    name: 'Кіт',
  });
  const welcome = first.sent.find((m) => m.t === 'welcome');
  const again = link();
  host.adopt(again);
  again.onMessage({
    t: 'hello',
    v: N.NET_PROTOCOL,
    build: 'x',
    hero: 'flora',
    name: 'Кіт',
    token: welcome.token,
    seat: welcome.seat,
  });
  assert.equal(host.nameOf(1), 'Кіт');
  assert.equal(host.guests.length, 1);
});

test('A hero that is not text is not kept for a guest', () => {
  const host = new SS.NetSession('host', 'x', { hero: 'mechanic', name: 'H' });
  const l = link();
  host.adopt(l);
  l.onMessage({
    t: 'hello',
    v: N.NET_PROTOCOL,
    build: 'x',
    hero: { a: 1 },
    name: 'G',
  });
  assert.equal(host.guests[0].partner.hero, '');
});

const C = require('../.test-build/relay-crypto.js');

test('A room on a public broker is sealed: the same code opens it, nothing else does', async () => {
  const a = await C.deriveRoom('ABCDE');
  const b = await C.deriveRoom('ABCDE');
  assert.equal(a.tag, b.tag, 'both ends name the room the same');
  assert.match(a.tag, /^[0-9a-f]{32}$/);
  assert.ok(
    !a.tag.toLowerCase().includes('abcde'),
    'the code is not in the tag',
  );
  const text = JSON.stringify({
    m: { t: 'chat', text: 'привіт, секретна фраза' },
    q: 4,
  });
  const sealed = await a.seal('osbb18/x/up', text);
  assert.ok(
    !sealed.includes('chat') &&
      !Buffer.from(sealed, 'base64').toString('latin1').includes('chat'),
    'no word of it in the clear',
  );
  assert.equal(
    await b.open('osbb18/x/up', sealed),
    text,
    'the other end reads it',
  );
  assert.notEqual(
    await a.seal('osbb18/x/up', text),
    sealed,
    'a new random start every time',
  );
  const other = await C.deriveRoom('ABCDF');
  assert.notEqual(other.tag, a.tag);
  assert.equal(
    await other.open('osbb18/x/up', sealed),
    null,
    'another code does not',
  );
});

test('A sealed message is bound to its topic and refuses to be changed or made up', async () => {
  const room = await C.deriveRoom('KLMNP');
  const sealed = await room.seal('osbb18/x/up', 'hello');
  assert.equal(
    await room.open('osbb18/x/to/y', sealed),
    null,
    'moved to another topic',
  );
  const bytes = Buffer.from(sealed, 'base64');
  bytes[bytes.length - 1] ^= 1;
  assert.equal(
    await room.open('osbb18/x/up', bytes.toString('base64')),
    null,
    'one bit changed',
  );
  assert.equal(
    await room.open(
      'osbb18/x/up',
      Buffer.from(bytes.subarray(0, 20)).toString('base64'),
    ),
    null,
    'cut short',
  );
  for (const junk of [
    '',
    'x',
    '!!!!',
    '{"m":1}',
    'A'.repeat(40),
    'A'.repeat(2 << 20),
  ])
    assert.equal(await room.open('osbb18/x/up', junk), null, junk.slice(0, 12));
});

test('A room code comes from the secure source, not from Math.random', () => {
  assert.equal(
    N.ROOM_ALPHABET.length,
    32,
    'makeCode picks a symbol by five bits of a byte',
  );
  const real = Math.random;
  Math.random = () => {
    throw new Error('Math.random used');
  };
  try {
    const codes = Array.from({ length: 2000 }, () => N.makeCode());
    assert.ok(
      codes.every((c) => N.normalizeCode(c) === c),
      'letters and digits of the alphabet, five of them',
    );
    assert.ok(new Set(codes).size > 1990, 'and they differ');
  } finally {
    Math.random = real;
  }
});

test('The page policy lets the game reach exactly the brokers the relay uses', () => {
  const fs = require('node:fs');
  const relay = fs.readFileSync(
    require('node:path').join(__dirname, '../app/relay-link.ts'),
    'utf8',
  );
  const post = fs.readFileSync(
    require('node:path').join(__dirname, '../scripts/postbuild.mjs'),
    'utf8',
  );
  const brokers = relay.slice(
    relay.indexOf('export const BROKERS'),
    relay.indexOf('];', relay.indexOf('export const BROKERS')),
  );
  const urls = [...brokers.matchAll(/'(wss:\/\/[^'/]+)(?::(\d+))?[^']*'/g)].map(
    (m) => m[1] + (m[2] ? ':' + m[2] : ''),
  );
  assert.equal(urls.length, 4, 'the four public brokers');
  for (const url of urls)
    assert.ok(post.includes(`'${url}'`), url + ' is allowed in connect-src');
  for (const bad of [
    "'unsafe-eval'",
    "script-src 'self' 'unsafe-inline'",
    'http:',
    'default-src *',
  ])
    assert.ok(!post.includes(bad), bad + ' is not in the policy');
  assert.ok(
    post.includes("script-src 'self'") && post.includes("object-src 'none'"),
  );
});
