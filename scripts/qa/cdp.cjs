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
      deviceScaleFactor: 1,
      mobile: this.width < 700,
    });
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
  // The whole page, not only what is on the screen (a taller window for a moment).
  async fullShot(file) {
    const h = await this.eval(
      'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)',
    );
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: Math.min(h, 4000),
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 500));
    await this.shot(file);
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: this.height,
      deviceScaleFactor: 1,
      mobile: this.width < 700,
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

const closeAll = () => {
  for (const p of procs) p.kill();
};
module.exports = { launch, sleep, closeAll, Page };
