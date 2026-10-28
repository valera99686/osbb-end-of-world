// Solo against co-op on the same fights, with the same pilot for both heroes.
// Run `npm test` first to compile the game modules into .test-build.
//   node scripts/coop-bench.cjs [seeds]
// The house is flown by the "reactive" pilot of scripts/pilots.cjs; in co-op
// the partner is flown by the very same pilot through a thin proxy. This is a
// controlled benchmark, not a prediction of how two people play.
const M = require('../.test-build/model.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');
const { steer } = require('./pilots.cjs');

const { COOP } = require('../.test-build/coop.js');
// Tuning from the shell: EH=1.5 SR=1.3 DMG=0.7 node scripts/coop-bench.cjs
for (const [env, key] of [
  ['EH', 'enemyHealth'],
  ['SR', 'spawnRate'],
  ['DMG', 'damage'],
  ['HP', 'hp'],
])
  if (process.env[env]) COOP[key] = Number(process.env[env]);
const meta = { ...M.initialMeta(), wins: 8 };
const seeds = Number(process.argv[2]) || 6;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pct = (n) => Math.round(n * 100) / 100;

// The partner seen as a Battle by the pilot: its body, its inputs.
function proxyOf(b) {
  const p = {
    get x() {
      return b.ally.x;
    },
    get y() {
      return b.ally.y;
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
      b.stick2 = v;
    },
    pulse: () => b.allyPulse(),
    dash: () => b.allyDash(),
  };
  return p;
}
function fight(chapter, step, kind, seed, coop) {
  const run = M.makeRun(meta, 'mechanic', chapter, seed, { coop });
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
  const mate = b.ally ? proxyOf(b) : null;
  let downs = 0,
    wasDown = false,
    lowest = b.run.hp;
  while (!b.ended && b.elapsed < 260) {
    steer(b, 'reactive', seed);
    if (mate) {
      steer(mate, 'reactive', seed);
      if (b.ally.down && !wasDown) downs++;
      wasDown = b.ally.down;
      // A sensible partner: when the other one is down, go and help.
      if (b.ally.down) {
        const dx = b.ally.x - b.x,
          dy = b.ally.y - b.y,
          d = Math.hypot(dx, dy) || 1;
        b.stick = d > 40 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
      }
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
  };
}
const rows = [];
const cases = [
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
for (const [chapter, step, kind] of cases) {
  const solo = [],
    duo = [];
  for (let seed = 11; seed < 11 + seeds; seed++) {
    solo.push(fight(chapter, step, kind, seed, ''));
    duo.push(fight(chapter, step, kind, seed, 'flora'));
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
  });
  rows.push(row('solo', solo), row('duo', duo));
}
console.log('| fight | who | win % | hp % end | hp % lowest | seconds | kills | downs |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows)
  console.log(
    `| ${r.case} | ${r.who} | ${r.win} | ${r.hp} | ${r.low} | ${r.seconds} | ${r.kills} | ${r.who === 'duo' ? r.downs : '-'} |`,
  );
