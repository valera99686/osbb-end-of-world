const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const { ITEMS, ITEM_BY_ID } = require('../.test-build/data.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');

test('An abandoned empty run cannot farm permanent currency', () => {
  let meta = M.initialMeta();
  for (let i = 0; i < 20; i++)
    meta = M.finishRun(meta, M.makeRun(meta, 'mechanic', 0, i), false).meta;
  assert.equal(meta.cores, 0);
  assert.equal(meta.wins, 0);
  assert.equal(meta.runs, 20);
});
test('Five different chapter victories unlock the story and the full chapter pool; replay cannot skip a chapter', () => {
  let meta = M.initialMeta();
  for (let chapter = 0; chapter < 5; chapter++) {
    const r = M.makeRun(meta, 'mechanic', chapter, 100 + chapter);
    r.kills = 70;
    meta = M.finishRun(meta, r, true).meta;
    assert.equal(meta.wins, chapter + 1);
    const replay = M.finishRun(
      meta,
      M.makeRun(meta, 'mechanic', 0, 90),
      true,
    ).meta;
    assert.equal(replay.wins, meta.wins);
  }
  assert.ok(meta.unlocked.includes('crown'));
  assert.ok(meta.unlocked.includes('portal'));
  assert.equal(meta.unlocked.length, 34); // dash and scrapping unlocks remain; kill unlocks were earned
});
test('Action unlocks survive a loss, and no item is duplicated', () => {
  const meta = M.initialMeta();
  meta.scrapped = 5;
  const r = M.makeRun(meta, 'mechanic', 0, 1);
  r.kills = 150;
  r.dashes = 10;
  const result = M.finishRun(meta, r, false);
  assert.ok(result.meta.unlocked.includes('ram'));
  assert.ok(result.meta.unlocked.includes('capacitor'));
  assert.ok(result.meta.unlocked.includes('recycler'));
  assert.equal(new Set(result.meta.unlocked).size, result.meta.unlocked.length);
});
test('Research is snapshotted per run, modules change stats, and adjacency is spatial', () => {
  const meta = M.initialMeta();
  meta.wins = 2;
  M.unlock(meta);
  const run = M.makeRun(meta, 'mechanic', 0, 1);
  const damage = M.statsFor(run, meta).damage;
  meta.research.garage = 5;
  assert.equal(M.statsFor(run, meta).damage, damage);
  run.items = [
    'generator',
    'battery',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ];
  const near = M.statsFor(run, meta);
  run.items = [
    'generator',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'battery',
  ];
  const far = M.statsFor(run, meta);
  assert.ok(near.rate > far.rate);
  assert.equal(near.synergies.length, 1);
  const next = M.equip(run, 'armor', 2, meta);
  assert.ok(M.statsFor(next, meta).health > M.statsFor(run, meta).health);
});
test('Malformed saves are recoverable; loaded chapters and room IDs cannot crash the game', () => {
  assert.equal(M.readSave('{broken').error, true);
  assert.equal(M.readSave(null).run, null);
  const meta = M.initialMeta();
  const r = M.makeRun(meta, 'mechanic', 0, 1);
  delete r.chapter;
  r.items[5] = 'unknown';
  const recovered = M.readSave(M.saveData(meta, r));
  assert.equal(recovered.run.chapter, 0);
  assert.equal(recovered.run.items[5], null);
  r.chapter = 0.5;
  assert.equal(M.readSave(M.saveData(meta, r)).run.chapter, 0);
  const round = M.readSave(
    M.saveData(meta, M.makeRun(meta, 'mechanic', 0, 23)),
  );
  assert.deepEqual(round.run, M.makeRun(meta, 'mechanic', 0, 23));
});
test('Shop and reward offers never contain locked items or duplicates; elite drops favor higher rarity', () => {
  const meta = M.initialMeta();
  meta.wins = 5;
  meta.kills = 200;
  meta.dashes = 10;
  meta.scrapped = 5;
  M.unlock(meta);
  assert.equal(meta.unlocked.length, 36);
  let basic = 0,
    elite = 0;
  for (let seed = 0; seed < 2000; seed++) {
    const r = M.makeRun(meta, 'mechanic', 0, seed);
    const offer = M.offers(meta, r, 4, 41);
    assert.equal(new Set(offer).size, 4);
    basic += ITEM_BY_ID[M.offers(meta, r, 1, 73)[0]].rarity;
    elite += ITEM_BY_ID[M.offers(meta, r, 1, 73, true)[0]].rarity;
  }
  assert.ok(elite > basic * 1.12);
  const initial = M.initialMeta(),
    r = M.makeRun(initial, 'mechanic', 0, 1);
  assert.ok(
    M.offers(initial, r, 4, 1).every((id) => initial.unlocked.includes(id)),
  );
});
test('Blocked map nodes cannot be entered and shop economics persist through reload', () => {
  const meta = M.initialMeta(),
    r = M.makeRun(meta, 'mechanic', 0, 1);
  assert.equal(M.enterNode(r, meta, 'boss'), r);
  r.step = 2;
  const shop = M.enterNode(r, meta, 'shop');
  assert.equal(shop.page, 'shop');
  assert.equal(shop.offers.length, 4);
  shop.bought = [0];
  shop.coins = 7;
  shop.rerolls = 2;
  const saved = M.readSave(M.saveData(meta, shop));
  assert.deepEqual(saved.run.bought, [0]);
  assert.equal(saved.run.coins, 7);
  assert.equal(saved.run.rerolls, 2);
});
test('Diagonal, cardinal and analog dashes have the same speed', () => {
  const meta = M.initialMeta();
  const distance = (mode) => {
    const b = new Battle(
      null,
      M.makeRun(meta, 'mechanic', 0, 1),
      meta,
      new AudioEngine(),
      () => {},
      () => {},
    );
    if (mode === 'diagonal') {
      b.keys.add('KeyD');
      b.keys.add('KeyS');
    } else if (mode === 'analog') b.stick = { x: 0.3, y: 0 };
    else b.keys.add('KeyD');
    b.update(0.01);
    const x = b.x,
      y = b.y;
    b.dash();
    b.update(0.1);
    return Math.hypot(b.x - x, b.y - y);
  };
  assert.ok(Math.abs(distance('diagonal') - distance('cardinal')) < 0.01);
  assert.ok(Math.abs(distance('analog') - distance('cardinal')) < 0.01);
});
test('Combat damage, collection, level-up, pause, and terminal event work independently of rendering', () => {
  const meta = M.initialMeta(),
    r = M.makeRun(meta, 'mechanic', 0, 1);
  let calls = 0,
    result;
  const b = new Battle(
    null,
    r,
    meta,
    new AudioEngine(),
    () => {},
    (x) => {
      calls++;
      result = x;
    },
  );
  b.paused = true;
  b.update(1);
  assert.equal(b.elapsed, 0);
  b.paused = false;
  b.drops.push(
    { x: b.x, y: b.y, kind: 'coin', value: 10 },
    { x: b.x, y: b.y, kind: 'xp', value: 50 },
  );
  b.update(0.02);
  assert.equal(b.run.coins, r.coins + 10);
  assert.ok(b.run.level > 1);
  b.stats.health = 10000;
  b.run.hp = 10000;
  b.stats.damage = 500;
  b.stats.regen = 100;
  for (let i = 0; i < 3000 && !b.ended; i++) {
    b.x = 800 + Math.cos(i * 0.008) * 200;
    b.y = 500 + Math.sin(i * 0.008) * 180;
    b.update(0.025);
  }
  assert.ok(b.ended);
  assert.equal(result.won, true);
  assert.equal(calls, 1);
  b.finish(false);
  assert.equal(calls, 1);
  assert.ok(result.run.kills > 0);
});
test('All five boss encounters terminate with a win and never produce NaN state', () => {
  const meta = M.initialMeta();
  meta.wins = 5;
  M.unlock(meta);
  for (let chapter = 0; chapter < 5; chapter++) {
    const r = M.makeRun(meta, 'spark', chapter, 44);
    r.step = 7;
    r.kind = 'boss';
    r.items = [
      'reactor',
      'chain',
      'tesla',
      'vampire',
      'heart',
      'portal',
      'mirror',
      'garden',
      'crown',
    ];
    r.hp = M.statsFor(r, meta).health;
    let result;
    const b = new Battle(
      null,
      r,
      meta,
      new AudioEngine(),
      () => {},
      (x) => (result = x),
    );
    b.stats.regen = 200;
    for (let i = 0; i < 6000 && !b.ended; i++) {
      b.x = 800 + Math.cos(i * 0.007) * 90;
      b.y = 500 + Math.sin(i * 0.007) * 90;
      if (b.pulseCd <= 0) b.pulse();
      b.update(0.025);
    }
    assert.ok(b.ended, `chapter ${chapter}`);
    assert.equal(result.won, true);
    assert.ok(Number.isFinite(result.run.hp));
  }
});
