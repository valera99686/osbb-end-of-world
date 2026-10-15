const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js'),
  P = require('../.test-build/progression.js'),
  D = require('../.test-build/data.js');

// Items that change how the house fights; none may wait for a full win.
const BEHAVIOUR = [
  'chain',
  'tesla',
  'spores',
  'hive',
  'vampire',
  'mirror',
  'blackhole',
  'coinshot',
];
// A losing run as a modest player plays it: a few fights in location one.
function lostRun(meta, seed, extra = {}) {
  const run = M.makeRun(meta, 'mechanic', 0, seed);
  return Object.assign(run, {
    step: 5,
    page: 'combat',
    kind: 'battle',
    battleCount: 5,
    kills: 90,
    dashes: 5,
    rescued: ['mechanic', 'nina'],
    ...extra,
  });
}

test('Every item unlock rule is a known, described milestone', () => {
  for (const item of D.ITEMS) {
    assert.ok(D.UNLOCK_TEXT[item.unlock], item.id);
    if (item.unlock !== 'start' && item.unlock !== 'blueprint')
      assert.ok(P.UNLOCK_GOALS[item.unlock], item.id);
  }
  for (const id of BEHAVIOUR)
    assert.ok(!D.ITEM_BY_ID[id].unlock.startsWith('win'), id);
  // Pure stat items moved behind full wins.
  for (const id of ['capacitor', 'roots', 'heart'])
    assert.ok(D.ITEM_BY_ID[id].unlock.startsWith('win'), id);
});

test('Each of the first losing runs opens something, and behaviour items need no win', () => {
  let meta = M.initialMeta();
  for (let n = 0; n < 6; n++) {
    const end = M.finishRun(meta, lostRun(meta, 50 + n), false);
    assert.ok(
      end.unlocks.length + end.projects.length > 0,
      `run ${n + 1} opened nothing`,
    );
    meta = end.meta;
  }
  assert.ok(meta.unlocked.includes('chain'), 'first run');
  assert.ok(meta.unlocked.includes('mirror'), 'third run');
  assert.ok(meta.unlocked.includes('coinshot'), '300 kills');
  // Stronger losing runs: a boss, minibosses, elites, rescues, location three.
  const deep = lostRun(meta, 90, {
    chapter: 2,
    step: 2,
    bossesDefeated: 2,
    minibossKills: 2,
    eliteWins: 3,
    rescued: ['mechanic', 'nina', 'lev', 'marta', 'danilo', 'boris', 'flora'],
  });
  const end = M.finishRun(meta, deep, false);
  assert.equal(end.meta.wins, 0);
  assert.equal(end.progress.depth, 23);
  for (const id of BEHAVIOUR) assert.ok(end.meta.unlocked.includes(id), id);
  // Both blueprint mechanics can be researched without a win as well.
  const veteran = { ...end.meta, dashes: 40 };
  for (const id of ['flywheel', 'redline'])
    assert.ok(P.blueprintReady(veteran, id), id);
  assert.ok(!end.meta.unlocked.includes('capacitor'));
});

test('New items are revealed first, tagged, in the next run and survive an early exit', () => {
  let meta = M.initialMeta();
  const first = M.finishRun(meta, lostRun(meta, 7), false);
  assert.deepEqual(first.unlocks.sort(), ['chain', 'core_coins', 'drone']);
  assert.deepEqual([...first.meta.fresh].sort(), ['chain', 'core_coins', 'drone']);
  meta = first.meta;
  // The run takes the reveals along; the launch clears them from the profile.
  const run = M.makeRun(meta, 'mechanic', 0, 8);
  assert.deepEqual([...run.fresh].sort(), ['chain', 'core_coins', 'drone']);
  // An abandoned run hands undelivered reveals back.
  const back = M.finishRun({ ...meta, fresh: [] }, run, false);
  assert.ok(back.meta.fresh.includes('chain'));
  assert.ok(back.meta.fresh.includes('drone'));
  // The first reward: the new items, tagged, in the last slots.
  const reward = M.battleRewards({ ...run, page: 'combat' }, meta);
  assert.equal(reward.loot.length, 3);
  // (Three reveals since the coins weapon core joined runs1: all cards new.)
  const n = run.fresh.length;
  assert.deepEqual(
    reward.loot.slice(3 - n).map((l) => [l.id, l.fresh]),
    run.fresh.map((id) => [id, true]),
  );
  if (n < 3) assert.ok(!reward.loot[0].fresh);
  assert.deepEqual(reward.fresh, []);
  // Tags and pending reveals survive a reload.
  const saved = M.readSave(M.saveData({ ...meta, fresh: [] }, reward)).run;
  assert.deepEqual(saved.loot, reward.loot);
  assert.deepEqual(saved.fresh, []);
  // More new items than cards: the rest wait for the next reward.
  const many = {
    ...run,
    page: 'combat',
    fresh: ['chain', 'drone', 'cannon', 'engine'],
  };
  const firstDrop = M.battleRewards(many, meta);
  assert.ok(firstDrop.loot.every((l) => l.fresh));
  assert.deepEqual(firstDrop.fresh, ['engine']);
  // A chest counts as a reward too.
  const chest = M.enterNode(
    { ...run, nodes: [['chest'], ...run.nodes.slice(1)] },
    meta,
    '0:0',
  );
  assert.equal(chest.loot.length, 1);
  assert.ok(chest.loot[0].fresh);
  assert.ok(run.fresh.includes(chest.loot[0].id));
  // Without reveals nothing changes: no tags at all.
  const plain = M.battleRewards(
    { ...M.makeRun(M.initialMeta(), 'mechanic', 0, 8), page: 'combat' },
    M.initialMeta(),
  );
  assert.ok(plain.loot.every((l) => !l.fresh));
});

test('Cores pay for cleared locations and rescues, so a lost run still counts', () => {
  const meta = M.initialMeta();
  const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);
  // Lost in location one with two rescues and 90 kills.
  const early = M.finishRun(
    meta,
    lostRun(meta, 3, { rescued: ['mechanic', 'nina', 'lev'] }),
    false,
  );
  assert.equal(early.cores, 2 + 1);
  assert.equal(sum(early.coreBreakdown), early.cores);
  const row = (end, label) => end.coreBreakdown.find((r) => r.label === label);
  assert.equal(row(early, 'Урятовані мешканці').amount, 2);
  assert.equal(row(early, 'Урятовані мешканці').detail, '2 × 1');
  assert.equal(row(early, 'Пройдені локації').amount, 0);
  // Two locations cleared before the fall.
  const late = M.finishRun(
    meta,
    lostRun(meta, 4, { chapter: 2, bossesDefeated: 2, kills: 400 }),
    false,
  );
  assert.equal(row(late, 'Пройдені локації').amount, 2 * M.CORES.location);
  assert.equal(row(late, 'Бойові дані').amount, M.CORES.killCap);
  assert.equal(late.cores, 2 * M.CORES.location + 1 + M.CORES.killCap);
  assert.ok(!row(late, 'Світанок'));
  // A full win adds the dawn bonus.
  const win = M.finishRun(
    meta,
    lostRun(meta, 5, { chapter: 2, bossesDefeated: 2, kills: 0, step: 9 }),
    true,
  );
  assert.equal(row(win, 'Світанок').amount, M.CORES.dawn);
  assert.equal(win.cores, 3 * M.CORES.location + 1 + M.CORES.dawn);
  assert.equal(win.progress.depth, P.MAX_DEPTH);
  // The 'crew' neighbour is a gift: neither cores nor lifetime rescues.
  const crew = lostRun(meta, 6, {
    rescued: ['mechanic', 'nina'],
    research: { ...meta.research, crew: 1 },
  });
  const gift = M.finishRun(meta, crew, false);
  assert.equal(row(gift, 'Урятовані мешканці').amount, 0);
  assert.equal(gift.meta.totalRescues, 0);
  // Nothing fought, nothing paid.
  const idle = M.makeRun(meta, 'mechanic', 0, 9);
  idle.rescued = ['mechanic', 'nina', 'lev'];
  assert.equal(M.finishRun(meta, idle, false).cores, 0);
});

test('Run depth, the best depth and the next goal are tracked for the result screen', () => {
  const meta = M.initialMeta();
  const run = M.makeRun(meta, 'mechanic', 0, 11);
  assert.equal(P.runDepth(run), 0);
  assert.equal(P.depthLabel(0), 'Ще жодного кроку');
  assert.equal(P.runDepth({ ...run, step: 5, page: 'combat' }), 6);
  assert.equal(P.depthLabel(6), 'Локація 1 · крок 6/10');
  assert.equal(P.runDepth({ ...run, chapter: 1, step: 0, page: 'map' }), 10);
  assert.equal(P.depthLabel(10), 'Локація 1 · крок 10/10');
  assert.equal(P.depthLabel(21), 'Локація 3 · крок 1/10');
  assert.equal(P.runDepth({ ...run, loop: 1 }), P.MAX_DEPTH);
  const first = M.finishRun(meta, lostRun(meta, 12), false);
  assert.deepEqual(first.progress, { depth: 6, best: 6, previous: 0 });
  const second = M.finishRun(
    first.meta,
    lostRun(first.meta, 13, { step: 2 }),
    false,
  );
  assert.deepEqual(second.progress, { depth: 3, best: 6, previous: 6 });
  assert.equal(second.meta.bestDepth, 6);
  // The nearest open goal comes first and carries its own progress.
  const goals = P.nextGoals(second.meta, 50);
  assert.ok(goals.length > 3);
  assert.ok(goals.every((g) => g.value <= g.target && g.target > 0));
  const share = (g) => g.value / g.target;
  const open = goals.filter((g) => !g.ready);
  for (let i = 1; i < open.length; i++)
    assert.ok(share(open[i - 1]) >= share(open[i]));
  assert.ok(
    !goals.some(
      (g) => g.kind === 'item' && second.meta.unlocked.includes(g.id),
    ),
  );
  const reach = goals.find((g) => g.id === 'blackhole');
  assert.equal(reach.progress, 'Локація 1 · крок 6/10');
  // Modifiers first ask for expeditions, then for cores.
  const draft = P.nextGoals({ ...M.initialMeta() }, 50).find(
    (g) => g.id === 'draft',
  );
  assert.equal(draft.target, 1);
  assert.equal(draft.kind, 'modifier');
  assert.equal(P.workshopReady({ ...second.meta, cores: 100 }) > 0, true);
});

test('A rescue is announced by resident id until the house moves on', () => {
  const meta = M.initialMeta();
  const run = { ...M.makeRun(meta, 'mechanic', 0, 21), page: 'combat' };
  const reward = M.battleRewards(run, meta);
  assert.ok(reward.rescue);
  assert.ok(reward.rescued.includes(reward.rescue));
  assert.equal(M.readSave(M.saveData(meta, reward)).run.rescue, reward.rescue);
  const moved = M.nextNode({ ...reward, path: [0] });
  assert.equal(moved.rescue, '');
  // An unknown id from a tampered save is dropped.
  const bad = JSON.parse(M.saveData(meta, reward));
  bad.run.rescue = 'nobody';
  assert.equal(M.readSave(JSON.stringify(bad)).run.rescue, '');
  // Elite wins are counted for the 'elite3' milestone.
  const elite = M.battleRewards({ ...run, kind: 'elite' }, meta);
  assert.equal(elite.eliteWins, 1);
  assert.equal(M.finishRun(meta, elite, false).meta.eliteWins, 1);
});

test('A 0.10 profile and run load with safe defaults, a refund and stable saves', () => {
  const meta = M.initialMeta();
  Object.assign(meta, { runs: 4, kills: 320, wins: 0, totalBosses: 1 });
  meta.unlocked.push('capacitor', 'drone');
  const run = M.makeRun(meta, 'mechanic', 1, 404);
  run.page = 'reward';
  run.loot = [
    { kind: 'module', id: 'cannon' },
    { kind: 'module', id: 'engine' },
  ];
  const old = JSON.parse(M.saveData(meta, run));
  for (const key of ['fresh', 'bestDepth', 'eliteWins']) delete old.meta[key];
  for (const key of ['fresh', 'draft', 'rescue', 'eliteWins'])
    delete old.run[key];
  // Levelled research: hull 3 (5+10+15), garage 5 (6×15) and servos 1 (5).
  old.meta.research = { hull: 3, garage: 5, servos: 1, supplies: 0 };
  old.run.research = { hull: 3, garage: 5, servos: 1, supplies: 0 };
  const loaded = M.readSave(JSON.stringify(old));
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.refund, 30 + 90 + 5);
  assert.equal(loaded.meta.cores, 125);
  for (const r of D.RESEARCH) assert.equal(loaded.meta.research[r.id], 0);
  assert.equal(loaded.meta.research.garage, undefined);
  // A beaten boss means location one was finished at least once.
  assert.equal(loaded.meta.bestDepth, 10);
  assert.equal(loaded.meta.eliteWins, 0);
  // The new ladder opens items for old progress, revealed as new.
  for (const id of ['chain', 'tesla', 'mirror', 'coinshot']) {
    assert.ok(loaded.meta.unlocked.includes(id), id);
    assert.ok(loaded.meta.fresh.includes(id), id);
  }
  // Old unlocks are never taken away.
  assert.ok(loaded.meta.unlocked.includes('capacitor'));
  assert.deepEqual(loaded.run.fresh, []);
  assert.deepEqual(loaded.run.draft, []);
  assert.equal(loaded.run.rescue, '');
  assert.equal(loaded.run.eliteWins, 0);
  assert.deepEqual(loaded.run.loot, run.loot);
  // The run in progress keeps the bonuses it launched with.
  assert.equal(loaded.run.research.garage, 5);
  assert.equal(
    M.statsFor(loaded.run, loaded.meta).damage,
    M.statsFor({ ...loaded.run, research: {} }, loaded.meta).damage + 15,
  );
  // Loading again refunds nothing more and changes nothing.
  const again = M.readSave(M.saveData(loaded.meta, loaded.run));
  assert.equal(again.refund, undefined);
  assert.deepEqual(again, { meta: loaded.meta, run: loaded.run });
  // A profile that already won is at the end of the road.
  const winner = JSON.parse(M.saveData({ ...meta, wins: 1 }, null));
  delete winner.meta.bestDepth;
  assert.equal(M.readSave(JSON.stringify(winner)).meta.bestDepth, P.MAX_DEPTH);
});
