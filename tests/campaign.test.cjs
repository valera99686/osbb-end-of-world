const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js'),
  R = require('../.test-build/residents.js'),
  C = require('../.test-build/encounters.js'),
  B = require('../.test-build/bosses.js'),
  S = require('../.test-build/cutscenes.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');
const Mini = require('../.test-build/minibosses.js');

function isolatedBattle(chapter = 0) {
  const meta = M.initialMeta();
  const b = new Battle(
    null,
    M.makeRun(meta, 'mechanic', chapter, 701),
    meta,
    new AudioEngine(),
    () => {},
    () => {},
  );
  b.spawnTimer = b.shotTimer = 999;
  b.stats.regen = b.stats.thorns = b.stats.orbit = b.stats.drones = 0;
  b.stats.health = b.run.hp = 10000;
  return b;
}

test('Each location spawns its own six enemies and every summon stays local', () => {
  const ids = new Set();
  for (let chapter = 0; chapter < 3; chapter++) {
    const pool = C.LOCATIONS[chapter].enemyTypes;
    assert.equal(pool.length, 6);
    for (const type of pool) {
      assert.equal(C.ENEMY_DEFS[type].type, type);
      assert.equal(C.ENEMY_DEFS[type].location, chapter);
      assert.ok(!ids.has(type));
      ids.add(type);
    }
    const engine = isolatedBattle(chapter),
      seen = new Set();
    for (let n = 0; n < 150; n++) {
      engine.enemies = [];
      engine.spawn();
      engine.enemies.forEach((e) => {
        assert.ok(pool.includes(e.type));
        seen.add(e.type);
      });
    }
    assert.equal(seen.size, 6);
    for (let variant = 0; variant < 3; variant++)
      for (let beat = 0; beat < 6; beat++) {
        for (const pattern of [
          C.campaignBossPattern(
            chapter,
            variant,
            beat % 2,
            beat,
            500,
            300,
            800,
            600,
          ),
          Mini.minibossPattern(
            chapter,
            beat % 2,
            beat,
            500,
            300,
            800,
            600,
            variant,
          ),
        ])
          assert.ok(pattern.summons.every((type) => pool.includes(type)));
      }
  }
  assert.equal(ids.size, 18);
});

test('Map previews, mystery encounters and reloads retain the same random miniboss variant', () => {
  const meta = M.initialMeta(),
    seen = [new Set(), new Set(), new Set()];
  for (let chapter = 0; chapter < 3; chapter++)
    for (let seed = 0; seed < 100; seed++) {
      for (const kind of ['miniboss', 'mystery']) {
        const start = M.makeRun(meta, 'mechanic', chapter, seed);
        const row = start.nodes.findIndex((r) => r.includes(kind)),
          col = start.nodes[row].indexOf(kind);
        const preview = M.minibossVariant(start, row, col);
        const run = roomAt(start, meta, row, col);
        if (run.kind !== 'miniboss') continue;
        seen[chapter].add(preview);
        assert.equal(M.minibossVariant(run), preview);
        assert.equal(run.minibossVariants[`${chapter}:${row}:${col}`], preview);
        const saved = M.readSave(M.saveData(meta, run)).run;
        assert.equal(M.minibossVariant(saved), preview);
        assert.equal(
          M.minibossVariant(M.enterNode(saved, meta, `${row}:${col}`)),
          preview,
        );
      }
    }
  seen.forEach((variants) => assert.deepEqual([...variants].sort(), [0, 1, 2]));
  let old = M.makeRun(meta, 'mechanic', 1, 48);
  old.routeVersion = 7;
  old.nodes = M.previousMinibossCampaignTree(old.seed, old.chapter);
  old = roomOfKind(old, meta, null, 'miniboss');
  old.page = 'combat';
  delete old.minibossVariants;
  const saved = M.readSave(M.saveData(meta, old)).run;
  assert.equal(saved.routeVersion, 7);
  assert.equal(M.minibossVariant(saved), 0);
  assert.deepEqual(saved.nodes, old.nodes);
});

test('Phase drones and segmenters can damage a stationary house from their chosen attack distance', () => {
  for (const type of [15, 16]) {
    const b = isolatedBattle(2);
    b.spawn(type);
    b.enemies[0].x = b.x + 400;
    b.enemies[0].y = b.y;
    for (let i = 0; i < 1200; i++) b.update(0.025);
    assert.ok(b.run.hp < 10000, C.ENEMY_DEFS[type].name);
  }
});

test('Repair support heals nearby living regular enemies, and thorn death bursts give a warning', () => {
  const b = isolatedBattle();
  for (const type of [11, 0, 1, Mini.MINIBOSS_TYPE]) b.spawn(type);
  const [repair, ally, dead, leader] = b.enemies;
  for (const e of b.enemies) {
    e.x = 700;
    e.y = 500;
    e.hp -= 12;
  }
  dead.hp = 0;
  const captainHp = leader.hp,
    droneHp = repair.hp,
    oldHp = ally.hp;
  b.enemyAttack(repair);
  assert.equal(ally.hp, oldHp + 10);
  assert.equal(leader.hp, captainHp);
  assert.equal(repair.hp, droneHp);
  assert.equal(dead.hp, 0);
  const green = isolatedBattle(1);
  green.spawn(14);
  green.damage(green.enemies[0], 10000);
  const hazard = green.hazards[0];
  assert.ok(hazard.age < -1);
  assert.equal(B.hazardContains(hazard, hazard.x, hazard.y), false);
  hazard.age = 0;
  assert.equal(B.hazardContains(hazard, hazard.x, hazard.y), true);
});

test('Slow fields affect movement only while active, and dash escapes at normal dash speed', () => {
  const distance = (age, dash) => {
    const b = isolatedBattle();
    b.keys.add('KeyD');
    b.invincible = 5;
    b.hazards.push({
      x: b.x,
      y: b.y,
      radius: 200,
      age,
      duration: 3,
      damage: 7,
      color: '#fff',
      slow: 0.55,
    });
    if (dash) b.dash();
    const x = b.x;
    b.update(0.025);
    return b.x - x;
  };
  assert.ok(Math.abs(distance(0, false) / distance(-1, false) - 0.55) < 0.001);
  assert.equal(distance(0, true), distance(-1, true));
});

test('The new location story becomes available once without resetting an ongoing expedition or cutscene', () => {
  const meta = M.initialMeta();
  meta.storyRevision = 4;
  meta.scenesSeen = ['prologue', 'origins', 'arrival-0', 'arrival-1'];
  meta.sceneProgress = { id: 'victory-0', index: 1 };
  const run = roomOfKind(
    M.makeRun(meta, 'mechanic', 1, 44),
    meta,
    null,
    'shop',
  );
  const saved = M.readSave(M.saveData(meta, run));
  assert.deepEqual(saved.run, run);
  assert.deepEqual(saved.meta.scenesSeen, ['prologue']);
  assert.deepEqual(saved.meta.sceneProgress, meta.sceneProgress);
  assert.equal(saved.meta.storyRevision, S.STORY_REVISION);
  assert.deepEqual(M.readSave(M.saveData(saved.meta, saved.run)), saved);
});
test('A discovered locked item remains unlocked after a lost expedition, with purchased shop indices intact', () => {
  const meta = M.initialMeta();
  meta.unlocked.push('crown');
  meta.seen.push('crown');
  let run = M.makeRun(meta, 'mechanic', 0, 77);
  run = roomOfKind(run, meta, null, 'shop');
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
  let paths = [[]];
  for (let row = run.step; row <= step; row++) {
    const endpoints = new Map();
    paths.forEach((path) => {
      const options =
        row === run.step
          ? M.availableColumns(run)
          : M.routeTargets(row - 1, path.at(-1), run.nodes, run);
      options.forEach((c) => {
        if (!endpoints.has(c)) endpoints.set(c, [...path, c]);
      });
    });
    paths = [...endpoints.values()];
  }
  const path = paths.find((p) => p.at(-1) === col);
  assert.ok(path, `No route to ${step}:${col}`);
  const start = run.step;
  for (let row = run.step; row <= step; row++) {
    const c = path[row - start];
    run = M.enterNode(run, meta, `${row}:${c}`);
    if (row < step) run = M.nextNode({ ...run, page: 'reward' });
  }
  return run;
}
function roomOfKind(run, meta, step, kind) {
  if (step === null) step = run.nodes.findIndex((row) => row.includes(kind));
  const col = run.nodes[step].indexOf(kind);
  assert.ok(col >= 0, `Missing ${kind} on row ${step}`);
  return roomAt(run, meta, step, col);
}
test('Ten-step trees vary room counts, widths, room types and discoveries without unreachable branches', () => {
  const meta = M.initialMeta();
  const layouts = new Set();
  const widths = new Set();
  const chestPositions = new Set();
  const roomCounts = new Set();
  const minibossCounts = new Set();
  for (let seed = 0; seed < 50; seed++)
    for (let chapter = 0; chapter < 3; chapter++) {
      const run = M.makeRun(meta, 'mechanic', chapter, seed);
      assert.equal(run.nodes.length, 10);
      assert.equal(run.routeVersion, 8);
      const roomCount = run.nodes.flat().length;
      assert.ok(roomCount >= 38 && roomCount <= 50);
      roomCounts.add(roomCount);
      const profile = run.nodes.slice(1, -1).map((row) => row.length);
      assert.ok(profile.every((width) => width >= 3 && width <= 6));
      for (const rooms of run.nodes.slice(1, -1)) {
        assert.ok(new Set(rooms).size >= 3);
        assert.ok(
          rooms.every(
            (kind) => rooms.filter((room) => room === kind).length <= 2,
          ),
        );
      }
      widths.add(profile.join(','));
      chestPositions.add(
        run.nodes
          .flatMap((row, i) =>
            row.flatMap((kind, col) =>
              kind === 'chest' ? [`${i}:${col}`] : [],
            ),
          )
          .join(','),
      );
      assert.ok(run.nodes.flat().filter((n) => n === 'mystery').length >= 2);
      assert.ok(run.nodes.flat().filter((n) => n === 'chest').length >= 2);
      for (let row = 0; row < 8; row++)
        for (let col = 0; col < run.nodes[row].length; col++)
          assert.ok(M.routeTargets(row, col, run.nodes, run).length >= 1);
      let reached = [0];
      for (let row = 0; row < 9; row++) {
        let next = new Set();
        for (const col of reached) {
          const targets = M.routeTargets(row, col, run.nodes, run);
          assert.ok(targets.length);
          targets.forEach((n) => next.add(n));
        }
        reached = [...next];
        assert.equal(reached.length, run.nodes[row + 1].length);
      }
      assert.deepEqual(run.nodes[9], ['boss']);
      assert.equal(
        run.nodes.flat().filter((kind) => kind === 'boss').length,
        1,
      );
      const miniCount = run.nodes
        .flat()
        .filter((kind) => kind === 'miniboss').length;
      assert.ok(miniCount >= 1 && miniCount <= 4);
      minibossCounts.add(miniCount);
      assert.ok(
        run.nodes.slice(0, 3).every((row) => !row.includes('miniboss')),
      );
      assert.deepEqual(M.campaignTree(seed, chapter), run.nodes);
      layouts.add(JSON.stringify(run.nodes));
    }
  assert.ok(
    layouts.size > 120,
    'Seeds and locations should produce different room layouts',
  );
  assert.ok(
    widths.size > 120,
    'The shape of the tree must vary, not only room labels',
  );
  assert.ok(chestPositions.size > 80, 'Chest positions must not remain fixed');
  assert.deepEqual([...minibossCounts].sort(), [1, 2, 3, 4]);
  assert.ok(roomCounts.size >= 6, 'Total room count should vary between runs');
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
test('Random paths split and merge differently on identical-width trees, without crossings or dead ends', () => {
  const signatures = new Set(),
    degrees = new Set();
  const nodes = [
    ['battle'],
    ...Array.from({ length: 8 }, () => Array(5).fill('battle')),
    ['boss'],
  ];
  for (let seed = 0; seed < 50; seed++) {
    const edges = M.campaignLinks(nodes, seed, 0);
    signatures.add(JSON.stringify(edges));
    assert.deepEqual(
      M.campaignLinks(
        nodes.map((row) => [...row]),
        seed,
        0,
      ),
      edges,
    );
    for (let row = 1; row < 8; row++) {
      assert.deepEqual([...new Set(edges[row].flat())].sort(), [0, 1, 2, 3, 4]);
      for (let col = 0; col < 5; col++) {
        const targets = edges[row][col];
        degrees.add(targets.length);
        assert.ok(targets.length >= 1 && targets.length <= 3);
        if (col < 4)
          assert.ok(
            Math.max(...targets) <= Math.min(...edges[row][col + 1]),
            'Edges must not cross',
          );
      }
    }
    const run = M.makeRun(M.initialMeta(), 'mechanic', 0, seed);
    for (let row = 1; row < 9; row++) {
      let last = 0;
      run.nodes[row].forEach((_, col) => {
        const x = M.routeNodeX(run, row, col);
        assert.ok(x >= 85 && x <= 915);
        if (col)
          assert.ok(
            x - last >= 142,
            'Labels must remain separated on the 820px canvas',
          );
        last = x;
      });
    }
  }
  assert.equal(signatures.size, 50);
  assert.deepEqual([...degrees].sort(), [1, 2, 3]);
});
test('Older checkpoints keep their connections and v7/v8 selected rooms survive reload', () => {
  const meta = M.initialMeta();
  for (const version of [5, 6, 7, 8]) {
    for (const kind of [
      'mystery',
      'chest',
      'shop',
      'rest',
      'boss',
      ...(version >= 7 ? ['miniboss'] : []),
    ]) {
      let run = M.makeRun(meta, 'mechanic', 0, 503);
      if (version === 5) {
        run.routeVersion = 5;
        run.nodes = M.wideCampaignTree(run.seed, run.chapter);
      } else if (version === 6) {
        run.routeVersion = 6;
        run.nodes = M.previousRandomCampaignTree(run.seed, run.chapter);
      } else if (version === 7) {
        run.routeVersion = 7;
        run.nodes = M.previousMinibossCampaignTree(run.seed, run.chapter);
      }
      run = roomOfKind(run, meta, null, kind);
      const loaded = M.readSave(M.saveData(meta, run)).run;
      assert.equal(loaded.routeVersion, version);
      for (const key of [
        'nodes',
        'path',
        'kind',
        'step',
        'loot',
        'revealed',
        'offers',
        'coins',
        'items',
      ])
        assert.deepEqual(loaded[key], run[key], key);
      assert.deepEqual(M.availableColumns(loaded), [run.path[run.step]]);
      assert.deepEqual(M.readSave(M.saveData(meta, loaded)).run, loaded);
    }
  }
});
test('An untouched older map upgrades to ten steps without resetting the house or inventory', () => {
  const meta = M.initialMeta();
  for (const version of [2, 3, 4, 5, 6, 7]) {
    const old = M.makeRun(meta, 'mechanic', 2, 731);
    old.routeVersion = version;
    old.nodes =
      version === 2
        ? M.legacyTree(old.seed)
        : version === 3
          ? M.previousCampaignTree(old.seed, old.chapter)
          : version === 4
            ? M.compactCampaignTree(old.seed, old.chapter)
            : version === 5
              ? M.wideCampaignTree(old.seed, old.chapter)
              : version === 6
                ? M.previousRandomCampaignTree(old.seed, old.chapter)
                : M.previousMinibossCampaignTree(old.seed, old.chapter);
    old.houseLevel = version === 2 ? 4 : 2;
    old.coins = 317;
    old.scrap = 13;
    const loaded = M.readSave(M.saveData(meta, old)).run;
    assert.equal(loaded.nodes.length, 10);
    assert.equal(loaded.routeVersion, 8);
    for (const key of [
      'coins',
      'scrap',
      'hp',
      'houseLevel',
      'items',
      'residents',
      'furniture',
      'rescued',
      'bossVariants',
    ])
      assert.deepEqual(loaded[key], old[key], key);
    assert.deepEqual(M.readSave(M.saveData(meta, loaded)).run, loaded);
  }
});
test('Active twelve-step routes retain late rooms and mystery outcomes, then advance to ten steps', () => {
  const meta = M.initialMeta();
  for (const [step, kind] of [
    [2, 'mystery'],
    [9, 'elite'],
    [10, 'shop'],
    [11, 'boss'],
  ]) {
    let old = M.makeRun(meta, 'mechanic', 0, 18);
    old.routeVersion = 3;
    old.nodes = M.previousCampaignTree(old.seed, 0);
    old = roomOfKind(old, meta, step, kind);
    old.coins = 173;
    const loaded = M.readSave(M.saveData(meta, old)).run;
    assert.equal(loaded.nodes.length, 12);
    for (const key of [
      'step',
      'kind',
      'path',
      'historyStart',
      'revealed',
      'coins',
      'loot',
      'offers',
      'items',
    ])
      assert.deepEqual(loaded[key], old[key], key);
    assert.deepEqual(M.readSave(M.saveData(meta, loaded)).run, loaded);
    if (step === 11) {
      const next = M.advanceLocation(loaded, meta);
      assert.equal(next.nodes.length, 10);
      assert.equal(next.routeVersion, 8);
      assert.equal(next.coins, old.coins);
    }
  }
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
test('Active compact routes retain encounters, rewards and choices after the wider-tree update', () => {
  const meta = M.initialMeta();
  for (const [step, kind] of [
    [1, 'mystery'],
    [2, 'chest'],
    [4, 'shop'],
    [9, 'boss'],
  ]) {
    let old = M.makeRun(meta, 'mechanic', 0, 18);
    old.routeVersion = 4;
    old.nodes = M.compactCampaignTree(old.seed, 0);
    old = roomOfKind(old, meta, step, kind);
    const loaded = M.readSave(M.saveData(meta, old)).run;
    assert.equal(loaded.routeVersion, 4);
    for (const key of [
      'nodes',
      'kind',
      'path',
      'step',
      'revealed',
      'loot',
      'offers',
      'items',
      'residents',
      'coins',
    ])
      assert.deepEqual(loaded[key], old[key], key);
    assert.deepEqual(M.readSave(M.saveData(meta, loaded)).run, loaded);
    if (step === 9)
      assert.equal(M.advanceLocation(loaded, meta).routeVersion, 8);
  }
});
test('Boss transitions carry the same house and inventory, save the story, and only location three completes a run', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 42);
  run.coins = 221;
  run.houseLevel = 1;
  for (let chapter = 0; chapter < 2; chapter++) {
    run = roomAt(run, meta, 9);
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
  run = roomAt(run, meta, 9);
  assert.equal(M.advanceLocation(run, meta), run);
  const end = M.finishRun(meta, run, true);
  assert.equal(end.meta.wins, 1);
  assert.equal(end.cores, 10);
  assert.ok(S.sceneUnlocked('victory-2', end.meta.wins));
});
test('Mystery rooms resolve once, include minibosses and never include a location boss', () => {
  const meta = M.initialMeta(),
    seen = new Set();
  for (let seed = 0; seed < 200; seed++) {
    let run = M.makeRun(meta, 'mechanic', 0, seed);
    run = roomOfKind(run, meta, null, 'mystery');
    const nodeId = `${run.step}:${run.path[run.step]}`;
    seen.add(run.kind);
    assert.equal(run.revealed[nodeId], run.kind);
    const saved = M.readSave(M.saveData(meta, run)).run;
    assert.equal(saved.kind, run.kind);
    assert.deepEqual(saved.loot, run.loot);
    assert.deepEqual(saved.bossVariants, run.bossVariants);
    if (saved.page === 'map')
      assert.equal(M.enterNode(saved, meta, nodeId).kind, run.kind);
    assert.notEqual(run.kind, 'boss');
    if (run.kind === 'miniboss')
      assert.equal(M.advanceLocation(run, meta), run);
  }
  assert.deepEqual([...seen].sort(), [
    'battle',
    'chest',
    'elite',
    'event',
    'miniboss',
    'rest',
    'shop',
  ]);
});

test('Previously revealed mystery bosses become minibosses without rerolling rewards or the route', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 1, 503);
  run.routeVersion = 6;
  run.nodes = M.previousRandomCampaignTree(run.seed, run.chapter);
  run = roomOfKind(run, meta, null, 'mystery');
  const nodeId = `${run.step}:${run.path[run.step]}`;
  run.revealed[nodeId] = 'boss';
  run.kind = 'boss';
  run.page = 'combat';
  const loaded = M.readSave(M.saveData(meta, run)).run;
  assert.deepEqual(loaded.nodes, run.nodes);
  assert.deepEqual(loaded.path, run.path);
  assert.equal(loaded.kind, 'miniboss');
  assert.equal(loaded.revealed[nodeId], 'miniboss');
  assert.equal(M.enterNode(loaded, meta, nodeId).kind, 'miniboss');
  assert.equal(
    M.enterNode({ ...run, page: 'map' }, meta, nodeId).kind,
    'miniboss',
  );
  assert.equal(M.advanceLocation(loaded, meta), loaded);
  assert.deepEqual(M.readSave(M.saveData(meta, loaded)).run, loaded);
});

test('Miniboss fights have distinct telegraphed attacks, require a kill and award normal route progress', () => {
  const names = new Set();
  for (let chapter = 0; chapter < 3; chapter++)
    for (let variant = 0; variant < 3; variant++) {
      const meta = M.initialMeta();
      let run = roomOfKind(
        M.makeRun(meta, 'mechanic', chapter, 771),
        meta,
        null,
        'miniboss',
      );
      run.minibossVariants[`${chapter}:${run.step}:${run.path[run.step]}`] =
        variant;
      const def = Mini.minibossFor(chapter, variant);
      names.add(def.name);
      assert.ok(def.health < C.campaignBoss(chapter, 0).health / 2);
      if (chapter)
        assert.ok(def.health > Mini.minibossFor(chapter - 1, variant).health);
      const attacks = new Set();
      for (let phase = 0; phase < 2; phase++)
        for (let beat = 0; beat < 2; beat++) {
          const p = Mini.minibossPattern(
            chapter,
            phase,
            beat,
            500,
            350,
            850,
            600,
            variant,
          );
          attacks.add(p.name);
          assert.ok(p.shots.length || p.hazards.length || p.summons.length);
          assert.ok(
            p.summons.every((type) =>
              C.LOCATIONS[chapter].enemyTypes.includes(type),
            ),
          );
          for (const h of p.hazards) {
            assert.ok(h.age <= -1);
            assert.equal(B.hazardContains(h, h.x, h.y), false);
          }
        }
      assert.equal(attacks.size, 2);
      let result, hud;
      const engine = new Battle(
        null,
        run,
        meta,
        new AudioEngine(),
        (h) => (hud = h),
        (r) => (result = r),
      );
      engine.update(0.025);
      const leader = engine.enemies.find((e) => e.type === Mini.MINIBOSS_TYPE);
      assert.ok(leader);
      assert.equal(
        engine.enemies.some((e) => e.type === 99),
        false,
      );
      assert.equal(hud.bossMax, def.health);
      engine.stats.damage = 0;
      engine.invincible = 200;
      for (let i = 0; i < 600; i++) engine.update(0.025);
      assert.ok(engine.bossAttack);
      assert.ok(engine.enemies.length <= 7);
      assert.ok(
        engine.enemies.every(
          (e) => Number.isFinite(e.x) && Number.isFinite(e.hp),
        ),
      );
      engine.damage(leader, leader.max);
      assert.equal(result.won, true);
      assert.equal(result.boss, false);
      const reward = M.battleRewards(result.run, meta);
      assert.equal(reward.scrap - result.run.scrap, 4);
      assert.equal(reward.coins - result.run.coins, 40 + chapter * 6);
      assert.equal(reward.loot.length, 3);
      assert.equal(M.advanceLocation(reward, meta), reward);
      const next = M.nextNode(reward);
      assert.equal(next.chapter, chapter);
      assert.equal(next.step, run.step + 1);
      let timeout;
      const slow = new Battle(
        null,
        run,
        meta,
        new AudioEngine(),
        () => {},
        (r) => (timeout = r),
      );
      slow.elapsed = slow.duration;
      slow.update(0.025);
      assert.equal(
        timeout.won,
        false,
        'Waiting out the timer cannot defeat a miniboss',
      );
    }
  assert.equal(names.size, 9);
});
test('A chest contains exactly one furniture or module, locked modules survive acquiring and reloading', () => {
  const meta = M.initialMeta();
  let found = new Set();
  for (let seed = 0; seed < 300; seed++) {
    let run = roomOfKind(
      M.makeRun(meta, 'mechanic', 0, seed),
      meta,
      null,
      'chest',
    );
    assert.equal(run.kind, 'chest');
    assert.equal(run.loot.length, 1);
    const loot = run.loot[0];
    found.add(loot.kind);
    const before = M.readSave(M.saveData(meta, run)).run;
    assert.deepEqual(before.loot, run.loot);
    if (loot.kind === 'furniture') {
      const next = M.claimFurniture(run, 0);
      assert.equal(next.furniture.length, 1);
      assert.equal(next.step, run.step + 1);
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
  let run = roomOfKind(M.makeRun(meta, 'mechanic', 0, 91), meta, null, 'shop');
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
      run.step = 9;
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
  assert.equal(new Set(C.ENEMY_DEFS.map((e) => e.behavior)).size, 18);
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
