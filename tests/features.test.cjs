const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js'),
  Save = require('../.test-build/save.js'),
  Modes = require('../.test-build/modes.js'),
  A = require('../.test-build/achievements.js'),
  Profile = require('../.test-build/profile.js'),
  R = require('../.test-build/residents.js');

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
const byText = (a, b) => a.localeCompare(b);
const finalBoss = (run, meta) => roomAt(run, meta, run.nodes.length - 1);
function bossOf(run, meta, chapter) {
  while (run.chapter !== chapter || run.kind !== 'boss')
    run =
      run.kind === 'boss' && run.page === 'combat'
        ? M.advanceLocation(run, meta)
        : finalBoss(run, meta);
  return run;
}
const NEW_META = [
  'settings',
  'deaths',
  'playTime',
  'bestHeat',
  'heatUnlocked',
  'dailyBest',
  'dailyAttempts',
  'achievements',
  'endlessBest',
  'winsByCharacter',
  'totalElites',
  'bestCombo',
  'secrets',
];
const NEW_RUN = [
  'mode',
  'heat',
  'daily',
  'dailyRanked',
  'loop',
  'elitesKilled',
  'bestCombo',
  'damageTaken',
  'battleDamage',
  'bossNoHit',
  'maxBattleKills',
  'eventsCompleted',
  'repairs',
];
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

test('Old saves without the new fields load with safe defaults and keep the mute', () => {
  const meta = M.initialMeta();
  meta.wins = 1;
  meta.kills = 90;
  meta.sound = false;
  const run = roomAt(M.makeRun(meta, 'mechanic', 1, 404), meta, 2);
  const old = JSON.parse(M.saveData(meta, run));
  for (const key of NEW_META) delete old.meta[key];
  for (const key of NEW_RUN) delete old.run[key];
  const loaded = M.readSave(JSON.stringify(old));
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.meta.sound, false);
  assert.deepEqual(loaded.meta.settings, M.DEFAULT_SETTINGS);
  assert.notEqual(loaded.meta.settings, M.DEFAULT_SETTINGS);
  assert.equal(loaded.meta.deaths, 0);
  assert.equal(loaded.meta.playTime, 0);
  assert.deepEqual(loaded.meta.dailyBest, {});
  assert.deepEqual(loaded.meta.achievements, []);
  assert.deepEqual(loaded.meta.winsByCharacter, {});
  // A profile that already won gets the first heat level.
  assert.equal(loaded.meta.heatUnlocked, 1);
  assert.equal(loaded.meta.kills, 90);
  assert.equal(loaded.run.mode, 'campaign');
  assert.equal(loaded.run.heat, 0);
  assert.equal(loaded.run.daily, '');
  assert.equal(loaded.run.loop, 0);
  for (const key of NEW_RUN.slice(4, -1)) assert.equal(loaded.run[key], 0, key);
  // Repairs were not counted before; a run past its first room may have had some.
  assert.equal(loaded.run.repairs, 1);
  assert.deepEqual(loaded.run.nodes, run.nodes);
  assert.deepEqual(loaded.run.items, run.items);
  assert.deepEqual(M.readSave(M.saveData(loaded.meta, loaded.run)), loaded);
  // The split module is the same code the model re-exports.
  assert.equal(M.readSave, Save.readSave);
  assert.equal(M.saveData, Save.saveData);
});

test('Settings are merged over defaults and clamped to the allowed steps', () => {
  const meta = M.initialMeta();
  meta.settings = {
    music: 7,
    sfx: -2,
    vibration: 'yes',
    shake: 0.4,
    colorblind: true,
    textScale: 9,
    damageNumbers: false,
    reducedFlashes: 1,
    extra: 'ignored',
  };
  const loaded = M.readSave(M.saveData(meta, null)).meta;
  assert.deepEqual(loaded.settings, {
    music: 1,
    sfx: 0,
    voice: 0.9, // not in the stored settings: the default
    vibration: true,
    shake: 0.5,
    colorblind: true,
    textScale: 1.3,
    damageNumbers: false,
    reducedFlashes: false,
  });
  meta.settings = 'broken';
  assert.deepEqual(
    M.readSave(M.saveData(meta, null)).meta.settings,
    M.DEFAULT_SETTINGS,
  );
  assert.deepEqual(
    M.sanitizeSettings({ music: NaN, sfx: 0.25, shake: 0.9, textScale: 1.1 }),
    { ...M.DEFAULT_SETTINGS, sfx: 0.25, shake: 1, textScale: 1.15 },
  );
  const custom = { ...M.DEFAULT_SETTINGS, music: 0.35, shake: 0 };
  assert.deepEqual(M.sanitizeSettings(custom), custom);
});

test('Profile codes round-trip Cyrillic progress and an active run', () => {
  const meta = M.initialMeta();
  meta.kills = 321;
  meta.dailyBest = { '2026-09-20': 1400 };
  meta.achievements = ['first_run'];
  meta.settings = { ...M.DEFAULT_SETTINGS, music: 0.2, colorblind: true };
  let run = M.makeRun(meta, 'mechanic', 1, 777, { heat: 3 });
  run = roomAt(run, meta, 3);
  run.eventResult = 'Урятовано: Ніна. Квартиру заселено — «ура» ✓';
  run.elitesKilled = 4;
  run.damageTaken = 37.5;
  const code = M.exportSave(meta, run);
  assert.ok(code.startsWith('OSBB1:'));
  assert.match(code.slice(6), /^[A-Za-z0-9+/]+=*$/);
  const expected = M.readSave(M.saveData(meta, run));
  const imported = M.importSave(code);
  assert.equal(imported.error, undefined);
  assert.deepEqual(imported, expected);
  assert.equal(imported.run.eventResult, run.eventResult);
  assert.equal(imported.run.heat, 3);
  assert.deepEqual(imported.meta.dailyBest, meta.dailyBest);
  // Without the prefix, line-wrapped, padded or with a lowercase prefix.
  const body = code.slice(6);
  const wrapped = body.replace(/.{60}/g, '$&\n');
  assert.deepEqual(Save.importSave(body), expected);
  assert.deepEqual(Save.importSave(`  \n OSBB1:${wrapped}\n `), expected);
  assert.deepEqual(Save.importSave('osbb1:' + body), expected);
  assert.deepEqual(Save.importSave(M.saveData(meta, run)), expected);
});

test('Garbage profile codes are rejected without touching progress', () => {
  const garbage = [
    '',
    '   ',
    'hello world',
    'OSBB1:',
    'OSBB1:!!!!',
    'OSBB1:' + Buffer.from('not json').toString('base64'),
    'OSBB1:' + Buffer.from([0xff, 0xfe, 0x80]).toString('base64'),
    'OSBB1:' + Buffer.from('{"version":2,"meta":{}}').toString('base64'),
    '{"version":1}',
    '{broken',
  ];
  for (const text of garbage) {
    const result = Save.importSave(text);
    assert.equal(result.error, true, text);
    assert.equal(result.run, null);
    assert.deepEqual(result.meta, M.initialMeta());
  }
  const storage = memoryStorage({ 'osbb.save.v1': 'live' });
  assert.throws(() => Profile.importProfile(storage, 'live', 'nonsense'));
  assert.deepEqual(storage.data, { 'osbb.save.v1': 'live' });
  const meta = M.initialMeta();
  meta.kills = 12;
  Profile.importProfile(storage, 'live', Save.exportSave(meta, null));
  assert.equal(storage.data[Profile.PROFILE_BACKUP_KEY], 'live');
  assert.equal(M.readSave(storage.data[M.SAVE_KEY]).meta.kills, 12);
});

test('Daily seeds and setups are stable per day and change between days', () => {
  assert.equal(Modes.dateKey(new Date(2026, 8, 24, 23, 59)), '2026-09-24');
  assert.equal(Modes.dateKey(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
  const key = '2026-09-24';
  assert.equal(Modes.dailySeed(key), Modes.dailySeed(key));
  const seeds = new Set(),
    modifiers = new Set(),
    characters = new Set();
  const fresh = M.initialMeta(),
    veteran = { ...M.initialMeta(), wins: 5 };
  for (let day = 1; day <= 60; day++) {
    const k = Modes.dateKey(new Date(2026, 5, day));
    const seed = Modes.dailySeed(k);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
    seeds.add(seed);
    const a = Modes.dailySetup(k, veteran),
      b = Modes.dailySetup(k, veteran),
      c = Modes.dailySetup(k, fresh);
    assert.deepEqual(a, b);
    assert.equal(a.seed, seed);
    // Everyone shares the day's rules; only the locked heroes differ.
    assert.equal(c.modifier, a.modifier);
    assert.equal(c.heat, a.heat);
    assert.equal(c.character, 'mechanic');
    assert.ok(Modes.DAILY_MODIFIERS.some((m) => m.id === a.modifier));
    assert.ok(a.heat >= 1 && a.heat <= 3);
    modifiers.add(a.modifier);
    characters.add(a.character);
  }
  assert.equal(seeds.size, 60);
  assert.ok(modifiers.size >= 4);
  assert.ok(characters.size >= 3);
  assert.notEqual(Modes.dailySeed('2026-09-24'), Modes.dailySeed('2026-09-25'));
});

test('A daily run is reproducible from its seed and survives saving', () => {
  const meta = { ...M.initialMeta(), wins: 3 };
  const key = '2026-09-24';
  const setup = Modes.dailySetup(key, meta);
  const opts = { mode: 'daily', heat: setup.heat, daily: key };
  const a = M.makeRun(meta, setup.character, 0, setup.seed, opts),
    b = M.makeRun(meta, setup.character, 0, setup.seed, opts);
  assert.deepEqual(a, b);
  assert.equal(a.mode, 'daily');
  assert.equal(a.daily, key);
  assert.equal(a.heat, setup.heat);
  assert.equal(a.character, setup.character);
  const other = Modes.dailySetup('2026-09-25', meta);
  assert.notDeepEqual(
    M.makeRun(meta, other.character, 0, other.seed, {
      mode: 'daily',
      heat: other.heat,
      daily: '2026-09-25',
    }).nodes,
    a.nodes,
  );
  const played = roomAt(a, meta, 2);
  assert.deepEqual(M.readSave(M.saveData(meta, played)).run, played);
  const broken = JSON.parse(M.saveData(meta, played));
  broken.run.daily = 'yesterday';
  assert.equal(M.readSave(JSON.stringify(broken)).run.mode, 'campaign');
  // Defaults stay a plain campaign; a daily without a key uses today.
  const plain = M.makeRun(meta, 'mechanic', 0, 5);
  assert.equal(plain.mode, 'campaign');
  assert.equal(plain.heat, 0);
  assert.equal(plain.daily, '');
  assert.match(
    M.makeRun(meta, 'mechanic', 0, 5, { mode: 'daily' }).daily,
    /^\d{4}-\d{2}-\d{2}$/,
  );
  assert.equal(M.makeRun(meta, 'mechanic', 0, 5, { heat: 99 }).heat, 10);
});

test('Heat zero is neutral, every level makes things harder and prices follow', () => {
  const neutral = {
    enemyHealth: 1,
    enemyDamage: 1,
    enemySpeed: 1,
    projectileSpeed: 1,
    spawnRate: 1,
    affixBonus: 0,
    repairCost: 1,
    shopCost: 1,
    bossTime: 1,
    coreBonus: 1,
  };
  assert.deepEqual(Modes.heatEffects(0), neutral);
  assert.deepEqual(Modes.heatEffects(NaN), neutral);
  assert.deepEqual(Modes.heatEffects(-3), neutral);
  assert.deepEqual(
    Modes.HEAT_LEVELS.map((h) => h.level),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  const harder = Object.keys(neutral).filter((k) => k !== 'bossTime');
  for (let heat = 0; heat < 12; heat++) {
    const a = Modes.heatEffects(heat),
      b = Modes.heatEffects(heat + 1);
    for (const key of harder) assert.ok(b[key] >= a[key], `${key} @${heat}`);
    assert.ok(b.bossTime <= a.bossTime);
    assert.ok(b.coreBonus > a.coreBonus);
    if (heat < 10) {
      const changed = harder
        .filter((k) => k !== 'coreBonus')
        .some((k) => b[k] !== a[k]);
      assert.ok(changed || b.bossTime !== a.bossTime, `level ${heat + 1}`);
    }
  }
  assert.equal(Modes.heatEffects(5).coreBonus, 1.5);
  for (const m of Modes.DAILY_MODIFIERS)
    assert.notDeepEqual(Modes.heatEffects(0, m.id), neutral, m.id);
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 1, 90);
  const item = { price: 40 };
  assert.equal(M.priceFor(item, run), Math.round(40 * 1.15));
  assert.equal(M.repairCost(run), 40);
  assert.equal(M.rerollCost(run), 25);
  const hot = { ...run, heat: 8 };
  assert.equal(M.repairCost(hot), 60);
  assert.equal(M.priceFor(item, hot), Math.round(40 * 1.15 * 1.2));
  assert.ok(M.furniturePrice(hot, 'bench') >= M.furniturePrice(run, 'bench'));
  run = { ...roomAt(run, meta, 1), page: 'shop', coins: 200, heat: 2 };
  run.hp = 20;
  const repaired = M.repairShop(run, meta);
  assert.equal(repaired.coins, 200 - 60);
  assert.equal(repaired.repairs, 1);
  assert.equal(M.repairShop(repaired, meta), repaired);
});

test('Difficulty is felt from the first run: free levels, names and a steep ladder', () => {
  // A new profile can already pick levels 1-3; wins open the rest.
  assert.equal(Modes.heatChoices(0), Modes.FREE_HEAT);
  assert.equal(Modes.heatChoices(undefined), Modes.FREE_HEAT);
  assert.equal(Modes.heatChoices(NaN), Modes.FREE_HEAT);
  assert.equal(Modes.heatChoices(6), 6);
  assert.equal(Modes.heatChoices(99), Modes.MAX_HEAT);
  // The first three levels already bite: a clear step in health, damage and speed.
  const e3 = Modes.heatEffects(3);
  assert.ok(e3.enemyHealth >= 1.25 && e3.enemyDamage >= 1.15 && e3.enemySpeed >= 1.1);
  assert.ok(Modes.heatEffects(1).enemyHealth >= 1.25);
  const top = Modes.heatEffects(10);
  assert.ok(top.enemyHealth >= 1.5 && top.enemyDamage >= 1.5 && top.spawnRate >= 1.25);
  // Names grow with the level and every level has a line with the numbers.
  assert.equal(Modes.heatName(0), 'Звичайна');
  assert.equal(Modes.heatName(10), 'Кінець світу');
  const names = new Set([0, 2, 5, 8, 10].map((h) => Modes.heatName(h)));
  assert.equal(names.size, 5);
  assert.equal(Modes.heatSummary(0), '');
  for (let h = 1; h <= 10; h++) assert.match(Modes.heatSummary(h), /^Вороги: .*%/, String(h));
  assert.match(Modes.heatSummary(1), /здоров’я \+25%/);
});

test('Affixes never appear early or on bosses and roll deterministically', () => {
  const never = () => {
    throw new Error('rng consumed');
  };
  for (const run of [
    { step: 0, kind: 'battle', heat: 0 },
    { step: 1, kind: 'elite', heat: 10 },
    { step: 6, kind: 'boss', heat: 10 },
    { step: 4, kind: 'miniboss', heat: 10 },
  ]) {
    assert.equal(Modes.affixChance(run), 0);
    assert.equal(Modes.rollAffix(never, run), null);
  }
  const early = Modes.affixChance({ step: 2, kind: 'battle', heat: 0 }),
    late = Modes.affixChance({ step: 9, kind: 'battle', heat: 0 });
  assert.ok(Math.abs(early - 0.08) < 1e-9);
  assert.ok(Math.abs(late - 0.15) < 1e-9);
  assert.ok(
    Modes.affixChance({ step: 9, kind: 'battle', heat: 5 }) > late + 0.05,
  );
  const run = { step: 6, kind: 'elite', heat: 3 };
  const roll = (seed) => {
    const rng = M.seeded(seed);
    return Array.from({ length: 300 }, () => Modes.rollAffix(rng, run));
  };
  const first = roll(123);
  assert.deepEqual(roll(123), first);
  assert.notDeepEqual(roll(124), first);
  const ids = new Set(Modes.ELITE_AFFIXES.map((a) => a.id));
  assert.equal(ids.size, 6);
  const hits = first.filter(Boolean);
  assert.ok(hits.length > 10 && hits.length < 120);
  assert.ok(hits.every((id) => ids.has(id)));
});

test('Combo multiplier, battle events and scores stay within their bounds', () => {
  assert.equal(Modes.comboMultiplier(0), 1);
  assert.equal(Modes.comboMultiplier(5), 1);
  assert.equal(Modes.comboMultiplier(6), 1.05);
  // Economy retune (docs/balance/2026-09-24.md): same +5% ramp, but the cap
  // is x1.5 from 15 kills instead of x2 at 25.
  assert.equal(Modes.COMBO_CAP, 1.5);
  assert.equal(Modes.comboMultiplier(14), 1.45);
  assert.equal(Modes.comboMultiplier(15), 1.5);
  assert.equal(Modes.comboMultiplier(25), 1.5);
  assert.equal(Modes.comboMultiplier(1e6), 1.5);
  assert.equal(Modes.comboMultiplier(-4), 1);
  assert.equal(Modes.comboMultiplier(NaN), 1);
  for (let c = 0; c < 40; c++)
    assert.ok(Modes.comboMultiplier(c + 1) >= Modes.comboMultiplier(c));
  const never = () => {
    throw new Error('rng consumed');
  };
  assert.equal(Modes.rollBattleEvent(never, { step: 0, kind: 'battle' }), null);
  assert.equal(Modes.rollBattleEvent(never, { step: 4, kind: 'elite' }), null);
  assert.equal(Modes.rollBattleEvent(never, { step: 4, kind: 'boss' }), null);
  const rng = M.seeded(9);
  const events = Array.from({ length: 2000 }, () =>
    Modes.rollBattleEvent(rng, { step: 3, kind: 'battle' }),
  ).filter(Boolean);
  // 0.11 doubled the chance (25% -> 50%) so events shape more fights.
  assert.ok(events.length > 880 && events.length < 1120, events.length);
  assert.deepEqual(
    [...new Set(events)].sort(byText),
    Modes.BATTLE_EVENTS.map((e) => e.id).sort(byText),
  );
  const run = {
    ...M.makeRun(M.initialMeta(), 'mechanic', 1, 3),
    kills: 10,
    bossesDefeated: 1,
    step: 3,
  };
  assert.equal(Modes.runScore(run), 10 + 50 + 60 + 300);
  assert.equal(Modes.runScore({ ...run, heat: 2 }), Math.round(420 * 1.2));
  assert.equal(Modes.runScore(run, true), 420 + 50 + 500);
  assert.equal(Modes.runScore({}), 0);
  assert.equal(Modes.endlessHeat(0, 3), 3);
  assert.equal(Modes.endlessHeat(2, 3), 7);
  assert.equal(Modes.endlessHeat(9, 3), 21);
  assert.equal(Modes.endlessHeat(1e6, 3), Modes.MAX_ENDLESS_HEAT);
});

test('Finishing runs records lifetime stats and unlocks achievements once', () => {
  const ids = A.ACHIEVEMENTS.map((a) => a.id);
  assert.ok(ids.length >= 28);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(A.ACHIEVEMENTS.every((a) => a.title && a.text && a.icon));
  let meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 5);
  run.kills = 120;
  run.time = 95.5;
  let end = M.finishRun(meta, run, false);
  assert.equal(end.meta.deaths, 1);
  assert.equal(end.meta.playTime, 95.5);
  assert.deepEqual(end.achievements, ['first_run', 'kills_100']);
  assert.deepEqual(end.meta.achievements, end.achievements);
  assert.deepEqual(meta.achievements, []);
  assert.equal(end.meta.heatUnlocked, 0);
  meta = end.meta;
  run = M.makeRun(meta, 'mechanic', 1, 6);
  Object.assign(run, {
    kills: 10,
    time: 10,
    maxBattleKills: 100,
    bestCombo: 30,
    bossNoHit: 1,
    elitesKilled: 10,
    eventsCompleted: 3,
  });
  end = M.finishRun(meta, run, false);
  assert.deepEqual([...end.achievements].sort(byText), [
    'affixed_10',
    'battle_100',
    'boss_no_hit',
    'combo_25',
    'events_3',
  ]);
  assert.equal(end.meta.deaths, 2);
  assert.equal(end.meta.playTime, 105.5);
  assert.equal(end.meta.bestCombo, 30);
  assert.equal(end.meta.totalElites, 10);
  assert.equal(
    new Set(end.meta.achievements).size,
    end.meta.achievements.length,
  );
  assert.deepEqual(M.readSave(M.saveData(end.meta, null)).meta, end.meta);
  // Pure helper: nothing new means the very same object comes back.
  const same = A.applyAchievements(end.meta, null);
  assert.equal(same.meta, end.meta);
  assert.deepEqual(same.unlocked, []);
  const fresh = M.initialMeta();
  const applied = A.applyAchievements({ ...fresh, kills: 1000 }, null);
  assert.deepEqual(applied.unlocked, ['kills_100', 'kills_1000']);
  assert.deepEqual(fresh.achievements, []);
});

test('Final wins raise heat, credit the hero and pay the heat bonus', () => {
  const meta = M.initialMeta();
  const run = bossOf(M.makeRun(meta, 'mechanic', 0, 42, { heat: 4 }), meta, 2);
  assert.equal(run.chapter, 2);
  assert.ok(M.isFinalVictory(run));
  assert.equal(M.isFinalVictory(run, false), false);
  const end = M.finishRun(meta, run, true);
  assert.equal(end.meta.wins, 1);
  assert.equal(end.meta.deaths, 0);
  assert.equal(end.meta.heatUnlocked, 5);
  assert.equal(end.meta.bestHeat, 4);
  assert.deepEqual(end.meta.winsByCharacter, { mechanic: 1 });
  // Three cleared locations plus the dawn bonus, times the heat bonus.
  const won = 3 * M.CORES.location + M.CORES.dawn;
  assert.equal(end.cores, Math.round(won * 1.4));
  assert.deepEqual(end.coreBreakdown.at(-1), {
    label: 'Бонус складності',
    amount: Math.round(won * 1.4) - won,
  });
  for (const id of ['first_win', 'first_boss', 'heat_1', 'no_repair_win'])
    assert.ok(end.achievements.includes(id), id);
  assert.ok(!end.achievements.includes('heat_5'));
  // Heat 0 keeps the original payout and still opens the first heat level.
  const plain = bossOf(M.makeRun(meta, 'mechanic', 0, 42), meta, 2);
  plain.repairs = 1;
  const calm = M.finishRun(meta, plain, true);
  assert.equal(calm.cores, won);
  // Locations, rescues, minibosses, field data and the dawn bonus.
  assert.equal(calm.coreBreakdown.length, 5);
  assert.equal(calm.meta.heatUnlocked, 1);
  assert.equal(calm.meta.bestHeat, 0);
  assert.ok(!calm.achievements.includes('no_repair_win'));
  assert.ok(!calm.achievements.includes('heat_1'));
  // A later lower-heat win never lowers the unlocked level.
  assert.equal(M.finishRun(end.meta, plain, true).meta.heatUnlocked, 5);
  const three = A.newAchievements(
    { ...end.meta, winsByCharacter: { mechanic: 2, spark: 1, flora: 1 } },
    null,
  );
  assert.ok(three.includes('three_heroes'));
  const everyone = { ...run, rescued: R.RESIDENTS.map((r) => r.id) };
  assert.ok(A.newAchievements(meta, everyone).includes('full_house'));
});

test('Daily results keep the best score per day', () => {
  const meta = M.initialMeta();
  const key = '2026-09-24';
  const run = M.makeRun(meta, 'mechanic', 1, 8, {
    mode: 'daily',
    heat: 2,
    daily: key,
  });
  run.kills = 60;
  let end = M.finishRun(meta, run, false);
  assert.equal(end.meta.dailyBest[key], Modes.runScore(run));
  assert.ok(end.achievements.includes('daily_1'));
  const worse = { ...run, kills: 1 };
  end = M.finishRun(end.meta, worse, false);
  assert.equal(end.meta.dailyBest[key], Modes.runScore(run));
  assert.ok(!end.achievements.includes('daily_1'));
  const campaign = M.finishRun(
    meta,
    { ...run, mode: 'campaign', daily: '' },
    false,
  );
  assert.deepEqual(campaign.meta.dailyBest, {});
  const saved = JSON.parse(M.saveData(end.meta, null));
  saved.meta.dailyBest['not-a-date'] = 5;
  saved.meta.dailyBest['2026-09-01'] = -4;
  assert.deepEqual(M.readSave(JSON.stringify(saved)).meta.dailyBest, {
    [key]: Modes.runScore(run),
  });
});

test('Endless mode loops back to location one with the same house and hotter heat', () => {
  const meta = M.initialMeta();
  const start = M.makeRun(meta, 'mechanic', 0, 42, {
    mode: 'endless',
    heat: 3,
  });
  let run = bossOf(start, meta, 2);
  run.coins = 321;
  run.scrap = 7;
  const before = run;
  assert.equal(M.isFinalVictory(run), false);
  run = M.advanceLocation(run, meta);
  assert.deepEqual(M.nextEndlessLoop(before, meta), run);
  assert.equal(run.chapter, 0);
  assert.equal(run.loop, 1);
  assert.equal(run.heat, 5);
  assert.equal(run.step, 0);
  assert.equal(run.page, 'map');
  assert.equal(run.bossesDefeated, 3);
  assert.equal(run.coins, 321);
  assert.equal(run.scrap, 7);
  assert.deepEqual(run.items, before.items);
  assert.deepEqual(run.residents, before.residents);
  assert.deepEqual(run.furniture, before.furniture);
  assert.deepEqual(run.rescued, before.rescued);
  assert.notDeepEqual(run.nodes, start.nodes);
  assert.ok(run.hp <= M.statsFor(run, meta).health);
  assert.deepEqual(M.readSave(M.saveData(meta, run)).run, run);
  run = bossOf(run, meta, 2);
  run = M.advanceLocation(run, meta);
  assert.equal(run.loop, 2);
  assert.equal(run.heat, 7);
  assert.equal(run.bossesDefeated, 6);
  assert.deepEqual(M.readSave(M.saveData(meta, run)).run, run);
  const hot = M.nextEndlessLoop({ ...bossOf(run, meta, 2), heat: 9 }, meta);
  assert.equal(hot.heat, 11);
  run.kills = 30;
  const end = M.finishRun(meta, run, false);
  assert.equal(end.meta.endlessBest, 2);
  assert.equal(end.meta.wins, 0);
  assert.equal(end.meta.deaths, 1);
  assert.equal(end.meta.totalBosses, 6);
  assert.ok(end.achievements.includes('endless_1'));
  assert.ok(!end.achievements.includes('endless_3'));
  assert.ok(end.coreBreakdown.some((r) => r.label === 'Нескінченні кола'));
  // Campaign runs still stop at the last boss; endless never loops early.
  const campaign = bossOf(M.makeRun(meta, 'mechanic', 0, 42), meta, 2);
  assert.equal(M.advanceLocation(campaign, meta), campaign);
  assert.equal(M.nextEndlessLoop(campaign, meta), campaign);
  const middle = bossOf(start, meta, 1);
  assert.equal(M.nextEndlessLoop(middle, meta), middle);
  assert.equal(M.advanceLocation(middle, meta).chapter, 2);
  const daily = bossOf(
    M.makeRun(meta, 'mechanic', 0, 42, { mode: 'daily', daily: '2026-09-24' }),
    meta,
    2,
  );
  assert.ok(M.isFinalVictory(daily));
  assert.equal(M.isFinalVictory({ ...daily, chapter: 1 }), false);
});

test('Endless heat keeps climbing past the ladder and survives saving', () => {
  const meta = M.initialMeta();
  const start = M.makeRun(meta, 'mechanic', 0, 42, {
    mode: 'endless',
    heat: 10,
  });
  const run = M.advanceLocation(bossOf(start, meta, 2), meta);
  assert.equal(run.loop, 1);
  assert.equal(run.heat, 12);
  assert.deepEqual(M.readSave(M.saveData(meta, run)).run, run);
  const deeper = Modes.heatForRun(run),
    top = Modes.heatForRun({ heat: 10 });
  assert.ok(deeper.enemyHealth > top.enemyHealth);
  assert.ok(deeper.enemyDamage > top.enemyDamage);
  // Only endless runs go past the selectable ladder.
  const heatOf = (opts) => M.makeRun(meta, 'mechanic', 0, 5, opts).heat;
  assert.equal(heatOf({ mode: 'endless', heat: 40 }), 40);
  assert.equal(heatOf({ mode: 'endless', heat: 1e9 }), Modes.MAX_ENDLESS_HEAT);
  assert.equal(heatOf({ mode: 'daily', daily: '2026-09-24', heat: 40 }), 10);
  const forged = JSON.parse(M.saveData(meta, run));
  forged.run.mode = 'campaign';
  assert.equal(M.readSave(JSON.stringify(forged)).run.heat, 10);
});

test('Runs saved before repairs were counted never earn "Без ремонту"', () => {
  const meta = M.initialMeta();
  const fresh = M.makeRun(meta, 'mechanic', 0, 404);
  const legacy = (run) => {
    const old = JSON.parse(M.saveData(meta, run));
    for (const key of NEW_RUN) delete old.run[key];
    return M.readSave(JSON.stringify(old)).run;
  };
  // Nothing can have been repaired before the first room.
  assert.equal(legacy(fresh).repairs, 0);
  const late = legacy(bossOf(fresh, meta, 2));
  assert.equal(late.repairs, 1);
  const won = (run) => M.finishRun(meta, run, true).achievements;
  assert.ok(!won(late).includes('no_repair_win'));
  // Current saves keep their exact count.
  const clean = M.readSave(M.saveData(meta, bossOf(fresh, meta, 2))).run;
  assert.equal(clean.repairs, 0);
  assert.ok(won(clean).includes('no_repair_win'));
});

test('A daily abandoned before any fight records no result', () => {
  const meta = M.initialMeta();
  const key = '2026-09-24';
  const setup = Modes.dailySetup(key, meta);
  const run = M.makeRun(meta, setup.character, 0, setup.seed, {
    mode: 'daily',
    heat: setup.heat,
    daily: key,
  });
  const end = M.finishRun(meta, run, false);
  assert.deepEqual(end.meta.dailyBest, {});
  assert.ok(!end.achievements.includes('daily_1'));
  // Losing the first fight without a kill still completes the day.
  const lost = M.finishRun(meta, { ...run, time: 12 }, false);
  assert.deepEqual(lost.meta.dailyBest, { [key]: 0 });
  assert.ok(lost.achievements.includes('daily_1'));
});

test('Reset, restore and import keep device options and the real backup', () => {
  const custom = {
    ...M.DEFAULT_SETTINGS,
    music: 0,
    colorblind: true,
    textScale: 1.3,
    reducedFlashes: true,
  };
  const meta = {
    ...M.initialMeta(),
    runs: 3,
    wins: 1,
    cores: 200,
    sound: false,
    settings: custom,
  };
  const original = M.saveData(meta, null);
  const storage = memoryStorage({ [M.SAVE_KEY]: original });
  Profile.resetProfile(storage, original);
  const fresh = M.readSave(storage.data[M.SAVE_KEY]).meta;
  assert.equal(fresh.cores, 0);
  assert.equal(fresh.runs, 0);
  assert.deepEqual(fresh.settings, custom);
  assert.equal(fresh.sound, false);
  assert.equal(storage.data[Profile.PROFILE_BACKUP_KEY], original);
  // Neither a second reset nor an import over the empty profile loses it.
  Profile.resetProfile(storage, storage.data[M.SAVE_KEY]);
  const other = { ...M.initialMeta(), runs: 1, kills: 7 };
  const imported = Profile.importProfile(
    storage,
    storage.data[M.SAVE_KEY],
    Save.exportSave(other, null),
  );
  assert.equal(storage.data[Profile.PROFILE_BACKUP_KEY], original);
  // A device that was set up keeps its options; the progress is the code's.
  const live = M.readSave(storage.data[M.SAVE_KEY]).meta;
  assert.equal(live.kills, 7);
  assert.deepEqual(live.settings, custom);
  assert.equal(live.sound, false);
  assert.deepEqual(imported.meta, live);
  // Restoring brings the old progress back under the current options.
  const tweaked = { ...custom, shake: 0 };
  storage.data[M.SAVE_KEY] = M.saveData({ ...live, settings: tweaked }, null);
  Profile.restoreProfile(storage);
  const restored = M.readSave(storage.data[M.SAVE_KEY]).meta;
  assert.equal(restored.cores, 200);
  assert.equal(restored.wins, 1);
  assert.deepEqual(restored.settings, tweaked);
  // A profile with progress is still backed up before the next import.
  const played = storage.data[M.SAVE_KEY];
  Profile.importProfile(storage, played, Save.exportSave(other, null));
  assert.equal(storage.data[Profile.PROFILE_BACKUP_KEY], played);
  // An untouched device takes the options carried by the code.
  const blank = memoryStorage();
  const current = M.saveData(M.initialMeta(), null);
  const adopted = Profile.importProfile(
    blank,
    current,
    Save.exportSave(meta, null),
  );
  assert.deepEqual(adopted.meta.settings, custom);
  assert.equal(adopted.meta.sound, false);
  assert.equal(blank.data[Profile.PROFILE_BACKUP_KEY], current);
});

test('Only the first daily run of a day is ranked; later ones are practice', () => {
  const key = '2026-09-24';
  let meta = M.initialMeta();
  const setup = Modes.dailySetup(key, meta);
  const opts = { mode: 'daily', heat: setup.heat, daily: key };
  const first = M.makeRun(meta, setup.character, 0, setup.seed, opts);
  assert.equal(first.dailyRanked, true);
  assert.equal(M.makeRun(meta, 'mechanic', 0, 5).dailyRanked, false, 'a campaign is never ranked');
  meta = M.startDaily(meta, first);
  assert.equal(meta.dailyAttempts[key], 1);
  const campaign = M.makeRun(meta, 'mechanic', 0, 5);
  assert.equal(M.startDaily(meta, campaign), meta, 'other modes spend nothing');
  const again = M.makeRun(meta, setup.character, 0, setup.seed, opts);
  assert.equal(again.dailyRanked, false);
  first.kills = 20;
  const end = M.finishRun(meta, first, false);
  const record = end.meta.dailyBest[key];
  assert.equal(record, Modes.runScore(first));
  assert.ok(end.achievements.includes('daily_1'));
  // A practice run with a far better result changes neither the record nor the achievements.
  const spent = M.startDaily(end.meta, again);
  assert.equal(spent.dailyAttempts[key], 2);
  const better = { ...again, kills: 400, time: 90 };
  assert.ok(Modes.runScore(better) > record);
  const practice = M.finishRun(spent, better, false);
  assert.equal(practice.meta.dailyBest[key], record);
  assert.ok(!practice.achievements.includes('daily_1'));
  // Another day is a fresh attempt.
  const other = Modes.dailySetup('2026-09-25', practice.meta);
  assert.equal(
    M.makeRun(practice.meta, other.character, 0, other.seed, { mode: 'daily', heat: other.heat, daily: '2026-09-25' }).dailyRanked,
    true,
  );
});

test('A daily left before any fight gives the ranked attempt back', () => {
  const key = '2026-09-24';
  let meta = M.initialMeta();
  const setup = Modes.dailySetup(key, meta);
  const opts = { mode: 'daily', heat: setup.heat, daily: key };
  const run = M.makeRun(meta, setup.character, 0, setup.seed, opts);
  meta = M.startDaily(meta, run);
  assert.equal(meta.dailyAttempts[key], 1);
  const end = M.finishRun(meta, run, false);
  assert.deepEqual(end.meta.dailyBest, {});
  assert.equal(end.meta.dailyAttempts[key], 0);
  assert.equal(M.makeRun(end.meta, setup.character, 0, setup.seed, opts).dailyRanked, true, 'ranked again');
  // A practice run left at once changes nothing.
  const used = M.startDaily(M.startDaily(M.initialMeta(), run), run);
  const practice = M.makeRun(used, setup.character, 0, setup.seed, opts);
  assert.equal(practice.dailyRanked, false);
  assert.equal(M.finishRun(used, practice, false).meta.dailyAttempts[key], 2);
});

test('Daily attempts and the ranked flag survive saving; old saves do not get a second ranked try', () => {
  const key = '2026-09-24';
  let meta = M.initialMeta();
  const setup = Modes.dailySetup(key, meta);
  const opts = { mode: 'daily', heat: setup.heat, daily: key };
  const first = M.makeRun(meta, setup.character, 0, setup.seed, opts);
  meta = M.startDaily(meta, first);
  const practice = M.makeRun(meta, setup.character, 0, setup.seed, opts);
  meta = M.startDaily(meta, practice);
  const loaded = M.readSave(M.saveData(meta, practice));
  assert.deepEqual(loaded.meta.dailyAttempts, { [key]: 2 });
  assert.equal(loaded.run.dailyRanked, false);
  assert.equal(M.readSave(M.saveData(meta, first)).run.dailyRanked, true);
  // Junk in the counters is dropped.
  const broken = JSON.parse(M.saveData(meta, null));
  broken.meta.dailyAttempts = { 'not-a-date': 4, [key]: 'many', '2026-09-26': 500, '2026-09-27': -3 };
  const fixed = M.readSave(JSON.stringify(broken)).meta.dailyAttempts;
  assert.deepEqual(fixed, { '2026-09-26': 99 });
  // A profile from before the counter: the day that has a record was already played.
  const old = JSON.parse(M.saveData({ ...meta, dailyBest: { [key]: 300 } }, first));
  delete old.meta.dailyAttempts;
  delete old.run.dailyRanked;
  const migrated = M.readSave(JSON.stringify(old));
  assert.deepEqual(migrated.meta.dailyAttempts, { [key]: 1 });
  assert.equal(migrated.run.dailyRanked, true, 'the run in progress is still the ranked one');
  assert.equal(M.makeRun(migrated.meta, setup.character, 0, setup.seed, opts).dailyRanked, false);
});
