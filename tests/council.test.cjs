// The council of the house: between the locations three rules are put on the
// table (the same for everybody and after a reload), one is taken (or none) for
// the location that comes, each gives one thing and costs another, it works alone
// as well as in a party, and a party votes on it like on the map.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const Modes = require('../.test-build/modes.js');
const C = require('../.test-build/coop.js');
const S = require('../.test-build/save.js');
const D = require('../.test-build/data.js');
const { Battle } = require('../.test-build/engine.js');

const silent = { play: () => {}, setLayer: () => {}, setPaused: () => {} };
const veteran = () => ({
  ...M.initialMeta(),
  wins: 8,
  unlocked: D.ITEMS.map((i) => i.id),
});
// A raid that has just beaten the boss of its first location.
function afterBoss(opts = {}) {
  const meta = veteran();
  const run = M.makeRun(meta, 'mechanic', 0, opts.seed ?? 21, opts);
  const boss = {
    ...run,
    kind: 'boss',
    step: run.nodes.length - 1,
    page: 'combat',
  };
  return { meta, run: M.advanceLocation(boss, meta) };
}

test('Three pacts are put on the table, by the seed alone, and a reload sees the same', () => {
  const ids = new Set(Modes.PACTS.map((p) => p.id));
  assert.equal(ids.size, Modes.PACTS.length, 'no pact is twice');
  assert.ok(Modes.PACTS.length >= 6);
  for (const p of Modes.PACTS) {
    assert.ok(p.name && p.text && p.gain && p.cost, p.id);
    assert.ok(
      Object.keys(p.effects).length || p.damage || p.health,
      `${p.id} does something`,
    );
  }
  const seen = new Set();
  for (let seed = 1; seed < 80; seed++)
    for (let chapter = 1; chapter < 3; chapter++) {
      const offers = Modes.pactOffers(seed, chapter);
      assert.equal(offers.length, 3);
      assert.equal(new Set(offers).size, 3, 'three different ones');
      assert.ok(offers.every((id) => ids.has(id)));
      assert.deepEqual(
        Modes.pactOffers(seed, chapter),
        offers,
        'the same each time',
      );
      offers.forEach((id) => seen.add(id));
    }
  assert.equal(seen.size, Modes.PACTS.length, 'every pact comes up in time');
  assert.notDeepEqual(
    Modes.pactOffers(5, 1),
    Modes.pactOffers(5, 2),
    'another location, another table',
  );
  assert.notDeepEqual(
    Modes.pactOffers(5, 1, 0),
    Modes.pactOffers(5, 1, 1),
    'another loop, another table',
  );
});

test('After a boss the council meets: one click takes a pact (or none) and the map opens', () => {
  const { run } = afterBoss();
  assert.equal(run.chapter, 1);
  assert.equal(
    run.page,
    'map',
    'the model moves on; the screen calls the council',
  );
  const meeting = M.openCouncil(run);
  assert.equal(meeting.page, 'council');
  assert.equal(meeting.pact, undefined);
  const offers = M.councilOffers(meeting);
  assert.equal(offers.length, 3);
  // A pact that is not on the table is not taken.
  const stranger = Modes.PACTS.map((p) => p.id).find(
    (id) => !offers.includes(id),
  );
  assert.equal(M.choosePact(meeting, stranger), meeting);
  assert.equal(M.choosePact(meeting, '__proto__'), meeting);
  assert.equal(M.choosePact(run, offers[0]), run, 'only while it meets');
  const took = M.choosePact(meeting, offers[1]);
  assert.equal(took.page, 'map');
  assert.equal(took.pact, offers[1]);
  const left = M.choosePact(meeting, '');
  assert.equal(left.page, 'map');
  assert.equal(left.pact, undefined);
  // Not in the middle of a location, and not in the daily run.
  assert.equal(M.openCouncil({ ...run, step: 2 }).page, 'map');
  assert.equal(M.openCouncil({ ...run, mode: 'daily' }).page, 'map');
});

test('The rule lasts one location: the next boss takes it away', () => {
  const { meta, run } = afterBoss();
  const took = M.choosePact(M.openCouncil(run), M.councilOffers(run)[0]);
  assert.ok(took.pact);
  const again = M.advanceLocation(
    { ...took, kind: 'boss', step: took.nodes.length - 1, page: 'combat' },
    meta,
  );
  assert.equal(again.chapter, 2);
  assert.equal(again.pact, undefined, 'a new location, a new council');
  // An endless raid starts its next loop clean too.
  const endless = M.makeRun(meta, 'mechanic', 2, 4, { mode: 'endless' });
  const last = {
    ...endless,
    pact: 'cleanup',
    kind: 'boss',
    step: endless.nodes.length - 1,
    page: 'combat',
  };
  assert.equal(M.advanceLocation(last, meta).pact, undefined);
});

test('Each pact does what it says and nothing else: enemies, prices, coins, crystals, the houses', () => {
  const none = Modes.heatEffects(0);
  const by = (id) => Modes.heatEffects(0, undefined, id);
  assert.deepEqual(by(''), none);
  assert.deepEqual(by('nonsense'), none, 'an unknown one is no pact');
  assert.deepEqual(by('__proto__'), none, 'nor is a name of an object');
  assert.equal(by('cleanup').coinGain, 1.25);
  assert.equal(by('cleanup').enemyHealth, 1.15);
  assert.equal(by('lights').shopCost, 0.8);
  assert.equal(by('lights').repairCost, 0.8);
  assert.equal(by('lights').spawnRate, 1.15);
  assert.equal(by('watch').bossTime, 0.85);
  assert.equal(by('tidy').repairCost, 1.5);
  assert.equal(by('schedule').coreBonus, 1.2);
  assert.equal(by('pot').xpGain, 1.35);
  assert.equal(by('quiet').spawnRate, 0.85);
  assert.equal(by('quiet').coinGain, 0.8);
  // The rule joins the heat and the daily modifier, not replaces them.
  const hot = Modes.heatEffects(5, 'swarm', 'cleanup');
  assert.equal(hot.coinGain, 1.25);
  assert.ok(hot.enemyHealth > Modes.heatEffects(5, 'swarm').enemyHealth);
  // The houses' own numbers.
  const meta = veteran();
  const run = M.makeRun(meta, 'mechanic', 0, 3);
  const base = M.statsFor(run, meta);
  const watch = M.statsFor({ ...run, pact: 'watch' }, meta);
  assert.ok(Math.abs(watch.damage / base.damage - 1.2) < 1e-9);
  assert.equal(watch.health, base.health);
  const tidy = M.statsFor({ ...run, pact: 'tidy' }, meta);
  assert.equal(tidy.health, Math.round(base.health * 1.3));
  const pot = M.statsFor({ ...run, pact: 'pot' }, meta);
  assert.equal(pot.health, Math.round(base.health * 0.85));
  assert.equal(
    M.statsFor({ ...run, pact: '__proto__' }, meta).health,
    base.health,
  );
  // The partners' houses feel it too.
  const party = M.withCrew(run, ['flora', 'spark']);
  const partyTidy = { ...party, pact: 'tidy' };
  assert.equal(
    M.mateStats(partyTidy, meta, 2).health,
    Math.round(M.mateStats(party, meta, 2).health * 1.3),
  );
  // Prices and coins follow.
  const item = D.ITEMS.find((i) => i.price > 20);
  assert.ok(
    M.priceFor(item, { ...run, pact: 'lights' }) < M.priceFor(item, run),
  );
  assert.equal(M.earned({ pact: 'cleanup' }, 10), 13, 'a gain in coins');
  assert.equal(M.earned({ pact: 'quiet' }, 10), 8);
  assert.equal(M.earned({ pact: 'cleanup' }, -10), -10, 'a price is a price');
  assert.equal(M.earned({}, 10), 10);
  assert.equal(
    M.earned({ coop: 'flora', pact: 'cleanup' }, 10),
    Math.round(10 * C.PARTY[1].money * 1.25),
  );
});

test('In a fight the floor pays by the rule: coins and crystals', () => {
  const meta = veteran();
  const fight = (pact, party = 1) => {
    let run = M.makeRun(meta, 'mechanic', 0, 5);
    if (party > 1)
      run = M.withCrew(run, ['flora', 'spark', 'nina'].slice(0, party - 1));
    const b = new Battle(
      null,
      { ...run, pact },
      meta,
      silent,
      () => {},
      () => {},
      {},
    );
    return b;
  };
  const pay = (b, kind) => {
    let sum = 0;
    for (let i = 0; i < 200; i++) sum += b.loot(1, kind);
    return sum;
  };
  assert.equal(
    pay(fight(undefined), 'coin'),
    200,
    'alone and plain it is whole',
  );
  assert.equal(pay(fight('cleanup'), 'coin'), 250);
  assert.equal(pay(fight('quiet'), 'coin'), 160);
  assert.equal(pay(fight('pot'), 'xp'), 270);
  assert.equal(pay(fight('cleanup'), 'xp'), 200, 'only its own thing');
  // In a party the share of the party and the rule multiply.
  assert.ok(
    Math.abs(pay(fight('pot', 3), 'xp') - 200 * C.PARTY[2].xp * 1.35) <= 1,
  );
});

test('The decision is kept in a save, and a save with a name of nothing or another page is clean', () => {
  const { meta, run } = afterBoss();
  const meeting = M.openCouncil(run);
  const back = S.readSave(S.saveData(meta, meeting));
  assert.equal(back.run.page, 'council', 'the meeting is saved as it is');
  const took = M.choosePact(meeting, M.councilOffers(meeting)[2]);
  const again = S.readSave(S.saveData(meta, took));
  assert.equal(again.run.pact, took.pact);
  assert.equal(again.run.page, 'map');
  // A name that is not a pact is dropped.
  for (const bad of ['zzz', '__proto__', 7, null, {}]) {
    const broken = JSON.parse(S.saveData(meta, took));
    broken.run.pact = bad;
    assert.equal(
      S.readSave(JSON.stringify(broken)).run.pact,
      undefined,
      JSON.stringify(bad),
    );
  }
});

test('A party votes on the council like on the map: most picks, a coin on a tie, who is away does not count', () => {
  const four = [null, null, null, null];
  const b = C.newBallot(0, [0, 1, 2, 3], 4);
  assert.deepEqual(b.votes, four);
  let v = C.castVote(b, 0, 1);
  v = C.castVote(v, 1, 2);
  v = C.castVote(v, 2, 2);
  v = C.castVote(v, 3, 3);
  assert.deepEqual(
    C.ballotResult(v, 9),
    { col: 2, coin: false },
    'two for the second rule',
  );
  // Two against two: a coin, the same each time.
  const split = C.castVote(
    C.castVote(C.castVote(C.castVote(b, 0, 0), 1, 0), 2, 3),
    3,
    3,
  );
  const coin = C.ballotResult(split, 9);
  assert.equal(coin.coin, true);
  assert.ok(coin.col === 0 || coin.col === 3);
  assert.deepEqual(C.ballotResult(split, 9), coin);
  // "Leave it" is a column like another.
  const stay = C.castVote(
    C.castVote(C.newBallot(0, [0, 1, 2, 3], 2), 0, 3),
    1,
    3,
  );
  assert.deepEqual(C.ballotResult(stay, 1), { col: 3, coin: false });
  assert.equal(
    M.choosePact(
      M.openCouncil(afterBoss().run),
      M.councilOffers(afterBoss().run)[3] ?? '',
    ).pact,
    undefined,
  );
});

test('A council in a party: it is offered to a raid with partners too, and money and rows are not touched', () => {
  const { meta, run } = afterBoss({ coop: 'flora' });
  assert.equal(M.partySize(run), 2);
  const meeting = M.openCouncil(run);
  assert.equal(meeting.page, 'council');
  assert.ok(meeting.coop && meeting.mates.length === 1);
  const took = M.choosePact(meeting, M.councilOffers(meeting)[0]);
  assert.equal(took.mates.length, 1);
  assert.equal(took.coins, run.coins);
  void meta;
});
