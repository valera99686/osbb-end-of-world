// A room of up to four devices: the host and three guests, each with a seat,
// all talking to the host; the lockstep and the mirror for the whole party; and
// a guest that is gone from a fight is a house nobody plays, while the others
// play on and stay identical.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const N = require('../.test-build/net.js');
const C = require('../.test-build/coop.js');
const S = require('../.test-build/session.js');
const MR = require('../.test-build/mirror.js');
const { Battle, xpNeed } = require('../.test-build/engine.js');

const silent = { play: () => {}, setLayer: () => {}, setPaused: () => {} };
const meta = { ...M.initialMeta(), wins: 8 };
const HEROES = ['flora', 'spark', 'nina'];
const hero = (h, name = 'Гравець ' + h) => ({ hero: h, name });

// One pipe: messages arrive `latency` driver ticks later, in order.
function pipe(latency = 0) {
  let now = 0;
  const lanes = { a: [], b: [] };
  const end = (out, extra = {}) => ({
    open: true,
    onMessage: null,
    onClose: null,
    send(m) {
      if (this.open)
        out.push({ at: now + latency, m: JSON.parse(JSON.stringify(m)) });
    },
    close() {
      this.open = false;
    },
    ...extra,
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
// A host and `n` guests, each on a pipe of their own.
function star(n, opts = {}) {
  const host = new S.NetSession('host', 'a', hero('mechanic', 'Господар'));
  const guests = [];
  const pipes = [];
  for (let i = 0; i < n; i++) {
    const p = pipe(opts.latency ?? 1);
    const g = new S.NetSession(
      'guest',
      'a',
      hero(HEROES[i], 'Гість ' + (i + 1)),
    );
    host.adopt(p.a);
    g.adopt(p.b);
    pipes.push(p);
    guests.push(g);
  }
  const deliver = () => pipes.forEach((p) => p.deliver());
  for (let i = 0; i < 8; i++) deliver();
  return { host, guests, pipes, deliver };
}
const crewRun = (n, chapter = 0) =>
  M.withCrew(M.makeRun(meta, 'mechanic', chapter, 9), HEROES.slice(0, n - 1));

test('Up to three guests take seats one two three, each learns the room, a fourth is turned away', () => {
  const { host, guests, deliver } = star(3);
  assert.equal(host.phase, 'connected');
  assert.deepEqual(
    host.guests.map((g) => g.seat),
    [1, 2, 3],
  );
  assert.deepEqual(
    host.guests.map((g) => g.partner.hero),
    HEROES,
  );
  assert.deepEqual(
    guests.map((g) => g.seat),
    [1, 2, 3],
  );
  assert.ok(
    guests.every((g) => g.phase === 'connected' && g.token.length >= 10),
  );
  assert.equal(new Set(guests.map((g) => g.token)).size, 3, 'a token each');
  for (const g of guests) {
    assert.equal(g.roster.length, 4);
    assert.deepEqual(
      g.roster.map((r) => r.seat),
      [0, 1, 2, 3],
    );
    assert.equal(g.roster[0].hero, 'mechanic');
    assert.ok(g.roster.every((r) => r.here));
    assert.deepEqual(g.partner, { hero: 'mechanic', name: 'Господар' });
  }
  assert.equal(host.partySize, 4);
  // A fourth guest finds the room full.
  const p = pipe(1);
  const late = new S.NetSession('guest', 'a', hero('lev'));
  host.adopt(p.a);
  late.adopt(p.b);
  for (let i = 0; i < 6; i++) {
    deliver();
    p.deliver();
  }
  assert.equal(late.phase, 'refused');
  assert.equal(late.error, 'busy');
  assert.equal(host.guests.length, 3);
  // A guest of another build is refused at the door too.
  const odd = pipe(0);
  const old = new S.NetSession('guest', 'b', hero('lev'));
  const room = new S.NetSession('host', 'a', hero('mechanic'));
  room.adopt(odd.a);
  old.adopt(odd.b);
  for (let i = 0; i < 4; i++) odd.deliver();
  assert.equal(old.phase, 'refused');
  assert.match(old.error, /^version:/);
});

test('Everybody is told when somebody comes or goes, and a guest that leaves before a raid frees its seat', () => {
  const { host, guests, pipes, deliver } = star(3);
  pipes[0].cut();
  for (let i = 0; i < 4; i++) deliver();
  assert.deepEqual(
    host.guests.map((g) => g.seat),
    [2, 3],
    'the seat is free again',
  );
  assert.equal(host.phase, 'connected', 'the room still has guests');
  assert.deepEqual(
    guests[1].roster.map((r) => r.seat),
    [0, 2, 3],
  );
  assert.equal(guests[0].phase, 'closed');
  // The next one to come takes the free seat.
  const p = pipe(1);
  const next = new S.NetSession('guest', 'a', hero('lev', 'Новий'));
  host.adopt(p.a);
  next.adopt(p.b);
  for (let i = 0; i < 6; i++) {
    deliver();
    p.deliver();
  }
  assert.equal(next.seat, 1);
  assert.equal(host.guests.length, 3);
  // Without anyone the room waits.
  for (const q of pipes.slice(1)) q.cut();
  p.cut();
  for (let i = 0; i < 4; i++) deliver();
  assert.equal(host.phase, 'waiting');
  assert.equal(host.partner, null);
});

test('A raid fixes its crew: seats close up, nobody new comes in, one who left keeps its seat and gets it back by its token', () => {
  const { host, guests, pipes, deliver } = star(3);
  pipes[0].cut();
  for (let i = 0; i < 4; i++) deliver();
  const heroes = host.lockCrew();
  assert.deepEqual(heroes, ['spark', 'nina'], 'the crew is whoever was there');
  for (let i = 0; i < 4; i++) deliver();
  assert.deepEqual(
    host.guests.map((g) => g.seat),
    [1, 2],
    'the seats closed up',
  );
  assert.deepEqual(
    guests.slice(1).map((g) => g.seat),
    [1, 2],
    'and each guest is told its new one',
  );
  // Nobody new comes in.
  const p = pipe(1);
  const late = new S.NetSession('guest', 'a', hero('lev'));
  host.adopt(p.a);
  late.adopt(p.b);
  for (let i = 0; i < 6; i++) {
    deliver();
    p.deliver();
  }
  assert.equal(late.phase, 'refused');
  assert.equal(late.error, 'started');
  // A guest of the crew drops out: its seat is kept, the others are told.
  const gone = guests[1];
  const token = gone.token;
  pipes[1].cut();
  for (let i = 0; i < 4; i++) deliver();
  assert.equal(host.guests.length, 2);
  assert.equal(host.guestAt(1).link, null);
  assert.equal(host.here().length, 1);
  assert.equal(guests[2].roster.find((r) => r.seat === 1).here, false);
  // It comes back with its token: the same seat, the same hero, the room as it was.
  const back = pipe(1);
  gone.adopt(back.b);
  host.adopt(back.a);
  let returned = 0;
  host.onReturn = (seat) => (returned = seat);
  for (let i = 0; i < 6; i++) {
    deliver();
    back.deliver();
  }
  assert.equal(returned, 1);
  assert.equal(gone.phase, 'connected');
  assert.equal(gone.seat, 1);
  assert.equal(gone.token, token);
  assert.equal(host.here().length, 2);
  assert.equal(guests[2].roster.find((r) => r.seat === 1).here, true);
  // A wrong token is a stranger.
  const fake = pipe(1);
  const thief = new S.NetSession('guest', 'a', hero('lev'));
  thief.token = 'nope';
  thief.seat = 2;
  host.adopt(fake.a);
  thief.adopt(fake.b);
  for (let i = 0; i < 6; i++) {
    deliver();
    fake.deliver();
  }
  assert.equal(thief.phase, 'refused');
  // The end of the raid frees the seats of those who are gone.
  pipes[2].cut();
  for (let i = 0; i < 4; i++) deliver();
  host.unlockCrew();
  assert.deepEqual(
    host.guests.map((g) => g.seat),
    [1],
  );
});

test('A vote of four goes to the most picked column, a tie to a coin, and who is away does not count', () => {
  const { host, guests, deliver } = star(3);
  const run = JSON.parse(JSON.stringify(crewRun(4)));
  host.openVote(run, 2, [0, 1, 2]);
  for (let i = 0; i < 4; i++) deliver();
  for (const g of guests)
    assert.deepEqual(g.ballot.votes, [null, null, null, null]);
  host.voteHost(1);
  guests[0].voteGuest(2);
  guests[1].voteGuest(2);
  for (let i = 0; i < 4; i++) deliver();
  assert.deepEqual(host.ballot.votes, [1, 2, 2, null]);
  assert.equal(C.ballotResult(host.ballot, 5), null, 'one is still to pick');
  assert.deepEqual(
    C.ballotResult(host.ballot, 5, true),
    { col: 2, coin: false },
    'a silent one is not waited for',
  );
  guests[2].voteGuest(1);
  for (let i = 0; i < 4; i++) deliver();
  const split = C.ballotResult(host.ballot, 5);
  assert.equal(split.coin, true, 'two against two: a coin');
  assert.ok(split.col === 1 || split.col === 2);
  assert.deepEqual(
    C.ballotResult(host.ballot, 5),
    split,
    'the same coin each time',
  );
  host.settle(split);
  for (let i = 0; i < 4; i++) deliver();
  for (const g of guests) assert.deepEqual(g.ballot.done, split);
  // One of them away: the rest decide.
  const again = star(3);
  again.host.openVote(run, 3, [0, 1]);
  for (let i = 0; i < 4; i++) again.deliver();
  again.host.voteHost(0);
  again.guests[0].voteGuest(0);
  again.guests[1].voteGuest(1);
  for (let i = 0; i < 4; i++) again.deliver();
  assert.equal(
    C.ballotResult(again.host.ballot, 5),
    null,
    'the third is still out',
  );
  again.host.lockCrew();
  again.pipes[2].cut();
  for (let i = 0; i < 4; i++) again.deliver();
  assert.deepEqual(again.host.ballot.away, [3]);
  assert.deepEqual(
    C.ballotResult(again.host.ballot, 5),
    { col: 0, coin: false },
    'two against one, the absent not counted',
  );
});

test('A line said by one is shown to all the others with the seat it came from', () => {
  const { host, guests, deliver } = star(3);
  assert.ok(guests[1].say('привіт усім'));
  for (let i = 0; i < 4; i++) deliver();
  assert.equal(host.chat.at(-1).text, 'привіт усім');
  assert.equal(host.chat.at(-1).seat, 2);
  assert.equal(host.chat.at(-1).mine, false);
  for (const i of [0, 2]) {
    assert.equal(guests[i].chat.at(-1).text, 'привіт усім', `guest ${i + 1}`);
    assert.equal(guests[i].chat.at(-1).seat, 2);
  }
  assert.equal(guests[1].chat.at(-1).mine, true, 'its own is not echoed back');
  assert.equal(guests[1].chat.length, 1);
  // The host's line and a quick phrase.
  assert.ok(host.say('з нами'));
  assert.ok(guests[0].sayQuick(1));
  for (let i = 0; i < 4; i++) deliver();
  for (const g of guests)
    assert.ok(g.chat.some((l) => l.text === 'з нами' && l.seat === 0));
  assert.ok(host.chat.some((l) => l.quick === 1 && l.seat === 1));
  assert.ok(guests[2].chat.some((l) => l.quick === 1 && l.seat === 1));
  // A microphone: told to everyone with its seat.
  guests[0].tellMic(true);
  for (let i = 0; i < 4; i++) deliver();
  assert.equal(host.mics[1], true);
  assert.equal(guests[2].mics[1], true);
  assert.equal(guests[2].partnerMic, true);
  assert.equal(guests[0].partnerMic, false, "its own is not the partner's");
});

// A fight in lockstep for the whole room.
function lockFight(room, run, opts = {}) {
  const seats = room.guests.length + 1;
  const delay = opts.delay ?? N.inputDelay(seats);
  const sid = 1;
  const ends = [];
  const make = (seat, session, link) => {
    let aim = { x: 0, y: 0 };
    const sync = new N.Lockstep(seat, sid, link, () => aim, delay, seats);
    const b = new Battle(
      null,
      seat === 0 ? run : JSON.parse(JSON.stringify(run)),
      meta,
      silent,
      () => {},
      () => {},
      {
        sync,
        onPerkDraft: opts.draft ? () => {} : undefined,
      },
    );
    session.attach(sync);
    const rec = new Map();
    const update = b.update.bind(b);
    let n = 0;
    b.update = (dt) => {
      update(dt);
      if (++n % 30 === 0) rec.set(n, b.stateHash());
    };
    return { b, sync, rec, seat, hands: (v) => (aim = v) };
  };
  ends.push(make(0, room.host, room.host.hub));
  room.guests.forEach((g) => ends.push(make(g.seat, g, g.link)));
  return ends;
}
// Runs every end for `seconds`, each at its own frame rate.
function playAll(room, ends, seconds, hook) {
  for (const e of ends) e.sync.begin();
  const rates = ends.map((_, i) => 1 / (60 - i * 9));
  const next = ends.map(() => 0);
  const dt = 1 / 240;
  for (let t = 0; t < seconds; t += dt) {
    room.deliver();
    ends.forEach((e, i) => {
      if (t < next[i]) return;
      next[i] += rates[i];
      e.hands({ x: Math.sin(t * (1.3 + i)), y: Math.cos(t * (0.9 + i * 0.7)) });
      if (
        Math.floor(t * 2 + i) % 5 === 0 &&
        Math.floor(t * 2 + i) !== e.lastPress
      ) {
        e.lastPress = Math.floor(t * 2 + i);
        e.b.localDash();
        if (i % 2) e.b.localPulse();
      }
      e.b.tick(rates[i]);
    });
    hook?.(t);
  }
}
const sameAt = (ends, from = 0) => {
  let compared = 0;
  const [first, ...rest] = ends;
  for (const [step, hash] of first.rec) {
    if (step < from) continue;
    for (const other of rest)
      if (other.rec.has(step)) {
        assert.equal(
          other.rec.get(step),
          hash,
          `seat ${other.seat} differs at step ${step}`,
        );
        compared++;
      }
  }
  return compared;
};

test('Four ends of one fight stay identical in lockstep: steps, presses and a slow link', () => {
  const room = star(3, { latency: 2 });
  const ends = lockFight(room, crewRun(4));
  playAll(room, ends, 18);
  assert.ok(
    ends.every((e) => e.sync.step > 60 * 6),
    ends.map((e) => e.sync.step).join(),
  );
  assert.ok(sameAt(ends) > 12, 'fingerprints compared');
  assert.ok(ends.every((e) => !e.sync.desync && !e.sync.closed));
  assert.ok(ends[0].b.run.kills > 0, 'there was a fight');
  // Every house really moved by its own player's input.
  for (const e of ends) {
    const a = e.seat === 0 ? ends[0].b : ends[0].b.allyOf(e.seat);
    assert.ok(a.x !== 800 || a.y !== 500, `seat ${e.seat} moved`);
  }
  // The hosts and the guests agree on where every house stands.
  for (const e of ends.slice(1))
    for (const a of ends[0].b.allies) {
      const mine = e.b.allyOf(a.seat);
      assert.ok(Math.abs(mine.x - a.x) < 400 && Math.abs(mine.y - a.y) < 400);
    }
});

test('A pair stays what it was: no relays, the two-seat delay', () => {
  assert.equal(N.inputDelay(2), N.INPUT_DELAY);
  assert.equal(N.inputDelay(3), N.INPUT_DELAY_PARTY);
  assert.equal(N.inputDelay(4), N.INPUT_DELAY_PARTY);
  const room = star(1);
  const ends = lockFight(room, crewRun(2));
  playAll(room, ends, 10);
  assert.ok(sameAt(ends) > 5);
});

test('Every house takes its own perk at all four ends, and the fight goes on', () => {
  const room = star(3);
  const run = crewRun(4);
  run.xp = xpNeed(run.level);
  const ends = lockFight(room, run, { draft: true });
  for (const e of ends) e.b.onPerkDraft = () => {};
  let picked = 0;
  playAll(room, ends, 4, () => {
    for (const e of ends) {
      const d = e.seat === 0 ? e.b.drafting : e.b.allyOf(e.seat)?.draft;
      if (d && !e.took) {
        e.took = true;
        picked++;
        e.sync.choose(d[0]);
        if (e.seat === 0) e.b.choosePerk(d[0]);
        else e.b.chooseMatePerk(d[0], e.seat);
      }
    }
  });
  assert.ok(picked >= 4, `${picked} picks`);
  for (const e of ends) {
    assert.ok(!e.b.choosing, `seat ${e.seat} goes on`);
    assert.deepEqual(
      e.b.run.mates.map((m) => (m.perks ?? []).length),
      ends[0].b.run.mates.map((m) => (m.perks ?? []).length),
      `seat ${e.seat} sees the same picks`,
    );
    assert.ok(
      e.b.run.mates.every((m) => (m.perks ?? []).length >= 1),
      'each house has its own',
    );
  }
  assert.ok(sameAt(ends) >= 1);
});

test('A guest whose device is gone becomes a house nobody plays, and the others stay identical', () => {
  const room = star(3);
  const ends = lockFight(room, crewRun(4));
  let cut = false;
  playAll(room, ends, 14, (t) => {
    if (!cut && t > 4) {
      cut = true;
      room.pipes[1].cut();
    }
  });
  const alive = [ends[0], ends[1], ends[3]];
  assert.ok(
    alive.every((e) => e.sync.step > 60 * 6),
    'they went on',
  );
  assert.ok(!alive.some((e) => e.sync.closed || e.sync.desync));
  for (const e of alive)
    assert.equal(
      e.b.allyOf(2).away,
      true,
      `seat ${e.seat} knows seat 2 is away`,
    );
  assert.equal(ends[2].sync.closed, true, 'the one who left is told');
  assert.ok(sameAt(alive, 60 * 6) > 5, 'identical after it');
  // Nobody waited for it.
  assert.ok(alive.every((e) => e.sync.stalled < N.STALL_WARN));
  // It is spared and stands still.
  const gone = ends[0].b.allyOf(2);
  const at = { x: gone.x, y: gone.y };
  assert.equal(ends[0].b.hurtAlly(5, 0.5, 0.1, gone), 0);
  assert.deepEqual({ x: gone.x, y: gone.y }, at);
});

test("The host alone goes on when every guest is gone, and the pair's old rule holds: a lost partner closes it", () => {
  const room = star(2);
  const ends = lockFight(room, crewRun(3));
  let cut = false;
  playAll(room, ends, 10, (t) => {
    if (!cut && t > 3) {
      cut = true;
      room.pipes.forEach((p) => p.cut());
    }
  });
  assert.ok(ends[0].sync.step > 60 * 7, 'the host went on alone');
  assert.ok(!ends[0].sync.closed, 'a fight with away houses is not closed');
  assert.equal(ends[0].b.allyOf(1).away, true);
  assert.equal(ends[0].b.allyOf(2).away, true);
  assert.ok(ends[0].sync.stalled < 1);
  // A pair: the one guest leaves, and the fight is not the host's alone to wait for.
  const pair = star(1);
  const two = lockFight(pair, crewRun(2));
  let end = false;
  playAll(pair, two, 8, (t) => {
    if (!end && t > 2) {
      end = true;
      pair.pipes[0].cut();
    }
  });
  assert.ok(two[0].sync.step > 60 * 4);
  assert.equal(two[0].b.allyOf(1).away, true);
});

test('A guest whose fight drifts is left behind with a word, and the rest go on', () => {
  const room = star(3);
  const ends = lockFight(room, crewRun(4));
  let spoilt = false;
  let told = null;
  ends[0].sync.onDesync = (seat) => (told = seat);
  playAll(room, ends, 14, (t) => {
    if (!spoilt && t > 3) {
      spoilt = true;
      // Seat 3's simulation is thrown off by something nobody else saw.
      ends[3].b.x += 40;
    }
  });
  assert.equal(told, 3);
  assert.equal(ends[3].sync.desync, true, 'it knows');
  assert.ok(ends[0].sync.desynced.has(3));
  assert.ok(
    !ends[0].sync.desync && !ends[1].sync.desync && !ends[2].sync.desync,
  );
  assert.equal(
    ends[0].b.allyOf(3).away,
    true,
    'its house stands still for the others',
  );
  assert.ok(ends[0].sync.step > 60 * 8);
  assert.ok(sameAt([ends[0], ends[1], ends[2]], 60 * 7) > 3);
});

test('A fight is opened for all the guests and starts when every one has built it', async () => {
  const room = star(3);
  const run = JSON.parse(JSON.stringify(crewRun(4)));
  const started = [];
  room.guests.forEach((g, i) => {
    g.onStart = (m) => {
      started.push([i, m.seat, m.sid]);
      g.ready(m.sid);
    };
  });
  const pending = room.host.open(run, meta, 5000);
  let sid;
  let done = false;
  pending.then((s) => {
    sid = s;
    done = true;
  });
  for (let i = 0; i < 6; i++) room.deliver();
  await Promise.resolve();
  assert.deepEqual(
    started.map((s) => s[1]).sort(),
    [1, 2, 3],
    'each is told its seat',
  );
  assert.equal(done, true);
  assert.equal(sid, 1);
  // One guest that does not answer holds the start up; losing it ends the wait.
  const slow = star(2);
  slow.guests[0].onStart = (m) => slow.guests[0].ready(m.sid);
  const waiting = slow.host.open(run, meta, 5000);
  for (let i = 0; i < 6; i++) slow.deliver();
  let slowDone = false;
  waiting.then(() => (slowDone = true));
  await Promise.resolve();
  assert.equal(slowDone, false);
  slow.pipes[1].cut();
  assert.equal(await waiting, null);
});

test('A mirror fight for three guests: each sees all the houses and steers its own', () => {
  const room = star(3);
  room.host.mode = 'host';
  const run = crewRun(4);
  const feed = new MR.FeedGroup(1, room.host.hub, [1, 2, 3]);
  const hostBattle = new Battle(
    null,
    run,
    meta,
    silent,
    () => {},
    (r) => feed.finish(hostBattle, r),
    { feed },
  );
  const guestsEnds = room.guests.map((g) => {
    let aim = { x: 0, y: 0 };
    const client = new MR.MirrorClient(1, g.link, () => aim);
    const b = new Battle(
      null,
      JSON.parse(JSON.stringify(run)),
      meta,
      silent,
      () => {},
      () => {},
      {
        client,
        seat: g.seat,
      },
    );
    g.attach(client);
    client.battle = b;
    return { b, client, hands: (v) => (aim = v), seat: g.seat };
  });
  room.host.attach(feed);
  hostBattle.feed.battle = hostBattle;
  hostBattle.feed.attach(hostBattle);
  hostBattle.spawnTimer = 999;
  for (const a of hostBattle.allies) a.shotTimer = 999;
  const turn = (seconds, hook) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      room.deliver();
      hook?.(t);
      hostBattle.tick(1 / 60);
      for (const e of guestsEnds) e.b.tick(1 / 60);
    }
  };
  turn(1);
  for (const e of guestsEnds) {
    assert.equal(e.b.allies.length, 3, `seat ${e.seat} sees three partners`);
    assert.deepEqual(
      e.b.allies.map((a) => a.seat),
      [1, 2, 3],
    );
    assert.deepEqual(
      e.b.allies.map((a) => a.hero),
      HEROES,
    );
    assert.equal(e.b.seat, e.seat);
  }
  const before = hostBattle.allies.map((a) => ({ x: a.x, y: a.y }));
  // Seat 2's guest walks right; the others stand.
  guestsEnds[1].hands({ x: 1, y: 0 });
  turn(1.5);
  const after = hostBattle.allies.map((a) => ({ x: a.x, y: a.y }));
  assert.ok(
    after[1].x - before[1].x > 100,
    `seat 2 walked ${after[1].x - before[1].x}`,
  );
  assert.ok(Math.abs(after[0].x - before[0].x) < 20, 'seat 1 stood');
  assert.ok(Math.abs(after[2].x - before[2].x) < 20, 'seat 3 stood');
  // Every guest sees it.
  for (const e of guestsEnds)
    assert.ok(e.b.allyOf(2).x - before[1].x > 60, `seen at seat ${e.seat}`);
  // A press by seat 3 goes to its own house only.
  guestsEnds[2].client.press('dash');
  turn(0.3);
  assert.ok(
    hostBattle.allyOf(3).dashCd > 0 || hostBattle.allyOf(3).dashing > 0,
  );
  assert.equal(hostBattle.allyOf(1).dashCd, 0);
  // The end of the fight reaches every guest.
  const ends = [];
  guestsEnds.forEach((e) => (e.client.onEnd = (r) => ends.push(r)));
  feed.finish(hostBattle, { won: true });
  for (let i = 0; i < 6; i++) room.deliver();
  assert.equal(ends.length, 3);
  // One guest gone: its house stands still for the others.
  room.pipes[0].cut();
  for (let i = 0; i < 4; i++) room.deliver();
  assert.equal(hostBattle.allyOf(1).away, true);
});

// A guest that was gone comes back into the fight that is on: it draws the
// host's fight as a mirror, and the host makes its stick into the frames of its
// seat, so the ones who simulate stay identical to each other.
test('A guest who left a lockstep fight comes back into it as a mirror and steers its own house', () => {
  const room = star(2);
  // The raid has begun: the seats are the crew's, a guest who leaves keeps its own.
  room.host.lockCrew();
  const run = crewRun(3);
  // The fight is opened as the app does (the guests are not answering here).
  void room.host.open(JSON.parse(JSON.stringify(run)), meta, 20);
  const seats = 3,
    sid = 1;
  const feed = new MR.FeedGroup(sid, room.host.hub, []);
  const make = (seat, session, link, extra = {}) => {
    let aim = { x: 0, y: 0 };
    const sync = new N.Lockstep(
      seat,
      sid,
      link,
      () => aim,
      N.inputDelay(seats),
      seats,
    );
    const b = new Battle(
      null,
      seat === 0 ? run : JSON.parse(JSON.stringify(run)),
      meta,
      silent,
      () => {},
      () => {},
      {
        sync,
        ...extra,
      },
    );
    const rec = new Map();
    const update = b.update.bind(b);
    let n = 0;
    b.update = (dt) => {
      update(dt);
      if (++n % 30 === 0) rec.set(n, b.stateHash());
    };
    return { b, sync, rec, seat, session, hands: (v) => (aim = v) };
  };
  const host = make(0, room.host, room.host.hub, { feed });
  // As the fight's start does.
  feed.battle = host.b;
  feed.attach(host.b);
  const mux = new MR.FightMux(sid, host.sync, feed);
  room.host.attach(mux);
  const ends = [
    host,
    make(1, room.guests[0], room.guests[0].link),
    make(2, room.guests[1], room.guests[1].link),
  ];
  ends[1].session.attach(ends[1].sync);
  ends[2].session.attach(ends[2].sync);
  const token = room.guests[1].token;
  const back = new S.NetSession('guest', 'a', hero('nina', 'Гість 2'));
  let mirror = null;
  room.host.onReturn = (seat) => {
    host.sync.setSeat(seat, 'proxy');
    feed.add(seat);
    mux.restart(seat);
    assert.ok(room.host.restartFor(seat));
  };
  back.onStart = (m) => {
    let aim = { x: 0, y: 0 };
    const client = new MR.MirrorClient(m.sid, back.link, () => aim);
    const b = new Battle(
      null,
      JSON.parse(JSON.stringify(m.run)),
      m.meta,
      silent,
      () => {},
      () => {},
      { client, seat: m.seat },
    );
    back.attach(client);
    client.battle = b;
    back.ready(m.sid);
    mirror = { b, client, hands: (v) => (aim = v) };
  };
  let cut = false,
    came = false;
  const dt = 1 / 240;
  for (const e of ends) e.sync.begin();
  const next = [0, 0, 0];
  const rates = [1 / 60, 1 / 51, 1 / 42];
  let moved = null;
  for (let t = 0; t < 16; t += dt) {
    room.deliver();
    if (!cut && t > 3) {
      cut = true;
      room.pipes[1].cut();
    }
    if (cut && !came && t > 6) {
      came = true;
      const p = pipe(1);
      room.pipes.push(p);
      back.token = token;
      back.seat = 2;
      room.host.adopt(p.a);
      back.adopt(p.b);
    }
    ends.forEach((e, i) => {
      if (i === 2 && cut) return;
      if (t < next[i]) return;
      next[i] += rates[i];
      e.hands({ x: Math.sin(t * (1.3 + i)), y: Math.cos(t * (0.9 + i)) });
      e.b.tick(rates[i]);
    });
    if (mirror) {
      if (t > 10 && !moved) {
        moved = { x: ends[0].b.allyOf(2).x };
        mirror.hands({ x: 1, y: 0 });
      }
      mirror.b.tick(dt);
    }
  }
  assert.ok(mirror, 'the guest was given the fight again');
  assert.equal(back.phase, 'connected');
  assert.equal(back.seat, 2);
  // Both who simulate agree to the end, the returned seat included.
  assert.ok(
    sameAt([ends[0], ends[1]], 60 * 7) > 5,
    'identical after the return',
  );
  for (const e of [ends[0], ends[1]])
    assert.equal(e.b.allyOf(2).away, false, `seat ${e.seat} sees seat 2 back`);
  assert.equal(ends[0].sync.kinds[2], 'proxy');
  // The mirror shows the host's fight, with all the houses.
  const g = mirror.b;
  assert.equal(g.allies.length, 2);
  assert.ok(
    g.elapsed > 8 && Math.abs(g.elapsed - ends[0].b.elapsed) < 1.5,
    `${g.elapsed} vs ${ends[0].b.elapsed}`,
  );
  // Its stick walks its house, for everybody.
  assert.ok(
    ends[0].b.allyOf(2).x - moved.x > 60,
    `seat 2 walked ${ends[0].b.allyOf(2).x - moved.x}`,
  );
  assert.ok(Math.abs(ends[1].b.allyOf(2).x - ends[0].b.allyOf(2).x) < 60);
});

test('A link that has been silent for long is let go of as if it had closed, and its seat is kept', () => {
  const real = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const room = star(2);
    room.host.lockCrew();
    room.host.heartbeat(now);
    room.guests.forEach((g) => g.heartbeat(now));
    for (let i = 0; i < 4; i++) room.deliver();
    // Guest 1 goes on saying it is there; guest 2 falls silent (its link is
    // alive, its device is not).
    for (let t = 0; t < 4; t++) {
      now += 3000;
      room.host.heartbeat(now);
      room.guests[0].heartbeat(now);
      for (let i = 0; i < 4; i++) room.deliver();
    }
    assert.equal(
      room.host.here().length,
      1,
      'only the silent one is let go of',
    );
    assert.equal(room.host.guestAt(1).link !== null, true);
    assert.equal(room.host.guestAt(2).link, null);
    assert.equal(room.host.guests.length, 2, 'its seat is kept');
    // It can come back with its token.
    const back = pipe(1);
    room.guests[1].adopt(back.b);
    room.host.adopt(back.a);
    for (let i = 0; i < 6; i++) {
      room.deliver();
      back.deliver();
    }
    assert.equal(room.host.here().length, 2);
  } finally {
    Date.now = real;
  }
});
