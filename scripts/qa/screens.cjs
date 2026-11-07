// The screenshots of the guide (docs/guide/img) and the slides, taken from the
// real game in a real Chrome: the hub, the map, a fight, a perk draft, the house,
// the settings; with `duo` a fight of two on one screen; with `online` a room for
// two over the broker (two browsers) with the chat, the map vote and the two
// pools of the reward.
//   npm test                          (once: it builds .test-build, used for the
//                                      veteran profile the screens need)
//   npm run dev -- --port 5180        (a dev build: it has the hooks that put the
//                                      game into a state)
//   OSBB_URL=http://127.0.0.1:5180/ OUT=docs/guide/img node scripts/qa/screens.cjs [solo|duo|online|all]
// `online` needs the internet (the public broker of the rooms).
const path = require('node:path');
const { launch, sleep, closeAll } = require('./cdp.cjs');
const { veteran } = require('./profile.cjs');

const URL = process.env.OSBB_URL || 'http://127.0.0.1:5180/';
const OUT = path.resolve(process.env.OUT || 'docs/guide/img');
const PART = process.argv[2] || 'solo';
const out = (name) => path.join(OUT, name);
const log = (...a) => console.log(...a);

async function load(p, profile) {
  await p.go(URL, 1500);
  if (profile) {
    await p.eval(
      `localStorage.setItem(${JSON.stringify(profile.key)}, ${JSON.stringify(profile.value)}); 0`,
    );
    await p.go(URL, 3500);
  }
}
async function step(name, fn) {
  try {
    await fn();
    log('ok  ', name);
  } catch (e) {
    log('FAIL', name, '-', String(e.message).slice(0, 200));
  }
}
const scrollTo = (p, sel, block = 'start') =>
  p.eval(
    `document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:${JSON.stringify(block)}}); 0`,
  );
const esc = (p) =>
  p.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 0`);
async function skipScenes(p, n = 8) {
  for (let i = 0; i < n; i++) {
    await p.click('Пропустити', '[role=dialog] button');
    await sleep(400);
  }
}
// Walk the house about for a while, so that a fight is in the frame.
async function wander(p, seconds) {
  const keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
  const end = Date.now() + seconds * 1000;
  let held = null;
  let i = 0;
  while (Date.now() < end) {
    if (held) await p.key(held, false);
    held = keys[i++ % keys.length];
    await p.key(held, true);
    await sleep(700);
  }
  if (held) await p.key(held, false);
}
async function toMap(p) {
  await p.eval(`document.querySelector('.start-button').click()`);
  await sleep(1500);
  await skipScenes(p);
  await p.until('the map', `!!document.querySelector('button.tree-go')`, 15000);
}

async function solo() {
  // A new profile first: the tutorial, the prologue.
  let p = await launch(9501, 1280, 800);
  await load(p);
  await step('tutorial', async () => {
    await p.shot(out('00-tutorial.jpg'));
    await p.click('Пропустити навчання');
    await sleep(1500);
  });
  await step('prologue', async () => {
    await p.shot(out('00-prologue.jpg'));
  });
  closeAll();

  // Then a veteran: everything the guide shows.
  p = await launch(9502, 1280, 800);
  await load(p, veteran());
  await step('hub', async () => {
    await p.eval('window.scrollTo(0,0)');
    await p.fullShot(out('01-hub.jpg'));
  });
  await step('crew', async () => {
    await p.click('змінити', 'button, summary, .crew-pick');
    await sleep(600);
    await scrollTo(p, '.crew-option', 'center');
    await sleep(500);
    await p.shot(out('02-crew.jpg'));
    await p.click('змінити', 'button, summary, .crew-pick');
  });
  await step('mode two on one screen', async () => {
    await p.eval('window.scrollTo(0,0)');
    await p.click('Вдвох тут', 'button.play-mode');
    await sleep(700);
    await p.fullShot(out('02-hub-duo.jpg'));
  });
  await step('mode online', async () => {
    await p.click('Вдвох по мережі', 'button.play-mode');
    await sleep(900);
    await p.fullShot(out('02-hub-online.jpg'));
    await p.click('Сам', 'button.play-mode');
  });
  await step('settings', async () => {
    await p.eval('window.scrollTo(0,0)');
    await p.eval(
      `(()=>{const b=[...document.querySelectorAll('button')].find(b=>/Налаштування/.test(b.getAttribute('aria-label')||'')); b&&b.click(); 0})()`,
    );
    await sleep(900);
    await p.shot(out('10-settings.jpg'));
    // The colour filter: the whole screen takes it.
    await p.eval(
      `(()=>{const h=[...document.querySelectorAll('[role=dialog] *')].find(e=>/Фільтр кольорів на весь екран/.test(e.textContent)&&e.children.length<4); h?.scrollIntoView({block:'center'}); 0})()`,
    );
    await sleep(500);
    await p.click('Дейтеранопія', '[role=dialog] button');
    await sleep(900);
    await p.shot(out('10-settings-cvd.jpg'));
    await p.click('Вимкнено', '[role=dialog] button');
    await sleep(300);
    await esc(p);
    await sleep(500);
  });
  for (const [btn, file] of [
    ['Майстерня', '07-workshop.jpg'],
    ['Кодекс', '08-codex.jpg'],
    ['Досягнення', '08-achievements.jpg'],
    ['Статистика', '08-stats.jpg'],
  ])
    await step(btn, async () => {
      await p.eval('window.scrollTo(0,0)');
      await p.click(btn, 'button.text-button');
      await sleep(1000);
      await p.shot(out(file));
      await p.click('Головне меню|Назад', 'button');
      await sleep(800);
    });
  await step('dialogue', async () => {
    await p.eval('window.scrollTo(0,0)');
    await p.eval(`document.querySelector('.start-button').click()`);
    await sleep(2500);
    await p.shot(out('09-dialogue.jpg'));
    await skipScenes(p);
  });
  await step('map', async () => {
    await p.until('the map', `!!document.querySelector('button.tree-go')`, 15000);
    await p.shot(out('03-map-house.jpg'));
  });
  await step('house plan', async () => {
    await p.click('Квартири й обладнання');
    await sleep(1200);
    await p.shot(out('12-house-plan.jpg'));
    await esc(p);
    await sleep(500);
    if (await p.eval(`!!document.querySelector('.housing-modal')`))
      await p.click('Закрити|Готово|Назад', '.housing-modal button');
    await sleep(400);
  });
  await step('fight', async () => {
    await p.eval(`document.querySelector('button.tree-go').click()`);
    await p.until('the fight', `!!document.querySelector('canvas.battle-canvas')`, 30000);
    await skipScenes(p, 3);
    await sleep(2500);
    await wander(p, 9);
    await p.shot(out('05-combat.jpg'));
  });
  await step('pause', async () => {
    await p.key('Escape');
    await sleep(700);
    await p.shot(out('04-pause.jpg'));
    await p.key('Escape');
    await sleep(500);
  });
  await step('perk draft', async () => {
    await p.until('a perk draft', `!!document.querySelector('.perk-card')`, 45000).catch(async () => {
      await wander(p, 25);
      await p.until('a perk draft', `!!document.querySelector('.perk-card')`, 30000);
    });
    await sleep(900);
    await p.shot(out('06-perk-draft.jpg'));
    await p.eval(`document.querySelector('.perk-card')?.click(); 0`);
  });
  closeAll();

  // A boss: the intro card (the dev build can put the raid on the boss's fight).
  p = await launch(9503, 1280, 800);
  await load(p, veteran({ scenesSeen: ['prologue', 'origins', 'arrival-0'] }));
  await step('boss intro', async () => {
    await toMap(p);
    await p.eval(`window.__osbbRun({ page: 'combat', kind: 'boss', step: 9 }); 0`);
    await p.until('the boss card', `!!document.querySelector('canvas.battle-canvas')`, 20000);
    await sleep(1300);
    await p.shot(out('11-boss-intro.jpg'));
  });
  closeAll();
}

// Two on one screen: the second house walks on the arrows.
async function duo() {
  const p = await launch(9505, 1280, 800);
  await load(p, veteran({ scenesSeen: ['prologue', 'origins', 'arrival-0'] }));
  await step('duo hub', async () => {
    await p.click('Вдвох тут', 'button.play-mode');
    await sleep(700);
    await p.eval('window.scrollTo(0,0)');
    await p.shot(out('13-duo-hub.jpg'));
  });
  await step('duo fight', async () => {
    await toMap(p);
    await p.eval(`document.querySelector('button.tree-go').click()`);
    await p.until('the fight', `!!document.querySelector('canvas.battle-canvas')`, 30000);
    await skipScenes(p, 3);
    await sleep(2500);
    const arrows = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    const wasd = ['KeyA', 'KeyW', 'KeyD', 'KeyS'];
    const end = Date.now() + 12000;
    let i = 0;
    let a = null;
    let w = null;
    while (Date.now() < end) {
      if (a) await p.key(a, false);
      if (w) await p.key(w, false);
      a = arrows[i % 4];
      w = wasd[i++ % 4];
      await p.key(a, true);
      await p.key(w, true);
      await sleep(800);
    }
    await p.shot(out('13-duo-combat.jpg'));
  });
  closeAll();
}

// A room for two over the broker, with the chat, the map and the two pools.
async function online() {
  const host = await launch(9511, 1280, 800);
  const guest = await launch(9512, 1280, 800);
  const prof = () => veteran({ scenesSeen: ['prologue', 'origins', 'arrival-0'] });
  await load(host, prof());
  await load(guest, prof());
  let code = '';
  await step('room', async () => {
    for (const pg of [host, guest]) await pg.click('Вдвох по мережі', 'button.play-mode');
    await sleep(600);
    await host.eval(`document.querySelector('.online-more')?.setAttribute('open', '')`);
    await host.click('Хост рахує', '.share-option');
    await host.fullShot(out('14-online-host.jpg'));
    await host.click('Створити кімнату');
    code = await host.until('the room code', `document.querySelector('.room-code b')?.textContent`);
    await sleep(500);
    await host.fullShot(out('14-online-room.jpg'));
    await guest.click('Приєднатися');
    await guest.eval(
      `(()=>{const i=document.querySelector('.online-join input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, ${JSON.stringify(code)}); i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await sleep(300);
    await guest.shot(out('14-online-join.jpg'));
    await guest.click('^Зайти$');
    await host.until('the guest is in', `/Напарник підключений/.test(document.body.innerText)`, 40000);
    await guest.until('the guest room', `!!document.querySelector('.guest-room')`, 40000);
    await sleep(800);
    await host.fullShot(out('14-online-connected.jpg'));
    await guest.fullShot(out('14-online-guest.jpg'));
  });
  await step('chat', async () => {
    const type = (pg, v) =>
      pg.eval(
        `(()=>{const i=document.querySelector('.chat-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    await host.until('chat button', `!!document.querySelector('.chat-open')`);
    await host.eval(`document.querySelector('.chat-open').click()`);
    await host.until('chat panel', `!!document.querySelector('.chat-panel')`);
    await type(host, 'Привіт! Готовий до рейду?');
    await sleep(200);
    await host.eval(`document.querySelector('.chat-form button[type=submit]').click()`);
    await guest.until('the toast', `!!document.querySelector('.chat-toast')`);
    await sleep(400);
    await guest.shot(out('15-chat-toast.jpg'));
    await guest.eval(`document.querySelector('.chat-open').click()`);
    await guest.until('chat panel', `!!document.querySelector('.chat-panel')`);
    await guest.click('Уперед', '.chat-quick button');
    await type(guest, 'Так, гайда!');
    await sleep(200);
    await guest.eval(`document.querySelector('.chat-form button[type=submit]').click()`);
    for (const pg of [host, guest]) await pg.click('Увімкнути мікрофон', '.chat-mic');
    await sleep(2500);
    await host.shot(out('15-chat-host.jpg'));
    await guest.shot(out('15-chat-guest.jpg'));
    for (const pg of [host, guest]) await pg.eval(`document.querySelector('.chat-close')?.click(); 0`);
  });
  await step('map', async () => {
    await host.eval(`document.querySelector('.start-button').click()`);
    await sleep(1500);
    await skipScenes(host);
    await host.until('the map', `!!document.querySelector('button.tree-go')`, 20000);
    await guest.until('the same map', `!!document.querySelector('.guest-room .tree-vote-note')`, 20000);
    await sleep(600);
    await host.shot(out('16-online-map-host.jpg'));
    await guest.shot(out('16-online-map-guest.jpg'));
  });
  await step('fight', async () => {
    await host.eval(`document.querySelector('button.tree-go').click()`);
    await host.until('host fight', `!!window.__battle`, 40000);
    await guest.until('guest fight', `!!window.__battle`, 40000);
    await sleep(2500);
    await skipScenes(host, 2);
    await wander(host, 8);
    await host.shot(out('17-online-fight-host.jpg'));
    await guest.shot(out('17-online-fight-guest.jpg'));
  });
  await step('reward with two rows', async () => {
    await host.eval(`window.__battle.duration = window.__battle.elapsed + 2`);
    let seen = false;
    for (let i = 0; i < 70 && !seen; i++) {
      await host.eval(
        `[...document.querySelectorAll('[role=dialog] button')].find(b=>/Пропустити/.test(b.innerText))?.click(); document.querySelector('.perk-card')?.click(); 0`,
      );
      seen = await guest.eval(`!!document.querySelector('.guest-room button.item-card:not([disabled])')`);
      if (!seen) await sleep(1500);
    }
    if (!seen) throw new Error('no reward row at the guest');
    await sleep(800);
    await guest.eval(`document.querySelector('.guest-room .reward-owner.mate')?.scrollIntoView({block:'center'}); 0`);
    await sleep(400);
    await guest.shot(out('18-reward-guest.jpg'));
    await host.eval(`document.querySelector('.reward-owner')?.scrollIntoView({block:'center'}); 0`);
    await sleep(400);
    await host.shot(out('18-reward-host.jpg'));
    // The guest takes a find: the host sees who took what.
    await guest.eval(`document.querySelector('.guest-room button.item-card:not([disabled])')?.click(); 0`);
    await sleep(1200);
    await host.shot(out('18-reward-taken.jpg'));
    await guest.click('Квартири й обладнання', '.guest-room button');
    await sleep(1200);
    await guest.shot(out('18-guest-housing.jpg'));
    await esc(guest);
  });
  await step('vote', async () => {
    await host.until(
      'the vote button',
      `(()=>{ [...document.querySelectorAll('[role=dialog] button')].find(b=>/Пропустити/.test(b.innerText))?.click(); document.querySelector('.perk-card')?.click(); [...document.querySelectorAll('button')].find(b=>/Продати знахідки/.test(b.innerText))?.click(); return /Голосую сюди/.test(document.querySelector('button.tree-go')?.innerText ?? '') })()`,
      60000,
    );
    await guest.until('the map at the guest', `!!document.querySelector('.guest-room.voting button.tree-go')`, 30000);
    await guest.eval(`document.querySelectorAll('.guest-room .tree-node.available')[1]?.click(); 0`);
    await guest.click('Голосую сюди', '.guest-room button.tree-go');
    await host.until('the guest vote', `document.querySelectorAll('.tree-node .tree-votes .partner').length === 1`, 20000);
    for (const [n, pg] of [['host', host], ['guest', guest]]) {
      await pg.eval(`document.querySelector('.tree-detail')?.scrollIntoView({block:'end'}); 0`);
      await sleep(500);
      await pg.shot(out(`19-vote-${n}.jpg`));
    }
  });
  log('errors: host', host.errors.slice(0, 3), 'guest', guest.errors.slice(0, 3));
  closeAll();
}

(async () => {
  try {
    if (PART === 'solo' || PART === 'all') await solo();
    if (PART === 'duo' || PART === 'all') await duo();
    if (PART === 'online' || PART === 'all') await online();
  } finally {
    closeAll();
  }
  process.exit(0);
})();
