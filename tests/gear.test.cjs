// 0.43.0: 55 more modules and 35 more pieces of furniture, many with a minus
// paid for a bigger plus.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../.test-build/data.js');
const G = require('../.test-build/gear.js');
const T = require('../.test-build/stat-text.js');
const F = require('../.test-build/furniture.js');
const P = require('../.test-build/progression.js');
const E = require('../.test-build/equipment.js');
const R = require('../.test-build/residents.js');
const M = require('../.test-build/model.js');

const meta = () => ({
  ...M.initialMeta(),
  wins: 8,
  unlocked: D.ITEMS.map((i) => i.id),
});
// A run of the mechanic with empty apartment slots, so one change shows alone.
function bareRun() {
  const run = M.makeRun(meta(), 'mechanic', 0, 5);
  run.items = run.items.map(() => null);
  run.furniture = [];
  return run;
}

test('The new modules and furniture are many, with ids of their own', () => {
  assert.equal(G.GEAR.length, 55);
  assert.equal(D.ITEMS.length, 110);
  assert.equal(F.FURNITURE.length, 51);
  const ids = [...D.ITEMS, ...F.FURNITURE].map((x) => x.id);
  // Finds mix modules and furniture by id: the two lists never share one.
  assert.equal(new Set(ids).size, ids.length);
});

test('A new module is described by its numbers, plus first and minus after', () => {
  for (const item of G.GEAR) {
    assert.equal(item.desc, T.describeStats(item.stats), item.id);
    assert.ok(
      Object.values(item.stats).some((v) => v > 0),
      item.id,
    );
    assert.ok(D.UNLOCK_TEXT[item.unlock], item.id);
    // A workshop module has a blueprint, and only those do.
    assert.equal(
      item.unlock === 'blueprint',
      !!P.BLUEPRINT_BY_ID[item.id],
      item.id,
    );
  }
  const traded = G.GEAR.filter((i) =>
    Object.values(i.stats).some((v) => v < 0),
  );
  assert.ok(traded.length >= 30, `${traded.length} with a minus`);
  assert.equal(
    T.describeStats({ rate: 0.4, health: -20 }),
    '+40% темпу стрільби. Мінус: −20 міцності.',
  );
});

test('Stat words agree with the number', () => {
  assert.equal(T.statText('shots', 1), '+1 снаряд у залпі');
  assert.equal(T.statText('shots', 2), '+2 снаряди у залпі');
  assert.equal(T.statText('drones', 5), '+5 бойових дронів');
  assert.equal(T.statText('regen', 0.35), '+0,35 відновлення/с');
  assert.equal(T.statText('luck', 0.25), '+3 відсоткові пункти шансу монет');
  assert.equal(T.statText('luck', 0.4), '+4,8 відсоткового пункта шансу монет');
  assert.equal(T.statText('armor', -2), '−2 броні');
  assert.equal(T.plural(11, 'a', 'b', 'c'), 'c');
  assert.equal(T.plural(21, 'a', 'b', 'c'), 'a');
});

test('Every icon of a module or a piece of furniture is drawn', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app/glyph.tsx'), 'utf8');
  const map = src.slice(
    src.indexOf('const ICONS'),
    src.indexOf('export function Glyph'),
  );
  const known = new Set(
    [...map.matchAll(/^\s+(\w+): \w+,$/gm)].map((m) => m[1]),
  );
  for (const x of [...D.ITEMS, ...F.FURNITURE])
    assert.ok(known.has(x.icon), `${x.id}: ${x.icon}`);
});

test('Every resident has furniture of their own', () => {
  for (const r of R.RESIDENTS) {
    const fans = F.FURNITURE.filter((f) => f.favorites.includes(r.id));
    assert.ok(fans.length >= 4, `${r.id}: ${fans.length}`);
  }
});

test('A minus of furniture counts in the house and a favourite does not double it', () => {
  const m = meta();
  const run = bareRun();
  const before = M.statsFor(run, m);
  // The lathe in the mechanic's flat: his favourite, +12 damage, −4 speed.
  run.furniture = [{ uid: 1, id: 'lathe', resident: 'mechanic', cell: 1 }];
  const lathe = M.statsFor(run, m);
  assert.equal(lathe.damage - before.damage, 12);
  assert.equal(lathe.speed - before.speed, -4);
  // The transformer is Іскра's: in the mechanic's flat +14% rate, −12 health.
  run.furniture = [
    { uid: 1, id: 'transformer', resident: 'mechanic', cell: 1 },
  ];
  const box = M.statsFor(run, m);
  assert.equal(box.health - before.health, -12);
  // Rate bonuses add up on the base rate of fire (1.65).
  assert.ok(Math.abs(box.rate - before.rate - 1.65 * 0.14) < 1e-9);
  assert.match(
    F.furnitureEffect('lathe', 'mechanic').label,
    /^\+12 шкоди, −4 швидкості$/,
  );
  assert.match(F.furnitureText('lathe'), /Петрович: \+12 шкоди$/);
});

test('A house of nothing but minuses still fights', () => {
  const m = meta();
  const run = bareRun();
  const item = D.ITEM_BY_ID.doom_engine;
  const saved = item.stats;
  item.stats = {
    damage: -500,
    rate: -5,
    speed: -500,
    health: -1000,
    armor: -50,
    range: -2000,
    crit: -3,
    luck: -9,
    regen: -9,
  };
  try {
    run.items[E.apartmentSlot('mechanic', 1)] = 'doom_engine';
    const s = M.statsFor(run, m);
    assert.ok(s.damage >= 4 && s.health >= 35 && s.speed >= 85);
    assert.ok(s.rate > 0);
    assert.ok(s.armor >= -4);
    assert.ok(s.range >= 180);
    assert.ok(s.crit >= 0 && s.luck >= -1 && s.regen >= 0);
  } finally {
    item.stats = saved;
  }
});

test('The gallery remembers who was met, keeps it in the save and fills old profiles', () => {
  const G = require('../.test-build/gallery.js');
  const MB = require('../.test-build/minibosses.js');
  assert.equal(G.ENEMY_KEYS.length, 18);
  assert.equal(G.LEADERS.length, 9);
  assert.equal(G.metKey(99, 0, 1, 0), 'boss:scrap-press');
  assert.equal(G.metKey(MB.MINIBOSS_TYPE, 2, 0, 2), 'mini:2-2');
  assert.equal(G.metKey(4, 0, 0, 0), 'enemy:4');
  assert.equal(G.metKey(97, 0, 0, 0), null, 'a helper of a leader is not an entry');
  // Saved and read back: unknown keys drop, known ones stay.
  const meta = { ...M.initialMeta(), runs: 1, met: ['enemy:4', 'boss:queen', 'enemy:999', 7] };
  const back = M.readSave(M.saveData(meta, null)).meta;
  assert.deepEqual(back.met, ['enemy:4', 'boss:queen']);
  // A profile from before the gallery: the enemies of the locations it reached.
  const old = { ...M.initialMeta(), runs: 3, bestDepth: 12 };
  delete old.met;
  const filled = M.readSave(M.saveData(old, null)).meta.met;
  assert.equal(filled.length, 12, 'locations one and two');
  assert.ok(G.withMet(back, ['enemy:4']) === back, 'nothing new, the same profile');
  // Furniture held stays held after a reload, and does not open as a module.
  const held = M.readSave(M.saveData({ ...M.initialMeta(), seen: ['lathe', 'cannon'] }, null)).meta;
  assert.deepEqual(held.seen, ['lathe', 'cannon']);
  assert.ok(!held.unlocked.includes('lathe'));
});
