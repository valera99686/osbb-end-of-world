// A screenshot of the mechanic of every boss and mini-boss (docs/leaders.md),
// taken from the real game in a real browser: the dev build puts the raid on
// each leader's fight and the shot is taken when the mechanic is on the floor.
//   npm test                         (once: .test-build, for the veteran profile)
//   npm run dev -- --port 5180
//   OSBB_URL=http://127.0.0.1:5180/ OUT=leaders-out node scripts/qa/leaders-shots.cjs [only]
// W and H set the window (W=390 H=844 for a phone).
// `only` is a part of a leader's key (commandant, mini-2, ...). Without it all 18.
const path = require('node:path');
const { launch, sleep, closeAll } = require('./cdp.cjs');
const { veteran } = require('./profile.cjs');

const URL = process.env.OSBB_URL || 'http://127.0.0.1:5180/';
const OUT = path.resolve(process.env.OUT || 'leaders-out');
const ONLY = process.argv[2];

// `wait`: seconds into the fight when the mechanic is on the floor.
const LEADERS = [
  { key: 'commandant', kind: 'boss', chapter: 0, variant: 0, wait: 5 },
  { key: 'scrap-press', kind: 'boss', chapter: 0, variant: 1, wait: 10 },
  { key: 'signalman', kind: 'boss', chapter: 0, variant: 2, wait: 5 },
  { key: 'root-mother', kind: 'boss', chapter: 1, variant: 0, wait: 5 },
  { key: 'irrigator', kind: 'boss', chapter: 1, variant: 1, wait: 12 },
  { key: 'queen', kind: 'boss', chapter: 1, variant: 2, wait: 9 },
  { key: 'architect', kind: 'boss', chapter: 2, variant: 0, wait: 9.5 },
  { key: 'collector', kind: 'boss', chapter: 2, variant: 1, wait: 5 },
  { key: 'chronarch', kind: 'boss', chapter: 2, variant: 2, wait: 14 },
  { key: 'mini-0-0', kind: 'miniboss', chapter: 0, variant: 0, wait: 5 },
  { key: 'mini-0-1', kind: 'miniboss', chapter: 0, variant: 1, wait: 7.5 },
  { key: 'mini-0-2', kind: 'miniboss', chapter: 0, variant: 2, wait: 7.5 },
  { key: 'mini-1-0', kind: 'miniboss', chapter: 1, variant: 0, wait: 5 },
  { key: 'mini-1-1', kind: 'miniboss', chapter: 1, variant: 1, wait: 5 },
  { key: 'mini-1-2', kind: 'miniboss', chapter: 1, variant: 2, wait: 8 },
  { key: 'mini-2-0', kind: 'miniboss', chapter: 2, variant: 0, wait: 5 },
  { key: 'mini-2-1', kind: 'miniboss', chapter: 2, variant: 1, wait: 5 },
  { key: 'mini-2-2', kind: 'miniboss', chapter: 2, variant: 2, wait: 6 },
];

async function main() {
  const p = await launch(9507, Number(process.env.W) || 1280, Number(process.env.H) || 800);
  await p.go(URL, 1500);
  const profile = veteran({ scenesSeen: ['prologue', 'origins', 'arrival-0'] });
  await p.eval(
    `localStorage.setItem(${JSON.stringify(profile.key)}, ${JSON.stringify(profile.value)}); 0`,
  );
  await p.go(URL, 3500);
  for (let i = 0; i < 8; i++) {
    await p.click('Пропустити', '[role=dialog] button');
    await sleep(300);
  }
  await p.eval(`document.querySelector('.start-button').click()`);
  await sleep(1500);
  for (let i = 0; i < 8; i++) {
    await p.click('Пропустити', '[role=dialog] button');
    await sleep(300);
  }
  await p.until('the map', `!!document.querySelector('button.tree-go')`, 15000);
  for (const l of LEADERS) {
    if (ONLY && !l.key.includes(ONLY)) continue;
    const step = l.kind === 'boss' ? 9 : 5;
    await p.eval(`window.__osbbRun({ page: 'map' }); 0`);
    await sleep(500);
    const patch = {
      page: 'combat',
      kind: l.kind,
      chapter: l.chapter,
      step,
      bossVariants: [0, 1, 2].map((c) => (c === l.chapter ? l.variant : 0)),
      minibossVariants: { [`${l.chapter}:${step}:0`]: l.variant },
    };
    await p.eval(`window.__osbbRun(${JSON.stringify(patch)}); 0`);
    await p.until('the fight', `!!document.querySelector('canvas.battle-canvas')`, 20000);
    // The presentation holds the fight: a key skips it.
    await sleep(800);
    await p.key('Enter');
    await sleep(400);
    await p.key('Enter');
    // The house must live to the moment of the shot (the dev build has the battle).
    await p.eval(`if (window.__battle) window.__battle.invincible = 1e9; 0`);
    await sleep(l.wait * 1000);
    await p.shot(path.join(OUT, `${l.key}.jpg`));
    console.log('ok  ', l.key);
  }
  closeAll();
}
main().catch((e) => {
  console.error(e);
  closeAll();
  process.exit(1);
});
