// Solo against a party on the same fights, with the same pilot for every hero.
// Run `npm test` first to compile the game modules into .test-build.
//   PLAYERS=2|3|4 node scripts/coop-bench.cjs [seeds]
// The house is flown by the "reactive" pilot of scripts/pilots.cjs; in co-op
// every partner is flown by the very same pilot through a thin proxy. A pilot
// may lag behind what it sees (LAG steps of 25 ms, set from the shell): that
// is a person, or a link, reacting late. It is a controlled benchmark, not a
// prediction of how two people play.
//   Tuning from the shell, all optional:
//   PLAYERS          size of the party, 2 (default), 3 or 4
//   EH, SR, LT, LH, BT, XP, COINS  the row of the party table (coop.ts PARTY)
//                    for PLAYERS: enemy health, spawn rate, the leader's clock
//                    and health, its attack gap, the shares of the floor
//   DMG, HP, ECHO    the partner's damage and health share, and how hard the
//                    zones a leader opens under the other players hit
//   LAG              steps (0.025 s) every co-op pilot reacts late, default 0
//   HEAT             the heat of the fights, default 0
//   FIGHTS           'all' (default) or 'late' (the hard ones only)
//   JSON             print rows as JSON for a sweep
const M = require('../.test-build/model.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');
const { steer } = require('./pilots.cjs');
const { COOP, PARTY } = require('../.test-build/coop.js');

const PLAYERS = Math.max(2, Math.min(4, Number(process.env.PLAYERS) || 2));
const HEROES = ['flora', 'spark', 'nina'].slice(0, PLAYERS - 1);
for (const [env, key] of [
  ['EH', 'enemyHealth'],
  ['SR', 'spawnRate'],
  ['LT', 'leaderTime'],
  ['LH', 'leaderHealth'],
  ['BT', 'bossTime'],
  ['XP', 'xp'],
  ['COINS', 'coins'],
])
  if (process.env[env]) PARTY[PLAYERS - 1][key] = Number(process.env[env]);
for (const [env, key] of [
  ['DMG', 'damage'],
  ['HP', 'hp'],
  ['ECHO', 'echoDamage'],
])
  if (process.env[env]) COOP[key] = Number(process.env[env]);
const LAG = Number(process.env.LAG) || 0;
const HEAT = Number(process.env.HEAT) || 0;
const meta = { ...M.initialMeta(), wins: 8 };
const seeds = Number(process.argv[2]) || 6;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pct = (n) => Math.round(n * 100) / 100;

// A pilot's hands: what it does reaches the body `lag` steps later.
function hands(lag) {
  const queue = [];
  let step = 0;
  return {
    later: (fn) => queue.push([step + lag, fn]),
    tick() {
      step++;
      while (queue.length && queue[0][0] <= step) queue.shift()[1]();
    },
  };
}
// A body seen as a Battle by the pilot: where it is, what it sees, its inputs.
function proxyOf(b, who, lag) {
  const hand = hands(lag);
  const body = () => (who === 0 ? b : b.allyOf(who));
  const proxy = {
    get x() {
      return body().x;
    },
    get y() {
      return body().y;
    },
    get enemies() {
      return b.enemies;
    },
    get hazards() {
      return b.hazards;
    },
    get bullets() {
      return b.bullets;
    },
    get elapsed() {
      return b.elapsed;
    },
    set stick(v) {
      hand.later(() => {
        if (who === 0) b.stick = v;
        else b.allyOf(who).pin = v;
      });
    },
    pulse: () =>
      hand.later(() => (who === 0 ? b.pulse() : b.allyPulse(b.allyOf(who)))),
    dash: () =>
      hand.later(() => (who === 0 ? b.dash() : b.allyDash(b.allyOf(who)))),
  };
  return { proxy, hand };
}
function fight(chapter, step, kind, seed, players) {
  let run = M.makeRun(meta, 'mechanic', chapter, seed, { heat: HEAT });
  if (players > 1) run = M.withCrew(run, HEROES.slice(0, players - 1));
  run.page = 'combat';
  run.kind = kind;
  run.step = step;
  run.path = Array.from({ length: step + 1 }, () => 0);
  let outcome;
  const b = new Battle(
    null,
    run,
    meta,
    new AudioEngine(),
    () => {},
    (r) => {
      outcome = r;
    },
    { autoPerks: true },
  );
  const hands =
    players > 1
      ? [0, ...b.allies.map((a) => a.seat)].map((seat) => proxyOf(b, seat, LAG))
      : [];
  const coins0 = b.run.coins;
  let downs = 0,
    lowest = b.run.hp,
    allyLow = 100;
  const wasDown = new Set();
  while (!b.ended && b.elapsed < 260) {
    if (!hands.length) steer(b, 'reactive', seed);
    else {
      for (const h of hands) steer(h.proxy, 'reactive', seed);
      for (const a of b.allies) {
        if (a.down && !wasDown.has(a)) downs++;
        if (a.down) wasDown.add(a);
        else wasDown.delete(a);
        allyLow = Math.min(allyLow, (100 * a.hp) / a.max);
      }
      // A sensible party: when somebody is down, whoever is nearest (the
      // house or another partner) goes and helps.
      for (const down of b.allies.filter((a) => a.down)) {
        const near = [b, ...b.allies.filter((a) => !a.down && !a.away)].reduce(
          (best, o) =>
            Math.hypot(o.x - down.x, o.y - down.y) <
            Math.hypot(best.x - down.x, best.y - down.y)
              ? o
              : best,
        );
        const dx = down.x - near.x,
          dy = down.y - near.y,
          d = Math.hypot(dx, dy) || 1;
        const v = d > 40 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
        if (near === b) b.stick = v;
        else near.pin = v;
      }
      for (const h of hands) h.hand.tick();
    }
    b.update(0.025);
    lowest = Math.min(lowest, b.run.hp);
  }
  return {
    won: !!outcome?.won,
    hp: (100 * Math.max(0, b.run.hp)) / b.stats.health,
    low: (100 * Math.max(0, lowest)) / b.stats.health,
    seconds: b.elapsed,
    kills: b.battleKills,
    downs,
    allyLow,
    coins: b.run.coins - coins0,
    level: b.run.level,
  };
}
const all = [
  [0, 0, 'battle'],
  [0, 3, 'battle'],
  [0, 4, 'elite'],
  [0, 5, 'miniboss'],
  [0, 9, 'boss'],
  [1, 3, 'battle'],
  [1, 9, 'boss'],
  [2, 4, 'elite'],
  [2, 9, 'boss'],
];
const cases =
  process.env.FIGHTS === 'late'
    ? all.filter(([c, _s, k]) => c >= 1 && (k === 'boss' || k === 'elite'))
    : all;
const rows = [];
for (const [chapter, step, kind] of cases) {
  const solo = [],
    duo = [];
  for (let seed = 11; seed < 11 + seeds; seed++) {
    if (process.env.SOLO !== '0')
      solo.push(fight(chapter, step, kind, seed, 1));
    duo.push(fight(chapter, step, kind, seed, PLAYERS));
  }
  const row = (label, rs) => ({
    case: `L${chapter + 1} step ${step} ${kind}`,
    who: label,
    win: pct(mean(rs.map((r) => (r.won ? 1 : 0))) * 100),
    hp: pct(mean(rs.map((r) => r.hp))),
    low: pct(mean(rs.map((r) => r.low))),
    seconds: pct(mean(rs.map((r) => r.seconds))),
    kills: pct(mean(rs.map((r) => r.kills))),
    downs: pct(mean(rs.map((r) => r.downs))),
    allyLow: pct(mean(rs.map((r) => r.allyLow))),
    coins: pct(mean(rs.map((r) => r.coins))),
    level: pct(mean(rs.map((r) => r.level))),
  });
  if (solo.length) rows.push(row('solo', solo));
  rows.push(row(`p${PLAYERS}`, duo));
}
if (process.env.JSON) console.log(JSON.stringify(rows));
else {
  console.log(
    `| fight | who | win % | hp % end | hp % lowest | seconds | kills | downs | partner low % | coins | level |`,
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows)
    console.log(
      `| ${r.case} | ${r.who} | ${r.win} | ${r.hp} | ${r.low} | ${r.seconds} | ${r.kills} | ${r.who === 'solo' ? '-' : r.downs} | ${r.who === 'solo' ? '-' : r.allyLow} | ${r.coins} | ${r.level} |`,
    );
}
