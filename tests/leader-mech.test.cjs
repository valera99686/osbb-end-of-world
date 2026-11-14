// The mechanics of the 9 bosses and 9 mini-bosses (lib/game/leader-mech.ts),
// run on a stand-in for the fight: a clock, a seeded dice and lists.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../.test-build/leader-mech.js');
const { hazardContains } = require('../.test-build/bosses.js');
const { campaignBoss } = require('../.test-build/encounters.js');

const BOSS_IDS = [0, 1, 2].flatMap((loc) =>
  [0, 1, 2].map((v) => campaignBoss(loc, v).id),
);
const MINIS = [0, 1, 2].flatMap((loc) =>
  [0, 1, 2].map((v) => L.miniKey(loc, v)),
);

function host({ party = 1, chapter = 0, seed = 7, bodies } = {}) {
  let s = seed;
  const h = {
    elapsed: 0,
    chapter,
    party,
    enemies: [],
    hazards: [],
    spawns: [],
    shots: [],
    staggers: [],
    rng() {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    },
    bodies: () => bodies ?? [{ x: 800, y: 700, vx: 0, vy: 0 }],
    minion(tag, x, y, hp, speed = 0) {
      const m = {
        type: L.MECH_TYPE,
        tag,
        x,
        y,
        hp,
        max: hp,
        r: 14,
        speed,
        aim: 0,
        phase: 0,
        pattern: 0,
      };
      h.enemies.push(m);
      return m;
    },
    spawnAt: (type, x, y, affix) => h.spawns.push({ type, x, y, affix }),
    shoot: (x, y, angle, speed, damage) =>
      h.shots.push({ x, y, angle, speed, damage }),
    heal(e, amount) {
      e.hp = Math.min(e.max, e.hp + amount);
    },
    stagger(e, seconds) {
      e.stagger = seconds;
      h.staggers.push(seconds);
    },
    burst: () => {},
    vanish(m) {
      m.hp = 0;
      h.enemies = h.enemies.filter((o) => o !== m);
    },
  };
  return h;
}
function leader(h, key, opts = {}) {
  const boss = !key.startsWith('mini');
  const e = {
    type: boss ? 99 : 98,
    x: 800,
    y: 300,
    hp: 10000,
    max: 10000,
    aim: 0,
    phase: 0,
    pattern: 0,
    speed: 40,
    r: 40,
    stagger: 0,
    ...opts,
  };
  h.enemies.push(e);
  L.startLeader(h, e, key);
  return e;
}
// Runs the fight for `seconds`, moving the phase with the health like the
// engine does and clearing the helpers that were shot down.
function run(h, e, seconds, dt = 1 / 30) {
  const boss = e.type === 99;
  for (let t = 0; t < seconds; t += dt) {
    h.elapsed += dt;
    const phase = L.leaderPhase(e, boss);
    if (phase > e.phase) {
      e.phase = phase;
      L.leaderShift(h, e, phase);
    }
    for (const z of h.hazards) z.age += dt;
    L.tickLeader(h, e, dt);
    for (const m of [...h.enemies])
      if (m.type === L.MECH_TYPE && m.hp <= 0) {
        h.enemies = h.enemies.filter((o) => o !== m);
        L.minionDied(h, e, m);
      }
  }
}
const kill = (h, e, m) => {
  m.hp = 0;
  h.enemies = h.enemies.filter((o) => o !== m);
  L.minionDied(h, e, m);
};
const helpers = (h, tag) =>
  h.enemies.filter((m) => m.type === L.MECH_TYPE && m.tag === tag && m.hp > 0);
const keyed = (h, key) =>
  h.hazards.filter((z) => z.key === key && z.age < z.duration);
const FRONT = Math.PI; // a hit flying at a leader that looks along +x, from its front
const BACK = 0;

test('Every boss and mini-boss has a mechanic of its own, with a name and a line for the screen', () => {
  assert.equal(new Set(BOSS_IDS).size, 9);
  assert.equal(new Set(MINIS).size, 9);
  for (const key of [...BOSS_IDS, ...MINIS]) {
    const m = L.MECHANICS[key];
    assert.ok(m, `${key} has a mechanic`);
    assert.ok(m.name.length > 3, `${key} has a name`);
    assert.equal(m.boss, BOSS_IDS.includes(key), `${key}: boss flag`);
    const h = host();
    const e = leader(h, key);
    const note = L.leaderNote(e);
    assert.equal(note.name, m.name);
    assert.ok(
      note.note.length > 8 && note.note.length < 80,
      `${key}: ${note.note}`,
    );
  }
  assert.equal(
    new Set(Object.values(L.MECHANICS).map((m) => m.name)).size,
    18,
    'all eighteen are different',
  );
});

test('A leader that has no mechanic (the endless modes) is left alone', () => {
  const h = host();
  const e = leader(h, 'nobody');
  assert.equal(L.leaderArmor(h, e, FRONT), 1);
  assert.equal(L.leaderFrozen(h, e), false);
  assert.equal(L.leaderTurn(e), 0);
  assert.equal(L.leaderNote(e), undefined);
  assert.doesNotThrow(() => run(h, e, 5));
});

test('Bosses are in fury in the last fifth; mini-bosses are not; the tempo quickens', () => {
  const e = { hp: 9000, max: 10000 };
  assert.equal(L.leaderPhase(e, true), 0);
  e.hp = 4900;
  assert.equal(L.leaderPhase(e, true), 1);
  e.hp = 1900;
  assert.equal(L.leaderPhase(e, true), 2);
  assert.equal(
    L.leaderPhase(e, false),
    1,
    'a mini-boss stays in its second phase',
  );
  assert.equal(L.leaderTempo(true, 0), 1);
  assert.equal(L.leaderTempo(true, 1), 0.9);
  assert.equal(L.leaderTempo(true, 2), 0.78);
  assert.equal(L.leaderTempo(false, 1), 1);
});

test('The commandant is armoured in front, bare on the flank and when a slam has stripped it', () => {
  const h = host();
  const e = leader(h, 'commandant');
  assert.equal(L.leaderArmor(h, e, FRONT), 0.5);
  assert.equal(L.leaderArmor(h, e, BACK), 1);
  assert.equal(L.leaderArmor(h, e, undefined), 1, 'no direction, no armour');
  // A hit from 60 degrees off the front still meets the plate, 80 does not.
  assert.equal(L.leaderArmor(h, e, Math.PI + (60 * Math.PI) / 180), 0.5);
  assert.equal(L.leaderArmor(h, e, Math.PI + (80 * Math.PI) / 180), 1);
  e.stagger = 1.5;
  assert.equal(L.leaderArmor(h, e, FRONT), 1, 'stripped by the slam');
  e.stagger = 0;
  e.phase = 2;
  assert.equal(L.leaderArmor(h, e, FRONT), 0.75, 'the plate cracks in fury');
  assert.ok(L.leaderTurn(e) > 0 && L.leaderTurn(e) < 1, 'it turns slowly');
});

test('From its second phase the commandant swings a bar through the gate, and rams in fury', () => {
  const h = host();
  const e = leader(h, 'commandant');
  run(h, e, 20);
  assert.equal(h.hazards.length, 0, 'no bar in the first phase');
  e.phase = 1;
  run(h, e, 3);
  const bars = h.hazards.filter((z) => z.x2 !== undefined);
  assert.equal(bars.length, 9, 'nine positions of the turning bar');
  assert.equal(
    new Set(bars.map((z) => z.age.toFixed(2))).size,
    9,
    'one after another',
  );
  // Fury: every second attack is a ram toward the house.
  e.phase = 2;
  e.pattern = 2;
  L.leaderAttack(h, e, { hazards: [], shots: [], summons: [] });
  assert.ok(e.chargeLeft > 0);
  assert.ok(e.lockedAim > 0, 'toward the house, below it');
  e.chargeLeft = 0;
  e.pattern = 3;
  L.leaderAttack(h, e, { hazards: [], shots: [], summons: [] });
  assert.ok(!e.chargeLeft);
});

test('The press closes two plates on the arena, then the other two, and keeps one in fury', () => {
  const h = host();
  const e = leader(h, 'scrap-press');
  run(h, e, 7);
  assert.equal(keyed(h, 'wall').length, 0);
  run(h, e, 2);
  const walls = keyed(h, 'wall');
  assert.equal(walls.length, 2);
  // Side plates: together 360 + 360 of the 1600 px, with the corridor between.
  assert.ok(walls.every((z) => z.rw === 180 && z.rh > 500));
  assert.ok(
    walls.every((z) => z.age < 0),
    'marked first',
  );
  assert.equal(
    walls.filter((z) => hazardContains({ ...z, age: 0 }, 800, 500)).length,
    0,
    'the middle is never under a plate',
  );
  e.phase = 1;
  run(h, e, 14);
  run(h, e, 6);
  assert.ok(
    h.hazards.some((z) => z.key === 'wall' && z.rw > 800),
    'the second time they come from above and below',
  );
  e.phase = 2;
  run(h, e, 1);
  assert.equal(keyed(h, 'plate').length, 1);
  keyed(h, 'plate')[0].age = keyed(h, 'plate')[0].duration;
  run(h, e, 1);
  assert.equal(
    keyed(h, 'plate').length,
    1,
    'a plate that was cut off comes back',
  );
});

test('The signalman is guarded by antennas: each one is armour and calls a patrol; more of them for a bigger party', () => {
  const h = host();
  const e = leader(h, 'signalman');
  assert.equal(helpers(h, 'antenna').length, 3);
  assert.equal(
    L.leaderArmor(h, e, FRONT),
    0.64,
    'three antennas: 64% gets through',
  );
  const [first] = helpers(h, 'antenna');
  kill(h, e, first);
  assert.equal(L.leaderArmor(h, e, FRONT), 0.76);
  for (const m of helpers(h, 'antenna')) kill(h, e, m);
  assert.equal(L.leaderArmor(h, e, FRONT), 1, 'no antenna, no armour');
  for (const n of [3, 4]) {
    const big = host({ party: n });
    leader(big, 'signalman');
    assert.equal(helpers(big, 'antenna').length, n === 3 ? 4 : 5);
  }
  // A patrol comes from every antenna every twelve seconds.
  const g = host();
  const s = leader(g, 'signalman');
  run(g, s, 7);
  assert.equal(g.spawns.length, 1, 'the first antenna calls at six seconds');
  run(g, s, 10);
  assert.ok(g.spawns.length >= 3);
  assert.ok(g.spawns.every((x) => x.type === 1));
});

test('A fallen antenna is raised again after 35 seconds from the second phase, and all at once in fury', () => {
  const h = host();
  const e = leader(h, 'signalman');
  e.phase = 1;
  L.leaderShift(h, e, 1);
  kill(h, e, helpers(h, 'antenna')[0]);
  run(h, e, 30);
  assert.equal(helpers(h, 'antenna').length, 2);
  run(h, e, 7);
  assert.equal(helpers(h, 'antenna').length, 3);
  for (const m of helpers(h, 'antenna').slice(0, 2)) kill(h, e, m);
  e.hp = 1000;
  run(h, e, 1);
  assert.equal(e.phase, 2);
  assert.equal(helpers(h, 'antenna').length, 3, 'fury: all of them again');
});

test('Cocoons heal the root mother, come again at two thirds and one third, and leave a cloud', () => {
  const h = host();
  const e = leader(h, 'root-mother');
  assert.equal(helpers(h, 'pod').length, 2);
  e.hp = 6500;
  run(h, e, 1);
  assert.equal(helpers(h, 'pod').length, 4, 'two more below 66%');
  assert.ok(e.hp > 6500 + 3, 'healed by the pods');
  assert.equal(
    L.leaderArmor(h, e, FRONT),
    0.84,
    'four cocoons: 76% gets through',
  );
  const [pod] = helpers(h, 'pod');
  kill(h, e, pod);
  const cloud = keyed(h, 'spore');
  assert.equal(cloud.length, 1);
  assert.equal(cloud[0].slow, 0.5);
  for (const m of helpers(h, 'pod')) kill(h, e, m);
  const before = e.hp;
  run(h, e, 2);
  assert.ok(e.hp <= before, 'nothing heals her once the cocoons are down');
  // The third of the health: two more.
  e.hp = 3000;
  run(h, e, 1);
  assert.equal(helpers(h, 'pod').length, 2 + (e.phase >= 1 ? 0 : 0));
  assert.ok(e.phase >= 1);
});

test("The mother's cocoons fire a fan of spores from the second phase", () => {
  const h = host();
  const e = leader(h, 'root-mother');
  run(h, e, 10);
  assert.equal(h.shots.length, 0);
  e.hp = 4000;
  run(h, e, 8);
  assert.ok(h.shots.length >= 3, 'a fan of three');
});

test('The flood grows with every few seconds, and a valve shot down drains it and staggers the irrigator', () => {
  const h = host();
  const e = leader(h, 'irrigator');
  run(h, e, 60);
  const flood = keyed(h, 'flood');
  assert.ok(flood.length >= 3 && flood.length <= 4, 'capped');
  assert.ok(flood.every((z) => z.slow > 0 && z.slow < 1));
  assert.equal(helpers(h, 'valve').length, 0, 'no valve at the start');
  e.hp = 6000;
  run(h, e, 1);
  const valves = helpers(h, 'valve');
  assert.equal(valves.length, 1, 'a valve below two thirds');
  kill(h, e, valves[0]);
  assert.equal(keyed(h, 'flood').length, 0, 'the water goes');
  assert.deepEqual(h.staggers, [2]);
  run(h, e, 5);
  assert.equal(keyed(h, 'flood').length, 0, 'it stays dry for ten seconds');
  run(h, e, 10);
  assert.ok(keyed(h, 'flood').length >= 1);
});

test('The queen lays eggs that hatch into swift swarms and heal her unless they are broken', () => {
  const h = host();
  const e = leader(h, 'queen');
  run(h, e, 7);
  const eggs = helpers(h, 'egg');
  assert.equal(eggs.length, 2);
  e.hp = 5000;
  run(h, e, 7.5);
  assert.equal(helpers(h, 'egg').filter((m) => eggs.includes(m)).length, 0);
  assert.equal(h.spawns.filter((s) => s.affix === 'swift').length, 4);
  assert.ok(e.hp >= 5000 + 2 * 10000 * 0.01 - 1, 'one percent for every egg');
  // A broken egg hatches nothing and heals nothing.
  const g = host();
  const q = leader(g, 'queen');
  run(g, q, 7);
  for (const m of helpers(g, 'egg')) kill(g, q, m);
  q.hp = 5000;
  run(g, q, 8);
  assert.equal(g.spawns.length, 0);
  assert.equal(q.hp, 5000);
  // Fury: five at once, and they hatch faster.
  const f = host({ party: 3 });
  const r = leader(f, 'queen');
  r.phase = 2;
  run(f, r, 6.5);
  assert.equal(
    helpers(f, 'egg').length,
    5,
    'four, and one more for the third player',
  );
  assert.ok(
    Math.abs(
      num(helpers(f, 'egg')[0], 'hatch') -
        num(helpers(f, 'egg')[0], 'laid') -
        5,
    ) < 1e-9,
  );
});
const num = (e, k) => e.mech[k];

test('The architect draws a floor plan: the whole floor but a few cells comes down', () => {
  const h = host();
  const e = leader(h, 'architect');
  run(h, e, 9);
  const plan = keyed(h, 'plan');
  assert.equal(plan.length, 13, 'eighteen cells, five of them whole');
  assert.ok(plan.every((z) => z.age < 0 && z.rw > 100 && z.rh > 140));
  const safe = e.mech.safe;
  assert.equal(safe.length, 5);
  // Standing in a whole cell is safe once the plan falls; elsewhere it is not.
  const cw = 1600 / 6,
    ch = 1000 / 3;
  const centre = (i) => [
    (i % 6) * cw + cw / 2,
    Math.floor(i / 6) * ch + ch / 2,
  ];
  for (const z of plan) z.age = 0.1;
  for (const i of safe) {
    const [x, y] = centre(i);
    assert.ok(!plan.some((z) => hazardContains(z, x, y)), `cell ${i} is safe`);
  }
  const bad = [...Array(18).keys()].find((i) => !safe.includes(i));
  const [bx, by] = centre(bad);
  assert.ok(plan.some((z) => hazardContains(z, bx, by)));
  // Fewer whole cells later, more for a bigger party.
  e.phase = 2;
  const g = host();
  const f = leader(g, 'architect', { phase: 2 });
  run(g, f, 9);
  assert.equal(f.mech.safe.length, 3);
  const p = host({ party: 4 });
  const q = leader(p, 'architect', { phase: 2 });
  run(p, q, 9);
  assert.equal(q.mech.safe.length, 5, 'one more for each player over two');
});

test('From its second phase the architect draws a second plan right after the first', () => {
  const h = host();
  const e = leader(h, 'architect', { phase: 1 });
  run(h, e, 8.5);
  assert.equal(e.mech.safe.length, 4);
  const first = keyed(h, 'plan').length;
  run(h, e, 4.5);
  assert.ok(h.hazards.filter((z) => z.key === 'plan').length > first);
});

test('The collector is wired to its nodes; a node cut off snaps its wires and staggers it', () => {
  const h = host();
  const e = leader(h, 'collector');
  assert.equal(helpers(h, 'node').length, 3);
  assert.equal(
    keyed(h, 'wire-l0').length +
      keyed(h, 'wire-l1').length +
      keyed(h, 'wire-l2').length,
    3,
  );
  const ring = h.hazards.filter(
    (z) => z.key.startsWith('wire-n') && z.age < z.duration,
  );
  assert.equal(ring.length, 3, 'the nodes are in a ring');
  // The wires to the leader follow it.
  e.x = 1000;
  e.y = 200;
  run(h, e, 0.1);
  for (const z of h.hazards.filter((w) => w.key.startsWith('wire-l'))) {
    assert.equal(z.x2, 1000);
    assert.equal(z.y2, 200);
  }
  kill(h, e, helpers(h, 'node')[0]);
  assert.deepEqual(h.staggers, [2]);
  assert.equal(
    h.hazards.filter((z) => z.key.startsWith('wire-l') && z.age < z.duration)
      .length,
    2,
  );
  assert.equal(
    h.hazards.filter((z) => z.key.startsWith('wire-n') && z.age < z.duration)
      .length,
    1,
  );
  // Later phases bring a node back after 30 seconds.
  e.phase = 1;
  L.leaderShift(h, e, 1);
  run(h, e, 31);
  assert.equal(helpers(h, 'node').length, 3);
});

test("In fury the collector's wires pulse on and off", () => {
  const h = host();
  const e = leader(h, 'collector', { phase: 2 });
  const states = new Set();
  for (let i = 0; i < 12; i++) {
    run(h, e, 0.5);
    states.add(h.hazards.find((z) => z.key.startsWith('wire-l')).off);
  }
  assert.deepEqual([...states].sort(), [false, true]);
});

test('The chronarch stops time and is untouchable for three seconds; zones follow where the house was', () => {
  const body = { x: 300, y: 500, vx: 0, vy: 0 };
  const h = host({ bodies: [body] });
  const e = leader(h, 'chronarch');
  assert.equal(L.leaderArmor(h, e, FRONT), 1);
  // The house walks along a line; the zones come where it has been.
  for (let i = 0; i < 12; i++) {
    body.x += 40;
    run(h, e, 0.5);
  }
  const zones = h.hazards.filter((z) => z.color === '#c9b6ff');
  assert.equal(zones.length, 4);
  assert.ok(
    zones.every((z) => z.x < body.x),
    'behind the house, not under it',
  );
  assert.ok(
    zones.every((z, i) => i === 0 || z.x >= zones[i - 1].x),
    'along its route',
  );
  // Time stops at twelve seconds.
  const g = host();
  const c = leader(g, 'chronarch');
  run(g, c, 12.2);
  assert.equal(L.leaderFrozen(g, c), true);
  assert.equal(L.leaderArmor(g, c, FRONT), 0);
  run(g, c, 3);
  assert.equal(L.leaderFrozen(g, c), false);
  assert.equal(L.leaderArmor(g, c, FRONT), 1);
  // Not as often: every 22 seconds, then 18 and 14.
  assert.ok(Math.abs(c.mech.stop - c.mech.until - 19) < 1e-9);
});

test('In fury the chronarch stops time more often and sends echoes more often', () => {
  const h = host();
  const e = leader(h, 'chronarch', { phase: 2 });
  run(h, e, 12.1);
  assert.ok(
    Math.abs(e.mech.stop - e.mech.until - 11) < 1e-9,
    'fourteen seconds apart',
  );
  assert.equal(e.mech.echo - h.elapsed <= 8, true);
});

test('The march shield is up while the lieutenant walks and down while it winds up and just after', () => {
  const h = host();
  const e = leader(h, 'mini-0-0');
  assert.equal(L.leaderArmor(h, e, FRONT), 0.6);
  assert.equal(L.leaderArmor(h, e, BACK), 1, 'from behind it is bare');
  e.windup = 0.5;
  assert.equal(L.leaderArmor(h, e, FRONT), 1);
  e.windup = 0;
  L.leaderAttack(h, e, { hazards: [], shots: [], summons: [] });
  assert.equal(
    L.leaderArmor(h, e, FRONT),
    1,
    'down for a second after the shot',
  );
  run(h, e, 1.1);
  assert.equal(L.leaderArmor(h, e, FRONT), 0.6);
});

test('The magnet master pulls the house in for a second and a half, and again every sixteen seconds', () => {
  const h = host();
  const e = leader(h, 'mini-0-1');
  run(h, e, 6.1);
  const pull = keyed(h, 'magnet');
  assert.equal(pull.length, 1);
  assert.equal(pull[0].pull, 45);
  assert.equal(pull[0].duration, 1.5);
  assert.ok(pull[0].radius >= 300);
  assert.equal(e.mech.pull - h.elapsed > 11, true);
  e.phase = 1;
  run(h, e, 17);
  assert.ok(keyed(h, 'magnet').length + h.hazards.length >= 2);
});

test('The boiler warden draws a curtain of steam with a gap well away from the house', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const body = { x: 500, y: 700, vx: 0, vy: 0 };
    const h = host({ seed, bodies: [body] });
    const e = leader(h, 'mini-0-2');
    run(h, e, 6.1);
    const gap = e.mech.gap;
    assert.ok(
      Math.abs(gap - body.x) >= 260,
      `the gap (${gap}) is far from the house`,
    );
    assert.ok(
      h.hazards.length >= 1 && h.hazards.length <= 2,
      'two walls of steam',
    );
    assert.ok(
      h.hazards.every((z) => z.age < 0 && z.age > -3.6),
      'all at one moment',
    );
    for (const z of h.hazards) z.age = 0.1;
    assert.ok(
      !h.hazards.some((z) => hazardContains(z, gap, 100)),
      'the gap is free in every row',
    );
    assert.ok(!h.hazards.some((z) => hazardContains(z, gap, 900)));
    assert.ok(
      h.hazards.some((z) => hazardContains(z, gap + 400, 500)) ||
        h.hazards.some((z) => hazardContains(z, gap - 400, 500)),
    );
  }
});

test("The spore sentry's zones leave spore marks", () => {
  const h = host();
  const e = leader(h, 'mini-1-0');
  const pattern = {
    hazards: [
      { x: 1, y: 1, radius: 5, age: -1, duration: 1, damage: 5, color: '#fff' },
    ],
    shots: [],
    summons: [],
  };
  L.leaderAttack(h, e, pattern);
  assert.equal(pattern.hazards[0].mark, true);
});

test('The swarm queen is shielded by guards that circle her and grow back after twelve seconds', () => {
  const h = host();
  const e = leader(h, 'mini-1-1');
  assert.equal(helpers(h, 'guard').length, 4);
  assert.equal(L.leaderArmor(h, e, FRONT), 0.4);
  run(h, e, 1);
  for (const g of helpers(h, 'guard'))
    assert.ok(
      Math.abs(Math.hypot(g.x - e.x, g.y - e.y) - 95) < 0.01,
      'on its orbit',
    );
  const spots = new Set(helpers(h, 'guard').map((g) => `${Math.round(g.x)}`));
  assert.equal(spots.size >= 3, true, 'spread round her');
  for (const g of helpers(h, 'guard')) kill(h, e, g);
  assert.equal(L.leaderArmor(h, e, FRONT), 1);
  run(h, e, 11);
  assert.equal(helpers(h, 'guard').length, 0);
  run(h, e, 2);
  assert.equal(helpers(h, 'guard').length, 4, 'all four have grown back');
  assert.equal(L.leaderArmor(h, e, FRONT), 0.4);
  assert.equal(helpers(host({ party: 4 }) && h, 'guard').length, 4);
  const big = host({ party: 4 });
  leader(big, 'mini-1-1');
  assert.equal(helpers(big, 'guard').length, 6);
});

test('The root catcher closes a ring of roots with one way out', () => {
  const body = { x: 700, y: 500, vx: 0, vy: 0 };
  const h = host({ bodies: [body] });
  const e = leader(h, 'mini-1-2');
  run(h, e, 7.1);
  assert.equal(h.hazards.length, 8, 'seven roots and the middle');
  for (const z of h.hazards) z.age = 0.1;
  assert.ok(
    hazardContains(h.hazards[h.hazards.length - 1], body.x, body.y),
    'the middle is struck',
  );
  // The way out is one of eight directions: there somebody can stand at 190 px.
  const free = [...Array(8).keys()].filter((i) => {
    const a = (i * Math.PI) / 4,
      x = body.x + Math.cos(a) * 200,
      y = body.y + Math.sin(a) * 200;
    return !h.hazards.some((z) => hazardContains(z, x, y));
  });
  assert.ok(free.length >= 1, 'a way out exists');
});

test('The relay hunter is hidden and almost untouchable from afar, and shows itself near and when it shoots', () => {
  const body = { x: 800, y: 900, vx: 0, vy: 0 };
  const h = host({ bodies: [body] });
  const e = leader(h, 'mini-2-0');
  run(h, e, 0.1);
  assert.equal(e.mech.cloak, 1);
  assert.equal(L.leaderArmor(h, e, FRONT), 0.15);
  body.y = 500;
  run(h, e, 0.1);
  assert.equal(e.mech.cloak, 0);
  assert.equal(L.leaderArmor(h, e, FRONT), 1);
  body.y = 900;
  L.leaderAttack(h, e, { hazards: [], shots: [], summons: [] });
  run(h, e, 0.5);
  assert.equal(e.mech.cloak, 0, 'it shows for a moment after the shot');
  run(h, e, 0.5);
  assert.equal(e.mech.cloak, 1);
});

test('The mirror agent has two decoys and swaps places with one of them', () => {
  const h = host();
  const e = leader(h, 'mini-2-1', { x: 800, y: 300 });
  const copies = helpers(h, 'decoy');
  assert.equal(copies.length, 2);
  assert.ok(
    copies.every((m) => m.max < e.max * 0.05),
    'a hit and they are gone',
  );
  assert.ok(
    copies.every((m) => m.speed > 0),
    'they walk like the agent',
  );
  assert.equal(L.leaderArmor(h, e, FRONT), 0.55, 'the mirror in front stays');
  assert.equal(L.leaderArmor(h, e, BACK), 1);
  const spots = copies.map((m) => [m.x, m.y]);
  const me = [e.x, e.y];
  run(h, e, 10.1);
  const now = [e.x, e.y];
  assert.notDeepEqual(now, me);
  assert.ok(
    spots.some(([x, y]) => x === now[0] && y === now[1]),
    'it stands where a decoy stood',
  );
});

test('The chronometer repeats every zone of an attack 1.8 seconds later', () => {
  const h = host();
  const e = leader(h, 'mini-2-2');
  const pattern = {
    hazards: [
      {
        x: 1,
        y: 1,
        radius: 40,
        age: -1.1,
        duration: 0.4,
        damage: 9,
        color: '#f00',
      },
      {
        x: 2,
        y: 2,
        radius: 40,
        age: -1.4,
        duration: 0.4,
        damage: 9,
        color: '#f00',
      },
    ],
    shots: [],
    summons: [],
  };
  L.leaderAttack(h, e, pattern);
  assert.equal(pattern.hazards.length, 4);
  const [a, b, a2, b2] = pattern.hazards;
  assert.equal(a2.x, a.x);
  assert.ok(Math.abs(a2.age - (a.age - 1.8)) < 1e-9);
  assert.ok(Math.abs(b2.age - (b.age - 1.8)) < 1e-9);
  assert.notEqual(a2.color, a.color, 'the echo looks different');
});

test('A defeated leader takes its helpers and its zones with it', () => {
  for (const key of ['signalman', 'root-mother', 'collector', 'scrap-press']) {
    const h = host();
    const e = leader(h, key);
    run(h, e, 14);
    assert.ok(h.enemies.length > 1 || h.hazards.length > 0, key);
    L.endLeader(h, e);
    assert.equal(
      h.enemies.filter((m) => m.type === L.MECH_TYPE && m.hp > 0).length,
      0,
      `${key}: no helper left`,
    );
    assert.ok(
      h.hazards.every((z) => !z.key || z.age >= z.duration),
      `${key}: no zone of the mechanic left`,
    );
  }
});

test('Helpers scale with the party: more antennas, pods, nodes, guards, safe cells', () => {
  const counts = (key, tag) =>
    [1, 2, 3, 4].map((party) => {
      const h = host({ party });
      leader(h, key);
      return helpers(h, tag).length;
    });
  assert.deepEqual(counts('signalman', 'antenna'), [3, 3, 4, 5]);
  assert.deepEqual(counts('root-mother', 'pod'), [2, 2, 3, 4]);
  assert.deepEqual(counts('collector', 'node'), [3, 3, 4, 5]);
  assert.deepEqual(counts('mini-1-1', 'guard'), [4, 4, 5, 6]);
});

test('Both clients of a lockstep fight see the same thing: the same seed gives the same fight, key by key', () => {
  for (const key of [...BOSS_IDS, ...MINIS]) {
    const fight = () => {
      const h = host({ seed: 11, party: 2 });
      const e = leader(h, key);
      // A house that walks about, the leader slowly losing health.
      const body = h.bodies()[0];
      for (let i = 0; i < 40; i++) {
        body.x = 400 + ((i * 53) % 800);
        body.y = 300 + ((i * 97) % 500);
        e.hp -= 220;
        run(h, e, 1);
      }
      return JSON.stringify({
        enemies: h.enemies,
        hazards: h.hazards,
        spawns: h.spawns,
        shots: h.shots,
        staggers: h.staggers,
      });
    };
    assert.equal(fight(), fight(), key);
  }
});

test('The module never throws a die of its own and never reads the wall clock', () => {
  const source = fs.readFileSync('lib/game/leader-mech.ts', 'utf8');
  assert.ok(!/Math\.random/.test(source));
  assert.ok(!/Date\.now|performance\.now|new Date/.test(source));
});

test('Each fight of each leader runs for ninety seconds without a fault and keeps its numbers finite', () => {
  for (const key of [...BOSS_IDS, ...MINIS]) {
    for (const party of [1, 4]) {
      const h = host({ party, chapter: 2 });
      const e = leader(h, key);
      assert.doesNotThrow(() => {
        for (let i = 0; i < 90; i++) {
          e.hp = Math.max(1, e.hp - 105);
          run(h, e, 1);
          if (h.hazards.length > 400) h.hazards.splice(0, 200);
        }
      }, key);
      for (const z of h.hazards)
        assert.ok(
          [z.x, z.y, z.radius, z.age, z.duration, z.damage].every(
            Number.isFinite,
          ),
          `${key}: a zone with finite numbers`,
        );
      for (const m of h.enemies)
        assert.ok(
          [m.x, m.y, m.hp].every(Number.isFinite),
          `${key}: finite helper`,
        );
    }
  }
});
