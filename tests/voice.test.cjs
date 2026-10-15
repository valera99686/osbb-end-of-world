const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const M = require('../.test-build/model.js');
const S = require('../.test-build/story.js');
const V = require('../.test-build/voice.js');
const { VOICE_IDS } = require('../.test-build/voice-manifest.js');
const { speech } = require('../scripts/voice/speech.cjs');
const voices = require('../scripts/voice/voices.json');

test('A voice id is a stable hash of the speaker and the words', () => {
  assert.equal(V.voiceId('mechanic', 'Привіт'), V.voiceId('mechanic', 'Привіт'));
  assert.notEqual(V.voiceId('mechanic', 'Привіт'), V.voiceId('spark', 'Привіт'));
  assert.notEqual(V.voiceId('mechanic', 'Привіт'), V.voiceId('mechanic', 'Привіт!'));
  assert.match(V.voiceId('nina', 'Спершу чай.'), /^[0-9a-z]{8,12}$/);
});

test('Speakers map to voices; the chosen head speaks as themselves', () => {
  assert.equal(V.voiceKeyFor('galyna', 'spark'), 'galyna');
  assert.equal(V.voiceKeyFor('captain', 'spark'), 'spark');
  assert.equal(V.voiceKeyFor('captain', 'flora'), 'flora');
  assert.equal(V.voiceKeyFor('narrator', 'spark'), 'narrator', 'the narrator has a voice of their own');
  assert.equal(V.voiceKeyFor('boss', 'spark'), null);
  assert.equal(V.voiceKeyFor('captain', 'nobody'), null);
  for (const key of V.VOICE_KEYS) assert.ok(voices[key], `${key} has a voice in voices.json`);
  for (const key of Object.keys(voices)) assert.ok(V.VOICE_KEYS.includes(key), key);
});

test('Every voiced line has a speaker, no changing words, and a clean spoken form', () => {
  const lines = S.voiceLines();
  assert.ok(lines.length >= 150, `only ${lines.length} lines`);
  assert.equal(new Set(lines.map((l) => l.id)).size, lines.length);
  for (const l of lines) {
    assert.ok(V.VOICE_KEYS.includes(l.key), l.text);
    assert.ok(!/\{[a-z]+\}/.test(l.text), l.text);
    assert.equal(l.id, V.voiceId(l.key, l.text));
    const spoken = speech(l.text);
    assert.ok(!/[\d№()]|[A-Z]{2,}|[А-ЯІЇЄҐ]{4,}/.test(spoken), `unspoken symbols: ${spoken}`);
  }
  // The head's lines exist once per head.
  const captainText = 'Усі тут! Усі на борту! Ноги, ноги, ноги!';
  for (const head of V.HEAD_VOICES)
    assert.ok(lines.some((l) => l.key === head && l.text === captainText), head);
});

test('The numbers and shouting in the lines are said in words', () => {
  assert.equal(speech('Будинок № 17'), 'Будинок номер сімнадцять');
  assert.equal(speech('о 04:17'), 'о четвертій сімнадцять');
  assert.equal(speech('з 04:17'), 'з четвертої сімнадцять');
  assert.equal(speech('Мешканця кв. 0 видалено'), 'Мешканця квартири нуль видалено');
  assert.equal(speech('ДМ-17 і ОСББ'), 'Де-Ем сімнадцять і О-Ес-Бе-Бе');
  assert.equal(speech('УВАГА. ЕВАКУАЦІЯ.'), 'Увага. Евакуація.');
  assert.equal(speech('Там… (тиша) …помилка'), 'Там… …помилка');
});

test('The manifest and the files in public/voice are the same set, covering every line', () => {
  const files = fs.readdirSync('public/voice').filter((f) => f.endsWith('.ogg')).map((f) => f.slice(0, -4));
  assert.deepEqual([...VOICE_IDS].sort(), files.sort(), 'manifest = files');
  for (const l of S.voiceLines()) assert.ok(VOICE_IDS.has(l.id), `no recording: ${l.text}`);
  for (const f of files) assert.ok(fs.statSync(`public/voice/${f}.ogg`).size > 500, f);
  const total = files.reduce((n, f) => n + fs.statSync(`public/voice/${f}.ogg`).size, 0);
  assert.ok(total < 6 * 1024 * 1024, `voice-over is ${total} bytes: the APK has little room`);
});

test('The voice volume is a setting: defaulted, clamped and kept in a save', () => {
  assert.equal(M.DEFAULT_SETTINGS.voice, 0.9);
  assert.equal(M.sanitizeSettings({ voice: 5 }).voice, 1);
  assert.equal(M.sanitizeSettings({ voice: -1 }).voice, 0);
  assert.equal(M.sanitizeSettings({}).voice, 0.9, 'old saves get the default');
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 3);
  meta.settings = { ...meta.settings, voice: 0.25 };
  assert.equal(M.readSave(M.saveData(meta, run)).meta.settings.voice, 0.25);
});

test('Lines with an attempt or protocol number are recorded for the first numbers', () => {
  const texts = new Set(S.voiceLines().map((l) => l.text));
  for (let n = 1; n <= S.VOICED_NUMBERS; n++)
    assert.ok(texts.has(`Шкідника виявлено. Спроба ${n}. Обробку розпочато.`), `attempt ${n}`);
  assert.ok(!texts.has(`Шкідника виявлено. Спроба ${S.VOICED_NUMBERS + 1}. Обробку розпочато.`));
  const meta = (runs) => ({ ...M.initialMeta(), runs });
  // What the player hears on a boss card is the filled taunt: early ones are recorded.
  for (let runs = 0; runs < S.VOICED_NUMBERS; runs++)
    for (const chapter of [0, 1, 2]) {
      const quote = S.bossQuote({ chapter }, meta(runs));
      assert.ok(VOICE_IDS.has(V.voiceId(S.BOSS_VOICE, quote)), quote);
    }
  const late = S.bossQuote({ chapter: 1 }, meta(S.VOICED_NUMBERS));
  assert.ok(!VOICE_IDS.has(V.voiceId(S.BOSS_VOICE, late)), 'later attempts stay text');
  // The same holds for the numbered Shelter protocols.
  const seen = S.HUB_SCENES.map((x) => x.id);
  for (const endings of [[], ['a'], ['b', 'c']])
    for (let runs = 1; runs <= S.VOICED_NUMBERS; runs++)
      for (const won of [false, true]) {
        const m = { ...meta(runs), endings, scenesSeen: seen, kills: runs };
        for (const line of S.hubScene(m, won).lines) {
          const key = V.voiceKeyFor(line.who, 'mechanic');
          const text = S.fillLine(line.text, m, 'mechanic');
          if (key) assert.ok(VOICE_IDS.has(V.voiceId(key, text)), text);
        }
      }
});
