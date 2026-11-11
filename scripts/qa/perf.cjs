// How smooth a fight is on a weak phone: a Chrome that plays a touch phone
// (390 x 844 css pixels, two device pixels per css pixel) with its processor
// slowed down N times (Emulation.setCPUThrottlingRate, roughly what a cheap
// Android is next to a laptop), playing a fight while the page counts how long
// each animation frame took.
//   npm run build && npx vite preview --config vite.game.config.ts --port 4173
//   OSBB_URL=http://127.0.0.1:4173/ node scripts/qa/perf.cjs [rate ...]
// A production build (the dev build is several times slower in React's own
// checks). With `PROFILE=file.cpuprofile` the throttled run is profiled too
// (open the file in Chrome DevTools, Performance).
const fs = require('node:fs');
const { launch, sleep, closeAll } = require('./cdp.cjs');
const { veteran } = require('./profile.cjs');

const URL = process.env.OSBB_URL || 'http://127.0.0.1:4173/';
const RATES = process.argv.slice(2).map(Number).filter((n) => n >= 1);
const SECONDS = Number(process.env.SECONDS) || 14;
const DUO = !!process.env.DUO;
const log = (...a) => console.log(...a);

// Frame intervals of the page, from requestAnimationFrame.
const COUNTER = `(()=>{ if (window.__frames) return 0; window.__frames=[]; let last=0;
  const tick=(t)=>{ if(last) window.__frames.push(t-last); last=t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return 0 })()`;

function stats(list) {
  const a = list.filter((x) => x > 0 && x < 1000).sort((x, y) => x - y);
  if (!a.length) return null;
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  const pick = (q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
  return {
    frames: a.length,
    fps: Math.round(1000 / mean),
    mean: +mean.toFixed(1),
    p50: +pick(0.5).toFixed(1),
    p95: +pick(0.95).toFixed(1),
    over33: Math.round((100 * a.filter((x) => x > 33.4).length) / a.length),
    over50: Math.round((100 * a.filter((x) => x > 50).length) / a.length),
  };
}

async function fight(port, rate) {
  const p = await launch(port, 390, 844);
  p.mobile = true;
  p.dpr = 2;
  await p.go(URL, 1500);
  const prof = veteran({ scenesSeen: ['prologue', 'origins', 'arrival-0', 'goal'] });
  await p.eval(`localStorage.setItem(${JSON.stringify(prof.key)}, ${JSON.stringify(prof.value)}); 0`);
  await p.go(URL, 3500);
  await p.eval(`(()=>{const s=document.createElement('style'); s.textContent='.toast-stack,.achievement-toast{display:none!important}'; document.head.appendChild(s); 0})()`);
  if (DUO) await p.click('Вдвох тут', 'button.play-mode');
  await p.eval(`document.querySelector('.start-button').click()`);
  await sleep(1500);
  for (let i = 0; i < 8; i++) {
    await p.click('Пропустити', '.dlg button, .cinema button');
    await sleep(300);
  }
  await p.until('the map', `!!document.querySelector('button.tree-go')`, 20000);
  await p.eval(`document.querySelector('button.tree-go').click()`);
  await p.until('the fight', `!!document.querySelector('canvas.battle-canvas')`, 30000);
  // Warm up (sprites decode, the first wave comes), then slow the processor
  // down and count.
  await sleep(4000);
  // CSS=...: extra rules for the fight (to see what a part of the screen costs).
  if (process.env.CSS)
    await p.eval(`(()=>{const s=document.createElement('style'); s.textContent=${JSON.stringify(process.env.CSS)}; document.head.appendChild(s); 0})()`);
  await p.send('Emulation.setCPUThrottlingRate', { rate });
  await p.eval(COUNTER);
  // Where the main thread's time goes: styles, layout, script, all tasks.
  await p.send('Performance.enable');
  const metrics = async () =>
    Object.fromEntries((await p.send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
  const before = await metrics();
  // TRACE=file.json: a Chrome trace of 3 seconds of the throttled fight.
  if (process.env.TRACE && rate > 1) {
    const events = [];
    p.onTrace = (m) => {
      if (m.method === 'Tracing.dataCollected') events.push(...m.params.value);
    };
    const done = new Promise((res) => (p.onTraceDone = res));
    const ws = p.ws;
    const prev = ws.onmessage;
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Tracing.dataCollected') events.push(...m.params.value);
      else if (m.method === 'Tracing.tracingComplete') p.onTraceDone();
      else prev(ev);
    };
    await p.send('Tracing.start', {
      categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,gpu,v8,toplevel',
      transferMode: 'ReportEvents',
    });
    await sleep(3000);
    await p.send('Tracing.end');
    await done;
    fs.writeFileSync(process.env.TRACE, JSON.stringify(events));
    log('trace written:', process.env.TRACE, events.length, 'events');
  }
  const profile = process.env.PROFILE && rate > 1;
  if (profile) {
    await p.send('Profiler.enable');
    await p.send('Profiler.setSamplingInterval', { interval: 500 });
    await p.send('Profiler.start');
  }
  // Two hands on the stick: walk about so the camera and the crowd move.
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  const end = Date.now() + SECONDS * 1000;
  let i = 0;
  while (Date.now() < end) {
    const k = keys[i++ % 4];
    await p.key(k, true);
    await sleep(900);
    await p.key(k, false);
    // A perk draft stops the fight: take the first card.
    await p.eval(`document.querySelector('.perk-card')?.click(); 0`);
  }
  if (profile) {
    const r = await p.send('Profiler.stop');
    fs.writeFileSync(process.env.PROFILE, JSON.stringify(r.result.profile));
    log('profile written:', process.env.PROFILE);
  }
  // OPS=1: how many calls of each canvas method a frame of the battle canvas
  // makes (two seconds counted, after the run).
  if (process.env.OPS) {
    await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const ops = await p.eval(`(async()=>{
      const P = CanvasRenderingContext2D.prototype, counts = {}, keep = {};
      const main = document.querySelector('canvas.battle-canvas').getContext('2d');
      for (const k of Object.getOwnPropertyNames(P)) {
        const d = Object.getOwnPropertyDescriptor(P, k);
        if (typeof d.value === 'function') {
          keep[k] = d.value;
          P[k] = function(...a){
            if (this === main) {
              counts[k] = (counts[k]||0)+1;
              // What drawImage draws from: a canvas is uploaded again every time.
              if (k === 'drawImage') { const s = a[0]; const key = 'src ' + (s.constructor && s.constructor.name) + ' ' + (s.width||0) + 'x' + (s.height||0); counts[key] = (counts[key]||0)+1; }
            }
            return keep[k].apply(this, a); };
        } else if (d.set && /shadowBlur|filter|globalCompositeOperation|font/.test(k)) {
          const set = d.set; keep['set ' + k] = d;
          Object.defineProperty(P, k, { ...d, set(v){ if (this === main) counts['=' + k] = (counts['=' + k]||0)+1; set.call(this, v); } });
        }
      }
      let frames = 0; const t0 = performance.now();
      await new Promise(r => { const f = () => { frames++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); });
      for (const k of Object.keys(keep)) if (!k.startsWith('set ')) P[k] = keep[k]; else Object.defineProperty(P, k.slice(4), keep[k]);
      return { frames, perFrame: Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k, Math.round(v/frames)])) };
    })()`);
    log(JSON.stringify(ops));
  }
  const after = await metrics();
  const d = (k) => after[k] - before[k];
  const main = {
    task: Math.round(d('TaskDuration') * 1000),
    script: Math.round(d('ScriptDuration') * 1000),
    style: Math.round(d('RecalcStyleDuration') * 1000),
    layout: Math.round(d('LayoutDuration') * 1000),
    styles: d('RecalcStyleCount'),
    layouts: d('LayoutCount'),
  };
  const frames = await p.eval('window.__frames');
  const scene = await p.eval(`({enemies: document.querySelector('.battle-hud') ? 1 : 0, canvas: (()=>{const c=document.querySelector('canvas.battle-canvas'); return c ? [c.width, c.height, Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)] : null})()})`);
  await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  closeAll();
  return { rate, ...stats(frames), canvas: scene.canvas, main, errors: p.errors.length };
}

(async () => {
  const rates = RATES.length ? RATES : [1, 4, 6];
  for (const [n, rate] of rates.entries()) {
    const r = await fight(9851 + n, rate);
    log(JSON.stringify(r));
  }
  process.exit(0);
})();
