const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const U = require('../.test-build/upgrades.js');
const B = require('../.test-build/barks.js');
const { Battle } = require('../.test-build/engine.js');

const audio = { play() {}, setLayer() {}, setPaused() {} };
function battle(opts = {}) {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, opts.seed ?? 7);
  run.kind = 'battle';
  run.step = 3;
  run.perks = opts.perks ?? [];
  const b = new Battle(null, run, meta, audio, () => {}, () => {}, opts.options);
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  return b;
}
function dummy(b, x, y) {
  const e = b.spawn(0, { force: true, x, y });
  e.speed = 0;
  e.timer = 999;
  e.hp = e.max = 500;
  return e;
}

test('Perk offers are three different, seeded and skip maxed perks', () => {
  const a = U.perkOffers({ perks: [] }, 42),
    again = U.perkOffers({ perks: [] }, 42);
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  assert.deepEqual(a, again);
  const maxed = U.PERKS.filter((p) => p.id !== 'tea').flatMap((p) =>
    Array(p.max).fill(p.id),
  );
  assert.deepEqual(U.perkOffers({ perks: maxed }, 3), ['tea']);
  for (const p of U.PERKS) {
    assert.ok(p.name && p.text, p.id);
    assert.ok(B.perkOfferLine(p.owner, p.id, { level: 3, perks: [] }), p.owner);
  }
});

test('Stat perks feed statsFor for every later battle', () => {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 5),
    base = M.statsFor(run, meta);
  run.perks = ['tea', 'tea', 'loud_voice', 'searchlight'];
  const perked = M.statsFor(run, meta);
  assert.equal(perked.health, base.health + 50);
  assert.equal(perked.range, base.range + 70);
  assert.ok(perked.rate > base.rate * 1.1);
});

test('Without a handler a level-up keeps the old reward and drafts nothing', () => {
  const b = battle();
  b.run.xp = 999;
  b.update(1 / 60);
  assert.equal(b.run.level, 2);
  assert.deepEqual(b.run.perks, []);
  assert.equal(b.drafting, null);
});

test('A draft holds the fight until a card is taken, and queued levels follow', () => {
  const offers = [];
  const b = battle({ options: { onPerkDraft: (o) => offers.push(o) } });
  b.run.xp = 999;
  b.update(1 / 60);
  assert.equal(offers.length, 1);
  assert.ok(b.drafting);
  const t = b.elapsed;
  b.tick(0.5);
  assert.equal(b.elapsed, t, 'the arena waits while the cards are shown');
  b.pendingLevels++;
  b.choosePerk('nonsense');
  assert.ok(b.drafting, 'only an offered card can be taken');
  b.choosePerk(offers[0][0]);
  assert.deepEqual(b.run.perks, [offers[0][0]]);
  assert.equal(offers.length, 2, 'the second queued level opens a new draft');
  b.choosePerk(offers[1][0]);
  assert.equal(b.drafting, null);
  assert.equal(b.run.perks.length, 2);
  // A short hit-stop marks the pick, then the fight runs again.
  b.tick(0.1);
  b.tick(0.02);
  assert.ok(b.elapsed > t);
});

test('In co-op each house takes its own perk: the fight waits for both', () => {
  const meta = { ...M.initialMeta(), wins: 8 },
    run = M.makeRun(meta, 'mechanic', 0, 7, { coop: 'flora' });
  run.kind = 'battle';
  run.step = 3;
  const drafts = [];
  const b = new Battle(null, run, meta, audio, () => {}, () => {}, {
    onPerkDraft: (offers, level, mateOffers) => drafts.push({ offers, mateOffers }),
  });
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  const range = { house: b.stats.range, mate: b.mateStats.range };
  b.run.xp = 999;
  b.update(1 / 60);
  assert.equal(drafts.length, 1);
  assert.ok(drafts[0].mateOffers?.length === 3, 'the second house has its own three cards');
  b.choosePerk(drafts[0].offers[0]);
  assert.ok(b.choosing, 'the first pick alone does not resume the fight');
  const t = b.elapsed;
  b.tick(0.3);
  assert.equal(b.elapsed, t);
  b.chooseMatePerk('nonsense');
  assert.ok(b.mateDrafting, 'only an offered card can be taken');
  // The second house takes a perk the first one did not: only its stats change.
  const pick = drafts[0].mateOffers.find((id) => id !== drafts[0].offers[0]);
  b.chooseMatePerk(pick);
  assert.ok(!b.choosing);
  assert.deepEqual(b.run.perks, [drafts[0].offers[0]]);
  assert.deepEqual(b.run.mate.perks, [pick]);
  const mateOnly = M.statsFor(M.mateRun(b.run), meta);
  assert.deepEqual(b.mateStats, mateOnly);
  if (pick === 'searchlight') assert.equal(b.mateStats.range, range.mate + 70);
  if (drafts[0].offers[0] !== 'searchlight') assert.equal(b.stats.range, range.house);
  b.tick(0.1);
  b.tick(0.02);
  assert.ok(b.elapsed > t, 'then the fight runs again');
});

test("The second house's own perks act on the partner: blanket, second wind, saws", () => {
  const meta = { ...M.initialMeta(), wins: 8 },
    run = M.makeRun(meta, 'mechanic', 0, 7, { coop: 'flora' });
  run.kind = 'battle';
  run.mate = { ...run.mate, perks: ['blanket', 'second_wind', 'patrol'] };
  const b = new Battle(null, run, meta, audio, () => {}, () => {}, {});
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  const a = b.ally;
  assert.equal(a.shields, 1, 'the blanket stops one blow');
  assert.equal(b.hurtAlly(30, 0, 0), 0);
  assert.equal(a.hp, a.max);
  b.hurtAlly(a.max + 50, 0, 0);
  assert.ok(!a.down && a.hp > 0, 'the second wind keeps the partner up once');
  b.hurtAlly(a.max + 50, 0, 0);
  assert.ok(a.down, 'but only once a fight');
  assert.equal(b.mateStats.orbit, b.stats.orbit + 1, 'the saw is the second house’s');
  assert.equal(b.pk('blanket'), 0, 'and none of it is the first house’s');
});

test('Balance bots take the first offer at once', () => {
  const b = battle({ options: { autoPerks: true } });
  b.run.xp = 999;
  b.update(1 / 60);
  assert.equal(b.run.perks.length, 1);
  assert.equal(b.drafting, null);
  // Two houses: both take one.
  const meta = { ...M.initialMeta(), wins: 8 },
    run = M.makeRun(meta, 'mechanic', 0, 7, { coop: 'flora' });
  run.kind = 'battle';
  const duo = new Battle(null, run, meta, audio, () => {}, () => {}, { autoPerks: true });
  duo.spawnTimer = duo.shotTimer = duo.droneTimer = 999;
  duo.run.xp = 999;
  duo.update(1 / 60);
  assert.equal(duo.run.perks.length, 1);
  assert.equal(duo.run.mate.perks.length, 1);
  assert.ok(!duo.choosing);
});

test('Скарга № 311 pierces and Рикошет jumps to another enemy', () => {
  const b = battle({ perks: ['complaint'] });
  const first = dummy(b, b.x + 100, b.y),
    second = dummy(b, b.x + 160, b.y);
  b.shoot(b.x, b.y, first);
  for (let i = 0; i < 30; i++) b.update(1 / 60);
  assert.ok(first.hp < 500 && second.hp < 500, 'one bullet hit both');
  const r = battle({ perks: ['ricochet'] });
  const a = dummy(r, r.x + 100, r.y),
    side = dummy(r, r.x + 100, r.y + 150);
  r.shoot(r.x, r.y, a);
  for (let i = 0; i < 40; i++) r.update(1 / 60);
  assert.ok(a.hp < 500 && side.hp < 500, 'the bullet bounced');
});

test('Спори burn over time; Друге дихання saves the house once', () => {
  const b = battle({ perks: ['spores'] });
  const e = dummy(b, b.x + 100, b.y);
  b.shoot(b.x, b.y, e);
  for (let i = 0; i < 12; i++) b.update(1 / 60);
  const afterHit = e.hp;
  assert.ok(e.burn > 0);
  for (let i = 0; i < 60; i++) b.update(1 / 60);
  assert.ok(e.hp < afterHit, 'it kept burning');
  const w = battle({ perks: ['second_wind'] });
  w.run.hp = -5;
  w.update(1 / 60);
  assert.equal(w.ended, false);
  assert.ok(w.run.hp > 0);
  w.invincible = 0;
  w.run.hp = -5;
  w.update(1 / 60);
  assert.equal(w.ended, true);
});

test('Perks survive a save and unknown ids are dropped', () => {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 9);
  run.perks = ['tea', 'arc', 'tea'];
  const back = M.readSave(M.saveData(meta, run));
  assert.deepEqual(back.run.perks, ['tea', 'arc', 'tea']);
  const raw = JSON.parse(M.saveData(meta, run));
  raw.run.perks = ['tea', 'hack', 5];
  delete raw.meta.fresh;
  assert.deepEqual(M.readSave(JSON.stringify(raw)).run.perks, ['tea']);
  const old = JSON.parse(M.saveData(meta, run));
  delete old.run.perks;
  assert.deepEqual(M.readSave(JSON.stringify(old)).run.perks, []);
});
