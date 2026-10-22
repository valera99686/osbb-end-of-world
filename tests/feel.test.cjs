const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const Audio = require('../.test-build/audio.js');
const { Battle, AudioEngine } = require('../.test-build/engine.js');
const Mini = require('../.test-build/minibosses.js');

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
function mockNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}
afterEach(() => {
  if (realNavigator)
    Object.defineProperty(globalThis, 'navigator', realNavigator);
  delete globalThis.window;
  delete globalThis.document;
});

function recorder() {
  const log = { sfx: [], layers: [] };
  return {
    log,
    audio: {
      play: (kind) => log.sfx.push(kind),
      setLayer: (layer) => log.layers.push(layer),
      // The UI owns pause ducking; the engine must never call this.
      setPaused: () => {
        throw new Error('engine called setPaused');
      },
    },
  };
}
function battle(kind = 'battle', opts = {}) {
  const meta = M.initialMeta(),
    run = M.makeRun(meta, 'mechanic', opts.chapter ?? 0, 5);
  run.kind = kind;
  if (kind === 'boss') run.step = 9;
  let result = null,
    ended = 0;
  const b = new Battle(
    opts.canvas ?? null,
    run,
    meta,
    opts.audio ?? new AudioEngine(),
    opts.onHud ?? (() => {}),
    (r) => {
      ended++;
      result = r;
    },
    opts.options ?? {},
  );
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.thorns = b.stats.orbit = b.stats.drones = 0;
  return { b, done: () => ({ ended, result }) };
}

test('AudioEngine is the audio module class, re-exported for old imports', () => {
  assert.equal(AudioEngine, Audio.AudioEngine);
});

test('Settings default, apply live, and damage numbers aggregate per enemy with a cap', () => {
  const { b } = battle();
  assert.deepEqual(b.settings, M.DEFAULT_SETTINGS);
  b.spawn(0);
  const e = b.enemies[0];
  e.hp = e.max = 1e6;
  b.damage(e, 5);
  b.damage(e, 7, true);
  assert.equal(b.numbers.length, 1);
  assert.equal(b.numbers[0].value, 12);
  assert.equal(b.numbers[0].crit, true);
  b.updateFx(0.2);
  b.damage(e, 3);
  assert.equal(b.numbers.length, 2);
  for (let i = 0; i < 60; i++) {
    b.spawn(0);
    const other = b.enemies.at(-1);
    other.hp = other.max = 1e6;
    b.damage(other, 1);
  }
  assert.ok(b.numbers.length <= 40);
  b.setSettings({ ...M.DEFAULT_SETTINGS, damageNumbers: false, shake: 0 });
  assert.equal(b.numbers.length, 0);
  b.damage(e, 9);
  assert.equal(b.numbers.length, 0);
  assert.equal(b.settings.shake, 0);
});

test('Gamepad: radial dead zone, D-pad, press edges, and Start works while paused', () => {
  const pad = {
    connected: true,
    axes: [0.1, 0.1],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  mockNavigator({ getGamepads: () => [null, pad] });
  let pauses = 0;
  const { b } = battle('battle', {
    audio: recorder().audio,
    options: { onPause: () => pauses++ },
  });
  b.pollGamepad();
  assert.deepEqual(b.pad, { x: 0, y: 0 });
  pad.axes = [0.6, 0];
  b.pollGamepad();
  assert.ok(Math.abs(b.pad.x - 0.5) < 1e-9);
  const x = b.x;
  b.update(0.1);
  assert.ok(Math.abs(b.x - x - 0.5 * b.stats.speed * 0.1) < 1e-6);
  pad.axes = [0, 0];
  pad.buttons[15].pressed = true;
  b.pollGamepad();
  assert.equal(b.pad.x, 1);
  pad.buttons[15].pressed = false;
  pad.buttons[0].pressed = true;
  b.pollGamepad();
  assert.equal(b.run.dashes, 1);
  b.dashCd = 0;
  b.pollGamepad();
  assert.equal(b.run.dashes, 1, 'holding A does not dash again');
  pad.buttons[0].pressed = false;
  pad.buttons[7].value = 0.9;
  b.pollGamepad();
  assert.equal(b.run.dashes, 2, 'right trigger dashes');
  b.paused = true;
  pad.buttons[9].pressed = true;
  b.pollGamepad();
  b.pollGamepad();
  assert.equal(pauses, 1);
  mockNavigator({ getGamepads: () => [] });
  b.pollGamepad();
  assert.deepEqual(b.pad, { x: 0, y: 0 });
});

test('Vibration follows the setting, is rate-limited, and never throws without the API', () => {
  const calls = [];
  mockNavigator({ vibrate: (p) => calls.push(p) });
  const { b } = battle();
  b.hurt(10, 0, 0.3);
  assert.equal(calls.length, 1);
  b.hurt(10, 0, 0.3);
  assert.equal(calls.length, 1);
  b.buzzFree = 0;
  b.dash();
  assert.equal(calls.length, 2);
  b.setSettings({ ...M.DEFAULT_SETTINGS, vibration: false });
  b.buzzFree = 0;
  b.hurt(10, 0, 0.3);
  assert.deepEqual(calls.slice(2), [0]);
  mockNavigator({});
  b.setSettings(M.DEFAULT_SETTINGS);
  b.hurt(10, 0, 0.3);
});

test('Hit-stop and slow motion only act through tick(); update(dt) stays deterministic', () => {
  const run = () => {
    const { b } = battle('battle', { chapter: 1 });
    b.spawnTimer = 0;
    b.shotTimer = 0;
    b.stats.health = b.run.hp = 1e4;
    for (let i = 0; i < 400; i++) b.update(0.025);
    return [b.run.kills, b.run.hp, b.x, b.enemies.length, b.rng()];
  };
  assert.deepEqual(run(), run());
  const { b } = battle();
  b.freeze(0.06);
  b.tick(0.016);
  assert.equal(b.elapsed, 0);
  for (let i = 0; i < 5; i++) b.tick(0.016);
  assert.ok(b.elapsed > 0);
  const before = b.elapsed;
  b.slow(0.8, 0.25);
  b.tick(0.02);
  assert.ok(Math.abs(b.elapsed - before - 0.005) < 1e-9);
  for (let i = 0; i < 60; i++) b.tick(0.02);
  assert.equal(b.timeScale(), 1);
});

test('Boss phase two: banner, knockback wave, boss music layer and sfx', () => {
  const { audio, log } = recorder();
  const { b } = battle('boss', { audio });
  b.update(0.025);
  const boss = b.enemies.find((e) => e.type === 99);
  assert.ok(boss);
  b.spawn(0);
  const minion = b.enemies.at(-1);
  Object.assign(minion, { x: boss.x + 60, y: boss.y, speed: 0, hp: 1e6 });
  b.invincible = 99;
  boss.hp = boss.max * 0.49;
  b.update(0.025);
  assert.equal(boss.phase, 1);
  assert.equal(b.banners.at(-1).title, 'ФАЗА 2');
  assert.ok(b.banners.at(-1).text.length > 0);
  assert.ok(minion.knockX > 0);
  assert.deepEqual(log.layers, ['boss']);
  assert.ok(log.sfx.includes('bossPhase'));
  const start = Math.hypot(minion.x - boss.x, minion.y - boss.y);
  for (let i = 0; i < 20; i++) b.update(0.025);
  assert.ok(Math.hypot(minion.x - boss.x, minion.y - boss.y) > start + 80);
  b.update(0.025);
  assert.equal(b.banners.length, 1, 'phase change fires once');
});

test('Leader intro holds attacks for a second, and bossNoHit counts clean kills only', () => {
  for (const kind of ['boss', 'miniboss']) {
    const { b, done } = battle(kind);
    assert.ok(b.introCard.title);
    assert.ok(b.intro > 0);
    b.update(0.025);
    const leader = b.enemies.find(
      (e) => e.type === 99 || e.type === Mini.MINIBOSS_TYPE,
    );
    leader.timer = 0;
    while (b.elapsed < 0.95) {
      b.update(0.025);
      assert.ok(!leader.windup, kind);
    }
    for (let i = 0; i < 10; i++) b.update(0.025);
    assert.ok(leader.windup || leader.timer > 0, kind);
    b.damage(leader, leader.max);
    assert.equal(done().result.run.bossNoHit, 1);
    assert.equal(done().result.run.battleDamage, 0);
    assert.ok(done().result.run.maxBattleKills >= 1);
  }
  const { b, done } = battle('boss');
  b.update(0.025);
  b.receiveHit(5);
  assert.equal(b.run.damageTaken, 5);
  assert.equal(b.run.battleDamage, 5);
  const boss = b.enemies.find((e) => e.type === 99);
  b.damage(boss, boss.max);
  assert.equal(done().result.run.bossNoHit, 0);
});

test('A live battle plays its outro before onEnd; low health warns on a timer', () => {
  const { audio, log } = recorder();
  let hud = null;
  const { b, done } = battle('boss', { audio, onHud: (h) => (hud = h) });
  b.running = true;
  b.update(0.025);
  b.spawn(0);
  const boss = b.enemies.find((e) => e.type === 99);
  b.damage(boss, boss.max);
  assert.equal(done().ended, 0);
  assert.equal(b.enemies.length, 0, 'the victory sweep clears the field');
  assert.equal(hud.boss, 0);
  assert.equal(hud.bossMax, boss.max, 'final HUD shows an empty boss bar');
  let t = 0;
  while (!done().ended && t < 5) {
    b.tick(1 / 60);
    t += 1 / 60;
  }
  assert.equal(done().ended, 1);
  assert.ok(t >= 1.2, `outro lasted ${t}`);
  assert.equal(done().result.won, true);
  for (let i = 0; i < 30; i++) b.tick(1 / 60);
  assert.equal(done().ended, 1);
  assert.ok(log.sfx.includes('explosion') && log.sfx.includes('win'));

  const low = battle('battle', { audio });
  low.b.run.hp = low.b.stats.health * 0.2;
  log.sfx.length = 0;
  for (let i = 0; i < 120; i++) low.b.update(0.025);
  const warnings = log.sfx.filter((s) => s === 'lowHp').length;
  assert.ok(warnings >= 2 && warnings <= 3, `${warnings} warnings in 3 s`);
});

function fakeCanvas(styles) {
  const gradient = { addColorStop() {} };
  const context = () => {
    const state = {
      globalAlpha: 1,
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      lineJoin: 'miter',
      lineCap: 'butt',
      shadowBlur: 0,
      shadowColor: '#0000',
      globalCompositeOperation: 'source-over',
      imageSmoothingQuality: 'low',
    };
    return new Proxy(state, {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'measureText')
          return (text) => ({ width: String(text).length * 9 });
        return (...args) => {
          // Real canvases reject NaN geometry and negative radii.
          if (args.some((a) => typeof a === 'number' && !Number.isFinite(a)))
            throw new Error(`non-finite argument to ${String(key)}`);
          if (key === 'arc' && args[2] < 0) throw new Error('arc radius');
          if (key === 'ellipse' && (args[2] < 0 || args[3] < 0))
            throw new Error('ellipse radius');
          if (key === 'createLinearGradient' || key === 'createRadialGradient')
            return gradient;
        };
      },
      set(target, key, value) {
        if (!Number.isFinite(value) && typeof value === 'number')
          throw new Error(`non-finite ${String(key)}`);
        target[key] = value;
        styles.push([key, value]);
        return true;
      },
    });
  };
  const make = () => ({
    width: 0,
    height: 0,
    getContext: context,
    getBoundingClientRect: () => ({ width: 800, height: 450 }),
  });
  globalThis.window = { devicePixelRatio: 2 };
  const fakeDocument = {};
  fakeDocument.createElement = make;
  globalThis.document = fakeDocument;
  return make();
}

test('Drawing covers every overlay in normal and accessibility modes without shadowBlur', () => {
  for (const settings of [
    M.DEFAULT_SETTINGS,
    {
      ...M.DEFAULT_SETTINGS,
      colorblind: true,
      reducedFlashes: true,
      textScale: 1.3,
      shake: 0.5,
    },
  ])
    for (const chapter of [0, 1, 2]) {
      const styles = [];
      const canvas = fakeCanvas(styles);
      const { b } = battle('boss', {
        chapter,
        canvas,
        options: { settings },
      });
      b.update(0.025);
      b.spawn(chapter === 0 ? 0 : chapter === 1 ? 3 : 6);
      const e = b.enemies.at(-1);
      Object.assign(e, { x: b.x + 90, y: b.y, windup: 0.4 });
      b.shoot(b.x, b.y - 20, e);
      b.bullets.push({
        x: b.x - 60,
        y: b.y,
        vx: 120,
        vy: 0,
        life: 2,
        damage: 5,
        enemy: true,
        crit: false,
        age: 0.5,
      });
      b.hazards.push(
        {
          x: b.x,
          y: b.y,
          radius: 50,
          age: -0.5,
          duration: 1,
          damage: 1,
          color: '#99ce78',
        },
        {
          x: b.x,
          y: b.y,
          x2: b.x + 300,
          y2: b.y,
          radius: 18,
          age: 0.05,
          duration: 1,
          damage: 1,
          color: '#99ce78',
        },
      );
      b.drops.push(
        { x: b.x + 40, y: b.y, kind: 'coin', value: 1 },
        { x: b.x + 50, y: b.y, kind: 'heal', value: 1 },
        { x: b.x + 60, y: b.y, kind: 'xp', value: 1 },
      );
      b.damage(e, 1e6, true);
      b.update(0.016);
      b.run.hp = b.stats.health * 0.1;
      b.hurtFlash = 1;
      b.flash = 1;
      b.trauma = 1;
      b.banner('ТЕСТ', 'Підпис', '#ffcc66');
      b.draw();
      b.run.hp = 0;
      b.running = true;
      b.finish(false);
      b.tick(0.05);
      b.draw();
      const set = (key, value) =>
        styles.some(([k, v]) => k === key && v === value);
      assert.equal(set('fillStyle', '#a55aff'), settings.colorblind);
      assert.equal(set('strokeStyle', '#ffb000'), settings.colorblind);
      assert.ok(set('fillStyle', '#fff6e6'), 'intro title and flash drawn');
      assert.ok(
        !styles.some(([k, v]) => k === 'shadowBlur' && v > 0),
        'no per-object shadowBlur',
      );
    }
});

// fakeCanvas plus a log of every context call, for geometry checks.
function recordingCanvas(calls) {
  const canvas = fakeCanvas([]),
    getContext = canvas.getContext;
  canvas.getContext = (...args) => {
    const ctx = getContext(...args);
    return new Proxy(ctx, {
      get(target, key) {
        const value = target[key];
        if (typeof value !== 'function') return value;
        return (...a) => {
          calls.push([key, a]);
          return value(...a);
        };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    });
  };
  return canvas;
}

test('Gamepad: a button already held when battle starts, reconnects or resumes needs a release', () => {
  const pad = {
    connected: true,
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  pad.buttons[0].pressed = true;
  let pads = [pad];
  mockNavigator({ getGamepads: () => pads });
  const { b } = battle('battle', { audio: recorder().audio });
  const x = b.x;
  // The A that picked the fight on the map is still down.
  b.pollGamepad();
  b.pollGamepad();
  assert.equal(b.run.dashes, 0);
  assert.equal(b.dashCd, 0);
  assert.equal(b.dashing, 0);
  for (let i = 0; i < 10; i++) b.update(1 / 60);
  assert.ok(Math.abs(b.x - x) < 1e-9, 'no slide at the start');
  pad.buttons[0].pressed = false;
  b.pollGamepad();
  pad.buttons[0].pressed = true;
  b.pollGamepad();
  assert.equal(b.run.dashes, 1, 'a fresh press dashes');
  // Reconnecting with A held does not fire either.
  b.dashCd = 0;
  pads = [];
  b.pollGamepad();
  pads = [pad];
  b.pollGamepad();
  assert.equal(b.run.dashes, 1);
  // Nor does the A that pressed "resume" in the pause menu.
  pad.buttons[0].pressed = false;
  b.pollGamepad();
  b.paused = true;
  b.pollGamepad();
  pad.buttons[0].pressed = true;
  b.paused = false;
  b.pollGamepad();
  assert.equal(b.run.dashes, 1);
  pad.buttons[0].pressed = false;
  b.pollGamepad();
  pad.buttons[1].pressed = true;
  b.pollGamepad();
  assert.equal(b.pulseCd, 12, 'B pulses after the resume');
  // stop() re-primes too.
  b.stop();
  pad.buttons[1].pressed = false;
  pad.buttons[0].pressed = true;
  b.dashCd = 0;
  b.pollGamepad();
  assert.equal(b.run.dashes, 1);
});

test('Pausing during the outro hands over the result at once, exactly once', () => {
  for (const won of [true, false]) {
    const { b, done } = battle('boss');
    b.running = true;
    b.update(0.025);
    const boss = b.enemies.find((e) => e.type === 99);
    if (won) b.damage(boss, boss.max);
    else {
      b.run.hp = 0;
      b.finish(false);
    }
    assert.equal(done().ended, 0, 'the outro holds the result');
    b.paused = true;
    assert.equal(done().ended, 1);
    assert.equal(done().result.won, won);
    assert.equal(b.pendingEnd, null);
    b.paused = false;
    for (let i = 0; i < 120; i++) b.tick(1 / 60);
    assert.equal(done().ended, 1);
  }
  // Pausing a live fight changes nothing.
  const { b, done } = battle();
  b.paused = true;
  b.paused = false;
  assert.equal(done().ended, 0);
});

test('A paused frame does not shake', () => {
  const calls = [];
  const { b } = battle('battle', { canvas: recordingCanvas(calls) });
  const cameraAt = () => {
    calls.length = 0;
    b.draw();
    return calls.find(([key]) => key === 'translate')[1];
  };
  b.trauma = 1;
  b.paused = true;
  const still = cameraAt();
  assert.deepEqual(cameraAt(), still);
  b.paused = false;
  const shots = new Set();
  for (let i = 0; i < 5; i++) shots.add(cameraAt().join());
  assert.ok(shots.size > 1, 'live frames still shake');
});

test('Culling keeps a blink ring, tall bosses and aura edges that reach the screen', () => {
  const calls = [];
  const { b } = battle('battle', {
    chapter: 2,
    canvas: recordingCanvas(calls),
  });
  // 800x450 at zoom 0.79: about 285 world px above and below the house.
  const drone = b.spawn(15, { affix: null, force: true, x: b.x, y: b.y - 440 });
  Object.assign(drone, {
    speed: 0,
    timer: 999,
    windup: 0.6,
    targetX: b.x + 145,
    targetY: b.y,
  });
  const ringDrawn = () =>
    calls.some(
      ([key, a]) =>
        key === 'arc' &&
        Math.abs(a[0] - 145) < 1e-6 &&
        Math.abs(a[1] - 440) < 1e-6 &&
        a[2] === drone.r + 8,
    );
  b.draw();
  assert.ok(ringDrawn(), 'landing ring beside the house is drawn');
  calls.length = 0;
  drone.windup = 0;
  b.draw();
  assert.ok(!ringDrawn());
  // The same rule, straight: bodies use their drawn reach.
  const view = b.view,
    visible = (x, y, m = 60) =>
      Math.abs(x - view.x) < view.w / 2 + m &&
      Math.abs(y - view.y) < view.h / 2 + m;
  assert.equal(b.onScreen(drone, 0, visible), false, 'idle drone is culled');
  drone.windup = 0.6;
  assert.equal(b.onScreen(drone, 0, visible), true);
  assert.equal(b.onScreen(drone, 0.5, visible), false, 'dying: no ring');
  const boss = {
    ...drone,
    type: 99,
    r: 60,
    windup: 0,
    y: view.y + view.h / 2 + 100,
  };
  assert.equal(b.onScreen(boss, 0, visible), true, 'boss head still shows');
  boss.y += 400;
  assert.equal(b.onScreen(boss, 0, visible), false);
  // A medic's aura circle reaches in from well off screen.
  const medic = b.spawn(0, {
    affix: 'medic',
    force: true,
    x: b.x,
    y: view.y + view.h / 2 + 120,
  });
  medic.speed = 0;
  calls.length = 0;
  b.draw();
  assert.ok(
    calls.some(([key, a]) => key === 'arc' && a[1] === medic.y && a[2] === 150),
    'medic aura drawn',
  );
});

test('Colour-blind mode gives affixed enemies their own distinct palette', () => {
  const Art = require('../.test-build/enemy-art.js');
  const { ELITE_AFFIXES } = require('../.test-build/modes.js');
  const safe = ELITE_AFFIXES.map((a) => Art.affixLook(a, true).color);
  assert.equal(new Set(safe).size, safe.length);
  ELITE_AFFIXES.forEach((a, i) => {
    assert.equal(Art.affixLook(a, false).color, a.color);
    assert.notEqual(safe[i], a.color);
    assert.equal(Art.affixLook(a, true).id, a.id);
  });
  const { b } = battle('battle', {
    options: { settings: { ...M.DEFAULT_SETTINGS, colorblind: true } },
  });
  const medic = b.spawn(0, { affix: 'medic', force: true });
  const index = ELITE_AFFIXES.findIndex((a) => a.id === 'medic');
  assert.equal(b.affixStyle(medic).color, safe[index]);
  b.setSettings(M.DEFAULT_SETTINGS);
  assert.equal(b.affixStyle(medic).color, ELITE_AFFIXES[index].color);
});

test('The boss presentation holds the fight, swallows dash and E, and a tap skips it after half a second', () => {
  const { STAGE_SECONDS } = require('../.test-build/engine.js');
  const { b } = battle('boss', { canvas: fakeCanvas([]) });
  assert.ok(b.holdIntro && b.presenting);
  assert.equal(b.introTotal, STAGE_SECONDS.boss);
  const t0 = b.elapsed;
  assert.equal(b.skipIntro(), true, 'it is on, so the key press is swallowed');
  assert.equal(b.intro, STAGE_SECONDS.boss, 'but too early to skip');
  for (let i = 0; i < 32; i++) b.tick(1 / 60); // just over half a second
  assert.equal(b.elapsed, t0, 'the fight stands still');
  b.dash();
  b.pulse();
  assert.equal(b.dashCd, 0);
  assert.equal(b.pulseCd, 0);
  assert.equal(b.skipIntro(), true);
  assert.ok(b.intro <= 0.3 + 1e-9, 'a skip leaves a short fade');
  for (let i = 0; i < 30; i++) b.tick(1 / 60);
  assert.equal(b.presenting, false);
  assert.equal(b.skipIntro(), false, 'nothing to skip any more');
  const t1 = b.elapsed;
  for (let i = 0; i < 10; i++) b.tick(1 / 60);
  assert.ok(b.elapsed > t1, 'the fight runs');
  b.dash();
  assert.ok(b.dashCd > 0, 'and dash works again');
});

test('Without a canvas (tests, the audit) nothing is held and the old intro time stays', () => {
  const { b } = battle('boss');
  assert.equal(b.holdIntro, false);
  assert.equal(b.presenting, false);
  assert.equal(b.skipIntro(), false);
  const t0 = b.elapsed;
  b.tick(0.1);
  assert.ok(b.elapsed > t0);
});

test('Every boss and mini-boss presentation draws, with a portrait or without, in every setting', () => {
  const { MINIBOSS_PORTRAITS } = require('../.test-build/minibosses.js');
  for (const settings of [
    M.DEFAULT_SETTINGS,
    { ...M.DEFAULT_SETTINGS, colorblind: true, reducedFlashes: true, textScale: 1.3 },
  ])
    for (const kind of ['boss', 'miniboss'])
      for (const chapter of [0, 1, 2]) {
        const styles = [];
        const { b } = battle(kind, { chapter, canvas: fakeCanvas(styles), options: { settings, introQuote: 'Спроба 3. Ви ще не зрозуміли? Я не тримаю вас тут.' } });
        for (const age of [0.05, 0.6, 1.4, 2.2]) {
          while (b.introTotal - b.intro < age) b.tick(1 / 60);
          b.draw();
        }
        assert.ok(b.introCard.hint && b.introCard.hp > 0, `${kind} ${chapter}`);
        assert.ok(!styles.some(([k, v]) => k === 'shadowBlur' && v > 0), 'no shadowBlur');
        if (kind === 'miniboss') {
          const has = MINIBOSS_PORTRAITS.has(`${chapter}-${b.minibossVariant}`);
          assert.equal(b.introCard.portrait !== undefined, has && typeof Image !== 'undefined');
        }
      }
});

test('The tip on the intro card drops the reward line and stays short for every leader', () => {
  const { leaderHint, minibossFor } = require('../.test-build/minibosses.js');
  const { BOSS_VARIANTS } = require('../.test-build/encounters.js');
  assert.equal(leaderHint('Бий збоку. Перемога: предмет і монети.'), 'Бий збоку.');
  assert.equal(leaderHint(''), '');
  const long = 'Слово '.repeat(80) + '.';
  assert.ok(leaderHint(long).length <= 200);
  for (const boss of BOSS_VARIANTS) {
    const hint = leaderHint(boss.guide);
    assert.ok(hint.length > 20 && hint.length <= 200 && !hint.includes('Перемога'), boss.name);
  }
  for (let c = 0; c < 3; c++)
    for (let v = 0; v < 3; v++) {
      const hint = leaderHint(minibossFor(c, v).guide);
      assert.ok(hint.length > 20 && hint.length <= 200 && !hint.includes('Перемога'), minibossFor(c, v).name);
    }
});
