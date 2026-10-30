const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const N = require('../.test-build/net.js');
const { Battle } = require('../.test-build/engine.js');

const silent = { play: () => {}, setLayer: () => {}, setPaused: () => {} };
const meta = { ...M.initialMeta(), wins: 8 };

// Two ends of one pipe; messages arrive `latency` driver ticks later, in order.
function pipe(latency = 0) {
  let now = 0;
  const lanes = { a: [], b: [] };
  const end = (out) => ({
    open: true,
    onMessage: null,
    onClose: null,
    send(m) {
      if (this.open) out.push({ at: now + latency, m: JSON.parse(JSON.stringify(m)) });
    },
    close() {
      this.open = false;
    },
  });
  const a = end(lanes.b),
    b = end(lanes.a);
  const deliver = () => {
    now++;
    for (const [lane, to] of [
      [lanes.a, a],
      [lanes.b, b],
    ]) {
      while (lane.length && lane[0].at <= now) to.onMessage?.(lane.shift().m);
    }
  };
  const cut = () => {
    a.open = b.open = false;
    a.onClose?.();
    b.onClose?.();
  };
  return { a, b, deliver, cut };
}
const script = {
  // Deterministic "hands": the host circles, the guest zigzags and both press.
  host: (t) => ({ x: Math.cos(t * 1.3), y: Math.sin(t * 1.3) }),
  guest: (t) => ({ x: Math.sin(t * 2.1), y: t % 4 < 2 ? 1 : -1 }),
};
function end(role, link, opts = {}) {
  const run = M.makeRun(meta, 'mechanic', opts.chapter ?? 0, 9, { coop: 'flora' });
  if (opts.xp) run.xp = opts.xp;
  let aim = { x: 0, y: 0 };
  const sync = new N.Lockstep(role, 1, link, () => aim);
  link.onMessage = (m) => sync.receive(m);
  link.onClose = () => sync.handleClose();
  const log = { drafts: 0, taken: 0 };
  const rec = new Map();
  const b = new Battle(null, run, meta, silent, () => {}, () => {}, {
    sync,
    onPerkDraft: opts.draft
      ? (offers) => {
          log.drafts++;
          log.offers = offers;
        }
      : undefined,
    onPerkTaken: () => log.taken++,
  });
  // A fingerprint of the fight every 30 steps, to compare at equal steps.
  const update = b.update.bind(b);
  let n = 0;
  b.update = (dt) => {
    update(dt);
    if (++n % 30 === 0) rec.set(n, b.stateHash());
  };
  return { b, sync, log, rec, hands: (v) => (aim = v), role };
}
// Runs both ends for `seconds` of wall time, each with its own frame rate.
function play(host, guest, wire, seconds, rates = [1 / 60, 1 / 37], hook) {
  let th = 0,
    tg = 0,
    t = 0;
  host.sync.begin();
  guest.sync.begin();
  const dt = 1 / 240;
  for (; t < seconds; t += dt) {
    wire.deliver();
    if (t >= th) {
      th += rates[0];
      host.hands(script.host(t));
      if (Math.floor(t * 3) % 7 === 0 && Math.floor(t * 3) !== host.lastPress) {
        host.lastPress = Math.floor(t * 3);
        host.b.localDash();
      }
      host.b.tick(rates[0]);
    }
    if (t >= tg) {
      tg += rates[1];
      guest.hands(script.guest(t));
      if (Math.floor(t * 2) % 5 === 0 && Math.floor(t * 2) !== guest.lastPress) {
        guest.lastPress = Math.floor(t * 2);
        guest.b.localPulse();
        guest.b.localDash();
      }
      guest.b.tick(rates[1]);
    }
    hook?.(t);
  }
}
// The ends are never at the very same step at one instant (the faster one
// runs ahead by the input delay), so equality is checked at equal steps.
const same = (a, b) => {
  assert.ok(Math.abs(a.sync.step - b.sync.step) <= N.INPUT_DELAY + 1);
  let compared = 0;
  for (const [step, hash] of a.rec)
    if (b.rec.has(step)) {
      assert.equal(hash, b.rec.get(step), `the fight differs at step ${step}`);
      compared++;
    }
  assert.ok(compared >= Math.floor(Math.min(a.sync.step, b.sync.step) / 30) - 1, `only ${compared} checkpoints`);
  return compared;
};

test('Inputs are rounded to the same hundredths at both ends and wrapped as numbers', () => {
  assert.deepEqual(N.quantize(0.333, -0.666), { x: 0.33, y: -0.67 });
  const long = N.quantize(3, 4);
  assert.ok(Math.abs(Math.hypot(long.x, long.y) - 1) < 0.02);
  assert.deepEqual(N.quantize(0, 0), { x: 0, y: 0 });
  assert.ok(Object.is(N.quantize(-0.001, 0).x, 0), 'no negative zero');
  assert.equal(N.STEP, 1 / 60);
});

test('Two ends of a fight stay identical through steps, presses, a slow link and uneven frame rates', () => {
  const wire = pipe(3);
  const host = end(0, wire.a),
    guest = end(1, wire.b);
  play(host, guest, wire, 25);
  assert.ok(host.sync.step > 60 * 15, `only ${host.sync.step} steps in 25 s`);
  same(host, guest);
  assert.ok(!host.sync.desync && !guest.sync.desync, 'the hash checks agree');
  assert.ok(host.b.run.kills > 0, 'there was a fight');
  assert.ok(host.b.run.dashes > 0 && host.b.ally.dashCd >= 0);
  // Both ends really moved the two bodies.
  assert.ok(Math.hypot(host.b.x - 800, host.b.y - 500) > 5);
  assert.ok(Math.hypot(host.b.ally.x - 890, host.b.ally.y - 540) > 5);
});

test('A slower partner holds the fight back instead of tearing it apart', () => {
  const wire = pipe(1);
  const host = end(0, wire.a),
    guest = end(1, wire.b);
  // The guest draws one frame in 20 (3 fps): the host can only follow.
  play(host, guest, wire, 12, [1 / 60, 1 / 3]);
  same(host, guest);
  assert.ok(host.sync.step < 60 * 12, 'the host did not run away');
  assert.ok(host.sync.step > 20);
});

test('Silence from the partner stalls the fight after the input delay and counts the wait', () => {
  const wire = pipe(0);
  const host = end(0, wire.a),
    guest = end(1, wire.b);
  host.sync.begin(); // the guest never answers
  for (let i = 0; i < 600; i++) host.b.tick(1 / 60);
  assert.equal(host.sync.step, 0, 'not a single step without the partner');
  assert.ok(host.sync.stalled > N.STALL_WARN, `stalled ${host.sync.stalled}`);
  void guest;
});

test('A drift is noticed by the hash check and stops the fight', () => {
  const wire = pipe(2);
  const host = end(0, wire.a),
    guest = end(1, wire.b);
  let seen = 0;
  host.sync.onDesync = () => seen++;
  guest.sync.onDesync = () => seen++;
  let done = false;
  play(host, guest, wire, 12, [1 / 60, 1 / 60], () => {
    if (!done && host.sync.step > 50) {
      done = true;
      guest.b.run.coins += 7;
      guest.b.x += 30;
    }
  });
  assert.ok(host.sync.desync && guest.sync.desync, 'both ends saw it');
  assert.equal(seen, 2);
  const stopped = host.sync.step;
  host.b.tick(1 / 60);
  host.b.tick(1 / 60);
  assert.equal(host.sync.step, stopped, 'no more steps after a drift');
});

test('The host picks a perk and both ends take it at the same moment', () => {
  const wire = pipe(2);
  const host = end(0, wire.a, { draft: true, xp: 40 }),
    guest = end(1, wire.b, { draft: true, xp: 40 });
  let picked = 0;
  play(host, guest, wire, 10, [1 / 60, 1 / 45], () => {
    // Only the host's screen chooses; the guest just waits.
    if (host.b.drafting && !picked) {
      picked++;
      const id = host.b.drafting[0];
      host.sync.choose(id);
      host.b.choosePerk(id);
    }
  });
  assert.ok(host.log.drafts >= 1 && guest.log.drafts >= 1, 'both ends saw the draft');
  assert.deepEqual(host.log.offers, guest.log.offers, 'with the very same offers');
  assert.ok(guest.log.taken >= 1 && host.log.taken >= 1);
  assert.deepEqual(host.b.run.perks, guest.b.run.perks);
  same(host, guest);
});

test('A pick that arrives before the guest reaches the draft waits for it', () => {
  const wire = pipe(0);
  const host = end(0, wire.a, { draft: true, xp: 40 }),
    guest = end(1, wire.b, { draft: true, xp: 40 });
  // The pick goes out in advance (as if the guest was a few steps behind).
  guest.sync.receive({ t: 'perk', sid: 1, id: 'tea' });
  guest.sync.receive({ t: 'perk', sid: 2, id: 'ignored' });
  assert.equal(guest.log.taken, 0, 'nothing happens while no draft is open');
  void host;
});

test('Messages of another fight are ignored, a closed link is reported', () => {
  const wire = pipe(0);
  const host = end(0, wire.a);
  host.sync.begin();
  host.sync.receive({ t: 'in', sid: 77, f: [[0, 100, 100, 3]] });
  assert.equal(host.sync.cur[1].x, 0);
  let closed = 0;
  host.sync.onClosed = () => closed++;
  wire.cut();
  assert.equal(closed, 1);
  assert.ok(host.sync.closed);
  let over = 0;
  host.sync.onOver = () => over++;
  host.sync.receive({ t: 'over', sid: 1 });
  assert.equal(over, 1);
});

test('Alone, nothing changed: no lockstep, local presses act at once, input from keys', () => {
  const run = M.makeRun(meta, 'mechanic', 0, 9);
  const b = new Battle(null, run, meta, silent, () => {}, () => {}, {});
  assert.equal(b.sync, null);
  assert.ok(!b.localDuo);
  b.localDash();
  assert.ok(b.dashCd > 0, 'a press is a dash right away');
  b.keys.add('KeyD');
  b.keys.add('ArrowUp');
  assert.deepEqual(b.localAim(), { x: 1, y: -1 });
  const duo = new Battle(null, M.makeRun(meta, 'mechanic', 0, 9, { coop: 'nina' }), meta, silent, () => {}, () => {}, {});
  assert.ok(duo.localDuo);
});

const S = require('../.test-build/session.js');
const hero = (h) => ({ hero: h, name: 'Гравець ' + h });
function rooms(build = 'a', guestBuild = build, latency = 0) {
  const wire = pipe(latency);
  const host = new S.NetSession('host', build, hero('mechanic'));
  const guest = new S.NetSession('guest', guestBuild, hero('nina'));
  host.adopt(wire.a);
  guest.adopt(wire.b);
  for (let i = 0; i < 4; i++) wire.deliver();
  return { wire, host, guest };
}

test('Room codes are five unambiguous characters and forgive spaces, dashes and case', () => {
  for (let i = 0; i < 300; i++) {
    const code = N.makeCode();
    assert.equal(code.length, N.ROOM_LENGTH);
    assert.ok(![...code].some((c) => 'O0I1'.includes(c)), code);
    assert.equal(N.normalizeCode(code), code);
  }
  assert.equal(N.normalizeCode(' ab-c d2 '), 'ABCD2');
  assert.equal(N.normalizeCode('abcd'), '');
  assert.equal(N.normalizeCode('abcdef'), '');
  assert.equal(N.normalizeCode('ABCD0'), '', 'a zero is not a letter O');
  assert.equal(N.normalizeCode(''), '');
  assert.equal(new Set(Array.from({ length: 200 }, () => N.makeCode())).size > 190, true);
});

test('The host and the guest greet each other and learn who the other one is', () => {
  const { host, guest } = rooms();
  assert.equal(host.phase, 'connected');
  assert.deepEqual(host.partner, { hero: 'nina', name: 'Гравець nina' });
  assert.equal(guest.phase, 'connected');
  let changes = 0;
  const off = guest.subscribe(() => changes++);
  host.sendStatus('Крок 3 з 10');
  const wire2 = host.link;
  assert.ok(wire2);
  // The status travels with the next delivery.
  assert.equal(guest.status, '');
  off();
});

test('A guest with another build is refused and the host keeps waiting', () => {
  const { host, guest } = rooms('0.18.0', '0.17.0');
  assert.equal(guest.phase, 'refused');
  assert.ok(guest.error.startsWith('version:'), guest.error);
  assert.equal(host.phase, 'waiting');
  assert.equal(host.partner, null);
});

test('The host opens a fight, the guest builds it, and the very same fight runs at both ends', async () => {
  const { wire, host, guest } = rooms();
  host.sendStatus('Крок 2');
  wire.deliver();
  assert.equal(guest.status, 'Крок 2');
  const run = M.makeRun(meta, 'mechanic', 0, 9, { coop: 'nina' });
  const opened = host.open(JSON.parse(JSON.stringify(run)), meta);
  // The guest's screen was not ready: the fight waits for it.
  wire.deliver();
  const early = guest.takeStart();
  assert.ok(early && early.sid === 1);
  assert.equal(guest.takeStart(), null);
  // Build both ends. The host builds only after "ready", as in the app.
  const mk = (session, role, sid) => {
    const r = M.makeRun(meta, 'mechanic', 0, 9, { coop: 'nina' });
    let aim = { x: 0, y: 0 };
    const sync = new N.Lockstep(role, sid, session.link, () => aim);
    const rec = new Map();
    const b = new Battle(null, r, meta, silent, () => {}, () => {}, { sync });
    const update = b.update.bind(b);
    let n = 0;
    b.update = (dt) => {
      update(dt);
      if (++n % 30 === 0) rec.set(n, b.stateHash());
    };
    session.attach(sync);
    return { b, sync, rec, hands: (v) => (aim = v) };
  };
  const g = mk(guest, 1, early.sid);
  guest.ready(early.sid);
  g.sync.begin();
  // The host's frames could only start after "ready"; its first ones land
  // before the host has attached (they must be held, not dropped).
  wire.deliver();
  const sid = await opened;
  assert.equal(sid, 1);
  const h = mk(host, 0, sid);
  h.sync.begin();
  for (let t = 0; t < 14; t += 1 / 120) {
    wire.deliver();
    g.hands(script.guest(t));
    h.hands(script.host(t));
    h.b.tick(1 / 60);
    g.b.tick(1 / 45);
  }
  assert.ok(h.sync.step > 300, `${h.sync.step} steps`);
  let compared = 0;
  for (const [step, hash] of h.rec)
    if (g.rec.has(step)) {
      assert.equal(hash, g.rec.get(step), `step ${step}`);
      compared++;
    }
  assert.ok(compared > 8, `${compared} checkpoints`);
});

test('Frames that come before the fight exists are held and handed over on attach', () => {
  const { wire, host, guest } = rooms();
  void host;
  guest.link.send({ t: 'in', sid: 1, f: [[0, 5, 5, 0]] });
  guest.link.send({ t: 'in', sid: 9, f: [[0, 9, 9, 0]] });
  wire.deliver();
  const got = [];
  host.attach({ sid: 1, receive: (m) => got.push(m), handleClose: () => {} });
  assert.equal(got.length, 1, 'only the fight that attached');
  assert.equal(got[0].f[0][1], 5);
});

test('When the partner leaves, the host room reopens and the guest is told it is over', async () => {
  const { wire, host, guest } = rooms();
  const run = M.makeRun(meta, 'mechanic', 0, 9, { coop: 'nina' });
  const pending = host.open(run, meta, 5000);
  wire.cut();
  assert.equal(await pending, null, 'a fight that cannot start resolves to null');
  assert.equal(host.phase, 'waiting');
  assert.equal(host.partner, null);
  assert.equal(guest.phase, 'closed');
  // A new guest can take the room.
  const again = pipe();
  const next = new S.NetSession('guest', 'a', hero('lev'));
  host.adopt(again.a);
  next.adopt(again.b);
  for (let i = 0; i < 3; i++) again.deliver();
  assert.equal(host.phase, 'connected');
  assert.equal(host.partner.hero, 'lev');
  // Closing the room ends it for good.
  host.close();
  assert.equal(host.phase, 'closed');
  assert.equal(host.roomOpen, false);
});

test('A host that is not connected cannot open a fight', async () => {
  const host = new S.NetSession('host', 'a', hero('mechanic'));
  assert.equal(await host.open({}, {}), null);
  const guest = new S.NetSession('guest', 'a', hero('mechanic'));
  assert.equal(await guest.open({}, {}), null, 'only the host opens fights');
});

const MR = require('../.test-build/mirror.js');
function mirrorPair(latency = 1) {
  const wire = pipe(latency);
  const host = new S.NetSession('host', 'a', hero('mechanic'));
  const guest = new S.NetSession('guest', 'a', hero('nina'));
  host.mode = 'host';
  host.adopt(wire.a);
  guest.adopt(wire.b);
  for (let i = 0; i < 4; i++) wire.deliver();
  const heard = { host: [], guest: [] };
  const spy = (list) => ({ play: (kind) => list.push(kind), setLayer() {}, setPaused() {} });
  const huds = [];
  const ends = [];
  const run = M.makeRun(meta, 'mechanic', 0, 9, { coop: 'nina' });
  const feed = new MR.HostFeed(1, host.link);
  // As in Combat: the end of the host's fight is told to the guest.
  const hostBattle = new Battle(null, run, meta, spy(heard.host), () => {}, (r) => feed.finish(hostBattle, r), { feed });
  const client = new MR.MirrorClient(1, guest.link, () => guestBattle.localAim());
  const guestBattle = new Battle(null, JSON.parse(JSON.stringify(run)), meta, spy(heard.guest), (h) => huds.push(h), (r) => ends.push(r), { client });
  host.attach(feed);
  guest.attach(client);
  hostBattle.start = () => { hostBattle.feed.battle = hostBattle; hostBattle.feed.attach(hostBattle); };
  guestBattle.start = () => { client.battle = guestBattle; };
  hostBattle.start();
  guestBattle.start();
  const turn = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      wire.deliver();
      hostBattle.tick(1 / 60);
      guestBattle.tick(1 / 60);
    }
  };
  return { wire, host, guest, hostBattle, guestBattle, feed, client, heard, huds, ends, turn };
}

test('The mirror: the guest sees the host\'s fight, its numbers and its sounds, without simulating', () => {
  const m = mirrorPair();
  m.turn(12);
  const h = m.hostBattle,
    g = m.guestBattle;
  assert.ok(h.run.kills > 0, 'a fight went on');
  assert.equal(g.elapsed > 8, true, 'the guest follows the host\'s clock');
  assert.ok(Math.abs(g.elapsed - h.elapsed) < 0.6);
  assert.ok(Math.abs(g.run.kills - h.run.kills) <= 2);
  assert.ok(Math.abs(g.enemies.length - h.enemies.length) <= 3, `${g.enemies.length} vs ${h.enemies.length}`);
  assert.ok(g.enemies.length > 0);
  for (const e of g.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.walk) && e.max >= e.hp * 0, 'whole enemies');
  assert.ok(Math.hypot(g.x - h.x, g.y - h.y) < 60);
  assert.ok(g.ally && Math.hypot(g.ally.x - h.ally.x, g.ally.y - h.ally.y) < 60);
  assert.equal(g.ally.hero, 'nina');
  assert.ok(m.huds.length > 20 && m.huds.at(-1).hp > 0, 'the HUD comes from the host');
  assert.ok(m.heard.guest.includes('shoot'), 'sounds of the host are played at the guest');
  assert.ok(g.particles.length + g.rings.length + g.numbers.length > 0, 'effects are replayed');
  // The guest never simulates: its own enemy list is only what was streamed.
  assert.equal(g.spawnCount, 0);
  // The host's audio engine is not left wrapped.
  assert.equal(typeof h.audio.play, 'function');
});

test('The guest of a mirror steers the partner and presses its buttons from afar', () => {
  const m = mirrorPair();
  m.turn(1);
  const h = m.hostBattle,
    g = m.guestBattle;
  const x0 = h.ally.x;
  g.stick = { x: 1, y: 0 };
  m.turn(1.5);
  assert.ok(h.ally.x > x0 + 80, `the partner walked ${h.ally.x - x0}`);
  assert.ok(g.ally.x > x0 + 60, 'and the guest sees it');
  g.stick = { x: 0, y: 0 };
  g.localDash();
  m.turn(0.4);
  assert.ok(h.ally.dashCd > 0, 'a press at the guest is a dash at the host');
  g.localPulse();
  m.turn(0.4);
  assert.ok(h.ally.pulseCd > 0);
  // The host's own keys do not drive the partner of a mirror.
  const y0 = h.ally.y;
  h.keys.add('ArrowDown');
  m.turn(0.8);
  assert.ok(Math.abs(h.ally.y - y0) < 40, 'only the guest steers');
  h.keys.clear();
  assert.ok(!h.localDuo && !g.localDuo);
});

test('When the host\'s fight ends the guest is told, with the result', () => {
  const m = mirrorPair();
  m.turn(1);
  m.client.onEnd = (r) => m.ends.push(r);
  m.hostBattle.run.hp = 1;
  m.hostBattle.hurt(500, 0.1, 0.1);
  m.turn(6);
  assert.ok(m.hostBattle.ended);
  assert.ok(m.ends.length >= 1, 'the result reached the guest');
  assert.equal(m.ends[0].won, false);
  assert.ok(m.ends[0].run.kills >= 0);
});

test('A partner that vanishes leaves the host fighting alone and the mirror is dropped', () => {
  const m = mirrorPair();
  m.turn(1);
  m.hostBattle.dropPartner();
  assert.equal(m.hostBattle.ally, null);
  assert.equal(m.hostBattle.feed, null);
  assert.equal(m.hostBattle.run.coop, '');
  m.turn(1);
  assert.ok(m.hostBattle.elapsed > 1.5, 'the fight goes on alone');
});

const VC = require('../.test-build/coop.js');

test('A ballot: the same pick goes there, different picks go to a coin, a silent guest does not hold the host', () => {
  let b = VC.newBallot(3, [0, 2]);
  assert.equal(VC.ballotResult(b, 5), null, 'nobody has picked');
  // Only valid columns count, and only for a person.
  assert.equal(VC.castVote(b, 'host', 1), b);
  assert.equal(VC.castVote(b, 'host', 'x'), b);
  assert.equal(VC.castVote(b, 'host', 0.5), b);
  assert.equal(VC.castVote(b, 'guest', null), b);
  b = VC.castVote(b, 'guest', 2);
  assert.equal(VC.ballotResult(b, 5), null, 'the host\'s own pick is always needed');
  assert.equal(VC.ballotResult(b, 5, true), null);
  const same = VC.castVote(b, 'host', 2);
  assert.deepEqual(VC.ballotResult(same, 5), { col: 2, coin: false });
  // A silent guest: the host goes after a wait, never before.
  const alone = VC.castVote(VC.newBallot(3, [0, 2]), 'host', 0);
  assert.equal(VC.ballotResult(alone, 5), null);
  assert.deepEqual(VC.ballotResult(alone, 5, true), { col: 0, coin: false });
  // A disagreement goes to a coin; the coin is the same each time it is asked,
  // lands on either pick, and picks one of the two.
  const split = VC.castVote(b, 'host', 0);
  const picks = new Set();
  for (let seed = 0; seed < 64; seed++) {
    const r = VC.ballotResult(split, seed);
    assert.equal(r.coin, true);
    assert.ok(r.col === 0 || r.col === 2);
    assert.deepEqual(VC.ballotResult(split, seed), r);
    picks.add(r.col);
  }
  assert.deepEqual([...picks].sort(), [0, 2], 'both picks can win');
  // A settled ballot stays settled and takes no more votes.
  const done = { ...split, done: { col: 2, coin: true } };
  assert.deepEqual(VC.ballotResult(done, 1), { col: 2, coin: true });
  assert.equal(VC.castVote(done, 'host', 0), done);
});

test('A ballot that comes over the wire is checked for shape', () => {
  const good = { step: 2, options: [0, 1], host: 1, guest: null };
  assert.deepEqual(VC.readBallot(good), good);
  assert.deepEqual(VC.readBallot({ ...good, done: { col: 1, coin: true } }).done, { col: 1, coin: true });
  for (const bad of [
    null,
    'x',
    {},
    { ...good, step: -1 },
    { ...good, step: 1.5 },
    { ...good, options: 'ab' },
    { ...good, options: [0, 'a'] },
    { ...good, host: 'a' },
    { ...good, guest: 99999 },
  ])
    assert.equal(VC.readBallot(bad), null, JSON.stringify(bad));
  // A verdict that is not a column is dropped, the rest stands.
  assert.equal(VC.readBallot({ ...good, done: { col: 'x' } }).done, undefined);
  assert.equal(VC.readBallot({ ...good, options: Array.from({ length: 40 }, (_, i) => i % 5) }).options.length, 16);
});

test('The two ends vote on the map: the guest sees the map, picks travel, the verdict reaches both', () => {
  const { wire, host, guest } = rooms();
  const run = JSON.parse(JSON.stringify(M.makeRun(meta, 'mechanic', 0, 9, { coop: 'nina' })));
  let heard = 0;
  host.onVoted = () => heard++;
  host.openVote(run, 4, [0, 1, 2]);
  wire.deliver();
  assert.equal(guest.map.seed, run.seed, 'the guest has the host\'s run to draw the map from');
  assert.deepEqual(guest.ballot, { step: 4, options: [0, 1, 2], host: null, guest: null });
  // The guest picks; the host hears it and both see it.
  guest.voteGuest(1);
  assert.equal(guest.ballot.guest, 1, 'at once on the guest\'s screen');
  wire.deliver();
  assert.equal(host.ballot.guest, 1);
  assert.equal(heard, 1);
  // A column that is not on the step, or a vote for another step, changes nothing.
  guest.voteGuest(9);
  host.link.onMessage({ t: 'vote', step: 5, col: 0 });
  host.link.onMessage({ t: 'vote', step: 4, col: -1 });
  assert.equal(host.ballot.guest, 1);
  assert.equal(heard, 1);
  // The host picks the other one: a coin decides, and both are told.
  host.voteHost(2);
  wire.deliver();
  assert.equal(guest.ballot.host, 2);
  const verdict = VC.ballotResult(host.ballot, run.seed);
  assert.ok(verdict.coin);
  host.settle(verdict);
  wire.deliver();
  assert.deepEqual(guest.ballot.done, verdict);
  // A fight opening clears the vote at both ends.
  host.open(run, meta, 5);
  wire.deliver();
  assert.equal(host.ballot, null);
  assert.equal(guest.ballot, null);
  assert.equal(guest.map, null);
});

test('A guest cannot vote when no vote is open, and a lost link clears the vote', () => {
  const { wire, host, guest } = rooms();
  guest.voteGuest(0);
  wire.deliver();
  assert.equal(host.ballot, null);
  // Messages of the wrong role are ignored.
  host.link.onMessage({ t: 'ballot', step: 1, options: [0], host: null, guest: null });
  host.link.onMessage({ t: 'map', run: { seed: 1 } });
  assert.equal(host.map, null);
  host.openVote({ seed: 3 }, 1, [0, 1]);
  wire.deliver();
  assert.ok(guest.ballot);
  wire.cut();
  assert.equal(host.ballot, null);
  assert.equal(guest.ballot, null);
  assert.equal(guest.map, null);
});

test('The map that reaches the guest is checked before it is drawn', () => {
  const run = JSON.parse(JSON.stringify(M.makeRun(meta, 'mechanic', 0, 9)));
  assert.equal(M.readMapRun(run).seed, run.seed, 'the host\'s own run is fine');
  const bad = (change) => {
    const r = JSON.parse(JSON.stringify(run));
    change(r);
    return M.readMapRun(r);
  };
  assert.equal(M.readMapRun(null), null);
  assert.equal(M.readMapRun('x'), null);
  assert.equal(M.readMapRun({}), null);
  assert.equal(bad((r) => (r.nodes[1][0] = 'dragon')), null, 'an unknown kind of node');
  assert.equal(bad((r) => (r.nodes = [])), null);
  assert.equal(bad((r) => (r.nodes[0] = 'battle')), null);
  assert.equal(bad((r) => (r.nodes[0] = [])), null);
  assert.equal(bad((r) => (r.step = 99)), null);
  assert.equal(bad((r) => (r.step = -1)), null);
  assert.equal(bad((r) => (r.chapter = 7)), null);
  assert.equal(bad((r) => (r.seed = 'a')), null);
  assert.equal(bad((r) => (r.path = ['a'])), null);
  assert.equal(bad((r) => (r.revealed = null)), null);
  assert.equal(bad((r) => (r.bossVariants = {})), null);
  assert.equal(bad((r) => delete r.historyStart), null);
});

test('A relay a person types is checked, and the ICE list always has public STUN servers', () => {
  const ok = N.parseRelay(
    'turn:relay.example.com:80\nturns:relay.example.com:443?transport=tcp, stun:relay.example.com:80',
    ' user ',
    ' secret ',
  );
  assert.deepEqual(ok, {
    urls: [
      'turn:relay.example.com:80',
      'turns:relay.example.com:443?transport=tcp',
      'stun:relay.example.com:80',
    ],
    username: 'user',
    credential: 'secret',
  });
  for (const bad of [
    ['', 'u', 'p'],
    ['stun:only.example.com:3478', 'u', 'p'],
    ['http://relay.example.com', 'u', 'p'],
    ['turn:a:1 javascript:alert(1)', 'u', 'p'],
    ['turn:relay.example.com:80', '', 'p'],
    ['turn:relay.example.com:80', 'u', '   '],
    ['turn:relay.example.com:80', 'u'.repeat(300), 'p'],
    [Array.from({ length: 9 }, (_, i) => `turn:r${i}.example.com:80`).join(' '), 'u', 'p'],
    [null, 'u', 'p'],
    ['turn:relay.example.com:80', 5, 'p'],
  ])
    assert.equal(N.parseRelay(...bad), null, JSON.stringify(bad));
  // Without a relay: only STUN. With one: STUN first, the relay with its login.
  const plain = N.iceServers(null);
  assert.ok(plain.length >= 2);
  assert.ok(plain.every((s) => typeof s.urls === 'string' && s.urls.startsWith('stun:') && !s.username));
  const withRelay = N.iceServers(ok);
  assert.equal(withRelay.length, plain.length + 1);
  assert.deepEqual(withRelay.at(-1), { urls: ok.urls, username: 'user', credential: 'secret' });
  // The dead free relay of PeerJS is not on the list.
  assert.ok(!JSON.stringify(withRelay).includes('peerjs.com'));
});

test('A relayed link makes the host count the fights alone; the guest is told how the connection goes', () => {
  const wire = pipe(0);
  const host = new S.NetSession('host', 'a', hero('mechanic'));
  host.mode = 'sync';
  assert.equal(host.via, 'p2p');
  host.adopt({ ...wire.a, kind: 'relay' });
  assert.equal(host.via, 'relay');
  assert.equal(host.mode, 'host', 'a late link suits the mirror');
  // A direct link leaves the choice alone.
  const direct = new S.NetSession('host', 'a', hero('mechanic'));
  direct.mode = 'sync';
  direct.adopt(pipe(0).a);
  assert.equal(direct.mode, 'sync');
  // While joining, the guest reads how it is going.
  const guest = new S.NetSession('guest', 'a', hero('nina'));
  let changes = 0;
  guest.subscribe(() => changes++);
  guest.note('Пробуємо резервний канал…');
  assert.equal(guest.status, 'Пробуємо резервний канал…');
  assert.equal(changes, 1);
});
