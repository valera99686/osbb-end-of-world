const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const N = require('../.test-build/notices.js');
const X = require('../.test-build/secrets.js');
const S = require('../.test-build/story.js');
const A = require('../.test-build/achievements.js');
const B = require('../.test-build/barks.js');

const unique = (list) => new Set(list).size === list.length;

test('The notice board has many different notices with real signatures', () => {
  assert.ok(N.NOTICES.length >= 36);
  assert.ok(unique(N.NOTICES.map((n) => n.text)), 'no notice twice');
  for (const n of N.NOTICES) {
    assert.ok(n.text.length > 20 && n.text.length <= 200, n.text);
    assert.ok(n.sign.trim().length > 2, n.text);
  }
  // A resident who has a flat in the story signs with that flat, not another.
  for (const speaker of Object.values(S.SPEAKERS)) {
    const flat = /^кв\. \d+$/.test(speaker.role) ? speaker.role : null;
    if (!flat) continue;
    for (const n of N.NOTICES)
      if (n.sign.startsWith(speaker.name.split(' ')[0]) && /кв\./.test(n.sign))
        assert.ok(n.sign.endsWith(flat), `${n.sign} vs ${flat}`);
  }
});

test('The notice of the day is stable, steps by hand and covers the whole board', () => {
  const day = '2026-10-23';
  assert.equal(N.noticeIndex(day), N.noticeIndex(day));
  const seen = new Set();
  for (let shift = 0; shift < N.NOTICES.length; shift++) {
    const i = N.noticeIndex(day, shift);
    assert.ok(i >= 0 && i < N.NOTICES.length);
    seen.add(i);
  }
  assert.equal(seen.size, N.NOTICES.length, 'stepping reaches every notice');
  assert.equal(N.noticeIndex(day, N.NOTICES.length), N.noticeIndex(day));
  assert.equal(N.noticeIndex(day, -5), N.noticeIndex(day));
  const days = new Set();
  for (let d = 1; d <= 28; d++)
    days.add(N.noticeIndex(`2026-11-${String(d).padStart(2, '0')}`));
  assert.ok(days.size >= 12, `only ${days.size} different notices in 28 days`);
});

test('Result quips and tab titles exist for both outcomes and any seed', () => {
  assert.ok(N.DEFEAT_QUIPS.length >= 10 && unique(N.DEFEAT_QUIPS));
  assert.ok(N.WIN_QUIPS.length >= 8 && unique(N.WIN_QUIPS));
  assert.ok(N.TAB_TITLES.length >= 5 && unique(N.TAB_TITLES));
  for (const seed of [0, 1, 17, -9, 1e12, NaN, Infinity, 3.7]) {
    assert.ok(N.DEFEAT_QUIPS.includes(N.resultQuip(false, seed)), String(seed));
    assert.ok(N.WIN_QUIPS.includes(N.resultQuip(true, seed)), String(seed));
    assert.ok(N.TAB_TITLES.includes(N.tabTitle(seed)), String(seed));
  }
  assert.equal(N.resultQuip(true, 5), N.resultQuip(true, 5));
  const lines = [...N.DEFEAT_QUIPS, ...N.WIN_QUIPS, ...N.TAB_TITLES];
  for (const l of lines) assert.ok(l.length <= 120, l);
});

test('The old cheat code is found by the right keys only', () => {
  let at = 0,
    done = false;
  for (const key of X.KONAMI) ({ at, done } = X.konamiStep(at, key));
  assert.ok(done && at === 0);
  // Upper case letters count too (Shift or Caps Lock).
  at = 0;
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A'])
    ({ at, done } = X.konamiStep(at, key));
  assert.ok(done);
  // A wrong key starts over; an Up key in the middle counts as the first key.
  assert.deepEqual(X.konamiStep(3, 'x'), { at: 0, done: false });
  assert.deepEqual(X.konamiStep(3, 'ArrowUp'), { at: 1, done: false });
  assert.deepEqual(X.konamiStep(1, 'ArrowUp'), { at: 2, done: false });
  // Ordinary play (arrows, letters) never completes it by accident.
  at = 0;
  done = false;
  for (let i = 0; i < 400; i++) {
    const key = ['ArrowLeft', 'ArrowRight', 'a', 'b', ' ', 'e'][(i * 7 + (i >> 2)) % 6];
    ({ at, done } = X.konamiStep(at, key));
    assert.ok(!done);
  }
});

test('Seven quick taps on the title are the same secret, slow taps are not', () => {
  let taps = [],
    done = false;
  for (let i = 0; i < X.TAP_COUNT; i++) ({ taps, done } = X.tapStep(taps, 1000 + i * 200));
  assert.ok(done && taps.length === 0);
  taps = [];
  for (let i = 0; i < 30; i++) {
    ({ taps, done } = X.tapStep(taps, i * (X.TAP_WINDOW_MS / 3)));
    assert.ok(!done, `tap ${i}`);
  }
  assert.ok(taps.length < X.TAP_COUNT);
});

test('A raid by night is a secret: 22:00 to 04:59 by the local clock', () => {
  const at = (h, m = 0) => new Date(2026, 9, 23, h, m);
  for (const h of [22, 23, 0, 1, 4]) assert.ok(X.isQuietHour(at(h, 59)), String(h));
  for (const h of [5, 9, 12, 18, 21]) assert.ok(!X.isQuietHour(at(h)), String(h));
});

test('Secrets are kept once, saved, cleaned and unlock their achievements', () => {
  const meta = M.initialMeta();
  assert.deepEqual(meta.secrets, []);
  const found = X.discover(meta, 'konami');
  assert.deepEqual(found.secrets, ['konami']);
  assert.equal(X.discover(found, 'konami'), found, 'finding it again changes nothing');
  assert.deepEqual(X.discover(found, 'night').secrets, ['konami', 'night']);
  // The achievements follow the secrets.
  assert.deepEqual(A.newAchievements(meta, null), []);
  assert.deepEqual(A.newAchievements(found, null), ['konami']);
  assert.deepEqual(A.newAchievements(X.discover(meta, 'night'), null), ['night_raid']);
  for (const id of ['konami', 'night_raid']) {
    const a = A.ACHIEVEMENT_BY_ID[id];
    assert.ok(a.secret, id);
    assert.ok(a.hint && a.hint !== a.text, `${id} has a hint that differs from its text`);
  }
  assert.ok(A.ACHIEVEMENTS.filter((a) => !a.secret).length >= 43);
  // A save keeps real secrets once and drops what is not one.
  const dirty = { ...found, secrets: ['night', 'konami', 'night', 'bogus', 7, null] };
  assert.deepEqual(M.readSave(M.saveData(dirty, null)).meta.secrets.sort(), ['konami', 'night']);
  // Finishing a raid keeps them.
  const run = M.makeRun(found, 'mechanic', 0, 3);
  assert.deepEqual(M.finishRun(found, run, false).meta.secrets, ['konami']);
});

test('The new radio barks and perk offers are all speakable and not repeated', () => {
  for (const kind of ['start', 'wave', 'final', 'chief', 'broken', 'event', 'phase', 'stagger']) {
    const heard = [];
    for (let seed = 0; seed < 400; seed++) {
      const bark = S.combatBark(kind, Object.keys(S.SPEAKERS), seed);
      assert.ok(bark, kind);
      heard.push(`${bark.who}|${bark.text}`);
      assert.ok(bark.text.length <= 140, bark.text);
      assert.ok(S.SPEAKERS[bark.who], bark.who);
    }
    assert.ok(unique([...new Set(heard)]), kind);
    assert.ok(new Set(heard).size >= 5, `${kind} has only ${new Set(heard).size} different barks`);
  }
  for (const [owner, lines] of Object.entries(B.OFFER_LINES)) {
    assert.ok(lines.length >= 6, `${owner}: ${lines.length} offers`);
    assert.ok(unique(lines), owner);
    for (const l of lines) assert.ok(l.length <= 120, l);
  }
});
