const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const S = require('../.test-build/story.js');

const allScenes = () => [...Object.values(S.SCENES), ...S.HUB_SCENES];
const speakers = new Set([...Object.keys(S.SPEAKERS), 'captain']);

test('Every scene line has a real speaker, text, and fits a phone screen', () => {
  for (const scene of allScenes()) {
    assert.ok(scene.lines.length > 0, scene.id);
    for (const line of scene.lines) {
      assert.ok(speakers.has(line.who), `${scene.id}: ${line.who}`);
      assert.ok(line.text.trim().length > 3, scene.id);
      assert.ok(line.text.length <= 200, `${scene.id}: too long (${line.text.length})`);
      assert.ok(
        !/\{(?!attempt\}|runs\}|captain\})[a-z]+\}/.test(line.text),
        `${scene.id}: unknown placeholder`,
      );
    }
    for (const choice of scene.choices ?? []) {
      assert.ok(choice.text);
      if (choice.reply) assert.ok(speakers.has(choice.reply.who), scene.id);
    }
  }
  for (const speaker of Object.values(S.SPEAKERS))
    assert.ok(speaker.color.startsWith('#'));
});

test('Each clue is granted by some scene; each ending has its scene', () => {
  const granted = new Set(
    allScenes().flatMap((s) => s.clues ?? []),
  );
  assert.deepEqual(
    [...granted].sort(),
    S.CLUES.map((c) => c.id).sort(),
    'every clue can be found, and no scene grants an unknown one',
  );
  assert.equal(new Set(S.CLUES.map((c) => c.id)).size, S.CLUES.length);
  for (const e of S.ENDINGS) assert.ok(S.SCENES['ending-' + e.id], e.id);
  assert.ok(S.SCENES.finale.choices.some((c) => c.ending === 'a'));
  assert.ok(S.SCENES.finale.choices.every((c) => c.ending));
});

test('Scenes are found by id; unknown ids are not story', () => {
  const meta = M.initialMeta();
  assert.ok(S.isStoryId('prologue') && S.isStoryId('hub-bridge'));
  assert.ok(S.isStoryId('hub-protocol-12') && S.isStoryId('hub-victory-3'));
  assert.ok(!S.isStoryId('constructor') && !S.isStoryId('hub-nope') && !S.isStoryId(7));
  assert.equal(S.storyScene('hub-protocol-5', meta).lines.length > 0, true);
  assert.equal(S.storyScene('origins', meta), null);
  assert.ok(S.LIBRARY_IDS.includes('origins') && S.LIBRARY_IDS.includes('ending-c'));
});

test('The Shelter tells one new story beat per raid, in order, then protocols', () => {
  let meta = M.initialMeta();
  meta.deaths = 1;
  meta.runs = 1;
  assert.equal(S.hubScene(meta, false).id, 'hub-first-death');
  // A beat that was seen gives way to the next; unmet beats stay hidden.
  meta.scenesSeen = ['hub-first-death'];
  assert.match(S.hubScene(meta, false).id, /^hub-protocol-1$/);
  meta.runs = 3;
  assert.equal(S.hubScene(meta, false).id, 'hub-boris-ledger');
  // Play a whole career: every beat is offered exactly once.
  const offered = [];
  meta = { ...M.initialMeta(), deaths: 1, runs: 0, totalRescues: 0, totalBosses: 0 };
  for (let i = 0; i < 40; i++) {
    meta.runs++;
    meta.totalRescues += 1;
    meta.totalBosses = Math.floor(meta.runs / 4);
    if (meta.runs > 12) meta.endings = ['a'];
    const scene = S.hubScene(meta, false);
    if (!/^hub-protocol/.test(scene.id)) {
      offered.push(scene.id);
      meta.scenesSeen = [...meta.scenesSeen, scene.id];
      meta = S.addClues(meta, scene.clues);
    }
  }
  assert.equal(new Set(offered).size, offered.length, 'no beat repeats');
  assert.equal(offered.length, S.HUB_SCENES.length, 'all beats reached');
  const won = S.hubScene({ ...M.initialMeta(), runs: 20, scenesSeen: S.HUB_SCENES.map((s) => s.id) }, true);
  assert.match(won.id, /^hub-victory-/);
});

test('Endings: the first needs nothing, the others need the evidence', () => {
  let meta = M.initialMeta();
  assert.ok(!S.canEndingB(meta) && !S.canEndingC(meta));
  const clues = ['register', 'quorum_2064', 'danilo_slot', 'bridge', 'marta_deaths'];
  meta = S.addClues(meta, clues);
  assert.ok(!S.canEndingB(meta), 'five clues are not yet a case');
  meta = S.addClues(meta, ['tenth_cup']);
  assert.ok(S.canEndingB(meta), 'the five key clues plus one more open the meeting');
  assert.ok(!S.canEndingC(meta), 'the last ending needs a first ending and more');
  meta = S.addEnding(S.addClues(meta, ['captain_log', 'radio_voice', 'mint', 'tenth_cup', 'attempt_count']), 'a');
  assert.ok(S.canEndingC(meta));
  assert.deepEqual(S.addEnding(meta, 'a').endings, ['a']);
  assert.deepEqual(S.addClues(meta, ['nonsense']).clues, meta.clues);
  // The finale offers B and C only when they are ready.
  const open = (m) => S.SCENES.finale.choices.filter((c) => !c.requires || c.requires(m)).map((c) => c.ending);
  assert.deepEqual(open(M.initialMeta()), ['a']);
  assert.deepEqual(open(meta), ['a', 'b', 'c']);
});

test('Lines carry the attempt, the run count and the chosen captain', () => {
  const meta = { ...M.initialMeta(), runs: 11 };
  assert.equal(S.fillLine('Спроба {attempt}, протокол № {runs}', meta, 'spark'), 'Спроба 12, протокол № 11');
  assert.equal(S.fillLine('Привіт, {captain}', meta, 'flora'), 'Привіт, Флора');
  const first = S.bossQuote({ chapter: 0 }, M.initialMeta()),
    again = S.bossQuote({ chapter: 0 }, { ...meta, totalBosses: 2 });
  assert.ok(first && again && first !== again, 'machines remember earlier attempts');
  assert.match(again, /Спроба 12/);
});

test('Rescue greetings and radio barks only use who is aboard', () => {
  const meta = M.initialMeta();
  for (const id of ['marta', 'danilo', 'solomia', 'nina', 'lev', 'mechanic'])
    assert.ok(S.rescueQuote(id, meta), id);
  const veteran = { ...meta, totalRescues: 9, runs: 4 };
  assert.notEqual(S.rescueQuote('marta', veteran), S.rescueQuote('marta', meta));
  assert.equal(S.rescueQuote('nobody', meta), null);
  for (let seed = 0; seed < 60; seed++) {
    const bark = S.combatBark('wave', ['mechanic'], seed);
    assert.ok(bark);
    const sp = S.SPEAKERS[bark.who];
    assert.ok(sp.portrait !== 'resident' || bark.who === 'mechanic', `${bark.who} is not aboard`);
  }
  assert.equal(S.combatBark('nonsense', [], 1), null);
});

test('Story progress survives a save; old profiles replay the new prologue once', () => {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', 0, 4);
  meta.clues = ['tenth_cup', 'register'];
  meta.endings = ['a'];
  meta.scenesSeen = ['prologue', 'hub-bridge', 'ending-a'];
  meta.sceneProgress = { id: 'hub-bridge', index: 1 };
  const back = M.readSave(M.saveData(meta, run)).meta;
  assert.deepEqual(back.clues, ['tenth_cup', 'register']);
  assert.deepEqual(back.endings, ['a']);
  assert.deepEqual(back.scenesSeen, ['prologue', 'hub-bridge', 'ending-a']);
  assert.deepEqual(back.sceneProgress, { id: 'hub-bridge', index: 1 });
  const raw = JSON.parse(M.saveData(meta, run));
  raw.meta.clues = ['register', 'hack', 5];
  raw.meta.endings = ['b', 'z'];
  const cleaned = M.readSave(JSON.stringify(raw)).meta;
  assert.deepEqual(cleaned.clues, ['register']);
  assert.deepEqual(cleaned.endings, ['b']);
  // A 0.10 profile (older story revision, no clues) starts the new prologue.
  const old = JSON.parse(M.saveData(meta, run));
  old.meta.storyRevision = 5;
  delete old.meta.clues;
  delete old.meta.endings;
  old.meta.scenesSeen = ['prologue'];
  old.meta.sceneProgress = null;
  const migrated = M.readSave(JSON.stringify(old)).meta;
  assert.deepEqual(migrated.clues, []);
  assert.deepEqual(migrated.endings, []);
  assert.deepEqual(migrated.sceneProgress, { id: 'prologue', index: 0 });
  assert.ok(!migrated.scenesSeen.includes('prologue'));
});
