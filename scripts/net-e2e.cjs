// Two real browsers, one fight: a host and a guest (headless Chrome, driven
// over the DevTools protocol) meet in a room on the public broker, play a
// fight with random keys and compare fingerprints of the simulation.
//   npm run dev            (in another terminal)
//   node scripts/net-e2e.cjs [seconds] [mode]
//   FINISH=1 VOTE=1 node scripts/net-e2e.cjs 8 host   (the map vote after a fight)
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

(async () => {
  const [wa, wb] = [await launch(9331), await launch(9332)];
  const host = new Page('host', wa),
    guest = new Page('guest', wb);
  await Promise.all([host.go(URL), guest.go(URL)]);
  console.log('pages loaded');

  if (MODE === 'host')
    await host.eval(click('Хост рахує', '.share-option'));
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

  // The host walks into the first fight.
  await host.eval(`document.querySelector('.start-button').click()`);
  await sleep(1200);
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
  let held = { host: null, guest: null };
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
    await sleep(500);
  }
  const read = (page) =>
    page.eval(`(()=>{const b=window.__battle; return b ? {step:b.sync?.step ?? -1, desync:!!b.sync?.desync, closed:!!b.sync?.closed, stalled:b.sync?.stalled ?? 0, rec:window.__rec, hp:b.run.hp, kills:b.run.kills, ally: b.ally ? {x:b.ally.x,y:b.ally.y,hp:b.ally.hp}:null, ended:b.ended} : null})()`);
  const [a, b] = [await read(host), await read(guest)];
  let same = 0,
    diff = 0;
  for (const [step, hash] of Object.entries(a?.rec ?? {}))
    if (b?.rec && step in b.rec) hash === b.rec[step] ? same++ : diff++;
  console.log(JSON.stringify({ host: { ...a, rec: undefined }, guest: { ...b, rec: undefined }, checkpointsEqual: same, checkpointsDifferent: diff }, null, 1));
  console.log('host errors', host.errors.slice(0, 5));
  console.log('guest errors', guest.errors.slice(0, 5));
  let ok = a && b && !a.desync && !b.desync && same >= 5 && diff === 0 && a.step > 300;
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
  console.log(ok ? 'E2E OK' : 'E2E FAILED');
  for (const p of procs) p.kill();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('E2E ERROR', e.message);
  for (const p of procs) p.kill();
  process.exit(2);
});
void MODE;
