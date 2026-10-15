import { readdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
// Same folder and base path as vite.game.config.ts (OSBB_OUT, OSBB_BASE).
const out = process.env.OSBB_OUT ?? 'build';
const base = `/${(process.env.OSBB_BASE ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
async function walk(dir) {
  const res = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'downloads') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) res.push(...(await walk(p)));
    else if (!['sw.js', '_headers'].includes(e.name)) res.push(p);
  }
  return res;
}
const files = await walk(out);
const hash = createHash('sha256');
for (const f of files) hash.update(await readFile(f));
const version = 'osbb-' + hash.digest('hex').slice(0, 12);
const urls = files.map((f) => base + f.replaceAll('\\', '/').slice(out.length + 1));
await writeFile(
  join(out, 'sw.js'),
  `const CACHE=${JSON.stringify(version)};const BASE=${JSON.stringify(base)};const ASSETS=${JSON.stringify(urls)};self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});self.addEventListener('message',event=>{if(event.data==='skipWaiting')self.skipWaiting();});self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('osbb-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin||new URL(event.request.url).pathname.startsWith(BASE+'downloads/'))return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match(BASE+'index.html')));return;}event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});`,
);
console.log(`Offline cache: ${urls.length} assets (${version}, base ${base})`);
