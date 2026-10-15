// Living combat: headless fights with simple pilots keep the first location
// dangerous for a house that stands still, fair for one that moves, and the
// squads, leading shots, levels and boss staggers working as designed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const C = require('../.test-build/encounters.js');
const B = require('../.test-build/bosses.js');
const Mini = require('../.test-build/minibosses.js');
const { Battle, AudioEngine, xpNeed } = require('../.test-build/engine.js');
const { play } = require('../scripts/pilots.cjs');

const DT = 0.025;
const SEEDS = [3, 17, 41];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function battle({ chapter = 0, step = 0, kind = 'battle', seed = 3, variant }) {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', chapter, seed);
  run.page = 'combat';
  run.kind = kind;
  run.step = step;
  run.path = Array.from({ length: step + 1 }, () => 0);
  if (variant !== undefined) {
    run.bossVariants[chapter] = variant;
    run.minibossVariants[`${chapter}:${step}:0`] = variant;
  }
  const levels = [],
    beats = [];
  let result = null;
  const b = new Battle(
    null,
    run,
    meta,
    new AudioEngine(),
    () => {},
    (r) => (result = r),
    {
      onLevelUp: (level) => levels.push([level, b.elapsed]),
      onBeat: (beat) => beats.push(beat),
    },
  );
  return { b, levels, beats, result: () => result };
}
function fight(opts, pilot) {
  const f = battle(opts);
  const { beats } = f;
  const r = play(f.b, pilot, { seed: opts.seed ?? 3, dt: DT });
  assert.ok(r.ended, 'the fight must end');
  return {
    b: f.b,
    won: f.result().won,
    hp: r.hpPercent,
    secs: r.seconds,
    firstLevel: f.levels[0]?.[1] ?? null,
    levels: f.levels,
    phase2: r.phase2,
    beats,
  };
}
const sample = (opts, pilot) =>
  SEEDS.map((seed) => fight({ ...opts, seed }, pilot));

// One seed per squad of the location for a row, so no single template
// carries a threshold.
function squadSeeds(chapter, step) {
  const seeds = new Map();
  const count = C.encountersAt(chapter).length;
  for (let seed = 1; seeds.size < count && seed < 1000; seed++) {
    const id = C.encounterFor({ seed, chapter }, `${step}:0`).id;
    if (!seeds.has(id)) seeds.set(id, seed);
  }
  assert.equal(seeds.size, count);
  return [...seeds.values()];
}
const perSquad = (opts, pilot) =>
  squadSeeds(opts.chapter ?? 0, opts.step).map((seed) =>
    fight({ ...opts, seed }, pilot),
  );
const hps = (rs) => rs.map((r) => r.hp.toFixed(0)).join(',');

test('Location 1 hurts a house that stands still and is fair to one that moves', () => {
  // Before 0.11 an idle house ended step 3 at ~95% and the first fight at 99%.
  const idle = perSquad({ step: 3 }, 'idle');
  assert.ok(mean(idle.map((r) => r.hp)) < 50, `idle ch1 step 3: ${hps(idle)}`);
  assert.ok(
    idle.every((r) => r.hp < 80),
    `every squad bites a still house: ${hps(idle)}`,
  );
  // Blind circling used to end a location-1 elite at ~91%; reading the
  // telegraphs is what keeps the hull whole now.
  const elite = perSquad({ step: 4, kind: 'elite' }, 'circle');
  assert.ok(
    mean(elite.map((r) => r.hp)) < 80,
    `circle ch1 elite: ${hps(elite)}`,
  );
  const read = perSquad({ step: 4, kind: 'elite' }, 'reactive');
  assert.ok(read.every((r) => r.won));
  assert.ok(
    mean(read.map((r) => r.hp)) > mean(elite.map((r) => r.hp)) + 10,
    `reactive ch1 elite: ${hps(read)}`,
  );
  for (const pilot of ['reactive', 'circle']) {
    const first = sample({ step: 0 }, pilot);
    assert.ok(
      first.every((r) => r.won),
      `${pilot} must win the first fight`,
    );
    assert.ok(
      mean(first.map((r) => r.hp)) >= 60,
      `${pilot} ch1 step 0: ${hps(first)}`,
    );
  }
  // Standing still in the first fight costs real hull, but it is survivable.
  const opening = sample({ step: 0 }, 'idle');
  const lost = mean(opening.map((r) => 100 - r.hp));
  assert.ok(lost > 15, `idle ch1 step 0 loses ${lost.toFixed(0)}%`);
  assert.ok(
    opening.every((r) => r.won),
    `idle ch1 step 0: ${hps(opening)}`,
  );
});

test('Squad fights end when the squad breaks, with waves and a leader', () => {
  for (const seed of SEEDS) {
    const r = fight({ step: 0, seed }, 'reactive');
    const { b } = r;
    assert.equal(b.endReason, 'cleared', `seed ${seed}`);
    assert.ok(r.secs < b.duration, 'before the overtime clock');
    assert.ok(r.secs > 15 && r.secs < 45, `ch1 step 0 took ${r.secs}s`);
    assert.equal(b.wave, b.plan.length - 1, 'every wave was sent');
    assert.equal(b.plan.length, 4);
    assert.ok(b.squadKills >= b.quota);
    assert.ok(b.chief && b.chief.hp <= 0 && b.chief.chief);
    assert.equal(b.squadLeft(), 0);
    // Story hook: every wave, the leader and the end, in that order.
    const squad = b.encounter.id;
    assert.deepEqual(
      r.beats
        .filter((x) => x.kind !== 'event')
        .map((x) => [x.kind, x.wave ?? x.overtime ?? null, x.squad]),
      [
        ['wave', 1, squad],
        ['wave', 2, squad],
        ['wave', 3, squad],
        ['wave', 4, squad],
        ['chief', null, squad],
        ['broken', false, squad],
      ],
    );
  }
  // A house that never kills still gets out on the overtime clock.
  const { b, result } = battle({ step: 2 });
  b.stats.damage = 0;
  b.stats.health = b.run.hp = 1e6;
  while (!b.ended) b.update(0.05);
  assert.equal(b.endReason, 'overtime');
  assert.equal(result().won, true);
  assert.ok(b.elapsed >= b.duration);
});

test('Encounter templates: named, seeded, visible on the map before the fight', () => {
  const ids = new Set();
  for (let location = 0; location < 3; location++) {
    const pool = C.encountersAt(location);
    assert.equal(pool.length, 4);
    for (const t of pool) {
      assert.ok(!ids.has(t.id));
      ids.add(t.id);
      assert.ok(/[А-ЯІЇЄҐа-яіїєґ]/.test(t.name) && t.text.length > 20);
      assert.equal(t.waves.length, 3);
      const all = [...t.waves.flat(), ...t.final, t.leader, t.fodder];
      assert.ok(
        all.every((type) => C.LOCATIONS[location].enemyTypes.includes(type)),
      );
      // A shooter or bomber is there from the first wave on.
      assert.ok(
        t.waves[0].some((type) =>
          C.RANGED_BEHAVIORS.includes(C.ENEMY_DEFS[type].behavior),
        ),
        t.id,
      );
      const plan = C.encounterWaves(t, 0);
      assert.ok(plan[0].length >= 3 && plan[0].length <= 6);
      assert.ok(
        C.encounterWaves(t, 9, true).flat().length > plan.flat().length,
      );
    }
    assert.equal(
      C.encounterFor({ seed: 5, chapter: location }, '0:0'),
      pool[0],
    );
  }
  const run = M.makeRun(M.initialMeta(), 'mechanic', 1, 77);
  const seen = new Set();
  for (let row = 1; row < 9; row++)
    for (let col = 0; col < 4; col++) {
      const t = C.encounterFor(run, `${row}:${col}`);
      assert.equal(C.encounterFor(run, `${row}:${col}`), t, 'pure');
      assert.equal(t.location, 1);
      seen.add(t.id);
    }
  assert.ok(seen.size >= 3, 'a route mixes squads');
  // The battle fields exactly the squad the map promised.
  const { b } = battle({ chapter: 1, step: 4, seed: 77 });
  assert.equal(b.encounter, C.encounterFor(b.run, '4:0'));
  assert.equal(b.encounter.name.length > 0, true);
  for (const kind of ['boss', 'miniboss'])
    assert.equal(battle({ kind, step: 9 }).b.encounter, null);
});

test('XP flies home and the first level comes early; onLevelUp is called', () => {
  assert.equal(xpNeed(1), 12);
  assert.equal(xpNeed(2), 16);
  for (const pilot of ['idle', 'reactive']) {
    const r = fight({ step: 0, seed: 17 }, pilot);
    assert.ok(r.firstLevel !== null, `${pilot} levels up in fight 1`);
    assert.ok(r.firstLevel <= 20, `${pilot} first level at ${r.firstLevel}s`);
    assert.equal(r.levels[0][0], 2);
    assert.equal(r.b.run.level, 1 + r.levels.length);
  }
  // A crystal far from the house still arrives.
  const { b } = battle({ step: 0 });
  b.spawnTimer = 999;
  b.drops.push({ x: b.x + 450, y: b.y, kind: 'xp', value: 3 });
  for (let i = 0; i < 80; i++) b.update(DT);
  assert.equal(b.run.xp, 3);
});

test('Leading shooters aim where the house is going, with the aim fresh at release', () => {
  const { b } = battle({ step: 1 });
  b.spawnTimer = b.shotTimer = 999;
  b.invincible = 99;
  const make = (leads) => {
    const e = b.spawn(2, { force: true, affix: null, x: b.x, y: b.y - 250 });
    e.leads = leads;
    e.speed = 0;
    e.timer = 0;
    return e;
  };
  const leader = make(true),
    plain = make(false);
  plain.x = b.x + 30;
  // The house walks right at full speed.
  b.stick = { x: 1, y: 0 };
  for (let i = 0; i < 20; i++) b.update(DT);
  assert.ok(b.vx > b.stats.speed * 0.8, 'velocity estimate');
  // Both are winding up: the leader's aim point runs ahead of the house.
  assert.ok(leader.windup > 0 && plain.windup > 0);
  assert.ok(leader.targetX > b.x + 60, `${leader.targetX} vs ${b.x}`);
  assert.ok(Math.abs(plain.targetX - b.x) < 10);
  const before = b.bullets.length;
  while (plain.windup > 0) b.update(DT);
  const shots = b.bullets
    .slice(before)
    .filter((s) => s.enemy && Math.abs(s.x - plain.x) < 15);
  assert.equal(shots.length, 3);
  // The middle shot of the plain shooter points at the house of ~AIM_LOCK
  // ago, not at where it stood when the windup began.
  const mid = shots[1],
    aim = Math.atan2(mid.vy, mid.vx),
    fresh = Math.atan2(b.y - plain.y, b.x - 0.2 * b.stats.speed - plain.x),
    stale = Math.atan2(b.y - plain.y, b.x - 0.85 * b.stats.speed - plain.x);
  assert.ok(Math.abs(aim - fresh) < Math.abs(aim - stale));
  assert.ok(Math.abs(aim - fresh) < 0.12);
});

test('Small ground zones arm in about half a second and mark their spot', () => {
  for (const [chapter, type] of [
    [0, 9],
    [1, 3],
    [1, 4],
  ]) {
    const { b } = battle({ chapter, step: 1 });
    b.spawnTimer = b.shotTimer = 999;
    const e = b.spawn(type, { force: true, affix: null, x: b.x + 200, y: b.y });
    e.speed = 0;
    e.timer = 0;
    b.update(DT);
    assert.ok(e.windup > 0);
    assert.ok(Math.abs(e.targetX - b.x) < 1, 'marked under a still house');
    const count = b.hazards.length;
    while (e.windup > 0) b.update(DT);
    const zone = b.hazards.slice(count).find((h) => h.x2 === undefined);
    assert.ok(zone, C.ENEMY_DEFS[type].name);
    assert.ok(zone.age >= -0.6 && zone.age <= -0.45 + DT, String(zone.age));
  }
});

test('Shield bearers turn slowly, so their flank is open', () => {
  const { b } = battle({ chapter: 2, step: 1 });
  b.spawnTimer = b.shotTimer = 999;
  b.invincible = 99;
  const e = b.spawn(7, { force: true, affix: null, x: b.x + 300, y: b.y });
  e.speed = 0;
  b.update(DT);
  assert.ok(Math.abs(Math.abs(e.aim) - Math.PI) < 0.05, 'faces the house');
  // The house jumps to the other side: the shield lags behind.
  b.x = e.x + 300;
  const start = e.aim;
  for (let i = 0; i < 20; i++) b.update(DT);
  const turned = Math.abs(
    Math.atan2(Math.sin(e.aim - start), Math.cos(e.aim - start)),
  );
  assert.ok(turned <= 1.5 * 0.5 + 1e-6, `turned ${turned}`);
  assert.ok(turned > 0.5);
  // A shot from behind is not blocked; a frontal one is.
  const back = e.hp;
  b.damage(e, 10, false, Math.atan2(e.y - b.y, e.x - b.x));
  assert.ok(Math.abs(back - e.hp - 10) < 1e-9, 'flank hit lands in full');
  e.aim = Math.atan2(b.y - e.y, b.x - e.x);
  const front = e.hp;
  b.damage(e, 10, false, Math.atan2(e.y - b.y, e.x - b.x));
  assert.ok(Math.abs(front - e.hp - 5.5) < 1e-9, 'frontal hit is halved');
});

test('Heavy slams stagger bosses: +50% damage, no movement, attack held', () => {
  for (let location = 0; location < 3; location++)
    for (let variant = 0; variant < 3; variant++) {
      const names = new Set(),
        furious = new Set();
      let staggers = 0;
      for (let beat = 0; beat < 12; beat++) {
        const calm = C.campaignBossPattern(
          location,
          variant,
          0,
          beat,
          700,
          450,
          900,
          550,
          120,
          0,
        );
        names.add(calm.name);
        if (calm.stagger) staggers++;
        furious.add(
          C.campaignBossPattern(location, variant, 1, beat, 700, 450, 900, 550)
            .name,
        );
      }
      const def = C.campaignBoss(location, variant);
      assert.ok(names.size >= 3, `${def.name}: ${[...names]}`);
      assert.ok(
        [...furious].some((n) => !names.has(n)),
        `${def.name} has a phase-two move`,
      );
      assert.ok(staggers > 0, `${def.name} has a slam`);
    }
  // Health: bosses of locations 2-3 are shorter fights now.
  assert.ok(C.campaignBoss(1, 0).health <= 6000);
  assert.ok(C.campaignBoss(2, 0).health <= 10500);
  const { b, beats } = battle({ chapter: 0, kind: 'boss', step: 9 });
  b.update(DT);
  const boss = b.enemies.find((e) => e.type === 99);
  b.invincible = 99;
  boss.pendingBoss = {
    name: 'Удар',
    cooldown: 2,
    shots: [],
    hazards: [],
    summons: [],
    stagger: 1,
  };
  b.enemyAttack(boss);
  assert.ok(boss.staggerAt > b.elapsed);
  while (!boss.stagger) b.update(DT);
  assert.deepEqual(beats.at(-1), {
    kind: 'stagger',
    leader: { kind: 'boss', location: 0, variant: b.run.bossVariants[0] },
  });
  assert.ok(boss.stagger > B.STAGGER_TIME - 2 * DT);
  const timer = boss.timer,
    x = boss.x,
    hp = boss.hp;
  b.damage(boss, 100);
  assert.ok(Math.abs(hp - boss.hp - 150) < 1e-9);
  for (let i = 0; i < 20; i++) b.update(DT);
  assert.equal(boss.x, x, 'stands still');
  assert.equal(boss.timer, timer, 'next attack held');
  for (let i = 0; i < 70; i++) b.update(DT);
  assert.equal(boss.stagger, 0);
  const again = boss.hp;
  b.damage(boss, 100);
  assert.ok(Math.abs(again - boss.hp - 100) < 1e-9);
});

test('Minibosses live long enough for their second phase and its extra move', () => {
  for (let chapter = 0; chapter < 3; chapter++)
    for (let variant = 0; variant < 3; variant++) {
      const extra = Mini.minibossPattern(
        chapter,
        1,
        2,
        500,
        350,
        850,
        600,
        variant,
      );
      assert.ok(extra.stagger > 0, 'phase-two slam');
      for (const beat of [0, 1])
        assert.notEqual(
          Mini.minibossPattern(chapter, 0, beat, 500, 350, 850, 600, variant)
            .name,
          extra.name,
        );
    }
  const runs = [0, 1, 2].map((variant) =>
    fight({ step: 5, kind: 'miniboss', variant }, 'reactive'),
  );
  for (const r of runs) {
    assert.ok(r.won, 'the moving bot beats the location-1 miniboss');
    assert.ok(r.phase2 !== null, 'reaches phase two');
    assert.ok(r.secs >= 25 && r.secs <= 60, `took ${r.secs.toFixed(1)}s`);
  }
});

test('Loose coins bank at half value; fresh drops and pickups in full', () => {
  const { b } = battle({ step: 1 });
  b.spawnTimer = 999;
  const coins = b.run.coins;
  b.drops.push(
    { x: b.x + 400, y: b.y, kind: 'coin', value: 10, t: 5 },
    { x: b.x + 400, y: b.y + 40, kind: 'coin', value: 4, t: 0.5 },
    { x: b.x + 400, y: b.y + 80, kind: 'xp', value: 2, t: 0 },
  );
  b.bankLoose();
  assert.equal(b.run.coins, coins + 5 + 4);
  assert.equal(b.run.xp, 2);
  assert.ok(b.drops.every((d) => d.value === 0));
});

test('Mid-battle events come in half of the fights and start on kills too', () => {
  let events = 0;
  for (let seed = 1; seed <= 200; seed++)
    if (battle({ seed, step: 3 }).b.event) events++;
  assert.ok(events > 70 && events < 130, String(events));
  for (let seed = 1; seed < 500; seed++) {
    const { b } = battle({ seed, step: 3 });
    if (!b.event) continue;
    assert.ok(b.event.kills >= 1 && b.event.kills <= b.quota);
    b.spawnTimer = 999;
    b.squadKills = b.event.kills;
    b.update(DT);
    assert.equal(b.event.state, 'live', 'kills start it before the clock');
    assert.ok(b.elapsed < b.event.at);
    return;
  }
  assert.fail('no event seed');
});

test('Heat still scales squads: more bodies, quicker packs; heat 0 exact', () => {
  const cold = battle({ step: 4, seed: 9 }).b,
    hot = (() => {
      const meta = M.initialMeta(),
        run = M.makeRun(meta, 'mechanic', 0, 9, { heat: 6 });
      run.kind = 'battle';
      run.step = 4;
      run.path = [0, 0, 0, 0, 0];
      return new Battle(
        null,
        run,
        meta,
        new AudioEngine(),
        () => {},
        () => {},
      );
    })();
  assert.equal(cold.encounter, hot.encounter);
  assert.ok(hot.squadTotal > cold.squadTotal);
  assert.deepEqual(
    cold.plan,
    C.encounterWaves(cold.encounter, 4, false, 1),
    'heat 0 adds nothing',
  );
});
