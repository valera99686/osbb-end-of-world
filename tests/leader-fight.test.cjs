// The mechanics of the leaders inside a real fight (engine.ts hooks around
// lib/game/leader-mech.ts): they start with the leader, armour works through
// damage(), helpers are no kills, a time stop holds the leader, a pull zone
// pulls, spore marks root, and the same seed gives the same fight.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const D = require('../.test-build/data.js');
const L = require('../.test-build/leader-mech.js');
const E = require('../.test-build/encounters.js');
const { Battle } = require('../.test-build/engine.js');

const silent = { play: () => {}, setLayer: () => {}, setPaused: () => {} };
const HEROES = ['flora', 'spark', 'nina'];
const KEYS = [];
for (let c = 0; c < 3; c++)
  for (let v = 0; v < 3; v++) {
    KEYS.push({
      kind: 'boss',
      chapter: c,
      variant: v,
      key: E.campaignBoss(c, v).id,
    });
    KEYS.push({
      kind: 'miniboss',
      chapter: c,
      variant: v,
      key: L.miniKey(c, v),
    });
  }
// A fight with one leader and nothing else going on.
function fight({ kind, chapter, variant, players = 1, seed = 5 }) {
  const meta = {
    ...M.initialMeta(),
    wins: 8,
    unlocked: D.ITEMS.map((i) => i.id),
  };
  let run = M.makeRun(meta, 'mechanic', chapter, seed);
  run = M.withCrew(run, HEROES.slice(0, players - 1));
  run.kind = kind;
  if (kind === 'boss') run.bossVariants[chapter] = variant;
  else
    run.minibossVariants[`${chapter}:${run.step}:${run.path[run.step] ?? 0}`] =
      variant;
  const b = new Battle(
    null,
    run,
    meta,
    silent,
    () => {},
    () => {},
    { autoPerks: true },
  );
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.thorns = b.stats.orbit = b.stats.drones = 0;
  for (const a of b.allies) {
    a.shotTimer = 999;
    a.stats = { ...a.stats, regen: 0, thorns: 0, orbit: 0, drones: 0 };
  }
  return b;
}
const step = (b, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) b.update(dt);
};
const leaderOf = (b) =>
  b.enemies.find((e) => e.hp > 0 && (e.type === 99 || e.type === 98));
const helpers = (b, tag) =>
  b.enemies.filter(
    (e) => e.type === L.MECH_TYPE && e.hp > 0 && (!tag || e.tag === tag),
  );

test('Each of the 18 leaders starts its own mechanic when it appears, and the screen names it', () => {
  for (const k of KEYS) {
    const b = fight(k);
    step(b, 0.2);
    const leader = leaderOf(b);
    assert.ok(leader, `${k.key}: a leader`);
    assert.equal(leader.tag, k.key, `${k.key}: its mechanic`);
    const hud = b.hud();
    assert.equal(hud.mech.name, L.MECHANICS[k.key].name, k.key);
    assert.ok(hud.mech.note.length > 8);
    // Nobody else but the leader counts as an enemy of the fight.
    assert.equal(
      hud.enemies,
      b.enemies.filter((e) => e.type !== L.MECH_TYPE).length,
    );
  }
});

test("The commandant's plate takes half of a hit from the front and none from the flank, whatever the health", () => {
  const b = fight({ kind: 'boss', chapter: 0, variant: 0 });
  step(b, 0.2);
  const leader = leaderOf(b);
  leader.aim = 0;
  const hp = leader.hp;
  b.damage(leader, 100, false, Math.PI);
  assert.ok(Math.abs(hp - leader.hp - 50) < 1e-6, `front: ${hp - leader.hp}`);
  const hp2 = leader.hp;
  b.damage(leader, 100, false, 0);
  assert.ok(Math.abs(hp2 - leader.hp - 100) < 1e-6, 'flank');
  const hp3 = leader.hp;
  b.damage(leader, 100);
  assert.ok(Math.abs(hp3 - leader.hp - 100) < 1e-6, 'a blast has no direction');
  // The old mirror agent keeps its mirror in front.
  const m = fight({ kind: 'miniboss', chapter: 2, variant: 1 });
  step(m, 0.2);
  const agent = leaderOf(m);
  agent.aim = 0;
  const h0 = agent.hp;
  m.damage(agent, 100, false, Math.PI);
  assert.ok(Math.abs(h0 - agent.hp - 55) < 1e-6, `mirror: ${h0 - agent.hp}`);
});

test("A helper of a leader is no kill: no combo, no crystal, no coin, and the leader's armour falls with it", () => {
  const b = fight({ kind: 'boss', chapter: 0, variant: 2 });
  step(b, 0.2);
  const antennas = helpers(b, 'antenna');
  assert.equal(antennas.length, 3);
  const leader = leaderOf(b);
  const hp = leader.hp;
  b.damage(leader, 100);
  assert.ok(
    Math.abs(hp - leader.hp - 64) < 1e-6,
    'three antennas: 64% gets through',
  );
  const kills = b.run.kills,
    drops = b.drops.length,
    combo = b.combo;
  b.damage(antennas[0], 1e9);
  assert.equal(b.run.kills, kills);
  assert.equal(b.battleKills, 0);
  assert.equal(b.drops.length, drops);
  assert.equal(b.combo, combo);
  step(b, 0.1);
  assert.equal(helpers(b, 'antenna').length, 2, 'it is gone from the fight');
  const hp2 = leader.hp;
  b.damage(leader, 100);
  assert.ok(Math.abs(hp2 - leader.hp - 76) < 1e-6, 'two antennas: 76%');
  assert.ok(b.hud().mech.note.includes('2'), 'the line says how many are left');
});

test('The last fifth of a boss is its fury; a mini-boss has none; the banner and the bar say so', () => {
  const b = fight({ kind: 'boss', chapter: 1, variant: 0 });
  step(b, 0.2);
  const leader = leaderOf(b);
  leader.hp = leader.max * 0.45;
  step(b, 0.1);
  assert.equal(leader.phase, 1);
  assert.equal(b.hud().bossPhase, 1);
  leader.hp = leader.max * 0.15;
  step(b, 0.1);
  assert.equal(leader.phase, 2);
  assert.equal(b.hud().bossPhase, 2);
  // It never goes back, even if a cocoon heals the mother above the line.
  leader.hp = leader.max * 0.6;
  step(b, 0.1);
  assert.equal(leader.phase, 2);
  const m = fight({ kind: 'miniboss', chapter: 0, variant: 0 });
  step(m, 0.2);
  const lieutenant = leaderOf(m);
  lieutenant.hp = lieutenant.max * 0.1;
  step(m, 0.1);
  assert.equal(lieutenant.phase, 1, 'a mini-boss stops at its second phase');
});

test('When time stops the chronarch takes no damage and holds its attack', () => {
  const b = fight({ kind: 'boss', chapter: 2, variant: 2 });
  step(b, 0.2);
  const leader = leaderOf(b);
  leader.mech.until = b.elapsed + 3;
  leader.mech.stop = b.elapsed + 99;
  const hp = leader.hp,
    timer = leader.timer;
  b.damage(leader, 500, false, Math.PI);
  assert.equal(leader.hp, hp);
  step(b, 1);
  assert.equal(leader.timer, timer, 'its next attack waits');
  assert.equal(leader.windup ?? 0, 0);
  step(b, 2.5);
  b.damage(leader, 500, false, Math.PI);
  assert.ok(leader.hp < hp, 'then it can be hurt again');
});

test('A pull zone drags a house toward its middle, and a dash gets out of it', () => {
  const b = fight({ kind: 'miniboss', chapter: 0, variant: 1 });
  step(b, 0.2);
  b.x = 400;
  b.y = 500;
  b.hazards.push({
    x: 800,
    y: 500,
    radius: 420,
    age: 0,
    duration: 2,
    damage: 2,
    color: '#9db4ff',
    pull: 140,
  });
  const before = b.x;
  step(b, 1);
  assert.ok(
    b.x - before > 100 && b.x - before < 160,
    `pulled ${b.x - before} px in a second`,
  );
  b.x = 400;
  b.dashing = 1;
  b.facing = { x: 0, y: 1 };
  b.hazards[0].age = 0;
  step(b, 0.2);
  assert.ok(Math.abs(b.x - 400) < 12, `no pull in a dash (${b.x - 400})`);
});

test('Three spore marks root a house; a dash wipes them off', () => {
  const b = fight({ kind: 'miniboss', chapter: 1, variant: 0 });
  step(b, 0.2);
  b.addMark(0);
  b.addMark(0);
  assert.equal(b.marks[0], 2);
  assert.deepEqual(b.hud().marks.slice(0, 1), [2]);
  b.dash();
  assert.equal(b.marks[0], 0);
  b.addMark(0);
  b.addMark(0);
  b.addMark(0);
  assert.equal(b.marks[0], 0);
  assert.ok(b.rooted[0] > 1);
  b.x = 500;
  b.stick = { x: 1, y: 0 };
  step(b, 0.5);
  assert.equal(b.x, 500, 'rooted: it does not walk');
  step(b, 1.2);
  const x = b.x;
  step(b, 0.5);
  assert.ok(b.x > x + 30, 'free again');
  // A zone with a mark leaves one on whoever it hurts.
  const c = fight({ kind: 'miniboss', chapter: 1, variant: 0 });
  step(c, 0.2);
  c.invincible = 0;
  c.hazards.push({
    x: c.x,
    y: c.y,
    radius: 60,
    age: 0.01,
    duration: 1,
    damage: 5,
    color: '#9ccf6a',
    mark: true,
  });
  step(c, 0.1);
  assert.equal(c.marks[0], 1);
});

test('The leader dies and takes its helpers and the zones of its mechanic with it', () => {
  for (const k of [KEYS[4], KEYS[6], KEYS[12]]) {
    const b = fight(k);
    // The floor plan of the architect is up for only a few seconds.
    step(b, k.key === 'architect' ? 9 : 12);
    const leader = leaderOf(b);
    assert.ok(
      helpers(b).length + b.hazards.filter((h) => h.key).length > 0,
      k.key,
    );
    leader.hp = 1;
    leader.mech.until = 0;
    b.damage(leader, 1e9);
    assert.equal(helpers(b).length, 0, `${k.key}: no helper left`);
    assert.ok(
      b.hazards.every((h) => !h.key || h.age >= h.duration),
      `${k.key}: no zone left`,
    );
    assert.ok(b.ended);
  }
});

test("The mechanics' zones are never trimmed from the list and shrink back when they are done", () => {
  const b = fight({ kind: 'boss', chapter: 2, variant: 0 });
  step(b, 0.2);
  b.hazards.push({
    x: 1,
    y: 1,
    radius: 5,
    age: 0,
    duration: 9999,
    damage: 1,
    color: '#fff',
    key: 'plate',
  });
  for (let i = 0; i < 90; i++)
    b.hazards.push({
      x: i,
      y: i,
      radius: 5,
      age: -5,
      duration: 5,
      damage: 1,
      color: '#fff',
    });
  step(b, 0.05);
  assert.ok(
    b.hazards.some((h) => h.key === 'plate'),
    'it stays among a hundred others',
  );
  assert.ok(b.hazards.filter((h) => !h.key).length <= 40);
});

test('A party gets more helpers: antennas and cocoons grow with the houses', () => {
  const count = (k, tag) =>
    [1, 2, 3, 4].map((n) => {
      const b = fight({ ...k, players: n });
      step(b, 0.2);
      return helpers(b, tag).length;
    });
  assert.deepEqual(
    count({ kind: 'boss', chapter: 0, variant: 2 }, 'antenna'),
    [3, 3, 4, 5],
  );
  assert.deepEqual(
    count({ kind: 'boss', chapter: 1, variant: 0 }, 'pod'),
    [2, 2, 3, 4],
  );
  assert.deepEqual(
    count({ kind: 'miniboss', chapter: 1, variant: 1 }, 'guard'),
    [4, 4, 5, 6],
  );
});

test('The same seed gives the same fight, mechanics and all (what lockstep and replays stand on)', () => {
  for (const k of KEYS) {
    const play = () => {
      const b = fight({ ...k, players: 2, seed: 17 });
      b.x = 700;
      b.y = 600;
      for (let i = 0; i < 6; i++) {
        b.stick = { x: Math.cos(i), y: Math.sin(i * 1.7) };
        step(b, 4);
        const leader = leaderOf(b);
        if (leader) leader.hp = Math.max(1, leader.hp - leader.max * 0.1);
      }
      return JSON.stringify({
        enemies: b.enemies,
        hazards: b.hazards,
        hud: b.hud(),
        marks: b.marks,
        x: b.x,
        y: b.y,
      });
    };
    assert.equal(play(), play(), k.key);
  }
});

test('Ninety seconds of every leader, in every party size, run without a fault and keep the numbers finite', () => {
  for (const k of KEYS)
    for (const players of [1, 4]) {
      const b = fight({ ...k, players, seed: 3 });
      assert.doesNotThrow(() => step(b, 30), `${k.key} x${players}`);
      for (const e of b.enemies)
        assert.ok(
          [e.x, e.y, e.hp, e.max].every(Number.isFinite),
          `${k.key}: finite enemy`,
        );
      for (const h of b.hazards)
        assert.ok(
          [h.x, h.y, h.age, h.damage].every(Number.isFinite),
          `${k.key}: finite zone`,
        );
    }
});
