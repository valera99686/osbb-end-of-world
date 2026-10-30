import { specialEffects } from './specials';
import {
  BLUEPRINTS,
  blueprintReady,
  blueprintPool,
  MAX_DEPTH,
  researchOwned,
  runDepth,
  unlockReady,
} from './progression';
import { CAMPAIGN_EVENTS, type EventEffect } from './campaign-content';
import {
  apartmentEffects,
  linkedIds,
  planRoomMove,
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
  CHARACTERS,
  RESEARCH,
  type Stat,
  type Item,
} from './data';
import { type PackedItem, findSpace } from './backpack';
import { loreForProgress } from './lore';
import {
  residentRoster,
  initialHouse,
  residentBonuses,
  residentSpace,
  type ResidentRoom,
  HOUSE_EXPANSION_COSTS,
} from './residents';
import {
  furnitureBonuses,
  canFurnish,
  FURNITURE_BY_ID,
  type Furnishing,
} from './furniture';
import { STORY_REVISION } from './cutscenes';
import {
  DATE_KEY,
  dateKey,
  endlessHeat,
  heatCap,
  heatForRun,
  runScore,
  type RunMode,
} from './modes';
import { newAchievements } from './achievements';
import { COOP, coopHero } from './coop';
import { perkStats } from './upgrades';
import { EVOLUTION_BY_ID, WEAPONS, weaponFor, type WeaponId } from './weapons';
export { readSave, saveData, exportSave, importSave } from './save';
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
  tutorialDone: boolean;
  tutorialStep: number;
  settings: Settings;
  deaths: number;
  // Seconds spent in battles across all runs.
  playTime: number;
  bestHeat: number;
  // Highest heat the player may select for a campaign run.
  heatUnlocked: number;
  dailyBest: Record<string, number>;
  // How many daily runs were started on each local date. Only the first one
  // of a day is ranked: the rest are practice and leave the record alone.
  dailyAttempts: Record<string, number>;
  achievements: string[];
  endlessBest: number;
  winsByCharacter: Record<string, number>;
  totalElites: number;
  bestCombo: number;
  // Items unlocked since the last launch; the next run shows them first.
  fresh: string[];
  // Furthest run depth ever reached (see runDepth in progression.ts).
  bestDepth: number;
  // Elite battles won across all runs.
  eliteWins: number;
  // «Справа 04:17»: evidence found so far (story.ts CLUES) and the
  // endings the player has reached.
  clues: string[];
  endings: ('a' | 'b' | 'c')[];
  // Hidden achievements found so far (see secrets.ts).
  secrets: string[];
  // Local co-op (coop.ts): expeditions finished by two players and how many
  // times a fallen partner was pulled back to their feet.
  coopWins: number;
  coopRevives: number;
}
// `Meta.sound` stays the master mute; these are the fine-grained options.
export interface Settings {
  music: number;
  sfx: number;
  // Voice-over volume (lines of the story, perks, radio).
  voice: number;
  vibration: boolean;
  shake: number;
  colorblind: boolean;
  textScale: number;
  damageNumbers: boolean;
  reducedFlashes: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  music: 0.4,
  sfx: 0.8,
  voice: 0.9,
  vibration: true,
  shake: 1,
  colorblind: false,
  textScale: 1,
  damageNumbers: true,
  reducedFlashes: false,
};
const SHAKE_STEPS = [0, 0.5, 1],
  TEXT_STEPS = [1, 1.15, 1.3];
function nearest(steps: number[], value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return steps.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  );
}
export function sanitizeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const volume = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : fallback;
  const flag = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  const d = DEFAULT_SETTINGS;
  return {
    music: volume(s.music, d.music),
    sfx: volume(s.sfx, d.sfx),
    voice: volume(s.voice, d.voice),
    vibration: flag(s.vibration, d.vibration),
    shake: nearest(SHAKE_STEPS, s.shake, d.shake),
    colorblind: flag(s.colorblind, d.colorblind),
    textScale: nearest(TEXT_STEPS, s.textScale, d.textScale),
    damageNumbers: flag(s.damageNumbers, d.damageNumbers),
    reducedFlashes: flag(s.reducedFlashes, d.reducedFlashes),
  };
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
  // Newly unlocked: the reward card is tagged 'НОВЕ'.
  fresh?: true;
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
  mode: RunMode;
  heat: number;
  // Local 'YYYY-MM-DD' of a daily run, otherwise empty.
  daily: string;
  // The first daily run of its date; only a ranked run can set the record.
  dailyRanked: boolean;
  // Completed endless circuits; always 0 outside the endless mode.
  loop: number;
  elitesKilled: number;
  bestCombo: number;
  damageTaken: number;
  // Damage taken in the current battle; the engine resets it at battle start.
  battleDamage: number;
  bossNoHit: number;
  maxBattleKills: number;
  eventsCompleted: number;
  // Shop repairs bought during the whole run (repairUsed is per shop).
  repairs: number;
  // Newly unlocked items still waiting for their first reward card.
  fresh: string[];
  // Starting module choice from the 'draft' modifier; empty once taken.
  draft: string[];
  // Resident rescued at the current room, for the rescue card; else ''.
  rescue: string;
  // Level-up perks taken this run (ids repeat for stacks; see upgrades.ts).
  perks: string[];
  // Elite battles won in this run.
  eliteWins: number;
  // Hero of the second player in local co-op, '' when playing alone.
  coop: string;
  // Times the partner was helped back to their feet in this run.
  revives: number;
  // Co-op: the second house's own modules, in the same rooms and slots as
  // `items`, and its row of the current reward (the first house's row is
  // `loot`). Nothing here when playing alone.
  mateItems?: (string | null)[];
  mateLoot?: Loot[];
  // What each house took from the current reward and from the shop (shop
  // index to the house), so that both players see who got what.
  picked?: { host?: string; mate?: string };
  boughtBy?: Record<number, 'host' | 'mate'>;
}
export interface RunOptions {
  mode?: RunMode;
  heat?: number;
  daily?: string;
  // The second player's hero (coop.ts); not for the daily run.
  coop?: string;
}
export interface Stats extends Record<Stat, number> {
  synergies: string[];
  housing: ReturnType<typeof apartmentEffects>;
  // The armed weapon core and its evolution id ('' for none).
  weapon: WeaponId;
  evolution: string;
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
    (FURNITURE_BY_ID[id]?.cost ?? 0) *
      (1 + run.chapter * 0.15) *
      heatForRun(run).shopCost,
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
  // Finds that are already on the table (the other house's row).
  skip: readonly string[] = [],
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
      (id) =>
        !out.some((l) => l.kind === kind && l.id === id) &&
        !(kind === 'module' && skip.includes(id)),
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
  return settleReward(
    {
      ...run,
      furniture: [
        ...run.furniture,
        { uid: run.nextFurnitureId, id: loot.id, resident: null, cell: null },
      ],
      nextFurnitureId: run.nextFurnitureId + 1,
    },
    'host',
    loot.id,
  );
}
// Coins earned in the raid count double with a partner (COOP.money): two
// houses are kitted out from one till. Costs and penalties stay as they are.
export function earned(run: Pick<Run, 'coop'>, coins: number) {
  return coins > 0 && run.coop ? Math.round(coins * COOP.money) : coins;
}
// One row of the reward is taken (or left): with a partner the raid goes on
// once both houses have taken theirs. `id` is what was taken, for the screen.
export function settleReward(
  run: Run,
  row: 'host' | 'mate',
  id?: string,
): Run {
  const left: Run = {
    ...run,
    ...(row === 'host' ? { loot: [], reward: [] } : { mateLoot: [] }),
    picked: id ? { ...run.picked, [row]: id } : run.picked,
  };
  return left.loot.length || left.mateLoot?.length ? left : nextNode(left);
}
// Newly unlocked items take the last reward slots (they flip in last), up to
// the whole reward; the rest wait for the next one.
export function withFresh(
  run: Run,
  loot: Loot[],
): { loot: Loot[]; fresh: string[] } {
  const pending = (run.fresh ?? []).filter((id) => !!ITEM_BY_ID[id]);
  if (!pending.length) return { loot, fresh: [] };
  const size = Math.max(1, loot.length),
    take = pending.slice(0, size),
    rest = loot.filter((l) => !(l.kind === 'module' && take.includes(l.id)));
  return {
    loot: [
      ...rest.slice(0, size - take.length),
      ...take.map((id) => ({
        kind: 'module' as const,
        id,
        fresh: true as const,
      })),
    ],
    fresh: pending.slice(take.length),
  };
}
// The 'medic' modifier: a rescue patches the house up by 20%.
function rescueHeal(run: Run, meta: Meta): Run {
  if (!researchOwned(run.research, 'medic')) return run;
  const max = statsFor(run, meta).health;
  return { ...run, hp: Math.min(max, run.hp + max * 0.2) };
}
export function battleRewards(run: Run, meta: Meta): Run {
  let next: Run = {
    ...run,
    page: 'reward',
    battleCount: run.battleCount + 1,
    battlesSinceRescue: run.battlesSinceRescue + 1,
    eliteWins: (run.eliteWins ?? 0) + (run.kind === 'elite' ? 1 : 0),
    rescue: '',
    coins:
      run.coins +
      earned(
        run,
        18 +
          run.chapter * 6 +
          (run.kind === 'elite'
            ? 14
            : run.kind === 'miniboss'
              ? 22
              : run.kind === 'boss'
                ? 25
                : 0),
      ),
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
    if (rescue.id) {
      next = rescueHeal({ ...next, rescue: rescue.id }, meta);
      next.eventResult = `Урятовано: ${RESIDENT_BY_ID[rescue.id].name}. ${next.residents.some((r) => r.id === rescue.id) ? 'Квартиру заселено.' : 'Потрібне місце: переплануй або розшир будинок.'}`;
    }
  }
  const rare =
    run.kind === 'elite' || run.kind === 'miniboss' || run.kind === 'boss';
  const drop = withFresh(
    run,
    randomLoot(run, meta, 3, 67, false, undefined, rare),
  );
  next.loot = drop.loot;
  next.fresh = drop.fresh;
  next.reward = next.loot.filter((l) => l.kind === 'module').map((l) => l.id);
  next.mateLoot = mateRow(run, meta, 3, 71, next.loot, rare);
  next.picked = {};
  return next;
}
// Co-op: the second house's row of a reward, modules only and none of the
// first house's own, so the finds are shared out and not doubled.
export function mateRow(
  run: Run,
  meta: Meta,
  count: number,
  salt: number,
  taken: Loot[],
  rare = false,
  any = false,
): Loot[] {
  if (!run.coop) return [];
  return randomLoot(
    run,
    meta,
    count,
    salt,
    any,
    'module',
    rare,
    taken.filter((l) => l.kind === 'module').map((l) => l.id),
  );
}
// Pair with the battle result: the run stands at the last boss of location
// three in a mode that ends there.
export function isFinalVictory(run: Run, won = true): boolean {
  return (
    won &&
    run.mode !== 'endless' &&
    run.kind === 'boss' &&
    run.chapter >= 2 &&
    run.step === run.nodes.length - 1
  );
}
// Endless mode: after location three the same house starts a new, hotter
// circuit on a fresh route. Items, residents and resources carry over.
export function nextEndlessLoop(run: Run, meta: Meta): Run {
  if (
    run.mode !== 'endless' ||
    run.kind !== 'boss' ||
    run.step !== run.nodes.length - 1 ||
    run.chapter < 2
  )
    return run;
  const loop = run.loop + 1,
    seed = run.seed + loop * 7777777;
  const next: Run = {
    ...run,
    seed,
    loop,
    heat: endlessHeat(1, run.heat),
    chapter: 0,
    nodes: campaignTree(seed, 0),
    routeVersion: 8,
    bossVariants: [0, 1, 2].map((n) =>
      Math.floor(seeded(seed + n * 91237 + 919)() * 3),
    ),
    minibossVariants: {},
    // Apartment modes belong to location three and do not survive the reset.
    roomModes: {},
    step: 0,
    path: [],
    historyStart: 0,
    page: 'map',
    kind: 'battle',
    bossesDefeated: run.bossesDefeated + 1,
    loot: [],
    reward: [],
    mateLoot: [],
    picked: {},
    boughtBy: {},
    offers: [],
    shopFurniture: [],
    bought: [],
    revealed: {},
    eventResult: '',
    eventDone: false,
    rerolls: 0,
    repairUsed: false,
  };
  const health = statsFor(next, meta).health;
  next.hp = Math.min(
    health,
    (run.hp / statsFor(run, meta).health + 0.25) * health,
  );
  return next;
}
export function advanceLocation(run: Run, meta: Meta): Run {
  if (run.kind !== 'boss' || run.step !== run.nodes.length - 1) return run;
  if (run.chapter >= 2)
    return run.mode === 'endless' ? nextEndlessLoop(run, meta) : run;
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
    mateLoot: [],
    picked: {},
    boughtBy: {},
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
          : `Знайдено ${earned(run, 20)} монет і 3 брухту.`,
      hp: choice === 0 ? Math.min(max, run.hp + max * 0.35) : run.hp,
      coins: run.coins + (choice === 1 ? earned(run, 20) : 0),
      scrap: run.scrap + (choice === 1 ? 3 : 0),
    };
  const selected = eventFor(run).choices[choice];
  if (!selected || !canChooseEvent(run, meta, selected.effect)) return run;
  const e = selected.effect;
  let next: Run = {
    ...run,
    eventDone: true,
    eventResult: selected.result,
    coins: run.coins + earned(run, e.coins ?? 0),
    scrap: run.scrap + (e.scrap ?? 0),
    hp: Math.min(
      max,
      run.hp - Math.ceil(max * (e.damageMax ?? 0)) + max * (e.healMax ?? 0),
    ),
  };
  if (e.rescue) {
    const result = recruit(next, meta);
    next = {
      ...(result.id
        ? rescueHeal({ ...result.run, rescue: result.id }, meta)
        : result.run),
      eventResult:
        selected.result +
        (result.id
          ? ` Урятовано: ${RESIDENT_BY_ID[result.id].name}.`
          : ` Усі мешканці вже з нами: +${earned(run, 25)} монет.`),
    };
  }
  if (e.loot) {
    next.page = 'reward';
    next.loot = randomLoot(run, meta, 1, 404, false, e.loot, e.rare);
    next.reward = next.loot.filter((l) => l.kind === 'module').map((l) => l.id);
    next.mateLoot =
      e.loot === 'module' ? mateRow(run, meta, 1, 405, next.loot, e.rare) : [];
    next.picked = {};
  }
  return next;
}
export function rerollCost(run: Run) {
  // 'market' modifier: the first refresh in each shop is on the house.
  if (researchOwned(run.research, 'market') && run.rerolls === 0) return 0;
  return Math.round((25 + 15 * run.rerolls) * heatForRun(run).shopCost);
}
export function repairCost(run: Run) {
  return Math.round((30 + run.chapter * 10) * heatForRun(run).repairCost);
}
export function rerollShop(run: Run, meta: Meta): Run {
  const cost = rerollCost(run);
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
  const cost = repairCost(run),
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
    repairs: (run.repairs ?? 0) + 1,
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
    research: Object.fromEntries(RESEARCH.map((r) => [r.id, 0])),
    sound: true,
    lore: loreForProgress([], 0),
    residents: residentRoster([], 0),
    scenesSeen: [],
    storyRevision: STORY_REVISION,
    sceneProgress: null,
    tutorialDone: false,
    tutorialStep: 0,
    settings: { ...DEFAULT_SETTINGS },
    deaths: 0,
    playTime: 0,
    bestHeat: 0,
    heatUnlocked: 0,
    dailyBest: {},
    dailyAttempts: {},
    achievements: [],
    endlessBest: 0,
    winsByCharacter: {},
    totalElites: 0,
    bestCombo: 0,
    fresh: [],
    bestDepth: 0,
    eliteWins: 0,
    clues: [],
    endings: [],
    secrets: [],
    coopWins: 0,
    coopRevives: 0,
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
      unlockReady(meta, k);
    if (ok && !meta.unlocked.includes(i.id)) {
      meta.unlocked.push(i.id);
      added.push(i.id);
    }
  }
  return added;
}
// A daily run was started: the day's attempt is spent (a practice run too).
export function startDaily(meta: Meta, run: Run): Meta {
  if (run.mode !== 'daily' || !DATE_KEY.test(run.daily)) return meta;
  return {
    ...meta,
    dailyAttempts: {
      ...meta.dailyAttempts,
      [run.daily]: Math.min(99, (meta.dailyAttempts?.[run.daily] ?? 0) + 1),
    },
  };
}
export function makeRun(
  meta: Meta,
  character: string,
  chapter: number,
  seed = Date.now(),
  opts: RunOptions = {},
): Run {
  const c =
    CHARACTERS.find((c) => c.id === character && c.win <= meta.wins) ??
    CHARACTERS[0];
  chapter = Math.max(0, Math.min(2, Math.floor(chapter || 0)));
  const mode: RunMode =
    opts.mode === 'daily' || opts.mode === 'endless' ? opts.mode : 'campaign';
  const heat = Number.isFinite(opts.heat)
    ? Math.max(0, Math.min(heatCap(mode), Math.floor(opts.heat!)))
    : 0;
  const nodes = campaignTree(seed, chapter);
  const dailyKey =
    mode !== 'daily'
      ? ''
      : opts.daily && DATE_KEY.test(opts.daily)
        ? opts.daily
        : dateKey(new Date());
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
    coins: 35 + (c.id === 'boris' ? 30 : 0),
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
    mode,
    heat,
    daily: dailyKey,
    dailyRanked: mode === 'daily' && (meta.dailyAttempts?.[dailyKey] ?? 0) === 0,
    loop: 0,
    elitesKilled: 0,
    bestCombo: 0,
    damageTaken: 0,
    battleDamage: 0,
    bossNoHit: 0,
    maxBattleKills: 0,
    eventsCompleted: 0,
    repairs: 0,
    fresh: [],
    draft: [],
    rescue: '',
    perks: [],
    eliteWins: 0,
    coop: mode === 'daily' ? '' : coopHero(meta.wins, opts.coop),
    revives: 0,
    mateLoot: [],
    picked: {},
    boughtBy: {},
  };
  // A small apartment has fewer slots: the hero's own item takes the second
  // one and the legs wait in the backpack with whatever else did not fit.
  const targets = equipmentTargets(run).slice(0, 3);
  const kit =
    targets.length < 3
      ? ['cannon', c.start, 'engine']
      : ['cannon', 'engine', c.start];
  targets.forEach((target, index) => {
    run.items[target.slot] = kit[index];
  });
  for (const id of kit.slice(targets.length)) {
    const spot = findSpace(run.backpack, id);
    if (!spot) continue;
    run.backpack.push({ uid: run.nextBagId, id, ...spot });
    run.nextBagId++;
  }
  if (run.coop) run.mateItems = mateKit(run, run.coop);
  run.fresh = (meta.fresh ?? []).filter(
    (id) =>
      !!ITEM_BY_ID[id] && meta.unlocked.includes(id) && blueprintPool(run, id),
  );
  if (researchOwned(run.research, 'draft')) run.draft = draftOffers(run, meta);
  // 'crew' modifier: one more neighbour answers the chat before departure.
  const crewed = researchOwned(run.research, 'crew')
    ? recruit(run, meta).run
    : run;
  crewed.hp = statsFor(crewed, meta).health;
  return crewed;
}
// Three starting modules for the 'draft' modifier; items still waiting for
// their 'НОВЕ' reveal are left to the first reward.
export function draftOffers(run: Run, meta: Meta): string[] {
  const skip = new Set([
    ...run.items.filter((id): id is string => !!id),
    ...run.fresh,
  ]);
  return offers(
    { ...meta, unlocked: meta.unlocked.filter((id) => !skip.has(id)) },
    run,
    3,
    977,
    true,
  );
}
// Takes nothing from the draft: its three cards go away for this run.
export function skipDraft(run: Run): Run {
  return run.draft.length ? { ...run, draft: [] } : run;
}
// Residents this run rescued itself; the 'crew' modifier's neighbour is a
// gift and does not count.
export function runRescues(run: Run): number {
  return Math.max(
    0,
    new Set(run.rescued).size -
      1 -
      (researchOwned(run.research, 'crew') ? 1 : 0),
  );
}
export function statsFor(run: Run, meta: Meta, legacyLayout = false): Stats {
  const research = run.research ?? meta.research;
  const s: Stats = {
    damage: 16 + (research.garage ?? 0) * 3 + (run.character === 'lev' ? 4 : 0),
    rate: 1.65,
    speed: 155 + (research.servos ?? 0) * 3 + (run.character === 'danilo' ? 20 : 0),
    health:
      110 + (research.hull ?? 0) * 10 + (run.character === 'mechanic' ? 15 : 0),
    armor: 0,
    regen:
      (run.character === 'flora' ? 0.8 : 0) +
      (run.character === 'nina' ? 0.5 : 0) +
      (research.maintenance ?? 0) * 0.06,
    range: 410 + (run.character === 'solomia' ? 60 : 0),
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
    weapon: 'cannon',
    evolution: '',
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
  const perked = perkStats(run);
  for (const [key, value] of Object.entries(perked.stats))
    s[key as Stat] += value;
  rate += perked.rate;
  if (run.perks?.length) s.synergies.push(`Перки рівнів: ${run.perks.length}`);
  s.rate *= Math.max(0.3, 1 + rate);
  const armed = weaponFor(installed, (id) => ITEM_BY_ID[id]?.weapon);
  s.weapon = armed.weapon;
  s.evolution = armed.evolution;
  if (armed.weapon !== 'cannon') {
    s.rate *= WEAPONS[armed.weapon].rate;
    s.range = Math.max(180, s.range + WEAPONS[armed.weapon].range);
    s.synergies.push(`Зброя: ${WEAPONS[armed.weapon].name}`);
  }
  if (armed.evolution)
    s.synergies.push(
      `Еволюція: ${EVOLUTION_BY_ID[armed.evolution].name} — ${EVOLUTION_BY_ID[armed.evolution].text}`,
    );
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
  return Math.round(
    item.price * (1 + run.chapter * 0.15) * heatForRun(run).shopCost,
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
const NODE_KINDS = new Set<string>([
  'battle',
  'elite',
  'miniboss',
  'shop',
  'event',
  'rest',
  'boss',
  'mystery',
  'chest',
]);
// The host's run as it reaches the guest to draw the map of a vote from: null
// unless it has everything the map reads and every node is a known kind.
export function readMapRun(x: unknown): Run | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Run;
  const whole = (v: unknown, max: number): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
  if (
    !whole(r.seed, 2 ** 53) ||
    !whole(r.chapter, 2) ||
    !whole(r.step, 40) ||
    !whole(r.historyStart, 40) ||
    !whole(r.routeVersion, 20)
  )
    return null;
  if (
    !Array.isArray(r.nodes) ||
    r.nodes.length < 2 ||
    r.nodes.length > 40 ||
    r.step >= r.nodes.length ||
    !r.nodes.every(
      (row) =>
        Array.isArray(row) &&
        row.length > 0 &&
        row.length <= 12 &&
        row.every((k) => NODE_KINDS.has(k)),
    )
  )
    return null;
  if (!Array.isArray(r.path) || !r.path.every((c) => whole(c, 11))) return null;
  if (!r.revealed || typeof r.revealed !== 'object') return null;
  if (!Array.isArray(r.bossVariants)) return null;
  return r;
}
// What the guest of an online room gets as the host's run, to show the house,
// its own modules, its row of the reward and the shop (never to play from):
// null unless it has the shape those screens read.
export function readView(x: unknown): Run | null {
  const r = readMapRun(x);
  if (!r || !r.coop) return null;
  const lists = [
    r.residents,
    r.roomLinks,
    r.furniture,
    r.items,
    r.backpack,
    r.loot,
    r.offers,
    r.bought,
  ];
  if (!lists.every(Array.isArray)) return null;
  if (
    !['map', 'combat', 'shop', 'event', 'reward'].includes(r.page) ||
    !Number.isFinite(r.coins) ||
    !Number.isFinite(r.scrap) ||
    !Number.isInteger(r.nextBagId) ||
    !Number.isInteger(r.houseLevel)
  )
    return null;
  const known = (id: unknown): id is string =>
    typeof id === 'string' && !!ITEM_BY_ID[id];
  return {
    ...r,
    items: r.items.map((id) => (known(id) ? id : null)),
    mateItems: Array.isArray(r.mateItems)
      ? r.mateItems.map((id) => (known(id) ? id : null))
      : emptyEquipment(),
    mateLoot: Array.isArray(r.mateLoot)
      ? r.mateLoot.filter((l) => l?.kind === 'module' && known(l.id))
      : [],
    picked:
      r.picked && typeof r.picked === 'object' ? r.picked : {},
    boughtBy:
      r.boughtBy && typeof r.boughtBy === 'object' ? r.boughtBy : {},
  };
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
    mateLoot: [],
    picked: {},
    boughtBy: {},
    eventResult: '',
    rescue: '',
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
    // 'chest' modifier: a false bottom holds a second find to choose from.
    const drop = withFresh(
      run,
      randomLoot(
        run,
        meta,
        researchOwned(run.research, 'chest') ? 2 : 1,
        731,
        true,
      ),
    );
    next.loot = drop.loot;
    next.fresh = drop.fresh;
    next.reward = next.loot.filter((l) => l.kind === 'module').map((l) => l.id);
    next.mateLoot = mateRow(
      run,
      meta,
      researchOwned(run.research, 'chest') ? 2 : 1,
      733,
      next.loot,
      false,
      true,
    );
    next.picked = {};
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
    mateLoot: [],
    picked: {},
    boughtBy: {},
    eventResult: '',
    rescue: '',
    shopFurniture: [],
    repairUsed: false,
    page: 'map',
    offers: [],
    bought: [],
    reward: [],
    eventDone: false,
  };
}
// Also used by save migration to spill modules that no longer fit.
export function storedItem(run: Run, id: string): Run {
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
// The second house's starting modules: the cannon, an engine and the start
// module of its own head of ОСББ, in the first rooms (as for the first house).
function mateKit(run: Run, hero: string): (string | null)[] {
  const start = CHARACTERS.find((c) => c.id === hero)?.start ?? 'workshop';
  const items = emptyEquipment();
  const targets = equipmentTargets(run).slice(0, 3);
  const kit =
    targets.length < 3
      ? ['cannon', start, 'engine']
      : ['cannon', 'engine', start];
  targets.forEach((target, index) => {
    items[target.slot] = kit[index];
  });
  return items;
}
// A partner joins the raid (or changes): the second house gets its kit.
export function withMate(run: Run, hero: string): Run {
  if (!hero) return { ...run, coop: '', mateItems: undefined, mateLoot: [] };
  return {
    ...run,
    coop: hero,
    mateItems: mateKit(run, hero),
    mateLoot: [],
    picked: {},
  };
}
// The second house as a run of its own, for the stats and the guns: its head
// of ОСББ and its modules; the rooms, furniture, research and perks are
// shared with the first house.
export function mateRun(run: Run): Run {
  return {
    ...run,
    character: run.coop || run.character,
    items: run.mateItems ?? emptyEquipment(),
  };
}
export const mateStats = (run: Run, meta: Meta): Stats =>
  statsFor(mateRun(run), meta);
// Gives a module to the second house: into a free slot of its rooms, or, when
// they are all taken, in place of its weakest module unless the new one is
// weaker still (the old one goes to the first house's backpack, or to scrap).
// Returns the run unchanged when it does not fit.
export function giveMate(run: Run, meta: Meta, id: string): Run {
  const item = ITEM_BY_ID[id];
  if (
    !run.coop ||
    run.page === 'combat' ||
    !item ||
    (!meta.unlocked.includes(id) &&
      !run.loot.some((l) => l.kind === 'module' && l.id === id) &&
      !run.mateLoot?.some((l) => l.kind === 'module' && l.id === id))
  )
    return run;
  const gear = [...(run.mateItems ?? emptyEquipment())];
  const slots = equipmentTargets(run).filter((t) => canEquipAt(run, t.slot));
  let next = run;
  let slot = slots.find((t) => !gear[t.slot])?.slot;
  if (slot === undefined) {
    const weakest = slots
      .map((t) => ({
        slot: t.slot,
        rarity: ITEM_BY_ID[gear[t.slot] ?? '']?.rarity ?? 0,
      }))
      .sort((a, b) => a.rarity - b.rarity)[0];
    if (!weakest || weakest.rarity > item.rarity || gear[weakest.slot] === id)
      return run;
    slot = weakest.slot;
    const stored = storedItem(run, gear[slot]!);
    next = stored === run ? { ...run, scrap: run.scrap + 2 } : stored;
  }
  gear[slot] = id;
  return { ...next, mateItems: gear };
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
      run: { ...run, coins: run.coins + earned(run, 25), battlesSinceRescue: 0 },
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
  return {
    run: rescueHeal(
      { ...result.run, eventDone: true, rescue: result.id },
      meta,
    ),
    meta,
    id: result.id,
  };
}
export interface CoreRow {
  label: string;
  amount: number;
  // How the amount was counted, e.g. "2 × 3".
  detail?: string;
}
// Core payouts at the end of a run.
export const CORES = {
  location: 3,
  rescue: 1,
  dawn: 3,
  kills: 50,
  killCap: 3,
};
export function finishRun(
  meta: Meta,
  run: Run,
  won: boolean,
): {
  meta: Meta;
  unlocks: string[];
  cores: number;
  projects: string[];
  coreBreakdown: CoreRow[];
  achievements: string[];
  // Run depth reached now, the new best and the best before this run.
  progress: { depth: number; best: number; previous: number };
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
    dailyBest: { ...meta.dailyBest },
    dailyAttempts: { ...meta.dailyAttempts },
    winsByCharacter: { ...meta.winsByCharacter },
    achievements: [...(meta.achievements ?? [])],
    clues: [...(meta.clues ?? [])],
    endings: [...(meta.endings ?? [])],
    secrets: [...(meta.secrets ?? [])],
    coopWins: meta.coopWins ?? 0,
    coopRevives: meta.coopRevives ?? 0,
  };
  const endless = run.mode === 'endless',
    final = won && run.chapter === 2 && !endless;
  n.runs++;
  const beaten = run.bossesDefeated + (won ? 1 : 0),
    bosses = Math.min(3, beaten);
  n.totalBosses += endless ? beaten : bosses;
  n.totalMinibosses += run.minibossKills ?? 0;
  const rescues = runRescues(run),
    depth = final ? MAX_DEPTH : runDepth(run),
    previous = meta.bestDepth ?? 0;
  n.totalRescues += rescues;
  n.eliteWins = (n.eliteWins ?? 0) + (run.eliteWins ?? 0);
  n.bestDepth = Math.max(previous, depth);
  n.coopRevives = (n.coopRevives ?? 0) + (run.coop ? (run.revives ?? 0) : 0);
  n.kills += run.kills;
  n.dashes += run.dashes;
  n.best = Math.max(n.best, run.kills);
  n.deaths = (n.deaths ?? 0) + (won ? 0 : 1);
  n.playTime = (n.playTime ?? 0) + (run.time ?? 0);
  n.totalElites = (n.totalElites ?? 0) + (run.elitesKilled ?? 0);
  n.bestCombo = Math.max(n.bestCombo ?? 0, run.bestCombo ?? 0);
  if (final) {
    // Eight finished expeditions open the last head of ОСББ.
    n.wins = Math.min(8, n.wins + 1);
    n.winsByCharacter[run.character] =
      (n.winsByCharacter[run.character] ?? 0) + 1;
    if (run.coop) n.coopWins = (n.coopWins ?? 0) + 1;
    n.bestHeat = Math.max(n.bestHeat ?? 0, run.heat ?? 0);
    n.heatUnlocked = Math.max(
      n.heatUnlocked ?? 0,
      Math.min(10, (run.heat ?? 0) + 1),
    );
  }
  if (endless) n.endlessBest = Math.max(n.endlessBest ?? 0, run.loop);
  const score = runScore(run, final);
  // A daily abandoned before its first fight is not a result: it would set a
  // zero record and count towards the daily achievements.
  if (run.mode === 'daily' && DATE_KEY.test(run.daily)) {
    const fought = score > 0 || (run.time ?? 0) > 0;
    if (run.dailyRanked && fought)
      n.dailyBest[run.daily] = Math.max(n.dailyBest[run.daily] ?? 0, score);
    // The ranked attempt of a day that was never played is not used up.
    else if (run.dailyRanked && !fought)
      n.dailyAttempts[run.daily] = Math.max(
        0,
        (n.dailyAttempts[run.daily] ?? 1) - 1,
      );
  }
  // Progress pays even in defeat: every cleared location and every rescued
  // resident, then minibosses and a capped share for the kill count. An
  // abandoned run that never won a fight earns nothing for its rescues.
  const paidRescues = run.battleCount > 0 ? rescues : 0,
    minis = Math.min(3, run.minibossKills ?? 0);
  const coreBreakdown: CoreRow[] = [
    {
      label: 'Пройдені локації',
      amount: bosses * CORES.location,
      detail: `${bosses} × ${CORES.location}`,
    },
    {
      label: 'Урятовані мешканці',
      amount: paidRescues * CORES.rescue,
      detail: `${paidRescues} × ${CORES.rescue}`,
    },
    {
      label: 'Мінібоси',
      amount: minis,
      detail: `${minis} × 1`,
    },
    {
      label: 'Бойові дані',
      amount: Math.min(CORES.killCap, Math.floor(run.kills / CORES.kills)),
      detail: `${run.kills} ворогів`,
    },
  ];
  if (final) coreBreakdown.push({ label: 'Світанок', amount: CORES.dawn });
  if (endless && run.loop > 0)
    coreBreakdown.push({
      label: 'Нескінченні кола',
      amount: Math.min(15, run.loop * 3),
    });
  const earned = coreBreakdown.reduce((sum, r) => sum + r.amount, 0);
  // Heat and daily modifiers multiply the haul; heat 0 adds no extra row.
  const bonus = Math.round(earned * heatForRun(run).coreBonus) - earned;
  if (bonus > 0) coreBreakdown.push({ label: 'Бонус складності', amount: bonus });
  const cores = earned + Math.max(0, bonus);
  n.cores += cores;
  n.lore = loreForProgress(meta.lore, n.wins, run.chapter);
  n.residents = residentRoster(meta.residents, n.wins);
  const achievements = newAchievements(n, run, final);
  n.achievements.push(...achievements);
  const unlocks = unlock(n);
  // New and still unrevealed items open the next run's first reward.
  n.fresh = [
    ...new Set([...(meta.fresh ?? []), ...(run.fresh ?? []), ...unlocks]),
  ].filter((id) => !!ITEM_BY_ID[id] && n.unlocked.includes(id));
  return {
    meta: n,
    unlocks,
    cores,
    coreBreakdown,
    progress: { depth, best: n.bestDepth, previous },
    projects: BLUEPRINTS.filter(
      (b) =>
        blueprintReady(n, b.id) &&
        !blueprintReady(meta, b.id) &&
        !n.blueprints.includes(b.id),
    ).map((b) => b.id),
    achievements,
  };
}
