const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../.test-build/model.js');
const C = require('../.test-build/coop.js');
const A = require('../.test-build/achievements.js');
const H = require('../.test-build/heroes.js');
const { Battle } = require('../.test-build/engine.js');

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
afterEach(() => {
  if (realNavigator)
    Object.defineProperty(globalThis, 'navigator', realNavigator);
});
function mockNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}
const silent = {
  play: () => {},
  setLayer: () => {},
  setPaused: () => {},
};
// A profile that has opened every head of ОСББ.
const veteran = () => ({ ...M.initialMeta(), wins: 8 });
function fight(coop, opts = {}) {
  const meta = opts.meta ?? veteran();
  const run = M.makeRun(meta, opts.hero ?? 'mechanic', opts.chapter ?? 0, 5, {
    coop,
  });
  if (opts.kind) run.kind = opts.kind;
  const huds = [];
  const b = new Battle(null, run, meta, silent, (h) => huds.push(h), () => {}, {
    autoPerks: true,
  });
  b.spawnTimer = b.shotTimer = b.droneTimer = 999;
  b.stats.regen = b.stats.thorns = b.stats.orbit = b.stats.drones = 0;
  if (b.ally) b.ally.shotTimer = 999;
  return { b, huds, meta };
}
const step = (b, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) b.update(dt);
};
const key = (b, ...codes) => codes.forEach((c) => b.keys.add(c));

test('The rules of co-op: the partner must be an opened hero, never in the daily run', () => {
  assert.equal(C.coopHero(0, 'mechanic'), 'mechanic');
  assert.equal(C.coopHero(0, 'spark'), '', 'a hero the profile has not opened');
  assert.equal(C.coopHero(8, 'spark'), 'spark');
  for (const bad of [undefined, null, 7, {}, 'nobody', ''])
    assert.equal(C.coopHero(8, bad), '');
  assert.deepEqual(
    C.coopPartners(0).map((c) => c.id),
    ['mechanic'],
  );
  assert.equal(C.coopPartners(8).length, 9);
  const meta = veteran();
  assert.equal(M.makeRun(meta, 'mechanic', 0, 1, { coop: 'flora' }).coop, 'flora');
  assert.equal(M.makeRun(meta, 'mechanic', 0, 1).coop, '');
  assert.equal(M.makeRun(meta, 'mechanic', 0, 1, { coop: 'zzz' }).coop, '');
  assert.equal(M.makeRun(M.initialMeta(), 'mechanic', 0, 1, { coop: 'lev' }).coop, '');
  const daily = M.makeRun(meta, 'mechanic', 0, 1, {
    mode: 'daily',
    daily: '2026-10-28',
    coop: 'flora',
  });
  assert.equal(daily.coop, '', 'the daily ranking is for one player');
  assert.equal(M.makeRun(meta, 'mechanic', 0, 1, { mode: 'endless', coop: 'nina' }).coop, 'nina');
});

test('Two keyboards never share a key, and alone the arrows still drive the house', () => {
  const p1 = Object.values(C.P1_KEYS).flat();
  const p2 = Object.values(C.P2_KEYS).flat();
  assert.deepEqual(
    p1.filter((c) => p2.includes(c)),
    [],
    'no key is owned by both players',
  );
  assert.deepEqual([...C.P2_CODES].sort(), [...p2].sort());
  const solo = C.keyVector(new Set(['ArrowLeft', 'KeyW']), C.SOLO_KEYS);
  assert.deepEqual(solo, { x: -1, y: -1 });
  assert.deepEqual(C.keyVector(new Set(['ArrowLeft', 'KeyW']), C.P1_KEYS), { x: 0, y: -1 });
  assert.deepEqual(C.keyVector(new Set(['ArrowLeft', 'KeyW']), C.P2_KEYS), { x: -1, y: 0 });
  assert.deepEqual(C.keyVector(new Set(['KeyA', 'KeyD']), C.P1_KEYS), { x: 0, y: 0 });
});

test('Co-op fights have more and tougher enemies; the ladder of heat is untouched', () => {
  const heat = { enemyHealth: 1.2, spawnRate: 1.1, enemyDamage: 1.3, bossTime: 0.9 };
  const scaled = C.coopHeat(heat);
  assert.ok(Math.abs(scaled.enemyHealth - 1.2 * C.COOP.enemyHealth) < 1e-9);
  assert.ok(Math.abs(scaled.spawnRate - 1.1 * C.COOP.spawnRate) < 1e-9);
  assert.equal(scaled.enemyDamage, 1.3);
  assert.ok(Math.abs(scaled.bossTime - 0.9 * C.COOP.bossTime) < 1e-9, 'two leaders swing a little less often');
  const solo = fight('').b,
    duo = fight('flora').b;
  assert.equal(solo.ally, null);
  assert.ok(duo.ally);
  assert.ok(Math.abs(duo.heat.enemyHealth / solo.heat.enemyHealth - C.COOP.enemyHealth) < 1e-9);
  assert.ok(duo.squadTotal > solo.squadTotal, 'more enemies are planned for two');
  assert.equal(duo.ally.max, C.allyHealth(duo.mateStats.health), 'the second house is as sturdy as its own build');
  assert.equal(duo.ally.hero, 'flora');
});

test('A revive fills while the house stands close and drains away from it', () => {
  assert.equal(C.reviveStep(0, true, C.COOP.reviveSeconds), 1);
  assert.ok(Math.abs(C.reviveStep(0, true, 1) - 1 / C.COOP.reviveSeconds) < 1e-9);
  assert.ok(C.reviveStep(0.5, false, 1) < 0.5);
  assert.equal(C.reviveStep(0.1, false, 10), 0);
  assert.equal(C.reviveStep(0.9, true, 10), 1);
  // The spread: nothing happens inside the allowed gap, both give way outside.
  assert.deepEqual(C.spreadFix({ x: 0, y: 0 }, { x: 100, y: 50 }), { ax: 0, ay: 0, bx: 0, by: 0 });
  const fix = C.spreadFix({ x: 0, y: 0 }, { x: 1300, y: -700 }, 1200, 500);
  assert.equal(fix.ax, 50);
  assert.equal(fix.bx, -50);
  assert.equal(fix.ay, -100);
  assert.equal(fix.by, 100);
});

test('A co-op run survives a save and a bogus partner is dropped', () => {
  const meta = veteran();
  const run = M.makeRun(meta, 'spark', 0, 7, { coop: 'nina' });
  run.revives = 3;
  const back = M.readSave(M.saveData(meta, run));
  assert.equal(back.run.coop, 'nina');
  assert.equal(back.run.revives, 3);
  const data = JSON.parse(M.saveData(meta, run));
  data.run.coop = 'ghost';
  data.run.revives = 99;
  const dropped = M.readSave(JSON.stringify(data)).run;
  assert.equal(dropped.coop, '');
  assert.equal(dropped.revives, 0, 'revives belong to a co-op run only');
  // A profile that has not opened the hero cannot bring them along.
  const fresh = M.initialMeta();
  const cheat = JSON.parse(M.saveData(fresh, M.makeRun(fresh, 'mechanic', 0, 7)));
  cheat.run.coop = 'lev';
  assert.equal(M.readSave(JSON.stringify(cheat)).run.coop, '');
  // The counters of the profile are clamped like the others.
  const meta2 = { ...meta, coopWins: -4, coopRevives: 'many' };
  const loaded = M.readSave(M.saveData(meta2, null)).meta;
  assert.equal(loaded.coopWins, 0);
  assert.equal(loaded.coopRevives, 0);
  assert.equal(M.initialMeta().coopWins, 0);
});

test('Finishing a co-op raid counts it; a solo raid and a defeat do not', () => {
  const meta = veteran();
  const final = (coop) => {
    const run = M.makeRun(meta, 'mechanic', 2, 3, { coop });
    run.revives = coop ? 2 : 0;
    return run;
  };
  const duo = M.finishRun(meta, final('flora'), true).meta;
  assert.equal(duo.coopWins, 1);
  assert.equal(duo.coopRevives, 2);
  const alone = M.finishRun(meta, final(''), true).meta;
  assert.equal(alone.coopWins, 0);
  assert.equal(alone.coopRevives, 0);
  const lost = M.finishRun(meta, final('flora'), false).meta;
  assert.equal(lost.coopWins, 0, 'only a victory counts as a win');
  assert.equal(lost.coopRevives, 2, 'but a hand given still counts');
  // The achievements follow.
  assert.ok(!A.newAchievements(meta, null).includes('duo'));
  assert.ok(A.newAchievements({ ...meta, coopWins: 1 }, null).includes('duo'));
  assert.ok(duo.achievements.includes('duo'), 'granted at the end of the raid');
  assert.ok(!alone.achievements.includes('duo'));
  assert.ok(!A.newAchievements({ ...meta, coopRevives: 4 }, null).includes('pull_up'));
  assert.ok(A.newAchievements({ ...meta, coopRevives: 5 }, null).includes('pull_up'));
});

test('Alone nothing changed: the arrows drive the house; in co-op they drive the partner', () => {
  const solo = fight('').b;
  const x0 = solo.x;
  key(solo, 'ArrowRight');
  step(solo, 0.5);
  assert.ok(solo.x > x0 + 20, 'arrows still move the house alone');
  const duo = fight('flora').b;
  const home = { x: duo.x, y: duo.y },
    mate = { x: duo.ally.x, y: duo.ally.y };
  key(duo, 'ArrowRight');
  step(duo, 0.5);
  assert.ok(Math.abs(duo.x - home.x) < 1e-6, 'the house stays put');
  assert.ok(duo.ally.x > mate.x + 20, 'the partner walks');
  duo.keys.clear();
  key(duo, 'KeyD');
  const hx = duo.x,
    ax = duo.ally.x;
  step(duo, 0.5);
  assert.ok(duo.x > hx + 20, 'WASD still drives the house');
  assert.ok(Math.abs(duo.ally.x - ax) < 1e-6);
  // The second stick (touch) moves only the partner.
  duo.keys.clear();
  duo.stick2 = { x: 0, y: 1 };
  const ay = duo.ally.y;
  step(duo, 0.3);
  assert.ok(duo.ally.y > ay + 10);
});

test('The partner shoots on their own and is spent like the house when hit', () => {
  const { b } = fight('mechanic');
  b.ally.shotTimer = 0;
  b.spawn(0, { x: b.ally.x + 120, y: b.ally.y, affix: null });
  const e = b.enemies[0];
  e.hp = e.max = 1e5;
  e.speed = 0;
  const before = e.hp;
  step(b, 1);
  assert.ok(e.hp < before, 'the partner’s gun hit the enemy');
  // A touch costs the partner health, not the house.
  const fresh = fight('mechanic').b;
  fresh.ally.invincible = 0;
  const home = fresh.run.hp,
    hp = fresh.ally.hp;
  fresh.spawn(0, { x: fresh.ally.x, y: fresh.ally.y, affix: null });
  fresh.enemies[0].speed = 0;
  fresh.x = 500;
  fresh.y = 700;
  fresh.ally.x = 1000;
  fresh.ally.y = 800;
  fresh.enemies[0].x = 1000;
  fresh.enemies[0].y = 800;
  step(fresh, 0.2);
  assert.ok(fresh.ally.hp < hp, 'the partner was hurt');
  assert.equal(fresh.run.hp, home, 'the house was not');
});

test('Enemies go for the house unless the partner is clearly closer, and ignore the fallen', () => {
  const { b } = fight('mechanic');
  b.x = 300;
  b.y = 300;
  b.ally.x = 1300;
  b.ally.y = 800;
  b.spawn(0, { x: 1250, y: 780, affix: null });
  const near = b.enemies[0];
  assert.equal(b.goalOf(near), b.ally, 'the nearer partner draws the enemy');
  b.spawn(0, { x: 400, y: 300, affix: null });
  assert.equal(b.goalOf(b.enemies[1]), b, 'the house draws the one beside it');
  b.ally.down = true;
  assert.equal(b.goalOf(near), b, 'the fallen are left alone');
  const solo = fight('').b;
  solo.spawn(0, { x: 10, y: 10, affix: null });
  assert.equal(solo.goalOf(solo.enemies[0]), solo);
});

test('A fallen partner is helped up by the house, or gets up alone later', () => {
  const { b } = fight('mechanic');
  b.ally.invincible = 0;
  b.hurtAlly(b.ally.hp + 5, 0.5, 0.2);
  assert.ok(b.ally.down);
  assert.equal(b.ally.hp, 0);
  // A fallen partner cannot act.
  b.allyDash();
  b.allyPulse();
  assert.equal(b.ally.dashCd, 0);
  assert.equal(b.ally.pulseCd, 0);
  const lying = { x: b.ally.x, y: b.ally.y };
  key(b, 'ArrowRight');
  step(b, 0.3);
  assert.deepEqual({ x: b.ally.x, y: b.ally.y }, lying, 'does not walk');
  b.keys.clear();
  // Far away nothing is gained.
  b.x = lying.x + 600;
  b.y = lying.y;
  step(b, 1);
  assert.equal(b.ally.revive, 0);
  // Standing close for long enough raises them with half their health.
  b.x = lying.x + 40;
  b.y = lying.y;
  step(b, C.COOP.reviveSeconds + 0.3);
  assert.ok(!b.ally.down);
  assert.ok(Math.abs(b.ally.hp - b.ally.max * C.COOP.reviveHp) < 2);
  assert.ok(b.ally.invincible > 0, 'a moment of safety after getting up');
  assert.equal(b.run.revives, 1);
  // Alone on the ground they get up after a while, with less, and it is not
  // counted as a hand given.
  b.ally.invincible = 0;
  b.hurtAlly(1e6, 0.1, 0.1);
  b.x = 100;
  b.y = 100;
  b.ally.x = 1200;
  b.ally.y = 800;
  step(b, C.COOP.autoRise - 1);
  assert.ok(b.ally.down);
  step(b, 2);
  assert.ok(!b.ally.down);
  assert.ok(Math.abs(b.ally.hp - b.ally.max * C.COOP.riseHp) < 2);
  assert.equal(b.run.revives, 1);
});

test('The partner’s ability is their own hero’s, cast from where they stand', () => {
  const { b } = fight('mechanic', { hero: 'flora' });
  // Петрович’s quake from the partner: the ring is round them, not the house.
  b.x = 300;
  b.y = 300;
  b.ally.x = 1200;
  b.ally.y = 700;
  b.spawn(0, { x: 1260, y: 700, affix: null });
  b.spawn(0, { x: 360, y: 300, affix: null });
  const [close, far] = b.enemies;
  close.hp = close.max = far.hp = far.max = 1e5;
  close.speed = far.speed = 0;
  const home = { x: b.x, y: b.y, dashCd: b.dashCd, haste: b.hasteTime };
  b.allyPulse();
  assert.ok(close.hp < close.max, 'the enemy beside the partner was hit');
  assert.equal(far.hp, far.max, 'the enemy beside the house was not');
  assert.deepEqual({ x: b.x, y: b.y, dashCd: b.dashCd, haste: b.hasteTime }, home);
  assert.ok(b.ally.pulseCd > 0, 'the partner has a cooldown of their own');
  assert.equal(b.pulseCd, 0, 'the house has not used theirs');
  b.allyPulse();
  assert.ok(b.ally.pulseCd > 0);
  // Express speeds up the one who cast it and refreshes only their dash.
  const duo = fight('danilo').b;
  duo.dashCd = 3;
  duo.ally.dashCd = 3;
  duo.allyPulse();
  assert.equal(duo.ally.dashCd, 0);
  assert.ok(duo.ally.hasteTime > 0);
  assert.equal(duo.dashCd, 3);
  assert.equal(duo.hasteTime, 0);
  // A bloom heals both of them.
  const garden = fight('flora').b;
  garden.run.hp = 10;
  garden.ally.hp = 5;
  garden.allyPulse();
  assert.ok(garden.run.hp > 10);
  assert.ok(garden.ally.hp > 5);
  // The dash makes the partner untouchable for a moment and has its own timer.
  const runner = fight('mechanic').b;
  runner.ally.invincible = 0;
  runner.allyDash();
  assert.ok(runner.ally.invincible >= 0.5);
  assert.ok(runner.ally.dashCd > 0);
  assert.equal(runner.dashCd, 0);
});

test('Pickups go to whoever is closer; kits heal the one who takes them', () => {
  const { b } = fight('mechanic');
  b.x = 200;
  b.y = 200;
  b.ally.x = 1200;
  b.ally.y = 700;
  b.run.hp = 50;
  b.ally.hp = 10;
  b.drops.push({ x: 1210, y: 705, kind: 'heal', value: 20 });
  b.drops.push({ x: 1190, y: 690, kind: 'coin', value: 7 });
  const coins = b.run.coins;
  step(b, 0.2);
  assert.equal(b.run.coins, coins + Math.floor(7 * C.COOP.coins), 'the coin goes into the shared till, at the co-op coin share');
  assert.equal(b.run.hp, 50, 'the kit did not heal the distant house');
  assert.ok(b.ally.hp > 10, 'it healed the one who took it');
  // Crystals still level up the shared build.
  const xp = b.run.xp;
  b.drops.push({ x: 1200, y: 700, kind: 'xp', value: 3 });
  step(b, 0.2);
  assert.ok(b.run.xp > xp || b.run.level > 1);
});

test('Both heroes are kept in one picture', () => {
  const { b } = fight('mechanic');
  b.x = 100;
  b.y = 500;
  b.ally.x = 1500;
  b.ally.y = 500;
  key(b, 'ArrowRight');
  step(b, 0.5);
  assert.ok(Math.abs(b.ally.x - b.x) <= C.COOP.spreadX + 1, `${b.ally.x - b.x}`);
  b.keys.clear();
  key(b, 'KeyW');
  b.y = 900;
  b.ally.y = 100;
  step(b, 0.5);
  assert.ok(Math.abs(b.ally.y - b.y) <= C.COOP.spreadY + 1);
  // Never out of the yard, whatever the push.
  for (const who of [b, b.ally]) {
    assert.ok(who.x >= 55 && who.x <= 1545 && who.y >= 55 && who.y <= 945);
  }
});

test('The second pad drives the partner, the first one the house', () => {
  const pad = () => ({
    connected: true,
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  });
  const one = pad(),
    two = pad();
  mockNavigator({ getGamepads: () => [one, two] });
  const { b } = fight('mechanic');
  b.pollGamepad();
  two.axes = [1, 0];
  one.axes = [0, 1];
  b.pollGamepad();
  assert.deepEqual(b.pad, { x: 0, y: 1 });
  assert.deepEqual(b.pad2, { x: 1, y: 0 });
  // A press on the second pad is the partner's dash and ability.
  two.buttons[0].pressed = true;
  b.pollGamepad();
  assert.ok(b.ally.dashCd > 0);
  assert.equal(b.dashCd, 0);
  assert.equal(b.run.dashes, 0);
  two.buttons[1].pressed = true;
  b.pollGamepad();
  assert.ok(b.ally.pulseCd > 0);
  assert.equal(b.pulseCd, 0);
  // Alone, a second pad is ignored; a single pad is always the first player's.
  const solo = fight('').b;
  solo.pollGamepad();
  assert.deepEqual(solo.pad2, { x: 0, y: 0 });
  mockNavigator({ getGamepads: () => [one] });
  const duo = fight('mechanic').b;
  duo.pollGamepad();
  one.axes = [0, -1];
  duo.pollGamepad();
  assert.deepEqual(duo.pad, { x: 0, y: -1 });
  assert.deepEqual(duo.pad2, { x: 0, y: 0 });
});

test('The HUD tells about the partner only in co-op', () => {
  const { b, huds } = fight('mechanic');
  b.ally.hp = b.ally.max / 2;
  b.pushHud();
  const hud = huds.at(-1);
  assert.ok(hud.ally);
  assert.equal(hud.ally.max, b.ally.max);
  assert.equal(hud.ally.hp, b.ally.max / 2);
  assert.equal(hud.ally.down, false);
  const solo = fight('');
  solo.b.pushHud();
  assert.equal(solo.huds.at(-1).ally, undefined);
});

test('Every hero can be the partner for a whole fight without a crash or a stuck battle', () => {
  for (const hero of ['mechanic', 'spark', 'flora', 'boris', 'nina', 'lev', 'marta', 'danilo', 'solomia']) {
    const { b } = fight(hero, { chapter: 1 });
    b.spawnTimer = 0.2;
    b.keys.add('ArrowRight');
    let ended = false;
    b.onEnd = () => (ended = true);
    for (let t = 0; t < 120 && !b.ended; t += 1 / 30) {
      if (Math.floor(t * 30) % 90 === 0) {
        b.allyPulse();
        b.allyDash();
        b.pulse();
      }
      if (Math.floor(t) % 4 === 0) b.keys.add('ArrowRight');
      else b.keys.add('ArrowLeft');
      if (Math.floor(t) % 4 === 2) b.keys.delete('ArrowRight');
      b.update(1 / 30);
    }
    assert.ok(ended || b.elapsed >= 100, `${hero}: ${b.elapsed}`);
    assert.ok(Number.isFinite(b.ally.x) && Number.isFinite(b.ally.hp), hero);
    assert.ok(b.ally.hp >= 0 && b.ally.hp <= b.ally.max, hero);
  }
  assert.ok(H.heroAbility('mechanic'));
});

test('The partner is a house: drawn on its feet, flickering, and lying down, without a hitch', () => {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, name) => (...args) => {
        calls.push([String(name), args]);
        // The house is painted with gradients.
        return /^create.*Gradient$/.test(String(name)) ? { addColorStop() {} } : undefined;
      },
      set: () => true,
    },
  );
  const { b } = fight('flora');
  b.drawAlly(ctx);
  assert.ok(calls.some(([n]) => n === 'fillText'), 'the plate with the number');
  const standing = calls.length;
  b.ally.muzzle = 0.05;
  b.ally.invincible = 1;
  b.drawAlly(ctx);
  b.downAlly();
  b.ally.revive = 0.4;
  calls.length = 0;
  b.drawAlly(ctx);
  assert.ok(calls.some(([n]) => n === 'arc'), 'the ring of the revive');
  assert.ok(calls.some(([n, a]) => n === 'fillText' && a[0] === 'ПІДНІМИ'));
  assert.ok(standing > 10);
  // Alone there is nobody to draw.
  const solo = fight('').b;
  calls.length = 0;
  solo.drawAlly(ctx);
  assert.equal(calls.length, 0);
});

test('With two guns the floor pays coins in full and crystals by a share, carried over so nothing is lost, and alone it pays in full', () => {
  const solo = fight('').b;
  assert.equal(solo.loot(7, 'coin'), 7);
  assert.equal(solo.loot(3, 'xp'), 3);
  const { b } = fight('mechanic');
  assert.equal(C.COOP.xp, 0.5);
  assert.equal(C.COOP.coins, 1);
  let paid = 0;
  for (let i = 0; i < 100; i++) paid += b.loot(1, 'coin');
  assert.equal(paid, 100, 'coins are worth the whole sum: the till is shared by two houses');
  let xp = 0;
  for (let i = 0; i < 50; i++) xp += b.loot(4, 'xp');
  assert.equal(xp, 100);
  assert.ok(Number.isInteger(b.loot(5, 'coin')));
});

test('What the guest of an online room earns: by fights and by the raid, never negative', () => {
  const G = C.GUEST;
  assert.equal(C.guestFightCores(true, false, 0), G.win);
  assert.equal(C.guestFightCores(true, true, 0), G.win + G.leader);
  assert.equal(C.guestFightCores(true, false, 15 * 10), G.win + G.cap, 'capped');
  assert.equal(C.guestFightCores(false, false, 14), 0);
  assert.equal(C.guestFightCores(false, false, 400), G.lostCap, 'a lost fight pays little');
  assert.equal(C.guestFightCores(true, false, -5), G.win);
  assert.equal(C.guestRunCores(10), 5);
  assert.equal(C.guestRunCores(7), 4, 'rounded up');
  assert.equal(C.guestRunCores(0), 0);
  assert.equal(C.guestRunCores(-3), 0);
});

test('Online every hit leaves a moment more of safety; on one device it does not', () => {
  const lag = { open: true, onMessage: null, onClose: null, send() {}, close() {} };
  const run = M.makeRun(veteran(), 'mechanic', 0, 5, { coop: 'flora' });
  const sync = new (require('../.test-build/net.js').Lockstep)(0, 1, lag, () => ({ x: 0, y: 0 }));
  const online = new Battle(null, run, veteran(), silent, () => {}, () => {}, { sync });
  online.hurt(5, 0.7, 0.1);
  assert.ok(Math.abs(online.invincible - (0.7 + C.COOP.netGrace)) < 1e-9);
  online.ally.invincible = 0;
  online.hurtAlly(3, 0.45, 0.1);
  assert.ok(Math.abs(online.ally.invincible - (0.45 + C.COOP.netGrace)) < 1e-9);
  const local = fight('flora').b;
  local.hurt(5, 0.7, 0.1);
  assert.equal(local.invincible, 0.7);
});

test('With a partner a leader fight has a leader for each of the two and ends with the last one', () => {
  for (const kind of ['boss', 'miniboss']) {
    const solo = fight('', { kind, chapter: 1 }).b;
    solo.spawnTimer = 999;
    step(solo, 0.1);
    const { b } = fight('flora', { kind, chapter: 1 });
    b.spawnTimer = 999;
    step(b, 0.1);
    const leaders = b.enemies.filter((e) => e.max > 100 && (e.type === 99 || e.type === b.enemies[0].type));
    assert.equal(leaders.length, C.COOP.leaders, `${kind}: ${leaders.length} leaders`);
    assert.ok(Math.hypot(leaders[0].x - leaders[1].x, leaders[0].y - leaders[1].y) > 300, 'on opposite sides');
    const hud = b.hud();
    assert.equal(hud.bossMax, leaders[0].max + leaders[1].max, 'the bar adds them up');
    // Alone the same fight has one.
    const alone = solo.enemies.filter((e) => e.type === leaders[0].type);
    assert.equal(alone.length, 1);
    // The first one's fall is only a beat.
    b.damage(leaders[0], 1e9);
    assert.ok(!b.ended, 'the fight goes on with the other one standing');
    assert.equal(b.enemies.filter((e) => e.hp > 0 && e.type === leaders[1].type).length, 1);
    b.damage(leaders[1], 1e9);
    assert.ok(b.ended, 'and ends with the last one');
    assert.equal(b.endReason, 'leader');
  }
});

test('A fight with a partner brings as many more enemies as there are players, as tough as for one', () => {
  assert.equal(C.COOP.players, 2);
  assert.equal(C.COOP.spawnRate, C.COOP.players);
  assert.equal(C.COOP.leaders, C.COOP.players);
  assert.equal(C.COOP.enemyHealth, 1);
  const solo = fight('').b,
    duo = fight('flora').b;
  assert.ok(duo.squadTotal >= solo.squadTotal * 1.6, `${duo.squadTotal} against ${solo.squadTotal}`);
  assert.equal(duo.heat.enemyHealth, solo.heat.enemyHealth);
});

test('Each of the two leaders is a little weaker than a lone one, and solo leaders are untouched', () => {
  const lone = fight('', { kind: 'boss', chapter: 1 }).b,
    pair = fight('flora', { kind: 'boss', chapter: 1 }).b;
  lone.spawnTimer = pair.spawnTimer = 999;
  step(lone, 0.1);
  step(pair, 0.1);
  const biggest = (b) => Math.max(...b.enemies.map((e) => e.max));
  assert.ok(Math.abs(biggest(pair) / biggest(lone) - C.COOP.leaderHealth) < 0.01, `${biggest(pair)} / ${biggest(lone)}`);
  assert.ok(C.COOP.leaderHealth < 1 && C.COOP.bossTime > 1);
});
