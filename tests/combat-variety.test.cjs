const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const Modes = require('../.test-build/modes.js');
const Arena = require('../.test-build/arena.js');
const { ENEMY_DEFS } = require('../.test-build/encounters.js');
const { Battle, COMBO_WINDOW } = require('../.test-build/engine.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
function battle(opts = {}) {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', opts.chapter ?? 0, opts.seed ?? 5, {
      heat: opts.heat ?? 0,
    });
  run.kind = opts.kind ?? 'battle';
  run.step = opts.step ?? 4;
  const sfx = [];
  let result = null;
  const b = new Battle(
    null,
    run,
    meta,
    {
      play: (kind) => sfx.push(kind),
      setLayer: () => {},
      setPaused: () => {},
    },
    () => {},
    (r) => (result = r),
  );
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.thorns = b.stats.orbit = b.stats.drones = 0;
  return { b, sfx, result: () => result };
}
// A spawned enemy parked away from the house, unable to reach it.
function dummy(b, type = 0, affix = null, x = b.x + 300, y = b.y) {
  const e = b.spawn(type, { affix, force: true, x, y });
  e.speed = 0;
  e.timer = 999;
  return e;
}
function eventSeed(id, step = 3) {
  for (let seed = 1; seed < 5000; seed++) {
    const { b } = battle({ seed, step });
    if (b.event?.id === id) return b;
  }
  throw new Error('no seed for ' + id);
}

test('Heat 0 leaves enemy stats exact; higher heat makes enemies tougher', () => {
  const cold = battle({ heat: 0 }).b,
    hot = battle({ heat: 5 }).b,
    max = battle({ heat: 10 }).b;
  assert.deepEqual(cold.heat, Modes.heatEffects(0));
  const def = ENEMY_DEFS[0],
    base = def.health * (1 + 4 * 0.025);
  const a = dummy(cold),
    h = dummy(hot),
    m = dummy(max);
  assert.equal(a.max, base);
  assert.equal(cold.spawn(0, { affix: null, force: true }).speed, def.speed);
  assert.ok(close(h.max, base * 1.25));
  assert.ok(close(m.max, base * 1.55));
  assert.ok(max.spawn(0, { affix: null, force: true }).speed > def.speed);
  assert.equal(cold.threat(10), 10);
  assert.ok(close(hot.threat(10), 13.5));
  // Contact damage under heat: the same touch costs more hull.
  const touch = (b) => {
    const e = dummy(b, 0, null, b.x + 5, b.y);
    e.hp = e.max = 1e6;
    b.invincible = 0;
    const hp = b.run.hp;
    b.update(0.001);
    return hp - b.run.hp;
  };
  const coldHit = touch(battle({ heat: 0 }).b),
    hotHit = touch(battle({ heat: 5 }).b);
  assert.equal(coldHit, Math.max(2, def.contactDamage - cold.stats.armor));
  assert.ok(hotHit > coldHit);
  // Spawn frequency: heat 6 spawns 30% more often.
  const spawnGap = (b) => {
    b.spawnTimer = 0;
    b.update(0.001);
    return b.spawnTimer;
  };
  const gap0 = spawnGap(battle({ heat: 0 }).b),
    gap6 = spawnGap(battle({ heat: 6 }).b);
  assert.ok(close(gap0 / gap6, 1.3, 1e-3));
});

test('Heat speeds up boss cooldowns and enemy projectiles; heat 0 is exact', () => {
  for (const [heat, cooldown, speed] of [
    [0, 2, 100],
    [10, 2 * 0.85, 115],
  ]) {
    const { b } = battle({ heat, kind: 'boss', step: 9 });
    b.update(0.001);
    const boss = b.enemies.find((e) => e.type === 99);
    boss.pendingBoss = {
      name: 'test',
      cooldown: 2,
      shots: [{ angle: 0, speed: 100, damage: 5 }],
      hazards: [],
      summons: [],
    };
    const before = b.bullets.length;
    b.enemyAttack(boss);
    assert.ok(close(boss.timer, cooldown));
    assert.ok(close(b.bullets[before].vx, speed));
  }
});

test('Affix rolls are seeded, never at step 0-1 or in leader fights', () => {
  const roll = (step, seed = 9) => {
    const { b } = battle({ step, seed });
    const out = [];
    for (let i = 0; i < 300; i++)
      out.push(b.spawn(undefined, { force: true })?.affix ?? null);
    return out;
  };
  assert.ok(roll(0).every((a) => a === null));
  assert.ok(roll(1).every((a) => a === null));
  const a = roll(6),
    again = roll(6);
  assert.deepEqual(a, again);
  const share = a.filter(Boolean).length / a.length;
  assert.ok(share > 0.04 && share < 0.3, String(share));
  assert.notDeepEqual(a, roll(6, 10));
  for (const kind of ['boss', 'miniboss']) {
    const { b } = battle({ kind, step: 9 });
    b.update(0.001);
    for (let i = 0; i < 40; i++) b.spawn(0, { force: true });
    assert.ok(b.enemies.every((e) => !e.affix));
  }
});

test('Affixes: armour, speed, splitting, blasts, healing and magnetism', () => {
  const { b, sfx } = battle();
  const plain = dummy(b),
    armored = dummy(b, 0, 'armored'),
    swift = b.spawn(0, { affix: 'swift', force: true });
  assert.ok(close(armored.max, plain.max * 1.6));
  assert.ok(close(swift.speed, ENEMY_DEFS[0].speed * 1.45));
  const hp = armored.hp;
  b.damage(armored, 10);
  assert.ok(close(hp - armored.hp, 7.5));

  const kills = b.run.elitesKilled;
  const splitter = dummy(b, 0, 'splitter');
  const count = b.enemies.length;
  b.damage(splitter, 1e6);
  const halves = b.enemies.slice(count);
  assert.equal(halves.length, 2);
  for (const half of halves) {
    assert.ok(half.split && !half.affix && half.scale < 1);
    assert.ok(close(half.max, splitter.max * 0.4));
  }
  assert.equal(b.run.elitesKilled, kills + 1);
  assert.ok(sfx.includes('eliteKill'));
  b.damage(halves[0], 1e6);
  assert.equal(b.enemies.filter((e) => e.hp > 0).length, count);

  const volatile = dummy(b, 0, 'volatile');
  const coins = b.drops.filter((d) => d.kind === 'coin').length;
  b.damage(volatile, 1e6);
  const blast = b.hazards.at(-1);
  assert.ok(blast.blast && blast.age < -0.5 && blast.radius > 60);
  // Guaranteed coin drop on top of the usual roll.
  assert.ok(b.drops.filter((d) => d.kind === 'coin').length > coins);

  const medic = dummy(b, 0, 'medic');
  const hurt = dummy(b, 0, null, medic.x + 60, medic.y);
  hurt.hp = hurt.max * 0.5;
  b.update(1);
  assert.ok(close(hurt.hp, hurt.max * 0.53, 1e-3), String(hurt.hp / hurt.max));

  const { b: field } = battle();
  const magnet = dummy(field, 0, 'magnetic', field.x + 200, field.y + 80);
  field.bullets.push({
    x: field.x + 100,
    y: field.y,
    vx: 540,
    vy: 0,
    life: 1,
    damage: 1,
    enemy: false,
    crit: false,
  });
  const shot = field.bullets.at(-1);
  field.update(0.05);
  assert.ok(shot.vy > 0, 'bullet bends toward the magnet');
  assert.ok(close(Math.hypot(shot.vx, shot.vy), 540));
  assert.equal(magnet.affix, 'magnetic');
});

test('Combo counts kills, scales coins, chimes every fifth and resets', () => {
  const { b, sfx, result } = battle();
  assert.equal(b.comboCoins(3), 3);
  for (let i = 0; i < 12; i++) b.damage(dummy(b), 1e6);
  assert.equal(b.combo, 12);
  assert.equal(b.run.bestCombo, 12);
  assert.equal(sfx.filter((s) => s === 'combo').length, 2);
  // x1.35 at 12 kills: 10 coins become 13, the fraction carries over.
  b.comboCarry = 0;
  assert.equal(b.comboCoins(10), 13);
  b.update(COMBO_WINDOW - 0.1);
  assert.equal(b.combo, 12);
  b.update(0.2);
  assert.equal(b.combo, 0);
  assert.equal(b.run.bestCombo, 12);
  assert.equal(b.comboCoins(1), 1);
  b.finish(true);
  assert.equal(result().run.bestCombo, 12);
});

test('Battle events: never on step 0 or leader fights, all three occur', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    assert.equal(battle({ seed, step: 0 }).b.event, null);
    for (const kind of ['boss', 'miniboss', 'elite'])
      assert.equal(battle({ seed, kind, step: 9 }).b.event, null);
    const ev = battle({ seed, step: 3 }).b.event;
    if (ev) {
      seen.add(ev.id);
      assert.equal(ev.state, 'wait');
    }
  }
  assert.deepEqual(
    [...seen].sort((a, b) => a.localeCompare(b)),
    ['alarm', 'courier', 'overload'],
  );
  const b = eventSeed('courier');
  assert.ok(b.event.at >= b.duration * 0.35 && b.event.at <= b.duration * 0.5);
});

test('Alarm: an affixed wave, and clearing it pays coins', () => {
  const b = eventSeed('alarm');
  b.elapsed = b.event.at;
  b.update(0.001);
  const wave = b.event.wave;
  assert.equal(b.event.state, 'live');
  assert.ok(wave.length >= 4 && wave.length <= 6);
  assert.ok(wave.every((e) => e.affix && e.wave));
  const coins = b.run.coins;
  for (const e of wave) b.damage(e, 1e9);
  b.update(0.001);
  assert.equal(b.event.state, 'won');
  assert.equal(b.run.eventsCompleted, 1);
  assert.ok(b.run.coins > coins);
  assert.ok(b.run.elitesKilled >= wave.length);
});

test('Courier: flees, is the priority target, pays out, or escapes', () => {
  const b = eventSeed('courier');
  b.elapsed = b.event.at;
  b.update(0.001);
  const courier = b.event.courier;
  assert.ok(courier && b.enemies.includes(courier));
  const d0 = Math.hypot(courier.x - b.x, courier.y - b.y);
  b.update(0.5);
  assert.ok(Math.hypot(courier.x - b.x, courier.y - b.y) > d0);
  // Closer enemies do not steal the house's aim from the courier.
  courier.x = b.x + 250;
  courier.y = b.y;
  dummy(b, 0, null, b.x + 80, b.y).hp = 1e6;
  b.shotTimer = 0;
  b.update(0.001);
  const shot = b.bullets.filter((x) => !x.enemy).at(-1);
  // Shots leave from the roof turret, so compare with the line to the courier.
  assert.ok(
    Math.abs(
      Math.atan2(shot.vy, shot.vx) -
        Math.atan2(courier.y - shot.y, courier.x - shot.x),
    ) < 0.2,
  );
  b.damage(courier, 1e9);
  assert.equal(b.event.state, 'won');
  assert.equal(b.run.eventsCompleted, 1);
  assert.ok(b.drops.some((d) => d.kind === 'heal' && d.value >= 20));
  assert.ok(b.drops.filter((d) => d.kind === 'coin').length >= 5);

  const late = eventSeed('courier');
  late.elapsed = late.event.at;
  late.update(0.001);
  const runner = late.event.courier;
  for (let t = 0; t < 12.2; t += 0.1) late.update(0.1);
  assert.equal(late.event.state, 'lost');
  assert.equal(runner.hp, 0);
  assert.ok(!late.enemies.includes(runner));
  assert.equal(late.run.eventsCompleted, 0);
});

test('Overload: double fire rate and faster enemies for 10 s, then success', () => {
  const b = eventSeed('overload');
  const target = dummy(b, 0, null, b.x + 200, b.y);
  target.hp = target.max = 1e9;
  b.elapsed = b.event.at;
  b.shotTimer = 0;
  b.update(0.001);
  assert.equal(b.overloaded(), true);
  assert.ok(close(b.shotTimer, 1 / (b.stats.rate * 2)));
  assert.ok(b.bullets.some((x) => !x.enemy && x.over));
  for (let t = 0; t < 10.2 && !b.ended; t += 0.05) {
    b.run.hp = b.stats.health;
    b.update(0.05);
  }
  assert.equal(b.event.state, 'won');
  assert.equal(b.overloaded(), false);
  assert.equal(b.run.eventsCompleted, 1);
  b.shotTimer = 0;
  b.update(0.001);
  assert.ok(close(b.shotTimer, 1 / b.stats.rate));
});

test('Arena props are seeded, clear of the spawn, with 2-4 explosives', () => {
  for (const chapter of [0, 1, 2])
    for (let seed = 1; seed <= 40; seed++) {
      const props = Arena.generateProps(seed, chapter);
      assert.deepEqual(props, Arena.generateProps(seed, chapter));
      assert.ok(props.length >= 14 && props.length <= 20, props.length);
      const bombs = props.filter((p) => p.explosive);
      assert.ok(bombs.length >= 2 && bombs.length <= 4);
      assert.ok(bombs.every((p) => p.cell === 0 && p.hp > 0));
      for (const p of props) {
        const ex = (p.x - 800) / 340,
          ey = (p.y - 500) / 240;
        assert.ok(ex * ex + ey * ey >= 1, `${p.x},${p.y} too central`);
        assert.ok(p.x >= 80 && p.x <= 1520 && p.y >= 90 && p.y <= 940);
      }
    }
  assert.notDeepEqual(Arena.generateProps(1, 0), Arena.generateProps(2, 0));
  const air = new Arena.ArenaAmbient(2, 7);
  for (let i = 0; i < 400; i++)
    air.update(1 / 60, { x: 800, y: 500, w: 900, h: 600 });
  assert.ok(air.motes.length > 0 && air.motes.length <= 60);
});

test('Explosive props hurt enemies nearby but never the house', () => {
  const { b, sfx } = battle();
  const [bomb, other] = b.explosives;
  const t = Arena.propTarget(bomb);
  b.x = t.x;
  b.y = t.y + 30;
  b.invincible = 0;
  const near = dummy(b, 0, null, t.x + 40, t.y),
    far = dummy(b, 0, null, t.x + 400, t.y);
  near.hp = near.max = far.hp = far.max = 1e6;
  other.x = bomb.x + 90;
  other.y = bomb.y;
  const hp = b.run.hp;
  // A stray player bullet chips the prop first.
  b.bullets.push({
    x: t.x - 20,
    y: t.y,
    vx: 540,
    vy: 0,
    life: 1,
    damage: 5,
    enemy: false,
    crit: false,
  });
  b.update(0.01);
  assert.ok(bomb.hp < bomb.max && !bomb.blown);
  b.hitProp(bomb, 1e6);
  assert.ok(bomb.blown);
  assert.ok(close(1e6 - near.hp, 40 + b.stats.damage * 3));
  assert.equal(far.hp, 1e6);
  assert.equal(b.run.hp, hp);
  assert.equal(b.run.battleDamage, 0);
  assert.ok(sfx.includes('explosion'));
  // Chain reaction: the neighbour catches a short fuse.
  assert.ok(other.fuse > 0);
  b.update(0.3);
  assert.ok(other.blown);
  assert.equal(b.run.hp, hp);
});

test('Area damage spares splitter halves spawned by its own kills', () => {
  // Both halves stand untouched at full health; only the parent counts.
  const intact = (b, kills) => {
    const halves = b.enemies.filter((e) => e.split);
    assert.equal(halves.length, 2);
    for (const h of halves) assert.ok(close(h.hp, h.max), `${h.hp}/${h.max}`);
    assert.equal(b.battleKills, kills + 1);
  };
  const setup = (x, y) => {
    const { b } = battle();
    const splitter = dummy(b, 0, 'splitter', x ?? b.x + 120, y ?? b.y);
    splitter.hp = 1;
    return { b, splitter, kills: b.battleKills };
  };
  {
    const { b, kills } = setup();
    b.pulse();
    intact(b, kills);
  }
  {
    const { b, splitter, kills } = setup();
    b.stats.explosion = 80;
    b.stats.chain = 3;
    b.bullets.push({
      x: splitter.x - 4,
      y: splitter.y,
      vx: 60,
      vy: 0,
      life: 1,
      damage: 30,
      enemy: false,
      crit: false,
    });
    b.update(0.001);
    intact(b, kills);
  }
  {
    const { b: probe } = battle();
    const t = Arena.propTarget(probe.explosives[0]);
    const { b, kills } = setup(t.x + 30, t.y);
    b.blowProp(b.explosives[0]);
    intact(b, kills);
  }
});

test('A medic heals the others around it, never itself', () => {
  const { b } = battle();
  const medic = dummy(b, 0, 'medic');
  medic.hp = medic.max * 0.5;
  b.update(1);
  assert.equal(medic.hp, medic.max * 0.5);
  const partner = dummy(b, 0, 'medic', medic.x + 40, medic.y);
  partner.hp = partner.max * 0.5;
  b.update(1);
  assert.ok(close(medic.hp, medic.max * 0.53, 1e-3));
  assert.ok(close(partner.hp, partner.max * 0.53, 1e-3));
});

test('Orbit blades cut the event courier too', () => {
  const { b } = battle();
  b.stats.orbit = 1;
  const courier = b.spawnCourier();
  courier.speed = 0;
  const dt = 0.01,
    a = (b.elapsed + dt) * 2;
  courier.x = b.x + Math.cos(a) * 105;
  courier.y = b.y + Math.sin(a) * 85;
  const hp = courier.hp;
  b.update(dt);
  assert.ok(courier.hp < hp);
  assert.ok(courier.hp > 0);
});

test('Some props are solid: a few per arena, never explosive or flat, and the layout does not change', () => {
  let withSolid = 0,
    arenas = 0;
  for (let seed = 1; seed <= 60; seed++)
    for (let chapter = 0; chapter < 3; chapter++) {
      const props = Arena.generateProps(seed, chapter);
      const solids = props.filter((p) => p.solid);
      assert.ok(solids.length <= 5, 'at most five');
      for (const p of solids) assert.ok(!p.explosive && !p.flat);
      for (const p of props.filter((p) => p.explosive || p.flat)) assert.equal(p.solid, false);
      arenas++;
      if (solids.length) withSolid++;
      // The footprint stays inside the playfield and out of the house's clear zone.
      for (const p of solids) {
        const c = Arena.solidCircle(p);
        assert.ok(c.r > 15 && c.r < 40, 'a sensible footprint');
        assert.ok(c.x - c.r > 0 && c.x + c.r < 1600 && c.y - c.r > 0 && c.y + c.r < 1000);
        assert.ok(Math.hypot((p.x - 800) / 340, (p.y - 500) / 240) >= 1, 'clear of the house');
      }
    }
  assert.ok(withSolid / arenas > 0.8, 'most arenas have cover: ' + withSolid + '/' + arenas);
});

test('The house cannot walk through a solid prop and keeps sliding along it', () => {
  const { b } = battle();
  b.solids = [{ x: b.x + 90, y: b.y, r: 40 }];
  b.invincible = 999;
  b.keys.add('KeyD');
  for (let i = 0; i < 120; i++) {
    b.update(1 / 60);
    assert.ok(Math.hypot(b.x - b.solids[0].x, b.y - b.solids[0].y) >= 40 + 24 - 1e-6, 'frame ' + i);
  }
  assert.ok(b.x < b.solids[0].x, 'still on the near side');
  // Pressing diagonally slides round it.
  b.keys.add('KeyS');
  const y0 = b.y;
  for (let i = 0; i < 120; i++) b.update(1 / 60);
  assert.ok(b.y > y0 + 60, 'slid downwards');
});

test('A walking enemy goes round a solid prop on its way to the house; a parked one is left alone', () => {
  const { b } = battle();
  b.invincible = 999;
  b.stats.thorns = b.stats.orbit = b.stats.drones = 0;
  b.shotTimer = 999;
  b.solids = [{ x: b.x + 150, y: b.y, r: 45 }];
  const e = b.spawn(0, { force: true, x: b.x + 330, y: b.y + 1 });
  assert.ok(e);
  const parked = b.spawn(0, { force: true, x: b.x + 150, y: b.y + 5 });
  parked.speed = 0;
  parked.timer = 999;
  const parkedAt = [parked.x, parked.y];
  let closest = Infinity;
  for (let i = 0; i < 900; i++) {
    b.update(1 / 60);
    if (e.hp > 0) {
      closest = Math.min(closest, Math.hypot(e.x - b.x, e.y - b.y));
      const inside = Math.hypot(e.x - b.solids[0].x, e.y - b.solids[0].y) < b.solids[0].r + e.r * 0.7 - 1.5;
      assert.ok(!inside || i < 2, 'never inside the prop, frame ' + i);
    }
  }
  assert.ok(closest < 110, 'it reached the house: ' + closest);
  assert.deepEqual([parked.x, parked.y], parkedAt, 'an enemy that does not walk is not shoved');
});

test('Hostile bullets stop at a solid prop; with no cover the same bullet hits the house', () => {
  const shot = (b) => ({ x: b.x + 300, y: b.y, vx: -600, vy: 0, life: 2, damage: 20, enemy: true, crit: false });
  for (const cover of [true, false]) {
    const { b } = battle();
    b.stats.regen = 0;
    b.invincible = 0;
    b.solids = cover ? [{ x: b.x + 150, y: b.y, r: 40 }] : [];
    const hp = b.run.hp;
    b.bullets.push(shot(b));
    for (let i = 0; i < 60; i++) b.update(1 / 60);
    if (cover) assert.equal(b.run.hp, hp, 'the crate took it');
    else assert.ok(b.run.hp < hp, 'it landed');
  }
});
