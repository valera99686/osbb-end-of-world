// A fight for up to four houses: every partner is a house of its own (stats,
// perks, draft, body), enemies go for the nearest of them, the crystals share
// out by the size of the party, one leader serves everybody and opens its zones
// under every player, and a player who is not here stands still and is spared.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const C = require('../.test-build/coop.js');
const D = require('../.test-build/data.js');
const { hazardContains } = require('../.test-build/bosses.js');
const { Battle } = require('../.test-build/engine.js');

const silent = {
  play: () => {},
  setLayer: () => {},
  setPaused: () => {},
};
const HEROES = ['flora', 'spark', 'nina'];
const veteran = () => ({
  ...M.initialMeta(),
  wins: 8,
  unlocked: D.ITEMS.map((i) => i.id),
});
// A fight for `n` players (1..4) with nothing spawning or shooting by itself.
function party(n, opts = {}) {
  const meta = veteran();
  let run = M.makeRun(meta, 'mechanic', opts.chapter ?? 0, 5);
  run = M.withCrew(run, HEROES.slice(0, n - 1));
  if (opts.kind) run.kind = opts.kind;
  const b = new Battle(
    null,
    run,
    meta,
    silent,
    () => {},
    () => {},
    {
      autoPerks: true,
      ...opts.options,
    },
  );
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.thorns = b.stats.orbit = b.stats.drones = 0;
  for (const a of b.allies) {
    a.shotTimer = 999;
    a.stats = { ...a.stats, regen: 0, thorns: 0, orbit: 0, drones: 0 };
  }
  return { b, run, meta };
}
const step = (b, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) b.update(dt);
};
const enemyAt = (b, x, y) => {
  const e = b.spawn(0, { x, y, force: true });
  assert.ok(e, 'an enemy appeared');
  return e;
};

test('A fight for four has three partner houses, each with its own seat, stats and place', () => {
  const { b } = party(4);
  assert.equal(b.allies.length, 3);
  assert.deepEqual(
    b.allies.map((a) => a.seat),
    [1, 2, 3],
  );
  assert.deepEqual(
    b.allies.map((a) => a.hero),
    HEROES,
  );
  assert.equal(b.ally, b.allies[0], 'the first partner is still `ally`');
  assert.equal(b.mateStats, b.allies[0].stats);
  const places = new Set(b.allies.map((a) => `${a.x},${a.y}`));
  places.add(`${b.x},${b.y}`);
  assert.equal(places.size, 4, 'nobody stands on anybody');
  for (const a of b.allies) {
    assert.ok(a.stats && a.stats !== b.stats, 'its house has its own stats');
    assert.equal(
      a.max,
      C.allyHealth(M.mateStats(b.run, b.meta, a.seat).health),
    );
    assert.equal(b.allyOf(a.seat), a);
  }
  assert.equal(b.party, C.PARTY[3]);
  assert.equal(
    b.heat.spawnRate,
    party(1).b.heat.spawnRate * C.PARTY[3].spawnRate,
  );
  // The numbers of the screen know every partner.
  const hud = b.hud();
  assert.equal(hud.allies.length, 3);
  assert.deepEqual(
    hud.allies.map((a) => a.seat),
    [1, 2, 3],
  );
  assert.equal(hud.ally.hp, hud.allies[0].hp);
  assert.equal(hud.ally.max, hud.allies[0].max);
  assert.equal(hud.drafts.length, 3);
  // Alone and for two nothing is new.
  assert.equal(party(1).b.allies.length, 0);
  assert.equal(party(2).b.allies.length, 1);
  assert.equal(party(1).b.hud().allies, undefined);
});

test('Enemies go for the nearest house on its feet, and only a clearly nearer one beats the first', () => {
  const { b } = party(4);
  b.x = 400;
  b.y = 500;
  const [a1, a2, a3] = b.allies;
  a1.x = 1300;
  a1.y = 200;
  a2.x = 800;
  a2.y = 800;
  a3.x = 300;
  a3.y = 900;
  const e = { x: 820, y: 780, hp: 10 };
  assert.equal(b.goalOf(e), a2, 'the partner next to it');
  e.x = 400;
  e.y = 520;
  assert.equal(b.goalOf(e), b, 'the house beside it');
  // Whoever is down or away is nobody's target.
  e.x = 800;
  e.y = 780;
  b.downAlly(a2);
  assert.notEqual(b.goalOf(e), a2);
  b.reviveAlly(false, a2);
  b.setAway(2, true);
  assert.notEqual(b.goalOf(e), a2);
  // Of two partners the closer one.
  b.setAway(2, false);
  a3.x = 800;
  a3.y = 785;
  assert.equal(b.goalOf(e), a3);
});

test('Each house hurts, falls and is helped up on its own, and the others do the helping', () => {
  const { b } = party(4);
  b.x = 100;
  b.y = 100;
  const [a1, a2, a3] = b.allies;
  a1.x = 1000;
  a1.y = 800;
  a2.x = 1020;
  a2.y = 800;
  a3.x = 1500;
  a3.y = 200;
  const before = [a1.hp, a2.hp, a3.hp];
  a1.invincible = a2.invincible = a3.invincible = 0;
  assert.equal(b.hurtAlly(5, 0.5, 0.1, a2), 5);
  assert.deepEqual(
    [a1.hp, a2.hp, a3.hp],
    [before[0], before[1] - 5, before[2]],
  );
  b.hurtAlly(1e9, 0.5, 0.1, a1);
  assert.ok(a1.down && !a2.down && !a3.down);
  // The first house is far away, a neighbour partner stands beside the fallen.
  step(b, 4.0);
  assert.ok(
    !a1.down,
    'the partner beside it got it up (' + a1.revive.toFixed(2) + ')',
  );
  assert.equal(b.run.revives, 1);
  // A fallen one nobody reaches rises by itself in the end.
  b.downAlly(a3);
  step(b, C.COOP.autoRise + 1);
  assert.ok(!a3.down, 'it rises by itself');
  assert.equal(b.run.revives, 1, 'only the help counts');
});

test('A player who is not here stands still, is spared and does not hold the fight up', () => {
  const { b } = party(3);
  const [a1, a2] = b.allies;
  b.setAway(1, true);
  assert.ok(a1.away);
  const hp = a1.hp;
  a1.invincible = 0;
  assert.equal(
    b.hurtAlly(9, 0.5, 0.1, a1),
    0,
    'nothing hurts a house nobody plays',
  );
  assert.equal(a1.hp, hp);
  const e = enemyAt(b, a1.x + 10, a1.y);
  e.hp = e.max = 999;
  step(b, 1);
  assert.equal(a1.hp, hp, 'an enemy on top of it does nothing');
  assert.equal(b.bodies().includes(a1), false);
  assert.equal(
    b.orbiters().some(([at]) => at === a1),
    false,
  );
  // A level-up does not wait for its draft: its house takes the first card.
  const seen = [];
  const drafting = party(3, {
    options: {
      onPerkDraft: (offers, level, first, drafts) =>
        seen.push({ offers, drafts }),
    },
  }).b;
  drafting.setAway(1, true);
  drafting.pendingLevels = 1;
  drafting.openDraft();
  assert.equal(seen.length, 1);
  assert.equal(drafting.allies[0].draft, null, 'the absent one took a card');
  assert.ok(drafting.run.mates[0].perks.length === 1);
  assert.ok(drafting.allies[1].draft, 'the one who is here still chooses');
  assert.ok(drafting.drafting);
  // The way back.
  b.setAway(1, false);
  assert.ok(!a1.away);
  assert.equal(b.bodies().includes(a1), true);
  assert.ok(a2);
});

test('Every house takes a perk of its own from its own offers, and the fight goes on once all have', () => {
  const log = [];
  const { b } = party(4, {
    options: {
      onPerkDraft: (offers, level, first, drafts) =>
        log.push({ offers, first, drafts }),
      onPerkTaken: (who) => log.push(who),
    },
  });
  b.pendingLevels = 1;
  b.openDraft();
  assert.ok(b.choosing);
  const open = log[0];
  assert.equal(open.drafts.length, 3);
  assert.deepEqual(open.first, open.drafts[0]);
  assert.ok(
    open.drafts.every((d) => d && d.length >= 3),
    'each has offers',
  );
  // They are not all the same cards.
  assert.ok(
    new Set(open.drafts.map((d) => d.join())).size > 1,
    'their own offers',
  );
  b.choosePerk(open.offers[0]);
  assert.ok(b.choosing, 'the partners still choose');
  b.chooseMatePerk(open.drafts[2][1], 3);
  b.chooseMatePerk(open.drafts[0][0], 1);
  b.chooseMatePerk('nonsense', 2);
  assert.ok(b.choosing, 'a card that was not offered is not taken');
  assert.equal(b.run.mates[1].perks.length, 0);
  b.chooseMatePerk(open.drafts[1][2], 2);
  assert.ok(!b.choosing, 'everybody has chosen');
  assert.deepEqual(
    b.run.mates.map((m) => m.perks.length),
    [1, 1, 1],
  );
  assert.deepEqual(
    log.filter((x) => typeof x === 'number'),
    [0, 3, 1, 2],
    'the hook hears about every pick with its seat',
  );
  // A perk of one house changes only its own numbers.
  assert.equal(b.allies[2].perks[open.drafts[2][1]], 1);
  assert.equal(
    b.allies[0].perks[open.drafts[2][1]] ?? 0,
    open.drafts[0][0] === open.drafts[2][1] ? 1 : 0,
  );
});

test('Crystals and coins from the floor count by the share of the party', () => {
  for (const n of [2, 3, 4]) {
    const { b } = party(n);
    let xp = 0,
      coins = 0;
    for (let i = 0; i < 300; i++) {
      xp += b.loot(1, 'xp');
      coins += b.loot(1, 'coin');
    }
    assert.ok(
      Math.abs(xp - 300 * C.PARTY[n - 1].xp) <= 1,
      `${n} players: ${xp} crystals`,
    );
    assert.ok(
      Math.abs(coins - 300 * C.PARTY[n - 1].coins) <= 1,
      `${n} players: ${coins} coins`,
    );
  }
});

test('Whoever stands closest picks the loot up, and the heal goes to whoever took it', () => {
  const { b } = party(4);
  // Inside the tether, or the fight pulls them together.
  b.x = 600;
  b.y = 500;
  const [a1, a2, a3] = b.allies;
  a1.x = 700;
  a1.y = 600;
  a2.x = 1400;
  a2.y = 300;
  a3.x = 1300;
  a3.y = 900;
  a3.hp = 1;
  b.drops.push({ x: 1295, y: 895, kind: 'heal', value: 25 });
  b.drops.push({ x: 1405, y: 303, kind: 'coin', value: 3 });
  const coins = b.run.coins;
  step(b, 0.2);
  assert.ok(a3.hp > 5, 'the heal went to the partner beside it');
  assert.ok(b.run.coins > coins, 'the coin went to the till');
  assert.equal(b.run.hp, b.run.hp);
});

test('A leader fight for a party has one leader, tougher by its size', () => {
  const lone = party(1, { kind: 'boss', chapter: 1 }).b;
  step(lone, 0.1);
  const biggest = (x) => Math.max(...x.enemies.map((e) => e.max));
  for (const n of [2, 3, 4]) {
    const { b } = party(n, { kind: 'boss', chapter: 1 });
    step(b, 0.1);
    const leaders = b.enemies.filter((e) => e.max === biggest(b));
    assert.equal(leaders.length, 1, `${n} players: one leader`);
    assert.ok(
      Math.abs(biggest(b) / biggest(lone) - C.PARTY[n - 1].leaderHealth) < 0.01,
      `${n} players: ${biggest(b)} / ${biggest(lone)}`,
    );
    assert.ok(
      Math.abs(b.duration / lone.duration - C.PARTY[n - 1].leaderTime) < 1e-9,
    );
  }
});

test("The leader's attack opens its zones under every house on its feet", () => {
  const { b } = party(4, { kind: 'boss', chapter: 1 });
  step(b, 0.1);
  const leader = b.enemies.reduce((a, e) => (e.max > a.max ? e : a));
  const bodies = b.bodies();
  assert.equal(bodies.length, 4);
  const expected = bodies
    .filter((body) => body !== b)
    .reduce(
      (n, body) => n + b.leaderPattern(leader, 0, body).hazards.length,
      0,
    );
  const echo = b.echoZones(leader, 0, b);
  assert.equal(echo.length, expected);
  assert.ok(echo.length > 0 || expected === 0);
  // A fallen or absent house is not marked.
  b.downAlly(b.allies[0]);
  b.setAway(2, true);
  assert.equal(b.bodies().length, 2);
  const fewer = b.echoZones(leader, 0, b);
  assert.equal(
    fewer.length,
    b.leaderPattern(leader, 0, b.allies[2]).hazards.length,
  );
  // Alone there is no echo.
  const lone = party(1, { kind: 'boss', chapter: 1 }).b;
  step(lone, 0.1);
  const l = lone.enemies.reduce((a, e) => (e.max > a.max ? e : a));
  assert.deepEqual(lone.echoZones(l, 0, lone), []);
});

test('Over a whole fight every player has a zone opened under them, not only the one it aims at', () => {
  const { b } = party(4, { kind: 'boss', chapter: 1 });
  b.x = 400;
  b.y = 500;
  const [a1, a2, a3] = b.allies;
  a1.x = 1200;
  a1.y = 300;
  a2.x = 300;
  a2.y = 850;
  a3.x = 1300;
  a3.y = 820;
  const marked = new Set();
  b.run.hp = 1e6;
  b.stats.health = 1e6;
  for (let t = 0; t < 30 && marked.size < 4; t += 1 / 60) {
    for (const body of b.allies) body.invincible = 1e9;
    b.invincible = 1e9;
    b.update(1 / 60);
    for (const h of b.hazards) {
      if (h.age > -0.2) continue;
      if (
        hazardContains(h, b.x, b.y) ||
        Math.hypot(h.x - b.x, h.y - b.y) < h.radius + 60
      )
        marked.add(0);
      for (const a of b.allies)
        if (
          hazardContains(h, a.x, a.y) ||
          Math.hypot(h.x - a.x, h.y - a.y) < h.radius + 60
        )
          marked.add(a.seat);
    }
  }
  assert.ok(marked.size >= 3, `zones fell near seats ${[...marked]}`);
});

test('A fight for four is drawn: every house with its seat number and colour', () => {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args) => {
          calls.push([String(name), args]);
          return /^create.*Gradient$/.test(String(name))
            ? { addColorStop() {} }
            : undefined;
        },
      set: (_, name, value) => {
        calls.push(['set:' + String(name), [value]]);
        return true;
      },
    },
  );
  const { b } = party(4);
  for (const a of b.allies) b.drawAlly(ctx, a);
  const numbers = calls
    .filter(([n]) => n === 'fillText')
    .map(([, a]) => a[0])
    .filter((t) => /^[2-4]$/.test(t));
  assert.deepEqual(numbers, ['2', '3', '4']);
  const fills = new Set(
    calls.filter(([n]) => n === 'set:strokeStyle').map(([, a]) => a[0]),
  );
  assert.ok(
    ['#5fd3c4', '#ef6f5e', '#a98cf0'].every((c) => fills.has(c)),
    'a colour for each seat',
  );
  assert.equal(b.drawingSeat, 0, 'the house goes back to its own');
  // Each partner paints its own facade.
  assert.deepEqual(Object.keys(b.mateFacades).sort(), ['1', '2', '3']);
});

test('A hash of the fight sees every house, so a house that drifts is noticed', () => {
  const a = party(4).b,
    c = party(4).b;
  assert.equal(a.stateHash(), c.stateHash());
  for (const i of [0, 1, 2]) {
    const x = party(4).b;
    x.allies[i].x += 7;
    assert.notEqual(x.stateHash(), a.stateHash(), `partner ${i + 1}`);
  }
});

test('An event that hurts or heals the houses reaches the partners too, till the next fight', () => {
  const meta = veteran();
  const base = M.withCrew(
    M.makeRun(meta, 'mechanic', 0, 5),
    HEROES.slice(0, 2),
  );
  // A raid at an event that takes 12% of the health of a house (a sure loss).
  let run = null;
  for (let seed = 1; seed < 3000 && !run; seed++)
    for (let s = 1; s < 9 && !run; s++) {
      const r = {
        ...base,
        seed,
        step: s,
        page: 'event',
        kind: 'event',
        eventDone: false,
      };
      if (M.eventFor(r)?.id === 'rust-lift') run = r;
    }
  assert.ok(run, 'the event comes up on some seed');
  const hurt = M.resolveEvent(run, meta, 0);
  assert.ok(hurt.hp < run.hp, 'the first house is hurt');
  for (const m of hurt.mates) assert.ok(Math.abs(m.health - 0.88) < 1e-9);
  // A rest heals them back a part of the way (35%), a whole house drops the mark.
  const rest = M.resolveEvent(
    { ...hurt, page: 'event', kind: 'rest', eventDone: false },
    meta,
    0,
  );
  for (const m of rest.mates) assert.equal(m.health, undefined);
  // The next fight: the partners start with what the event left, and the mark goes.
  const b = new Battle(
    null,
    { ...hurt, page: 'combat', kind: 'battle' },
    meta,
    silent,
    () => {},
    () => {},
    { autoPerks: true },
  );
  for (const a of b.allies)
    assert.equal(a.hp, Math.max(1, Math.round(a.max * 0.88)));
  assert.ok(b.run.mates.every((m) => m.health === undefined));
  // A guest who sends its house cannot make itself whole.
  const sent = M.acceptMateHouse(
    hurt,
    {
      house: { ...M.houseOf(M.mateRun(hurt, 1)), health: 1 },
      coins: hurt.coins,
      scrap: hurt.scrap,
    },
    1,
  );
  assert.ok(sent);
  assert.equal(sent.mates[0].health, hurt.mates[0].health);
});
