const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js'),
  P = require('../.test-build/progression.js'),
  E = require('../.test-build/equipment.js'),
  R = require('../.test-build/residents.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');
test('Blueprint purchase requires the milestone, charges once, and never grants a start item', () => {
  let meta = M.initialMeta();
  meta.cores = 50;
  assert.equal(P.buyBlueprint(meta, 'rescue_beacon'), meta);
  meta.kills = 25;
  const bought = P.buyBlueprint(meta, 'rescue_beacon');
  assert.equal(bought.cores, 47);
  assert.deepEqual(bought.blueprints, ['rescue_beacon']);
  assert.equal(P.buyBlueprint(bought, 'rescue_beacon'), bought);
  assert.equal(P.buyBlueprint(bought, 'unknown'), bought);
  const run = M.makeRun(bought, 'mechanic', 0, 21);
  assert.ok(run.blueprints.includes('rescue_beacon'));
  assert.ok(!run.items.includes('rescue_beacon'));
  assert.equal(run.furniture.length, 0);
  assert.equal(
    P.buyBlueprint({ ...meta, cores: 2 }, 'rescue_beacon').blueprints.length,
    0,
  );
});
test('All purchased blueprints can appear; locked exclusives never leak through chests, shops or rewards', () => {
  const oldMeta = M.initialMeta(),
    active = M.makeRun(oldMeta, 'mechanic', 0, 1);
  let meta = {
    ...oldMeta,
    cores: 1000,
    kills: 1000,
    wins: 5,
    totalBosses: 15,
    totalMinibosses: 5,
    totalRescues: 10,
  };
  for (const b of P.BLUEPRINTS) meta = P.buyBlueprint(meta, b.id);
  assert.equal(meta.blueprints.length, P.BLUEPRINTS.length);
  const seen = new Set();
  for (let seed = 0; seed < 600; seed++) {
    const old = { ...active, seed },
      fresh = M.makeRun(meta, 'mechanic', 2, seed);
    for (const [run, canDrop] of [
      [old, false],
      [fresh, true],
    ]) {
      const ids = [
        ...M.offers(meta, run, 4, 91, true),
        ...M.furnitureOffers(run, 12),
        ...M.randomLoot(run, meta, 3, 88, true).map((l) => l.id),
        ...M.randomLoot(run, meta, 3, 69, false).map((l) => l.id),
      ];
      for (const id of ids)
        if (P.BLUEPRINT_BY_ID[id]) {
          assert.ok(canDrop, id);
          seen.add(id);
        }
    }
  }
  assert.equal(seen.size, P.BLUEPRINTS.length);
  const restored = M.readSave(M.saveData(meta, active));
  assert.deepEqual(restored.run.blueprints, []);
  assert.equal(restored.meta.blueprints.length, P.BLUEPRINTS.length);
});
test('A losing expedition still earns research progress, while an empty abandonment earns nothing', () => {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 1, 21);
  run.kills = 52;
  run.minibossKills = 2;
  run.bossesDefeated = 1;
  run.rescued = ['mechanic', 'lev', 'nina'];
  const result = M.finishRun(meta, run, false);
  assert.equal(result.cores, 6);
  assert.equal(
    result.coreBreakdown.reduce((s, x) => s + x.amount, 0),
    6,
  );
  assert.equal(result.meta.totalBosses, 1);
  assert.equal(result.meta.totalMinibosses, 2);
  assert.equal(result.meta.totalRescues, 2);
  assert.ok(result.projects.includes('rescue_beacon'));
  assert.ok(result.projects.includes('foam_shield'));
  assert.equal(result.meta.blueprints.length, 0);
  assert.equal(result.meta.wins, 0);
  const empty = M.finishRun(meta, M.makeRun(meta, 'mechanic', 0, 22), false);
  assert.equal(empty.cores, 0);
  assert.equal(empty.meta.totalRescues, 0);
  assert.equal(empty.projects.length, 0);
});
test('New research is capped, priced by level and deferred for active and reloaded expeditions', () => {
  let meta = M.initialMeta();
  meta.cores = 1000;
  const active = M.makeRun(meta, 'mechanic', 0, 1),
    before = M.statsFor(active, meta);
  for (const id of ['servos', 'salvage', 'maintenance'])
    for (let n = 0; n < 5; n++) meta = P.buyResearch(meta, id);
  assert.equal(meta.cores, 1000 - (5 + 3 + 5) * 15);
  assert.equal(P.buyResearch(meta, 'servos'), meta);
  assert.deepEqual(M.statsFor(active, meta), before);
  const fresh = M.statsFor(M.makeRun(meta, 'mechanic', 0, 1), meta);
  assert.equal(fresh.speed, before.speed + 15);
  assert.equal(fresh.magnet, before.magnet + 50);
  assert.ok(Math.abs(fresh.regen - before.regen - 0.3) < 1e-9);
  assert.deepEqual(
    M.statsFor(M.readSave(M.saveData(meta, active)).run, meta),
    before,
  );
  const legacy = JSON.parse(M.saveData(meta, active));
  delete legacy.meta.blueprints;
  delete legacy.meta.totalBosses;
  delete legacy.run.blueprints;
  delete legacy.run.minibossKills;
  legacy.meta.wins = 2;
  legacy.meta.research = { hull: 1, supplies: 0, garage: 0 };
  legacy.run.research = { hull: 0, supplies: 0, garage: 0 };
  const migrated = M.readSave(JSON.stringify(legacy));
  assert.ok(migrated.run);
  assert.equal(migrated.meta.totalBosses, 6);
  assert.deepEqual(migrated.run.blueprints, []);
  assert.equal(migrated.meta.research.servos, 0);
});
function echoBattle(coins) {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 2, 44);
  run.houseLevel = 3;
  run.residents = [
    { id: 'mechanic', x: 4, y: 3, rotation: 0 },
    { id: 'solomia', x: 0, y: 0, rotation: 0 },
    { id: 'lev', x: 2, y: 1, rotation: 0 },
  ];
  run.roomModes = { solomia: 'anomaly' };
  run.items = E.emptyEquipment();
  run.items[0] = 'coinshot';
  run.coins = coins;
  const b = new Battle(
    null,
    run,
    meta,
    new AudioEngine(),
    () => {},
    () => {},
  );
  b.spawnTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.thorns = b.stats.orbit = 0;
  b.spawn(15);
  b.enemies[0].x = b.x + 200;
  b.enemies[0].y = b.y;
  b.enemies[0].hp = 1e6;
  return b;
}
test('Anomaly replays a paid or unpaid volley exactly, including the last coin, without paying twice', () => {
  for (const coins of [0, 4, 10]) {
    const b = echoBattle(coins);
    for (let n = 0; n < 4; n++) {
      b.shotTimer = 0;
      b.update(0.025);
    }
    const shots = b.bullets.filter((b) => !b.enemy);
    assert.equal(shots.length, 5);
    assert.equal(b.run.coins, Math.max(0, coins - 4));
    assert.equal(shots[4].damage, shots[3].damage);
    assert.equal(shots[4].crit, shots[3].crit);
  }
});
test('Anomaly penalty remains at the firing-rate cap; joined defense starts within short encounters', () => {
  const b = echoBattle(10),
    run = b.run;
  for (const slot of E.equipmentTargets(run)) run.items[slot.slot] = 'laundry';
  const on = M.statsFor(run, M.initialMeta());
  run.roomModes = {};
  const off = M.statsFor(run, M.initialMeta());
  assert.ok(Math.abs(on.rate / off.rate - 0.85) < 1e-9);
  run.roomLinks = [['solomia', 'lev']];
  const defense = new Battle(
    null,
    run,
    M.initialMeta(),
    new AudioEngine(),
    () => {},
    () => {},
  );
  assert.equal(defense.housingDefenseTimer, 6);
});
test('Actual miniboss victory increments the persisted raid counter once', () => {
  const b = echoBattle(0);
  b.enemies = [];
  b.spawn(98);
  const e = b.enemies[0];
  b.damage(e, 1e8);
  assert.equal(b.run.minibossKills, 1);
  b.damage(e, 1e8);
  assert.equal(b.run.minibossKills, 1);
});
const S = require('../.test-build/specials.js');
function specialBattle(ids) {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 31);
  run.items = E.emptyEquipment();
  E.equipmentTargets(run)
    .slice(0, ids.length)
    .forEach((t, n) => (run.items[t.slot] = ids[n]));
  const b = new Battle(
    null,
    run,
    meta,
    new AudioEngine(),
    () => {},
    () => {},
  );
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.orbit = b.stats.thorns = b.stats.vampire = 0;
  return b;
}
test('Safety charge intercepts contact, bullets and hazard damage once per battle, without duplication', () => {
  for (const kind of ['contact', 'bullet', 'hazard']) {
    const b = specialBattle(['airbag', 'airbag']);
    const hp = b.run.hp;
    function attack() {
      b.invincible = 0;
      b.enemies = [];
      b.bullets = [];
      b.hazards = [];
      if (kind === 'contact') {
        b.spawn(0);
        Object.assign(b.enemies[0], { x: b.x, y: b.y, speed: 0 });
      }
      if (kind === 'bullet')
        b.bullets.push({
          x: b.x,
          y: b.y,
          vx: 0,
          vy: 0,
          life: 1,
          damage: 20,
          enemy: true,
          crit: false,
        });
      if (kind === 'hazard')
        b.hazards.push({
          x: b.x,
          y: b.y,
          radius: 60,
          age: 0,
          duration: 2,
          damage: 20,
          color: '#fff',
        });
      b.update(0.025);
    }
    attack();
    assert.equal(b.run.hp, hp, kind);
    assert.equal(b.shieldCharges, 0);
    attack();
    assert.ok(b.run.hp < hp, kind);
  }
});
test('Flywheel empowers exactly one main volley; drones and failed or paused dashes cannot consume or renew it', () => {
  const b = specialBattle(['flywheel']);
  b.stats.crit = 0;
  b.spawn(0);
  const e = b.enemies[0];
  const normal = b.shoot(b.x, b.y, e).damage;
  b.dash();
  assert.equal(b.dashCharged, true);
  b.shoot(b.x, b.y, e, true);
  assert.equal(b.dashCharged, true);
  const charged = b.shoot(b.x, b.y, e);
  assert.ok(Math.abs(charged.damage / normal - 1.6) < 1e-9);
  assert.equal(b.shoot(b.x, b.y, e, false, charged).damage, charged.damage);
  b.dash();
  assert.equal(b.dashCharged, false);
  b.dashCd = 0;
  b.paused = true;
  b.dash();
  assert.equal(b.dashCharged, false);
  b.paused = false;
  assert.equal(b.shoot(b.x, b.y, e).damage, normal);
});
test('Healing pulse requires a living target, heals once per activation, and respects maximum health and pause', () => {
  const b = specialBattle(['medpulse', 'medpulse']);
  b.run.hp = 30;
  b.pulse();
  assert.equal(b.run.hp, 30);
  b.pulseCd = 0;
  for (let i = 0; i < 3; i++) {
    b.spawn(0);
    Object.assign(b.enemies.at(-1), { x: b.x + 60, y: b.y, hp: 1e5 });
  }
  b.pulse();
  assert.equal(b.run.hp, 38);
  b.pulse();
  assert.equal(b.run.hp, 38);
  b.pulseCd = 0;
  b.run.hp = b.stats.health - 2;
  b.pulse();
  assert.equal(b.run.hp, b.stats.health);
  b.run.hp = 30;
  b.pulseCd = 0;
  b.enemies.forEach((e) => (e.hp = 0));
  b.pulse();
  assert.equal(b.run.hp, 30);
});
test('Red protocol threshold uses current maximum health and does not multiply drone shots', () => {
  const b = specialBattle(['redline', 'redline']);
  b.stats.crit = 0;
  b.spawn(0);
  const e = b.enemies[0];
  b.run.hp = b.stats.health * 0.35;
  const normal = b.shoot(b.x, b.y, e).damage,
    drone = b.shoot(b.x, b.y, e, true).damage;
  b.run.hp -= 1;
  assert.ok(Math.abs(b.shoot(b.x, b.y, e).damage / normal - 1.3) < 1e-9);
  assert.equal(b.shoot(b.x, b.y, e, true).damage, drone);
});
test('Special furniture needs an installed room and the named adjacent resident; duplicates never multiply its unique effect', () => {
  const cases = [
    ['firedoor', 'boris', 'shields', 1, 0],
    ['soupstation', 'nina', 'pulseHeal', 4, 0],
    ['chargingseat', 'spark', 'dashCooldown', 3.2, 3.8],
    ['seedlibrary', 'flora', 'gardenRegen', 0.35, 0],
  ];
  for (const [id, person, key, on, off] of cases) {
    const b = specialBattle([]),
      r = b.run;
    r.houseLevel = 4;
    const a = { id: 'mechanic', x: 0, y: 0, rotation: 0 };
    let adjacent;
    for (let y = 0; y < 6 && !adjacent; y++)
      for (let x = 0; x < 8 && !adjacent; x++) {
        const p = { id: person, x, y, rotation: 0 };
        if (
          R.canHouse([a], p, 4) &&
          require('../.test-build/apartments.js').roomsTouch(a, p)
        )
          adjacent = p;
      }
    assert.ok(adjacent);
    r.residents = [a, adjacent];
    r.furniture = [{ id, uid: 100, resident: null, cell: null }];
    assert.equal(S.specialEffects(r)[key], off);
    r.furniture[0] = { id, uid: 100, resident: 'mechanic', cell: 1 };
    assert.equal(S.specialEffects(r)[key], on);
    r.furniture.push({ id, uid: 101, resident: 'mechanic', cell: 2 });
    assert.equal(S.specialEffects(r)[key], on);
    const restored = M.readSave(M.saveData(M.initialMeta(), r)).run;
    assert.equal(S.specialEffects(restored)[key], on);
    r.residents = [a, { ...adjacent, x: 6, y: 4 }];
    assert.equal(S.specialEffects(r)[key], off);
    r.residents = [adjacent];
    assert.equal(S.specialEffects(r)[key], off);
  }
});
