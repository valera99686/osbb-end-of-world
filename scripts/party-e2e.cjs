// A room of three or four real browsers: a host and two or three guests meet in
// a room on the public broker, start a raid and play the first fight, in
// lockstep (default) or in the mirror, and compare what each of them sees.
//   npm run dev                       (in another terminal)
//   PLAYERS=4 node scripts/party-e2e.cjs [seconds] [sync|host]
//   REJOIN=guest ...                  (a guest closes its tab in the fight and comes back)
//   REJOIN=host  ...                  (the host reloads the page mid-raid and resumes the room)
// Needs Chrome at the usual path and an internet connection (the broker).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME =
  process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.OSBB_URL || 'http://localhost:5173/';
const PLAYERS = Math.max(3, Math.min(4, Number(process.env.PLAYERS) || 3));
const SECONDS = Number(process.argv[2]) || 25;
const MODE = process.argv[3] === 'host' ? 'host' : 'sync';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];

async function launch(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osbb-party-'));
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
      if (page) return { ws: page.webSocketDebuggerUrl, port };
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome did not start on ' + port);
}
class Page {
  constructor(name, target) {
    this.name = name;
    this.port = target.port;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.ws = new WebSocket(target.ws);
    this.ready = new Promise((res) => (this.ws.onopen = res));
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m);
        this.pending.delete(m.id);
      } else if (m.method === 'Runtime.exceptionThrown')
        this.errors.push(
          m.params.exceptionDetails.exception?.description ?? 'exception',
        );
      else if (
        m.method === 'Runtime.consoleAPICalled' &&
        m.params.type === 'error'
      )
        this.errors.push(
          m.params.args.map((a) => a.value ?? a.description).join(' '),
        );
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
      throw new Error(
        `${this.name}: ${r.result.exceptionDetails.exception?.description}`,
      );
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
  `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>new RegExp(${JSON.stringify(text)}).test(b.innerText)); if(!b) return false; b.click(); return true})()`;
const fire = (page, code, down) =>
  page.eval(
    `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(down ? 'keydown' : 'keyup')},{code:${JSON.stringify(code)},bubbles:true,cancelable:true}))`,
  );
const read = (page) =>
  page.eval(`(()=>{const b=window.__battle; return b ? {
    seat: b.seat, step: b.sync?.step ?? -1, seats: b.sync?.seats ?? 0,
    kind: b.client ? 'mirror' : b.sync ? 'lockstep' : b.feed ? 'feed' : 'alone',
    desync: !!b.sync?.desync, closed: !!(b.sync||b.client||b.feed||{}).closed,
    stalled: (b.sync||b.client||b.feed||{}).stalled ?? 0,
    rec: window.__rec, kills: b.run.kills, elapsed: b.elapsed,
    allies: b.allies.map(a => ({seat: a.seat, hero: a.hero, x: Math.round(a.x), y: Math.round(a.y), away: !!a.away, down: !!a.down})),
    enemies: b.enemies.length, ended: b.ended } : null})()`);

(async () => {
  const targets = [];
  for (let i = 0; i < PLAYERS; i++) targets.push(await launch(9340 + i));
  const pages = targets.map(
    (t, i) => new Page(i === 0 ? 'host' : 'guest' + i, t),
  );
  const [host, ...guests] = pages;
  await Promise.all(pages.map((p) => p.go(URL)));
  console.log(PLAYERS, 'pages loaded');
  const ok = [];
  const check = (what, good) => {
    ok.push(!!good);
    console.log(good ? 'ok ' : 'NOT OK', what);
  };

  for (const page of pages)
    await until('online tab', () =>
      page.eval(click('По мережі', 'button.play-mode')),
    );
  if (MODE === 'host') {
    await host.eval(
      `document.querySelector('.online-more')?.setAttribute('open', '')`,
    );
    await host.eval(click('Хост рахує', '.share-option'));
  }
  await until('room button', () => host.eval(click('Створити кімнату')));
  const code = await until('room code', () =>
    host.eval(`document.querySelector('.room-code b')?.textContent`),
  );
  console.log('room code', code);
  for (const guest of guests) {
    await guest.eval(click('Приєднатися'));
    await guest.eval(
      `(()=>{const i=document.querySelector('.online-join input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, ${JSON.stringify(code)}); i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await sleep(300);
    await guest.eval(click('^Зайти$'));
    await until('guest room screen', () =>
      guest.eval(`!!document.querySelector('.guest-room')`),
    );
  }
  await until('the host sees them all', () =>
    host.eval(
      `/Підключено: ${PLAYERS - 1} із 3/.test(document.body.innerText)`,
    ),
  );
  check(`the host sees ${PLAYERS - 1} guests`, true);
  const seats = [];
  for (const guest of guests)
    seats.push(
      await guest.eval(
        `document.querySelector('.guest-room')?.dataset?.seat ?? ''`,
      ),
    );
  console.log('seats shown at the guests:', JSON.stringify(seats));

  // The host walks into the first fight.
  await host.eval(`document.querySelector('.start-button').click()`);
  await sleep(1200);
  for (let i = 0; i < 6; i++) {
    for (const page of pages)
      await page.eval(click('Пропустити', '[role=dialog] button'));
    await sleep(500);
  }
  await until('the map', () =>
    host.eval(`!!document.querySelector('button.tree-go')`),
  );
  const mapSeen = await Promise.all(
    guests.map((g) =>
      until('the shared map at a guest', () =>
        g.eval(
          `document.querySelector('.guest-room .tree-vote-note')?.innerText`,
        ),
      ),
    ),
  );
  console.log('guests see the first map:', JSON.stringify(mapSeen));
  if (process.env.SCENE === 'voice') {
    // Everybody hears everybody: a guest speaks, and the host and the other
    // guests hear it; the guest does not hear itself.
    for (const page of pages) {
      await until('the chat button at ' + page.name, () =>
        page.eval(`!!document.querySelector('.chat-open')`),
      );
      await page.eval(`document.querySelector('.chat-open').click()`);
      await until('the panel at ' + page.name, () =>
        page.eval(`!!document.querySelector('.chat-voice .chat-mic')`),
      );
    }
    const heard = (page) =>
      page.eval(`document.querySelector('.chat-voice')?.dataset.heard === '1'`);
    const track = (page) =>
      page.eval(
        `(()=>{const a=[...document.querySelectorAll('audio')].find(x => x.srcObject); const t=a?.srcObject?.getAudioTracks?.()[0]; return t ? t.readyState : 'none'})()`,
      );
    // Guest 1 speaks.
    await guests[0].eval(
      `document.querySelector('.chat-voice .chat-mic').click()`,
    );
    for (const page of [host, ...guests.slice(1)]) {
      const got = await until(
        page.name + ' hears guest 1',
        () => heard(page),
        40000,
      ).catch(() => false);
      check(`${page.name} hears guest 1`, got);
      check(`${page.name} plays a live track`, (await track(page)) === 'live');
    }
    check('guest 1 does not hear itself', !(await heard(guests[0])));
    // The roster knows whose microphone is on.
    const rows = await host.eval(
      `[...document.querySelectorAll('.chat-voices li')].map(li => li.textContent)`,
    );
    console.log('the host list:', JSON.stringify(rows));
    check(
      'the host lists the guests',
      rows.length === PLAYERS - 1 &&
        rows.some((r) => /на звʼязку|говорить/.test(r)),
    );
    // The next guest speaks too: guest 1 now hears it, the others hear both.
    await guests[1].eval(
      `document.querySelector('.chat-voice .chat-mic').click()`,
    );
    const heardAgain = await until(
      'guest 1 hears guest 2',
      () => heard(guests[0]),
      40000,
    ).catch(() => false);
    check('guest 1 hears guest 2', heardAgain);
    // Turning a microphone off ends its sound for the others.
    await guests[0].eval(
      `document.querySelector('.chat-voice .chat-mic').click()`,
    );
    await sleep(1500);
    const stillGuest2 = await host.eval(
      `document.querySelector('.chat-voice')?.dataset.heard === '1'`,
    );
    check('the host still hears guest 2', stillGuest2);
    for (const page of pages)
      console.log(page.name, 'errors', page.errors.slice(0, 3));
    const good = ok.every(Boolean) && pages.every((p) => !p.errors.length);
    console.log(good ? 'E2E OK' : 'E2E FAILED');
    for (const p of procs) p.kill();
    process.exit(good ? 0 : 1);
  }
  if (process.env.SCENE === 'together' || process.env.SCENE === 'council') {
    const M = require('../.test-build/model.js');
    const scene = process.env.SCENE;
    const sel = (p) => (p === host ? '.play-main' : '.guest-room');
    if (scene === 'together') {
      // A meeting with a role for each of the players.
      let seed = 1;
      while (!M.eventFor({ seed, chapter: 0, step: 0, coop: 'nina' }).together)
        seed++;
      await host.eval(
        `window.__osbbRun({ page: 'event', kind: 'event', seed: ${seed} })`,
      );
      const roles = (p) =>
        p.eval(
          `[...document.querySelectorAll(${JSON.stringify(sel(p) + ' .together-role')})].map(b => (b.disabled ? '-' : '+') + (b.classList.contains('done') ? 'done' : 'open'))`,
        );
      for (const page of pages)
        await until(
          'the roles at ' + page.name,
          async () => (await roles(page)).length === PLAYERS,
        );
      check(`${PLAYERS} roles at every end`, true);
      const text = await host.eval(
        `document.querySelector('.play-main .lead')?.innerText`,
      );
      check('the text tells of the extra roles', /третій|Третій/.test(text));
      // Everybody does their part, one after another; nothing happens before the last.
      for (const [i, page] of pages.entries()) {
        const early = await host.eval(
          `!!document.querySelector('.play-main .mission-banner')`,
        );
        if (i > 0 || early)
          check(`nothing happens before the last (${i} done)`, !early);
        await page.eval(
          `document.querySelector(${JSON.stringify(sel(page) + ' .together-role.mine:not(:disabled)')}).click()`,
        );
        await sleep(700);
      }
      const outcomes = [];
      for (const page of pages)
        outcomes.push(
          await until(
            'the outcome at ' + page.name,
            () =>
              page.eval(
                `document.querySelector(${JSON.stringify(sel(page) + ' .mission-banner p')})?.innerText`,
              ),
            15000,
          ),
        );
      console.log('outcome:', JSON.stringify(outcomes[0]));
      check(
        'all see the same outcome',
        outcomes.every((o) => o && o === outcomes[0]),
      );
    } else {
      // The council: everybody votes, the most picked rule is taken.
      await host.eval(`window.__osbbRun({ page: 'council' })`);
      for (const page of pages)
        await until(
          'the council at ' + page.name,
          async () =>
            (await page.eval(
              `document.querySelectorAll(${JSON.stringify(sel(page) + ' .council-pact')}).length`,
            )) === 4,
          20000,
        );
      check('four cards at every end (three rules and "leave it")', true);
      const vote = (page, i) =>
        page.eval(
          `document.querySelectorAll(${JSON.stringify(sel(page) + ' .council-pact')})[${i}].click()`,
        );
      // Two for the first rule, the rest for the second one or for leaving it.
      const picks = pages.map((_, i) => (i < 2 ? 0 : i === 2 ? 1 : 3));
      for (const [i, page] of pages.entries()) {
        await vote(page, picks[i]);
        await sleep(600);
      }
      await until(
        'the map after the council',
        () =>
          host.eval(
            `!!document.querySelector('button.tree-go') || !!document.querySelector('.pact-chip')`,
          ),
        20000,
      );
      const chip = await host.eval(
        `document.querySelector('.pact-chip b')?.innerText ?? ''`,
      );
      console.log('the rule of the location:', JSON.stringify(chip));
      check('the most picked rule is taken', /Правило локації/.test(chip));
    }
    for (const page of pages)
      console.log(page.name, 'errors', page.errors.slice(0, 3));
    const good = ok.every(Boolean) && pages.every((p) => !p.errors.length);
    console.log(good ? 'E2E OK' : 'E2E FAILED');
    for (const p of procs) p.kill();
    process.exit(good ? 0 : 1);
  }
  await host.eval(`document.querySelector('button.tree-go').click()`);
  for (const page of pages)
    await until(
      page.name + ' fight',
      () => page.eval(`!!window.__battle`),
      45000,
    );
  console.log('all in the fight');

  if (process.env.REJOIN === 'host') {
    // The host's page is reloaded in the middle of the raid. It opens the same
    // room (the same code) and the guests find their seats by their tokens.
    await sleep(3000);
    console.log('the host reloads its page');
    host.dead = true;
    await host.go(URL);
    await until(
      'the way back to the room',
      () => host.eval(click('Продовжити рейд у кімнаті', 'button')),
      20000,
    );
    const again = await until(
      'the room opens',
      () => host.eval(`window.__net?.code || null`),
      60000,
    ).catch(() => null);
    console.log('room code after the return:', again, '(was', code + ')');
    check('the room has the same code', again === code);
    // The host walks on; the guests come back by themselves.
    await until(
      'the guests are back',
      () => host.eval(`window.__net?.here().length === ${PLAYERS - 1}`),
      150000,
    );
    check('every guest found its seat again', true);
    const seatsNow = [];
    for (const guest of guests)
      seatsNow.push(
        await guest.eval(
          `document.querySelector('.guest-room')?.dataset?.seat ?? ''`,
        ),
      );
    console.log('seats at the guests now:', JSON.stringify(seatsNow));
    check(
      'the seats are the same as before',
      JSON.stringify(seatsNow) === JSON.stringify(seats),
    );
    host.dead = false;
    // The raid goes on into a fight with all of them.
    await host.eval(`document.querySelector('.start-button')?.click()`);
    await sleep(1500);
    for (let i = 0; i < 4; i++) {
      await host.eval(click('Пропустити', '[role=dialog] button'));
      await sleep(400);
    }
    await until(
      'the map again',
      () => host.eval(`!!document.querySelector('button.tree-go')`),
      30000,
    );
    await host.eval(`document.querySelector('button.tree-go').click()`);
    for (const page of pages)
      await until(
        page.name + ' fight after the return',
        () => page.eval(`!!window.__battle && !window.__battle.ended`),
        60000,
      );
    console.log('all in a fight again');
  }
  const keys = [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
  ];
  const held = new Map();
  const end = Date.now() + SECONDS * 1000;
  const REJOIN = process.env.REJOIN || '';
  let outage = null;
  while (Date.now() < end) {
    // A guest closes its tab in the fight, and comes back to the same game.
    if (
      REJOIN === 'guest' &&
      !outage &&
      Date.now() > end - (SECONDS - 3) * 1000
    ) {
      const gone = guests[1];
      gone.dead = true;
      outage = { page: gone, at: Date.now() };
      console.log('guest 2 closes its tab');
      await gone.go('about:blank');
      const hostSees = await until(
        'the host marks seat 2 away',
        async () => {
          const st = await read(host);
          return st && st.allies.find((a) => a.seat === 2)?.away === true
            ? st
            : null;
        },
        20000,
      ).catch(() => null);
      check('the host keeps the fight going and marks seat 2 away', !!hostSees);
      const before = hostSees?.step ?? 0;
      await sleep(1500);
      check('the others did not stop', (await read(host)).step > before + 60);
      await gone.go(URL);
      await until('the way back is offered', () =>
        gone.eval(click('Повернутися в кімнату', 'button')),
      );
      console.log('guest 2 presses "back to the room"');
      await until(
        'guest 2 is in the fight again',
        () => gone.eval(`!!window.__battle`),
        60000,
      );
      gone.dead = false;
      const me = await read(gone);
      console.log(
        'guest 2 after the return:',
        JSON.stringify({ ...me, rec: undefined }),
      );
      check(
        'it returns as a mirror, in its own seat',
        me.kind === 'mirror' && me.seat === 2,
      );
      const h2 = await read(host);
      check(
        'the host plays it as its own house again',
        h2.allies.find((a) => a.seat === 2)?.away === false,
      );
      // Its stick steers its house, for everybody.
      const x0 = h2.allies.find((a) => a.seat === 2).x;
      await fire(gone, 'KeyD', true);
      await sleep(2500);
      await fire(gone, 'KeyD', false);
      const x1 = (await read(host)).allies.find((a) => a.seat === 2).x;
      console.log('its house walked', x1 - x0, 'px');
      check('it steers its house again', x1 - x0 > 80);
    }
    for (const page of pages) {
      if (page.dead) continue;
      if (held.get(page)) await fire(page, held.get(page), false);
      const key = keys[Math.floor(Math.random() * keys.length)];
      held.set(page, key);
      await fire(page, key, true);
      if (Math.random() < 0.3) {
        await fire(page, Math.random() < 0.5 ? 'Space' : 'KeyE', true);
        await fire(page, 'Space', false);
      }
      // A perk draft is answered by whoever has it.
      await page.eval(`document.querySelector('.perk-card')?.click()`);
    }
    await sleep(500);
  }

  const states = [];
  for (const page of pages) states.push(await read(page));
  for (const s of states)
    console.log(
      JSON.stringify(
        s && {
          ...s,
          rec: undefined,
          allies: s.allies
            .map((a) => `${a.seat}:${a.x},${a.y}${a.away ? '!' : ''}`)
            .join(' '),
        },
      ),
    );
  check('everybody is in the fight', states.every(Boolean));
  // After a return the links may have come through the relay, which suits the mirror.
  const mirrored =
    MODE === 'host' ||
    (process.env.REJOIN === 'host' && states[0].kind === 'feed');
  if (!mirrored) {
    check(
      REJOIN === 'guest'
        ? 'lockstep at the others, a mirror at the guest that came back'
        : 'lockstep at every end',
      states.every(
        (s, i) =>
          s &&
          (s.kind === 'lockstep' ||
            (REJOIN === 'guest' && i === 2 && s.kind === 'mirror')),
      ),
    );
    check(
      'each knows its seat',
      states.every((s, i) => s && s.seat === i),
    );
    check(
      'each has all the houses',
      states.every((s) => s && s.allies.length === PLAYERS - 1),
    );
    if (REJOIN === 'guest')
      check(
        'nobody is away at the end',
        states.every((s) => s && s.allies.every((x) => !x.away)),
      );
    let same = 0,
      diff = 0;
    // Those who simulate with the host: a guest who came back as a mirror does not.
    const [a, ...all] = states;
    const rest = all.filter((x) => x && x.kind === 'lockstep');
    for (const [step, hash] of Object.entries(a.rec ?? {}))
      for (const s of rest)
        if (s.rec && step in s.rec) {
          if (hash === s.rec[step]) same++;
          else diff++;
        }
    console.log('checkpoints equal', same, 'different', diff);
    check('the fingerprints agree', same >= 4 * (PLAYERS - 1) && diff === 0);
    check(
      'nobody drifted or closed',
      states.every((s) => s && !s.desync && !s.closed),
    );
    check('the fight ran', a.step > 300);
  } else {
    check(
      'the host feeds, the guests mirror',
      states[0].kind === 'feed' &&
        states.slice(1).every((s) => s.kind === 'mirror'),
    );
    check(
      'every guest follows the host clock',
      states
        .slice(1)
        .every(
          (s) => s.elapsed > 8 && Math.abs(s.elapsed - states[0].elapsed) < 2,
        ),
    );
    check(
      'every guest sees all the houses',
      states.slice(1).every((s) => s.allies.length === PLAYERS - 1),
    );
  }
  for (const page of pages)
    console.log(page.name, 'errors', page.errors.slice(0, 4));
  check(
    'no page errors',
    pages.every((p) => !p.errors.length),
  );
  const good = ok.every(Boolean);
  console.log(good ? 'E2E OK' : 'E2E FAILED');
  for (const p of procs) p.kill();
  process.exit(good ? 0 : 1);
})().catch((e) => {
  console.error('E2E ERROR', e.message);
  for (const p of procs) p.kill();
  process.exit(2);
});
