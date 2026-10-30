// Co-op, two pools: the second house has modules of its own, every reward is
// two rows of finds, the shop sells to either house and the money is shared
// and comes twice as fast.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const C = require('../.test-build/coop.js');
const S = require('../.test-build/save.js');
const E = require('../.test-build/equipment.js');
const D = require('../.test-build/data.js');
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
const mateIds = (run) => (run.mateItems ?? []).filter(Boolean);
const afterFight = (run, meta) =>
  M.battleRewards({ ...run, page: 'combat', path: [0], step: 0 }, meta);

test("The second house starts with a kit of its own: the cannon, an engine and its hero's module", () => {
  const run = coopRun('flora');
  assert.deepEqual(mateIds(run), ['cannon', 'engine', 'greenhouse']);
  assert.deepEqual(
    run.items.filter(Boolean),
    ['cannon', 'engine', 'workshop'],
    'the first house keeps its own',
  );
  assert.equal(
    M.makeRun(veteran(), 'mechanic', 0, 5).mateItems,
    undefined,
    'nothing when playing alone',
  );
  const joined = M.withMate(M.makeRun(veteran(), 'mechanic', 0, 5), 'spark');
  assert.equal(joined.coop, 'spark');
  assert.deepEqual(mateIds(joined), ['cannon', 'engine', 'generator']);
  assert.equal(M.withMate(joined, '').mateItems, undefined);
});

test('The two houses are measured by their own modules, the rooms and perks shared', () => {
  const meta = veteran();
  const run = coopRun('flora', meta);
  const first = M.statsFor(run, meta),
    second = M.mateStats(run, meta);
  // A module only the second house has changes only its numbers: the three
  // rooms are full, so it takes the cannon's place (8 damage for 14).
  const fitted = M.giveMate(run, meta, 'generator');
  assert.notEqual(fitted, run);
  assert.equal(
    M.statsFor(fitted, meta).damage,
    first.damage,
    'the first house is untouched',
  );
  assert.equal(M.mateStats(fitted, meta).damage, second.damage + 14 - 8);
  assert.ok(fitted.backpack.some((i) => i.id === 'cannon'), 'the old module is kept for the first house');
});

test('A module given to the second house takes a free slot, or the place of its weakest if it is better', () => {
  const meta = veteran();
  let run = coopRun('flora', meta);
  // Neighbours rescued on the way give the house more rooms, and the second
  // house gets the same slots.
  for (let i = 0; i < 3; i++) run = M.recruit(run, meta).run;
  const rooms = E.equipmentTargets(run).filter((t) =>
    E.canEquipAt(run, t.slot),
  ).length;
  assert.ok(rooms > 3, `the house has grown (${rooms} slots)`);
  let guard = 0;
  while (mateIds(run).length < rooms && guard++ < 30) {
    const next = M.giveMate(run, meta, 'redline');
    assert.notEqual(next, run, 'a free slot takes it');
    run = next;
  }
  assert.equal(mateIds(run).length, rooms, 'every room is full');
  // The very same module as the weakest one: refused (nothing to gain).
  assert.equal(M.giveMate(run, meta, 'cannon'), run);
  const bagBefore = run.backpack.length;
  // A better module takes the place of the weakest one, which goes to the
  // backpack of the first house.
  const better = M.giveMate(run, meta, 'core_rail');
  assert.notEqual(better, run);
  assert.ok(mateIds(better).includes('core_rail'));
  assert.equal(better.backpack.length, bagBefore + 1);
  assert.equal(
    better.items.join(),
    run.items.join(),
    'the first house was not touched',
  );
  // Not in a fight, not alone, not an unknown module.
  assert.equal(M.giveMate({ ...run, page: 'combat' }, meta, 'core_rail').mateItems, run.mateItems);
  const alone = { ...coopRun('flora', meta), coop: '' };
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
  // Alone, one pick ends the reward as before.
  let alone = afterFight(M.makeRun(meta, 'mechanic', 0, 5), meta);
  alone = M.settleReward(alone, 'host', alone.loot[0].id);
  assert.equal(alone.page, 'map');
});

test("The second house's modules and the rows survive a save", () => {
  const meta = veteran();
  let run = afterFight(coopRun('flora', meta), meta);
  run = M.giveMate(run, meta, run.mateLoot[0].id);
  run = { ...run, picked: { mate: run.mateLoot[0].id } };
  const text = S.saveData(meta, run);
  const back = S.readSave(text);
  assert.ok(back.run, 'the save loads');
  assert.deepEqual(back.run.mateItems, run.mateItems);
  assert.deepEqual(
    back.run.mateLoot.map((l) => l.id),
    run.mateLoot.map((l) => l.id),
  );
  assert.deepEqual(back.run.picked, run.picked);
  assert.equal(back.run.coop, 'flora');
  // A damaged list never crashes the load.
  const broken = JSON.parse(text);
  broken.run.mateItems = [7, 'nonsense', null, {}];
  broken.run.mateLoot = ['x', { kind: 'module', id: 'zzz' }];
  broken.run.boughtBy = { 99: 'host', a: 'mate', 1: 'who' };
  const again = S.readSave(JSON.stringify(broken));
  assert.ok(again.run);
  assert.deepEqual(again.run.mateItems.filter(Boolean), []);
  assert.deepEqual(again.run.mateLoot, []);
  assert.deepEqual(again.run.boughtBy, {});
});

test("The second house shoots with its own weapon, and its bullets carry its modules", () => {
  const meta = veteran();
  const run = M.giveMate(
    M.giveMate(coopRun('flora', meta), meta, 'redline'),
    meta,
    'core_rail',
  );
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
  const mk = (coop) => {
    const b = new Battle(null, coopRun(coop, meta), meta, silent, () => {}, () => {}, {
      autoPerks: true,
    });
    return b;
  };
  const duo = mk('flora');
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
const N = require('../.test-build/net.js');
const SS = require('../.test-build/session.js');
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

test('The guest is sent the host run to show, and what it takes is checked by the host', () => {
  assert.equal(N.NET_PROTOCOL, 4);
  const meta = veteran();
  const { host, guest, pump } = wireUp();
  assert.equal(host.phase, 'connected');
  const run = afterFight(coopRun('flora', meta), meta);
  host.sendView(run);
  pump();
  const view = M.readView(guest.view);
  assert.ok(view, 'the guest reads the view');
  assert.deepEqual(view.mateLoot.map((l) => l.id), run.mateLoot.map((l) => l.id));
  assert.deepEqual(view.mateItems, run.mateItems);
  // The guest asks; the host hears it, and only a well-formed ask.
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
  // The host never takes asks from a host-side message, and the guest never sends a view.
  guest.sendView(run);
  host.take('shop', 0, 'redline');
  pump();
  assert.equal(heard.length, 2);
});

test('A view that is not a run of the shape the screens read is not shown', () => {
  const meta = veteran();
  const run = afterFight(coopRun('flora', meta), meta);
  assert.ok(M.readView(JSON.parse(JSON.stringify(run))));
  assert.equal(M.readView(null), null);
  assert.equal(M.readView({ seed: 3 }), null);
  assert.equal(M.readView({ ...run, coop: '' }), null, 'a view is for two houses');
  assert.equal(M.readView({ ...run, residents: 'x' }), null);
  assert.equal(M.readView({ ...run, backpack: undefined }), null);
  assert.equal(M.readView({ ...run, page: 'nonsense' }), null);
  const shaped = M.readView({
    ...run,
    mateItems: [1, 'zzz', 'cannon'],
    mateLoot: [{ kind: 'module', id: 'zzz' }, { kind: 'module', id: 'redline' }, 5],
    picked: 4,
  });
  assert.deepEqual(shaped.mateItems, [null, null, 'cannon']);
  assert.deepEqual(shaped.mateLoot, [{ kind: 'module', id: 'redline' }]);
  assert.deepEqual(shaped.picked, {});
  // What the guest's screen asks of the model works on a view.
  assert.ok(M.mateStats(shaped, veteran()).health > 0);
});
