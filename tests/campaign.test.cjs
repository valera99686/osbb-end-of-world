const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js'),
  R = require('../.test-build/residents.js'),
  C = require('../.test-build/encounters.js'),
  B = require('../.test-build/bosses.js'),
  S = require('../.test-build/cutscenes.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');
test('A discovered locked item remains unlocked after a lost expedition, with purchased shop indices intact', () => {
  const meta = M.initialMeta();
  meta.unlocked.push('crown');
  meta.seen.push('crown');
  let run = M.makeRun(meta, 'mechanic', 0, 77);
  run = roomAt(run, meta, 4, 0);
  run.offers = ['crown', 'engine', 'cannon'];
  run.bought = [0, 2];
  const loaded = M.readSave(M.saveData(meta, run));
  assert.deepEqual(loaded.run.offers, run.offers);
  assert.deepEqual(loaded.run.bought, [0, 2]);
  const end = M.finishRun(loaded.meta, loaded.run, false);
  assert.ok(
    M.readSave(M.saveData(end.meta, null)).meta.unlocked.includes('crown'),
  );
});
function roomAt(run, meta, step, col = 0) {
  for (let row = run.step; row <= step; row++) {
    const c = row === step ? col : M.availableColumns(run)[0];
    run = M.enterNode(run, meta, `${row}:${c}`);
    if (row < step) run = M.nextNode({ ...run, page: 'reward' });
  }
  return run;
}
test('Three seeded trees have 12 stages, all nodes connect to a final boss, and later locations differ', () => {
  const meta = M.initialMeta();
  for (let seed = 0; seed < 50; seed++)
    for (let chapter = 0; chapter < 3; chapter++) {
      const run = M.makeRun(meta, 'mechanic', chapter, seed);
      assert.equal(run.nodes.length, 12);
      assert.ok(run.nodes.flat().length >= 36);
      for (let row = 0; row < 10; row++)
        for (let col = 0; col < run.nodes[row].length; col++)
          assert.ok(M.routeTargets(row, col, run.nodes).length >= 2);
      let reached = [0];
      for (let row = 0; row < 11; row++) {
        let next = new Set();
        for (const col of reached) {
          const targets = M.routeTargets(row, col, run.nodes);
          assert.ok(targets.length);
          targets.forEach((n) => next.add(n));
        }
        reached = [...next];
        assert.equal(reached.length, run.nodes[row + 1].length);
      }
      assert.deepEqual(run.nodes[11], ['boss']);
      assert.deepEqual(M.campaignTree(seed, chapter), run.nodes);
      assert.notDeepEqual(run.nodes, M.campaignTree(seed, (chapter + 1) % 3));
    }
});
test('Captain only, no free furniture or permanent recruitment; expensive floor expansions belong to the expedition', () => {
  let meta = M.initialMeta();
  meta.wins = 5;
  meta.residents = R.RESIDENTS.map((r) => r.id);
  let run = M.makeRun(meta, 'mechanic', 0, 91);
  assert.deepEqual(run.rescued, ['mechanic']);
  assert.equal(run.residents.length, 1);
  assert.equal(run.furniture.length, 0);
  assert.deepEqual(R.houseSize(run.houseLevel), { width: 4, height: 4 });
  assert.equal(
    M.houseResident(run, meta, { id: 'nina', x: 1, y: 0, rotation: 0 }),
    run,
  );
  run = M.battleRewards(roomAt(run, meta, 0), meta);
  assert.equal(run.rescued.length, 2);
  assert.equal(run.residents.length, 2);
  run = { ...run, page: 'map', coins: 159 };
  assert.equal(M.expandRunHouse(run), run);
  run.coins = 860;
  for (const cost of [160, 280, 420]) {
    const before = run;
    run = M.expandRunHouse(run);
    assert.equal(run.coins, before.coins - cost);
    assert.deepEqual(run.residents, before.residents);
  }
  assert.deepEqual(R.houseSize(run.houseLevel), { width: 6, height: 6 });
  assert.equal(M.expandRunHouse(run), run);
  const saved = M.readSave(M.saveData(meta, run));
  assert.equal(saved.run.houseLevel, 3);
  const after = M.makeRun(
    M.finishRun(meta, run, false).meta,
    'mechanic',
    0,
    92,
  );
  assert.equal(after.houseLevel, 0);
  assert.equal(after.rescued.length, 1);
  assert.equal(after.furniture.length, 0);
});
test('Rescued people are retained when rooms cannot fit, and can be housed after expansion', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 133);
  for (let i = 0; i < 8; i++) run = M.recruit(run, meta).run;
  assert.equal(run.rescued.length, 9);
  assert.ok(run.residents.length < 9);
  const pending = run.rescued.find(
    (id) => !run.residents.some((r) => r.id === id),
  );
  const saved = M.readSave(M.saveData(meta, run));
  assert.deepEqual(saved.run.rescued, run.rescued);
  run = { ...saved.run, coins: 1000 };
  for (let i = 0; i < 3; i++) run = M.expandRunHouse(run);
  const pos = R.residentSpace(run.residents, pending, run.houseLevel);
  assert.ok(pos);
  run = M.houseResident(run, meta, pos);
  assert.ok(run.residents.some((r) => r.id === pending));
});
test('Boss transitions carry the same house and inventory, save the story, and only location three completes a run', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 42);
  run.coins = 221;
  run.houseLevel = 1;
  for (let chapter = 0; chapter < 2; chapter++) {
    run = roomAt(run, meta, 11);
    const before = run;
    run = M.advanceLocation(run, meta);
    assert.equal(run.chapter, chapter + 1);
    assert.equal(run.page, 'map');
    assert.equal(run.step, 0);
    assert.equal(run.coins, 221);
    assert.deepEqual(run.items, before.items);
    assert.deepEqual(run.residents, before.residents);
    assert.deepEqual(run.bossVariants, before.bossVariants);
    meta.sceneProgress = { id: `victory-${chapter}`, index: 1 };
    const saved = M.readSave(M.saveData(meta, run));
    assert.deepEqual(saved.run, run);
    assert.deepEqual(saved.meta.sceneProgress, meta.sceneProgress);
    assert.equal(meta.wins, 0);
  }
  run = roomAt(run, meta, 11);
  assert.equal(M.advanceLocation(run, meta), run);
  const end = M.finishRun(meta, run, true);
  assert.equal(end.meta.wins, 1);
  assert.equal(end.cores, 10);
  assert.ok(S.sceneUnlocked('victory-2', end.meta.wins));
});
test('Mystery rooms resolve once across reload and include every room type without skipping the location', () => {
  const meta = M.initialMeta(),
    seen = new Set();
  for (let seed = 0; seed < 200; seed++) {
    let run = M.makeRun(meta, 'mechanic', 0, seed);
    run = roomAt(run, meta, 1, 2);
    run = M.nextNode({ ...run, page: 'reward' });
    run = M.enterNode(run, meta, '2:3');
    seen.add(run.kind);
    assert.equal(run.revealed['2:3'], run.kind);
    const saved = M.readSave(M.saveData(meta, run)).run;
    assert.equal(saved.kind, run.kind);
    assert.deepEqual(saved.loot, run.loot);
    assert.deepEqual(saved.bossVariants, run.bossVariants);
    if (saved.page === 'map')
      assert.equal(M.enterNode(saved, meta, '2:3').kind, run.kind);
    if (run.kind === 'boss') assert.equal(M.advanceLocation(run, meta), run);
  }
  assert.equal(seen.size, 7);
});
test('A chest contains exactly one furniture or module, locked modules survive acquiring and reloading', () => {
  const meta = M.initialMeta();
  let found = new Set();
  for (let seed = 0; seed < 300; seed++) {
    let run = roomAt(M.makeRun(meta, 'mechanic', 0, seed), meta, 2, 0);
    assert.equal(run.kind, 'chest');
    assert.equal(run.loot.length, 1);
    const loot = run.loot[0];
    found.add(loot.kind);
    const before = M.readSave(M.saveData(meta, run)).run;
    assert.deepEqual(before.loot, run.loot);
    if (loot.kind === 'furniture') {
      const next = M.claimFurniture(run, 0);
      assert.equal(next.furniture.length, 1);
      assert.equal(next.step, 3);
      assert.equal(M.claimFurniture(next, 0), next);
    } else {
      let next = M.packItem(run, meta, loot.id);
      assert.notEqual(next, run);
      next = M.nextNode(next);
      const saved = M.readSave(M.saveData(meta, next));
      assert.ok(saved.run.backpack.some((i) => i.id === loot.id));
    }
  }
  assert.equal(found.size, 2);
});
test('Shop furniture is finite, rerolls retain sold items, repairs are once per shop, and events are affordable and single-use', () => {
  const meta = M.initialMeta();
  let run = roomAt(M.makeRun(meta, 'mechanic', 0, 91), meta, 4, 0);
  run.coins = 200;
  run.hp = 40;
  assert.equal(run.page, 'shop');
  assert.equal(run.offers.length, 3);
  assert.equal(run.shopFurniture.length, 2);
  const id = run.shopFurniture[0];
  const cost = M.furniturePrice(run, id);
  run = M.buyFurniture(run, id);
  assert.equal(run.coins, 200 - cost);
  assert.equal(M.buyFurniture(run, id), run);
  const rolled = M.rerollShop(run, meta);
  assert.ok(rolled.bought.includes(10));
  assert.equal(rolled.shopFurniture[0], id);
  run = M.repairShop(rolled, meta);
  assert.ok(run.repairUsed);
  assert.equal(M.repairShop(run, meta), run);
  const map = M.nextNode(run);
  assert.equal(M.buyFurniture(map, 'bench'), map);
  const event = {
    ...map,
    page: 'event',
    kind: 'event',
    coins: 0,
    scrap: 0,
    hp: 1,
    eventDone: false,
  };
  const choices = M.eventFor(event).choices;
  choices.forEach((c, i) => {
    if (!M.canChooseEvent(event, meta, c.effect))
      assert.equal(M.resolveEvent(event, meta, i), event);
  });
  assert.equal(M.nextNode({ ...event, path: [...event.path, 0] }).page, 'map');
});
test('Nine bosses have distinct attacks, warnings and escalating health, and all enemy mechanics produce finite combat state', () => {
  const signatures = new Set();
  for (let location = 0; location < 3; location++)
    for (let variant = 0; variant < 3; variant++) {
      const def = C.campaignBoss(location, variant);
      assert.equal(def.location, location);
      if (location)
        assert.ok(def.health > C.campaignBoss(location - 1, variant).health);
      const patterns = Array.from({ length: 6 }, (_, beat) =>
        C.campaignBossPattern(
          location,
          variant,
          beat % 2,
          beat,
          700,
          450,
          900,
          550,
        ),
      );
      signatures.add(JSON.stringify(patterns));
      for (const p of patterns)
        for (const h of p.hazards) {
          assert.ok(h.age <= -0.7);
          assert.equal(B.hazardContains(h, h.x, h.y), false);
        }
      const meta = M.initialMeta(),
        run = M.makeRun(meta, 'mechanic', location, 177);
      run.bossVariants[location] = variant;
      run.kind = 'boss';
      run.step = 11;
      let result;
      const engine = new Battle(
        null,
        run,
        meta,
        new AudioEngine(),
        () => {},
        (r) => (result = r),
      );
      engine.stats.health = 10000;
      engine.run.hp = 10000;
      engine.stats.regen = 500;
      engine.stats.damage = 300;
      engine.stats.shots = 5;
      engine.stats.range = 900;
      for (let i = 0; i < 9000 && !engine.ended; i++) {
        engine.x = 800 + Math.cos(i * 0.01) * 200;
        engine.y = 500 + Math.sin(i * 0.01) * 150;
        engine.update(0.025);
        if (engine.pulseCd <= 0) engine.pulse();
      }
      assert.ok(engine.ended, def.name);
      assert.equal(result.won, true, def.name);
      assert.ok(Number.isFinite(result.run.hp));
    }
  assert.equal(signatures.size, 9);
  assert.equal(new Set(C.ENEMY_DEFS.map((e) => e.behavior)).size, 9);
  for (const def of C.ENEMY_DEFS) {
    const meta = M.initialMeta(),
      run = M.makeRun(meta, 'mechanic', def.location, 200);
    const e = new Battle(
      null,
      run,
      meta,
      new AudioEngine(),
      () => {},
      () => {},
    );
    e.spawn(def.type);
    e.enemies[0].x = e.x + 80;
    e.enemies[0].y = e.y;
    e.stats.regen = 1000;
    e.stats.health = e.run.hp = 10000;
    for (let i = 0; i < 300; i++) e.update(0.025);
    assert.ok(
      e.enemies.every(
        (enemy) => Number.isFinite(enemy.x) && Number.isFinite(enemy.hp),
      ),
    );
    assert.ok(e.hazards.every((h) => Number.isFinite(h.radius)));
  }
});
