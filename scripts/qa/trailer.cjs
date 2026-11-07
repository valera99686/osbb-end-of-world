// The trailer of the game: real footage of the real game (a Chrome driven over the
// DevTools protocol, 1080p, the screen of the page recorded frame by frame), the music the
// game renders itself, a voice (scripts/qa/narrate.py speaks scripts/qa/narration.json) and
// the picture cut to that voice, with subtitles, by ffmpeg.
//   npm test                         (once: .test-build for the veteran profile)
//   npm run dev -- --port 5180       (a dev build: it has the hooks for the boss etc.)
//   node scripts/qa/trailer.cjs capture [takes...]   (the raw footage in OUT/raw)
//   node scripts/qa/trailer.cjs music                (the game's themes as WAV)
//   python scripts/qa/narrate.py --out OUT/narration [--asr PYTHON]   (OmniVoice environment)
//   node scripts/qa/trailer.cjs voice DIR            (b1.mp3 ... of the Eleven engine, made ready)
//   NARRATION=narration-eleven node scripts/qa/trailer.cjs edit   (OUT/osbb-trailer-voiced.mp4)
// Takes: prologue, run, boss, house, duo, online. OUT defaults to ./trailer-out.
const fs = require('node:fs');
const path = require('node:path');
const { launch, sleep, closeAll, film } = require('./cdp.cjs');
const { veteran } = require('./profile.cjs');

const URL = process.env.OSBB_URL || 'http://127.0.0.1:5180/';
const OUT = path.resolve(process.env.OUT || 'trailer-out');
const RAW = path.join(OUT, 'raw');
const W = 1440;
const H = 810;
const DPR = 4 / 3; // 1440x810 css pixels are 1920x1080 on the film
const log = (...a) => console.log(...a);
let port = 9700;

// A page with the veteran's save, the toasts of achievements hidden.
async function open(extra = {}) {
  const p = await launch(port++, W, H);
  p.dpr = DPR;
  await p.go(URL, 1500);
  const prof = veteran(extra);
  await p.eval(`localStorage.setItem(${JSON.stringify(prof.key)}, ${JSON.stringify(prof.value)}); 0`);
  await p.go(URL, 3500);
  await hush(p);
  return p;
}
const hush = (p) =>
  p.eval(
    `(()=>{const s=document.createElement('style'); s.textContent='.toast-stack,.achievement-toast{display:none!important}'; document.head.appendChild(s); 0})()`,
  );
async function finish(p, name) {
  const frames = await p.stopRecording();
  const secs = (frames.endT ?? frames[frames.length - 1].t) - frames[0].t;
  log(name, frames.length, 'frames', secs.toFixed(1), 's');
  film(frames, path.join(RAW, name + '.mp4'), { fps: 30 });
  fs.rmSync(path.join(RAW, name + '-frames'), { recursive: true, force: true });
}
const rec = (p, name) => p.startRecording(path.join(RAW, name + '-frames'), 92);
const skipScenes = async (p, n = 8) => {
  for (let i = 0; i < n; i++) {
    await p.click('Пропустити', '[role=dialog] button');
    await sleep(350);
  }
};
// Smooth scroll of the page.
async function scroll(p, to, ms) {
  await p.eval(
    `new Promise((res)=>{const from=window.scrollY, t0=performance.now(); const tick=(t)=>{const k=Math.min(1,(t-t0)/${ms}); const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; window.scrollTo(0, from+(${to}-from)*e); k<1?requestAnimationFrame(tick):res(0)}; requestAnimationFrame(tick)})`,
  );
}
// Play: wander about, dash and use the hero's ability on a schedule; a perk draft that comes
// is shown for a moment and answered.
async function play(p, seconds, { second = false, onPerk } = {}) {
  const p1 = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
  const p2 = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
  const start = Date.now();
  let held = null;
  let held2 = null;
  let i = 0;
  let dashed = 0;
  let used = 0;
  while ((Date.now() - start) / 1000 < seconds) {
    const t = (Date.now() - start) / 1000;
    if (await p.eval(`!!document.querySelector('.perk-card')`)) {
      if (held) await p.key(held, false);
      held = null;
      await sleep(1800);
      onPerk?.(t);
      await p.eval(`document.querySelector('.perk-card')?.click(); 0`);
      await sleep(600);
      continue;
    }
    if (held) await p.key(held, false);
    held = p1[i % 4];
    await p.key(held, true);
    if (second) {
      if (held2) await p.key(held2, false);
      held2 = p2[(i + 2) % 4];
      await p.key(held2, true);
    }
    i++;
    if (t - dashed > 3.4) {
      dashed = t;
      await p.key('Space', true);
      await p.key('Space', false);
    }
    if (t - used > 9) {
      used = t;
      await p.key('KeyE', true);
      await p.key('KeyE', false);
      if (second) {
        await p.key('Period', true);
        await p.key('Period', false);
      }
    }
    await sleep(850);
  }
  if (held) await p.key(held, false);
  if (held2) await p.key(held2, false);
}
const toFight = async (p) => {
  await p.eval(`document.querySelector('button.tree-go').click()`);
  await p.until('the fight', `!!document.querySelector('canvas.battle-canvas')`, 30000);
  await sleep(2200);
};

const TAKES = {
  // The prologue of a new player: the story starts.
  async prologue() {
    const p = await open({ scenesSeen: [] });
    await rec(p, 'prologue');
    await sleep(3000);
    for (let i = 0; i < 3; i++) {
      await p.click('Далі', 'button');
      await sleep(3200);
    }
    await finish(p, 'prologue');
  },
  // The hub, a story scene, the map, a long fight with a perk draft.
  async run() {
    const p = await open({ scenesSeen: ['prologue', 'origins'] });
    await rec(p, 'run');
    await sleep(1800);
    await scroll(p, 900, 3200);
    await sleep(900);
    await scroll(p, 0, 1800);
    await sleep(700);
    await p.eval(`document.querySelector('.start-button').click()`);
    await sleep(4200);
    await skipScenes(p, 6);
    await p.until('the map', `!!document.querySelector('button.tree-go')`, 15000);
    await sleep(2500);
    await toFight(p);
    await play(p, 60);
    await finish(p, 'run');
  },
  // The boss: the card with the advice, then the fight.
  async boss() {
    const p = await open({ scenesSeen: ['prologue', 'origins', 'arrival-0'] });
    await p.eval(`document.querySelector('.start-button').click()`);
    await sleep(2500);
    await skipScenes(p, 4);
    await p.until('the map', `!!document.querySelector('button.tree-go')`, 15000);
    await rec(p, 'boss');
    await sleep(800);
    await p.eval(`window.__osbbRun({ page: 'combat', kind: 'boss', step: 9 }); 0`);
    await p.until('the boss', `!!document.querySelector('canvas.battle-canvas')`, 20000);
    await sleep(3600);
    await play(p, 14);
    await finish(p, 'boss');
  },
  // How to play, for someone who has not: the map, a node picked, then the fight.
  async howto() {
    const p = await open({ scenesSeen: ['prologue', 'origins', 'arrival-0'] });
    await p.eval(`document.querySelector('.start-button').click()`);
    await sleep(2500);
    await skipScenes(p, 4);
    await p.until('the map', `!!document.querySelector('button.tree-go')`, 15000);
    await rec(p, 'howto');
    await sleep(2400);
    await p.eval(`(()=>{const n=[...document.querySelectorAll('.tree-node.available')]; (n[1]||n[0])?.click(); 0})()`);
    await sleep(3000);
    await toFight(p);
    await play(p, 15);
    await finish(p, 'howto');
  },
  // The house: the plan of the flats.
  async house() {
    const p = await open({ scenesSeen: ['prologue', 'origins', 'arrival-0'] });
    await p.eval(`document.querySelector('.start-button').click()`);
    await sleep(2500);
    await skipScenes(p, 4);
    await p.until('the map', `!!document.querySelector('button.tree-go')`, 15000);
    await rec(p, 'house');
    await sleep(1500);
    await p.click('Квартири й обладнання');
    await sleep(3800);
    await finish(p, 'house');
  },
  // Two on one screen.
  async duo() {
    const p = await open({ scenesSeen: ['prologue', 'origins', 'arrival-0'] });
    await p.click('Вдвох тут', 'button.play-mode');
    await sleep(900);
    await p.eval('window.scrollTo(0,0)');
    await rec(p, 'duo');
    await sleep(2200);
    await p.eval(`document.querySelector('.start-button').click()`);
    await sleep(2500);
    await skipScenes(p, 4);
    await p.until('the map', `!!document.querySelector('button.tree-go')`, 15000);
    await toFight(p);
    await play(p, 18, { second: true });
    await finish(p, 'duo');
  },
  // A room for two: the host and the guest, filmed at the same time.
  async online() {
    const seen = { scenesSeen: ['prologue', 'origins', 'arrival-0'] };
    const host = await open(seen);
    const guest = await open(seen);
    await rec(host, 'online-host');
    await rec(guest, 'online-guest');
    const both = (fn) => Promise.all([fn(host), fn(guest)]);
    await sleep(1200);
    await both((p) => p.click('Вдвох по мережі', 'button.play-mode'));
    await sleep(1500);
    // Two pages filmed at once are slow for the lockstep that waits for the slower one:
    // the host counts the fight alone.
    await host.eval(`document.querySelector('.online-more')?.setAttribute('open', '')`);
    await host.click('Хост рахує', '.share-option');
    await sleep(900);
    await host.click('Створити кімнату');
    const code = await host.until('the code', `document.querySelector('.room-code b')?.textContent`);
    await sleep(2200);
    await guest.click('Приєднатися');
    await sleep(900);
    await guest.eval(
      `(()=>{const i=document.querySelector('.online-join input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, ${JSON.stringify(code)}); i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await sleep(1400);
    await guest.click('^Зайти$');
    await host.until('connected', `/Напарник підключений/.test(document.body.innerText)`, 40000);
    await guest.until('the room', `!!document.querySelector('.guest-room')`, 40000);
    await sleep(2200);
    // The chat.
    const type = (pg, v) =>
      pg.eval(
        `(()=>{const i=document.querySelector('.chat-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    await host.eval(`document.querySelector('.chat-open').click()`);
    await host.until('the panel', `!!document.querySelector('.chat-panel')`);
    await sleep(700);
    await type(host, 'Привіт! Готовий до рейду?');
    await sleep(900);
    await host.eval(`document.querySelector('.chat-form button[type=submit]').click()`);
    await sleep(1800);
    await guest.eval(`document.querySelector('.chat-open').click()`);
    await guest.until('the panel', `!!document.querySelector('.chat-panel')`);
    await sleep(900);
    await guest.click('Уперед', '.chat-quick button');
    await sleep(2200);
    await both((p) => p.click('Увімкнути мікрофон', '.chat-mic'));
    await sleep(2500);
    await both((p) => p.eval(`document.querySelector('.chat-close')?.click(); 0`));
    await sleep(700);
    // The raid: the map and the fight.
    await host.eval(`document.querySelector('.start-button').click()`);
    await sleep(2500);
    await skipScenes(host, 5);
    await host.until('the map', `!!document.querySelector('button.tree-go')`, 20000);
    await guest.until('the same map', `!!document.querySelector('.guest-room .tree-vote-note')`, 20000);
    await sleep(2800);
    await host.eval(`document.querySelector('button.tree-go').click()`);
    await host.until('host fight', `!!window.__battle`, 40000);
    await guest.until('guest fight', `!!window.__battle`, 40000);
    await sleep(2200);
    await Promise.all([play(host, 12), play(guest, 12)]);
    // The reward: two rows.
    await host.eval(`window.__battle.duration = window.__battle.elapsed + 1.5`);
    let seenRow = false;
    for (let i = 0; i < 70 && !seenRow; i++) {
      await host.eval(
        `[...document.querySelectorAll('[role=dialog] button')].find(b=>/Пропустити/.test(b.innerText))?.click(); document.querySelector('.perk-card')?.click(); 0`,
      );
      seenRow = await guest.eval(`!!document.querySelector('.guest-room button.item-card:not([disabled])')`);
      if (!seenRow) await sleep(1200);
    }
    await sleep(1500);
    await guest.eval(`document.querySelector('.guest-room .reward-owner.mate')?.scrollIntoView({block:'center'}); 0`);
    await host.eval(`document.querySelector('.reward-owner')?.scrollIntoView({block:'center'}); 0`);
    await sleep(2800);
    await guest.eval(`document.querySelector('.guest-room button.item-card:not([disabled])')?.click(); 0`);
    await sleep(3000);
    await Promise.all([finish(host, 'online-host'), finish(guest, 'online-guest')]);
  },
};

// ---------------------------------------------------------------------------
// The edit: the picture is cut to the voice. narrate.py speaks scripts/qa/narration.json
// (OUT/narration/<id>.wav and timing.json); here every block of speech gets the shots that
// go with it, the subtitles, the music of the game under it, and ffmpeg puts it together.
// ---------------------------------------------------------------------------
const FADE = 0.25; // the cross-fade between two shots
const FONT = 'segoeuib.ttf'; // copied next to the clips: a bare name needs no escaping
const AMBER = '0xE0A54A';
const TEAL = '0x6CBFAC';
const LEAD = 0.7; // silence before the first word
const GAP = 0.3; // between two blocks
const TAIL = 2.8; // after the last word: the end card stays

function edit() {
  const { execFileSync } = require('node:child_process');
  const narrDir = process.env.NARRATION || 'narration'; // narration (OmniVoice) or narration-eleven
  const NARR = path.join(OUT, narrDir);
  const timing = JSON.parse(fs.readFileSync(path.join(NARR, 'timing.json'), 'utf8'));
  const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'narration.json'), 'utf8'));
  // The speech on the timeline.
  let t = LEAD;
  const B = {};
  for (const b of script.blocks) {
    const d = timing[b.id].seconds;
    B[b.id] = { ...b, start: t, end: t + d, dur: d };
    t += d + GAP;
  }
  const total = B.b8.end + TAIL;
  // Where one block's pictures give way to the next one's.
  const cut = { b1: 0 };
  const order = script.blocks.map((b) => b.id);
  order.forEach((id, i) => {
    if (i > 0) cut[id] = (B[order[i - 1]].end + B[id].start) / 2;
  });
  cut.end = total;
  const span = (id, next) => cut[next] - cut[id];

  // The shots: [id, source clip, start in the clip, from, to (on the timeline), kind...]
  const half = (id, next, k) => cut[id] + span(id, next) * k;
  const part = half;
  const SHOTS = [
    { id: 'story1', src: 'prologue', ss: 1.0, a: 0, b: part('b1', 'b2', 0.5), kind: 'push' },
    { id: 'story2', src: 'prologue', ss: 6.6, a: part('b1', 'b2', 0.5), b: cut.b2, kind: 'push' },
    { id: 'hub', src: 'run', ss: 0.8, a: cut.b2, b: part('b2', 'b3', 0.42) },
    { id: 'fightA', src: 'run', ss: 19.5, a: part('b2', 'b3', 0.42), b: part('b2', 'b3', 0.74) },
    { id: 'fightA2', src: 'run', ss: 40, a: part('b2', 'b3', 0.74), b: cut.b3 },
    // How to play: the map, then the fight with the keys named on the screen.
    { id: 'map', src: 'howto', ss: 0.3, a: cut.b3, b: part('b3', 'b4', 0.36) },
    { id: 'howto', src: 'howto', ss: 6.0, a: part('b3', 'b4', 0.36), b: cut.b4, keys: true },
    { id: 'house', src: 'house', ss: 1.5, a: cut.b4, b: part('b4', 'b5', 0.55) },
    { id: 'fightC', src: 'run', ss: 44, a: part('b4', 'b5', 0.55), b: cut.b5 },
    { id: 'perk', src: 'run', ss: 29.8, a: cut.b5, b: part('b5', 'b6', 0.45) },
    { id: 'boss', src: 'boss', ss: 1.0, a: part('b5', 'b6', 0.45), b: cut.b6 },
    { id: 'duo', src: 'duo', ss: 8, a: cut.b6, b: part('b6', 'b7', 0.33) },
    { id: 'online', kind: 'split', a: part('b6', 'b7', 0.33), b: cut.b7 },
    { id: 'stats', kind: 'stats', a: cut.b7, b: cut.b8 },
    { id: 'end', kind: 'end', a: cut.b8, b: total },
  ];
  // Piece k+1 starts FADE/2 before the cut, so a cut is the middle of its cross-fade.
  const starts = SHOTS.map((s, k) => (k === 0 ? 0 : s.a - FADE / 2));
  SHOTS.forEach((s, k) => {
    s.start = starts[k];
    s.d = (k + 1 < SHOTS.length ? starts[k + 1] + FADE : total) - starts[k];
  });
  // The xfade chain computes start times from the lengths: they have to agree with the cuts.
  let at = SHOTS[0].d;
  SHOTS.slice(1).forEach((s, _k) => {
    const offset = at - FADE;
    if (Math.abs(offset - s.start) > 0.01) throw new Error(`shot ${s.id} would start at ${offset} not ${s.start}`);
    at = offset + s.d;
  });

  const TXT = path.join(OUT, 'txt');
  fs.mkdirSync(TXT, { recursive: true });
  if (!fs.existsSync(path.join(OUT, FONT))) fs.copyFileSync(path.join('C:/Windows/Fonts', FONT), path.join(OUT, FONT));
  let txtN = 0;
  const text = (s) => {
    const f = `txt/t${txtN++}.txt`;
    fs.writeFileSync(path.join(OUT, f), s);
    return f;
  };
  const dt = (s, opts) => `drawtext=fontfile=${FONT}:textfile=${text(s)}:${opts}`;
  const inputs = [];
  const input = (src, ss, d) => {
    inputs.push(['-ss', String(ss), '-t', String(d.toFixed ? d.toFixed(3) : d), '-i', `raw/${src}.mp4`]);
    return inputs.length - 1;
  };
  const clipLen = (src) => {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(RAW, `${src}.mp4`)]);
    return parseFloat(out.toString());
  };
  const norm = 'fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p,setpts=PTS-STARTPTS';
  // A push-in on the picture of a cut-scene: the game's own frame falls outside the shot.
  const push = 'fps=30,scale=2880:1620:flags=lanczos,crop=1920:1080:480:120,setsar=1,format=yuv420p,setpts=PTS-STARTPTS';
  const filters = [];
  const labels = [];
  SHOTS.forEach((s, k) => {
    const out = `v${k}`;
    labels.push(out);
    if (s.kind === 'split') {
      const parts = [0.45, 0.28, 0.27].map((f) => f * s.d);
      const begin = [3.5, 37.0, 52.0];
      const sides = ['online-host', 'online-guest'].map((src, side) => {
        const pieces = parts.map((d, j) => {
          const i = input(src, begin[j], d);
          filters.push(`[${i}:v]fps=30,scale=944:531:flags=lanczos,setsar=1,format=yuv420p,setpts=PTS-STARTPTS[s${k}_${side}_${j}]`);
          return `[s${k}_${side}_${j}]`;
        });
        filters.push(`${pieces.join('')}concat=n=${pieces.length}:v=1:a=0[side${k}_${side}]`);
        return `[side${k}_${side}]`;
      });
      filters.push(
        `color=c=0x0B141A:s=1920x1080:r=30:d=${s.d.toFixed(3)},format=yuv420p[bg${k}]`,
        `[bg${k}]${sides[0]}overlay=x=12:y=250[o${k}a]`,
        `[o${k}a]${sides[1]}overlay=x=964:y=250,` +
          `drawbox=x=10:y=248:w=948:h=535:color=${TEAL}@0.8:t=3,drawbox=x=962:y=248:w=948:h=535:color=${AMBER}@0.8:t=3,` +
          dt('ГОСПОДАР', `fontsize=34:fontcolor=${TEAL}:x=12:y=196`) + ',' +
          dt('ГІСТЬ', `fontsize=34:fontcolor=${AMBER}:x=964:y=196`) + ',' +
          dt('Гра по мережі: два пристрої, одна кімната', 'fontsize=44:fontcolor=white:x=(w-text_w)/2:y=70') + `[${out}]`,
      );
    } else if (s.kind === 'stats') {
      const i = input('run', 1.0, s.d);
      let chain = `[${i}:v]${norm},boxblur=22:6,eq=brightness=-0.32:saturation=0.8`;
      chain += ',' + dt('Усе це вже в грі', `fontsize=60:fontcolor=${TEAL}:x=(w-text_w)/2:y=190:alpha='min(1,t/0.5)'`);
      // The numbers come as they are said: nine heroes, fifty-five items, four endings, 650 lines.
      const said = [['9', 'героїв', 0.02], ['55', 'предметів', 0.2], ['4', 'кінцівки', 0.47], ['650', 'озвучених реплік', 0.62]];
      said.forEach(([n, label, f], j) => {
        const cx = 240 + 480 * j;
        const t0 = (f * B.b7.dur + (B.b7.start - s.start)).toFixed(2);
        const a = `alpha='min(1,max(0,(t-${t0})/0.45))'`;
        chain += ',' + dt(n, `fontsize=190:fontcolor=${AMBER}:x=${cx}-text_w/2:y='420+50*(1-min(1,max(0,(t-${t0})/0.45)))':${a}`);
        chain += ',' + dt(label, `fontsize=44:fontcolor=white:x=${cx}-text_w/2:y='650+50*(1-min(1,max(0,(t-${t0})/0.45)))':${a}`);
      });
      filters.push(`${chain}[${out}]`);
    } else if (s.kind === 'end') {
      const i = input('prologue', 0.6, s.d);
      const t1 = (B.b8.start - s.start).toFixed(2);
      let chain = `[${i}:v]${push},eq=brightness=-0.22`;
      chain += ',' + dt('ОСББ', `fontsize=230:fontcolor=white:x=(w-text_w)/2:y=140:alpha='min(1,max(0,(t-${t1})/0.6))'`);
      chain += ',' + dt('кінця світу', `fontsize=120:fontcolor=${AMBER}:x=(w-text_w)/2:y=380:alpha='min(1,max(0,(t-${t1}-0.3)/0.6))'`);
      chain += ',' + dt('Грай у браузері: valera99686.github.io/osbb-end-of-world', `fontsize=46:fontcolor=white:box=1:boxcolor=0x000000@0.55:boxborderw=18:x=(w-text_w)/2:y=600:alpha='min(1,max(0,(t-${t1}-1.0)/0.5))'`);
      chain += ',' + dt('Android APK у Releases на GitHub  ·  Вдвох по мережі: листування й розмови прямо в грі', `fontsize=34:fontcolor=white:x=(w-text_w)/2:y=700:alpha='min(1,max(0,(t-${t1}-1.4)/0.5))'`);
      chain += ',' + dt('Версія 0.37.0', `fontsize=30:fontcolor=${TEAL}:x=(w-text_w)/2:y=775:alpha='min(1,max(0,(t-${t1}-1.8)/0.5))'`);
      filters.push(`${chain},fade=t=out:st=${(s.d - 1.2).toFixed(2)}:d=1.2[${out}]`);
    } else {
      const room = Math.max(1, clipLen(s.src) - s.ss - 0.1);
      const i = input(s.src, s.ss, Math.min(s.d, room));
      let chain = `[${i}:v]${s.kind === 'push' ? push : norm}`;
      // A shot longer than its footage holds the last frame.
      if (s.d > room) chain += `,tpad=stop_mode=clone:stop_duration=${(s.d - room + 0.2).toFixed(2)}`;
      if (s.kind === 'push') chain += ',drawbox=x=0:y=0:w=iw:h=ih:color=black@0.28:t=fill';
      if (s.keys) {
        // The keys, one after the other as the voice names them.
        const base = B.b3.start - s.start;
        [['W A S D', 'рухатися', 0.56], ['ПРОБІЛ', 'ривок: втекти від біди', 0.75], ['E', 'вміння героя', 0.9]].forEach(([key, label, f], j) => {
          const t0 = (base + f * B.b3.dur).toFixed(2);
          const y = 540 + j * 88;
          const on = `enable='gte(t,${t0})'`;
          chain += `,drawbox=x=60:y=${y}:w=780:h=72:color=0x0B141A@0.85:t=fill:${on}`;
          chain += `,drawbox=x=60:y=${y}:w=9:h=72:color=${AMBER}@1:t=fill:${on}`;
          chain += ',' + dt(key, `fontsize=42:fontcolor=${AMBER}:x=92:y=${y + 13}:${on}`);
          chain += ',' + dt(label, `fontsize=40:fontcolor=white:x=360:y=${y + 14}:${on}`);
        });
      }
      filters.push(`${chain}[${out}]`);
    }
  });
  // The cross-fades.
  let cur = labels[0];
  let len = SHOTS[0].d;
  for (let k = 1; k < SHOTS.length; k++) {
    const offset = len - FADE;
    filters.push(`[${cur}][${labels[k]}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[x${k}]`);
    cur = `x${k}`;
    len = offset + SHOTS[k].d;
  }
  // The subtitles: the lines of every block, each for its share of the block's time.
  const subs = [];
  for (const id of order) {
    const lines = B[id].sub;
    const weight = lines.map((l) => l.replace(/\s+/g, '').length);
    const sum = weight.reduce((x, y) => x + y, 0);
    let from = B[id].start;
    lines.forEach((l, j) => {
      const to = from + (B[id].dur * weight[j]) / sum;
      subs.push([from, j === lines.length - 1 ? B[id].end + 0.15 : to, l]);
      from = to;
    });
  }
  // The band: the text is read on a dark strip, not over the game's own words and buttons.
  const band = `drawbox=x=0:y=ih-190:w=iw:h=190:color=black@0.74:t=fill:enable='between(t,${(B.b1.start - 0.1).toFixed(2)},${(B.b8.end + 0.4).toFixed(2)})'`;
  const sub =
    band +
    ',' +
    subs
      .map(([a2, b2, s2]) => dt(s2, `fontsize=46:fontcolor=white:x=(w-text_w)/2:y=h-190+(190-text_h)/2:line_spacing=8:enable='between(t,${a2.toFixed(2)},${b2.toFixed(2)})'`))
      .join(',');
  filters.push(`[${cur}]${sub}[vout]`);

  // The voice: every block at its time; the music of the game under it, theme by theme.
  const voiceIn = order.map((id) => {
    const i = inputs.length;
    inputs.push(['-i', `${narrDir}/${id}.wav`]);
    return [i, id];
  });
  voiceIn.forEach(([i, id], j) => {
    const ms = Math.round(B[id].start * 1000);
    filters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[vo${j}]`);
  });
  filters.push(`${voiceIn.map((_, j) => `[vo${j}]`).join('')}amix=inputs=${voiceIn.length}:normalize=0:dropout_transition=0,volume=1.0[voice]`);
  const bossAt = SHOTS.find((s) => s.id === 'boss').a;
  const X = 1.5;
  const tracks = [
    ['m-hub-calm', 0, cut.b3],
    ['m-rust-battle', cut.b3, bossAt],
    ['m-rust-boss', bossAt, cut.b6],
    ['m-core-battle', cut.b6, cut.b7],
    ['m-green-calm', cut.b7, total],
  ];
  const music = [];
  tracks.forEach(([name, from, to], j) => {
    const first = j === 0;
    const last = j === tracks.length - 1;
    const begin = first ? 0 : from - X / 2;
    const end = last ? total : to + X / 2;
    const dur = end - begin;
    const i = inputs.length;
    inputs.push(['-i', `${name}.wav`]);
    let f = `[${i}:a]aloop=loop=-1:size=2000000000,atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo`;
    if (first) f += ',afade=t=in:st=0:d=1.2';
    if (last) f += `,afade=t=out:st=${(dur - 3.0).toFixed(3)}:d=3.0`;
    filters.push(`${f}[a${j}]`);
    music.push(`[a${j}]`);
  });
  let acur = music[0];
  for (let j = 1; j < music.length; j++) {
    filters.push(`${acur}${music[j]}acrossfade=d=${X}:c1=tri:c2=tri[ac${j}]`);
    acur = `[ac${j}]`;
  }
  const sfx = [];
  const ms = (x) => Math.max(0, Math.round(x * 1000));
  const addSfx = (chain, when) => {
    const n = sfx.length;
    filters.push(`${chain},aformat=channel_layouts=stereo,adelay=${ms(when)}|${ms(when)}[sx${n}]`);
    sfx.push(`[sx${n}]`);
  };
  for (const id of ['b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'])
    addSfx('anoisesrc=d=0.7:c=pink:r=48000:a=0.9,highpass=f=500,lowpass=f=7500,afade=t=in:st=0:d=0.35,afade=t=out:st=0.35:d=0.35,volume=0.32', cut[id] - 0.35);
  // The hit on "А потім світ закінчився!" and on the end card.
  const hit = 'sine=f=52:d=1.1:r=48000,afade=t=out:st=0.02:d=1.05,volume=1.5';
  addSfx(hit, B.b2.start - 0.02);
  addSfx(hit, B.b8.start + 0.4);
  for (const f of [0.02, 0.2, 0.47, 0.62])
    addSfx('sine=f=1320:d=0.1:r=48000,afade=t=out:st=0:d=0.1,volume=0.3', B.b7.start + f * B.b7.dur);
  filters.push(`${sfx.join('')}amix=inputs=${sfx.length}:normalize=0:dropout_transition=0[sfx]`);
  // The music sits under the voice and gives way to it.
  filters.push(`${acur}volume=0.62[bed]`);
  filters.push('[voice]asplit=2[vk][vm]');
  filters.push('[bed][vk]sidechaincompress=threshold=0.035:ratio=6:attack=25:release=400:makeup=1[bedd]');
  filters.push('[bedd][vm][sfx]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000[aout]');
  fs.writeFileSync(path.join(OUT, 'edit.filter'), filters.join(';\n'));
  const args = ['-y', '-v', 'error', '-stats'];
  for (const a of inputs) args.push(...a);
  const enc = ['-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', total.toFixed(3)];
  args.push('-filter_complex_script', 'edit.filter', '-map', '[vout]', '-map', '[aout]', ...enc, 'osbb-trailer-voiced.mp4');
  log('total', total.toFixed(1), 's; shots start at', SHOTS.map((s) => `${s.id}@${s.start.toFixed(1)}`).join(' '));
  execFileSync('ffmpeg', args, { cwd: OUT, stdio: 'inherit' });
  log('written', path.join(OUT, 'osbb-trailer-voiced.mp4'));
}

// The mp3 files of the Eleven engine (b1.mp3 ... b7.mp3 in a folder) made ready for the edit:
// the silence at the ends cut off, the level evened, and the length of each block measured.
function voice(dir) {
  const { execFileSync } = require('node:child_process');
  const dest = path.join(OUT, 'narration-eleven');
  fs.mkdirSync(dest, { recursive: true });
  const post =
    'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,' +
    'areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.2,areverse,' +
    `highpass=f=70,atempo=${process.env.TEMPO || '1.12'},loudnorm=I=-19:TP=-1.5:LRA=7`;
  const timing = {};
  for (const f of fs.readdirSync(dir).filter((x) => /^b\d+\.mp3$/.test(x))) {
    const id = f.replace('.mp3', '');
    const wav = path.join(dest, id + '.wav');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(dir, f), '-af', post, '-ar', '48000', '-ac', '1', wav]);
    const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]);
    timing[id] = { seconds: Math.round(parseFloat(d.toString()) * 1000) / 1000, engine: 'eleven' };
    log(id, timing[id].seconds, 's');
  }
  fs.writeFileSync(path.join(dest, 'timing.json'), JSON.stringify(timing, null, 1));
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  fs.mkdirSync(RAW, { recursive: true });
  if (cmd === 'capture') {
    const names = rest.length ? rest : Object.keys(TAKES);
    for (const n of names) {
      try {
        log('--', n);
        await TAKES[n]();
      } catch (e) {
        log('FAIL', n, String(e.message).slice(0, 200));
      } finally {
        closeAll();
        await sleep(800);
      }
    }
  } else if (cmd === 'music') {
    const p = await launch(port++, 1280, 800);
    await p.go(URL, 4000);
    for (const [theme, layer, sec, name] of [
      ['hub', 'calm', 26, 'm-hub-calm'],
      ['rust', 'battle', 30, 'm-rust-battle'],
      ['rust', 'boss', 22, 'm-rust-boss'],
      ['core', 'battle', 24, 'm-core-battle'],
      ['green', 'calm', 20, 'm-green-calm'],
    ]) {
      const b64 = await p.eval(
        `(async()=>{ const blob = await window.__osbbAudioPreview(${JSON.stringify(theme)}, ${JSON.stringify(layer)}, ${sec}); const buf = new Uint8Array(await blob.arrayBuffer()); let s=''; const CH=0x8000; for(let i=0;i<buf.length;i+=CH) s+=String.fromCharCode.apply(null, buf.subarray(i,i+CH)); return btoa(s); })()`,
      );
      fs.writeFileSync(path.join(OUT, name + '.wav'), Buffer.from(b64, 'base64'));
      log(name);
    }
    closeAll();
  } else if (cmd === 'voice') {
    voice(path.resolve(rest[0]));
  } else if (cmd === 'edit') {
    edit();
  } else {
    log('usage: trailer.cjs capture [takes] | music | voice DIR | edit');
  }
  process.exit(0);
})();
