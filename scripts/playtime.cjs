// How long the game takes: a bot plays from a fresh profile, raid after raid,
// the way a person does (the map, the fights, the finds, the shop, the events,
// the workshop between raids), until its first full win, and the clock counts
// the fights (simulated seconds) and the screens between them (an estimate of
// how long a person spends on each, OFF below).
//   npm test                         (once: .test-build)
//   node scripts/playtime.cjs [pilot] [profiles]
// pilot: reactive (keeps its distance, steps out of zones, dashes: a player who
// pays attention), circle (walks a fixed circle, no perception: a careless
// one), idle (never moves). See scripts/pilots.cjs.
// Env: MAX_RAIDS (80), ONLY_FIRST=1 (stop at the first win), TRACE=1 (every
// fight), and the proposed purchases BONUS, REVIVE, HEAT_START (below). The
// numbers and what they mean: docs/finmodel.md, docs/balance/2026-11-11-playtime.md.
const M = require('../.test-build/model.js');
const P = require('../.test-build/progression.js');
const E = require('../.test-build/equipment.js');
const D = require('../.test-build/data.js');
const { Battle } = require('../.test-build/engine.js');
const { play } = require('./pilots.cjs');

const PILOT = process.argv[2] || 'reactive';
const PROFILES = Number(process.argv[3]) || 8;
const MAX_RAIDS = Number(process.env.MAX_RAIDS) || 80;
// BONUS=0.5: a paid boost that adds half again to the cores of every raid (the
// proposed "coffee" purchase, docs/finmodel.md), to see how much sooner the
// goals come.
const BONUS = Number(process.env.BONUS) || 0;
// REVIVE=1: the other proposed purchase, a spare generator: once a raid the
// fallen house gets up again with half its health. Not in the game: the bot
// only measures what it would change.
const REVIVE = Number(process.env.REVIVE) || 0;
// HEAT_START=5: the third, a pass up the heat ladder: the career starts at heat
// 5 instead of 0 (the skill to win there is not for sale).
const HEAT_START = Number(process.env.HEAT_START) || 0;
const silent = { play() {}, setLayer() {}, setPaused() {}, unlock() {} };

// Seconds a person spends on each screen off the arena (estimates, not
// measured): reading, choosing, placing.
const OFF = {
  raidStart: 45, // hero, heat, the starting module
  map: 10, // looking at the fork, choosing
  reward: 20, // reading three cards, taking one, placing it
  chest: 10,
  shop: 45,
  event: 35, // reading the event and its choices
  perk: 8, // a level-up draft
  location: 60, // a scene and the new map of the next location
  raidEnd: 60, // the result, the workshop
  fightIntro: 6, // boss and miniboss presentation, outro of every fight
};

function freeSlot(run) {
  return E.equipmentTargets(run).find(
    (t) => E.canEquipAt(run, t.slot) && !run.items[t.slot],
  );
}
// A find taken from a reward or bought: into a free place of a flat, else into
// the backpack.
function take(run, meta, id) {
  const slot = freeSlot(run);
  let next = slot ? M.equip(run, id, slot.slot, meta) : run;
  if (next === run) next = M.packItem(run, meta, id);
  return next;
}
function learn(meta, id) {
  return meta.unlocked.includes(id)
    ? meta
    : { ...meta, unlocked: [...meta.unlocked, id], seen: [...new Set([...meta.seen, id])] };
}
// The workshop between raids: the cheapest thing the cores can buy, again and
// again (research first: it changes every raid).
function shopWorkshop(meta) {
  for (;;) {
    const options = [
      ...D.RESEARCH.map((r) => ({ cost: r.cost, buy: () => P.buyResearch(meta, r.id) })),
      ...P.BLUEPRINTS.map((b) => ({ cost: b.cost, buy: () => P.buyBlueprint(meta, b.id) })),
    ].sort((a, b) => a.cost - b.cost);
    let bought = false;
    for (const o of options) {
      const next = o.buy();
      if (next !== meta) {
        meta = next;
        bought = true;
        break;
      }
    }
    if (!bought) return meta;
  }
}

function raid(meta, seed, hero = 'mechanic', heat = 0, log) {
  let run = M.makeRun(meta, hero, 0, seed, { heat });
  const t = { fight: 0, off: OFF.raidStart, fights: 0, nodes: 0, revives: REVIVE };
  // The starting module: the first of the draft.
  if (run.draft?.length) {
    const id = run.draft[0];
    run = M.skipDraft(take(run, meta, id));
    meta = learn(meta, id);
  }
  for (let guard = 0; guard < 400; guard++) {
    if (run.page === 'map') {
      const cols = M.availableColumns(run);
      // A person looks for variety: alternate the first and the last way.
      const col = cols[(run.step + seed) % cols.length];
      run = M.enterNode(run, meta, `${run.step}:${col}`);
      t.off += OFF.map;
      t.nodes++;
      continue;
    }
    if (run.page === 'combat') {
      let res = null;
      const b = new Battle(null, run, meta, silent, () => {}, (r) => (res = r), {
        autoPerks: true,
        onLevelUp: () => (t.off += OFF.perk),
      });
      b.spawnTimer = b.spawnTimer ?? 0;
      if (t.revives > 0) {
        const finish = b.finish.bind(b);
        b.finish = (won) => {
          if (!won && b.endReason === 'lost' && t.revives > 0) {
            t.revives--;
            b.run.hp = b.stats.health * 0.5;
            b.endReason = null;
            return;
          }
          finish(won);
        };
      }
      play(b, PILOT, { seed: seed + t.fights, dt: 1 / 30, limit: 400 });
      t.fight += b.elapsed;
      t.fights++;
      if (process.env.TRACE)
        console.log(`  ${run.chapter + 1}:${run.step + 1} ${run.kind} ${b.elapsed.toFixed(0)}s ${b.endReason} hp ${Math.round(b.run.hp)}/${Math.round(b.stats.health)} lvl ${b.run.level} kills ${b.run.kills}`);
      if (run.kind === 'boss' || run.kind === 'miniboss') t.off += OFF.fightIntro;
      if (!res) res = { run: b.run, won: false, boss: run.kind === 'boss' };
      if (!res.won) {
        const f = M.finishRun(meta, res.run, false);
        return { meta: f.meta, won: false, t, depth: `${res.run.chapter + 1}:${res.run.step + 1}`, cores: f.cores };
      }
      const gate = res.boss && res.run.step === res.run.nodes.length - 1;
      if (gate) {
        if (M.isFinalVictory(res.run)) {
          const f = M.finishRun(meta, res.run, true);
          return { meta: f.meta, won: true, t, depth: 'win', cores: f.cores };
        }
        run = M.advanceLocation(res.run, meta);
        t.off += OFF.location;
        continue;
      }
      run = M.battleRewards(res.run, meta);
      continue;
    }
    if (run.page === 'reward') {
      const mod = run.loot.findIndex((l) => l.kind === 'module');
      const furn = run.loot.findIndex((l) => l.kind === 'furniture');
      t.off += run.kind === 'chest' ? OFF.chest : OFF.reward;
      if (mod >= 0) {
        const id = run.loot[mod].id;
        const next = take(run, meta, id);
        meta = learn(meta, id);
        run = M.settleReward(next === run ? run : next, 'host', id);
      } else if (furn >= 0) {
        const next = M.claimFurniture(run, furn);
        run = next === run ? M.nextNode(run) : next;
      } else run = M.nextNode(run);
      if (run.page === 'reward' && run.mateLoot?.length === 0 && run.loot.length === 0)
        run = M.nextNode(run);
      continue;
    }
    if (run.page === 'shop') {
      t.off += OFF.shop;
      // Repair when below half, then the first module the till can pay for.
      const max = M.statsFor(run, meta).health;
      if (run.hp < max * 0.5) run = M.repairShop(run, meta);
      const i = run.offers.findIndex(
        (id, n) => !run.bought.includes(n) && run.coins >= M.priceFor(D.ITEM_BY_ID[id], run),
      );
      if (i >= 0) {
        const id = run.offers[i];
        const next = take(run, meta, id);
        if (next !== run)
          run = { ...next, coins: next.coins - M.priceFor(D.ITEM_BY_ID[id], run), bought: [...next.bought, i] };
        meta = learn(meta, id);
      }
      run = M.nextNode(run);
      continue;
    }
    if (run.page === 'event') {
      t.off += OFF.event;
      const cols = M.eventColumns(run, meta);
      const next = cols.length ? M.resolveEvent(run, meta, cols[0]) : run;
      run = next.page === 'event' || next === run ? M.nextNode(next) : next;
      continue;
    }
    log?.('stuck on page', run.page);
    break;
  }
  return { meta, won: false, t, depth: 'stuck' };
}

// One player's career: raid after raid. The hero is the first open one that
// has no win yet (every win opens one more and tells its epilogue), the heat
// climbs one step after each win (a win at heat h opens h + 1). It stops when
// every goal is reached or after MAX_RAIDS raids.
const GOALS = {
  firstWin: 'перша перемога',
  allHeroes: 'усі 9 героїв відкрито (8 перемог)',
  epilogues: 'перемога кожним героєм (9 епілогів)',
  heat10: 'перемога на складності 10',
};
function profile(n) {
  let meta = { ...M.initialMeta(), tutorialDone: true };
  const raids = [];
  const at = {};
  let clock = 0,
    heat = HEAT_START;
  for (let r = 0; r < MAX_RAIDS; r++) {
    const open = D.CHARACTERS.filter((c) => c.win <= (meta.wins ?? 0));
    const hero =
      open.find((c) => !(meta.winsByCharacter?.[c.id] > 0))?.id ?? open.at(-1).id;
    const seed = 1000 * (n + 1) + r * 7919;
    const out = raid(meta, seed, hero, heat);
    meta = out.meta;
    if (BONUS && out.cores) meta = { ...meta, cores: meta.cores + Math.round(out.cores * BONUS) };
    const spent = out.t.fight + out.t.off + OFF.raidEnd;
    clock += spent;
    raids.push({ won: out.won, depth: out.depth, fight: out.t.fight, off: out.t.off + OFF.raidEnd, heat, hero });
    if (out.won) heat = Math.min(10, heat + 1, M.heatChoices ? 10 : 10);
    meta = shopWorkshop(meta);
    const wins = raids.filter((x) => x.won).length;
    if (out.won && at.firstWin === undefined) at.firstWin = { h: clock / 3600, raids: r + 1 };
    if (wins >= 8 && at.allHeroes === undefined) at.allHeroes = { h: clock / 3600, raids: r + 1 };
    if (D.CHARACTERS.every((c) => meta.winsByCharacter?.[c.id] > 0) && at.epilogues === undefined)
      at.epilogues = { h: clock / 3600, raids: r + 1 };
    if (out.won && raids.at(-1).heat >= 10 && at.heat10 === undefined) at.heat10 = { h: clock / 3600, raids: r + 1 };
    if (Object.keys(GOALS).every((g) => at[g])) break;
    if (process.env.ONLY_FIRST && at.firstWin) break;
  }
  const fight = raids.reduce((sum, x) => sum + x.fight, 0),
    total = clock;
  return { raids, fight, total, at };
}

const results = [];
for (let n = 0; n < PROFILES; n++) {
  const p = profile(n);
  results.push(p);
  console.log(
    `profile ${n + 1}: ${p.raids.length} raids, ${(p.total / 3600).toFixed(1)} h (fights ${Math.round((100 * p.fight) / p.total)}%) | ` +
      Object.keys(GOALS).map((g) => `${g} ${p.at[g] ? p.at[g].h.toFixed(1) + 'h/' + p.at[g].raids : '-'}`).join(' | ') +
      ` | heats won ${p.raids.filter((x) => x.won).map((x) => x.heat).join(',')}`,
  );
}
const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
};
const summary = { pilot: PILOT, profiles: PROFILES, maxRaids: MAX_RAIDS, bonus: BONUS, revive: REVIVE, heatStart: HEAT_START };
for (const g of Object.keys(GOALS)) {
  const hit = results.filter((r) => r.at[g]);
  summary[g] = {
    reached: `${hit.length}/${PROFILES}`,
    hoursMedian: hit.length ? +median(hit.map((r) => r.at[g].h)).toFixed(1) : null,
    hoursMin: hit.length ? +Math.min(...hit.map((r) => r.at[g].h)).toFixed(1) : null,
    hoursMax: hit.length ? +Math.max(...hit.map((r) => r.at[g].h)).toFixed(1) : null,
    raidsMedian: hit.length ? median(hit.map((r) => r.at[g].raids)) : null,
  };
}
const all = results.flatMap((r) => r.raids);
summary.raidMinutes = {
  won: +(all.filter((x) => x.won).reduce((s, x) => s + x.fight + x.off, 0) / Math.max(1, all.filter((x) => x.won).length) / 60).toFixed(0),
  lost: +(all.filter((x) => !x.won).reduce((s, x) => s + x.fight + x.off, 0) / Math.max(1, all.filter((x) => !x.won).length) / 60).toFixed(0),
};
summary.winRateByHeat = Object.fromEntries(
  [...new Set(all.map((x) => x.heat))].sort((a, b) => a - b).map((h) => {
    const at = all.filter((x) => x.heat === h);
    return [h, `${at.filter((x) => x.won).length}/${at.length}`];
  }),
);
console.log(JSON.stringify(summary));
