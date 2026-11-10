// The game on a phone, upright and on its side: the screens a phone player
// reported (the story scenes, the map, the plan of the flats, the fight with its
// radio, a perk draft, a mini-boss, the finds after a fight), shot in a Chrome
// that plays a touch phone (390 x 844 css pixels, and 844 x 390).
//   npm test                         (once: .test-build for the veteran profile)
//   npm run dev -- --port 5180       (a dev build: it has the hooks used here)
//   OUT=dir node scripts/qa/mobile.cjs [portrait|landscape]
const path = require('node:path');
const { launch, sleep, closeAll } = require('./cdp.cjs');
const { veteran } = require('./profile.cjs');

const URL = process.env.OSBB_URL || 'http://127.0.0.1:5180/';
const OUT = path.resolve(process.env.OUT || 'mobile-out');
const log = (...a) => console.log(...a);
const SIZES = { portrait: [390, 844], landscape: [844, 390] };

async function phone(name, port) {
  const [w, h] = SIZES[name];
  const p = await launch(port, w, h);
  p.mobile = true;
  p.dpr = 2;
  await p.go(URL, 1500);
  const prof = veteran({ scenesSeen: ['prologue', 'origins'] });
  await p.eval(`localStorage.setItem(${JSON.stringify(prof.key)}, ${JSON.stringify(prof.value)}); 0`);
  await p.go(URL, 3500);
  await p.eval(`(()=>{const s=document.createElement('style'); s.textContent='.toast-stack,.achievement-toast{display:none!important}'; document.head.appendChild(s); 0})()`);
  return p;
}
async function step(name, fn) {
  try {
    await fn();
    log('ok  ', name);
  } catch (e) {
    log('FAIL', name, '-', String(e.message).slice(0, 160));
  }
}
const shot = (p, view, what) => p.shot(path.join(OUT, `${view}-${what}.png`));
// A finger on the screen (css pixels): down, moves, up.
const touch = (p, type, x, y) =>
  p.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
  });
const centre = (p, sel) =>
  p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}})()`);
async function slide(p, from, to, steps = 12) {
  for (let i = 1; i <= steps; i++) {
    await touch(p, 'touchMove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(30);
  }
}
// A finger lifts a thing from a list under the plan (a hold), goes up to the top
// edge (the window scrolls), then over the place `target` finds.
async function carry(p, sel, target) {
  await p.eval(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'end'}); 0`);
  await sleep(400);
  const from = await centre(p, sel);
  await touch(p, 'touchStart', from.x, from.y);
  await sleep(450);
  const lifted = await p.eval(`!!document.querySelector('.drag-ghost')`);
  // The plan comes to the finger: wait till the window stops, then find the place.
  let last = -1;
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    const now = await p.eval(`document.querySelector('.housing-modal')?.scrollTop ?? 0`);
    if (now === last) break;
    last = now;
  }
  const to = await p.eval(target);
  if (!to) {
    await touch(p, 'touchEnd');
    throw new Error('no place on the screen; lifted=' + lifted);
  }
  await slide(p, from, to, 10);
  await sleep(250);
  return lifted;
}
const onScreen = (sel) =>
  `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>{const r=b.getBoundingClientRect(); const c=r.top+r.height/2; return c>70&&c<innerHeight-70}); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`;

async function run(view, port) {
  const p = await phone(view, port);
  await step(`${view} cutscene`, async () => {
    await p.eval(`document.querySelector('.start-button').click()`);
    await p.until('a scene', `!!document.querySelector('.dlg-card')`, 10000);
    await sleep(900);
    await shot(p, view, 'cutscene');
    for (let i = 0; i < 8; i++) {
      await p.click('Пропустити', '.dlg button');
      await sleep(350);
    }
  });
  await step(`${view} map`, async () => {
    await p.until('the map', `!!document.querySelector('button.tree-go')`, 15000);
    await p.eval(`document.querySelector('.route-tree')?.scrollIntoView({block:'start'}); 0`);
    await sleep(600);
    await shot(p, view, 'map');
  });
  await step(`${view} house`, async () => {
    await p.eval('window.scrollTo(0,0)');
    await p.eval(`window.__osbbRun({ backpack: [{ uid: 900, id: 'airbag', x: 0, y: 0, rotation: 0 }], furniture: [{ uid: 901, id: 'firedoor', resident: null, cell: null }], nextFurnitureId: 902, items: [] }); 0`);
    await sleep(300);
    await p.click('Квартири й обладнання');
    await sleep(1200);
    await shot(p, view, 'house');
  });
  await step(`${view} drag module`, async () => {
    const lifted = await carry(p, '[data-drag="module"]', onScreen('.housing-hit-grid button.equipment-free-target, .housing-hit-grid button.equipment-swap-target'));
    await shot(p, view, 'drag-module');
    await touch(p, 'touchEnd');
    await sleep(500);
    const left = await p.eval(`document.querySelectorAll('[data-drag="module"]').length`);
    log('     lifted', lifted, '|', await p.text('.housing-message'), '| spare left:', left);
    if (left !== 0) throw new Error('the module is still spare');
  });
  await step(`${view} drag furniture`, async () => {
    await carry(p, '[data-drag="furniture"]', onScreen('.housing-hit-grid button.has-room:not(.drag-handle)'));
    await touch(p, 'touchEnd');
    await sleep(500);
    const left = await p.eval(`document.querySelectorAll('[data-drag="furniture"]').length`);
    log('     ', await p.text('.housing-message'), '| spare left:', left);
    if (left !== 0) throw new Error('the furniture is still spare');
  });
  // A module in a flat dragged to another place (the plan is on the screen).
  await step(`${view} drag fitted`, async () => {
    await p.eval(`document.querySelector('.housing-canvas').scrollIntoView({block:'center'}); 0`);
    await sleep(400);
    const from = await centre(p, '[data-drag="slot"]');
    const slot0 = await p.eval(`document.querySelector('[data-drag="slot"]').dataset.cell`);
    await touch(p, 'touchStart', from.x, from.y);
    await slide(p, from, { x: from.x + 8, y: from.y + 8 }, 3);
    await sleep(200);
    const to = await p.eval(onScreen('.housing-hit-grid button.equipment-free-target'));
    if (!to) throw new Error('no free place');
    await slide(p, { x: from.x + 8, y: from.y + 8 }, to, 8);
    await sleep(150);
    await touch(p, 'touchEnd');
    await sleep(500);
    const slot1 = await p.eval(`document.querySelector('[data-drag="slot"]')?.dataset.cell`);
    log('     module', slot0, '->', slot1, '|', await p.text('.housing-message'));
    if (slot0 === slot1) throw new Error('the module did not move');
  });
  // A flat dragged by its portrait two cells to the right.
  await step(`${view} drag flat`, async () => {
    await p.eval(`document.querySelector('.housing-canvas').scrollIntoView({block:'center'}); 0`);
    await sleep(400);
    const portraits = `JSON.stringify([...document.querySelectorAll('.housing-hit-grid button.drag-handle:not([data-drag])')].map(b=>b.dataset.cell))`;
    const before = await p.eval(portraits);
    const way = await p.eval(`(()=>{const g=document.querySelector('.housing-hit-grid'); const free=[...g.children].filter(b=>!b.classList.contains('has-room')); const hand=g.querySelector('button.drag-handle:not([data-drag])'); const r=hand.getBoundingClientRect(); const at=hand.dataset.cell.split(':').map(Number); const f=g.querySelector('[data-cell="'+(at[0]+2)+':'+at[1]+'"]').getBoundingClientRect(); return {from:{x:r.left+r.width/2,y:r.top+r.height/2}, to:{x:f.left+f.width/2,y:f.top+f.height/2}}})()`);
    await touch(p, 'touchStart', way.from.x, way.from.y);
    await sleep(80);
    await slide(p, way.from, way.to, 12);
    await sleep(200);
    await shot(p, view, 'drag-flat');
    await touch(p, 'touchEnd');
    await sleep(500);
    const after = await p.eval(portraits);
    log('     portraits', before, '->', after, '|', await p.text('.housing-message'));
    if (before === after) throw new Error('the flat did not move');
  });
  // A resident from the list onto the plan: the flat comes with them.
  await step(`${view} drag resident`, async () => {
    const portraits = `JSON.stringify([...document.querySelectorAll('.housing-hit-grid button.drag-handle:not([data-drag])')].map(b=>b.dataset.cell))`;
    const before = await p.eval(portraits);
    await carry(p, '[data-drag="resident"]', onScreen('.housing-hit-grid [data-cell="0:0"]'));
    await touch(p, 'touchEnd');
    await sleep(500);
    const after = await p.eval(portraits);
    log('     portraits', before, '->', after, '|', await p.text('.housing-message'));
    if (after !== '["0:0"]') throw new Error('the resident did not move the flat');
  });
  await step(`${view} close house`, async () => {
    await p.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 0`);
    await sleep(600);
    if (await p.eval(`!!document.querySelector('.housing-modal')`)) throw new Error('still open');
  });
  await step(`${view} fight`, async () => {
    await p.eval(`document.querySelector('button.tree-go').click()`);
    await p.until('the fight', `!!document.querySelector('canvas.battle-canvas')`, 30000);
    await sleep(3000);
    await shot(p, view, 'fight');
    // A radio line comes in the first seconds of a fight.
    const radio = await p.until('a radio line', `!!document.querySelector('.radio-strip')`, 20000).catch(() => false);
    if (radio) await shot(p, view, 'radio');
  });
  // A finger anywhere on the arena: the stick appears under it.
  await step(`${view} floating stick`, async () => {
    const [w, h] = SIZES[view];
    const at = { x: w * 0.62, y: h * 0.42 };
    const where = `JSON.stringify([Math.round(__battle.x),Math.round(__battle.y)])`;
    const pos0 = await p.eval(where);
    await touch(p, 'touchStart', at.x, at.y);
    await slide(p, at, { x: at.x + 36, y: at.y - 10 }, 6);
    await sleep(900);
    await shot(p, view, 'stick');
    const shown = await p.eval(`!!document.querySelector('.joystick.floating')`);
    await touch(p, 'touchEnd');
    await sleep(200);
    const gone = await p.eval(`!document.querySelector('.joystick.floating')`);
    log('     stick shown', shown, '| gone after', gone, '| house', pos0, '->', await p.eval(where));
    if (!shown || !gone) throw new Error('the floating stick did not work');
  });
  await step(`${view} perk`, async () => {
    await p.eval(`window.__battle.run.xp = 1e6; 0`);
    await p.until('a perk draft', `!!document.querySelector('.perk-card')`, 8000);
    await sleep(700);
    await shot(p, view, 'perk');
    await p.eval(`document.querySelector('.perk-card')?.click(); 0`);
    await p.until('the draft closed', `!document.querySelector('.perk-card')`, 8000);
  });
  await step(`${view} finds`, async () => {
    await p.eval(`window.__battle.duration = window.__battle.elapsed + 0.5; 0`);
    try {
      // Many levels at once: a draft after a draft.
      await p.until('the finds', `(()=>{document.querySelector('.perk-card')?.click(); return !!document.querySelector('.reward-cards > *')})()`, 40000);
    } catch (e) {
      log('     buttons:', await p.buttons());
      throw e;
    }
    await sleep(800);
    await p.eval(`document.querySelector('.reward-cards')?.scrollIntoView({block:'center'}); 0`);
    await sleep(400);
    await shot(p, view, 'finds');
  });
  await step(`${view} miniboss`, async () => {
    await p.eval(`window.__osbbRun({ page: 'combat', kind: 'miniboss', step: 4 }); 0`);
    await p.until('the fight', `!!document.querySelector('canvas.battle-canvas')`, 20000);
    await sleep(3800);
    await p.eval(`document.querySelector('canvas.battle-canvas')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); 0`);
    // The levels left from the perk step: take the drafts till none comes.
    for (let quiet = 0, i = 0; quiet < 6 && i < 80; i++) {
      const drafted = await p.eval(`(()=>{const c=document.querySelector('.perk-card'); c?.click(); return !!c})()`);
      quiet = drafted ? 0 : quiet + 1;
      await sleep(250);
    }
    await sleep(1500);
    await shot(p, view, 'miniboss');
  });
  log(view, 'errors', p.errors.slice(0, 3));
  closeAll();
}

(async () => {
  const which = process.argv[2];
  if (!which || which === 'portrait') await run('portrait', 9801);
  if (!which || which === 'landscape') await run('landscape', 9802);
  process.exit(0);
})();
