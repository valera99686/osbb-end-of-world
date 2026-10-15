const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const M = require('../.test-build/model.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');

// UI helpers live outside lib/game, so scripts/test.mjs does not build them;
// ones with type-only imports are transpiled next to the lib build here.
function loadApp(name) {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'app', `${name}.ts`),
    'utf8',
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  });
  const file = path.join(__dirname, '..', '.test-build', `app-${name}.js`);
  fs.writeFileSync(file, outputText);
  return require(file);
}
const { settleBattle } = loadApp('battle-end');

// A battle as Combat runs it: finish() plays an outro instead of reporting.
function live(kind) {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 5);
  run.kind = kind;
  if (kind === 'boss') run.step = 9;
  const reported = [];
  const b = new Battle(
    null,
    run,
    meta,
    new AudioEngine(),
    () => {},
    (r) => reported.push(r),
    {},
  );
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.thorns = b.stats.orbit = b.stats.drones = 0;
  b.running = true;
  return { b, run, reported };
}

test('A loss decided in the outro is kept when the player pauses or exits', () => {
  const { b, run, reported } = live('battle');
  b.update(0.025);
  assert.equal(settleBattle(b), false, 'a battle in progress can be paused');
  assert.equal(reported.length, 0);

  b.run.hp = 0;
  b.finish(false);
  assert.equal(reported.length, 0, 'the destruction outro is playing');
  // P, Esc, Back, Start or the pause button: the result goes out now instead
  // of the pause menu, whose exit would save the pre-battle run.
  assert.equal(settleBattle(b), true);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].won, false);
  assert.equal(reported[0].run.hp, 0);
  assert.ok(run.hp > 0, 'the run the menu exit would have saved is alive');

  // Later requests (an exit tap from a menu already open) change nothing.
  assert.equal(settleBattle(b), true, 'still over: no pause, no exit');
  b.paused = true;
  b.paused = false;
  for (let i = 0; i < 180; i++) b.tick(1 / 60);
  assert.equal(reported.length, 1, 'reported exactly once');
});

test('Freezing the arena during a boss-win outro hands the win over at once', () => {
  const { b, reported } = live('boss');
  b.update(0.025);
  b.spawn(0);
  const boss = b.enemies.find((e) => e.type === 99);
  b.damage(boss, boss.max);
  assert.equal(reported.length, 0, 'the victory outro is playing');
  // Combat freezes the engine for Settings, blur and the pause menu alike.
  b.paused = true;
  assert.equal(reported.length, 1);
  assert.equal(reported[0].won, true);
  assert.equal(reported[0].boss, true);
  assert.equal(settleBattle(b), true);
  b.paused = false;
  for (let i = 0; i < 120; i++) b.tick(1 / 60);
  assert.equal(reported.length, 1, 'reported exactly once');
});

test('Settling needs a decided battle', () => {
  let flushed = 0;
  const flushEnd = () => flushed++;
  assert.equal(settleBattle(null), false);
  assert.equal(settleBattle({ ended: false, flushEnd }), false);
  assert.equal(flushed, 0);
  assert.equal(settleBattle({ ended: true, flushEnd }), true);
  assert.equal(flushed, 1);
});
