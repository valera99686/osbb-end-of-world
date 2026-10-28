const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const M = require('../.test-build/model.js');
const A = require('../.test-build/achievements.js');
const { BLUEPRINTS } = require('../.test-build/progression.js');
const { CHARACTERS, RESEARCH } = require('../.test-build/data.js');
const { RESIDENTS } = require('../.test-build/residents.js');
const { CLUES } = require('../.test-build/story.js');

const byText = (a, b) => a.localeCompare(b);
const IDS = A.ACHIEVEMENTS.map((a) => a.id).sort(byText);
// Goals that only a single expedition can meet; the rest persist in Meta.
const RUN_ONLY = [
  'affixed_10',
  'battle_100',
  'boss_no_hit',
  'events_3',
  'full_house',
  'no_repair_win',
];
// Every lifetime goal met at once, passed through a save so its clamps apply.
function veteran() {
  const base = M.initialMeta();
  const meta = {
    ...base,
    runs: 30,
    kills: 5000,
    totalBosses: 15,
    totalMinibosses: 10,
    totalRescues: 10,
    wins: 8,
    deaths: 10,
    playTime: 36000,
    totalElites: 50,
    bestCombo: 50,
    bestHeat: 10,
    heatUnlocked: 10,
    endlessBest: 3,
    clues: CLUES.map((c) => c.id),
    endings: ['a', 'b', 'c'],
    secrets: ['konami', 'night'],
    coopWins: 2,
    coopRevives: 9,
    blueprints: BLUEPRINTS.slice(0, 5).map((b) => b.id),
    research: Object.fromEntries(RESEARCH.map((r) => [r.id, 1])),
    dailyBest: Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((d) => [`2026-09-0${d}`, 100 + d]),
    ),
    winsByCharacter: Object.fromEntries(
      CHARACTERS.map((c) => [c.id, 1]),
    ),
  };
  return M.readSave(M.saveData(meta, null)).meta;
}
// A flawless final-location raid that meets every per-run goal.
function heroicRun(meta, opts) {
  return {
    ...M.makeRun(meta, 'mechanic', 2, 17, opts),
    repairs: 0,
    bossNoHit: 1,
    maxBattleKills: 100,
    elitesKilled: 10,
    eventsCompleted: 3,
    rescued: RESIDENTS.map((r) => r.id),
  };
}

test('Every achievement can be earned, and none is free on a new profile', () => {
  const fresh = M.initialMeta();
  assert.deepEqual(A.newAchievements(fresh, null), []);
  assert.deepEqual(
    A.newAchievements(fresh, M.makeRun(fresh, 'mechanic', 0, 1), true),
    [],
  );
  const meta = veteran();
  assert.deepEqual(
    [...A.newAchievements(meta, heroicRun(meta), true)].sort(byText),
    IDS,
  );
  assert.deepEqual(
    [...A.newAchievements(meta, null)].sort(byText),
    IDS.filter((id) => !RUN_ONLY.includes(id)),
  );
  // Per-run goals need nothing from the profile.
  assert.deepEqual(
    [...A.newAchievements(fresh, heroicRun(fresh), true)].sort(byText),
    RUN_ONLY,
  );
  // The victory-only goal waits for the final win, and endless never counts.
  assert.ok(
    !A.newAchievements(fresh, heroicRun(fresh)).includes('no_repair_win'),
  );
  const endless = { ...heroicRun(fresh, { mode: 'endless' }), loop: 3 };
  const earned = A.newAchievements(fresh, endless, true);
  assert.ok(earned.includes('endless_1') && earned.includes('endless_3'));
  assert.ok(!earned.includes('no_repair_win'));
  // Applying twice grants nothing new.
  const once = A.applyAchievements(meta, heroicRun(meta), true);
  assert.deepEqual([...once.unlocked].sort(byText), IDS);
  assert.deepEqual(
    A.applyAchievements(once.meta, heroicRun(meta), true).unlocked,
    [],
  );
});

test('Achievement icons are bundled in the UI and unlocked ids survive saving', () => {
  const source = readFileSync('app/records.tsx', 'utf8');
  const start = source.indexOf('const ICONS');
  assert.ok(start > 0, 'ICONS map in app/records.tsx');
  const block = source.slice(start, source.indexOf('};', start));
  const bundled = new Set(
    [...block.matchAll(/^\s+(\w+)\s*[,:]/gm)].map((m) => m[1]),
  );
  // An unknown name would silently fall back to the generic award icon.
  for (const a of A.ACHIEVEMENTS) assert.ok(bundled.has(a.icon), a.icon);
  const meta = {
    ...M.initialMeta(),
    achievements: [...IDS, IDS[0], 'bogus', 7],
  };
  assert.deepEqual(M.readSave(M.saveData(meta, null)).meta.achievements, IDS);
});
