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

const HEADS = ['mechanic', 'spark', 'flora', 'boris', 'nina', 'lev', 'marta', 'danilo', 'solomia'];
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
  meta = { ...M.initialMeta(), deaths: 1, runs: 0, totalRescues: 0, totalBosses: 0, residents: [...HEADS] };
  for (let i = 0; i < 60; i++) {
    meta.runs++;
    meta.totalRescues += 1;
    meta.totalBosses = Math.floor(meta.runs / 4);
    if (meta.runs > 12) meta.endings = ['a'];
    if (meta.runs > 16) meta.endings = ['a', 'b'];
    if (meta.runs > 20) meta.endings = ['a', 'b', 'c'];
    if (meta.runs > 24) meta.endings = ['a', 'b', 'c', 'd'];
    // From here every head of ОСББ has won once (their epilogues open).
    if (meta.runs > 26) meta.winsByCharacter = Object.fromEntries(HEADS.map((id) => [id, 1]));
    const scene = S.hubScene(meta, false);
    if (!scene.id.startsWith('hub-protocol')) {
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

test('Leaving a scene keeps its clues, follows the chain and never loses the finale', () => {
  const at = (id, extra = {}) => ({ ...M.initialMeta(), sceneProgress: { id, index: 0 }, ...extra });
  const prologue = S.leaveScene(at('prologue'), []);
  assert.deepEqual(prologue.meta.clues, ['tenth_cup']);
  assert.ok(prologue.meta.scenesSeen.includes('prologue'));
  assert.equal(prologue.meta.sceneProgress, null);
  // A boss scene hands over to the next location's arrival.
  const chain = S.leaveScene(at('victory-0'), ['arrival-1']);
  assert.deepEqual(chain.meta.sceneProgress, { id: 'arrival-1', index: 0 });
  assert.deepEqual(chain.queue, []);
  assert.ok(chain.meta.clues.includes('attempt_count'));
  // The finale cannot be skipped away: dismissing it takes the first ending.
  const skipped = S.leaveScene(at('finale'), ['arrival-1']);
  assert.deepEqual(skipped.meta.sceneProgress, { id: 'ending-a', index: 0 });
  assert.deepEqual(skipped.meta.endings, ['a']);
  assert.deepEqual(skipped.queue, [], 'an ending clears whatever was queued');
  const choice = S.SCENES.finale.choices.find((c) => c.ending === 'b');
  const chosen = S.leaveScene(at('finale'), [], choice);
  assert.deepEqual(chosen.meta.sceneProgress, { id: 'ending-b', index: 0 });
  assert.deepEqual(chosen.meta.endings, ['b']);
  // Hub protocols are never listed as seen; a hub beat is, with its clue.
  const protocol = S.leaveScene(at('hub-protocol-4'), []);
  assert.deepEqual(protocol.meta.scenesSeen, []);
  const beat = S.leaveScene(at('hub-bridge'), []);
  assert.deepEqual(beat.meta.scenesSeen, ['hub-bridge']);
  assert.deepEqual(beat.meta.clues, ['bridge']);
  // Nothing open: nothing changes.
  const idle = M.initialMeta();
  assert.equal(S.leaveScene(idle, ['x']).meta, idle);
});

test('After a boss or a raid the right scenes follow, each only once', () => {
  const fresh = M.initialMeta();
  assert.deepEqual(S.victoryChain(fresh, 0, false), ['victory-0', 'road-1', 'arrival-1']);
  assert.deepEqual(S.victoryChain({ ...fresh, scenesSeen: ['victory-0'] }, 0, false), ['road-1', 'arrival-1']);
  assert.deepEqual(S.victoryChain({ ...fresh, scenesSeen: ['victory-0', 'road-1', 'arrival-1'] }, 0, false), []);
  assert.deepEqual(S.victoryChain(fresh, 1, true), [], 'endless circuits skip the recap');
  assert.deepEqual(S.raidEnd(fresh, true, true), { scene: 'finale' });
  const died = { ...fresh, runs: 1, deaths: 1 };
  assert.deepEqual(S.raidEnd(died, false, false), { scene: 'hub-first-death' });
  const quiet = { ...died, scenesSeen: ['hub-first-death'] };
  const after = S.raidEnd(quiet, false, false);
  assert.equal(after.scene, null);
  assert.ok(after.protocol.length > 0, 'a short protocol goes into the result window');
});

test('Every backdrop in the story exists, and each ending has its own picture', () => {
  const fs = require('node:fs');
  const C = require('../.test-build/cutscenes.js');
  for (const scene of allScenes())
    for (const line of scene.lines)
      if (line.art !== undefined)
        assert.ok(
          line.art <= 6 || C.SCENE_IMAGE_BY_ART[line.art],
          `${scene.id}: unknown art ${line.art}`,
        );
  // Every picture a scene names is a file of its own.
  for (const scene of allScenes())
    for (const line of scene.lines)
      if (line.art > 6)
        assert.ok(fs.existsSync('public' + C.SCENE_IMAGE_BY_ART[line.art]), `${scene.id}: art ${line.art} has a file`);
  assert.equal(new Set(Object.values(C.SCENE_IMAGE_BY_ART)).size, Object.keys(C.SCENE_IMAGE_BY_ART).length, 'no picture serves two slots');
  // Each resident's story and each house on the radio opens with its own picture.
  for (const id of ['nina', 'lev', 'mechanic', 'spark', 'flora', 'boris', 'marta', 'danilo', 'solomia'])
    assert.equal(S.HUB_SCENES.find((s) => s.id === `arc-${id}`).lines[0].art, C.ARC_ART[id], `arc ${id}`);
  for (const [id, art] of [['raid-0-a', C.HOUSE_ART.rust], ['raid-1-a', C.HOUSE_ART.green], ['raid-2-a', C.HOUSE_ART.core]])
    assert.equal(S.SCENES[id].lines[0].art, art, id);
  for (const key of ['a', 'b', 'c', 'd']) {
    const art = C.ENDING_ART[key],
      file = C.SCENE_IMAGE_BY_ART[art];
    assert.ok(file && fs.existsSync('public' + file), `ending ${key} picture`);
    const scene = S.SCENES['ending-' + key];
    assert.ok(scene.lines.some((l) => l.art === art), `ending ${key} uses its picture`);
    for (const other of ['a', 'b', 'c', 'd'].filter((k) => k !== key))
      assert.ok(
        !scene.lines.some((l) => l.art === C.ENDING_ART[other]),
        `ending ${key} must not show the picture of ${other}`,
      );
  }
});

test('Shelter talks have a backdrop: a defeat shows the fallen house, the hall and the rising house; a win the sunrise', () => {
  const fs = require('node:fs');
  const C = require('../.test-build/cutscenes.js');
  // Three pictures, each with a file.
  const defeat = [C.SHELTER_ART.fallen, C.SHELTER_ART.hall, C.SHELTER_ART.rising];
  assert.equal(new Set(defeat).size, 3);
  for (const art of defeat) {
    const file = C.SCENE_IMAGE_BY_ART[art];
    assert.ok(file && fs.existsSync('public' + file), `shelter picture ${art}`);
    // None of them clashes with the cutscene sheet, the origins or the endings.
    assert.ok(art > 15);
  }
  // A protocol after a defeat cycles through them by its number.
  const picked = [0, 1, 2, 3, 4, 5].map((n) => C.shelterBackdrop(`hub-protocol-${n}`));
  assert.deepEqual(new Set(picked), new Set(defeat));
  assert.deepEqual(picked.slice(0, 3), picked.slice(3));
  // A win has the sunrise; any other talk the house at night.
  assert.equal(C.shelterBackdrop('hub-victory-4'), 5);
  assert.equal(C.shelterBackdrop('hub-boris-ledger'), 2);
  assert.equal(C.shelterBackdrop(''), 2);
  // The first fall tells its three lines over the three pictures.
  const first = S.HUB_SCENES.find((s) => s.id === 'hub-first-death');
  assert.deepEqual(first.lines.map((l) => l.art), defeat);
});

test('Each ending changes the Shelter: its own beat once, and its own protocols', () => {
  const seenAll = S.HUB_SCENES.map((x) => x.id).filter((id) => !id.startsWith('hub-after-'));
  const base = { ...M.initialMeta(), deaths: 1, runs: 30, totalRescues: 9, totalBosses: 5, scenesSeen: seenAll };
  const protocols = (endings) => {
    const texts = new Set();
    for (let runs = 1; runs <= 40; runs++)
      for (let kills = 0; kills < 5; kills++) {
        const meta = { ...base, runs, kills, endings, scenesSeen: [...seenAll, 'hub-after-a', 'hub-after-b', 'hub-after-c'] };
        for (const won of [false, true])
          for (const line of S.hubScene(meta, won).lines) texts.add(line.text);
      }
    return texts;
  };
  const marker = { a: 'Ставлю десяту чашку, а потім прибираю', b: 'Мене попросили не дзвонити', c: 'Охороняю капці на пагорбі' };
  const none = protocols([]);
  for (const id of ['a', 'b', 'c']) {
    assert.ok(![...none].some((t) => t.includes(marker[id])), `no ${id} lines before the ending`);
    const own = protocols([id]);
    assert.ok([...own].some((t) => t.includes(marker[id])), `${id} lines after the ending`);
    for (const other of ['a', 'b', 'c'].filter((x) => x !== id))
      assert.ok(![...own].some((t) => t.includes(marker[other])), `${other} lines stay hidden`);
    // The beat waits for its ending, comes once, and a saved scene id still resolves.
    const beat = `hub-after-${id}`;
    assert.notEqual(S.hubScene({ ...base, endings: [], scenesSeen: seenAll }, false).id, beat);
    assert.equal(S.hubScene({ ...base, endings: [id], scenesSeen: seenAll }, false).id, beat);
    assert.notEqual(S.hubScene({ ...base, endings: [id], scenesSeen: [...seenAll, beat] }, false).id, beat);
    assert.ok(S.storyScene(beat, base));
  }
  // A protocol id saved before reloading rebuilds the very same lines.
  const meta = { ...base, runs: 17, kills: 3, endings: ['a', 'c'], scenesSeen: [...seenAll, 'hub-after-a', 'hub-after-c'] };
  const scene = S.hubScene(meta, false);
  assert.match(scene.id, /^hub-protocol-17$/);
  assert.deepEqual(S.storyScene(scene.id, meta).lines, scene.lines);
});

test('Each head has an epilogue that opens only after a raid won with them, once', () => {
  const others = S.HUB_SCENES.filter((x) => !x.id.startsWith('hub-epilogue-')).map((x) => x.id);
  for (const hero of HEADS) {
    const base = { ...M.initialMeta(), runs: 30, scenesSeen: others };
    assert.ok(!S.hubScene(base, true).id.startsWith('hub-epilogue-'), 'nobody has won yet');
    const won = { ...base, winsByCharacter: { [hero]: 1 } };
    const scene = S.hubScene(won, true);
    assert.equal(scene.id, 'hub-epilogue-' + hero);
    assert.ok(scene.lines.length >= 4 && scene.choices.length === 2);
    assert.ok(scene.lines.some((l) => l.who === hero), 'the hero speaks in their own epilogue');
    for (const line of [...scene.lines, ...scene.choices.map((c) => c.reply)]) {
      assert.ok(line.text.length > 8 && line.text.length <= 140, hero + ': ' + line.text);
      assert.ok(S.SPEAKERS[line.who], hero + ': known speaker ' + line.who);
    }
    const seen = { ...won, scenesSeen: [...others, scene.id] };
    assert.ok(!S.hubScene(seen, true).id.startsWith('hub-epilogue-'), 'told once');
    assert.ok(S.isStoryId(scene.id));
  }
});

const arcOwners = ['nina', 'lev', 'mechanic', 'spark', 'flora', 'boris', 'marta', 'danilo', 'solomia'];

test('Every boss of the campaign is a character: its own intro, last words and an answer', () => {
  const { BOSS_VARIANTS } = require('../.test-build/encounters.js');
  const B = require('../.test-build/story-bosses.js');
  assert.equal(BOSS_VARIANTS.length, 9);
  const intros = new Set();
  for (const boss of BOSS_VARIANTS) {
    const first = B.bossIntro(boss.id, false),
      again = B.bossIntro(boss.id, true);
    assert.ok(first && again && first !== again, `${boss.id}: intro`);
    intros.add(first);
    intros.add(again);
    const end = S.SCENES[B.bossEndId(boss.id)];
    assert.ok(end, `${boss.id}: last words`);
    assert.equal(end.lines[0].who, 'boss');
    assert.equal(end.lines[0].boss, boss.id);
    assert.notEqual(end.lines[1].who, 'boss', `${boss.id}: someone answers`);
    assert.ok(S.isStoryId(end.id) && end.library);
  }
  assert.equal(intros.size, 18, 'no two bosses share a line');
  // The intro card quotes the boss of the run; a miniboss keeps the district's voice.
  const meta = M.initialMeta();
  for (const boss of BOSS_VARIANTS) {
    const run = { chapter: boss.location, kind: 'boss', bossVariants: [0, 1, 2].map((n) => (n === boss.location ? boss.variant : 0)) };
    assert.equal(S.bossQuote(run, meta), B.bossIntro(boss.id, false));
    assert.equal(S.bossQuote(run, { ...meta, runs: 5 }), B.bossIntro(boss.id, true), 'the crew came back');
  }
  const mini = S.bossQuote({ chapter: 1, kind: 'miniboss', bossVariants: [0, 0, 0] }, meta);
  assert.equal(mini, S.bossQuote({ chapter: 1 }, meta));
});

test('A boss that falls says its last words first, once; the last boss before the finale', () => {
  const fresh = M.initialMeta();
  assert.deepEqual(S.victoryChain(fresh, 0, false, 'commandant'), ['boss-end-commandant', 'victory-0', 'road-1', 'arrival-1']);
  const met = { ...fresh, scenesSeen: ['boss-end-commandant'] };
  assert.deepEqual(S.victoryChain(met, 0, false, 'commandant'), ['victory-0', 'road-1', 'arrival-1']);
  assert.deepEqual(S.victoryChain(fresh, 0, false, 'scrap-press')[0], 'boss-end-scrap-press', 'each boss of the district has its own words');
  assert.deepEqual(S.victoryChain(fresh, 0, false), ['victory-0', 'road-1', 'arrival-1'], 'no boss given: as before');
  assert.deepEqual(S.victoryChain(fresh, 0, true, 'commandant'), [], 'an endless circuit skips the recap');
  assert.deepEqual(S.raidEnd(fresh, true, true, 'chronarch'), { scene: 'boss-end-chronarch', then: ['finale'] });
  assert.deepEqual(S.raidEnd({ ...fresh, scenesSeen: ['boss-end-chronarch'] }, true, true, 'chronarch'), { scene: 'finale' });
  assert.deepEqual(S.raidEnd(fresh, true, true), { scene: 'finale' });
});

test('Choices are remembered by topic and warmth opens the ending of the whole street', () => {
  const at = (id) => ({ ...M.initialMeta(), sceneProgress: { id, index: 0 }, residents: [...arcOwners] });
  const nina = S.HUB_SCENES.find((s) => s.id === 'arc-nina');
  const [warm, cool] = nina.choices;
  assert.equal(warm.mark, 'nina:warm');
  assert.equal(cool.mark, 'nina:cool');
  const picked = S.leaveScene(at('arc-nina'), [], warm).meta;
  assert.deepEqual(picked.marks, ['nina:warm']);
  assert.ok(picked.scenesSeen.includes('arc-nina'));
  // Replaying the story and answering otherwise changes the answer, not adds one.
  const changed = S.leaveScene({ ...picked, sceneProgress: { id: 'arc-nina', index: 0 } }, [], cool).meta;
  assert.deepEqual(changed.marks, ['nina:cool']);
  assert.deepEqual(S.leaveScene(at('arc-nina'), []).meta.marks, [], 'skipping leaves no mark');
  assert.equal(S.warmth(picked), 1);
  assert.equal(S.warmth(changed), 0);
  // The ending of the street: six warm choices, two answered houses, the evidence.
  let meta = { ...M.initialMeta(), marks: ['nina:warm', 'lev:warm', 'spark:warm', 'flora:warm', 'boris:warm', 'marta:warm'], clues: S.CLUES.slice(0, 8).map((c) => c.id) };
  assert.ok(!S.canEndingD(meta), 'no house was answered');
  meta = { ...meta, marks: [...meta.marks, 'house12:warm', 'house23:cool'] };
  assert.ok(!S.canEndingD(meta), 'one house is not a street');
  meta = { ...meta, marks: [...meta.marks, 'house4:warm'] };
  assert.equal(S.neighbours(meta), 2);
  assert.ok(S.canEndingD(meta));
  assert.ok(!S.canEndingD({ ...meta, clues: meta.clues.slice(0, 7) }), 'the evidence is needed');
  assert.ok(!S.canEndingD({ ...meta, marks: meta.marks.filter((m) => m !== 'nina:warm' && m !== 'lev:warm' && m !== 'spark:warm') }), 'and the warmth');
  const open = (m) => S.SCENES.finale.choices.filter((c) => !c.requires || c.requires(m)).map((c) => c.ending);
  assert.ok(open(meta).includes('d') && !open(M.initialMeta()).includes('d'));
  const end = S.leaveScene({ ...meta, sceneProgress: { id: 'finale', index: 0 } }, [], S.SCENES.finale.choices.find((c) => c.ending === 'd'));
  assert.deepEqual(end.meta.sceneProgress, { id: 'ending-d', index: 0 });
  assert.ok(end.meta.endings.includes('d'));
  // A profile keeps its marks through a save; junk and repeats are dropped.
  const raw = JSON.parse(M.saveData({ ...M.initialMeta(), marks: ['nina:warm'] }, null));
  raw.meta.marks = ['nina:warm', 'nina:cool', 'lev:warm', 'bad', 7, 'x:y', 'a b:warm'];
  assert.deepEqual(M.readSave(JSON.stringify(raw)).meta.marks, ['nina:cool', 'lev:warm']);
  delete raw.meta.marks;
  assert.deepEqual(M.readSave(JSON.stringify(raw)).meta.marks, [], 'an old profile has none');
});

test('Each resident has a story in the Shelter, told once the resident is aboard and the raids add up', () => {
  const arcs = S.HUB_SCENES.filter((s) => s.id.startsWith('arc-'));
  assert.deepEqual(arcs.map((s) => s.id.slice(4)).sort(), [...arcOwners].sort());
  const base = { ...M.initialMeta(), deaths: 1, runs: 40, totalRescues: 9, totalBosses: 5, endings: ['a', 'b', 'c'], winsByCharacter: {}, scenesSeen: S.HUB_SCENES.map((s) => s.id).filter((id) => !id.startsWith('arc-') && !id.startsWith('hub-epilogue-')) };
  for (const id of arcOwners) {
    const scene = arcs.find((s) => s.id === `arc-${id}`);
    assert.equal(scene.choices.length, 2);
    assert.ok(scene.choices[0].mark.endsWith(':warm') && scene.choices[1].mark.endsWith(':cool'));
    assert.ok(scene.lines.some((l) => l.who === id), `${id} tells it`);
    assert.ok(scene.choices.every((c) => c.reply.who === id));
    // Waits for the resident to be in the Shelter.
    assert.ok(!S.hubScene({ ...base, residents: arcOwners.filter((r) => r !== id) }, false).id.startsWith(`arc-${id}`));
  }
  // The story does not come before the raids it needs.
  assert.ok(!S.hubScene({ ...base, runs: 1, residents: [...arcOwners] }, false).id.startsWith('arc-'));
  // Hub beats of the main plot go first.
  assert.equal(S.hubScene({ ...base, scenesSeen: [], runs: 4, residents: [...arcOwners] }, false).id, 'hub-first-death');
});

test('Radio of other houses and signs on the road come once, at their step, after a won battle', () => {
  const meta = { ...M.initialMeta(), tutorialDone: true };
  assert.equal(S.raidBeat({ ...meta, tutorialDone: false }, 0, 3), null, 'not during the tutorial');
  assert.equal(S.raidBeat(meta, 0, 1), null);
  assert.equal(S.raidBeat(meta, 0, 3), 'raid-0-a');
  assert.equal(S.raidBeat(meta, 0, 4), 'raid-0-a', 'a missed step is told at the next win');
  assert.equal(S.raidBeat({ ...meta, scenesSeen: ['raid-0-a'] }, 0, 5), null);
  assert.equal(S.raidBeat({ ...meta, scenesSeen: ['raid-0-a'] }, 0, 6), 'raid-0-b');
  assert.equal(S.raidBeat(meta, 1, 3), 'raid-1-a');
  assert.equal(S.raidBeat(meta, 2, 3), 'raid-2-a');
  assert.equal(S.raidBeat({ ...meta, scenesSeen: ['raid-2-a'] }, 2, 9), null);
  for (const id of ['raid-0-a', 'raid-0-b', 'raid-1-a', 'raid-1-b', 'raid-2-a']) assert.ok(S.isStoryId(id), id);
  // The answers to the houses count for the street; the signs only hand over a clue.
  for (const id of ['raid-0-a', 'raid-1-a', 'raid-2-a'])
    assert.ok(S.SCENES[id].choices[0].mark.startsWith('house') && S.SCENES[id].choices[0].mark.endsWith(':warm'));
  assert.deepEqual(S.leaveScene({ ...meta, sceneProgress: { id: 'raid-0-b', index: 0 } }, []).meta.clues, ['bridge']);
});

test('The endings that end well seat the residents the player answered at the table', () => {
  const lines = (id, m) => S.storyScene(id, m).lines.map((l) => l.text);
  const none = M.initialMeta(),
    warm = { ...none, marks: ['nina:warm', 'boris:warm'] },
    cool = { ...none, marks: ['lev:cool'] };
  for (const id of ['ending-b', 'ending-d']) {
    const plain = lines(id, none).length;
    assert.equal(lines(id, warm).length, plain + 2, `${id}: two warm words`);
    assert.equal(lines(id, cool).length, plain + 1, `${id}: one cool word`);
  }
  assert.ok(lines('ending-b', warm).some((t) => t.includes('десяту чашку')));
  assert.equal(lines('ending-a', warm).length, lines('ending-a', none).length, 'the cold ending has no table');
  // The scene itself is the same for everyone: only the telling changes.
  assert.ok(S.SCENES['ending-b'].lines.length >= lines('ending-b', none).length + 18);
  assert.ok(S.storyScene('ending-d', none).lines.length > 10);
});

test('Meetings on the road count for the heart, but only two of the six, and the profile keeps them', () => {
  const road = ['road-rust-meeting:warm', 'road-green-roots:warm', 'road-core-lift:warm', 'road-core-patrol:warm', 'road-green-beekeeper:warm'];
  assert.equal(S.warmth({ marks: road }), 2, 'five warm meetings count as two');
  assert.equal(S.warmth({ marks: road.slice(0, 1) }), 1);
  assert.equal(S.warmth({ marks: ['road-rust-meeting:cool', 'road-core-lift:cool'] }), 0, 'cool ones are not warm');
  assert.equal(S.warmth({ marks: ['nina:warm', 'lev:warm', ...road] }), 4, 'the stories at the shelter add up in full');
  // The street's ending still needs the shelter. The two houses on the radio count
  // for the heart too: with two stories and two meetings it is six, with one story
  // and five meetings it would be eight but for the cap, and is five.
  const base = { ...M.initialMeta(), clues: S.CLUES.slice(0, 8).map((c) => c.id) };
  const houses = ['house12:warm', 'house4:warm'];
  assert.ok(S.canEndingD({ ...base, marks: ['nina:warm', 'lev:warm', ...houses, ...road.slice(0, 2)] }));
  assert.ok(!S.canEndingD({ ...base, marks: ['nina:warm', ...houses, ...road] }), 'a meeting is not a substitute for a story');
  // Replaying a meeting and choosing otherwise changes the answer; the profile keeps the mark through a save.
  assert.deepEqual(S.addMark({ ...base, marks: ['road-rust-meeting:warm'] }, 'road-rust-meeting:cool').marks, ['road-rust-meeting:cool']);
  const raw = JSON.parse(M.saveData({ ...M.initialMeta(), marks: ['road-green-roots:warm'] }, null));
  assert.deepEqual(M.readSave(JSON.stringify(raw)).meta.marks, ['road-green-roots:warm']);
  raw.meta.marks = ['road-core-lift:cool', 'road core:warm', 'ROAD:warm', `road-${'x'.repeat(40)}:warm`];
  assert.deepEqual(M.readSave(JSON.stringify(raw)).meta.marks, ['road-core-lift:cool'], 'spaces, capitals and runaway names are dropped');
});
