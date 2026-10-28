// Two real browsers, one fight: a host and a guest (headless Chrome, driven
// over the DevTools protocol) meet in a room on the public broker, play a
// fight with random keys and compare fingerprints of the simulation.
//   npm run dev            (in another terminal)
//   node scripts/net-e2e.cjs [seconds] [mode]
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

(async () => {
  const [wa, wb] = [await launch(9331), await launch(9332)];
  const host = new Page('host', wa),
    guest = new Page('guest', wb);
  await Promise.all([host.go(URL), guest.go(URL)]);
  console.log('pages loaded');

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
  await host.eval(`document.querySelector('button.tree-go').click()`);
  await until('host fight', () => host.eval(`!!window.__battle`), 40000);
  await until('guest fight', () => guest.eval(`!!window.__battle`), 40000);
  console.log('both in the fight');

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
  const ok = a && b && !a.desync && !b.desync && same >= 5 && diff === 0 && a.step > 300;
  console.log(ok ? 'E2E OK' : 'E2E FAILED');
  for (const p of procs) p.kill();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('E2E ERROR', e.message);
  for (const p of procs) p.kill();
  process.exit(2);
});
void MODE;
