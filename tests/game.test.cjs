const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const { ITEM_BY_ID } = require('../.test-build/data.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');
const Bag = require('../.test-build/backpack.js');
const Boss = require('../.test-build/bosses.js');
const Lore = require('../.test-build/lore.js');
const R = require('../.test-build/residents.js');
const Scenes = require('../.test-build/cutscenes.js');
const F = require('../.test-build/furniture.js');
const E = require('../.test-build/equipment.js');

const allModules = (run) =>
  [...run.items.filter(Boolean), ...run.backpack.map((item) => item.id)].sort();
const closeEnough = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('Equipment only occupies non-portrait cells of aboard apartments and shares space with furniture', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 105);
  assert.equal(E.activeEquipment(run).length, 3);
  assert.equal(E.equipmentTargets(run).length, 7);
  assert.equal(M.installFurniture(run, meta, 1, 'mechanic', 1), run);
  const slot = E.apartmentSlot('nina', 1);
  run = M.installFurniture(run, meta, 2, 'nina', 1);
  for (const bad of [-1, 0.5, 22, E.apartmentSlot('flora', 1), slot]) {
    assert.equal(M.equip(run, 'battery', bad, meta), run);
  }
  assert.equal(E.apartmentSlot('nina', 0), -1);
  run = M.removeFurniture(run, meta, 2);
  const next = M.equip(run, 'battery', slot, meta);
  assert.equal(next.items[slot], 'battery');
  assert.equal(M.installFurniture(next, meta, 2, 'nina', 1), next);
  const combat = { ...next, page: 'combat' };
  assert.equal(M.moveEquipment(combat, meta, slot, 1), combat);
  assert.equal(M.equip(combat, 'battery', slot, meta), combat);
  assert.equal(M.stowModule(combat, meta, slot), combat);
  assert.equal(M.scrapEquipment(combat, meta, slot), combat);
});

test('Equipment stays with rotated apartments and returning a resident preserves modules in a full store', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 106);
  const slot = E.apartmentSlot('nina', 1);
  run = M.equip(run, 'armor', slot, meta);
  run.hp = 0.25;
  const ratio = run.hp / M.statsFor(run, meta).health;
  for (let rotation = 0; rotation < 4; rotation++) {
    run = M.houseResident(run, meta, { id: 'nina', x: 3, y: 3, rotation });
    assert.equal(run.items[slot], 'armor');
    const position = E.activeEquipment(run).find((item) => item.slot === slot);
    const cell = R.residentCells('nina', rotation)[1];
    assert.deepEqual([position.x, position.y], [3 + cell[0], 3 + cell[1]]);
    closeEnough(run.hp / M.statsFor(run, meta).health, ratio);
  }
  for (let i = 0; i < 30; i++) run = M.packItem(run, meta, 'kitchen');
  const before = allModules(run);
  run = M.reserveResident(run, meta, 'nina');
  assert.equal(run.items[slot], null);
  assert.equal(run.backpack.length, 31);
  assert.deepEqual(allModules(run), before);
  closeEnough(run.hp / M.statsFor(run, meta).health, ratio);
  assert.deepEqual(M.readSave(M.saveData(meta, run)).run, run);
});

test('Legacy nine-module saves migrate once without losing full-store overflow or health percentage', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 107);
  for (let i = 0; i < 30; i++) run = M.packItem(run, meta, 'kitchen');
  delete run.equipmentLayout;
  run.items = [
    'cannon',
    'engine',
    'armor',
    'battery',
    'kitchen',
    'armor',
    'cannon',
    'armor',
    'battery',
  ];
  run.furniture = [
    { uid: 1, id: 'bench', resident: 'mechanic', cell: 1 },
    { uid: 2, id: 'planter', resident: 'nina', cell: 1 },
  ];
  run.hp = M.statsFor(run, meta, true).health * 0.37;
  const before = allModules(run);
  const loaded = M.readSave(M.saveData(meta, run));
  assert.ok(loaded.run);
  assert.equal(loaded.run.equipmentLayout, 1);
  assert.equal(E.activeEquipment(loaded.run).length, 5);
  assert.equal(loaded.run.backpack.length, 34);
  assert.deepEqual(allModules(loaded.run), before);
  closeEnough(loaded.run.hp / M.statsFor(loaded.run, loaded.meta).health, 0.37);
  assert.deepEqual(M.readSave(M.saveData(loaded.meta, loaded.run)), loaded);
  loaded.run.items = E.emptyEquipment();
  const empty = M.readSave(M.saveData(loaded.meta, loaded.run)).run;
  assert.equal(empty.items.filter(Boolean).length, 0);
  assert.equal(empty.backpack.length, 34);
});

test('Module adjacency follows apartment coordinates and moves conserve every item', () => {
  const meta = M.initialMeta();
  meta.wins = 2;
  M.unlock(meta);
  let run = M.makeRun(meta, 'mechanic', 0, 108);
  run.items = E.emptyEquipment();
  run.residents = [
    { id: 'mechanic', x: 0, y: 0, rotation: 0 },
    { id: 'nina', x: 1, y: 0, rotation: 0 },
  ];
  const generator = E.apartmentSlot('mechanic', 1),
    battery = E.apartmentSlot('nina', 2);
  run = M.equip(run, 'generator', generator, meta);
  run = M.equip(run, 'battery', battery, meta);
  const before = allModules(run),
    near = M.statsFor(run, meta);
  run.hp = near.health * 0.41;
  run = M.houseResident(run, meta, { id: 'nina', x: 4, y: 3, rotation: 0 });
  const far = M.statsFor(run, meta);
  assert.ok(near.rate > far.rate);
  assert.equal(
    far.synergies.filter((s) => s.startsWith('Електромережа')).length,
    0,
  );
  closeEnough(run.hp / far.health, 0.41);
  const destination = E.apartmentSlot('mechanic', 2);
  for (let i = 0; i < 8; i++) {
    run = M.moveEquipment(run, meta, battery, destination);
    run = M.moveEquipment(run, meta, destination, battery);
  }
  assert.deepEqual(allModules(run), before);
  closeEnough(run.hp / M.statsFor(run, meta).health, 0.41);
});

test('Purchased replacements keep old equipment, and offboard modules never grant active stats', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 109);
  run.hp = M.statsFor(run, meta).health * 0.4;
  const before = allModules(run);
  run = M.equip(run, 'armor', 0, meta);
  assert.deepEqual(allModules(run), [...before, 'armor'].sort());
  closeEnough(run.hp / M.statsFor(run, meta).health, 0.4);
  const stats = M.statsFor(run, meta);
  run.items[E.apartmentSlot('flora', 1)] = 'cannon';
  assert.deepEqual(M.statsFor(run, meta), stats);
  assert.equal(
    E.activeEquipment(run).some((item) => item.resident === 'flora'),
    false,
  );
  const loaded = M.readSave(M.saveData(meta, run)).run;
  assert.equal(loaded.items[E.apartmentSlot('flora', 1)], null);
  assert.deepEqual(allModules(loaded), allModules(run));
});

test('Furniture fills apartment slots, follows rotations and cannot create health by reinstalling', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 91);
  run.items = E.emptyEquipment();
  const initial = M.statsFor(run, meta);
  run.hp = initial.health * 0.4;
  run = M.installFurniture(run, meta, 1, 'mechanic', 1);
  assert.equal(M.statsFor(run, meta).armor, initial.armor + 2);
  run = M.installFurniture(run, meta, 2, 'nina', 1);
  assert.equal(M.statsFor(run, meta).health, initial.health + 12);
  const saved = run.hp;
  for (let i = 0; i < 10; i++) {
    run = M.removeFurniture(run, meta, 2);
    run = M.installFurniture(run, meta, 2, 'nina', 1);
  }
  assert.ok(Math.abs(run.hp - saved) < 1e-8);
  const moved = M.houseResident(run, meta, {
    id: 'nina',
    x: 3,
    y: 3,
    rotation: 1,
  });
  assert.notEqual(moved, run);
  assert.deepEqual(moved.furniture, run.furniture);
  assert.equal(M.statsFor(moved, meta).health, initial.health + 12);
  const reserved = M.reserveResident(moved, meta, 'nina');
  assert.equal(
    reserved.furniture.find((item) => item.uid === 2).resident,
    null,
  );
  assert.equal(M.statsFor(reserved, meta).health, initial.health - 12);
  assert.deepEqual(M.readSave(M.saveData(meta, reserved)).run, reserved);
});

test('Furniture rejects portrait slots, overlap, absent residents, invalid IDs and combat changes', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 92);
  run.items = E.emptyEquipment();
  run.hp = M.statsFor(run, meta).health;
  for (const [uid, id, cell] of [
    [1, 'mechanic', 0],
    [1, 'mechanic', 4],
    [1, 'mechanic', 1.5],
    [1, 'flora', 1],
    [9, 'mechanic', 1],
    [1, '__proto__', 1],
  ])
    assert.equal(M.installFurniture(run, meta, uid, id, cell), run);
  run = M.installFurniture(run, meta, 1, 'mechanic', 1);
  assert.equal(M.installFurniture(run, meta, 2, 'mechanic', 1), run);
  const combat = { ...run, page: 'combat' };
  assert.equal(M.installFurniture(combat, meta, 2, 'nina', 1), combat);
  assert.equal(M.removeFurniture(combat, meta, 1), combat);
  assert.equal(M.buyFurniture(combat, 'radio'), combat);
  const empty = { ...run, coins: 0 };
  assert.equal(M.buyFurniture(empty, 'bench'), empty);
  assert.equal(M.buyFurniture(run, 'constructor'), run);
  const bought = M.buyFurniture(run, 'bench');
  assert.equal(bought.coins, run.coins - 25);
  assert.equal(bought.furniture.length, 3);
  assert.equal(bought.nextFurnitureId, 4);
  assert.deepEqual(M.readSave(M.saveData(meta, bought)).run, bought);
});

test('Permanent house expansions unlock real cells and survive reloads and new expeditions', () => {
  let meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 93);
  assert.equal(M.expandHouse(meta, run), meta);
  meta.cores = 26;
  assert.equal(M.expandHouse(meta, { ...run, page: 'combat' }), meta);
  const positions = structuredClone(run.residents);
  const edge = { id: 'nina', x: 5, y: 3, rotation: 0 };
  assert.equal(M.houseResident(run, meta, edge), run);
  meta = M.expandHouse(meta, run);
  assert.deepEqual(R.houseSize(meta.houseLevel), { width: 7, height: 5 });
  assert.deepEqual(run.residents, positions);
  run = M.houseResident(run, meta, edge);
  assert.ok(run.residents.some((room) => room.id === 'nina' && room.x === 5));
  meta = M.expandHouse(meta, run);
  run = M.houseResident(run, meta, { id: 'lev', x: 4, y: 5, rotation: 0 });
  assert.ok(run.residents.some((room) => room.id === 'lev' && room.y === 5));
  meta = M.expandHouse(meta, run);
  assert.equal(meta.cores, 0);
  assert.deepEqual(R.houseSize(meta.houseLevel), { width: 8, height: 6 });
  assert.equal(M.expandHouse({ ...meta, cores: 100 }, run).houseLevel, 3);
  const loaded = M.readSave(M.saveData(meta, run));
  assert.deepEqual(loaded.run, run);
  assert.equal(loaded.meta.houseLevel, 3);
  assert.equal(loaded.meta.cores, 0);
  const afterDefeat = M.finishRun(meta, run, false).meta;
  assert.equal(afterDefeat.houseLevel, 3);
  const next = M.makeRun(afterDefeat, 'mechanic', 0, 94);
  assert.ok(
    M.houseResident(next, afterDefeat, {
      id: 'nina',
      x: 6,
      y: 4,
      rotation: 0,
    }).residents.some((room) => room.x === 6),
  );
});

test('Older saves gain starter furniture once; corrupt placements return items to stock', () => {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 95);
  delete meta.houseLevel;
  delete run.furniture;
  delete run.nextFurnitureId;
  const saved = M.readSave(M.saveData(meta, run));
  assert.equal(saved.meta.houseLevel, 0);
  assert.equal(saved.run.furniture.length, 2);
  assert.deepEqual(M.readSave(M.saveData(saved.meta, saved.run)), saved);
  const raw = [
    { uid: 1, id: 'bench', resident: 'mechanic', cell: 1 },
    { uid: 1, id: 'bench', resident: 'nina', cell: 1 },
    { uid: 2, id: 'planter', resident: 'mechanic', cell: 1 },
    { uid: 3, id: 'radio', resident: 'flora', cell: 1 },
    { uid: 4, id: '__proto__', resident: null, cell: null },
  ];
  const restored = F.restoreFurniture(raw, saved.run.residents);
  assert.equal(restored.length, 3);
  assert.equal(restored[0].resident, 'mechanic');
  assert.equal(restored[1].resident, null);
  assert.equal(restored[2].resident, null);
  assert.deepEqual(F.furnitureBonuses(restored, saved.run.residents).stats, {
    armor: 2,
  });
});

test('Backpack shapes rotate, fill corners, and reject overlap and out-of-bounds moves', () => {
  assert.deepEqual(Bag.itemCells('cannon', 4), Bag.itemCells('cannon', 0));
  assert.equal(new Set(Bag.itemCells('engine', 1).map(String)).size, 4);
  const bag = [{ uid: 1, id: 'cannon', x: 0, y: 0, rotation: 0 }];
  assert.equal(Bag.canPack(bag, 'armor', 0, 0, 0), false);
  assert.equal(Bag.canPack(bag, 'armor', 4, 3, 0), true);
  assert.equal(Bag.canPack(bag, 'armor', 5, 3, 0), false);
  assert.equal(Bag.movePacked(bag, 1, 5, 0, 0), bag);
  const vertical = Bag.movePacked(bag, 1, 5, 0, 1);
  assert.notEqual(vertical, bag);
  assert.equal(vertical[0].rotation, 1);
});
test('Backpack transfers conserve modules and cannot heal by repeated installation', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 7);
  const slot = E.apartmentSlot('nina', 1);
  run = M.equip(run, 'armor', slot, meta);
  run.hp = 1;
  const health = run.hp;
  const items = [...run.items];
  for (let i = 0; i < 12; i++) {
    run = M.stowModule(run, meta, slot);
    assert.equal(run.backpack.length, 1);
    run = M.readSave(M.saveData(meta, run)).run;
    run = M.installPacked(run, meta, run.backpack[0].uid, slot);
    assert.equal(run.backpack.length, 0);
    assert.deepEqual(run.items, items);
    assert.ok(Math.abs(run.hp - health) < 1e-8);
  }
  run = M.packItem(run, meta, 'cannon');
  const moved = {
    ...run,
    backpack: Bag.movePacked(run.backpack, run.backpack[0].uid, 5, 1, 1),
  };
  assert.deepEqual(M.readSave(M.saveData(meta, moved)).run, moved);
  const combat = { ...run, page: 'combat' };
  assert.equal(M.packItem(combat, meta, 'cannon'), combat);
  assert.equal(M.installPacked(combat, meta, run.backpack[0].uid, 0), combat);
});
test('Full module storage rejects acquisitions but allows a lossless equipment swap', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 8);
  for (let i = 0; i < 30; i++) run = M.packItem(run, meta, 'kitchen');
  assert.equal(run.backpack.length, 30);
  assert.equal(M.packItem(run, meta, 'cannon'), run);
  const next = M.installPacked(run, meta, run.backpack[0].uid, 0);
  assert.equal(next.items[0], 'kitchen');
  assert.equal(next.backpack.length, 30);
  assert.equal(next.backpack.filter((i) => i.id === 'cannon').length, 1);
  assert.equal(next.backpack.filter((i) => i.id === 'kitchen').length, 29);
  assert.deepEqual(M.readSave(M.saveData(meta, next)).run, next);
});

test('Residents rotate and reject overlap, illegal coordinates, duplicates and unavailable people', () => {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 18);
  for (const r of R.RESIDENTS) {
    assert.deepEqual(R.residentCells(r.id, 4), R.residentCells(r.id));
    for (let rotation = 0; rotation < 4; rotation++)
      assert.equal(
        new Set(R.residentCells(r.id, rotation).map(String)).size,
        r.shape.length,
      );
  }
  for (const room of [
    { id: 'nina', x: 0, y: 0, rotation: 0 },
    { id: 'nina', x: 5, y: 4, rotation: 0 },
    { id: 'nina', x: 0.5, y: 3, rotation: 0 },
    { id: 'nina', x: 0, y: 3, rotation: Infinity },
    { id: 'marta', x: 3, y: 3, rotation: 0 },
  ])
    assert.equal(M.houseResident(run, meta, room), run);
  assert.equal(M.reserveResident(run, meta, 'mechanic'), run);
  const bad = [
    ...run.residents,
    run.residents[0],
    { id: 'wat', x: 1, y: 1, rotation: 0 },
    { id: 'nina', x: NaN, y: 2, rotation: 0 },
  ];
  assert.deepEqual(
    R.restoreResidents(bad, meta.residents, run.character),
    run.residents,
  );
  const combat = { ...run, page: 'combat' };
  assert.equal(M.reserveResident(combat, meta, 'nina'), combat);
});
test('Resident lists separate the expedition from refuge and undiscovered people after reloading', () => {
  const meta = M.initialMeta();
  meta.wins = 2;
  meta.residents = R.residentRoster([], 2);
  let run = M.makeRun(meta, 'flora', 1, 19);
  const ids = (people) => people.map((person) => person.id).sort();
  let groups = R.residentGroups(meta.residents, run.residents);
  assert.deepEqual(ids(groups.aboard), ['flora', 'lev', 'nina']);
  assert.deepEqual(ids(groups.reserve), ['mechanic', 'spark']);
  assert.deepEqual(ids(groups.missing), [
    'boris',
    'danilo',
    'marta',
    'solomia',
  ]);
  const before = M.statsFor(run, meta);
  run = M.reserveResident(run, meta, 'lev');
  const restored = M.readSave(M.saveData(meta, run));
  assert.equal(restored.run.character, 'flora');
  assert.equal(restored.run.chapter, 1);
  groups = R.residentGroups(restored.meta.residents, restored.run.residents);
  assert.deepEqual(ids(groups.aboard), ['flora', 'nina']);
  assert.deepEqual(ids(groups.reserve), ['lev', 'mechanic', 'spark']);
  assert.equal(
    M.statsFor(restored.run, restored.meta).damage,
    before.damage - 3,
  );
  const room = R.residentSpace(restored.run.residents, 'lev');
  const returned = M.houseResident(restored.run, restored.meta, room);
  assert.equal(
    R.residentGroups(meta.residents, returned.residents).aboard.length,
    3,
  );
  assert.equal(M.statsFor(returned, meta).damage, before.damage);
});

test('Room drawings omit internal walls and preserve the shape through four rotations', () => {
  for (const [id, perimeter] of [
    ['flora', 8],
    ['mechanic', 10],
    ['nina', 8],
    ['lev', 8],
    ['danilo', 6],
    ['solomia', 10],
  ]) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const geometry = R.roomGeometry(id, rotation);
      assert.equal(
        geometry.edgeCount,
        perimeter,
        `${id}, rotation ${rotation}`,
      );
      assert.equal(
        (geometry.floor.match(/Z/g) || []).length,
        R.RESIDENT_BY_ID[id].shape.length,
      );
    }
  }
  assert.equal(R.roomGeometry('flora').walls.includes('M100,0v100'), false);
  assert.equal(R.roomGeometry('flora').walls.includes('M100,100h-100'), false);
});

test('Household arrangement changes adjacency bonuses without duplicating residents or farming health', () => {
  const meta = M.initialMeta();
  meta.wins = 5;
  meta.residents = R.residentRoster(['marta'], 5);
  let run = M.makeRun(meta, 'mechanic', 0, 19);
  run.hp = 61;
  const hp = run.hp,
    room = run.residents.find((r) => r.id === 'nina');
  for (let i = 0; i < 12; i++) {
    run = M.reserveResident(run, meta, 'nina');
    run = M.houseResident(run, meta, room);
  }
  assert.ok(Math.abs(run.hp - hp) < 1e-8);
  assert.equal(run.residents.filter((r) => r.id === 'nina').length, 1);
  const near = [
    { id: 'mechanic', x: 0, y: 0, rotation: 0 },
    { id: 'spark', x: 1, y: 0, rotation: 0 },
  ];
  const far = [near[0], { id: 'spark', x: 3, y: 3, rotation: 0 }];
  const a = M.statsFor({ ...run, residents: near }, meta),
    b = M.statsFor({ ...run, residents: far }, meta);
  assert.ok(a.rate > b.rate);
  assert.equal(a.damage, b.damage);
  assert.equal(a.synergies.filter((s) => s.startsWith('Спільна')).length, 1);
});
test('Rescue is an event choice and persists after defeat; reserve removal persists', () => {
  let meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 22);
  assert.equal(M.rescueResident(run, meta), null);
  run = { ...run, page: 'event', kind: 'event', path: [0, 0, 1], step: 2 };
  const rescue = M.rescueResident(run, meta);
  assert.equal(rescue.id, 'marta');
  assert.equal(M.rescueResident(rescue.run, rescue.meta), null);
  run = M.reserveResident(rescue.run, rescue.meta, 'marta');
  const saved = M.readSave(M.saveData(rescue.meta, run));
  assert.ok(saved.meta.residents.includes('marta'));
  assert.ok(!saved.run.residents.some((r) => r.id === 'marta'));
  assert.ok(
    M.finishRun(rescue.meta, run, false).meta.residents.includes('marta'),
  );
});
test('v0.2 save migration preserves module identities, route, economy and research snapshots', () => {
  const meta = M.initialMeta();
  meta.wins = 2;
  M.unlock(meta);
  const run = M.makeRun(meta, 'mechanic', 2, 88);
  Object.assign(run, {
    step: 2,
    page: 'shop',
    kind: 'shop',
    path: [0, 0, 0],
    coins: 117,
    scrap: 2,
    hp: 63,
    offers: ['cannon'],
    bought: [0],
    rerolls: 2,
    backpack: [
      { uid: 7, id: 'armor', x: 0, y: 0, rotation: 0 },
      { uid: 19, id: 'cannon', x: 5, y: 0, rotation: 1 },
    ],
    nextBagId: 20,
  });
  delete run.residents;
  delete meta.residents;
  delete meta.scenesSeen;
  delete meta.sceneProgress;
  delete meta.storyRevision;
  const restored = M.readSave(M.saveData(meta, run));
  for (const key of [
    'items',
    'backpack',
    'nextBagId',
    'coins',
    'scrap',
    'hp',
    'offers',
    'bought',
    'rerolls',
    'path',
    'research',
    'page',
  ])
    assert.deepEqual(restored.run[key], run[key], key);
  assert.equal(restored.run.residents.length, 3);
  assert.deepEqual(restored.meta.scenesSeen, []);
  assert.deepEqual(
    M.readSave(M.saveData(restored.meta, restored.run)),
    restored,
  );
});
test('Cutscenes resume safely, preserve watched progress and lock the ending until chapter five', () => {
  const meta = M.initialMeta();
  meta.scenesSeen = ['prologue', 'victory-4', 'missing'];
  meta.sceneProgress = { id: 'prologue', index: 3 };
  let saved = M.readSave(M.saveData(meta, null));
  assert.deepEqual(saved.meta.scenesSeen, ['prologue']);
  assert.deepEqual(saved.meta.sceneProgress, { id: 'prologue', index: 3 });
  assert.equal(Scenes.sceneUnlocked('victory-4', 4), false);
  assert.equal(Scenes.sceneUnlocked('victory-4', 5), true);
  assert.equal(Scenes.sceneUnlocked('origins', 0), true);
  assert.deepEqual(
    Scenes.restoreSceneProgress({ id: 'origins', index: 3 }, 0),
    { id: 'origins', index: 3 },
  );
  assert.equal(
    Scenes.restoreSceneProgress({ id: 'victory-4', index: 0 }, 0),
    null,
  );
  assert.equal(
    Scenes.restoreSceneProgress({ id: 'prologue', index: NaN }, 0),
    null,
  );
  assert.equal(
    Scenes.restoreSceneProgress({ id: 'prologue', index: 99 }, 0).index,
    Scenes.SCENE_BY_ID.prologue.shots.length - 1,
  );
});
test('Rewritten story restarts only the introduction once and preserves the active expedition', () => {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 55);
  meta.storyRevision = 2;
  meta.scenesSeen = ['prologue', 'arrival-0'];
  meta.sceneProgress = { id: 'prologue', index: 2 };
  run.coins = 117;
  run.hp = 63;
  const migrated = M.readSave(M.saveData(meta, run));
  assert.deepEqual(migrated.run, run);
  assert.equal(migrated.meta.storyRevision, Scenes.STORY_REVISION);
  assert.deepEqual(migrated.meta.sceneProgress, { id: 'prologue', index: 0 });
  assert.deepEqual(migrated.meta.scenesSeen, ['arrival-0']);
  migrated.meta.scenesSeen.push('prologue');
  migrated.meta.sceneProgress = null;
  const next = M.readSave(M.saveData(migrated.meta, migrated.run));
  assert.deepEqual(next, migrated);
});
test('Prototype property names and unsafe module IDs cannot corrupt a run', () => {
  for (const id of ['constructor', 'toString', '__proto__']) {
    const meta = M.initialMeta(),
      run = M.makeRun(meta, 'mechanic', 0, 35);
    meta.residents.push(id);
    meta.scenesSeen.push(id);
    meta.sceneProgress = { id, index: 0 };
    run.residents.push({ id, x: 3, y: 3, rotation: 0 });
    run.backpack = [{ id: 'cannon', uid: 2 ** 53, x: 0, y: 0, rotation: 0 }];
    const saved = M.readSave(M.saveData(meta, run));
    assert.ok(saved.run);
    assert.equal(saved.error, undefined);
    assert.ok(!saved.meta.residents.includes(id));
    assert.equal(saved.meta.sceneProgress, null);
    assert.equal(saved.run.backpack.length, 0);
    assert.ok(M.packItem(saved.run, saved.meta, 'cannon').nextBagId <= 1e8 + 1);
    assert.equal(Scenes.sceneUnlocked(id, 0), false);
  }
});
test('Each boss has its own attacks; warning zones are harmless until armed', () => {
  const signatures = [];
  for (let chapter = 0; chapter < 5; chapter++) {
    const attacks = Array.from({ length: 4 }, (_, beat) =>
      Boss.bossPattern(chapter, 0, beat, 600, 400, 800, 500),
    );
    signatures.push(
      JSON.stringify(
        attacks.map((a) => [
          a.shots.length,
          a.hazards.length,
          a.summons.length,
        ]),
      ),
    );
    for (const a of attacks) {
      assert.ok(a.cooldown > 0);
      assert.ok(a.shots.every((s) => Number.isFinite(s.angle) && s.speed > 0));
      assert.ok(a.hazards.every((h) => !Boss.hazardContains(h, h.x, h.y)));
    }
  }
  assert.equal(new Set(signatures).size, 5);
  const laser = Boss.bossPattern(3, 1, 0, 600, 400, 800, 500).hazards[0];
  assert.equal(Boss.hazardContains({ ...laser, age: 0.1 }, 800, 500), true);
  assert.equal(Boss.hazardContains({ ...laser, age: 0.1 }, 800, 700), false);
  assert.equal(
    Boss.hazardContains({ ...laser, age: laser.duration }, 800, 500),
    false,
  );
});
test('Lore records survive a defeat and disclose the resolution only after the final victory', () => {
  const meta = M.initialMeta();
  assert.equal(meta.lore.length, 2);
  const afterLoss = M.finishRun(
    meta,
    M.makeRun(meta, 'mechanic', 0, 1),
    false,
  ).meta;
  assert.ok(afterLoss.lore.includes('rust-arrival'));
  assert.equal(afterLoss.lore.includes('rust-cleared'), false);
  assert.equal(Lore.loreForProgress([], 4, 4).includes('dawn'), false);
  assert.equal(Lore.loreForProgress([], 5).length, 12);
  assert.deepEqual(
    M.readSave(M.saveData(afterLoss, null)).meta.lore,
    afterLoss.lore,
  );
});

test('An abandoned empty run cannot farm permanent currency', () => {
  let meta = M.initialMeta();
  for (let i = 0; i < 20; i++)
    meta = M.finishRun(meta, M.makeRun(meta, 'mechanic', 0, i), false).meta;
  assert.equal(meta.cores, 0);
  assert.equal(meta.wins, 0);
  assert.equal(meta.runs, 20);
});
test('Five different chapter victories unlock the story and the full chapter pool; replay cannot skip a chapter', () => {
  let meta = M.initialMeta();
  for (let chapter = 0; chapter < 5; chapter++) {
    const r = M.makeRun(meta, 'mechanic', chapter, 100 + chapter);
    r.kills = 70;
    meta = M.finishRun(meta, r, true).meta;
    assert.equal(meta.wins, chapter + 1);
    const replay = M.finishRun(
      meta,
      M.makeRun(meta, 'mechanic', 0, 90),
      true,
    ).meta;
    assert.equal(replay.wins, meta.wins);
  }
  assert.ok(meta.unlocked.includes('crown'));
  assert.ok(meta.unlocked.includes('portal'));
  assert.equal(meta.unlocked.length, 34); // dash and scrapping unlocks remain; kill unlocks were earned
});
test('Action unlocks survive a loss, and no item is duplicated', () => {
  const meta = M.initialMeta();
  meta.scrapped = 5;
  const r = M.makeRun(meta, 'mechanic', 0, 1);
  r.kills = 150;
  r.dashes = 10;
  const result = M.finishRun(meta, r, false);
  assert.ok(result.meta.unlocked.includes('ram'));
  assert.ok(result.meta.unlocked.includes('capacitor'));
  assert.ok(result.meta.unlocked.includes('recycler'));
  assert.equal(new Set(result.meta.unlocked).size, result.meta.unlocked.length);
});
test('Research is snapshotted per run, modules change stats, and adjacency is spatial', () => {
  const meta = M.initialMeta();
  meta.wins = 2;
  M.unlock(meta);
  const run = M.makeRun(meta, 'mechanic', 0, 1);
  const damage = M.statsFor(run, meta).damage;
  meta.research.garage = 5;
  assert.equal(M.statsFor(run, meta).damage, damage);
  run.items = E.emptyEquipment();
  run.items[E.apartmentSlot('mechanic', 1)] = 'generator';
  run.items[E.apartmentSlot('mechanic', 2)] = 'battery';
  const near = M.statsFor(run, meta);
  run.items[E.apartmentSlot('mechanic', 2)] = null;
  run.items[E.apartmentSlot('lev', 2)] = 'battery';
  const far = M.statsFor(run, meta);
  assert.ok(near.rate > far.rate);
  assert.equal(near.synergies.length, 1);
  const next = M.equip(run, 'armor', 2, meta);
  assert.ok(M.statsFor(next, meta).health > M.statsFor(run, meta).health);
});
test('Malformed saves are recoverable; loaded chapters and room IDs cannot crash the game', () => {
  assert.equal(M.readSave('{broken').error, true);
  assert.equal(M.readSave(null).run, null);
  const meta = M.initialMeta();
  const r = M.makeRun(meta, 'mechanic', 0, 1);
  delete r.chapter;
  r.items[5] = 'unknown';
  const recovered = M.readSave(M.saveData(meta, r));
  assert.equal(recovered.run.chapter, 0);
  assert.equal(recovered.run.items[5], null);
  r.chapter = 0.5;
  assert.equal(M.readSave(M.saveData(meta, r)).run.chapter, 0);
  const round = M.readSave(
    M.saveData(meta, M.makeRun(meta, 'mechanic', 0, 23)),
  );
  assert.deepEqual(round.run, M.makeRun(meta, 'mechanic', 0, 23));
});
test('Shop and reward offers never contain locked items or duplicates; elite drops favor higher rarity', () => {
  const meta = M.initialMeta();
  meta.wins = 5;
  meta.kills = 200;
  meta.dashes = 10;
  meta.scrapped = 5;
  M.unlock(meta);
  assert.equal(meta.unlocked.length, 36);
  let basic = 0,
    elite = 0;
  for (let seed = 0; seed < 2000; seed++) {
    const r = M.makeRun(meta, 'mechanic', 0, seed);
    const offer = M.offers(meta, r, 4, 41);
    assert.equal(new Set(offer).size, 4);
    basic += ITEM_BY_ID[M.offers(meta, r, 1, 73)[0]].rarity;
    elite += ITEM_BY_ID[M.offers(meta, r, 1, 73, true)[0]].rarity;
  }
  assert.ok(elite > basic * 1.12);
  const initial = M.initialMeta(),
    r = M.makeRun(initial, 'mechanic', 0, 1);
  assert.ok(
    M.offers(initial, r, 4, 1).every((id) => initial.unlocked.includes(id)),
  );
});
test('Blocked map nodes cannot be entered and shop economics persist through reload', () => {
  const meta = M.initialMeta();
  let r = M.makeRun(meta, 'mechanic', 0, 1);
  assert.equal(M.enterNode(r, meta, '7:0'), r);
  r = completeRoom(M.enterNode(r, meta, '0:0'));
  r = completeRoom(M.enterNode(r, meta, '1:0'));
  const shop = M.enterNode(r, meta, '2:0');
  assert.equal(shop.page, 'shop');
  assert.equal(shop.offers.length, 4);
  shop.bought = [0];
  shop.coins = 7;
  shop.rerolls = 2;
  const saved = M.readSave(M.saveData(meta, shop));
  assert.deepEqual(saved.run.bought, [0]);
  assert.equal(saved.run.coins, 7);
  assert.equal(saved.run.rerolls, 2);
  assert.deepEqual(saved.run.path, [0, 0, 0]);
  assert.equal(M.enterNode(shop, meta, '2:0'), shop);
});
function completeRoom(run) {
  return M.nextNode({
    ...run,
    page: run.page === 'combat' ? 'reward' : run.page,
  });
}
test('Every branch has a legal continuation and every full route ends at the boss', () => {
  const meta = M.initialMeta();
  for (const seed of [0, 1, 23, 900, 123456]) {
    let frontier = [M.makeRun(meta, 'mechanic', 0, seed)];
    const seen = new Set();
    for (let step = 0; step < 8; step++) {
      const next = [];
      for (const run of frontier) {
        const choices = M.availableColumns(run);
        assert.ok(choices.length > 0);
        for (const column of choices) {
          seen.add(`${step}:${column}`);
          const entered = M.enterNode(run, meta, `${step}:${column}`);
          assert.notEqual(entered, run);
          assert.equal(entered.path.length, step + 1);
          if (step === 7) {
            assert.equal(entered.kind, 'boss');
            assert.equal(M.nextNode(entered), entered);
          } else next.push(completeRoom(entered));
        }
      }
      frontier = next;
    }
    assert.equal(
      seen.size,
      M.makeRun(meta, 'mechanic', 0, seed).nodes.flat().length,
    );
  }
});
test('A branch choice excludes unconnected rooms and survives the combat checkpoint', () => {
  const meta = M.initialMeta();
  let run = M.makeRun(meta, 'mechanic', 0, 7);
  assert.equal(M.nextNode(run), run);
  run = completeRoom(M.enterNode(run, meta, '0:0'));
  run = M.enterNode(run, meta, '1:1');
  const restored = M.readSave(M.saveData(meta, run)).run;
  assert.equal(restored.page, 'map');
  assert.deepEqual(M.availableColumns(restored), [1]);
  assert.equal(M.enterNode(restored, meta, '1:0'), restored);
  run = completeRoom(M.enterNode(restored, meta, '1:1'));
  assert.deepEqual(M.availableColumns(run), [1, 2]);
  assert.equal(M.enterNode(run, meta, '2:0'), run);
  assert.equal(M.enterNode(run, meta, '3:1'), run);
  assert.equal(M.enterNode(run, meta, '1:1'), run);
  assert.deepEqual(M.reachableColumns(run)[7], [0]);
});
test('Legacy maps, stores, events, rewards and combat retain their progress during migration', () => {
  const meta = M.initialMeta();
  for (let seed = 0; seed < 20; seed++) {
    for (const [step, page, kind] of [
      [1, 'map', 'battle'],
      [2, 'shop', 'shop'],
      [4, 'event', 'event'],
      [3, 'reward', 'elite'],
      [5, 'combat', 'elite'],
    ]) {
      const old = M.makeRun(meta, 'mechanic', 0, seed);
      delete old.path;
      delete old.routeVersion;
      delete old.historyStart;
      Object.assign(old, {
        step,
        page,
        kind,
        coins: 117,
        scrap: 2,
        hp: 63,
        offers: ['cannon'],
        bought: [0],
        reward: ['engine'],
        eventDone: true,
        rerolls: 2,
      });
      const { run } = M.readSave(M.saveData(meta, old));
      assert.equal(run.coins, 117);
      assert.equal(run.hp, 63);
      assert.equal(run.scrap, 2);
      assert.equal(run.step, step);
      assert.equal(run.kind, kind);
      assert.deepEqual(run.items, old.items);
      assert.deepEqual(run.offers, old.offers);
      assert.deepEqual(run.bought, old.bought);
      assert.deepEqual(run.reward, old.reward);
      assert.equal(run.eventDone, true);
      assert.equal(run.historyStart, step);
      assert.equal(run.page, page === 'combat' ? 'map' : page);
      assert.ok(M.availableColumns(run).length > 0);
      for (let i = 1; i < run.path.length; i++)
        assert.ok(M.routeTargets(i - 1, run.path[i - 1]).includes(run.path[i]));
      assert.deepEqual(M.readSave(M.saveData(meta, run)).run, run);
    }
  }
});
test('Invalid saved route indices recover to a connected path without erasing the run', () => {
  const meta = M.initialMeta();
  for (const path of [[99], [0, -1, 300], [0, 0, 2], 'bad']) {
    const run = M.makeRun(meta, 'mechanic', 0, 1);
    Object.assign(run, {
      step: 2,
      page: 'shop',
      kind: 'shop',
      path,
      coins: 71,
    });
    const restored = M.readSave(M.saveData(meta, run)).run;
    assert.equal(restored.coins, 71);
    assert.equal(restored.page, 'shop');
    assert.equal(restored.kind, 'shop');
    assert.equal(restored.path.length, 3);
    for (let i = 1; i < restored.path.length; i++)
      assert.ok(
        M.routeTargets(i - 1, restored.path[i - 1]).includes(restored.path[i]),
      );
  }
});
test('Diagonal, cardinal and analog dashes have the same speed', () => {
  const meta = M.initialMeta();
  const distance = (mode) => {
    const b = new Battle(
      null,
      M.makeRun(meta, 'mechanic', 0, 1),
      meta,
      new AudioEngine(),
      () => {},
      () => {},
    );
    if (mode === 'diagonal') {
      b.keys.add('KeyD');
      b.keys.add('KeyS');
    } else if (mode === 'analog') b.stick = { x: 0.3, y: 0 };
    else b.keys.add('KeyD');
    b.update(0.01);
    const x = b.x,
      y = b.y;
    b.dash();
    b.update(0.1);
    return Math.hypot(b.x - x, b.y - y);
  };
  assert.ok(Math.abs(distance('diagonal') - distance('cardinal')) < 0.01);
  assert.ok(Math.abs(distance('analog') - distance('cardinal')) < 0.01);
});
test('Combat damage, collection, level-up, pause, and terminal event work independently of rendering', () => {
  const meta = M.initialMeta(),
    r = M.makeRun(meta, 'mechanic', 0, 1);
  let calls = 0,
    result;
  const b = new Battle(
    null,
    r,
    meta,
    new AudioEngine(),
    () => {},
    (x) => {
      calls++;
      result = x;
    },
  );
  b.paused = true;
  b.update(1);
  assert.equal(b.elapsed, 0);
  b.paused = false;
  b.drops.push(
    { x: b.x, y: b.y, kind: 'coin', value: 10 },
    { x: b.x, y: b.y, kind: 'xp', value: 50 },
  );
  b.update(0.02);
  assert.equal(b.run.coins, r.coins + 10);
  assert.ok(b.run.level > 1);
  b.stats.health = 10000;
  b.run.hp = 10000;
  b.stats.damage = 500;
  b.stats.regen = 100;
  for (let i = 0; i < 3000 && !b.ended; i++) {
    b.x = 800 + Math.cos(i * 0.008) * 200;
    b.y = 500 + Math.sin(i * 0.008) * 180;
    b.update(0.025);
  }
  assert.ok(b.ended);
  assert.equal(result.won, true);
  assert.equal(calls, 1);
  b.finish(false);
  assert.equal(calls, 1);
  assert.ok(result.run.kills > 0);
});
test('All five boss encounters terminate with a win and never produce NaN state', () => {
  const meta = M.initialMeta();
  meta.wins = 5;
  M.unlock(meta);
  for (let chapter = 0; chapter < 5; chapter++) {
    const r = M.makeRun(meta, 'spark', chapter, 44);
    r.step = 7;
    r.kind = 'boss';
    r.items = [
      'reactor',
      'chain',
      'tesla',
      'vampire',
      'heart',
      'portal',
      'mirror',
      'garden',
      'crown',
    ];
    r.hp = M.statsFor(r, meta).health;
    let result;
    const b = new Battle(
      null,
      r,
      meta,
      new AudioEngine(),
      () => {},
      (x) => (result = x),
    );
    b.stats.regen = 200;
    for (let i = 0; i < 6000 && !b.ended; i++) {
      b.x = 800 + Math.cos(i * 0.007) * 90;
      b.y = 500 + Math.sin(i * 0.007) * 90;
      if (b.pulseCd <= 0) b.pulse();
      b.update(0.025);
    }
    assert.ok(b.ended, `chapter ${chapter}`);
    assert.equal(result.won, true);
    assert.ok(Number.isFinite(result.run.hp));
  }
});
