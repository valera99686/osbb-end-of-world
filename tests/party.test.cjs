// A party of up to four houses: the host's own and up to three partners', each
// with its own neighbours, rooms and modules; a row of every reward for each
// house; the rescued people shared out; the money, the shop and the losses of
// the road made for the size of the party; and saves and views that keep every
// house (and read what older versions kept for the second one).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const C = require('../.test-build/coop.js');
const S = require('../.test-build/save.js');
const D = require('../.test-build/data.js');

const veteran = () => ({
  ...M.initialMeta(),
  wins: 8,
  unlocked: D.ITEMS.map((i) => i.id),
});
const HEROES = ['flora', 'spark', 'mechanic'].map(
  (id) => D.CHARACTERS.find((c) => c.id === id)?.id,
);
const crew = (n) =>
  ['flora', 'spark', 'nina']
    .filter((id) => D.CHARACTERS.some((c) => c.id === id))
    .slice(0, n);
const party = (n, meta = veteran()) => {
  const heroes = crew(n - 1);
  assert.equal(heroes.length, n - 1, 'the heroes of the tests exist');
  return M.withCrew(M.makeRun(meta, 'mechanic', 0, 5), heroes);
};
const afterFight = (run, meta) =>
  M.battleRewards({ ...run, page: 'combat', path: [0], step: 0 }, meta);

test('A party has one to four houses and the run says how many', () => {
  assert.ok(HEROES.every(Boolean));
  const meta = veteran();
  const alone = M.makeRun(meta, 'mechanic', 0, 5);
  assert.equal(M.partySize(alone), 1);
  assert.deepEqual(M.mateSeats(alone), []);
  for (const n of [2, 3, 4]) {
    const run = party(n, meta);
    assert.equal(M.partySize(run), n);
    assert.deepEqual(
      M.mateSeats(run),
      Array.from({ length: n - 1 }, (_, i) => i + 1),
    );
    assert.equal(run.mates.length, n - 1);
    assert.equal(
      run.coop,
      run.mates[0].hero,
      'the raid is marked by the first partner',
    );
    for (const seat of M.mateSeats(run)) {
      assert.equal(M.mateHero(run, seat), run.mates[seat - 1].hero);
      assert.equal(M.mateRun(run, seat).character, run.mates[seat - 1].hero);
      assert.notEqual(
        M.mateRun(run, seat).items.join(),
        '',
        'every house has its kit',
      );
    }
  }
  // More than three partners is not a party.
  assert.equal(
    M.withCrew(alone, ['flora', 'spark', 'nina', 'mechanic', 'flora']).mates
      .length,
    3,
  );
  // No partners: a raid alone again.
  const back = M.withCrew(party(3, meta), []);
  assert.equal(back.coop, '');
  assert.equal(back.mates, undefined);
  assert.equal(M.partySize(back), 1);
});

test('A house of a seat is changed alone: its stats, its modules, its furniture, its perks', () => {
  const meta = veteran();
  const run = party(4, meta);
  const given = M.giveMate(run, meta, 'redline', 3);
  assert.notEqual(given, run);
  const only = (r) =>
    r.mates.map((m) => m.items.filter(Boolean).length + m.backpack.length);
  const before = only(run),
    after = only(given);
  assert.deepEqual(
    after.map((n, i) => n - before[i]),
    [0, 0, 1],
    'only the fourth house took it',
  );
  assert.deepEqual(given.items, run.items, 'the first house is untouched');
  // A seat nobody sits on is refused, and so is a seat of the host.
  assert.equal(M.giveMate(run, meta, 'redline', 4), run);
  assert.equal(M.giveMate(run, meta, 'redline', 0), run);
  const two = party(2, meta);
  assert.equal(
    M.giveMate(two, meta, 'redline', 2),
    two,
    'a house of two has no third seat',
  );
  // Furniture from the shop for the third house.
  const shop = {
    ...run,
    page: 'shop',
    coins: 999,
    shopFurniture: ['firedoor'],
    bought: [],
  };
  const bought = M.buyFurnitureMate(shop, 'firedoor', 2);
  assert.notEqual(bought, shop);
  assert.equal(
    bought.mates[1].furniture.length,
    shop.mates[1].furniture.length + 1,
  );
  assert.equal(
    bought.mates[0].furniture.length,
    shop.mates[0].furniture.length,
  );
  assert.equal(
    bought.mates[2].furniture.length,
    shop.mates[2].furniture.length,
  );
  // The health of each house is its own.
  const mateStats = [1, 2, 3].map(
    (seat) => M.mateStats(run, meta, seat).health,
  );
  assert.ok(mateStats.every((h) => h > 0));
  // withMateHouse writes a seat back and shares the till.
  const house = M.mateRun(run, 2);
  const put = M.withMateHouse(run, { ...house, coins: 7, scrap: 3 }, 2);
  assert.equal(put.coins, 7);
  assert.equal(put.scrap, 3);
  assert.equal(put.mates.length, 3);
});

test('The coins of a raid come once for every house, and costs stay as they are', () => {
  const meta = veteran();
  for (const [n, k] of [
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ]) {
    const run = party(n, meta);
    assert.equal(M.earned(run, 10), 10 * k, `${n} houses`);
    assert.equal(M.earned(run, 0), 0);
    assert.equal(M.earned(run, -5), -5, 'a penalty is a penalty');
    assert.equal(C.party(n).money, k);
  }
});

test('A reward is a row of finds for each house, with none in common, and waits for them all', () => {
  const meta = veteran();
  for (const n of [2, 3, 4]) {
    const run = afterFight(party(n, meta), meta);
    assert.equal(run.mateLoots.length, n - 1, `${n} houses`);
    const ids = [run.loot, ...run.mateLoots].map((row) => row.map((l) => l.id));
    assert.ok(
      ids.every((row) => row.length === 3),
      `a row of three each at ${n}: ${JSON.stringify(ids)}`,
    );
    const all = ids.flat();
    assert.equal(
      new Set(all).size,
      all.length,
      'the finds are shared out, not doubled',
    );
    // The raid goes on only once every house has taken its find.
    let left = M.settleReward(run, 0, run.loot[0].id);
    for (let seat = 1; seat < n; seat++) {
      assert.equal(left.page, 'reward', `still waiting for seat ${seat}`);
      left = M.settleReward(left, seat, run.mateLoots[seat - 1][0].id);
    }
    assert.equal(left.page, 'map');
    assert.equal(left.step, 1);
    assert.deepEqual(left.picked, {}, 'the next stop starts clean');
    assert.deepEqual(left.mateLoots, []);
  }
  // The host's reward is exactly what a raid for two has always rolled.
  const two = afterFight(party(2, meta), meta);
  const three = afterFight(party(3, meta), meta);
  assert.deepEqual(three.loot, two.loot);
  assert.deepEqual(
    three.mateLoots[0],
    two.mateLoots[0],
    'the second house has the same row at any size',
  );
});

test('A row that nobody sits for is left alone, and a rescue saves a neighbour for every house', () => {
  const meta = veteran();
  let run = party(4, meta);
  const seen = new Set(['mechanic', ...crew(3)]);
  for (let i = 0; i < 4; i++) {
    const got = M.recruitAll(run, meta);
    run = got.run;
    if (!got.id) break;
    assert.equal(got.mateIds.length, 3);
    const all = [got.id, ...got.mateIds.filter(Boolean)];
    for (const id of all) {
      assert.ok(!seen.has(id), `${id} is new`);
      seen.add(id);
    }
    assert.equal(got.mateId, got.mateIds[0]);
  }
  const houses = [run, ...run.mates];
  const people = houses.flatMap((h) => h.rescued);
  const pool = people.filter(
    (id) => !crew(3).includes(id) && id !== 'mechanic',
  );
  assert.equal(new Set(pool).size, pool.length, 'nobody is taken twice');
  assert.ok(
    run.mates.every((m) => m.rescued.length > 1),
    'every partner house took people too',
  );
  // Alone nothing changes.
  const alone = M.recruitAll(M.makeRun(meta, 'mechanic', 0, 5), meta);
  assert.deepEqual(alone.mateIds, []);
  assert.equal(alone.mateId, null);
});

test('The shop puts one more thing on the shelf for every player past the second', () => {
  const meta = veteran();
  const shopAt = (run) => {
    const nodes = run.nodes.map((row) => [...row]);
    nodes[0][0] = 'shop';
    return M.enterNode(
      { ...run, nodes, step: 0, page: 'map', path: [] },
      meta,
      '0:0',
    );
  };
  const sizes = [1, 2, 3, 4].map((n) => shopAt(party(n, meta)).offers.length);
  assert.deepEqual(sizes, [3, 3, 4, 5]);
});

test('A loss on the road comes out of any house, and says which one', () => {
  const meta = veteran();
  const run = party(4, meta);
  const rng = (seed) => M.seeded(seed * 7919 + 13);
  const key = (r, seat) =>
    JSON.stringify(M.houseOf(seat ? M.mateRun(r, seat) : r));
  const places = new Set();
  const words = [
    '',
    ' (у другому будинку)',
    ' (у третьому будинку)',
    ' (у четвертому будинку)',
  ];
  for (let seed = 1; seed < 60; seed++) {
    const out = M.loseOne(run, meta, 'module', rng(seed));
    if (!out) continue;
    const changed = [0, 1, 2, 3].filter(
      (seat) => key(out.run, seat) !== key(run, seat),
    );
    assert.equal(
      changed.length,
      1,
      `one house loses (seed ${seed}): ${changed}`,
    );
    const seat = changed[0];
    assert.ok(
      seat === 0
        ? !out.name.endsWith('будинку)')
        : out.name.endsWith(words[seat]),
      `${out.name} for seat ${seat}`,
    );
    places.add(seat);
  }
  assert.deepEqual(
    [...places].sort(),
    [0, 1, 2, 3],
    'the loss falls on every house in turn',
  );
  assert.ok(M.canLose(run, 'module'));
  // A raid alone loses from its own house only.
  const solo = M.makeRun(meta, 'mechanic', 0, 5);
  for (let seed = 1; seed < 20; seed++) {
    const out = M.loseOne(solo, meta, 'module', rng(seed));
    if (out) assert.ok(!out.name.endsWith('будинку)'));
  }
});

test('Every house survives a save, and a save of a raid for two from before is read as seat one', () => {
  const meta = veteran();
  let run = afterFight(party(4, meta), meta);
  run = M.giveMate(run, meta, run.mateLoots[2][0].id, 3);
  run = {
    ...run,
    picked: { 0: run.loot[0].id, 3: run.mateLoots[2][0].id },
    boughtBy: { 0: 0, 1: 2, 2: 3 },
  };
  const text = S.saveData(meta, run);
  const back = S.readSave(text);
  assert.ok(back.run, 'the save loads');
  assert.equal(back.run.mates.length, 3);
  assert.deepEqual(
    back.run.mates.map((m) => m.hero),
    run.mates.map((m) => m.hero),
  );
  assert.equal(back.run.coop, run.coop);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(
      back.run.mates[i].items,
      run.mates[i].items,
      `items of ${i}`,
    );
    assert.deepEqual(back.run.mates[i].rescued, run.mates[i].rescued);
    assert.deepEqual(
      back.run.mates[i].backpack.map((x) => x.id),
      run.mates[i].backpack.map((x) => x.id),
    );
  }
  assert.deepEqual(
    back.run.mateLoots.map((row) => row.map((l) => l.id)),
    run.mateLoots.map((row) => row.map((l) => l.id)),
  );
  assert.deepEqual(back.run.picked, run.picked);
  assert.deepEqual(back.run.boughtBy, run.boughtBy);
  // An older save kept the one partner house in `mate`, its row in `mateLoot`
  // and named the two houses.
  const two = afterFight(party(2, meta), meta);
  const old = JSON.parse(
    S.saveData(meta, {
      ...two,
      picked: { 0: two.loot[0].id, 1: two.mateLoots[0][0].id },
      boughtBy: { 2: 0, 3: 1 },
    }),
  );
  old.run.mate = old.run.mates[0];
  old.run.mateLoot = old.run.mateLoots[0];
  old.run.picked = { host: two.loot[0].id, mate: two.mateLoots[0][0].id };
  old.run.boughtBy = { 2: 'host', 3: 'mate' };
  delete old.run.mates;
  delete old.run.mateLoots;
  const read = S.readSave(JSON.stringify(old));
  assert.ok(read.run, 'the old save loads');
  assert.equal(read.run.mates.length, 1);
  assert.deepEqual(read.run.mates[0].items, two.mates[0].items);
  assert.equal(read.run.mates[0].hero, two.coop);
  assert.deepEqual(
    read.run.mateLoots[0].map((l) => l.id),
    two.mateLoots[0].map((l) => l.id),
  );
  assert.deepEqual(read.run.picked, {
    0: two.loot[0].id,
    1: two.mateLoots[0][0].id,
  });
  assert.deepEqual(read.run.boughtBy, { 2: 0, 3: 1 });
  // A damaged third house never crashes the load: the kit comes back.
  for (const bad of [7, 'x', null, { items: 5 }]) {
    const broken = JSON.parse(text);
    broken.run.mates[2] = bad;
    const again = S.readSave(JSON.stringify(broken));
    assert.ok(again.run, 'loads');
    assert.ok(again.run.mates.length >= 2, 'the houses before it are kept');
    assert.deepEqual(again.run.mates[0].items, run.mates[0].items);
  }
});

test('A view for a guest has every house, and is refused when one cannot be read', () => {
  const meta = veteran();
  const run = afterFight(party(4, meta), meta);
  const view = M.readView(JSON.parse(JSON.stringify(run)));
  assert.ok(view);
  assert.equal(view.mates.length, 3);
  assert.deepEqual(
    view.mates.map((m) => m.hero),
    run.mates.map((m) => m.hero),
  );
  assert.deepEqual(
    view.mateLoots.map((r) => r.map((l) => l.id)),
    run.mateLoots.map((r) => r.map((l) => l.id)),
  );
  assert.equal(view.hero, undefined);
  // A house that is not a house, or a hero nobody knows, is not shown.
  const bad = JSON.parse(JSON.stringify(run));
  bad.mates[1] = 5;
  assert.equal(M.readView(bad), null);
  const nobody = JSON.parse(JSON.stringify(run));
  nobody.mates[2].hero = 'nobody';
  assert.equal(
    M.readView(nobody),
    null,
    'a seat past an unknown hero is not a seat',
  );
  assert.equal(M.readView({ ...run, mates: [] }), null);
  // Rows are shaped to the houses there are.
  const rows = JSON.parse(JSON.stringify(run));
  rows.mateLoots = [
    [{ kind: 'module', id: 'zzz' }, { kind: 'module', id: 'redline' }, 5],
  ];
  const shaped = M.readView(rows);
  assert.deepEqual(shaped.mateLoots, [
    [{ kind: 'module', id: 'redline' }],
    [],
    [],
  ]);
});

test('A partner house of the guest changes only as far as its own rules allow, whichever seat it is', () => {
  const meta = veteran();
  const run = { ...afterFight(party(4, meta), meta), coins: 100, scrap: 4 };
  const house = M.houseOf(M.mateRun(run, 3));
  const ok = M.acceptMateHouse(run, { house, coins: 100, scrap: 4 }, 3);
  assert.ok(ok, 'the third seat is heard');
  assert.deepEqual(
    ok.mates[0].items,
    run.mates[0].items,
    'the others are untouched',
  );
  assert.equal(
    M.acceptMateHouse(run, { house, coins: 100, scrap: 4 }, 4),
    null,
    'nobody sits there',
  );
  assert.equal(
    M.acceptMateHouse(run, { house, coins: 101, scrap: 4 }, 3),
    null,
    'free coins are refused',
  );
  assert.equal(
    M.acceptMateHouse(
      { ...run, page: 'combat' },
      { house, coins: 100, scrap: 4 },
      3,
    ),
    null,
  );
});
