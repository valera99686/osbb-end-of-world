// Co-op, two houses: the second house is a whole house of its own (neighbours,
// rooms, furniture, modules), every reward is two rows of finds, the rescued
// neighbours are shared out between the houses, the shop sells to either, and
// the money is shared and comes twice as fast.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const C = require('../.test-build/coop.js');
const S = require('../.test-build/save.js');
const E = require('../.test-build/equipment.js');
const D = require('../.test-build/data.js');
const N = require('../.test-build/net.js');
const SS = require('../.test-build/session.js');
const { Battle } = require('../.test-build/engine.js');

const silent = {
  play: () => {},
  setLayer: () => {},
  setPaused: () => {},
};
// A profile that has opened every head of ОСББ and every module.
const veteran = () => ({
  ...M.initialMeta(),
  wins: 8,
  unlocked: D.ITEMS.map((i) => i.id),
});
const coopRun = (hero = 'flora', meta = veteran()) =>
  M.makeRun(meta, 'mechanic', 0, 5, { coop: hero });
const mateIds = (run) => (run.mate?.items ?? []).filter(Boolean);
const afterFight = (run, meta) =>
  M.battleRewards({ ...run, page: 'combat', path: [0], step: 0 }, meta);

test("The second house is a house of its own: its hero's room and a kit of cannon, engine and its hero's module", () => {
  const run = coopRun('flora');
  assert.deepEqual(mateIds(run), ['cannon', 'engine', 'greenhouse']);
  assert.deepEqual(
    run.items.filter(Boolean),
    ['cannon', 'engine', 'workshop'],
    'the first house keeps its own',
  );
  assert.deepEqual(run.mate.residents.map((r) => r.id), ['flora']);
  assert.deepEqual(run.mate.rescued, ['flora']);
  assert.deepEqual(run.residents.map((r) => r.id), ['mechanic']);
  assert.equal(
    M.makeRun(veteran(), 'mechanic', 0, 5).mate,
    undefined,
    'nothing when playing alone',
  );
  const joined = M.withMate(M.makeRun(veteran(), 'mechanic', 0, 5), 'spark');
  assert.equal(joined.coop, 'spark');
  assert.deepEqual(mateIds(joined), ['cannon', 'engine', 'generator']);
  assert.equal(M.withMate(joined, '').mate, undefined);
});

test('The two houses are measured by their own neighbours and modules, the perks shared', () => {
  const meta = veteran();
  const run = coopRun('flora', meta);
  const first = M.statsFor(run, meta),
    second = M.mateStats(run, meta);
  assert.notEqual(second.damage, first.damage, 'a different hero and a different kit');
  // A module only the second house has changes only its numbers.
  const house = M.mateRun(run);
  const items = [...house.items];
  items[E.equipmentTargets(house)[0].slot] = 'generator';
  const fitted = M.withMateHouse(run, { ...house, items });
  assert.equal(M.statsFor(fitted, meta).damage, first.damage, 'the first house is untouched');
  assert.equal(M.mateStats(fitted, meta).damage, second.damage + 14 - 8);
  const perked = { ...fitted, perks: ['ricochet'] };
  assert.equal(
    M.mateStats(perked, meta).damage - M.mateStats(fitted, meta).damage,
    M.statsFor(perked, meta).damage - M.statsFor(fitted, meta).damage,
    'a level perk is shared',
  );
});

test('A module given to the second house takes a free slot, or waits in its backpack', () => {
  const meta = veteran();
  let run = coopRun('flora', meta);
  // Three slots, all taken by the kit: the module waits in the backpack.
  const bag = M.giveMate(run, meta, 'redline');
  assert.notEqual(bag, run);
  assert.deepEqual(bag.mate.backpack.map((i) => i.id), ['redline']);
  assert.equal(bag.backpack.length, run.backpack.length, 'the first house backpack is not touched');
  // With neighbours rescued the house has free slots and takes it at once.
  for (let i = 0; i < 3; i++) run = M.recruitBoth(run, meta).run;
  const rooms = E.equipmentTargets(M.mateRun(run)).filter((t) =>
    E.canEquipAt(M.mateRun(run), t.slot),
  ).length;
  assert.ok(rooms > 3, `the second house has grown (${rooms} slots)`);
  const placed = M.giveMate(run, meta, 'redline');
  assert.ok(placed.mate.items.includes('redline'));
  assert.equal(placed.mate.backpack.length, run.mate.backpack.length);
  // A full backpack, a fight, no partner, an unknown module: refused.
  let full = run;
  full = {
    ...full,
    mate: {
      ...full.mate,
      items: full.mate.items.map((id) => id ?? 'cannon'),
      backpack: Array.from({ length: E.STORAGE_LIMIT }, (_, i) => ({
        uid: i + 1,
        id: 'cannon',
        x: 0,
        y: 0,
        rotation: 0,
      })),
    },
  };
  assert.equal(M.giveMate(full, meta, 'redline'), full);
  assert.equal(M.giveMate({ ...run, page: 'combat' }, meta, 'redline').mate, run.mate);
  const alone = { ...run, coop: '' };
  assert.equal(M.giveMate(alone, meta, 'redline'), alone);
  assert.equal(M.giveMate(run, meta, 'nonsense'), run);
});

test('A co-op reward is two rows of modules with none in common, and the coins come twice as many', () => {
  const meta = veteran();
  const soloBase = M.makeRun(meta, 'mechanic', 0, 5),
    duoBase = coopRun('flora', meta);
  const solo = afterFight(soloBase, meta),
    duo = afterFight(duoBase, meta);
  assert.deepEqual(solo.mateLoot, []);
  assert.equal(duo.mateLoot.length, 3);
  assert.ok(duo.mateLoot.every((l) => l.kind === 'module'));
  const mine = duo.loot.filter((l) => l.kind === 'module').map((l) => l.id);
  assert.ok(
    duo.mateLoot.every((l) => !mine.includes(l.id)),
    'the finds are shared out, not doubled',
  );
  assert.equal(
    duo.coins - duoBase.coins,
    C.COOP.money * (solo.coins - soloBase.coins),
  );
  assert.equal(M.earned({ coop: '' }, 10), 10);
  assert.equal(M.earned({ coop: 'flora' }, 10), 10 * C.COOP.money);
  assert.equal(M.earned({ coop: 'flora' }, -30), -30, 'costs are not doubled');
});

test('The rescued neighbours are shared out between the two houses, never taken twice', () => {
  const meta = veteran();
  let run = coopRun('flora', meta);
  const seen = new Set(['mechanic', 'flora']);
  for (let i = 0; i < 6; i++) {
    const before = run.rescued.length + run.mate.rescued.length;
    const got = M.recruitBoth(run, meta);
    run = got.run;
    if (!got.id) break;
    assert.ok(!seen.has(got.id), `${got.id} is new`);
    seen.add(got.id);
    if (got.mateId) {
      assert.ok(!seen.has(got.mateId), `${got.mateId} is new`);
      seen.add(got.mateId);
      assert.notEqual(got.id, got.mateId);
    }
    assert.equal(run.rescued.length + run.mate.rescued.length, before + 1 + (got.mateId ? 1 : 0));
    assert.ok(run.rescued.every((id) => !run.mate.rescued.includes(id) || id === 'flora'), 'the houses have different people');
  }
  assert.ok(run.mate.rescued.length > 1, 'the second house got neighbours too');
  // Alone nothing changes: one neighbour per rescue.
  const alone = M.recruitBoth(M.makeRun(meta, 'mechanic', 0, 5), meta);
  assert.equal(alone.mateId, null);
  assert.ok(alone.id);
  // A rescue after a fight tells both.
  let after = afterFight({ ...coopRun('flora', meta), battleCount: 0 }, meta);
  assert.ok(after.mate.rescued.length >= 1);
  assert.match(after.eventResult, /Урятовано/);
});

test('The raid goes on once both houses have taken their find, and the screen knows who took what', () => {
  const meta = veteran();
  let run = afterFight(coopRun('flora', meta), meta);
  const mine = run.loot[0].id,
    yours = run.mateLoot[0].id;
  run = M.settleReward(run, 'host', mine);
  assert.equal(run.page, 'reward', 'one row is still on the table');
  assert.equal(run.loot.length, 0);
  assert.deepEqual(run.picked, { host: mine });
  run = M.settleReward(run, 'mate', yours);
  assert.equal(run.page, 'map');
  assert.equal(run.step, 1);
  assert.deepEqual(run.mateLoot, []);
  assert.deepEqual(run.picked, {}, 'the next stop starts clean');
  let alone = afterFight(M.makeRun(meta, 'mechanic', 0, 5), meta);
  alone = M.settleReward(alone, 'host', alone.loot[0].id);
  assert.equal(alone.page, 'map');
});

test("The second house, its neighbours and the rows survive a save", () => {
  const meta = veteran();
  let run = afterFight(coopRun('flora', meta), meta);
  run = M.giveMate(run, meta, run.mateLoot[0].id);
  run = { ...run, picked: { mate: run.mateLoot[0].id } };
  const text = S.saveData(meta, run);
  const back = S.readSave(text);
  assert.ok(back.run, 'the save loads');
  assert.deepEqual(back.run.mate.items, run.mate.items);
  assert.deepEqual(back.run.mate.rescued, run.mate.rescued);
  assert.deepEqual(back.run.mate.residents.map((r) => r.id), run.mate.residents.map((r) => r.id));
  assert.deepEqual(back.run.mate.backpack.map((i) => i.id), run.mate.backpack.map((i) => i.id));
  assert.deepEqual(back.run.mateLoot.map((l) => l.id), run.mateLoot.map((l) => l.id));
  assert.deepEqual(back.run.picked, run.picked);
  assert.equal(back.run.coop, 'flora');
  // A damaged house never crashes the load: the kit comes back.
  for (const bad of [7, 'x', null, { items: 5 }, { rescued: [], residents: [], items: [], backpack: 3 }]) {
    const broken = JSON.parse(text);
    broken.run.mate = bad;
    broken.run.mateLoot = ['x', { kind: 'module', id: 'zzz' }];
    broken.run.boughtBy = { 99: 'host', a: 'mate', 1: 'who' };
    const again = S.readSave(JSON.stringify(broken));
    assert.ok(again.run, 'loads');
    assert.deepEqual(again.run.mate.items.filter(Boolean), ['cannon', 'engine', 'greenhouse']);
    assert.deepEqual(again.run.mateLoot, []);
    assert.deepEqual(again.run.boughtBy, {});
  }
});

test("The second house shoots with its own weapon, and its bullets carry its modules", () => {
  const meta = veteran();
  const base = coopRun('flora', meta);
  const house = M.mateRun(base);
  const items = [...house.items];
  items[E.equipmentTargets(house)[0].slot] = 'core_rail';
  const run = M.withMateHouse(base, { ...house, items });
  assert.equal(M.mateStats(run, meta).weapon, 'rail');
  const b = new Battle(null, run, meta, silent, () => {}, () => {}, {
    autoPerks: true,
  });
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.ally.shotTimer = 999;
  assert.equal(b.stats.weapon, 'cannon', 'the first house keeps its cannon');
  assert.equal(b.mateStats.weapon, 'rail');
  assert.equal(b.ally.max, C.allyHealth(b.mateStats.health));
  const e = {
    x: b.ally.x + 120,
    y: b.ally.y,
    hp: 9999,
    max: 9999,
    r: 10,
    type: 0,
    vx: 0,
    vy: 0,
  };
  b.enemies = [e];
  b.bullets = [];
  b.shoot(b.ally.x, b.ally.y, e, false, undefined, 1, true);
  assert.ok(
    b.bullets.length > 0 && b.bullets.every((x) => x.mate),
    "the bullets are marked as the second house's",
  );
  assert.equal(b.bullets[0].kind, 'rail');
  const own = b.bullets.length;
  b.shoot(b.x, b.y, e, false);
  assert.equal(b.bullets[own].kind, undefined, 'the first house fires a plain cannon');
  assert.equal(b.bullets[own].mate, undefined);
});

test('Coins on the floor count in full for two, crystals keep their share, and alone nothing changes', () => {
  const meta = veteran();
  const duo = new Battle(null, coopRun('flora', meta), meta, silent, () => {}, () => {}, {
    autoPerks: true,
  });
  assert.equal(duo.loot(7, 'coin'), 7);
  let xp = 0;
  for (let i = 0; i < 50; i++) xp += duo.loot(4, 'xp');
  assert.equal(xp, 100);
  const solo = new Battle(null, M.makeRun(meta, 'mechanic', 0, 5), meta, silent, () => {}, () => {}, {
    autoPerks: true,
  });
  assert.equal(solo.loot(7, 'coin'), 7);
  assert.equal(solo.loot(3, 'xp'), 3);
});

// ---- The guest's own screen: the view the host sends and what the guest asks ----
function wireUp() {
  const toGuest = [],
    toHost = [];
  const mk = (out, inbox) => {
    const l = {
      kind: 'p2p',
      onMessage: null,
      onClose: null,
      send: (m) => out.push(JSON.parse(JSON.stringify(m))),
      close() {},
    };
    return { l, pump: () => inbox.splice(0).forEach((m) => l.onMessage?.(m)) };
  };
  const h = mk(toGuest, toHost),
    g = mk(toHost, toGuest);
  const host = new SS.NetSession('host', 'x', { hero: 'mechanic', name: 'Г' });
  const guest = new SS.NetSession('guest', 'x', { hero: 'flora', name: 'Ф' });
  host.adopt(h.l);
  guest.adopt(g.l);
  const pump = () => {
    for (let i = 0; i < 4; i++) {
      h.pump();
      g.pump();
    }
  };
  pump();
  return { host, guest, pump };
}

test('The guest is sent the host run to show, and what it asks is checked by the host', () => {
  assert.equal(N.NET_PROTOCOL, 5);
  const meta = veteran();
  const { host, guest, pump } = wireUp();
  assert.equal(host.phase, 'connected');
  const run = afterFight(coopRun('flora', meta), meta);
  host.sendView(run);
  pump();
  const view = M.readView(guest.view);
  assert.ok(view, 'the guest reads the view');
  assert.deepEqual(view.mateLoot.map((l) => l.id), run.mateLoot.map((l) => l.id));
  assert.deepEqual(view.mate.items, run.mate.items);
  assert.deepEqual(view.mate.residents.map((r) => r.id), run.mate.residents.map((r) => r.id));
  assert.ok(view.mate.residents.some((r) => r.id === 'flora'));
  const heard = [];
  host.onTake = (m) => heard.push(m);
  guest.take('reward', 0, run.mateLoot[0].id);
  guest.take('shop', 3, 'redline');
  pump();
  assert.deepEqual(heard, [
    { source: 'reward', index: 0, id: run.mateLoot[0].id },
    { source: 'shop', index: 3, id: 'redline' },
  ]);
  const link = guest.link;
  for (const bad of [
    { t: 'take', source: 'x', index: 0, id: 'a' },
    { t: 'take', source: 'shop', index: -1, id: 'a' },
    { t: 'take', source: 'shop', index: 99, id: 'a' },
    { t: 'take', source: 'shop', index: 1.5, id: 'a' },
    { t: 'take', source: 'shop', index: 1, id: 7 },
  ])
    link.send(bad);
  pump();
  assert.equal(heard.length, 2, 'malformed asks are dropped');
  guest.sendView(run);
  host.take('shop', 0, 'redline');
  pump();
  assert.equal(heard.length, 2);
  // The guest rearranges its house; the host hears it.
  const houses = [];
  host.onHouse = (m) => houses.push(m);
  guest.sendHouse(M.houseOf(M.mateRun(run)), run.coins, run.scrap);
  guest.sendHouse('nonsense', 1, 1);
  guest.sendHouse(M.houseOf(run), 'x', 1);
  host.sendHouse?.({}, 1, 1);
  pump();
  assert.equal(houses.length, 1);
});

test('The host takes the guest rearranging its house only when nothing came from nowhere', () => {
  const meta = veteran();
  let run = afterFight(coopRun('flora', meta), meta);
  run = M.giveMate(run, meta, 'redline');
  run = { ...run, page: 'reward', coins: 100, scrap: 4 };
  const house = M.houseOf(M.mateRun(run));
  const ask = (h, coins = run.coins, scrap = run.scrap) =>
    M.acceptMateHouse(run, { house: h, coins, scrap });
  // Swapping two modules in place is fine, and so is moving one to the backpack.
  const used = house.items.flatMap((id, i) => (id ? [i] : []));
  const swapped = { ...house, items: [...house.items] };
  [swapped.items[used[0]], swapped.items[used[1]]] = [swapped.items[used[1]], swapped.items[used[0]]];
  const ok = ask(swapped);
  assert.ok(ok, 'a swap is taken');
  assert.deepEqual(ok.mate.items, swapped.items);
  assert.deepEqual(ok.items, run.items, 'the first house is untouched');
  const scrapped = { ...house, items: house.items.map((id, i) => (i === used[0] ? null : id)) };
  assert.ok(ask(scrapped, run.coins, run.scrap + 2), 'scrapping a module pays scrap');
  assert.equal(ask(scrapped, run.coins, run.scrap + 50), null, 'but not more than it is worth');
  // A new module, a new neighbour, free coins, two steps of growth: refused.
  assert.equal(ask({ ...house, items: house.items.map((id) => id ?? 'core_rail') }), null);
  assert.equal(ask({ ...house, backpack: [...house.backpack, { uid: 99, id: 'core_rail', x: 0, y: 0, rotation: 0 }] }), null);
  assert.equal(ask({ ...house, rescued: [...house.rescued, 'nina'] }), null);
  assert.equal(ask(house, run.coins + 1), null);
  assert.equal(ask(house, -1), null);
  assert.equal(ask({ ...house, houseLevel: 2 }), null);
  const grown = ask({ ...house, houseLevel: 1 }, run.coins - 200);
  assert.equal(grown, null, 'the coins would go below nothing');
  const paid = ask({ ...house, houseLevel: 1 }, run.coins - 50);
  assert.ok(paid && paid.mate.houseLevel === 1 && paid.coins === 50);
  assert.equal(ask('nonsense'), null);
  assert.equal(M.acceptMateHouse({ ...run, coop: '' }, { house, coins: 1, scrap: 1 }), null);
  assert.equal(M.acceptMateHouse({ ...run, page: 'combat' }, { house, coins: run.coins, scrap: run.scrap }), null);
});

test('A view that is not a run of the shape the screens read is not shown', () => {
  const meta = veteran();
  const run = afterFight(coopRun('flora', meta), meta);
  assert.ok(M.readView(JSON.parse(JSON.stringify(run))));
  assert.equal(M.readView(null), null);
  assert.equal(M.readView({ seed: 3 }), null);
  assert.equal(M.readView({ ...run, coop: '' }), null, 'a view is for two houses');
  assert.equal(M.readView({ ...run, mate: undefined }), null);
  assert.equal(M.readView({ ...run, residents: 'x' }), null);
  assert.equal(M.readView({ ...run, backpack: undefined }), null);
  assert.equal(M.readView({ ...run, page: 'nonsense' }), null);
  const shaped = M.readView({
    ...run,
    mate: { ...run.mate, items: [1, 'zzz', 'cannon'], residents: [{ id: 'nobody' }, 5] },
    mateLoot: [{ kind: 'module', id: 'zzz' }, { kind: 'module', id: 'redline' }, 5],
    picked: 4,
  });
  assert.deepEqual(shaped.mate.items.filter(Boolean), ['cannon']);
  assert.deepEqual(shaped.mate.residents.map((r) => r.id), ['flora'], 'the hero is always at home');
  assert.deepEqual(shaped.mateLoot, [{ kind: 'module', id: 'redline' }]);
  assert.deepEqual(shaped.picked, {});
  assert.ok(M.mateStats(shaped, veteran()).health > 0);
});
