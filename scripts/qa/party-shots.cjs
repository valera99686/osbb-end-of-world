// Screenshots of the screens of a party on a phone: a fight with four houses,
// the council, a meeting with four roles. They are made from a save with a raid
// of that many houses (no network): the partners stand where they are.
//   OSBB_URL=http://localhost:5173/ node scripts/qa/party-shots.cjs [outdir]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { launch, sleep, closeAll } = require('./cdp.cjs');
const { veteran } = require('./profile.cjs');

const URL = process.env.OSBB_URL || 'http://localhost:5173/';
const OUT = process.argv[2] || path.join(os.tmpdir(), 'osbb-party-shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const p = await launch(9390, 390, 844);
  p.mobile = true;
  p.dpr = 2;
  await p.go(URL, 1500);
  const prof = veteran({
    scenesSeen: ['prologue', 'origins', 'arrival-0', 'goal'],
  });
  const M = require(path.resolve(__dirname, '../../.test-build/model.js'));
  const save = JSON.parse(prof.value);
  const run = M.withCrew(M.makeRun(save.meta, 'mechanic', 0, 7), [
    'flora',
    'spark',
    'nina',
  ]);
  await p.eval(
    `localStorage.setItem(${JSON.stringify(prof.key)}, ${JSON.stringify(M.saveData(save.meta, run))}); 0`,
  );
  await p.go(URL, 3500);
  await p.eval(`document.querySelector('.start-button').click()`);
  await sleep(1500);
  for (let i = 0; i < 8; i++) {
    await p.click('Пропустити', '.dlg button, .cinema button');
    await sleep(300);
  }
  await p.until('the map', `!!document.querySelector('button.tree-go')`, 20000);
  // The council before the second location.
  await p.eval(`window.__osbbRun({ page: 'council', chapter: 1, step: 0 })`);
  await sleep(800);
  await p.shot(path.join(OUT, 'council.png'));
  console.log('council', path.join(OUT, 'council.png'));
  // A meeting with a role for each of the four.
  await p.eval(
    `window.__osbbRun({ page: 'event', kind: 'event', chapter: 0, seed: 42 })`,
  );
  await sleep(800);
  await p.shot(path.join(OUT, 'together.png'));
  console.log('together', path.join(OUT, 'together.png'));
  await p.eval(
    `window.__osbbRun({ page: 'map', kind: 'battle', chapter: 0, step: 0, seed: 7 })`,
  );
  await sleep(500);
  await p.eval(`document.querySelector('button.tree-go').click()`);
  await p.until(
    'the fight',
    `!!document.querySelector('canvas.battle-canvas')`,
    30000,
  );
  await sleep(6000);
  await p.shot(path.join(OUT, 'fight4.png'));
  console.log('fight', path.join(OUT, 'fight4.png'));
  closeAll();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  closeAll();
  process.exit(1);
});
