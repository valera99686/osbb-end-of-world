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
  meta.wins = 9;
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

test('Nine heads of ОСББ: later ones need more finished expeditions, a start item and a voice', () => {
  const Story = require('../.test-build/story.js');
  const V = require('../.test-build/voice.js');
  const R = require('../.test-build/residents.js');
  assert.equal(D.CHARACTERS.length, 9);
  let last = 0;
  for (const c of D.CHARACTERS) {
    assert.ok(c.win >= last, 'unlocks never go back: ' + c.id);
    last = c.win;
    assert.ok(D.ITEM_BY_ID[c.start], 'start item exists: ' + c.id);
    assert.ok(R.RESIDENT_BY_ID[c.id], 'is a resident with a portrait: ' + c.id);
    assert.ok(Story.CAPTAINS[c.id]?.name && Story.CAPTAINS[c.id]?.voc, 'has a name for the lines: ' + c.id);
    assert.ok(V.HEAD_VOICES.includes(c.id), 'has a captain voice: ' + c.id);
  }
  const fresh = M.initialMeta();
  assert.equal(M.makeRun(fresh, 'solomia', 0, 3).character, 'mechanic', 'locked heads fall back');
  fresh.wins = 7;
  assert.equal(M.makeRun(fresh, 'solomia', 0, 3).character, 'mechanic', 'the last one needs eight');
  assert.equal(M.makeRun(fresh, 'danilo', 0, 3).character, 'danilo');
  assert.equal(M.makeRun(fresh, 'nina', 0, 3).character, 'nina');
  fresh.wins = 8;
  assert.equal(M.makeRun(fresh, 'solomia', 0, 3).character, 'solomia');
});

test('Every head can really be unlocked: the wins counter reaches the highest threshold and saves keep it', () => {
  const top = Math.max(...D.CHARACTERS.map((c) => c.win));
  let meta = M.initialMeta();
  for (let i = 0; i < top + 3; i++) {
    const run = M.makeRun(meta, 'mechanic', 2, 17 + i);
    run.kind = 'boss';
    run.bossesDefeated = 2;
    run.step = run.nodes.length - 1;
    meta = M.finishRun(meta, run, true).meta;
  }
  assert.ok(meta.wins >= top, 'wins reached ' + meta.wins + ' of ' + top);
  assert.equal(M.readSave(M.saveData(meta, null)).meta.wins, meta.wins, 'and the save keeps it');
  for (const c of D.CHARACTERS) assert.equal(M.makeRun(meta, c.id, 0, 3).character, c.id);
});

test('Personal bonuses of the new heads show in the stats; Марта starts every fight with a shield', () => {
  const meta = M.initialMeta();
  meta.wins = 9;
  const stat = (hero) => M.statsFor(M.makeRun(meta, hero, 0, 5), meta);
  const R = require('../.test-build/residents.js');
  const item = (id, key) => D.ITEM_BY_ID[id].stats[key] ?? 0;
  const own = (id, key) => R.RESIDENT_BY_ID[id].stats[key] ?? 0;
  // Hero bonus + the resident's own room + the three start items (cannon, legs, own).
  assert.ok(Math.abs(stat('nina').regen - (0.5 + own('nina', 'regen') + item('kitchen', 'regen'))) < 1e-9, 'Нінина кухня');
  assert.equal(stat('lev').damage, 16 + 4 + own('lev', 'damage') + item('cannon', 'damage'));
  // The courier has a one-room apartment: the cannon is installed, the legs and rails wait in the backpack.
  assert.equal(stat('danilo').speed, 155 + 20 + own('danilo', 'speed'));
  const courier = M.makeRun(meta, 'danilo', 0, 5);
  assert.deepEqual(courier.items.filter(Boolean), ['cannon']);
  assert.deepEqual(courier.backpack.map((i) => i.id).sort(), ['courier_rails', 'engine']);
  assert.equal(new Set(courier.backpack.map((i) => i.uid)).size, 2);
  assert.ok(courier.nextBagId > Math.max(...courier.backpack.map((i) => i.uid)));
  for (const hero of ['nina', 'lev', 'marta']) {
    const r = M.makeRun(meta, hero, 0, 5);
    assert.equal(r.items.filter(Boolean).length, 2, hero + ': cannon and the own item');
    assert.deepEqual(r.backpack.map((i) => i.id), ['engine'], hero);
  }
  for (const hero of ['mechanic', 'solomia'])
    assert.equal(M.makeRun(meta, hero, 0, 5).items.filter(Boolean).length, 3, hero);
  assert.equal(stat('solomia').range, 410 + 60 + item('rescue_beacon', 'range'));
  assert.equal(battle('marta').shieldCharges, 1);
  assert.equal(battle('mechanic').shieldCharges, 0);
});

test('Ніна: the scald sets everyone around on fire and leaves the far ones alone', () => {
  const b = battle('nina');
  const near = dummy(b, b.x + 150, b.y),
    far = dummy(b, b.x + 400, b.y);
  b.pulse();
  assert.ok(b.pulseCd > 0);
  assert.ok(near.hp < near.max, 'the splash hits');
  assert.ok(near.burn >= H.SCALD.seconds - 1e-9 && near.burnDps > 0, 'and it burns');
  assert.equal(far.hp, far.max);
  assert.ok(!far.burn);
  const hp = near.hp;
  for (let i = 0; i < 60; i++) b.update(1 / 60);
  assert.ok(near.hp < hp, 'burning goes on after the splash');
});

test('Микола: sixteen bullets leave in a ring and pass through the first enemy', () => {
  const b = battle('lev');
  const before = b.bullets.length;
  const near = dummy(b, b.x + 60, b.y, 5000);
  b.pulse();
  const fired = b.bullets.slice(before);
  assert.equal(fired.length, H.VOLLEY.count);
  assert.ok(fired.every((x) => !x.enemy && x.pierce === H.VOLLEY.pierce));
  const speed = Math.hypot(fired[0].vx, fired[0].vy);
  assert.ok(Math.abs(speed - H.VOLLEY.speed) < 1e-6);
  const angles = fired.map((x) => Math.atan2(x.vy, x.vx));
  assert.ok(new Set(angles.map((a) => a.toFixed(3))).size === H.VOLLEY.count, 'all different directions');
  for (let i = 0; i < 20; i++) b.update(1 / 60);
  assert.ok(near.hp < near.max, 'the ring reaches an enemy next to the house');
});

test('Марта: two shields up to the cap, a bit of healing, and a full house says so', () => {
  const b = battle('marta');
  b.run.hp = b.stats.health * 0.5;
  const hp = b.run.hp;
  b.pulse();
  assert.equal(b.shieldCharges, 1 + H.WARD.charges);
  assert.ok(b.run.hp > hp && b.run.hp <= hp + b.stats.health * H.WARD.heal + 1e-9);
  b.pulseCd = 0;
  b.pulse();
  assert.equal(b.shieldCharges, H.WARD.cap, 'capped');
  b.pulseCd = 0;
  b.pulse();
  assert.equal(b.shieldCharges, H.WARD.cap, 'still capped');
  assert.ok(b.particles.some((p) => p.text === 'ЩИТ ПОВНИЙ'));
  // A shield really blocks a hit.
  b.invincible = 0;
  const safe = b.run.hp;
  b.receiveHit(30);
  assert.equal(b.run.hp, safe);
  assert.equal(b.shieldCharges, H.WARD.cap - 1);
});

test('Данило: the express gives a fresh dash, brief safety and 40% more speed for four seconds', () => {
  const run = (express) => {
    const b = battle('danilo');
    b.invincible = 0;
    if (express) {
      b.dashCd = 4;
      b.pulse();
      assert.equal(b.dashCd, 0);
      assert.ok(b.invincible >= H.EXPRESS.guard - 1e-9);
      assert.equal(b.hasteTime, H.EXPRESS.seconds);
    }
    b.keys.add('KeyD');
    const x0 = b.x;
    for (let i = 0; i < 20; i++) b.update(1 / 60);
    return { dx: b.x - x0, b };
  };
  const plain = run(false),
    fast = run(true);
  assert.ok(Math.abs(fast.dx / plain.dx - H.EXPRESS.haste) < 0.02, 'ratio ' + fast.dx / plain.dx);
  for (let i = 0; i < 300; i++) fast.b.update(1 / 60);
  assert.equal(fast.b.hasteTime, 0, 'it runs out');
});

test('Соломія: the jam removes hostile bullets nearby and stuns the yard but spares the far side', () => {
  const b = battle('solomia');
  const shot = (x, y) => ({ x, y, vx: 0, vy: 0, life: 5, damage: 10, enemy: true, crit: false });
  const nearShot = shot(b.x + 200, b.y),
    farShot = shot(b.x + 900, b.y),
    mine = { ...shot(b.x + 100, b.y), enemy: false };
  b.bullets.push(nearShot, farShot, mine);
  const near = dummy(b, b.x + 250, b.y),
    far = dummy(b, b.x + 800, b.y);
  b.pulse();
  assert.equal(nearShot.life, 0);
  assert.equal(farShot.life, 5);
  assert.equal(mine.life, 5, 'our own bullets stay');
  assert.ok(near.stagger >= H.JAM.stagger - 1e-9);
  assert.ok(!far.stagger);
  assert.ok(near.hp < near.max);
});

test('The daily run can pick any head that is open, the new ones included', () => {
  const Modes = require('../.test-build/modes.js');
  const meta = M.initialMeta();
  meta.wins = 9;
  const seen = new Set();
  for (let d = 1; d <= 28; d++) seen.add(Modes.dailySetup('2026-11-' + String(d).padStart(2, '0'), meta).character);
  assert.ok(seen.size >= 6, [...seen].join());
  assert.ok([...seen].some((id) => ['nina', 'lev', 'marta', 'danilo', 'solomia'].includes(id)));
  meta.wins = 0;
  for (let d = 1; d <= 28; d++) assert.equal(Modes.dailySetup('2026-11-' + String(d).padStart(2, '0'), meta).character, 'mechanic');
});
