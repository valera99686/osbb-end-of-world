const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const W = require('../.test-build/weapons.js');
const { ITEM_BY_ID } = require('../.test-build/data.js');
const { equipmentTargets } = require('../.test-build/equipment.js');
const { Battle } = require('../.test-build/engine.js');

const audio = { play() {}, setLayer() {}, setPaused() {} };
// A run with `core` in the first slot and optionally `partner` next to it.
function armed(core, partner) {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 11);
  run.items = run.items.map(() => null);
  const targets = equipmentTargets(run);
  const first = targets[0];
  run.items[first.slot] = core;
  if (partner) {
    const near = targets.find(
      (t) => Math.abs(t.x - first.x) + Math.abs(t.y - first.y) === 1,
    );
    run.items[near.slot] = partner;
  }
  run.kind = 'battle';
  run.step = 3;
  return { meta, run };
}
function fight(core, partner) {
  const { meta, run } = armed(core, partner);
  const b = new Battle(null, run, meta, audio, () => {}, () => {});
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.orbit = b.stats.thorns = b.stats.drones = 0;
  return b;
}
function target(b, x, y) {
  const e = b.spawn(0, { force: true, x, y });
  e.speed = 0;
  e.timer = 999;
  e.hp = e.max = 5000;
  return e;
}

test('Every weapon core is an item that arms its own turret', () => {
  const cores = Object.values(ITEM_BY_ID).filter((i) => i.weapon);
  assert.equal(cores.length, 7);
  for (const item of cores) {
    const { meta, run } = armed(item.id);
    assert.equal(M.statsFor(run, meta).weapon, item.weapon, item.id);
    assert.ok(W.WEAPONS[item.weapon].name);
  }
  const { meta, run } = armed('cannon');
  assert.equal(M.statsFor(run, meta).weapon, 'cannon');
  assert.ok(
    cores.filter((i) => i.unlock === 'start').length >= 2,
    'the first run already offers two cores',
  );
});

test('Each core fires and hurts the enemy it aims at', () => {
  for (const core of [
    'core_spread',
    'core_rail',
    'core_mortar',
    'core_arc',
    'core_coins',
    'core_flame',
    'core_rocket',
  ]) {
    const b = fight(core);
    const e = target(b, b.x + 150, b.y - 40);
    b.shotTimer = 0;
    for (let i = 0; i < 90; i++) b.update(1 / 60);
    assert.ok(e.hp < 5000, core);
  }
});

test('Rail pierces the whole line; arc jumps between enemies', () => {
  const b = fight('core_rail');
  const line = [140, 200, 260].map((dx) => target(b, b.x + dx, b.y - 66));
  b.shoot(b.x, b.y - 66, line[0]);
  for (let i = 0; i < 20; i++) b.update(1 / 60);
  assert.ok(line.every((e) => e.hp < 5000));
  const a = fight('core_arc');
  const group = [0, 60, 120].map((dy) => target(a, a.x + 150, a.y + dy));
  a.shoot(a.x, a.y - 66, group[0]);
  assert.ok(group.every((e) => e.hp < 5000));
});

test('An adjacent partner evolves the core', () => {
  for (const evo of W.EVOLUTIONS) {
    const core = Object.values(ITEM_BY_ID).find((i) => i.weapon === evo.weapon);
    const plain = armed(core.id),
      evolved = armed(core.id, evo.partner);
    assert.equal(M.statsFor(plain.run, plain.meta).evolution, '');
    assert.equal(
      M.statsFor(evolved.run, evolved.meta).evolution,
      evo.id,
      evo.name,
    );
  }
  // Cluster mortar scatters bomblets after the first blast.
  const b = fight('core_mortar', 'generator');
  const e = target(b, b.x + 200, b.y);
  b.shoot(b.x, b.y - 66, e);
  for (let i = 0; i < 36; i++) b.update(1 / 60);
  assert.ok(b.shells.length >= 3 || e.hp < 5000);
});

test('Perks compose with cores: pierce on pellets', () => {
  const b = fight('core_spread');
  b.run.perks = ['complaint'];
  b.refreshPerks();
  const e = target(b, b.x + 80, b.y - 66);
  b.shoot(b.x, b.y - 66, e);
  assert.ok(b.bullets.filter((x) => !x.enemy).every((x) => x.pierce === 1));
});

test('Rocket launcher: the rocket homes in, blasts the crowd round its target and is spent; the magnet doubles it', () => {
  const b = fight('core_rocket');
  const main = target(b, b.x + 220, b.y - 40),
    side = target(b, b.x + 270, b.y - 10),
    far = target(b, b.x + 620, b.y - 40);
  b.shoot(b.x, b.y - 66, main);
  const rockets = b.bullets.filter((x) => !x.enemy && x.kind === 'rocket');
  assert.equal(rockets.length, 1);
  assert.ok(rockets[0].homing && rockets[0].blast > 0);
  for (let i = 0; i < 150; i++) b.update(1 / 60);
  assert.ok(main.hp < 5000, 'the target is hit');
  assert.ok(side.hp < 5000, 'the blast reaches its neighbour');
  assert.equal(far.hp, 5000, 'and stops there');
  assert.ok(side.hp > main.hp, 'the neighbour takes less than the direct hit');
  assert.equal(b.bullets.filter((x) => x.kind === 'rocket').length, 0, 'the rocket is spent');
  const swarm = fight('core_rocket', 'magnet');
  assert.equal(swarm.stats.evolution, 'magnet_swarm');
  swarm.shoot(swarm.x, swarm.y - 66, target(swarm, swarm.x + 220, swarm.y - 40));
  assert.equal(swarm.bullets.filter((x) => !x.enemy && x.kind === 'rocket').length, 2);
});
