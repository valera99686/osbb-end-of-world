import { specialEffects } from './specials';
import {
  BLUEPRINTS,
  BLUEPRINT_BY_ID,
  blueprintReady,
  blueprintPool,
} from './progression';
import { CAMPAIGN_EVENTS, type EventEffect } from './campaign-content';
import {
  apartmentEffects,
  linkedIds,
  planRoomMove,
  restoreRoomLinks,
  restoreRoomModes,
  roomsTouch,
  type RoomLink,
  type RoomMode,
} from './apartments';
import { RESIDENTS, RESIDENT_BY_ID } from './residents';
import { FURNITURE } from './furniture';
import {
  APARTMENT_SLOTS,
  STORAGE_LIMIT,
  RESTORED_STORAGE_LIMIT,
  apartmentSlot,
  equipmentTargets,
  canEquipAt,
  activeEquipment,
  emptyEquipment,
} from './equipment';
import {
  ITEMS,
  ITEM_BY_ID,
  RESEARCH,
  CHARACTERS,
  type Stat,
  type Item,
} from './data';
import { type PackedItem } from './backpack';
import { loreForProgress } from './lore';
import {
  residentRoster,
  initialHouse,
  restoreResidents,
  residentBonuses,
  residentSpace,
  type ResidentRoom,
  HOUSE_EXPANSION_COSTS,
} from './residents';
import {
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
  blueprints: string[];
  totalBosses: number;
  totalMinibosses: number;
  totalRescues: number;
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
export type NodeKind =
  | 'battle'
  | 'elite'
  | 'miniboss'
  | 'shop'
  | 'event'
  | 'rest'
  | 'boss'
  | 'mystery'
  | 'chest';
export interface Loot {
  kind: 'module' | 'furniture';
  id: string;
}
export interface Run {
  blueprints: string[];
  minibossKills: number;
  research: Record<string, number>;
  seed: number;
  chapter: number;
  character: string;
  step: number;
  nodes: NodeKind[][];
  routeVersion: 2 | 3 | 4 | 5 | 6 | 7 | 8;
  campaignVersion: 1;
  bossVariants: number[];
  minibossVariants: Record<string, number>;
  houseLevel: number;
  rescued: string[];
  battlesSinceRescue: number;
  battleCount: number;
  bossesDefeated: number;
  revealed: Record<string, NodeKind>;
  loot: Loot[];
  shopFurniture: string[];
  repairUsed: boolean;
  eventResult: string;
  path: number[];
  historyStart: number;
  equipmentLayout: 1;
  items: (string | null)[];
  backpack: PackedItem[];
  nextBagId: number;
  residents: ResidentRoom[];
  roomLinks: RoomLink[];
  roomModes: Record<string, RoomMode>;
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
  housing: ReturnType<typeof apartmentEffects>;
}
export const SAVE_KEY = 'osbb.save.v1';
export function legacyTree(seed: number): NodeKind[][] {
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
  if (seeded(seed)() > 0.5) nodes[4] = ['event', 'shop', 'rest'];
  return nodes;
}
// Frozen generator: an in-progress v0.5.0 encounter must survive reloading.
export function previousCampaignTree(
  seed: number,
  chapter: number,
): NodeKind[][] {
  const rng = seeded(seed + chapter * 100003 + 81);
  const pool: NodeKind[] = [
    'battle',
    'battle',
    'elite',
    'event',
    'mystery',
    'chest',
  ];
  return [1, 3, 4, 3, 4, 4, 3, 4, 4, 3, 3, 1].map((width, row) =>
    row === 0
      ? ['battle']
      : row === 11
        ? ['boss']
        : row === 4
          ? ['shop', 'rest', 'shop', 'event']
          : row === 10
            ? ['rest', 'shop', 'rest']
            : row % 2 === 1
              ? Array.from({ length: width }, (_, col) =>
                  col === 1 ? 'elite' : 'battle',
                )
              : Array.from({ length: width }, (_, col) =>
                  row === 2 && col === 0
                    ? 'chest'
                    : row === 2 && col === 3
                      ? 'mystery'
                      : pool[Math.floor(rng() * pool.length)],
                ),
  );
}
export function compactCampaignTree(
  seed: number,
  chapter: number,
): NodeKind[][] {
  const rng = seeded(seed + chapter * 100003 + 417);
  const shuffle = (rooms: NodeKind[]) => {
    const result = [...rooms];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const discovery = (): NodeKind => (rng() < 0.5 ? 'event' : 'mystery');
  const first = shuffle(['battle', 'event']);
  const second = shuffle([
    'battle',
    rng() < 0.35 + chapter * 0.2 ? 'elite' : 'event',
  ]);
  return [
    ['battle'],
    // The central option is reachable from either side of the preceding fork.
    [first[0], 'mystery', first[1]],
    [second[0], 'chest', second[1]],
    shuffle(['battle', 'elite']),
    shuffle(['shop', 'rest', discovery()]),
    shuffle(['battle', 'elite']),
    shuffle(['mystery', 'chest', 'event']),
    shuffle(['battle', 'elite']),
    shuffle(['rest', 'shop', discovery()]),
    ['boss'],
  ];
}
export function wideCampaignTree(seed: number, chapter: number): NodeKind[][] {
  const rng = seeded(seed + chapter * 100003 + 1705);
  const shuffle = <T>(values: T[]): T[] => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const widths = shuffle([3, 3, 4, 4, 5, 5, 6, 6]);
  const combatRows = new Set(shuffle([2, 3, 4, 5, 6, 7]).slice(0, 3));
  const supportRows = [1, 2, 3, 4, 5, 6, 7, 8].filter(
    (row) => !combatRows.has(row),
  );
  const mysteryRows = new Set(shuffle(supportRows).slice(0, 2));
  const chestRows = new Set(
    shuffle(supportRows.filter((row) => row > 1)).slice(0, 2),
  );
  const shopRow = shuffle(supportRows.filter((row) => row >= 3 && row <= 6))[0];
  const nodes: NodeKind[][] = [['battle']];
  widths.forEach((width, i) => {
    const row = i + 1;
    const rooms: NodeKind[] = combatRows.has(row)
      ? ['battle', 'elite', 'mystery']
      : [];
    if (mysteryRows.has(row)) rooms.push('mystery');
    if (chestRows.has(row)) rooms.push('chest');
    if (row === shopRow) rooms.push('shop');
    if (row === 8) rooms.push('rest');
    const pool: NodeKind[] = combatRows.has(row)
      ? [
          'battle',
          'battle',
          'elite',
          ...(chapter > 0 ? ['elite' as const] : []),
        ]
      : ['battle', 'event', 'mystery'];
    while (rooms.length < width) {
      const missing = pool.filter((kind) => !rooms.includes(kind));
      const choices = missing.length ? missing : pool;
      rooms.push(choices[Math.floor(rng() * choices.length)]);
    }
    nodes.push(shuffle(rooms));
  });
  nodes.push(['boss']);
  return nodes;
}
export function previousRandomCampaignTree(
  seed: number,
  chapter: number,
): NodeKind[][] {
  const widthRng = seeded(seed + chapter * 100003 + 6001);
  const roomRng = seeded(seed + chapter * 100003 + 6029);
  const widths = Array.from(
    { length: 8 },
    () => 3 + Math.floor(widthRng() * 4),
  );
  while (widths.reduce((sum, width) => sum + width, 0) < 36) {
    const options = widths.flatMap((width, i) => (width < 6 ? [i] : []));
    widths[options[Math.floor(widthRng() * options.length)]]++;
  }
  const rows = [1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(roomRng() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const guaranteed: NodeKind[] = [
    'mystery',
    'mystery',
    'chest',
    'chest',
    'shop',
    'rest',
  ];
  const kinds: NodeKind[] = [
    'battle',
    'elite',
    'event',
    'mystery',
    'chest',
    'shop',
    'rest',
  ];
  const weights = [4, 1 + chapter * 0.4, 2, 2.5, 1, 0.8, 0.8].map(
    (weight) => weight * (0.6 + roomRng()),
  );
  const nodes: NodeKind[][] = [['battle']];
  widths.forEach((width, i) => {
    const required = guaranteed[rows.indexOf(i + 1)];
    const rooms: NodeKind[] = required ? [required] : [];
    while (rooms.length < width) {
      const choices = kinds.flatMap((kind, index) => {
        const count = rooms.filter((room) => room === kind).length;
        return count < (rooms.length < 3 ? 1 : 2)
          ? [{ kind, weight: weights[index] }]
          : [];
      });
      let pick =
        roomRng() * choices.reduce((sum, choice) => sum + choice.weight, 0);
      const selected =
        choices.find((choice) => (pick -= choice.weight) < 0) ??
        choices[choices.length - 1];
      rooms.push(selected.kind);
    }
    for (let col = rooms.length - 1; col > 0; col--) {
      const j = Math.floor(roomRng() * (col + 1));
      [rooms[col], rooms[j]] = [rooms[j], rooms[col]];
    }
    nodes.push(rooms);
  });
  return [...nodes, ['boss']];
}
export function previousMinibossCampaignTree(
  seed: number,
  chapter: number,
  count = 2,
): NodeKind[][] {
  const nodes = previousRandomCampaignTree(seed, chapter);
  const rng = seeded(seed + chapter * 100003 + 7001);
  const rows = [3, 4, 5, 6, 7];
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const minimum: Partial<Record<NodeKind, number>> = {
    mystery: 2,
    chest: 2,
    shop: 1,
    rest: 1,
  };
  let placed = 0;
  for (const row of rows) {
    const combat = nodes[row].flatMap((kind, col) =>
      kind === 'battle' || kind === 'elite' ? [col] : [],
    );
    const options = combat.length
      ? combat
      : nodes[row].flatMap((kind, col) =>
          nodes.flat().filter((node) => node === kind).length >
          (minimum[kind] ?? 0)
            ? [col]
            : [],
        );
    if (!options.length) continue;
    nodes[row][options[Math.floor(rng() * options.length)]] = 'miniboss';
    if (++placed === count) break;
  }
  return nodes;
}
export function campaignTree(seed: number, chapter: number): NodeKind[][] {
  const count = 1 + Math.floor(seeded(seed + chapter * 100003 + 8017)() * 4);
  return previousMinibossCampaignTree(seed, chapter, count);
}
export function minibossVariant(
  run: Run,
  row = run.step,
  col = run.path[row] ?? 0,
): number {
  const saved = run.minibossVariants?.[`${run.chapter}:${row}:${col}`];
  return Number.isInteger(saved) && saved >= 0 && saved < 3
    ? saved
    : Math.floor(
        seeded(
          run.seed + run.chapter * 100003 + row * 887 + col * 397 + 8101,
        )() * 3,
      );
}
export function mysteryKind(run: Run, nodeId: string): NodeKind {
  const col = Number(nodeId.split(':')[1]) || 0;
  const rng = seeded(
    run.seed + run.chapter * 100003 + run.step * 881 + col * 199 + 735,
  );
  const pool: NodeKind[] = [
    'battle',
    'battle',
    'elite',
    'shop',
    'event',
    'event',
    'rest',
    'chest',
    'chest',
    'miniboss',
  ];
  return pool[Math.floor(rng() * pool.length)];
}
export function furniturePrice(run: Run, id: string) {
  return Math.round(
    (FURNITURE_BY_ID[id]?.cost ?? 0) * (1 + run.chapter * 0.15),
  );
}
export function furnitureOffers(run: Run, count = 2) {
  const rng = seeded(
    run.seed + run.chapter * 100003 + run.step * 617 + 83 + run.rerolls * 199,
  );
  return FURNITURE.filter((i) => blueprintPool(run, i.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((i) => ({ id: i.id, n: rng() }))
    .sort((a, b) => a.n - b.n)
    .slice(0, count)
    .map((i) => i.id);
}
export function randomLoot(
  run: Run,
  meta: Meta,
  count: number,
  salt: number,
  any = false,
  forced?: 'module' | 'furniture',
  rare = false,
): Loot[] {
  const rng = seeded(run.seed + run.chapter * 100003 + run.step * 301 + salt);
  const out: Loot[] = [];
  for (let i = 0; i < count; i++) {
    const kind = forced ?? (rng() < (any ? 0.5 : 0.3) ? 'furniture' : 'module');
    const pool =
      kind === 'furniture'
        ? FURNITURE.filter((i) => blueprintPool(run, i.id)).map((i) => i.id)
        : ITEMS.filter(
            (i) =>
              blueprintPool(run, i.id) && (any || meta.unlocked.includes(i.id)),
          ).flatMap((i) =>
            Array(
              rare ? [0, 1, 3, 5, 3][i.rarity] : [0, 12, 6, 3, 1][i.rarity],
            ).fill(i.id),
          );
    const available = pool.filter(
      (id) => !out.some((l) => l.kind === kind && l.id === id),
    );
    if (available.length)
      out.push({ kind, id: available[Math.floor(rng() * available.length)] });
  }
  return out;
}
export function claimFurniture(run: Run, index: number): Run {
  const loot = run.loot[index];
  if (
    run.page !== 'reward' ||
    loot?.kind !== 'furniture' ||
    run.furniture.length >= 30
  )
    return run;
  return nextNode({
    ...run,
    furniture: [
      ...run.furniture,
      { uid: run.nextFurnitureId, id: loot.id, resident: null, cell: null },
    ],
    nextFurnitureId: run.nextFurnitureId + 1,
    loot: [],
    reward: [],
  });
}
export function battleRewards(run: Run, meta: Meta): Run {
  let next: Run = {
    ...run,
    page: 'reward',
    battleCount: run.battleCount + 1,
    battlesSinceRescue: run.battlesSinceRescue + 1,
    coins:
      run.coins +
      18 +
      run.chapter * 6 +
      (run.kind === 'elite'
        ? 14
        : run.kind === 'miniboss'
          ? 22
          : run.kind === 'boss'
            ? 25
            : 0),
    scrap:
      run.scrap + (run.kind === 'miniboss' ? 4 : run.kind === 'elite' ? 3 : 1),
    eventResult: '',
  };
  if (
    next.battleCount === 1 ||
    next.battlesSinceRescue >= 4 ||
    seeded(run.seed + run.chapter * 100003 + run.step * 419)() < 0.18
  ) {
    const rescue = recruit(next, meta);
    next = rescue.run;
    if (rescue.id)
      next.eventResult = `Урятовано: ${RESIDENT_BY_ID[rescue.id].name}. ${next.residents.some((r) => r.id === rescue.id) ? 'Квартиру заселено.' : 'Потрібне місце: переплануй або розшир будинок.'}`;
  }
  next.loot = randomLoot(
    run,
    meta,
    3,
    67,
    false,
    undefined,
    run.kind === 'elite' || run.kind === 'miniboss' || run.kind === 'boss',
  );
  next.reward = next.loot.filter((l) => l.kind === 'module').map((l) => l.id);
  return next;
}
export function advanceLocation(run: Run, meta: Meta): Run {
  if (
    run.kind !== 'boss' ||
    run.step !== run.nodes.length - 1 ||
    run.chapter >= 2
  )
    return run;
  const chapter = run.chapter + 1;
  return {
    ...run,
    chapter,
    nodes: campaignTree(run.seed, chapter),
    routeVersion: 8,
    step: 0,
    path: [],
    historyStart: 0,
    page: 'map',
    kind: 'battle',
    bossesDefeated: run.bossesDefeated + 1,
    loot: [],
    reward: [],
    offers: [],
    shopFurniture: [],
    bought: [],
    revealed: {},
    eventResult: '',
    eventDone: false,
    rerolls: 0,
    repairUsed: false,
    hp: Math.min(
      statsFor(run, meta).health,
      run.hp + statsFor(run, meta).health * 0.25,
    ),
  };
}
export function eventFor(run: Run) {
  const pool = CAMPAIGN_EVENTS.filter((e) => e.chapter === run.chapter);
  return pool[
    Math.floor(
      seeded(run.seed + run.chapter * 100003 + run.step * 719)() * pool.length,
    )
  ];
}
export function canChooseEvent(run: Run, meta: Meta, e: EventEffect) {
  return (
    run.coins + (e.coins ?? 0) >= 0 &&
    run.scrap + (e.scrap ?? 0) >= 0 &&
    run.hp > Math.ceil(statsFor(run, meta).health * (e.damageMax ?? 0))
  );
}
export function resolveEvent(run: Run, meta: Meta, choice: number): Run {
  if (run.page !== 'event' || run.eventDone) return run;
  const max = statsFor(run, meta).health;
  if (run.kind === 'rest')
    return {
      ...run,
      eventDone: true,
      eventResult:
        choice === 0
          ? 'Відновлено 35% міцності.'
          : 'Знайдено 20 монет і 3 брухту.',
      hp: choice === 0 ? Math.min(max, run.hp + max * 0.35) : run.hp,
      coins: run.coins + (choice === 1 ? 20 : 0),
      scrap: run.scrap + (choice === 1 ? 3 : 0),
    };
  const selected = eventFor(run).choices[choice];
  if (!selected || !canChooseEvent(run, meta, selected.effect)) return run;
  const e = selected.effect;
  let next: Run = {
    ...run,
    eventDone: true,
    eventResult: selected.result,
    coins: run.coins + (e.coins ?? 0),
    scrap: run.scrap + (e.scrap ?? 0),
    hp: Math.min(
      max,
      run.hp - Math.ceil(max * (e.damageMax ?? 0)) + max * (e.healMax ?? 0),
    ),
  };
  if (e.rescue) {
    const result = recruit(next, meta);
    next = {
      ...result.run,
      eventResult:
        selected.result +
        (result.id
          ? ` Урятовано: ${RESIDENT_BY_ID[result.id].name}.`
          : ' Усі мешканці вже з нами: +25 монет.'),
    };
  }
  if (e.loot) {
    next.page = 'reward';
    next.loot = randomLoot(run, meta, 1, 404, false, e.loot, e.rare);
    next.reward = next.loot.filter((l) => l.kind === 'module').map((l) => l.id);
  }
  return next;
}
export function rerollShop(run: Run, meta: Meta): Run {
  const cost = 25 + 15 * run.rerolls;
  if (run.page !== 'shop' || run.coins < cost) return run;
  const next = { ...run, coins: run.coins - cost, rerolls: run.rerolls + 1 };
  const replacements = offers(meta, next, 3, 800 + next.rerolls * 83);
  next.offers = run.offers.map((id, i) =>
    run.bought.includes(i) ? id : (replacements[i] ?? id),
  );
  const sold = new Set(
    run.shopFurniture.filter((_, i) => run.bought.includes(i + 10)),
  );
  const furniture = furnitureOffers(next, FURNITURE.length).filter(
    (id) => !sold.has(id),
  );
  let furnitureIndex = 0;
  next.shopFurniture = run.shopFurniture.map((id, i) =>
    run.bought.includes(i + 10) ? id : furniture[furnitureIndex++],
  );
  return next;
}
export function repairShop(run: Run, meta: Meta): Run {
  const cost = 30 + run.chapter * 10,
    max = statsFor(run, meta).health;
  if (
    run.page !== 'shop' ||
    run.repairUsed ||
    run.coins < cost ||
    run.hp >= max
  )
    return run;
  return {
    ...run,
    coins: run.coins - cost,
    hp: Math.min(max, run.hp + max * 0.3),
    repairUsed: true,
  };
}
export function initialMeta(): Meta {
  return {
    blueprints: [],
    totalBosses: 0,
    totalMinibosses: 0,
    totalRescues: 0,
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
    research: {
      hull: 0,
      supplies: 0,
      garage: 0,
      salvage: 0,
      servos: 0,
      maintenance: 0,
    },
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
      (k === 'blueprint' && meta.blueprints.includes(i.id)) ||
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
  chapter = Math.max(0, Math.min(2, Math.floor(chapter || 0)));
  const nodes = campaignTree(seed, chapter);
  const run: Run = {
    blueprints: [...meta.blueprints],
    minibossKills: 0,
    research: { ...meta.research },
    seed: Number.isFinite(seed) ? seed : Date.now(),
    chapter,
    character: c.id,
    step: 0,
    nodes,
    routeVersion: 8,
    campaignVersion: 1,
    bossVariants: [0, 1, 2].map((n) =>
      Math.floor(seeded(seed + n * 91237 + 919)() * 3),
    ),
    minibossVariants: {},
    houseLevel: 0,
    rescued: [c.id],
    battlesSinceRescue: 0,
    battleCount: 0,
    bossesDefeated: 0,
    revealed: {},
    loot: [],
    shopFurniture: [],
    repairUsed: false,
    eventResult: '',
    path: [],
    historyStart: 0,
    equipmentLayout: 1,
    items: emptyEquipment(),
    backpack: [],
    nextBagId: 1,
    residents: initialHouse(c.id),
    roomLinks: [],
    roomModes: {},
    furniture: [],
    nextFurnitureId: 1,
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
  equipmentTargets(run)
    .slice(0, 3)
    .forEach((target, index) => {
      run.items[target.slot] = ['cannon', 'engine', c.start][index];
    });
  run.hp = statsFor(run, meta).health;
  return run;
}
export function statsFor(run: Run, meta: Meta, legacyLayout = false): Stats {
  const research = run.research ?? meta.research;
  const s: Stats = {
    damage: 16 + (research.garage ?? 0) * 3,
    rate: 1.65,
    speed: 155 + (research.servos ?? 0) * 3,
    health:
      110 + (research.hull ?? 0) * 10 + (run.character === 'mechanic' ? 15 : 0),
    armor: 0,
    regen:
      (run.character === 'flora' ? 0.8 : 0) +
      (research.maintenance ?? 0) * 0.06,
    range: 410,
    crit: 0.05,
    shots: 1,
    chain: 0,
    explosion: 0,
    vampire: 0,
    magnet: 80 + (research.salvage ?? 0) * 10,
    drones: 0,
    orbit: 0,
    luck: 0,
    thorns: 0,
    synergies: [],
    housing: apartmentEffects(run),
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
  for (const [key, value] of Object.entries(s.housing.stats)) {
    if (key === 'rate') rate += value;
    else s[key as Stat] += value;
  }
  s.synergies.push(...s.housing.effects.map((e) => `${e.title}: ${e.text}`));
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
  const installed = legacyLayout
    ? run.items.flatMap((id, slot) =>
        id ? [{ id, slot, x: slot % 3, y: Math.floor(slot / 3) }] : [],
      )
    : activeEquipment(run);
  for (const { id } of installed) {
    if (!id || !ITEM_BY_ID[id]) continue;
    for (const [key, val] of Object.entries(ITEM_BY_ID[id].stats)) {
      if (key === 'rate') rate += val;
      else s[key as Stat] += val;
    }
  }
  installed.forEach(({ id, x, y, slot }) => {
    const neighbors = installed
      .filter(
        (other) =>
          other.slot !== slot &&
          Math.abs(other.x - x) + Math.abs(other.y - y) === 1,
      )
      .map((other) => ITEM_BY_ID[other.id]);
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
  const specials = specialEffects(run);
  s.regen += specials.gardenRegen;
  if (specials.shields)
    s.synergies.push(
      `Аварійний захист: ${specials.shields} заблокованих ударів за бій`,
    );
  if (specials.dashShot)
    s.synergies.push('Маховик: наступний залп після ривка +60% шкоди');
  if (specials.pulseHeal)
    s.synergies.push(
      `Лікувальна хвиля: +${specials.pulseHeal} міцності при влучанні`,
    );
  if (specials.lastStand)
    s.synergies.push('Червоний протокол: +30% шкоди залпів нижче 35% міцності');
  if (specials.dashCooldown < 3.8)
    s.synergies.push('Зарядне крісло: перезаряджання ривка 3,2 с');
  if (specials.gardenRegen)
    s.synergies.push(
      'Бібліотека насіння: сусідство з Флорою +0,35 відновлення/с',
    );
  s.regen = Math.max(0, Math.min(4, s.regen));
  s.armor = Math.min(12, s.armor);
  s.rate = Math.min(4.5, s.rate) * (s.housing.echo ? 0.85 : 1);
  s.speed = Math.min(260, s.speed);
  return s;
}
export function offers(
  meta: Meta,
  run: Run,
  count: number,
  salt: number,
  rare = false,
): string[] {
  const rng = seeded(run.seed + run.chapter * 100003 + run.step * 301 + salt);
  const pool = ITEMS.filter(
    (i) => blueprintPool(run, i.id) && meta.unlocked.includes(i.id),
  );
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
  return Math.round(item.price * (1 + run.chapter * 0.15));
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
type RouteContext = Pick<Run, 'seed' | 'chapter' | 'routeVersion'>;
const edgeCache = new WeakMap<
  NodeKind[][],
  { seed: number; chapter: number; links: number[][][] }
>();
export function campaignLinks(
  nodes: NodeKind[][],
  seed: number,
  chapter: number,
): number[][][] {
  const cached = edgeCache.get(nodes);
  if (cached?.seed === seed && cached.chapter === chapter) return cached.links;
  const links = nodes.slice(0, -1).map((row, step) => {
    const a = row.length,
      b = nodes[step + 1].length;
    const edges: number[][] = Array.from({ length: a }, () => []);
    if (a === 1) return [Array.from({ length: b }, (_, col) => col)];
    if (b === 1) return edges.map(() => [0]);
    const rng = seeded(seed + chapter * 100003 + step * 8191 + 6067);
    type State = { i: number; j: number; rights: number; weight: number };
    const moves = (i: number, j: number, rights: number): State[] => [
      ...(i < a - 1 && j < b - 1
        ? [{ i: i + 1, j: j + 1, rights: 0, weight: 1.5 }]
        : []),
      ...(i < a - 1 ? [{ i: i + 1, j, rights: 0, weight: 1 }] : []),
      ...(j < b - 1 && rights < 2
        ? [{ i, j: j + 1, rights: rights + 1, weight: 1 }]
        : []),
    ];
    const memo = new Map<string, number>();
    const completions = (i: number, j: number, rights: number): number => {
      if (i === a - 1 && j === b - 1) return 1;
      const key = `${i}:${j}:${rights}`;
      if (!memo.has(key))
        memo.set(
          key,
          moves(i, j, rights).reduce(
            (sum, move) =>
              sum + move.weight * completions(move.i, move.j, move.rights),
            0,
          ),
        );
      return memo.get(key)!;
    };
    let state = { i: 0, j: 0, rights: 0, weight: 1 };
    edges[0].push(0);
    while (state.i !== a - 1 || state.j !== b - 1) {
      const choices = moves(state.i, state.j, state.rights)
        .map((move) => ({
          ...move,
          weight: move.weight * completions(move.i, move.j, move.rights),
        }))
        .filter((move) => move.weight > 0);
      let pick = rng() * choices.reduce((sum, move) => sum + move.weight, 0);
      state =
        choices.find((move) => (pick -= move.weight) < 0) ??
        choices[choices.length - 1];
      edges[state.i].push(state.j);
    }
    return edges;
  });
  edgeCache.set(nodes, { seed, chapter, links });
  return links;
}
export function routeNodeX(
  run: Pick<Run, 'seed' | 'chapter' | 'nodes'>,
  row: number,
  col: number,
): number {
  const count = run.nodes[row].length;
  if (count === 1) return 500;
  const rng = seeded(run.seed + run.chapter * 100003 + row * 739 + 6101);
  const weights = Array.from({ length: count + 1 }, () => 0.15 + rng());
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const slack = 1000 - 170 - (count - 1) * 142;
  return (
    85 +
    col * 142 +
    (slack *
      weights.slice(0, col + 1).reduce((sum, weight) => sum + weight, 0)) /
      total
  );
}
export function routeTargets(
  step: number,
  column: number,
  nodes?: NodeKind[][],
  context?: RouteContext,
): readonly number[] {
  if (nodes && context && context.routeVersion >= 6)
    return (
      campaignLinks(nodes, context.seed, context.chapter)[step]?.[column] ?? []
    );
  if (!nodes || nodes.length === 8)
    return ROUTE_CONNECTIONS[step]?.[column] ?? [];
  const a = nodes[step]?.length,
    b = nodes[step + 1]?.length;
  if (!a || !b || column < 0 || column >= a) return [];
  if (a === 1) return Array.from({ length: b }, (_, i) => i);
  const position = (column * (b - 1)) / (a - 1);
  const left = Math.max(0, Math.floor(position - 0.4)),
    right = Math.min(b - 1, Math.ceil(position + 0.4));
  return Array.from({ length: right - left + 1 }, (_, i) => left + i);
}
export function availableColumns(run: Run): readonly number[] {
  if (run.path.length > run.step) return [run.path[run.step]];
  if (run.step === 0) return [0];
  if (run.path.length !== run.step) return [];
  return routeTargets(run.step - 1, run.path[run.step - 1], run.nodes, run);
}
export function reachableColumns(run: Run): number[][] {
  const reachable = run.nodes.map(() => [] as number[]);
  reachable[run.step] = [...availableColumns(run)];
  for (let step = run.step + 1; step < run.nodes.length; step++)
    reachable[step] = [
      ...new Set(
        reachable[step - 1].flatMap((col) => [
          ...routeTargets(step - 1, col, run.nodes, run),
        ]),
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
  const original = run.nodes[step]?.[column];
  const resolved =
    original === 'mystery'
      ? (run.revealed[nodeId] ?? mysteryKind(run, nodeId))
      : original;
  const kind =
    original === 'mystery' && resolved === 'boss' ? 'miniboss' : resolved;
  if (!kind) return run;
  const next: Run = {
    ...run,
    kind,
    minibossVariants:
      kind === 'miniboss'
        ? {
            ...run.minibossVariants,
            [`${run.chapter}:${step}:${column}`]: minibossVariant(
              run,
              step,
              column,
            ),
          }
        : run.minibossVariants,
    revealed:
      original === 'mystery'
        ? { ...run.revealed, [nodeId]: kind }
        : run.revealed,
    loot: [],
    eventResult: '',
    repairUsed: false,
    path: [...run.path.slice(0, step), column],
    bought: [],
    rerolls: 0,
    eventDone: false,
  };
  if (kind === 'shop') {
    next.page = 'shop';
    next.offers = offers(meta, run, 3, 41);
    next.shopFurniture = furnitureOffers(run, 2);
  } else if (kind === 'event' || kind === 'rest') {
    next.page = 'event';
  } else if (kind === 'chest') {
    next.page = 'reward';
    next.loot = randomLoot(run, meta, 1, 731, true);
    next.reward = next.loot.filter((l) => l.kind === 'module').map((l) => l.id);
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
    loot: [],
    eventResult: '',
    shopFurniture: [],
    repairUsed: false,
    page: 'map',
    offers: [],
    bought: [],
    reward: [],
    eventDone: false,
  };
}
function storedItem(run: Run, id: string): Run {
  if (
    run.backpack.length >= RESTORED_STORAGE_LIMIT ||
    !Number.isInteger(run.nextBagId) ||
    run.nextBagId > 1e8
  )
    return run;
  return {
    ...run,
    backpack: [
      ...run.backpack,
      { uid: run.nextBagId, id, x: 0, y: 0, rotation: 0 },
    ],
    nextBagId: run.nextBagId + 1,
  };
}
function equipmentHealth(before: Run, next: Run, meta: Meta): Run {
  return {
    ...next,
    hp:
      (before.hp * statsFor(next, meta).health) / statsFor(before, meta).health,
  };
}
export function equip(run: Run, itemId: string, slot: number, meta: Meta): Run {
  if (
    run.page === 'combat' ||
    !canEquipAt(run, slot) ||
    !ITEM_BY_ID[itemId] ||
    (!meta.unlocked.includes(itemId) &&
      !run.loot.some((l) => l.kind === 'module' && l.id === itemId))
  )
    return run;
  let next = run;
  const old = run.items[slot];
  if (old) {
    next = storedItem(run, old);
    if (next === run) return run;
  }
  next = { ...next, items: [...run.items] };
  next.items[slot] = itemId;
  return equipmentHealth(run, next, meta);
}
export function packItem(run: Run, meta: Meta, id: string): Run {
  if (
    run.page === 'combat' ||
    (!meta.unlocked.includes(id) &&
      !run.loot.some((l) => l.kind === 'module' && l.id === id)) ||
    !ITEM_BY_ID[id] ||
    run.backpack.length >= STORAGE_LIMIT
  )
    return run;
  return storedItem(run, id);
}
export function stowModule(run: Run, meta: Meta, slot: number): Run {
  const id = run.items[slot];
  if (run.page === 'combat' || !id || !Number.isInteger(slot)) return run;
  const packed = storedItem(run, id);
  if (packed === run) return run;
  const next = { ...packed, items: [...run.items] };
  next.items[slot] = null;
  return equipmentHealth(run, next, meta);
}
export function installPacked(
  run: Run,
  meta: Meta,
  uid: number,
  slot: number,
): Run {
  if (run.page === 'combat' || !canEquipAt(run, slot)) return run;
  const packed = run.backpack.find((item) => item.uid === uid);
  if (!packed) return run;
  const old = run.items[slot];
  const next = {
    ...run,
    backpack: old
      ? run.backpack.map((item) =>
          item.uid === uid ? { ...item, id: old } : item,
        )
      : run.backpack.filter((item) => item.uid !== uid),
    items: [...run.items],
  };
  next.items[slot] = packed.id;
  return equipmentHealth(run, next, meta);
}
export function moveEquipment(
  run: Run,
  meta: Meta,
  from: number,
  to: number,
): Run {
  if (
    run.page === 'combat' ||
    !canEquipAt(run, from) ||
    !canEquipAt(run, to) ||
    !run.items[from] ||
    from === to
  )
    return run;
  const next = { ...run, items: [...run.items] };
  [next.items[from], next.items[to]] = [next.items[to], next.items[from]];
  return equipmentHealth(run, next, meta);
}
export function scrapEquipment(run: Run, meta: Meta, slot: number): Run {
  if (run.page === 'combat' || !Number.isInteger(slot) || !run.items[slot])
    return run;
  const next = { ...run, items: [...run.items], scrap: run.scrap + 2 };
  next.items[slot] = null;
  return equipmentHealth(run, next, meta);
}
export function buyFurniture(run: Run, id: string): Run {
  const item = FURNITURE_BY_ID[id];
  if (
    !item ||
    run.page !== 'shop' ||
    !run.shopFurniture.includes(id) ||
    run.bought.includes(10 + run.shopFurniture.indexOf(id)) ||
    run.coins < furniturePrice(run, id) ||
    run.furniture.length >= 30 ||
    !Number.isInteger(run.nextFurnitureId) ||
    run.nextFurnitureId < 1 ||
    run.nextFurnitureId > 1e8 ||
    run.furniture.some((f) => f.uid === run.nextFurnitureId)
  )
    return run;
  return {
    ...run,
    coins: run.coins - furniturePrice(run, id),
    bought: [...run.bought, 10 + run.shopFurniture.indexOf(id)],
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
    !!run.items[apartmentSlot(resident, cell)] ||
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
export function expandHouse(meta: Meta, _run: Run | null): Meta {
  return meta;
}
export function expandRunHouse(run: Run): Run {
  const cost = HOUSE_EXPANSION_COSTS[run.houseLevel];
  return run.page === 'combat' || cost === undefined || run.coins < cost
    ? run
    : { ...run, coins: run.coins - cost, houseLevel: run.houseLevel + 1 };
}
export function houseResident(run: Run, meta: Meta, room: ResidentRoom): Run {
  const residents = planRoomMove(run, room);
  if (run.page === 'combat' || !run.rescued.includes(room.id) || !residents)
    return run;
  const next = {
    ...run,
    residents,
  };
  next.hp = (run.hp * statsFor(next, meta).health) / statsFor(run, meta).health;
  return next;
}
export function joinApartments(
  run: Run,
  meta: Meta,
  a: string,
  b: string,
): Run {
  const ra = run.residents.find((r) => r.id === a),
    rb = run.residents.find((r) => r.id === b);
  if (
    run.page === 'combat' ||
    a === b ||
    !ra ||
    !rb ||
    !roomsTouch(ra, rb) ||
    linkedIds(run, a).length > 1 ||
    linkedIds(run, b).length > 1
  )
    return run;
  const next = {
    ...run,
    roomLinks: [...(run.roomLinks ?? []), [a, b] as RoomLink],
  };
  return equipmentHealth(run, next, meta);
}
export function splitApartments(run: Run, meta: Meta, id: string): Run {
  if (run.page === 'combat' || linkedIds(run, id).length < 2) return run;
  return equipmentHealth(
    run,
    { ...run, roomLinks: run.roomLinks.filter((pair) => !pair.includes(id)) },
    meta,
  );
}
export function setApartmentMode(
  run: Run,
  meta: Meta,
  id: string,
  mode: RoomMode | 'normal',
): Run {
  if (
    run.page === 'combat' ||
    !run.residents.some((r) => r.id === id) ||
    (mode !== 'normal' &&
      (run.chapter < 2 ||
        !(
          (id === 'spark' && mode === 'lab') ||
          (id === 'solomia' && mode === 'anomaly')
        )))
  )
    return run;
  const roomModes = { ...run.roomModes };
  if (mode === 'normal') delete roomModes[id];
  else roomModes[id] = mode;
  return equipmentHealth(run, { ...run, roomModes }, meta);
}
export function reserveResident(run: Run, meta: Meta, id: string): Run {
  if (
    run.page === 'combat' ||
    linkedIds(run, id).length > 1 ||
    id === run.character ||
    !run.residents.some((r) => r.id === id)
  )
    return run;
  let stored = run;
  for (const target of equipmentTargets(run).filter(
    (target) => target.resident === id,
  )) {
    const item = run.items[target.slot];
    if (!item) continue;
    const nextStore = storedItem(stored, item);
    if (nextStore === stored) return run;
    stored = nextStore;
  }
  const next = {
    ...stored,
    items: run.items.map((item, slot) =>
      APARTMENT_SLOTS[slot]?.resident === id ? null : item,
    ),
    residents: run.residents.filter((r) => r.id !== id),
    roomModes: Object.fromEntries(
      Object.entries(run.roomModes ?? {}).filter(([key]) => key !== id),
    ),
    furniture: run.furniture.map((item) =>
      item.resident === id ? { ...item, resident: null, cell: null } : item,
    ),
  };
  next.hp = (run.hp * statsFor(next, meta).health) / statsFor(run, meta).health;
  return next;
}
export function recruit(run: Run, meta: Meta): { run: Run; id: string | null } {
  const pool = RESIDENTS.filter((r) => !run.rescued.includes(r.id));
  if (!pool.length)
    return {
      run: { ...run, coins: run.coins + 25, battlesSinceRescue: 0 },
      id: null,
    };
  const id =
    pool[
      Math.floor(
        seeded(
          run.seed +
            run.chapter * 100003 +
            run.step * 773 +
            run.rescued.length * 97,
        )() * pool.length,
      )
    ].id;
  let next = { ...run, rescued: [...run.rescued, id], battlesSinceRescue: 0 };
  const room = residentSpace(next.residents, id, next.houseLevel);
  if (room) next = houseResident(next, meta, room);
  return { run: next, id };
}
export function rescueResident(run: Run, meta: Meta) {
  if (run.page !== 'event' || run.kind !== 'event' || run.eventDone)
    return null;
  const result = recruit(run, meta);
  if (!result.id) return null;
  return { run: { ...result.run, eventDone: true }, meta, id: result.id };
}
export function finishRun(
  meta: Meta,
  run: Run,
  won: boolean,
): {
  meta: Meta;
  unlocks: string[];
  cores: number;
  projects: string[];
  coreBreakdown: { label: string; amount: number }[];
} {
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
  const bosses = Math.min(3, run.bossesDefeated + (won ? 1 : 0));
  n.totalBosses += bosses;
  n.totalMinibosses += run.minibossKills ?? 0;
  n.totalRescues += Math.max(0, new Set(run.rescued).size - 1);
  n.kills += run.kills;
  n.dashes += run.dashes;
  n.best = Math.max(n.best, run.kills);
  if (won && run.chapter === 2) n.wins = Math.min(5, n.wins + 1);
  const coreBreakdown = [
    { label: 'Польові дані', amount: Math.min(3, Math.floor(run.kills / 25)) },
    { label: 'Мінібоси', amount: Math.min(3, run.minibossKills ?? 0) },
    { label: 'Боси локацій', amount: [0, 2, 5, 10][bosses] },
  ];
  const cores = coreBreakdown.reduce((sum, r) => sum + r.amount, 0);
  n.cores += cores;
  n.lore = loreForProgress(meta.lore, n.wins, run.chapter);
  n.residents = residentRoster(meta.residents, n.wins);
  return {
    meta: n,
    unlocks: unlock(n),
    cores,
    coreBreakdown,
    projects: BLUEPRINTS.filter(
      (b) =>
        blueprintReady(n, b.id) &&
        !blueprintReady(meta, b.id) &&
        !n.blueprints.includes(b.id),
    ).map((b) => b.id),
  };
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
    (saved.routeVersion === 2 ||
      saved.routeVersion === 3 ||
      saved.routeVersion === 4 ||
      saved.routeVersion === 5 ||
      saved.routeVersion === 6 ||
      saved.routeVersion === 7 ||
      saved.routeVersion === 8) &&
    Array.isArray(path) &&
    path.length === count &&
    path.every(
      (col, step) =>
        Number.isInteger(col) &&
        !!run.nodes[step]?.[col] &&
        (step === 0
          ? col === 0
          : routeTargets(step - 1, path[step - 1], run.nodes, run).includes(
              col,
            )),
    ) &&
    (!active ||
      run.nodes[run.step][path[run.step]] === saved.kind ||
      run.nodes[run.step][path[run.step]] === 'mystery');
  if (valid) {
    run.path = [...path];
    run.historyStart = Math.floor(finite(saved.historyStart, 0, run.step, 0));
  } else {
    // Old saves did not record choices. Reconstruct a legal prefix ending at
    // the saved room, but do not present inferred past rooms as visited.
    let candidates: number[][] = [[]];
    for (let step = 0; step < count; step++) {
      const endpoints = new Map<number, number[]>();
      for (const prefix of candidates)
        for (const col of step === 0
          ? [0]
          : routeTargets(step - 1, prefix[step - 1], run.nodes, run))
          if (!endpoints.has(col)) endpoints.set(col, [...prefix, col]);
      candidates = [...endpoints.values()];
    }
    run.path =
      candidates.find(
        (p) => run.nodes[count - 1]?.[p[count - 1]] === saved.kind,
      ) ??
      candidates[0] ??
      [];
    run.historyStart = run.step;
  }
  if (count) {
    const node = run.nodes[count - 1][run.path[count - 1]];
    run.kind =
      node === 'mystery'
        ? (run.revealed[count - 1 + ':' + run.path[count - 1]] ??
          mysteryKind(run, count - 1 + ':' + run.path[count - 1]))
        : node;
  }
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
      'totalBosses',
      'totalMinibosses',
      'totalRescues',
    ] as const)
      base[k] = Math.floor(finite(m[k], 0, k === 'wins' ? 5 : 1e8, 0));
    base.totalBosses = Math.max(base.totalBosses, base.wins * 3);
    base.blueprints = Array.isArray(m.blueprints)
      ? [
          ...new Set<string>(
            m.blueprints.filter(
              (id: unknown) => typeof id === 'string' && !!BLUEPRINT_BY_ID[id],
            ),
          ),
        ]
      : [];
    base.sound = m.sound !== false;
    base.houseLevel = Math.floor(finite(m.houseLevel, 0, 3, 0));
    base.seen = Array.isArray(m.seen)
      ? m.seen.filter((id: unknown) => typeof id === 'string' && ITEM_BY_ID[id])
      : [];
    for (const k of RESEARCH.map((r) => r.id))
      base.research[k] = Math.floor(finite(m.research?.[k], 0, 5, 0));
    base.unlocked = [
      ...new Set([
        ...base.unlocked,
        ...(Array.isArray(m.unlocked)
          ? m.unlocked.filter((id: string) => !!ITEM_BY_ID[id])
          : []),
        ...base.seen,
      ]),
    ];
    unlock(base);
    base.lore = loreForProgress(Array.isArray(m.lore) ? m.lore : [], base.wins);
    base.residents = residentRoster(m.residents, base.wins);
    base.scenesSeen = Array.isArray(m.scenesSeen)
      ? [
          ...new Set<string>(
            m.scenesSeen.filter(
              (id: unknown) =>
                typeof id === 'string' &&
                (sceneUnlocked(id, base.wins, o.run?.chapter) ||
                  ['victory-0', 'victory-1', 'arrival-1', 'arrival-2'].includes(
                    id,
                  )),
            ),
          ),
        ]
      : [];
    base.sceneProgress = restoreSceneProgress(
      m.sceneProgress,
      base.wins,
      base.scenesSeen.includes(m.sceneProgress?.id) ? 3 : undefined,
    );
    if (m.storyRevision !== STORY_REVISION) {
      if (m.storyRevision === 4) {
        base.scenesSeen = base.scenesSeen.filter(
          (id) =>
            !['arrival-0', 'arrival-1', 'arrival-2', 'origins'].includes(id),
        );
      } else {
        base.scenesSeen = base.scenesSeen.filter((id) => id !== 'prologue');
        base.sceneProgress = { id: 'prologue', index: 0 };
      }
    }
    let run: Run | null = null;
    const r = o.run;
    if (
      r &&
      typeof r.seed === 'number' &&
      Number.isFinite(r.seed) &&
      Array.isArray(r.items) &&
      (r.equipmentLayout === 1
        ? r.items.length <= APARTMENT_SLOTS.length
        : r.items.length === 9) &&
      Number.isInteger(r.step) &&
      r.step >= 0 &&
      r.step <
        (r.routeVersion === 4 ||
        r.routeVersion === 5 ||
        r.routeVersion === 6 ||
        r.routeVersion === 7 ||
        r.routeVersion === 8
          ? 10
          : r.campaignVersion === 1 && r.routeVersion !== 2
            ? 12
            : 8)
    ) {
      run = makeRun(
        base,
        r.character,
        Math.floor(finite(r.chapter, 0, 2, 0)),
        r.seed,
      );
      if (r.campaignVersion !== 1 || r.routeVersion === 2) {
        run.nodes = legacyTree(r.seed);
        run.routeVersion = 2;
        run.houseLevel = 4;
      } else {
        if (r.routeVersion === 4) {
          run.nodes = compactCampaignTree(r.seed, run.chapter);
          run.routeVersion = 4;
        } else if (r.routeVersion === 5) {
          run.nodes = wideCampaignTree(r.seed, run.chapter);
          run.routeVersion = 5;
        } else if (r.routeVersion === 6) {
          run.nodes = previousRandomCampaignTree(r.seed, run.chapter);
          run.routeVersion = 6;
        } else if (r.routeVersion === 7) {
          run.nodes = previousMinibossCampaignTree(r.seed, run.chapter);
          run.routeVersion = 7;
        } else if (r.routeVersion !== 8) {
          run.nodes = previousCampaignTree(r.seed, run.chapter);
          run.routeVersion = 3;
        }
        run.houseLevel = Math.floor(finite(r.houseLevel, 0, 4, 0));
      }
      run.rescued = [
        ...new Set<string>(
          [
            run.character,
            ...(Array.isArray(r.rescued) ? r.rescued : []),
            ...(Array.isArray(r.residents)
              ? r.residents.map((room: ResidentRoom) => room?.id)
              : []),
          ].filter((id) => !!RESIDENT_BY_ID[id]),
        ),
      ];
      run.bossVariants = [0, 1, 2].map((i) =>
        Math.floor(finite(r.bossVariants?.[i], 0, 2, run!.bossVariants[i])),
      );
      if (r.minibossVariants && typeof r.minibossVariants === 'object')
        for (const [key, value] of Object.entries(r.minibossVariants).slice(
          0,
          150,
        ))
          if (
            /^[0-2]:\d{1,2}:[0-5]$/.test(key) &&
            Number.isInteger(value) &&
            Number(value) >= 0 &&
            Number(value) < 3
          )
            run.minibossVariants[key] = Number(value);
      run.revealed = {};
      if (r.revealed && typeof r.revealed === 'object')
        for (const [key, value] of Object.entries(r.revealed))
          if (
            [
              'battle',
              'elite',
              'miniboss',
              'shop',
              'event',
              'rest',
              'boss',
              'chest',
            ].includes(value as string) &&
            /^\d+:\d+$/.test(key)
          )
            run.revealed[key] =
              value === 'boss' ? 'miniboss' : (value as NodeKind);
      run.loot = Array.isArray(r.loot)
        ? r.loot
            .filter(
              (l: Loot) =>
                l &&
                (l.kind === 'module'
                  ? !!ITEM_BY_ID[l.id]
                  : l.kind === 'furniture' && !!FURNITURE_BY_ID[l.id]),
            )
            .slice(0, 3)
        : [];
      run.battleCount = Math.floor(finite(r.battleCount, 0, 100, 0));
      run.battlesSinceRescue = Math.floor(
        finite(r.battlesSinceRescue, 0, 100, 0),
      );
      run.bossesDefeated = Math.floor(
        finite(r.bossesDefeated, 0, 2, run.chapter),
      );
      run.shopFurniture = Array.isArray(r.shopFurniture)
        ? r.shopFurniture
            .filter((id: string) => !!FURNITURE_BY_ID[id])
            .slice(0, 2)
        : [];
      run.repairUsed = !!r.repairUsed;
      run.eventResult =
        typeof r.eventResult === 'string' ? r.eventResult.slice(0, 1000) : '';
      run.blueprints = Array.isArray(r.blueprints)
        ? [
            ...new Set<string>(
              r.blueprints.filter(
                (id: unknown) =>
                  typeof id === 'string' && base.blueprints.includes(id),
              ),
            ),
          ]
        : [];
      run.minibossKills = Math.floor(finite(r.minibossKills, 0, 100, 0));
      if (r.research)
        for (const key of RESEARCH.map((r) => r.id))
          run.research[key] = Math.floor(
            finite(r.research[key], 0, base.research[key], 0),
          );
      const savedItems: (string | null)[] = r.items.map((id: unknown) =>
        typeof id === 'string' && !!ITEM_BY_ID[id] ? id : null,
      );
      // v0.2 module shapes remain readable; the storage list no longer uses geometry.
      const bag = Array.isArray(r.backpack) ? r.backpack : [];
      const uids = new Set<number>();
      run.backpack = bag
        .filter(
          (i: PackedItem) =>
            i &&
            !!ITEM_BY_ID[i.id] &&
            Number.isInteger(i.uid) &&
            i.uid <= 1e8 &&
            i.uid > 0 &&
            !uids.has(i.uid) &&
            (uids.add(i.uid), true),
        )
        .slice(0, RESTORED_STORAGE_LIMIT)
        .map((i: PackedItem) => ({
          uid: i.uid,
          id: i.id,
          x: finite(i.x, 0, 5, 0),
          y: finite(i.y, 0, 4, 0),
          rotation: Math.floor(finite(i.rotation, 0, 3, 0)),
        }));
      const savedRooms =
        r.residents ??
        (r.campaignVersion !== 1
          ? ['mechanic', 'nina', 'lev'].reduce((rooms: ResidentRoom[], id) => {
              const room = residentSpace(rooms, id, 4);
              if (room) rooms.push(room);
              return rooms;
            }, [])
          : undefined);
      if (r.campaignVersion !== 1 && savedRooms)
        run.rescued = [
          ...new Set([
            ...run.rescued,
            ...savedRooms.map((room: ResidentRoom) => room.id),
          ]),
        ];
      run.residents = restoreResidents(
        savedRooms,
        run.rescued,
        run.character,
        run.houseLevel,
      );
      run.furniture = restoreFurniture(r.furniture, run.residents);
      run.roomLinks = restoreRoomLinks(r.roomLinks, run.residents);
      run.roomModes = restoreRoomModes(r.roomModes, run.residents, run.chapter);
      run.nextFurnitureId = Math.max(
        Math.floor(finite(r.nextFurnitureId, 1, 1e8, 1)),
        ...run.furniture.map((item) => item.uid + 1),
      );
      run.nextBagId = Math.max(
        Math.floor(finite(r.nextBagId, 1, 1e8, 1)),
        ...run.backpack.map((i) => i.uid + 1),
      );
      const legacyHealth =
        r.equipmentLayout !== 1
          ? statsFor({ ...run, items: savedItems }, base, true).health
          : null;
      run.items = emptyEquipment();
      if (r.equipmentLayout === 1) {
        savedItems.forEach((id, slot) => {
          if (!id) return;
          if (canEquipAt(run!, slot)) run!.items[slot] = id;
          else run = storedItem(run!, id);
        });
      } else {
        const targets = equipmentTargets(run).filter((target) =>
          canEquipAt(run!, target.slot),
        );
        let placed = 0;
        for (const id of savedItems) {
          if (!id) continue;
          const target = targets[placed++];
          if (target) run.items[target.slot] = id;
          else run = storedItem(run, id);
        }
      }
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
        Number.MIN_VALUE,
        statsFor(run, base).health,
        statsFor(run, base).health,
      );
      if (legacyHealth !== null) {
        const fraction =
          finite(r.hp, Number.MIN_VALUE, legacyHealth, legacyHealth) /
          legacyHealth;
        run.hp = fraction * statsFor(run, base).health;
      }
      run.step = r.step;
      restoreRoute(run, r);
      // Before variants existed, the active miniboss was always variant zero.
      if (!r.minibossVariants && run.kind === 'miniboss' && r.page !== 'map')
        run.minibossVariants[
          `${run.chapter}:${run.step}:${run.path[run.step]}`
        ] = 0;
      run.page = ['map', 'shop', 'event', 'reward'].includes(r.page)
        ? r.page
        : 'map';
      run.offers = Array.isArray(r.offers)
        ? r.offers
            .filter(
              (id: string) =>
                base.unlocked.includes(id) && blueprintPool(run!, id),
            )
            .slice(0, 4)
        : [];
      run.reward = Array.isArray(r.reward)
        ? r.reward
            .filter((id: string) => base.unlocked.includes(id))
            .slice(0, 3)
        : [];
      run.bought = Array.isArray(r.bought)
        ? r.bought.filter(
            (n: number) => Number.isInteger(n) && n >= 0 && n < 12,
          )
        : [];
      run.rerolls = finite(r.rerolls, 0, 50, 0);
      run.eventDone = !!r.eventDone;
      if (!run.loot.length && run.page === 'reward')
        run.loot = run.reward.map((id) => ({ kind: 'module', id }));
      for (const id of [...run.items, ...run.backpack.map((i) => i.id)])
        if (id && !base.unlocked.includes(id)) base.unlocked.push(id);
      if (m.storyRevision === STORY_REVISION || m.storyRevision === 4)
        base.sceneProgress = restoreSceneProgress(
          m.sceneProgress,
          base.wins,
          base.scenesSeen.includes(m.sceneProgress?.id) ? 3 : run.chapter,
        );
      base.lore = loreForProgress(base.lore, base.wins, run.chapter);
      // An untouched map can adopt the new route without replaying a room or
      // discarding a checkpoint. Keep the house, inventory and resources.
      if (
        run.routeVersion !== 8 &&
        run.step === 0 &&
        run.page === 'map' &&
        run.path.length === 0
      ) {
        run.nodes = campaignTree(run.seed, run.chapter);
        run.routeVersion = 8;
      }
    }
    return { meta: base, run };
  } catch {
    return { meta: base, run: null, error: true };
  }
}
export function saveData(meta: Meta, run: Run | null) {
  return JSON.stringify({ version: 1, meta, run });
}
