// Two real browsers, one fight: a host and a guest (headless Chrome, driven
// over the DevTools protocol) meet in a room on the public broker, play a
// fight with random keys and compare fingerprints of the simulation.
//   npm run dev            (in another terminal)
//   node scripts/net-e2e.cjs [seconds] [mode]
//   FINISH=1 VOTE=1 node scripts/net-e2e.cjs 8 host   (the map vote after a fight)
//   SCENES=1 node scripts/net-e2e.cjs      (the guest sees the host's scene)
//   SCENES=seen node scripts/net-e2e.cjs   (...even one the host has seen before)
//   EVENT=1 node scripts/net-e2e.cjs       (both decide an event)
//   TOGETHER=1 node scripts/net-e2e.cjs    (a meeting that needs both)
//   CHAT=1 node scripts/net-e2e.cjs        (text chat, quick phrases and voice chat)
//   PERK=1 node scripts/net-e2e.cjs 45     (the host picks the perks; both go on)
//   CHEST=1 node scripts/net-e2e.cjs       (a chest: a find for each house)
// Needs Chrome at the usual path and an internet connection (the broker).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME =
  process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.OSBB_URL || 'http://localhost:5173/';
const SECONDS = Number(process.argv[2]) || 25;
const MODE = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];

async function launch(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osbb-e2e-'));
  const p = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      '--window-size=1280,800',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--autoplay-policy=no-user-gesture-required',
      '--no-first-run',
      // A made-up microphone that the page may use without asking (voice chat).
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  procs.push(p);
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((x) => x.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome did not start on ' + port);
}
class Page {
  constructor(name, url) {
    this.name = name;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.ws = new WebSocket(url);
    this.ready = new Promise((res) => (this.ws.onopen = res));
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m);
        this.pending.delete(m.id);
      } else if (m.method === 'Runtime.exceptionThrown')
        this.errors.push(m.params.exceptionDetails.exception?.description ?? 'exception');
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        this.errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res) => this.pending.set(id, res));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error(`${this.name}: ${r.result.exceptionDetails.exception?.description}`);
    return r.result?.result?.value;
  }
  async go(url) {
    await this.ready;
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Page.navigate', { url });
    await sleep(3500);
  }
}
async function until(what, fn, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* the page is still loading */
    }
    await sleep(400);
  }
  throw new Error('Timed out waiting for ' + what);
}
const click = (text, sel = 'button') =>
  `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>${JSON.stringify(text)}.test?0:new RegExp(${JSON.stringify(text)}).test(b.innerText)); if(!b) return false; b.click(); return true})()`;

// After the won fight (MODE host, FINISH, VOTE=1): both players pick a
// different node of the shared map, the coin decides, and both end up in the
// same next fight.
async function vote(host, guest) {
  // The fight is won and the reward has two rows: the guest sees its own
  // house and its row, takes a find, and the host sees who took what.
  await until('the row of the reward at the guest', async () => {
    await host.eval(click('Пропустити', '[role=dialog] button'));
    await host.eval(`document.querySelector('.perk-card')?.click()`);
    return guest.eval(`!!document.querySelector('.guest-room button.item-card:not([disabled])')`);
  }, 60000);
  console.log('guest house plan:', await guest.eval(`!!document.querySelector('.guest-room .inventory .house-preview')`),
    '| partner house:', await guest.eval(`!!document.querySelector('.guest-room .partner-house .house-preview.still')`));
  await guest.eval(`document.querySelector('.guest-room .reward-owner.mate')?.scrollIntoView()`);
  const gshot = await guest.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(os.tmpdir(), 'osbb-guest-home.png'), Buffer.from(gshot.result.data, 'base64'));
  const taken = await guest.eval(`(()=>{const c=document.querySelector('.guest-room button.item-card:not([disabled])'); const t=c.querySelector('h3').innerText; c.click(); return t})()`);
  await until('the host sees what the guest took', () =>
    host.eval(`!!document.querySelector('.reward-owner.mate.done .took')`),
  );
  console.log('the guest took', taken, '| host sees:', await host.eval(`document.querySelector('.reward-owner.mate.done .took')?.innerText`));
  // The guest opens its own housing screen: the same one as the host's.
  await guest.eval(click('Квартири й обладнання', '.guest-room button'));
  const housing = await until('the guest housing screen', () =>
    guest.eval(`document.querySelector('.housing-modal')?.innerText.slice(0, 160)`),
  );
  console.log('guest housing:', JSON.stringify(housing));
  const hshot = await guest.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(os.tmpdir(), 'osbb-guest-housing.png'), Buffer.from(hshot.result.data, 'base64'));
  await guest.eval(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); 0`);
  await until('the guest sees what it took', () =>
    guest.eval(`!!document.querySelector('.guest-room .reward-owner.mate .took')`),
  );
  // The fight is won: the loot is sold to get to the next fork of the map.
  await until('the host vote button', async () => {
    await host.eval(click('Пропустити', '[role=dialog] button'));
    await host.eval(`document.querySelector('.perk-card')?.click()`);
    await host.eval(click('Продати знахідки'));
    return host.eval(`/Голосую сюди/.test(document.querySelector('button.tree-go')?.innerText ?? '')`);
  }, 60000);
  await until('the same map at the guest', () =>
    guest.eval(`!!document.querySelector('.guest-room.voting button.tree-go')`),
  );
  const forks = [
    await host.eval(`document.querySelectorAll('.tree-node.available').length`),
    await guest.eval(`document.querySelectorAll('.guest-room .tree-node.available').length`),
  ];
  console.log('forks at the host and at the guest', forks);
  // The guest picks the second node; the host sees the chip.
  await guest.eval(`document.querySelectorAll('.guest-room .tree-node.available')[1].click()`);
  await guest.eval(click('Голосую сюди', '.guest-room button.tree-go'));
  await until('the host sees the guest\'s pick', () =>
    host.eval(`document.querySelectorAll('.tree-node .tree-votes .partner').length === 1`),
  );
  console.log('host note:', await host.eval(`document.querySelector('.tree-vote-note')?.innerText`));
  // Both screens while one has voted (for looking at).
  for (const [name, page] of [['host', host], ['guest', guest]]) {
    await page.eval(`document.querySelector('.tree-detail')?.scrollIntoView({block: 'end'})`);
    await sleep(400);
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(os.tmpdir(), `osbb-vote-${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log('screenshot', file);
  }
  // The host picks the first: the picks differ.
  await host.eval(`document.querySelectorAll('.tree-node.available')[0].click()`);
  await host.eval(click('Голосую сюди', 'button.tree-go'));
  const note = await until('the verdict on the guest\'s screen', () =>
    guest.eval(`(document.querySelector('.tree-vote-note')?.innerText ?? '').match(/монетка вирішила|збіглися. Вирушаємо/)?.[0]`),
  5000);
  console.log('guest note:', note);
  // The verdict takes the raid to the node the coin picked: a fight, a shop, an
  // event... The map is gone at the host and the vote is gone at the guest.
  await until('the host left the map', () => host.eval(`!document.querySelector('.route-tree')`), 15000);
  await until('the guest vote is over', () => guest.eval(`!document.querySelector('.guest-room.voting')`), 15000);
  console.log(
    'the host went to:',
    await host.eval(`document.querySelector('canvas.battle-canvas') ? 'a fight' : document.querySelector('h2')?.innerText`),
    '| the guest sees:',
    await guest.eval(`document.querySelector('canvas.battle-canvas') ? 'a fight' : document.querySelector('.guest-status')?.innerText`),
  );
  console.log('host errors', host.errors.slice(0, 5), 'guest errors', guest.errors.slice(0, 5));
  const ok =
    forks[0] === forks[1] &&
    forks[0] > 1 &&
    /монетка/.test(note) &&
    !host.errors.length &&
    !guest.errors.length;
  console.log(ok ? 'E2E OK' : 'E2E FAILED');
  process.exitCode = ok ? 0 : 1;
}

// The host's raid is put on an event: both see its choices, each picks, the
// same pick acts, and the outcome shows at both ends.
async function eventTest(host, guest) {
  // An ordinary meeting (not one for two) that has a choice costing nothing, so
  // that there is something to press whatever the run has.
  const M = require('../.test-build/model.js');
  const free = (c) => !c.risk && !c.effect.loseModule && !c.effect.loseFurniture && !c.effect.damageMax && (c.effect.coins ?? 0) >= 0 && (c.effect.scrap ?? 0) >= 0;
  let seed = 1;
  for (;; seed++) {
    const ev = M.eventFor({ seed, chapter: 0, step: 0, coop: 'nina' });
    if (!ev.together && ev.choices.some(free)) break;
  }
  await host.eval(`window.__osbbRun({ page: 'event', kind: 'event', seed: ${seed} })`);
  const options = (p, sel) =>
    p.eval(`document.querySelectorAll(${JSON.stringify(sel)} + ' .event-option:not([disabled])').length`);
  await until('the choices at the host', async () => (await options(host, '.play-main')) >= 1);
  await until('the choices at the guest', async () => (await options(guest, '.guest-room')) >= 1);
  console.log('choices: host', await options(host, '.play-main'), 'guest', await options(guest, '.guest-room'));
  // The guest picks the first one; the host sees the chip.
  await guest.eval(`document.querySelector('.guest-room .event-option:not([disabled])').click()`);
  await until("the host sees the guest's pick", () =>
    host.eval(`document.querySelectorAll('.play-main .event-votes .mate').length === 1`),
  );
  console.log('host note:', await host.eval(`document.querySelector('.event-vote-note')?.innerText`));
  // The host picks the same one: it acts, and both see the outcome.
  await host.eval(`document.querySelector('.play-main .event-option:not([disabled])').click()`);
  const hostSees = await until('the outcome at the host', () =>
    host.eval(`document.querySelector('.play-main .mission-banner p')?.innerText`),
  8000);
  const guestSees = await until('the outcome at the guest', () =>
    guest.eval(`document.querySelector('.guest-room .mission-banner p')?.innerText`),
  8000);
  console.log('outcome: host:', hostSees, '| guest:', guestSees);
  const ok = !!hostSees && hostSees === guestSees && !host.errors.length && !guest.errors.length;
  console.log('host errors', host.errors.slice(0, 5), 'guest errors', guest.errors.slice(0, 5));
  console.log(ok ? 'E2E OK' : 'E2E FAILED');
  for (const p of procs) p.kill();
  process.exit(ok ? 0 : 1);
}

// A chest on the shared map: each house gets its own find from it.
async function chestTest(host, guest) {
  // Every way at this step leads to a chest.
  await host.eval(`(()=>{const r=JSON.parse(localStorage.getItem('osbb.save.v1')).run; const nodes=r.nodes.map(x=>[...x]); nodes[r.step]=nodes[r.step].map(()=>'chest'); window.__osbbRun({ nodes }); 0})()`);
  await sleep(500);
  await host.eval(`document.querySelector('button.tree-go').click()`);
  const row = (p, sel) =>
    p.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(c => c.querySelector('h3')?.innerText ?? c.innerText.slice(0, 30))`);
  const hostRow = await until('the chest at the host', async () => {
    const r = await row(host, '.play-main .reward-owner:not(.mate) ~ .reward-cards .item-card, .play-main .reward-cards .item-card');
    return r.length ? r : null;
  }, 15000).catch(() => []);
  const guestRow = await until('the chest at the guest', async () => {
    const r = await row(guest, '.guest-room button.item-card');
    return r.length ? r : null;
  }, 15000).catch(() => []);
  const say = async (p, sel) => p.eval(`document.querySelector(${JSON.stringify(sel)})?.innerText.replace(/\s+/g, ' ').slice(0, 200)`);
  console.log('host page:', await say(host, '.play-main'));
  console.log('guest page:', await say(guest, '.guest-room'));
  console.log('host finds:', hostRow, '| guest finds:', guestRow);
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    const shot = await p.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(os.tmpdir(), `osbb-chest-${name}.png`), Buffer.from(shot.result.data, 'base64'));
  }
  // Furniture in the guest's row: the guest takes it, the host puts it in the
  // guest's house.
  await host.eval(`window.__osbbRun({ mateLoot: [{ kind: 'furniture', id: 'firedoor' }], picked: {} }); 0`);
  await until('furniture in the guest row', () =>
    guest.eval(`!!document.querySelector('.guest-room button.furniture-reward:not([disabled])')`),
  15000);
  const before = await host.eval(`JSON.parse(localStorage.getItem('osbb.save.v1')).run.mate.furniture.length`);
  await guest.eval(`[...document.querySelectorAll('.guest-room button.furniture-reward:not([disabled])')].pop().click(); 0`);
  const took = await until('the host gives it to the guest house', async () => {
    const r = await host.eval(`(()=>{const run=JSON.parse(localStorage.getItem('osbb.save.v1')).run; return run && run.mate ? run.mate.furniture.map(f=>f.id) : null})()`);
    return r && r.length > before ? r : null;
  }, 15000).catch(() => null);
  console.log('guest house furniture after the take:', took);
  const ok = hostRow.length > 0 && guestRow.length > 0 && !!took?.includes('firedoor') && !host.errors.length && !guest.errors.length;
  console.log('host errors', host.errors.slice(0, 5), 'guest errors', guest.errors.slice(0, 5));
  console.log(ok ? 'E2E OK' : 'E2E FAILED');
  for (const p of procs) p.kill();
  process.exit(ok ? 0 : 1);
}

// A meeting that needs both players: the host does its part and waits; a silent
// partner does not let it pass (20 seconds and more); when the guest does its
// part the outcome shows at both ends.
async function togetherTest(host, guest) {
  const M = require('../.test-build/model.js');
  let seed = 1;
  while (!M.eventFor({ seed, chapter: 0, step: 0, coop: 'nina' }).together) seed++;
  await host.eval(`window.__osbbRun({ page: 'event', kind: 'event', seed: ${seed} })`);
  const roles = (p, root) =>
    p.eval(`[...document.querySelectorAll(${JSON.stringify(root + ' .together-role')})].map(b => (b.disabled ? '-' : '+') + (b.classList.contains('done') ? 'done' : 'open'))`);
  await until('the roles at the host', async () => (await roles(host, '.play-main')).includes('+open'));
  await until('the roles at the guest', async () => (await roles(guest, '.guest-room')).includes('+open'));
  console.log('roles: host', await roles(host, '.play-main'), 'guest', await roles(guest, '.guest-room'));
  console.log('guest sees:', await guest.eval(`document.querySelector('.guest-room h2')?.innerText`), '|', await guest.eval(`document.querySelector('.guest-room .eyebrow')?.innerText`));
  // The host does its part and waits; the guest is silent.
  await host.eval(`document.querySelector('.play-main .together-role.mine:not(:disabled)').click()`);
  await until("the guest sees the host's part done", async () => (await roles(guest, '.guest-room'))[0].endsWith('done'));
  console.log('waiting 23 s for a silent guest…');
  await sleep(23000);
  const early = await host.eval(`!!document.querySelector('.play-main .mission-banner')`);
  console.log('decided without the guest:', early);
  // The guest does its part: now it goes.
  await guest.eval(`document.querySelector('.guest-room .together-role.mine:not(:disabled)').click()`);
  const hostSees = await until('the outcome at the host', () =>
    host.eval(`document.querySelector('.play-main .mission-banner p')?.innerText`),
  8000);
  const guestSees = await until('the outcome at the guest', () =>
    guest.eval(`document.querySelector('.guest-room .mission-banner p')?.innerText`),
  8000);
  console.log('outcome: host:', hostSees, '| guest:', guestSees);
  const ok = !early && !!hostSees && hostSees === guestSees && !host.errors.length && !guest.errors.length;
  console.log('host errors', host.errors.slice(0, 5), 'guest errors', guest.errors.slice(0, 5));
  console.log(ok ? 'E2E OK' : 'E2E FAILED');
  for (const p of procs) p.kill();
  process.exit(ok ? 0 : 1);
}

// Text chat, a quick phrase and a voice chat between the two real pages.
async function chatTest(host, guest) {
  const type = (page, value) =>
    page.eval(`(()=>{const i=document.querySelector('.chat-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const ok = [];
  const check = (what, v) => {
    ok.push(!!v);
    console.log(v ? 'ok  ' : 'FAIL', what);
  };
  // The host writes; the guest sees a toast and a badge before opening it.
  await until('the host chat button', () => host.eval(`!!document.querySelector('.chat-open')`));
  await host.eval(`document.querySelector('.chat-open').click()`);
  await until('the host panel', () => host.eval(`!!document.querySelector('.chat-panel')`));
  await type(host, 'Привіт, друже!');
  await sleep(200);
  await host.eval(`document.querySelector('.chat-form button[type=submit]').click()`);
  const toast = await until('the guest toast', () =>
    guest.eval(`document.querySelector('.chat-toast')?.innerText`),
  );
  check('the guest sees the host line as a toast: ' + JSON.stringify(toast), /Привіт, друже!/.test(toast));
  const badge = await guest.eval(`document.querySelector('.chat-badge')?.innerText`);
  check('and an unread badge: ' + badge, badge === '1');
  // The guest opens the panel and answers with a quick phrase and a line.
  await guest.eval(`document.querySelector('.chat-open').click()`);
  await until('the guest panel', () => guest.eval(`!!document.querySelector('.chat-panel')`));
  const seen = await guest.eval(`document.querySelector('.chat-log').innerText`);
  check('the guest log has the line', /Привіт, друже!/.test(seen));
  await guest.eval(click('Допоможи', '.chat-quick button'));
  await type(guest, 'Я тут');
  await sleep(200);
  await guest.eval(`document.querySelector('.chat-form button[type=submit]').click()`);
  const log = await until('the host log with both', async () => {
    const t = await host.eval(`document.querySelector('.chat-log').innerText`);
    return /Допоможи!/.test(t) && /Я тут/.test(t) ? t : '';
  });
  check('the host log has the quick phrase and the line', !!log);
  // The chat can be dragged by the top of its panel and by its button.
  const mouse = async (page, type, x, y) =>
    page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const rectOf = (page, sel) =>
    page.eval(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}})()`);
  const drag = async (page, sel, dx, dy) => {
    const r = await rectOf(page, sel);
    const [x, y] = [r.x + r.w / 2 - 20, r.y + r.h / 2];
    await mouse(page, 'mousePressed', x, y);
    for (let i = 1; i <= 8; i++) await mouse(page, 'mouseMoved', x + (dx * i) / 8, y + (dy * i) / 8);
    await mouse(page, 'mouseReleased', x + dx, y + dy);
    await sleep(300);
  };
  const before = await rectOf(host, '.chat-dock');
  await drag(host, '.chat-grip', 180, -120);
  const moved = await rectOf(host, '.chat-dock');
  check(`the panel is dragged (${Math.round(before.x)},${Math.round(before.y)} to ${Math.round(moved.x)},${Math.round(moved.y)})`, Math.abs(moved.x - before.x - 180) < 12 && Math.abs(moved.y - before.y + 120) < 12);
  const kept = await host.eval(`localStorage.getItem('osbb.chat.pos')`);
  check('and its place is remembered: ' + kept, !!kept && Math.abs(JSON.parse(kept).x - moved.x) < 3 && Math.abs(JSON.parse(kept).y - moved.y) < 3);
  // The shut button is dragged without opening, and opens on a plain tap.
  await host.eval(`document.querySelector('.chat-close').click()`);
  await sleep(300);
  const btn = await rectOf(host, '.chat-open');
  await drag(host, '.chat-open', 60, 40);
  const open1 = await host.eval(`!!document.querySelector('.chat-panel')`);
  const btn2 = await rectOf(host, '.chat-open');
  check('the button moved and did not open the panel', !open1 && Math.abs(btn2.x - btn.x - 60) < 12);
  await host.eval(`document.querySelector('.chat-open').click()`);
  await sleep(300);
  check('a tap on it opens the panel', await host.eval(`!!document.querySelector('.chat-panel')`));
  const inside = await rectOf(host, '.chat-dock');
  check('and the panel stays on the screen', inside.x >= 0 && inside.y >= 0 && inside.y + inside.h <= 800);
  const shot = await host.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(os.tmpdir(), 'osbb-chat-host.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot', path.join(os.tmpdir(), 'osbb-chat-host.png'));
  const relay = /relay=only/.test(URL);
  // Through the relay the voice takes a moment to get ready, and says what it is.
  if (relay) {
    await until('the relay voice is ready at both', async () =>
      (await host.eval(`!!document.querySelector('.chat-mic:not(:disabled)')`)) &&
      (await guest.eval(`!!document.querySelector('.chat-mic:not(:disabled)')`)),
    20000);
    for (const [name, page] of [['host', host], ['guest', guest]]) {
      const note = await page.eval(`document.querySelector('.chat-voice')?.innerText`);
      check(`${name} is told it is a walkie-talkie: ${JSON.stringify(note.slice(0, 120))}`, /як у рації/.test(note));
    }
  }
  // Voice: both turn the microphone on, and each hears the other.
  for (const page of [host, guest])
    await page.eval(click('Увімкнути мікрофон', '.chat-mic'));
  for (const [name, page] of [['host', host], ['guest', guest]]) {
    const heard = await until(`${name} hears the partner`, () =>
      page.eval(`document.querySelector('.chat-voice')?.dataset.heard === '1'`),
    relay ? 40000 : 20000).catch(() => false);
    check(`${name} receives the partner's sound`, heard);
    const live = await page.eval(`(()=>{const a=document.querySelector('audio'); const t=a?.srcObject?.getAudioTracks?.()[0]; return t ? t.readyState+':'+t.muted : 'no audio'})()`);
    console.log(`${name} audio track:`, live);
    check(`${name} plays a live track`, String(live).startsWith('live'));
    if (relay) {
      const spoke = await until(`${name} hears the partner speak`, () =>
        page.eval(`/говорить/.test(document.querySelector('.chat-voice')?.innerText ?? '') || !!document.querySelector('.chat-open.talking')`),
      30000).catch(() => false);
      check(`${name} hears speech through the relay`, spoke);
    }
    const mic = await page.eval(`document.querySelector('.chat-mic')?.className`);
    check(`${name} microphone shows as on`, /\bon\b/.test(mic));
  }
  // Several microphones: the list is there, and another one can be chosen
  // while the sound goes, without the partner losing it.
  const opts = await host.eval(`[...document.querySelectorAll('.chat-device option')].map(o=>o.value+'='+o.textContent)`);
  console.log('host microphones:', JSON.stringify(opts));
  check('the host is offered several microphones', opts && opts.length > 2);
  const pick = opts[opts.length - 1].split('=')[0];
  await host.eval(`(()=>{const s=document.querySelector('.chat-device'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s, ${JSON.stringify(pick)}); s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(2500);
  const stored = await host.eval(`localStorage.getItem('osbb.mic')`);
  check('the choice is remembered', stored === pick);
  const still = await host.eval(`document.querySelector('.chat-mic').classList.contains('on')`);
  const heard = await guest.eval(`document.querySelector('.chat-voice')?.dataset.heard === '1'`);
  console.log('after the switch: mic on', still, '| guest hears', heard, '| host note', JSON.stringify(await host.eval(`document.querySelector('.chat-error')?.innerText ?? document.querySelector('.chat-mic')?.className`)));
  check('the microphone stays on and the guest keeps hearing the host', still && heard);
  // The partner's mic is told, and turning it off ends the sound.
  await host.eval(click('Мікрофон увімкнено', '.chat-mic'));
  const off = await until('the guest hears the host stop', () =>
    guest.eval(`document.querySelector('.chat-voice')?.dataset.heard === '0'`),
  15000).catch(() => false);
  check('turning the microphone off ends the sound at the partner', off);
  console.log('host errors', host.errors.slice(0, 5), 'guest errors', guest.errors.slice(0, 5));
  const good = ok.every(Boolean) && !host.errors.length && !guest.errors.length;
  console.log(good ? 'E2E OK' : 'E2E FAILED');
  process.exitCode = good ? 0 : 1;
  for (const p of procs) p.kill();
  process.exit(process.exitCode);
}

(async () => {
  const [wa, wb] = [await launch(9331), await launch(9332)];
  const host = new Page('host', wa),
    guest = new Page('guest', wb);
  await Promise.all([host.go(URL), guest.go(URL)]);
  console.log('pages loaded');

  // Both profiles past the tutorial and the prologue, as real players are.
  if (process.env.SCENES || process.env.EVENT || process.env.TOGETHER || process.env.CHAT)
    for (const page of [host, guest])
      for (let i = 0; i < 6; i++) {
        await page.eval(click('Пропустити', 'button'));
        await sleep(500);
      }
  if (process.env.SCENES === 'seen') {
    // The host has seen the first scenes of a raid already, the guest has not:
    // the guest is shown them all the same.
    await host.eval(`(()=>{const k='osbb.save.v1'; const s=JSON.parse(localStorage.getItem(k)); s.meta.scenesSeen=[...new Set([...s.meta.scenesSeen,'goal','arrival-0'])]; localStorage.setItem(k, JSON.stringify(s)); 0})()`);
    await host.go(URL);
  }
  // The online mode is a tab of the hub's "Хто грає?" block.
  for (const page of [host, guest])
    await until('online tab', () => page.eval(click('Вдвох по мережі', 'button.play-mode')));
  if (MODE === 'host') {
    await host.eval(`document.querySelector('.online-more')?.setAttribute('open', '')`);
    await host.eval(click('Хост рахує', '.share-option'));
  }
  await until('room button', () => host.eval(click('Створити кімнату')));
  const code = await until('room code', () =>
    host.eval(`document.querySelector('.room-code b')?.textContent`),
  );
  console.log('room code', code);

  await guest.eval(click('Приєднатися'));
  await guest.eval(`(()=>{const i=document.querySelector('.online-join input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, ${JSON.stringify(code)}); i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(300);
  await guest.eval(click('^Зайти$'));
  await until('host sees the guest', () =>
    host.eval(`/Напарник підключений/.test(document.body.innerText)`),
  );
  await until('guest room screen', () => guest.eval(`!!document.querySelector('.guest-room')`));
  console.log('connected');
  if (process.env.CHAT) return chatTest(host, guest);

  // The host walks into the first fight.
  await host.eval(`document.querySelector('.start-button').click()`);
  await sleep(1200);
  if (process.env.SCENES) {
    // The host's arrival scene is on; the guest is shown it too.
    const seen = await until('the host scene at the guest', () =>
      guest.eval(`[...document.querySelectorAll('button')].some(b => /Пропустити/.test(b.innerText))`),
    8000);
    console.log("the guest sees the host's scene:", seen);
    if (process.env.SCENES === 'seen')
      console.log('the host, who saw it, goes on without it:', await host.eval(`![...document.querySelectorAll('button')].some(b => /Пропустити/.test(b.innerText))`));
    process.exitCode = seen ? 0 : 1;
    console.log(seen ? 'E2E OK' : 'E2E FAILED');
    for (const p of procs) p.kill();
    process.exit(process.exitCode);
  }
  for (let i = 0; i < 6; i++) {
    await host.eval(click('Пропустити', '[role=dialog] button'));
    await sleep(500);
  }
  await until('the map', () => host.eval(`!!document.querySelector('button.tree-go')`));
  // The first step has one way only: the guest still sees the same map, with
  // nothing to vote on.
  const seen = await until('the shared map at the guest', () =>
    guest.eval(`document.querySelector('.guest-room .tree-vote-note')?.innerText`),
  );
  console.log('guest sees the first map:', seen);
  if (process.env.EVENT) return eventTest(host, guest);
  if (process.env.CHEST) return chestTest(host, guest);
  if (process.env.TOGETHER) return togetherTest(host, guest);
  await host.eval(`document.querySelector('button.tree-go').click()`);
  // A production build has no debugging hook: then only the screens are seen.
  const PROD = !!process.env.PROD;
  const inFight = PROD ? `!!document.querySelector('canvas.battle-canvas')` : `!!window.__battle`;
  await until('host fight', () => host.eval(inFight), 40000);
  await until('guest fight', () => guest.eval(inFight), 40000);
  console.log('both in the fight');
  if (PROD) {
    await sleep(9000);
    const shown = (p) => p.eval(`({canvas: !!document.querySelector('canvas.battle-canvas'), partner: !!document.querySelector('.ally-bar'), time: document.querySelector('.battle-center strong')?.innerText})`);
    const [a, b] = [await shown(host), await shown(guest)];
    console.log(JSON.stringify({ host: a, guest: b }));
    console.log('host errors', host.errors.slice(0, 5), 'guest errors', guest.errors.slice(0, 5));
    const good = a.canvas && b.canvas && a.partner && b.partner && !host.errors.length && !guest.errors.length;
    console.log(good ? 'E2E OK' : 'E2E FAILED');
    for (const p of procs) p.kill();
    process.exit(good ? 0 : 1);
  }

  // Random hands for a while.
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
  const fire = (page, code, down) =>
    page.eval(`window.dispatchEvent(new KeyboardEvent(${JSON.stringify(down ? 'keydown' : 'keyup')},{code:${JSON.stringify(code)},bubbles:true,cancelable:true}))`);
  const end = Date.now() + SECONDS * 1000;
  const held = { host: null, guest: null };
  const perks = [];
  let stall = 0,
    guestSaw = -1,
    ends = [];
  while (Date.now() < end) {
    for (const [name, page] of [['host', host], ['guest', guest]]) {
      if (held[name]) await fire(page, held[name], false);
      held[name] = keys[Math.floor(Math.random() * keys.length)];
      await fire(page, held[name], true);
      if (Math.random() < 0.3) {
        await fire(page, Math.random() < 0.5 ? 'Space' : 'KeyE', true);
        await fire(page, 'Space', false);
      }
    }
    if (process.env.PERK) {
      // Each player picks a perk for their own house, at their own pace (the
      // guest a second later); both ends must go on together.
      const state = (page) =>
        page.eval(`(()=>{const b=window.__battle; return b ? {step: b.sync?.step ?? -1, draft: !!b.choosing, stalled: (b.sync||b.client||b.feed||{}).stalled ?? 0, perks: (b.run.perks||[]).join(), mate: (b.run.mate?.perks||[]).join()} : null})()`);
      const pick = (page) =>
        page.eval(`(()=>{const c=document.querySelector('.perk-card'); if(!c) return ''; const who=document.querySelector('.perk-for')?.innerText ?? ''; c.click(); return who + ' | ' + c.innerText.replace(/\s+/g, ' ').slice(0, 40)})()`);
      const hostPick = await pick(host);
      if (hostPick) console.log('host picked', JSON.stringify(hostPick));
      if (await guest.eval(`!!document.querySelector('.perk-card')`)) {
        if (guestSaw < 0) guestSaw = Date.now();
        if (Date.now() - guestSaw > 1000) {
          const g = await pick(guest);
          if (g) {
            console.log('guest picked', JSON.stringify(g));
            guestSaw = -1;
          }
        }
      }
      const [hs, gs] = [await state(host), await state(guest)];
      if (hostPick) perks.push(hs.step);
      if (hostPick || hs.draft || gs.draft) console.log('host', JSON.stringify(hs), 'guest', JSON.stringify(gs));
      stall = Math.max(stall, hs.stalled, gs.stalled);
      ends = [hs, gs];
    }
    await sleep(500);
  }
  const read = (page) =>
    page.eval(`(()=>{const b=window.__battle; return b ? {step:b.sync?.step ?? -1, desync:!!b.sync?.desync, closed:!!b.sync?.closed, stalled:b.sync?.stalled ?? 0, rec:window.__rec, hp:b.run.hp, kills:b.run.kills, ally: b.ally ? {x:b.ally.x,y:b.ally.y,hp:b.ally.hp}:null, ended:b.ended} : null})()`);
  const [a, b] = [await read(host), await read(guest)];
  let same = 0,
    diff = 0;
  for (const [step, hash] of Object.entries(a?.rec ?? {}))
    if (b?.rec && step in b.rec) {
      if (hash === b.rec[step]) same++;
      else diff++;
    }
  console.log(JSON.stringify({ host: { ...a, rec: undefined }, guest: { ...b, rec: undefined }, checkpointsEqual: same, checkpointsDifferent: diff }, null, 1));
  console.log('host errors', host.errors.slice(0, 5));
  console.log('guest errors', guest.errors.slice(0, 5));
  let ok = a && b && !a.desync && !b.desync && same >= 5 && diff === 0 && a.step > 300;
  let perkOk = true;
  if (process.env.PERK) {
    // At least one pick, and both ends went on well past the last one.
    const last = perks[perks.length - 1] ?? Infinity;
    console.log('picks at steps', perks, '| longest stall', stall.toFixed(1), 's');
    const [hs, gs] = ends;
    // Both ends hold the same perks of both houses, one for each at each level.
    const even = hs && gs && hs.perks === gs.perks && hs.mate === gs.mate && hs.perks.split(',').length === hs.mate.split(',').length;
    console.log('perks: host', hs?.perks, '/', hs?.mate, '| guest', gs?.perks, '/', gs?.mate);
    // The mirror: only the host simulates, so only its fight holds the perks.
    perkOk =
      MODE === 'host'
        ? perks.length > 0 && !!hs?.mate && hs.perks.split(',').length === hs.mate.split(',').length && !hs.draft
        : perks.length > 0 && b.step > last + 120 && stall < 4 && !!even;
  }
  if (MODE === 'host') {
    // The mirror: the guest only draws, so compare what it shows with the host.
    const look = (page) =>
      page.eval(`(()=>{const b=window.__battle; return {kind: b.client ? 'mirror' : b.feed ? 'feed' : 'other', kills:b.run.kills, enemies:b.enemies.length, elapsed:b.elapsed, ally:b.ally && {x:b.ally.x,y:b.ally.y}, stalled:(b.client||b.feed||{}).stalled ?? 0}})()`);
    const [ha, ga] = [await look(host), await look(guest)];
    console.log(JSON.stringify({ host: ha, guest: ga }));
    ok =
      ha.kind === 'feed' &&
      ga.kind === 'mirror' &&
      ga.elapsed > 8 &&
      Math.abs(ha.elapsed - ga.elapsed) < 1.5 &&
      Math.abs(ha.kills - ga.kills) <= 3 &&
      ga.enemies > 0;
    const shot = await guest.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(os.tmpdir(), 'osbb-guest-mirror.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('guest screenshot', path.join(os.tmpdir(), 'osbb-guest-mirror.png'));
  }
  if (MODE === 'host' && process.env.FINISH) {
    // End the host's fight early: the guest gets the result and is paid cores.
    await host.eval(`window.__battle.duration = window.__battle.elapsed + 2`);
    // The host's own screen picks the perks the fight stops for.
    const text = await until('the guest result card', async () => {
      await host.eval(`document.querySelector('.perk-card')?.click()`);
      return guest.eval(`document.querySelector('.guest-result')?.innerText`);
    }, 90000).catch(async (e) => {
      // Where each end stands when the result does not come.
      const look = (p) =>
        p.eval(`(()=>{const b=window.__battle; return {battle: b ? {ended:b.ended, elapsed:b.elapsed, duration:b.duration, kind:b.client?'mirror':b.feed?'feed':'other', stalled:(b.client||b.feed||{}).stalled, closed:(b.client||b.feed||{}).closed, seen:(b.client||{}).seen, relayIn:(window.__link||{}).seen, relayOut:(window.__link||{}).sent} : null, screen: document.body.innerText.slice(0, 160)}})()`).catch((e) => String(e));
      console.log('host:', JSON.stringify(await look(host)));
      console.log('guest:', JSON.stringify(await look(guest)));
      throw e;
    });
    const cores = await guest.eval(`document.querySelector('.guest-cores')?.innerText`);
    console.log('guest result card:', JSON.stringify(text), '|', cores);
    ok = ok && /Бій/.test(text) && /\+\d+/.test(cores || '');
    if (process.env.VOTE) {
      await vote(host, guest);
      ok = ok && process.exitCode !== 1;
    }
  }
  ok = ok && perkOk;
  console.log(ok ? 'E2E OK' : 'E2E FAILED');
  for (const p of procs) p.kill();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('E2E ERROR', e.message);
  for (const p of procs) p.kill();
  process.exit(2);
});
void MODE;
