const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load() {
  delete require.cache[require.resolve('../.test-build/assets.js')];
  return require('../.test-build/assets.js');
}

test('Without a build base the game is served from the root', () => {
  delete globalThis.__BASE__;
  const { asset } = load();
  assert.equal(asset('art/ending-a.webp'), '/art/ending-a.webp');
  assert.equal(asset('/voice/x.ogg'), '/voice/x.ogg', 'a leading slash is tolerated');
});

test('A sub-path base (GitHub Pages) is put in front of every asset', () => {
  globalThis.__BASE__ = '/osbb-end-of-world/';
  try {
    const { asset } = load();
    assert.equal(asset('art/ending-a.webp'), '/osbb-end-of-world/art/ending-a.webp');
    assert.equal(asset('/sw.js'), '/osbb-end-of-world/sw.js');
  } finally {
    delete globalThis.__BASE__;
  }
});

test('Code never hard-codes an absolute /art or /voice path', () => {
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('voice-manifest.ts')) {
        const text = fs.readFileSync(p, 'utf8');
        if (/['"`]\/(art|voice|downloads)\//.test(text)) bad.push(p);
      }
    }
  };
  for (const dir of ['app', 'lib', 'components', 'hooks']) if (fs.existsSync(dir)) walk(dir);
  assert.deepEqual(bad, [], 'use asset("art/…") so the game also works under a sub-path');
});

test('The web manifest uses relative URLs so it works under a sub-path', () => {
  const m = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));
  const urls = [m.start_url, m.scope, ...m.icons.map((i) => i.src), ...m.shortcuts.map((s) => s.url)];
  for (const u of urls) assert.ok(!u.startsWith('/'), `${u} must be relative`);
});

test('Every campaign boss has a portrait that fits the budget', () => {
  const { BOSS_VARIANTS } = require('../.test-build/encounters.js');
  assert.equal(BOSS_VARIANTS.length, 9);
  for (const boss of BOSS_VARIANTS) {
    const file = `public/art/boss-${boss.id}.webp`;
    assert.ok(fs.existsSync(file), file);
    assert.ok(fs.statSync(file).size <= 60 * 1024, `${file} is over 60 KB`);
    assert.ok(fs.existsSync(`docs/art-source/boss-${boss.id}.png`), 'source kept');
  }
});

test('Mini-boss portraits: every registered one exists, small, with its source; no file is left unregistered', () => {
  const { MINIBOSS_PORTRAITS, hasMinibossPortrait } = require('../.test-build/minibosses.js');
  assert.ok(MINIBOSS_PORTRAITS.size >= 3);
  for (const id of MINIBOSS_PORTRAITS) {
    assert.match(id, /^[0-2]-[0-2]$/);
    const file = `public/art/mini-${id}.webp`;
    assert.ok(fs.existsSync(file), file);
    assert.ok(fs.statSync(file).size <= 60 * 1024, `${file} is over 60 KB`);
    assert.ok(fs.existsSync(`docs/art-source/mini-${id}.png`), 'source kept');
    const [chapter, variant] = id.split('-').map(Number);
    assert.ok(hasMinibossPortrait(chapter, variant));
  }
  const onDisk = fs.readdirSync('public/art').filter((n) => /^mini-\d-\d\.webp$/.test(n)).map((n) => n.slice(5, 8));
  assert.deepEqual(onDisk.sort(), [...MINIBOSS_PORTRAITS].sort());
  assert.equal(hasMinibossPortrait(2, 2), false, 'without a file the card stays plain');
  assert.equal(hasMinibossPortrait(9, 9), false, 'out of range is clamped, and that one has no file either');
});
