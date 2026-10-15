// Run `npm test` first to compile the actual game modules into .test-build.
// Controlled encounter benchmarks, not estimates of human campaign win rates.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const R = require('../.test-build/residents.js');
const A = require('../.test-build/apartments.js');
const E = require('../.test-build/equipment.js');
const D = require('../.test-build/data.js');
const F = require('../.test-build/furniture.js');
const C = require('../.test-build/encounters.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');
const { play } = require('./pilots.cjs');
const room = (id, x, y, rotation = 0) => ({ id, x, y, rotation });
const meta = M.initialMeta();
const round = (n) => Math.round(n * 100) / 100;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function validate(run) {
  for (const r of run.residents)
    assert.ok(R.canHouse(run.residents, r, run.houseLevel), JSON.stringify(r));
  assert.equal(E.activeEquipment(run).length, run.items.filter(Boolean).length);
}
function fixture(
  rooms,
  chapter,
  seed,
  gear = ['cannon', 'engine', 'workshop', 'battery', 'armor'],
) {
  const run = M.makeRun(meta, 'mechanic', chapter, seed);
  run.houseLevel = 3;
  run.residents = structuredClone(rooms);
  run.rescued = rooms.map((r) => r.id);
  run.items = E.emptyEquipment();
  const slots = E.equipmentTargets(run);
  assert.ok(slots.length >= gear.length);
  gear.forEach((id, i) => {
    run.items[slots[i].slot] = id;
  });
  run.hp = M.statsFor(run, meta).health;
  validate(run);
  return run;
}
const cases = [
  {
    id: 'workshop-separated',
    rooms: [room('mechanic', 0, 0), room('lev', 3, 3)],
  },
  {
    id: 'workshop-adjacent',
    rooms: [room('mechanic', 0, 0), room('lev', 1, 0)],
  },
  {
    id: 'workshop-joined',
    rooms: [room('mechanic', 0, 0), room('lev', 1, 0)],
    link: ['mechanic', 'lev'],
  },
  {
    id: 'pharmacy-separated',
    rooms: [room('mechanic', 4, 3), room('flora', 0, 0), room('marta', 0, 3)],
  },
  {
    id: 'pharmacy-adjacent',
    rooms: [room('mechanic', 4, 3), room('flora', 0, 0), room('marta', 2, 0)],
  },
  {
    id: 'pharmacy-joined',
    rooms: [room('mechanic', 4, 3), room('flora', 0, 0), room('marta', 2, 0)],
    link: ['flora', 'marta'],
  },
  {
    id: 'laboratory-off',
    rooms: [room('mechanic', 3, 3), room('spark', 0, 0), room('lev', 3, 0)],
  },
  {
    id: 'laboratory-on',
    rooms: [room('mechanic', 3, 3), room('spark', 0, 0), room('lev', 3, 0)],
    mode: { spark: 'lab' },
  },
  {
    id: 'anomaly-off',
    rooms: [room('mechanic', 4, 3), room('solomia', 0, 0), room('lev', 2, 1)],
  },
  {
    id: 'anomaly-on',
    rooms: [room('mechanic', 4, 3), room('solomia', 0, 0), room('lev', 2, 1)],
    mode: { solomia: 'anomaly' },
  },
];
function build(c, chapter, seed) {
  const r = fixture(c.rooms, chapter, seed, c.gear);
  r.roomLinks = c.link ? [c.link] : [];
  r.roomModes = c.mode ?? {};
  r.level = c.level ?? 1;
  return r;
}
// Squad fights end when the squad breaks ('cleared') or on the overtime
// clock; leader fights on the kill ('leader') or the timeout.
function battleRow(b, run, outcome, levels, r) {
  return {
    won: outcome.won,
    reason: b.endReason,
    seconds: round(b.elapsed),
    hpPercent: round(r.hpPercent),
    lowestHpPercent: round(r.lowestPercent),
    kills: b.battleKills,
    coinsDelta: b.run.coins - run.coins,
    squad: b.encounter?.id ?? null,
    waves: b.encounter ? `${b.wave + 1}/${b.plan.length}` : null,
    levels: levels.length,
    firstLevelAt: levels.length ? round(levels[0]) : null,
    phase2At: r.phase2 === null ? null : round(r.phase2),
  };
}
function simulate(run, pilot, seed) {
  let outcome;
  const levels = [];
  const b = new Battle(
    null,
    run,
    meta,
    new AudioEngine(),
    () => {},
    (result) => {
      outcome = result;
    },
    { onLevelUp: () => levels.push(b.elapsed), autoPerks: true },
  );
  // Fixed routes, no access to future attack patterns. The stationary bot
  // measures passive survivability with no abilities or dodging; see
  // scripts/pilots.cjs for circle and reactive.
  const r = play(b, pilot === 'stationary' ? 'idle' : pilot, {
    seed,
    limit: 260,
    each: () =>
      assert.ok(
        Number.isFinite(b.run.hp) &&
          Number.isFinite(b.x) &&
          Number.isFinite(b.y),
      ),
  });
  assert.ok(outcome, 'Encounter must terminate');
  return battleRow(b, run, outcome, levels, r);
}
function fight(c, chapter, kind, variant, seed, pilot) {
  const run = build(c, chapter, seed);
  run.kind = kind;
  run.page = 'combat';
  run.step = kind === 'boss' ? 9 : 4;
  run.bossVariants[chapter] = variant;
  run.minibossVariants[`${chapter}:${run.step}:0`] = variant;
  return {
    build: c.id,
    chapter: chapter + 1,
    kind,
    variant,
    seed,
    pilot,
    ...simulate(run, pilot, seed),
  };
}
// The start of a run: fresh profile, starting kit, no residents. Squad
// fights take one seed per squad template of the location (two rounds in
// the full audit), so no single template carries a number.
function squadSeeds(chapter, step, from = 1) {
  const seeds = new Map();
  const count = C.encountersAt(chapter).length;
  for (let seed = from; seeds.size < count && seed < from + 1000; seed++) {
    const id = C.encounterFor({ seed, chapter }, `${step}:0`).id;
    if (!seeds.has(id)) seeds.set(id, seed);
  }
  return [...seeds.values()];
}
function freshFight(chapter, step, kind, seed, pilot, variant = 0) {
  const run = M.makeRun(meta, 'mechanic', chapter, seed);
  run.page = 'combat';
  run.kind = kind;
  run.step = step;
  run.path = Array.from({ length: step + 1 }, () => 0);
  run.bossVariants[chapter] = variant;
  run.minibossVariants[`${chapter}:${step}:0`] = variant;
  return {
    build: 'fresh',
    chapter: chapter + 1,
    step,
    kind,
    variant,
    seed,
    pilot,
    ...simulate(run, pilot, seed),
  };
}
function freshScan(quick) {
  const out = [];
  for (const chapter of [0, 1, 2])
    for (const [step, kind] of [
      [0, 'battle'],
      [3, 'battle'],
      [4, 'elite'],
      [5, 'miniboss'],
      [9, 'boss'],
    ]) {
      const leader = kind === 'miniboss' || kind === 'boss';
      const seeds = leader
        ? quick
          ? [17]
          : [17, 83]
        : [
            ...squadSeeds(chapter, step),
            ...(quick ? [] : squadSeeds(chapter, step, 1001)),
          ];
      for (const seed of seeds)
        for (const variant of leader ? [0, 1, 2] : [0])
          for (const pilot of ['stationary', 'circle', 'reactive'])
            out.push(freshFight(chapter, step, kind, seed, pilot, variant));
    }
  return out;
}
// CI-style gates for the living-combat targets; tests/combat-feel.test.cjs
// asserts the same on fewer seeds.
function gates(fresh) {
  const pick = (chapter, step, kind, pilot) =>
    fresh.filter(
      (r) =>
        r.chapter === chapter &&
        r.step === step &&
        r.kind === kind &&
        r.pilot === pilot,
    );
  const hp = (rs) => round(mean(rs.map((r) => r.hpPercent)));
  const out = [];
  const gate = (id, value, pass) => out.push({ id, value, pass });
  const still = hp(pick(1, 3, 'battle', 'stationary'));
  gate('stationary ends location 1 step 3 below 50% hp', still, still < 50);
  const circle = hp(pick(1, 4, 'elite', 'circle')),
    reactive = hp(pick(1, 4, 'elite', 'reactive'));
  gate('circle ends a location 1 elite below 80% hp', circle, circle < 80);
  gate(
    'reactive beats circle on location 1 elites',
    round(reactive - circle),
    reactive > circle,
  );
  const first = [
    ...pick(1, 0, 'battle', 'circle'),
    ...pick(1, 0, 'battle', 'reactive'),
  ];
  gate(
    'moving pilots win the first fight above 60% hp',
    hp(first),
    first.every((r) => r.won) && hp(first) >= 60,
  );
  const opening = pick(1, 0, 'battle', 'stationary');
  gate(
    'first level within 20 s of the first fight',
    round(mean(opening.map((r) => r.firstLevelAt ?? 99))),
    opening.every((r) => r.firstLevelAt !== null && r.firstLevelAt <= 20),
  );
  // The starting kit deep in locations 2-3 may still need the overtime clock.
  const won = fresh.filter((r) => r.chapter === 1 && r.squad && r.won);
  gate(
    'won location 1 squad fights end on the kill quota, not the clock (%)',
    round(
      (100 * won.filter((r) => r.reason === 'cleared').length) /
        Math.max(1, won.length),
    ),
    won.every((r) => r.reason === 'cleared'),
  );
  return out;
}
function pairScan() {
  const out = [];
  for (let i = 0; i < R.RESIDENTS.length; i++)
    for (let j = i + 1; j < R.RESIDENTS.length; j++) {
      const a = room(R.RESIDENTS[i].id, 0, 0);
      let adjacent;
      outer: for (let rotation = 0; rotation < 4; rotation++)
        for (let y = 0; y < 6; y++)
          for (let x = 0; x < 6; x++) {
            const b = room(R.RESIDENTS[j].id, x, y, rotation);
            if (R.canHouse([a], b, 3) && A.roomsTouch(a, b)) {
              adjacent = b;
              break outer;
            }
          }
      assert.ok(adjacent);
      const far = room(adjacent.id, 3, 3);
      for (const chapter of [0, 1, 2]) {
        const nearRun = fixture([a, adjacent], chapter, 11, ['cannon']);
        const farRun = fixture([a, far], chapter, 11, ['cannon']);
        const near = M.statsFor(nearRun, meta),
          apart = M.statsFor(farRun, meta);
        const delta = {};
        for (const [k, v] of Object.entries(near))
          if (typeof v === 'number') {
            assert.ok(Number.isFinite(v));
            if (Math.abs(v - apart[k]) > 1e-8) delta[k] = round(v - apart[k]);
          }
        out.push({
          pair: [a.id, adjacent.id],
          chapter: chapter + 1,
          delta,
          medicine: near.housing.medicine,
        });
      }
    }
  return out;
}
function equipmentScan() {
  const out = [];
  for (let i = 0; i < D.ITEMS.length; i++)
    for (let j = i; j < D.ITEMS.length; j++) {
      const r = fixture([room('mechanic', 0, 0)], 0, 11, [
        D.ITEMS[i].id,
        D.ITEMS[j].id,
      ]);
      const s = M.statsFor(r, meta);
      Object.values(s)
        .filter((v) => typeof v === 'number')
        .forEach((v) => assert.ok(Number.isFinite(v)));
      out.push({
        items: [D.ITEMS[i].id, D.ITEMS[j].id],
        cost: D.ITEMS[i].price + D.ITEMS[j].price,
        damage: s.damage,
        rate: round(s.rate),
        shots: s.shots,
        drones: s.drones,
        regen: s.regen,
        armor: s.armor,
        // Upper bound assumes all projectiles hit. Not actual combat DPS.
        mainVolleyUpperBound: round(
          s.damage * s.rate * s.shots * (1 + 0.8 * s.crit),
        ),
      });
    }
  return out;
}
function economy() {
  const samples = [];
  for (let seed = 1; seed <= 1000; seed++) {
    let gold = 35,
      spent = 0,
      level = 0,
      firstExpansion = null;
    const chapters = [];
    const rng = M.seeded(seed + 9217);
    for (let chapter = 0; chapter < 3; chapter++) {
      const r = M.makeRun(meta, 'mechanic', chapter, seed);
      let col = 0,
        guaranteed = 0,
        battles = 0;
      for (let step = 0; step < 10; step++) {
        r.step = step;
        let kind = r.nodes[step][col];
        if (kind === 'mystery') kind = M.mysteryKind(r, `${step}:${col}`);
        if (['battle', 'elite', 'miniboss', 'boss'].includes(kind)) {
          const income =
            18 +
            chapter * 6 +
            ({ elite: 14, miniboss: 22, boss: 25 }[kind] ?? 0) +
            (kind === 'boss' ? [65, 90, 120][chapter] : 0);
          gold += income;
          guaranteed += income;
          battles++;
        }
        if (level < 3 && gold >= R.HOUSE_EXPANSION_COSTS[level]) {
          gold -= R.HOUSE_EXPANSION_COSTS[level];
          spent += R.HOUSE_EXPANSION_COSTS[level++];
          firstExpansion ??= { chapter: chapter + 1, step: step + 1 };
        }
        if (step < 9) {
          const next = M.routeTargets(step, col, r.nodes, r);
          col = next[Math.floor(rng() * next.length)];
        }
      }
      chapters.push({ chapter: chapter + 1, guaranteed, battles, level, gold });
    }
    samples.push({ seed, firstExpansion, spent, chapters });
  }
  return samples;
}
function furnitureScan() {
  const out = [];
  for (const resident of R.RESIDENTS)
    for (const item of F.FURNITURE) {
      const r = fixture([room(resident.id, 0, 0)], 0, 11, []);
      const before = M.statsFor(r, meta);
      r.furniture = [{ uid: 1, id: item.id, resident: resident.id, cell: 1 }];
      const after = M.statsFor(r, meta);
      const effect = F.furnitureEffect(item.id, resident.id);
      // Rate bonuses share the base firing rate; they do not multiply each other.
      const expected =
        item.stat === 'rate' ? 1.65 * effect.value : effect.value;
      assert.ok(
        Math.abs(after[item.stat] - before[item.stat] - expected) < 1e-8,
      );
      // A furnishing consumes the same slot as equipment, never both bonuses.
      r.items[E.apartmentSlot(resident.id, 1)] = 'cannon';
      assert.equal(E.activeEquipment(r).length, 0);
      out.push({
        resident: resident.id,
        item: item.id,
        stat: item.stat,
        delta: round(after[item.stat] - before[item.stat]),
        favorite: item.favorites.includes(resident.id),
      });
    }
  return out;
}
function edgeCases() {
  const r = build(
    cases.find((c) => c.id === 'anomaly-on'),
    2,
    22,
  );
  r.items[E.equipmentTargets(r)[0].slot] = 'coinshot';
  const b = new Battle(
    null,
    r,
    meta,
    new AudioEngine(),
    () => {},
    () => {},
  );
  b.spawnTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.orbit = b.stats.thorns = 0;
  b.spawn(15);
  b.enemies[0].x = b.x + 200;
  b.enemies[0].y = b.y;
  b.enemies[0].hp = 1e6;
  const initial = b.run.coins;
  for (let n = 0; n < 4; n++) {
    b.shotTimer = 0;
    b.update(0.025);
  }
  const before = M.statsFor(r, meta);
  const cap = structuredClone(r);
  cap.items = E.emptyEquipment();
  for (const slot of E.equipmentTargets(cap)) cap.items[slot.slot] = 'laundry';
  const on = M.statsFor(cap, meta);
  cap.roomModes = {};
  const off = M.statsFor(cap, meta);
  return {
    echoCoinshot: {
      mainVolleys: 4,
      projectiles: b.bullets.filter((x) => !x.enemy).length,
      coinsSpent: initial - b.run.coins,
      expectedCoinsIfFreeEcho: 4,
    },
    anomalyRate: {
      ordinary: on.rate,
      without: off.rate,
      atCap: on.rate === off.rate,
    },
    anomalyExample: {
      rate: before.rate,
      descriptionPenalty: '15 percent',
      actualRelativePenalty: round(
        100 *
          (1 - before.rate / M.statsFor({ ...r, roomModes: {} }, meta).rate),
      ),
    },
  };
}
const rows = [];
const seeds = [17, 83, 211, 419, 887, 1559];
const quick = process.argv.includes('--quick');
for (const c of cases)
  for (const chapter of [0, 1, 2]) {
    if (
      (c.id.startsWith('laboratory') || c.id.startsWith('anomaly')) &&
      chapter < 2
    )
      continue;
    for (const kind of ['battle', 'elite', 'miniboss', 'boss'])
      for (const variant of kind === 'boss' || kind === 'miniboss'
        ? [0, 1, 2]
        : [0])
        for (const seed of quick ? seeds.slice(0, 2) : seeds)
          for (const pilot of ['stationary', 'circle', 'reactive'])
            rows.push(fight(c, chapter, kind, variant, seed, pilot));
    console.log(
      `Completed ${c.id}, location ${chapter + 1}; ${rows.length} encounters`,
    );
  }
// Separate late-game gear stress tests. These deliberately do not model drop
// availability or a full campaign; report their gear and resident budget.
const lateRooms = [];
for (const id of ['mechanic', 'lev', 'nina', 'marta', 'flora']) {
  const placement = R.residentSpace(lateRooms, id, 3);
  assert.ok(placement);
  lateRooms.push(placement);
}
const lateCases = [
  {
    id: 'late-common-5',
    gear: ['cannon', 'engine', 'workshop', 'battery', 'armor'],
  },
  {
    id: 'late-common-9',
    gear: [
      'cannon',
      'engine',
      'workshop',
      'battery',
      'armor',
      'shotgun',
      'laundry',
      'scope',
      'kitchen',
    ],
  },
  {
    id: 'late-common-12',
    gear: [
      'cannon',
      'engine',
      'workshop',
      'battery',
      'armor',
      'shotgun',
      'laundry',
      'scope',
      'kitchen',
      'shotgun',
      'cannon',
      'armor',
    ],
  },
  {
    id: 'late-defense-12',
    gear: [
      'cannon',
      'engine',
      'workshop',
      'battery',
      'armor',
      'armor',
      'kitchen',
      'kitchen',
      'scope',
      'armor',
      'kitchen',
      'armor',
    ],
  },
  {
    id: 'late-electric-12',
    gear: [
      'cannon',
      'engine',
      'workshop',
      'generator',
      'chain',
      'shotgun',
      'laundry',
      'scope',
      'kitchen',
      'overclock',
      'shield',
      'battery',
    ],
  },
  {
    id: 'late-legendary-12',
    gear: [
      'reactor',
      'engine',
      'crown',
      'portal',
      'garden',
      'shotgun',
      'laundry',
      'scope',
      'kitchen',
      'reactor',
      'shield',
      'battery',
    ],
  },
].map((c) => ({ ...c, rooms: lateRooms, level: 5 }));
for (const c of lateCases)
  for (const variant of [0, 1, 2])
    for (const seed of quick ? seeds.slice(0, 2) : seeds)
      rows.push(fight(c, 2, 'boss', variant, seed, 'circle'));
const fresh = freshScan(quick);
console.log(`Completed the fresh-run scan; ${fresh.length} encounters`);
const groups = new Map();
for (const r of [...fresh, ...rows]) {
  const key = [r.build, r.chapter, r.step ?? '', r.kind, r.pilot].join('/');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
const summary = [...groups].map(([key, rs]) => ({
  key,
  n: rs.length,
  winPercent: round(100 * mean(rs.map((r) => +r.won))),
  meanHpPercent: round(mean(rs.map((r) => r.hpPercent))),
  meanSeconds: round(mean(rs.map((r) => r.seconds))),
  meanCoinsDelta: round(mean(rs.map((r) => r.coinsDelta))),
  meanKills: round(mean(rs.map((r) => r.kills))),
  meanLevels: round(mean(rs.map((r) => r.levels))),
  ends: rs.reduce((n, r) => ({ ...n, [r.reason]: (n[r.reason] ?? 0) + 1 }), {}),
}));
const checks = gates(fresh);
const report = {
  version: require('../package.json').version,
  generatedAt: new Date().toISOString(),
  method: {
    dt: 0.025,
    seeds: quick ? seeds.slice(0, 2) : seeds,
    gear: ['cannon', 'engine', 'workshop', 'battery', 'armor'],
    research: 'none',
    level: 1,
    coins: 35,
    houseLevel: 3,
    fullHealthEachEncounter: true,
    progression:
      'Controlled fixtures; no claim that these exact builds are obtainable at each stage',
    pilots: [
      'stationary: no movement or abilities',
      'circle: fixed route, proximity dash and pulse',
      'reactive: keeps its distance, leaves soon-armed zones, sidesteps shots, pulses crowds',
    ],
    fresh:
      'Start of a run (mechanic, starting kit, no residents); battles and elites use one seed per squad template',
    ends: 'cleared: squad broken; overtime: squad fight clock ran out; leader: boss or miniboss killed; timeout / lost: defeat',
    economy:
      'Random connected routes assuming all fights won, guaranteed combat/boss gold only; excludes purchases, drops and event gold',
  },
  lateCases,
  pairs: pairScan(),
  equipment: equipmentScan(),
  furniture: furnitureScan(),
  edgeCases: edgeCases(),
  economy: economy(),
  gates: checks,
  summary,
  fresh,
  encounters: rows,
};
fs.mkdirSync('docs/balance', { recursive: true });
fs.writeFileSync(
  `docs/balance/audit-${report.version}-${quick ? 'quick' : 'full'}.json`,
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      encounters: rows.length,
      pairs: report.pairs.length,
      equipmentPairs: report.equipment.length,
      furniture: report.furniture.length,
      edgeCases: report.edgeCases,
      gates: checks,
    },
    null,
    2,
  ),
);
if (checks.some((g) => !g.pass)) process.exitCode = 1;
