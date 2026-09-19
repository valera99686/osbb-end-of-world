const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js'),
  A = require('../.test-build/apartments.js'),
  R = require('../.test-build/residents.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');
const room = (id, x, y, rotation = 0) => ({ id, x, y, rotation });
function fixture(rooms, chapter = 0) {
  const meta = M.initialMeta();
  meta.wins = 5;
  M.unlock(meta);
  const run = M.makeRun(meta, rooms[0].id, chapter, 44);
  Object.assign(run, {
    houseLevel: 4,
    residents: rooms,
    rescued: rooms.map((r) => r.id),
  });
  run.hp = M.statsFor(run, meta).health;
  return { meta, run };
}
function battle(run, meta) {
  const b = new Battle(
    null,
    run,
    meta,
    new AudioEngine(),
    () => {},
    () => {},
  );
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.thorns = b.stats.orbit = 0;
  b.invincible = 999;
  return b;
}
test('Apartment adjacency requires a shared edge and unlocks new mechanics by location', () => {
  const { run, meta } = fixture([
    room('mechanic', 0, 0),
    room('lev', 1, 0),
    room('marta', 0, 3),
  ]);
  const early = A.apartmentEffects(run);
  assert.equal(early.stats.damage, 4);
  assert.equal(early.stats.regen, -0.3);
  assert.equal(early.stats.drones, undefined);
  assert.equal(A.apartmentEffects({ ...run, chapter: 1 }).stats.drones, 1);
  const diagonal = [room('flora', 0, 0), room('marta', 2, 2)];
  assert.equal(A.roomsTouch(...diagonal), false);
  assert.equal(
    A.apartmentEffects({ ...run, residents: diagonal, chapter: 1 }).medicine,
    0,
  );
  const pharma = {
    ...run,
    residents: [room('flora', 0, 0), room('marta', 2, 0)],
  };
  assert.equal(A.apartmentEffects(pharma).medicine, 0);
  assert.equal(A.apartmentEffects({ ...pharma, chapter: 1 }).medicine, 6);
  assert.equal(M.setApartmentMode(run, meta, 'mechanic', 'lab'), run);
});
test('Joined rooms translate and rotate as one shape while furniture and equipment identities stay intact', () => {
  const { meta, run } = fixture([room('mechanic', 2, 2), room('lev', 3, 2)]);
  run.furniture = [{ uid: 1, id: 'bench', resident: 'lev', cell: 1 }];
  let joined = M.joinApartments(run, meta, 'mechanic', 'lev');
  assert.notEqual(joined, run);
  assert.equal(joined.roomLinks.length, 1);
  assert.equal(M.statsFor(joined, meta).speed, M.statsFor(run, meta).speed - 6);
  const original = JSON.stringify(joined.residents),
    items = JSON.stringify(joined.items),
    furniture = JSON.stringify(joined.furniture);
  const shifted = M.houseResident(joined, meta, room('lev', 4, 3));
  assert.deepEqual(shifted.residents, [
    room('mechanic', 3, 3),
    room('lev', 4, 3),
  ]);
  for (let i = 0; i < 4; i++) {
    const selected = joined.residents[0];
    joined = M.houseResident(joined, meta, {
      ...selected,
      rotation: (selected.rotation + 1) % 4,
    });
    assert.equal(joined.residents[0].rotation, (i + 1) % 4);
    assert.ok(A.roomsTouch(...joined.residents));
    assert.equal(JSON.stringify(joined.items), items);
    assert.equal(JSON.stringify(joined.furniture), furniture);
  }
  assert.equal(JSON.stringify(joined.residents), original);
  assert.equal(M.houseResident(joined, meta, room('lev', 7, 5)), joined);
  const blocked = {
    ...joined,
    residents: [...joined.residents, room('nina', 6, 2)],
    rescued: [...joined.rescued, 'nina'],
  };
  assert.equal(M.houseResident(blocked, meta, room('mechanic', 5, 2)), blocked);
  assert.equal(M.reserveResident(joined, meta, 'lev'), joined);
  const split = M.splitApartments(joined, meta, 'lev');
  assert.equal(split.roomLinks.length, 0);
  assert.notEqual(M.houseResident(split, meta, room('lev', 4, 4)), split);
});
test('Only the joined boundary disappears and invalid or duplicate saved links cannot merge extra rooms', () => {
  const { run, meta } = fixture([
    room('mechanic', 0, 0),
    room('lev', 1, 0),
    room('nina', 5, 0),
  ]);
  const joined = M.joinApartments(run, meta, 'mechanic', 'lev');
  const wall = A.apartmentWalls(run.residents[0], run.residents),
    open = A.apartmentWalls(run.residents[0], run.residents, joined.roomLinks);
  assert.ok(open.length < wall.length);
  assert.equal(
    A.apartmentWalls(run.residents[2], run.residents, joined.roomLinks),
    A.apartmentWalls(run.residents[2], run.residents),
  );
  const loaded = M.readSave(
    M.saveData(meta, {
      ...joined,
      roomLinks: [
        ...joined.roomLinks,
        ['lev', 'mechanic'],
        ['lev', 'nina'],
        ['x', 'y'],
        ['nina', 'nina'],
      ],
    }),
  ).run;
  assert.deepEqual(loaded.roomLinks, [['mechanic', 'lev']]);
  assert.deepEqual(M.readSave(M.saveData(meta, loaded)).run, loaded);
  assert.equal(M.joinApartments(joined, meta, 'lev', 'nina'), joined);
});
test('Renovation preserves damaged health and is forbidden in combat; old saves receive no free room modes', () => {
  const { meta, run } = fixture([room('spark', 0, 0), room('lev', 3, 0)], 2);
  run.hp = 43;
  let current = run;
  for (let i = 0; i < 20; i++) {
    current = M.joinApartments(current, meta, 'spark', 'lev');
    current = M.setApartmentMode(current, meta, 'spark', 'lab');
    current = M.splitApartments(current, meta, 'spark');
    current = M.setApartmentMode(current, meta, 'spark', 'normal');
  }
  assert.equal(current.hp, 43);
  const fighting = { ...current, page: 'combat' };
  assert.equal(M.joinApartments(fighting, meta, 'spark', 'lev'), fighting);
  assert.equal(M.setApartmentMode(fighting, meta, 'spark', 'lab'), fighting);
  assert.equal(M.houseResident(fighting, meta, room('spark', 1, 2)), fighting);
  const old = { ...run };
  delete old.roomLinks;
  delete old.roomModes;
  const restored = M.readSave(M.saveData(meta, old)).run;
  assert.deepEqual(restored.roomLinks, []);
  assert.deepEqual(restored.roomModes, {});
  assert.equal(restored.hp, 43);
});
test('Medicine heals on its combat timer, merged pharmacy is stronger, and pause freezes the timer', () => {
  const { meta, run } = fixture([room('flora', 0, 0), room('marta', 2, 0)], 1);
  const joined = M.joinApartments(run, meta, 'flora', 'marta');
  assert.equal(A.apartmentEffects(joined).medicine, 8);
  const b = battle(joined, meta);
  b.run.hp = 20;
  b.housingHealTimer = 0.01;
  b.paused = true;
  b.update(0.025);
  assert.equal(b.run.hp, 20);
  b.paused = false;
  b.update(0.025);
  assert.equal(b.run.hp, 28);
  b.update(0.025);
  assert.equal(b.run.hp, 28);
});
test('Laboratory needs a neighbor, leaks without a mechanic, and cannot finish the house by itself', () => {
  const { meta, run } = fixture([room('spark', 0, 0), room('lev', 3, 0)], 2);
  const active = M.setApartmentMode(run, meta, 'spark', 'lab');
  assert.equal(A.apartmentEffects(active).stats.chain, 1);
  assert.equal(A.apartmentEffects(active).strain, 3);
  const b = battle(active, meta);
  b.run.hp = 2;
  b.housingStrainTimer = 0;
  b.update(0.025);
  assert.equal(b.run.hp, 1);
  const safe = {
    ...active,
    residents: [...active.residents, room('mechanic', 0, 1)],
  };
  assert.equal(A.apartmentEffects(safe).strain, 0);
  assert.equal(
    A.apartmentEffects({ ...active, residents: [active.residents[0]] }).stats
      .chain,
    undefined,
  );
  assert.deepEqual(M.readSave(M.saveData(meta, active)).run.roomModes, {
    spark: 'lab',
  });
  assert.deepEqual(
    A.restoreRoomModes({ spark: 'lab', lev: 'anomaly' }, active.residents, 0),
    {},
  );
});
test('Time anomaly repeats the fourth main volley while merged defenses use their own timer', () => {
  const { meta, run } = fixture([room('solomia', 0, 0), room('lev', 2, 1)], 2);
  const active = M.setApartmentMode(run, meta, 'solomia', 'anomaly');
  assert.equal(A.apartmentEffects(active).echo, true);
  assert.ok(M.statsFor(active, meta).rate < M.statsFor(run, meta).rate);
  const b = battle(active, meta);
  b.stats.shots = 1;
  b.spawn(6);
  b.enemies[0].x = b.x + 200;
  b.enemies[0].y = b.y;
  for (let i = 0; i < 4; i++) {
    b.shotTimer = 0;
    b.update(0.025);
  }
  assert.equal(b.bullets.filter((s) => !s.enemy).length, 5);
  const joined = M.joinApartments(active, meta, 'solomia', 'lev');
  const defense = battle(joined, meta);
  defense.spawn(6);
  const enemy = defense.enemies[0];
  enemy.x = defense.x + 160;
  enemy.y = defense.y;
  const hp = enemy.hp;
  defense.housingDefenseTimer = 0;
  defense.pulseCd = 7;
  defense.update(0.025);
  assert.equal(enemy.hp, hp - 24);
  assert.ok(defense.pulseCd > 6.9);
});
