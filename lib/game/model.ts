import { ITEMS, ITEM_BY_ID, CHARACTERS, type Stat, type Item } from './data';
import { type PackedItem } from './backpack';
import { loreForProgress } from './lore';
import {
  residentRoster,
  initialHouse,
  restoreResidents,
  residentBonuses,
  canHouse,
  residentSpace,
  type ResidentRoom,
  HOUSE_EXPANSION_COSTS,
} from './residents';
import {
  initialFurniture,
  restoreFurniture,
  furnitureBonuses,
  canFurnish,
  FURNITURE_BY_ID,
  type Furnishing,
} from './furniture';
import {
  sceneUnlocked,
  restoreSceneProgress,
  STORY_REVISION,
} from './cutscenes';
export interface Meta {
  version: 1;
  wins: number;
  runs: number;
  kills: number;
  dashes: number;
  scrapped: number;
  cores: number;
  houseLevel: number;
  best: number;
  unlocked: string[];
  seen: string[];
  research: Record<string, number>;
  sound: boolean;
  lore: string[];
  residents: string[];
  scenesSeen: string[];
  storyRevision: number;
  sceneProgress: { id: string; index: number } | null;
}
export type NodeKind = 'battle' | 'elite' | 'shop' | 'event' | 'rest' | 'boss';
export interface Run {
  research: Record<string, number>;
  seed: number;
  chapter: number;
  character: string;
  step: number;
  nodes: NodeKind[][];
  routeVersion: 2;
  path: number[];
  historyStart: number;
  items: (string | null)[];
  backpack: PackedItem[];
  nextBagId: number;
  residents: ResidentRoom[];
  furniture: Furnishing[];
  nextFurnitureId: number;
  coins: number;
  scrap: number;
  hp: number;
  kills: number;
  dashes: number;
  level: number;
  xp: number;
  time: number;
  page: 'map' | 'combat' | 'shop' | 'event' | 'reward';
  kind: NodeKind;
  offers: string[];
  bought: number[];
  rerolls: number;
  reward: string[];
  eventDone: boolean;
}
export interface Stats extends Record<Stat, number> {
  synergies: string[];
}
export const SAVE_KEY = 'osbb.save.v1';
export function initialMeta(): Meta {
  return {
    version: 1,
    wins: 0,
    runs: 0,
    kills: 0,
    dashes: 0,
    scrapped: 0,
    cores: 0,
    houseLevel: 0,
    best: 0,
    unlocked: ITEMS.filter((i) => i.unlock === 'start').map((i) => i.id),
    seen: [],
    research: { hull: 0, supplies: 0, garage: 0 },
    sound: true,
    lore: loreForProgress([], 0),
    residents: residentRoster([], 0),
    scenesSeen: [],
    storyRevision: STORY_REVISION,
    sceneProgress: null,
  };
}
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function unlock(meta: Meta): string[] {
  const added: string[] = [];
  for (const i of ITEMS) {
    const k = i.unlock;
    const ok =
      k === 'start' ||
      (k.startsWith('win') && meta.wins >= Number(k.slice(3))) ||
      (k === 'kills50' && meta.kills >= 50) ||
      (k === 'kills150' && meta.kills >= 150) ||
      (k === 'dash10' && meta.dashes >= 10) ||
      (k === 'scrap5' && meta.scrapped >= 5);
    if (ok && !meta.unlocked.includes(i.id)) {
      meta.unlocked.push(i.id);
      added.push(i.id);
    }
  }
  return added;
}
export function makeRun(
  meta: Meta,
  character: string,
  chapter: number,
  seed = Date.now(),
): Run {
  const c =
    CHARACTERS.find((c) => c.id === character && c.win <= meta.wins) ??
    CHARACTERS[0];
  const r = seeded(seed);
  const nodes: NodeKind[][] = [
    ['battle'],
    ['battle', 'elite'],
    ['shop', 'event', 'rest'],
    ['battle', 'elite'],
    ['event', 'rest', 'shop'],
    ['battle', 'elite'],
    ['shop', 'rest'],
    ['boss'],
  ];
  if (r() > 0.5) nodes[4] = ['event', 'shop', 'rest'];
  const run: Run = {
    research: { ...meta.research },
    seed: Number.isFinite(seed) ? seed : Date.now(),
    chapter: Math.max(
      0,
      Math.min(
        4,
        meta.wins,
        Math.floor(Number.isFinite(chapter) ? chapter : 0),
      ),
    ),
    character: c.id,
    step: 0,
    nodes,
    routeVersion: 2,
    path: [],
    historyStart: 0,
    items: ['cannon', 'engine', c.start, null, null, null, null, null, null],
    backpack: [],
    nextBagId: 1,
    residents: initialHouse(c.id),
    furniture: initialFurniture(),
    nextFurnitureId: 3,
    coins: 35 + (meta.research.supplies ?? 0) * 8 + (c.id === 'boris' ? 30 : 0),
    scrap: 0,
    hp: 100,
    kills: 0,
    dashes: 0,
    level: 1,
    xp: 0,
    time: 0,
    page: 'map',
    kind: 'battle',
    offers: [],
    bought: [],
    rerolls: 0,
    reward: [],
    eventDone: false,
  };
  run.hp = statsFor(run, meta).health;
  return run;
}
export function statsFor(run: Run, meta: Meta): Stats {
  const research = run.research ?? meta.research;
  const s: Stats = {
    damage: 16 + (research.garage ?? 0) * 3,
    rate: 1.65,
    speed: 155,
    health:
      110 + (research.hull ?? 0) * 10 + (run.character === 'mechanic' ? 15 : 0),
    armor: 0,
    regen: run.character === 'flora' ? 0.8 : 0,
    range: 410,
    crit: 0.05,
    shots: 1,
    chain: 0,
    explosion: 0,
    vampire: 0,
    magnet: 80,
    drones: 0,
    orbit: 0,
    luck: 0,
    thorns: 0,
    synergies: [],
  };
  let rate = run.character === 'spark' ? 0.15 : 0;
  const household = residentBonuses(
    run.residents ?? initialHouse(run.character),
  );
  for (const [key, val] of Object.entries(household.stats)) {
    if (key === 'rate') rate += val;
    else s[key as Stat] += val;
  }
  s.synergies.push(...household.synergies);
  const furnished = furnitureBonuses(
    run.furniture ?? [],
    run.residents ?? initialHouse(run.character),
  );
  for (const [key, value] of Object.entries(furnished.stats)) {
    if (key === 'rate') rate += value;
    else s[key as Stat] += value;
  }
  if (furnished.details.length)
    s.synergies.push(
      `Облаштовані квартири: ${furnished.details.length} предметів`,
    );
  for (const id of run.items) {
    if (!id || !ITEM_BY_ID[id]) continue;
    for (const [key, val] of Object.entries(ITEM_BY_ID[id].stats)) {
      if (key === 'rate') rate += val;
      else s[key as Stat] += val;
    }
  }
  run.items.forEach((id, index) => {
    if (!id) return;
    const neighbors = [
      index % 3 > 0 ? index - 1 : -1,
      index % 3 < 2 ? index + 1 : -1,
      index - 3,
      index + 3,
    ]
      .filter((n) => n >= 0 && n < 9)
      .map((n) => ITEM_BY_ID[run.items[n] ?? ''])
      .filter(Boolean);
    if (id === 'generator') {
      const n = neighbors.filter((i) => i.family === 'electric').length;
      if (n) {
        rate += n * 0.12;
        s.synergies.push(`Електромережа: +${n * 12}% темпу`);
      }
    }
    if (id === 'laundry') {
      const n = neighbors.filter((i) => i.family === 'machine').length;
      if (n) {
        rate += n * 0.08;
        s.synergies.push(`Охолодження: +${n * 8}% темпу`);
      }
    }
    if (id === 'greenhouse') {
      const n = neighbors.filter((i) => i.family === 'organic').length;
      if (n) {
        s.regen += n * 0.5;
        s.synergies.push(`Симбіоз: +${(n * 0.5).toFixed(1)} відновлення`);
      }
    }
  });
  s.rate *= Math.max(0.3, 1 + rate);
  s.damage = Math.max(4, s.damage);
  s.health = Math.max(35, s.health);
  s.speed = Math.max(85, s.speed);
  s.shots = Math.min(7, s.shots);
  s.drones = Math.min(6, s.drones);
  s.orbit = Math.min(8, s.orbit);
  s.crit = Math.min(0.8, s.crit);
  return s;
}
export function offers(
  meta: Meta,
  run: Run,
  count: number,
  salt: number,
  rare = false,
): string[] {
  const rng = seeded(run.seed + run.step * 301 + salt);
  const pool = ITEMS.filter((i) => meta.unlocked.includes(i.id));
  const out: string[] = [];
  for (let j = 0; j < count; j++) {
    const available = pool.filter((i) => !out.includes(i.id));
    if (!available.length) break;
    const weighted = available.flatMap((i) =>
      Array.from(
        {
          length: rare ? [0, 2, 4, 5, 4][i.rarity] : [0, 5, 4, 3, 2][i.rarity],
        },
        () => i,
      ),
    );
    out.push(weighted[Math.floor(rng() * weighted.length)].id);
  }
  return out;
}
export function priceFor(item: Item, run: Run) {
  return Math.round(
    item.price * (run.chapter >= 2 ? 0.95 : 1) * (1 + run.step * 0.035),
  );
}
// Each entry contains the next row's columns reachable from this column.
// Branches split and merge without crossings; every route reaches the boss.
const ROUTE_CONNECTIONS: number[][][] = [
  [[0, 1]],
  [
    [0, 1],
    [1, 2],
  ],
  [[0], [0, 1], [1]],
  [
    [0, 1],
    [1, 2],
  ],
  [[0], [0, 1], [1]],
  [[0, 1], [1]],
  [[0], [0]],
];
export function routeTargets(step: number, column: number): readonly number[] {
  return ROUTE_CONNECTIONS[step]?.[column] ?? [];
}
export function availableColumns(run: Run): readonly number[] {
  if (run.path.length > run.step) return [run.path[run.step]];
  if (run.step === 0) return [0];
  if (run.path.length !== run.step) return [];
  return routeTargets(run.step - 1, run.path[run.step - 1]);
}
export function reachableColumns(run: Run): number[][] {
  const reachable = run.nodes.map(() => [] as number[]);
  reachable[run.step] = [...availableColumns(run)];
  for (let step = run.step + 1; step < run.nodes.length; step++)
    reachable[step] = [
      ...new Set(
        reachable[step - 1].flatMap((col) => [...routeTargets(step - 1, col)]),
      ),
    ];
  return reachable;
}
export function enterNode(run: Run, meta: Meta, nodeId: string): Run {
  const match = /^(\d+):(\d+)$/.exec(nodeId);
  if (!match || run.page !== 'map') return run;
  const step = Number(match[1]),
    column = Number(match[2]);
  if (step !== run.step || !availableColumns(run).includes(column)) return run;
  const kind = run.nodes[step]?.[column];
  if (!kind) return run;
  const next: Run = {
    ...run,
    kind,
    path: [...run.path.slice(0, step), column],
    bought: [],
    rerolls: 0,
    eventDone: false,
  };
  if (kind === 'shop') {
    next.page = 'shop';
    next.offers = offers(meta, run, 4, 41);
  } else if (kind === 'event' || kind === 'rest') {
    next.page = 'event';
  } else next.page = 'combat';
  return next;
}
export function nextNode(run: Run): Run {
  if (
    run.page === 'map' ||
    run.page === 'combat' ||
    run.path.length !== run.step + 1 ||
    run.step >= run.nodes.length - 1
  )
    return run;
  return {
    ...run,
    step: run.step + 1,
    page: 'map',
    offers: [],
    bought: [],
    reward: [],
    eventDone: false,
  };
}
export function equip(run: Run, itemId: string, slot: number, meta: Meta): Run {
  if (
    slot < 0 ||
    slot >= 9 ||
    !ITEM_BY_ID[itemId] ||
    !meta.unlocked.includes(itemId)
  )
    return run;
  const old = statsFor(run, meta).health;
  const next = { ...run, items: [...run.items] };
  next.items[slot] = itemId;
  const health = statsFor(next, meta).health;
  next.hp = Math.max(1, Math.min(health, run.hp + Math.max(0, health - old)));
  return next;
}
export function packItem(run: Run, meta: Meta, id: string): Run {
  if (run.page === 'combat' || !meta.unlocked.includes(id)) return run;
  if (!ITEM_BY_ID[id] || run.backpack.length >= 30) return run;
  const space = { x: 0, y: 0, rotation: 0 };
  return {
    ...run,
    backpack: [...run.backpack, { uid: run.nextBagId, id, ...space }],
    nextBagId: run.nextBagId + 1,
  };
}
export function stowModule(run: Run, meta: Meta, slot: number): Run {
  const id = run.items[slot];
  if (!id || !Number.isInteger(slot)) return run;
  const packed = packItem(run, meta, id);
  if (packed === run) return run;
  const next = { ...packed, items: [...run.items] };
  next.items[slot] = null;
  next.hp = (run.hp * statsFor(next, meta).health) / statsFor(run, meta).health;
  return next;
}
export function installPacked(
  run: Run,
  meta: Meta,
  uid: number,
  slot: number,
): Run {
  if (run.page === 'combat' || !Number.isInteger(slot) || slot < 0 || slot >= 9)
    return run;
  const packed = run.backpack.find((i) => i.uid === uid);
  if (!packed) return run;
  let next = {
    ...run,
    backpack: run.backpack.filter((i) => i.uid !== uid),
    items: [...run.items],
  };
  const old = run.items[slot];
  if (old) {
    const stored = packItem(next, meta, old);
    if (stored === next) return run;
    next = stored;
  }
  next.items[slot] = packed.id;
  next.hp = (run.hp * statsFor(next, meta).health) / statsFor(run, meta).health;
  return next;
}
export function buyFurniture(run: Run, id: string): Run {
  const item = FURNITURE_BY_ID[id];
  if (
    !item ||
    run.page === 'combat' ||
    run.coins < item.cost ||
    run.furniture.length >= 30 ||
    !Number.isInteger(run.nextFurnitureId) ||
    run.nextFurnitureId < 1 ||
    run.nextFurnitureId > 1e8 ||
    run.furniture.some((f) => f.uid === run.nextFurnitureId)
  )
    return run;
  return {
    ...run,
    coins: run.coins - item.cost,
    nextFurnitureId: run.nextFurnitureId + 1,
    furniture: [
      ...run.furniture,
      { uid: run.nextFurnitureId, id, resident: null, cell: null },
    ],
  };
}
export function installFurniture(
  run: Run,
  meta: Meta,
  uid: number,
  resident: string,
  cell: number,
): Run {
  if (
    run.page === 'combat' ||
    !canFurnish(run.furniture, run.residents, uid, resident, cell)
  )
    return run;
  const next = {
    ...run,
    furniture: run.furniture.map((item) =>
      item.uid === uid ? { ...item, resident, cell } : item,
    ),
  };
  next.hp = (run.hp * statsFor(next, meta).health) / statsFor(run, meta).health;
  return next;
}
export function removeFurniture(run: Run, meta: Meta, uid: number): Run {
  if (
    run.page === 'combat' ||
    !run.furniture.some((item) => item.uid === uid && item.resident !== null)
  )
    return run;
  const next = {
    ...run,
    furniture: run.furniture.map((item) =>
      item.uid === uid ? { ...item, resident: null, cell: null } : item,
    ),
  };
  next.hp = (run.hp * statsFor(next, meta).health) / statsFor(run, meta).health;
  return next;
}
export function expandHouse(meta: Meta, run: Run | null): Meta {
  const cost = HOUSE_EXPANSION_COSTS[meta.houseLevel];
  if (run?.page === 'combat' || cost === undefined || meta.cores < cost)
    return meta;
  return { ...meta, cores: meta.cores - cost, houseLevel: meta.houseLevel + 1 };
}
export function houseResident(run: Run, meta: Meta, room: ResidentRoom): Run {
  if (
    run.page === 'combat' ||
    !meta.residents.includes(room.id) ||
    !canHouse(run.residents, room, meta.houseLevel)
  )
    return run;
  const next = {
    ...run,
    residents: run.residents.some((r) => r.id === room.id)
      ? run.residents.map((r) => (r.id === room.id ? room : r))
      : [...run.residents, room],
  };
  next.hp = (run.hp * statsFor(next, meta).health) / statsFor(run, meta).health;
  return next;
}
export function reserveResident(run: Run, meta: Meta, id: string): Run {
  if (
    run.page === 'combat' ||
    id === run.character ||
    !run.residents.some((r) => r.id === id)
  )
    return run;
  const next = {
    ...run,
    residents: run.residents.filter((r) => r.id !== id),
    furniture: run.furniture.map((item) =>
      item.resident === id ? { ...item, resident: null, cell: null } : item,
    ),
  };
  next.hp = (run.hp * statsFor(next, meta).health) / statsFor(run, meta).health;
  return next;
}
export function rescueResident(
  run: Run,
  meta: Meta,
): { run: Run; meta: Meta; id: string } | null {
  if (run.page !== 'event' || run.kind !== 'event' || run.eventDone)
    return null;
  const id = ['marta', 'danilo', 'solomia'].find(
    (id) => !meta.residents.includes(id),
  );
  if (!id) return null;
  const nextMeta = { ...meta, residents: [...meta.residents, id] };
  const room = residentSpace(run.residents, id, meta.houseLevel);
  const next = room ? houseResident(run, nextMeta, room) : run;
  return { run: { ...next, eventDone: true }, meta: nextMeta, id };
}
export function finishRun(
  meta: Meta,
  run: Run,
  won: boolean,
): { meta: Meta; unlocks: string[]; cores: number } {
  const n: Meta = {
    ...meta,
    unlocked: [...meta.unlocked],
    research: { ...meta.research },
    seen: [
      ...new Set([
        ...meta.seen,
        ...run.items.filter((x): x is string => !!x),
        ...run.backpack.map((i) => i.id),
      ]),
    ],
  };
  n.runs++;
  n.kills += run.kills;
  n.dashes += run.dashes;
  n.best = Math.max(n.best, run.kills);
  if (won && run.chapter === Math.min(meta.wins, 4))
    n.wins = Math.min(5, n.wins + 1);
  const cores = Math.floor(run.kills / 18) + (won ? 6 + run.chapter * 2 : 0);
  n.cores += cores;
  n.lore = loreForProgress(meta.lore, n.wins, run.chapter);
  n.residents = residentRoster(meta.residents, n.wins);
  return { meta: n, unlocks: unlock(n), cores };
}
function finite(n: unknown, min: number, max: number, fallback: number) {
  return typeof n === 'number' && Number.isFinite(n)
    ? Math.max(min, Math.min(max, n))
    : fallback;
}
function restoreRoute(run: Run, saved: Record<string, unknown>) {
  const path = saved.path;
  const active =
    saved.page !== 'map' ||
    (Array.isArray(path) && path.length === run.step + 1);
  const count = run.step + (active ? 1 : 0);
  const valid =
    saved.routeVersion === 2 &&
    Array.isArray(path) &&
    path.length === count &&
    path.every(
      (col, step) =>
        Number.isInteger(col) &&
        !!run.nodes[step]?.[col] &&
        (step === 0
          ? col === 0
          : routeTargets(step - 1, path[step - 1]).includes(col)),
    ) &&
    (!active || run.nodes[run.step][path[run.step]] === saved.kind);
  if (valid) {
    run.path = [...path];
    run.historyStart = Math.floor(finite(saved.historyStart, 0, run.step, 0));
  } else {
    // Old saves did not record choices. Reconstruct a legal prefix ending at
    // the saved room, but do not present inferred past rooms as visited.
    let candidates: number[][] = [[]];
    for (let step = 0; step < count; step++)
      candidates = candidates.flatMap((prefix) =>
        (step === 0 ? [0] : routeTargets(step - 1, prefix[step - 1])).map(
          (col) => [...prefix, col],
        ),
      );
    run.path =
      candidates.find(
        (p) => run.nodes[count - 1]?.[p[count - 1]] === saved.kind,
      ) ??
      candidates[0] ??
      [];
    run.historyStart = run.step;
  }
  if (count) run.kind = run.nodes[count - 1][run.path[count - 1]];
}
export function readSave(raw: string | null): {
  meta: Meta;
  run: Run | null;
  error?: boolean;
} {
  const base = initialMeta();
  if (!raw) return { meta: base, run: null };
  try {
    const o = JSON.parse(raw);
    if (o.version !== 1 || !o.meta) throw Error('save version');
    const m = o.meta;
    for (const k of [
      'wins',
      'runs',
      'kills',
      'dashes',
      'scrapped',
      'cores',
      'best',
    ] as const)
      base[k] = Math.floor(finite(m[k], 0, k === 'wins' ? 5 : 1e8, 0));
    base.sound = m.sound !== false;
    base.houseLevel = Math.floor(finite(m.houseLevel, 0, 3, 0));
    base.seen = Array.isArray(m.seen)
      ? m.seen.filter((id: unknown) => typeof id === 'string' && ITEM_BY_ID[id])
      : [];
    for (const k of ['hull', 'supplies', 'garage'])
      base.research[k] = Math.floor(finite(m.research?.[k], 0, 5, 0));
    unlock(base);
    base.lore = loreForProgress(Array.isArray(m.lore) ? m.lore : [], base.wins);
    base.residents = residentRoster(m.residents, base.wins);
    base.scenesSeen = Array.isArray(m.scenesSeen)
      ? [
          ...new Set<string>(
            m.scenesSeen.filter(
              (id: unknown) =>
                typeof id === 'string' && sceneUnlocked(id, base.wins),
            ),
          ),
        ]
      : [];
    base.sceneProgress = restoreSceneProgress(m.sceneProgress, base.wins);
    if (m.storyRevision !== STORY_REVISION) {
      base.scenesSeen = base.scenesSeen.filter((id) => id !== 'prologue');
      base.sceneProgress = { id: 'prologue', index: 0 };
    }
    let run: Run | null = null;
    const r = o.run;
    if (
      r &&
      typeof r.seed === 'number' &&
      Number.isFinite(r.seed) &&
      Array.isArray(r.items) &&
      r.items.length === 9 &&
      Number.isInteger(r.step) &&
      r.step >= 0 &&
      r.step < 8
    ) {
      run = makeRun(
        base,
        r.character,
        Math.floor(finite(r.chapter, 0, Math.min(base.wins, 4), 0)),
        r.seed,
      );
      if (r.research)
        for (const key of ['hull', 'supplies', 'garage'])
          run.research[key] = Math.floor(
            finite(r.research[key], 0, base.research[key], 0),
          );
      run.items = r.items.map((id: unknown) =>
        typeof id === 'string' && base.unlocked.includes(id) ? id : null,
      );
      // v0.2 module shapes remain readable; the storage list no longer uses geometry.
      const bag = Array.isArray(r.backpack) ? r.backpack : [];
      const uids = new Set<number>();
      run.backpack = bag
        .filter(
          (i: PackedItem) =>
            i &&
            base.unlocked.includes(i.id) &&
            Number.isInteger(i.uid) &&
            i.uid <= 1e8 &&
            i.uid > 0 &&
            !uids.has(i.uid) &&
            (uids.add(i.uid), true),
        )
        .slice(0, 30)
        .map((i: PackedItem) => ({
          uid: i.uid,
          id: i.id,
          x: finite(i.x, 0, 5, 0),
          y: finite(i.y, 0, 4, 0),
          rotation: Math.floor(finite(i.rotation, 0, 3, 0)),
        }));
      run.residents = restoreResidents(
        r.residents,
        base.residents,
        run.character,
        base.houseLevel,
      );
      run.furniture = restoreFurniture(r.furniture, run.residents);
      run.nextFurnitureId = Math.max(
        Math.floor(finite(r.nextFurnitureId, 1, 1e8, 3)),
        ...run.furniture.map((item) => item.uid + 1),
      );
      run.nextBagId = Math.max(
        Math.floor(finite(r.nextBagId, 1, 1e8, 1)),
        ...run.backpack.map((i) => i.uid + 1),
      );
      for (const k of [
        'coins',
        'scrap',
        'kills',
        'dashes',
        'level',
        'xp',
        'time',
      ] as const)
        run[k] = finite(r[k], 0, 1e7, k === 'level' ? 1 : 0);
      run.hp = finite(
        r.hp,
        1,
        statsFor(run, base).health,
        statsFor(run, base).health,
      );
      run.step = r.step;
      restoreRoute(run, r);
      run.page = ['map', 'shop', 'event', 'reward'].includes(r.page)
        ? r.page
        : 'map';
      run.offers = Array.isArray(r.offers)
        ? r.offers
            .filter((id: string) => base.unlocked.includes(id))
            .slice(0, 4)
        : [];
      run.reward = Array.isArray(r.reward)
        ? r.reward
            .filter((id: string) => base.unlocked.includes(id))
            .slice(0, 3)
        : [];
      run.bought = Array.isArray(r.bought)
        ? r.bought.filter((n: number) => Number.isInteger(n) && n >= 0 && n < 4)
        : [];
      run.rerolls = finite(r.rerolls, 0, 50, 0);
      run.eventDone = !!r.eventDone;
      base.lore = loreForProgress(base.lore, base.wins, run.chapter);
    }
    return { meta: base, run };
  } catch {
    return { meta: base, run: null, error: true };
  }
}
export function saveData(meta: Meta, run: Run | null) {
  return JSON.stringify({ version: 1, meta, run });
}
