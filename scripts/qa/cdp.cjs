// A small driver for a real Chrome over the DevTools protocol: the screenshots
// of the guide and the presentation (scripts/qa/screens.cjs) and other checks
// use it. It needs Chrome at the usual path (or CHROME) and Node 22 (the built-in
// WebSocket).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME =
  process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];

async function launch(port, width = 1280, height = 800, extra = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osbb-cdp-'));
  const p = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      `--window-size=${width},${height}`,
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--no-first-run',
      ...extra,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  procs.push(p);
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((x) => x.type === 'page');
      if (page) return new Page(page.webSocketDebuggerUrl, width, height);
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome did not start on ' + port);
}

class Page {
  constructor(url, width, height) {
    this.width = width;
    this.height = height;
    this.dpr = 1;
    this.mobile = null; // true: a phone (touch, mobile layout) whatever the width
    this.rec = null;
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
      } else if (m.method === 'Page.screencastFrame' && this.rec) {
        const r = this.rec;
        const file = path.join(r.dir, `f${String(r.frames.length).padStart(6, '0')}.jpg`);
        fs.writeFileSync(file, Buffer.from(m.params.data, 'base64'));
        r.frames.push({ file, t: m.params.metadata.timestamp });
        this.send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
      } else if (m.method === 'Runtime.exceptionThrown')
        this.errors.push(m.params.exceptionDetails.exception?.description ?? 'exception');
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
      throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result?.result?.value;
  }
  async go(url, wait = 3500) {
    await this.ready;
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: this.height,
      deviceScaleFactor: this.dpr,
      mobile: this.mobile ?? this.width < 700,
    });
    // A phone: touch events and a phone's user agent, so the page sees a touch screen.
    if (this.mobile) {
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await this.send('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      });
    }
    await this.send('Page.navigate', { url });
    await sleep(wait);
  }
  // A button (or another element) by the text in it.
  click(text, sel = 'button') {
    return this.eval(
      `(()=>{const re=new RegExp(${JSON.stringify(text)}); const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>re.test(b.innerText)&&!b.disabled); if(!b) return false; b.click(); return true})()`,
    );
  }
  // Wait until the expression is true.
  async until(what, expr, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        const v = await this.eval(expr);
        if (v) return v;
      } catch {
        /* the page is still loading */
      }
      await sleep(300);
    }
    throw new Error('Timed out waiting for ' + what);
  }
  async key(code, down = true) {
    await this.eval(
      `window.dispatchEvent(new KeyboardEvent(${JSON.stringify(down ? 'keydown' : 'keyup')},{code:${JSON.stringify(code)},key:${JSON.stringify(code.replace(/^Key/, '').toLowerCase())},bubbles:true,cancelable:true}))`,
    );
  }
  text(sel = 'body') {
    return this.eval(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`);
  }
  buttons(sel = 'button') {
    return this.eval(
      `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(b=>b.offsetParent).map(b=>(b.className.split(' ')[0]||'')+' | '+b.innerText.replace(/\\s+/g,' ').slice(0,50))`,
    );
  }
  // A film of the page: the frames the browser paints, with their times. stopRecording
  // gives the list; film() turns it into a 30 fps video of the given length.
  async startRecording(dir, quality = 90) {
    fs.mkdirSync(dir, { recursive: true });
    this.rec = { dir, frames: [] };
    await this.send('Page.startScreencast', {
      format: 'jpeg',
      quality,
      maxWidth: Math.round(this.width * this.dpr),
      maxHeight: Math.round(this.height * this.dpr),
      everyNthFrame: 1,
    });
  }
  async stopRecording() {
    const endT = Date.now() / 1000;
    await this.send('Page.stopScreencast');
    await new Promise((r) => setTimeout(r, 300));
    const frames = this.rec.frames;
    frames.endT = endT; // the last frame stays until here (a still page sends none)
    this.rec = null;
    return frames;
  }
  // The whole page, not only what is on the screen (a taller window for a moment).
  async fullShot(file) {
    const h = await this.eval(
      'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)',
    );
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: Math.min(h, 4000),
      deviceScaleFactor: this.dpr,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 500));
    await this.shot(file);
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: this.height,
      deviceScaleFactor: this.dpr,
      mobile: this.mobile ?? this.width < 700,
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  // A screenshot into a file (JPEG, or PNG by the extension).
  async shot(file, clip) {
    const png = /\.png$/i.test(file);
    const r = await this.send('Page.captureScreenshot', {
      format: png ? 'png' : 'jpeg',
      quality: 82,
      ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  }
}

// Frames with times to a constant 30 fps video (each frame stays until the next
// one comes), via ffmpeg's concat list.
function film(frames, out, { ffmpeg = 'ffmpeg', fps = 30, size = '1920:1080' } = {}) {
  const { execFileSync } = require('node:child_process');
  const list = out.replace(/\.[a-z0-9]+$/i, '') + '.txt';
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : Math.min(15, Math.max(1 / fps, (frames.endT ?? 0) - frames[i].t));
    lines.push(`file '${frames[i].file.replaceAll('\\', '/')}'`, `duration ${Math.max(0.001, dur).toFixed(4)}`);
  }
  lines.push(`file '${frames[frames.length - 1].file.replaceAll('\\', '/')}'`);
  fs.writeFileSync(list, lines.join('\n'));
  execFileSync(
    ffmpeg,
    ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${fps},scale=${size}:flags=lanczos`, '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out],
    { stdio: 'inherit' },
  );
  return out;
}

const closeAll = () => {
  for (const p of procs) p.kill();
};
module.exports = { launch, sleep, closeAll, film, Page };
