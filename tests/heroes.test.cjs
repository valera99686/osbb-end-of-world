const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const D = require('../.test-build/data.js');
const H = require('../.test-build/heroes.js');
const { Battle } = require('../.test-build/engine.js');

const audio = { play() {}, setLayer() {}, setPaused() {} };
function battle(hero = 'mechanic') {
  const meta = M.initialMeta();
  // The other heads are unlocked by finished expeditions.
  meta.wins = 5;
  const run = M.makeRun(meta, hero, 0, 7);
  assert.equal(run.character, hero);
  run.kind = 'battle';
  run.step = 3;
  const b = new Battle(null, run, meta, audio, () => {}, () => {});
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.invincible = 999;
  b.explosives = []; // a barrel on the way would add its own blast
  b.stats.regen = b.stats.thorns = b.stats.orbit = 0;
  return b;
}
// A target that stays where it is and takes a lot of damage.
function dummy(b, x, y, hp = 500) {
  const e = b.spawn(0, { force: true, x, y });
  e.speed = 0;
  e.timer = 999;
  e.affix = undefined; // an armoured roll would blur the numbers
  e.hp = e.max = hp;
  return e;
}

test('Every head of ОСББ has a different ability with a name, a text and a button word', () => {
  const ids = new Set();
  for (const c of D.CHARACTERS) {
    const a = H.HERO_ABILITIES[c.id];
    assert.ok(a, c.id);
    assert.ok(a.name && a.text && a.button && a.color.startsWith('#'), c.id);
    assert.ok(a.button.length <= 9, 'fits a touch button');
    ids.add(a.id);
  }
  assert.equal(ids.size, D.CHARACTERS.length);
  assert.equal(H.heroAbility('nobody').id, 'quake', 'an unknown hero gets the basic one');
});

test('A chain of lightning visits the nearest enemies in order and stops at the reach', () => {
  const e = (x, y, hp = 10) => ({ x, y, hp });
  const pool = [e(100, 0), e(250, 0), e(600, 0), e(420, 0), e(20, 500), e(300, 0, 0)];
  const hit = H.chainTargets({ x: 0, y: 0 }, pool, { first: 150, jump: 200, max: 6 });
  assert.deepEqual(hit.map((t) => t.x), [100, 250, 420, 600], 'dead and far ones are skipped');
  assert.equal(H.chainTargets({ x: 0, y: 0 }, pool, { first: 50, jump: 200, max: 6 }).length, 0);
  assert.equal(H.chainTargets({ x: 0, y: 0 }, pool, { first: 900, jump: 900, max: 2 }).length, 2);
  assert.deepEqual(H.chainTargets({ x: 0, y: 0 }, [], { first: 900, jump: 900, max: 6 }), []);
});

test('Петрович keeps the ring: it hits everything around the house and pushes it away', () => {
  const b = battle('mechanic');
  const near = dummy(b, b.x + 120, b.y),
    far = dummy(b, b.x + 400, b.y);
  const x0 = near.x;
  b.pulse();
  assert.equal(near.hp, 500 - b.stats.damage * H.QUAKE.damage);
  assert.equal(far.hp, 500, 'outside the ring');
  assert.ok(near.x > x0, 'shoved outward');
  assert.ok(b.pulseRing > 0);
  assert.ok(b.pulseCd > 0);
  const hp = near.hp;
  b.pulse();
  assert.equal(near.hp, hp, 'still cooling down');
});

test('Іскра: the discharge stuns up to six, weakens along the chain and draws an arc', () => {
  const b = battle('spark');
  const row = [0, 1, 2, 3, 4, 5, 6].map((i) => dummy(b, b.x + 100 + i * 80, b.y + 120));
  b.pulse();
  const hit = row.filter((e) => e.hp < 500);
  assert.equal(hit.length, H.DISCHARGE.max, 'at most six');
  assert.equal(row[6].hp, 500, 'the seventh is left out');
  for (const e of hit) assert.ok(e.stagger >= H.DISCHARGE.stagger - 1e-9, 'stunned');
  const dealt = hit.map((e) => 500 - e.hp);
  for (let i = 1; i < dealt.length; i++) assert.ok(dealt[i] < dealt[i - 1], 'weaker down the chain');
  assert.equal(b.arcs.length, 1);
  assert.equal(b.arcs[0].pts.length, 2 + 6 * 2);
  assert.equal(b.pulseRing, 0, 'no shock ring: that is the mechanic');
});

test('Іскра does not stun a boss, only hurts it', () => {
  const b = battle('spark');
  const boss = b.spawn(99, { force: true, x: b.x + 150, y: b.y });
  boss.speed = 0;
  const hp = boss.hp;
  b.pulse();
  assert.ok(boss.hp < hp);
  assert.ok(!boss.stagger, 'a boss keeps its own stagger rules');
});

test('Флора: the bloom heals the house and slows and pricks what is around it', () => {
  const b = battle('flora');
  b.run.hp = b.stats.health * 0.5;
  const near = dummy(b, b.x + 100, b.y),
    far = dummy(b, b.x + 500, b.y);
  b.pulse();
  assert.ok(Math.abs(b.run.hp - (b.stats.health * 0.5 + b.stats.health * H.BLOOM.heal)) < 1e-6);
  assert.ok(near.slow >= H.BLOOM.slow - 1e-9);
  assert.equal(near.hp, 500 - b.stats.damage * H.BLOOM.damage);
  assert.equal(far.hp, 500);
  assert.ok(!far.slow);
  // At full health nothing is wasted and nothing breaks.
  b.pulseCd = 0;
  b.run.hp = b.stats.health;
  b.pulse();
  assert.equal(b.run.hp, b.stats.health);
});

test('Борис: the audit takes a share of health, pays a few coins and raises coins from kills', () => {
  const b = battle('boris');
  const tough = dummy(b, b.x + 100, b.y, 1000),
    weak = dummy(b, b.x + 150, b.y, 100);
  const coins = b.run.coins;
  b.pulse();
  assert.ok(tough.hp < 1000 - b.stats.damage * H.AUDIT.damage, 'a share on top of the hit');
  assert.ok(Math.abs(1000 - tough.hp - (b.stats.damage * H.AUDIT.damage + 0.2 * 1000)) < 1e-6);
  assert.equal(b.run.coins, coins + 2, 'one coin per enemy hit');
  assert.ok(b.auditTime > 4.9);
  // Kills pay more while the audit runs, and the bonus is gone afterwards.
  b.combo = 0;
  let during = 0;
  for (let i = 0; i < 40; i++) during += b.comboCoins(1);
  b.auditTime = 0;
  b.combo = 0;
  b.comboCarry = 0;
  let after = 0;
  for (let i = 0; i < 40; i++) after += b.comboCoins(1);
  assert.equal(after, 40);
  assert.ok(during >= 59 && during <= 61, `x1.5 over 40 coins, got ${during}`);
  b.update(6);
  assert.equal(b.auditTime, 0);
  void weak;
});

test('The coin reward of the audit is capped so it cannot be farmed with a crowd', () => {
  const b = battle('boris');
  for (let i = 0; i < 12; i++) dummy(b, b.x + 60 + i * 12, b.y + (i % 3) * 20, 800);
  const coins = b.run.coins;
  b.pulse();
  assert.equal(b.run.coins - coins, H.AUDIT.cap);
});

test('Abilities with nobody around still cost the cooldown and never throw', () => {
  for (const c of D.CHARACTERS) {
    const b = battle(c.id);
    b.run.hp = b.stats.health;
    b.enemies = [];
    b.pulse();
    assert.ok(b.pulseCd > 0, c.id);
    assert.ok(Number.isFinite(b.run.hp) && Number.isFinite(b.run.coins), c.id);
  }
});
