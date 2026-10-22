// Save format, migrations and portable profile codes. Split out of model.ts;
// model.ts re-exports readSave/saveData so older imports keep working.
import { BLUEPRINT_BY_ID, MAX_DEPTH, blueprintPool } from './progression';
import { isPerk } from './upgrades';
import { CLUE_BY_ID, isStoryId } from './story';
import { restoreRoomLinks, restoreRoomModes } from './apartments';
import {
  APARTMENT_SLOTS,
  RESTORED_STORAGE_LIMIT,
  equipmentTargets,
  canEquipAt,
  emptyEquipment,
} from './equipment';
import { ITEM_BY_ID, RESEARCH, LEGACY_RESEARCH, CHARACTERS } from './data';
import { type PackedItem } from './backpack';
import { loreForProgress } from './lore';
import {
  RESIDENT_BY_ID,
  residentRoster,
  restoreResidents,
  residentSpace,
  type ResidentRoom,
} from './residents';
import { restoreFurniture, FURNITURE_BY_ID } from './furniture';
import {
  sceneUnlocked,
  restoreSceneProgress,
  STORY_REVISION,
} from './cutscenes';
import { ACHIEVEMENT_BY_ID } from './achievements';
import { DATE_KEY, heatCap } from './modes';
import { isSecret } from './secrets';
import {
  campaignTree,
  compactCampaignTree,
  initialMeta,
  legacyTree,
  makeRun,
  mysteryKind,
  previousCampaignTree,
  previousMinibossCampaignTree,
  previousRandomCampaignTree,
  routeTargets,
  sanitizeSettings,
  statsFor,
  storedItem,
  unlock,
  wideCampaignTree,
  type Loot,
  type Meta,
  type NodeKind,
  type Run,
} from './model';
function finite(n: unknown, min: number, max: number, fallback: number) {
  return typeof n === 'number' && Number.isFinite(n)
    ? Math.max(min, Math.min(max, n))
    : fallback;
}
// Daily attempts by local date. A day that has a record has been played, so
// old profiles without the counter do not get a second ranked attempt.
function restoreAttempts(
  raw: unknown,
  best: Record<string, number>,
): Record<string, number> {
  const saved =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const out: Record<string, number> = {};
  for (const key of Object.keys(best)) out[key] = 1;
  for (const [key, value] of Object.entries(saved))
    if (DATE_KEY.test(key))
      out[key] = Math.max(
        out[key] ?? 0,
        Math.floor(finite(value, 0, 99, 0)),
      );
  return Object.fromEntries(
    Object.entries(out)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 400),
  );
}
// Best daily scores by local date; only the newest year is worth keeping.
function restoreScores(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter(
        ([key, value]) => DATE_KEY.test(key) && finite(value, -1, 1e9, -1) >= 0,
      )
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 400)
      .map(([key, value]) => [key, Math.floor(finite(value, 0, 1e9, 0))]),
  );
}
function restoreWins(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const saved = raw as Record<string, unknown>;
  return Object.fromEntries(
    CHARACTERS.flatMap((c) => {
      const wins = Math.floor(finite(saved[c.id], 0, 1e6, 0));
      return wins > 0 ? [[c.id, wins]] : [];
    }),
  );
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
// A saved scene position: dialogue scenes (story.ts) keep any index, the
// old illustrated cutscenes are clamped to their shots.
function restoreProgress(raw: unknown, wins: number, chapter?: number) {
  const r = raw as { id?: unknown; index?: unknown } | null;
  if (r && isStoryId(r.id) && Number.isInteger(r.index))
    return { id: r.id, index: Math.max(0, Math.min(80, r.index as number)) };
  return restoreSceneProgress(raw, wins, chapter);
}
// Unique known item ids, e.g. Meta.fresh or Run.fresh.
function itemIds(raw: unknown, allowed: string[], max = 60): string[] {
  return Array.isArray(raw)
    ? [
        ...new Set<string>(
          raw.filter(
            (id: unknown): id is string =>
              typeof id === 'string' &&
              !!ITEM_BY_ID[id] &&
              allowed.includes(id),
          ),
        ),
      ].slice(0, max)
    : [];
}
export function readSave(raw: string | null): {
  meta: Meta;
  run: Run | null;
  error?: boolean;
  // Cores given back for levelled research from 0.10 and older.
  refund?: number;
} {
  const base = initialMeta();
  if (!raw) return { meta: base, run: null };
  let refund = 0;
  try {
    const o = JSON.parse(raw);
    if (o.version !== 1 || !o.meta) throw Error('save version');
    const m = o.meta;
    // Profiles created before onboarding keep their progress and can replay from Help.
    base.tutorialDone =
      typeof m.tutorialDone === 'boolean' ? m.tutorialDone : true;
    base.tutorialStep = Math.floor(finite(m.tutorialStep, 0, 4, 0));
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
      'deaths',
      'totalElites',
      'bestCombo',
      'eliteWins',
    ] as const)
      base[k] = Math.floor(finite(m[k], 0, k === 'wins' ? 8 : 1e8, 0));
    base.totalBosses = Math.max(base.totalBosses, base.wins * 3);
    // Before 0.11 depth was not recorded: a win reached the end, a beaten
    // boss at least finished location one.
    base.bestDepth = Math.floor(
      finite(
        m.bestDepth,
        0,
        MAX_DEPTH,
        base.wins > 0 ? MAX_DEPTH : base.totalBosses > 0 ? 10 : 0,
      ),
    );
    base.settings = sanitizeSettings(m.settings);
    base.playTime = finite(m.playTime, 0, 1e9, 0);
    base.bestHeat = Math.floor(finite(m.bestHeat, 0, 10, 0));
    // Profiles that already won before heat existed get its first level.
    base.heatUnlocked = Math.max(
      base.wins > 0 ? 1 : 0,
      Math.floor(finite(m.heatUnlocked, 0, 10, 0)),
    );
    base.endlessBest = Math.floor(finite(m.endlessBest, 0, 1e4, 0));
    base.dailyBest = restoreScores(m.dailyBest);
    base.dailyAttempts = restoreAttempts(m.dailyAttempts, base.dailyBest);
    base.winsByCharacter = restoreWins(m.winsByCharacter);
    base.clues = Array.isArray(m.clues)
      ? [
          ...new Set<string>(
            m.clues.filter(
              (id: unknown) => typeof id === 'string' && !!CLUE_BY_ID[id],
            ),
          ),
        ]
      : [];
    base.endings = Array.isArray(m.endings)
      ? [
          ...new Set<'a' | 'b' | 'c'>(
            m.endings.filter(
              (id: unknown): id is 'a' | 'b' | 'c' =>
                id === 'a' || id === 'b' || id === 'c',
            ),
          ),
        ]
      : [];
    base.secrets = Array.isArray(m.secrets)
      ? [...new Set<string>(m.secrets.filter(isSecret))]
      : [];
    base.achievements = Array.isArray(m.achievements)
      ? [
          ...new Set<string>(
            m.achievements.filter(
              (id: unknown) =>
                typeof id === 'string' && !!ACHIEVEMENT_BY_ID[id],
            ),
          ),
        ]
      : [];
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
      base.research[k] = Math.floor(finite(m.research?.[k], 0, 1, 0));
    // Levelled research became one-off run modifiers in 0.11: every core
    // spent on it comes back (level L of a line cost cost × L).
    for (const [k, cost] of Object.entries(LEGACY_RESEARCH)) {
      const level = Math.floor(finite(m.research?.[k], 0, 5, 0));
      refund += (cost * level * (level + 1)) / 2;
    }
    base.cores += refund;
    base.unlocked = [
      ...new Set([
        ...base.unlocked,
        ...(Array.isArray(m.unlocked)
          ? m.unlocked.filter((id: string) => !!ITEM_BY_ID[id])
          : []),
        ...base.seen,
      ]),
    ];
    const opened = unlock(base);
    // Items a new unlock ladder opens for an older profile count as new too.
    base.fresh = itemIds(
      [...(Array.isArray(m.fresh) ? m.fresh : []), ...opened],
      base.unlocked,
    );
    base.lore = loreForProgress(Array.isArray(m.lore) ? m.lore : [], base.wins);
    base.residents = residentRoster(m.residents, base.wins);
    base.scenesSeen = Array.isArray(m.scenesSeen)
      ? [
          ...new Set<string>(
            m.scenesSeen.filter(
              (id: unknown) =>
                typeof id === 'string' &&
                (isStoryId(id) ||
                  sceneUnlocked(id, base.wins, o.run?.chapter) ||
                  ['victory-0', 'victory-1', 'arrival-1', 'arrival-2'].includes(
                    id,
                  )),
            ),
          ),
        ]
      : [];
    base.sceneProgress = restoreProgress(
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
      const daily =
        typeof r.daily === 'string' && DATE_KEY.test(r.daily) ? r.daily : '';
      // A daily run without its date cannot be scored, so it plays on as a
      // regular campaign rather than being discarded.
      const mode =
        r.mode === 'endless' || (r.mode === 'daily' && daily)
          ? r.mode
          : 'campaign';
      run = makeRun(
        base,
        r.character,
        Math.floor(finite(r.chapter, 0, 2, 0)),
        r.seed,
        { mode, heat: finite(r.heat, 0, heatCap(mode), 0), daily },
      );
      run.loop = mode === 'endless' ? Math.floor(finite(r.loop, 0, 1e4, 0)) : 0;
      // A run saved before ranking existed counts as the ranked one.
      run.dailyRanked =
        mode === 'daily' &&
        (typeof r.dailyRanked === 'boolean' ? r.dailyRanked : true);
      for (const k of [
        'elitesKilled',
        'bestCombo',
        'bossNoHit',
        'maxBattleKills',
        'eventsCompleted',
      ] as const)
        run[k] = Math.floor(finite(r[k], 0, 1e6, 0));
      // Saves from before 0.10 did not count repairs. Past the very first room
      // the history is unknown, so such a run cannot earn "Без ремонту".
      run.repairs =
        typeof r.repairs === 'number'
          ? Math.floor(finite(r.repairs, 0, 1e6, 0))
          : run.chapter === 0 && r.step === 0
            ? 0
            : 1;
      run.damageTaken = finite(r.damageTaken, 0, 1e9, 0);
      run.battleDamage = finite(r.battleDamage, 0, 1e9, 0);
      // 0.11 fields; older runs had no draft, no pending reveals.
      run.eliteWins = Math.floor(finite(r.eliteWins, 0, 1e6, 0));
      run.fresh = itemIds(r.fresh, base.unlocked);
      run.perks = Array.isArray(r.perks)
        ? r.perks
            .filter(
              (id: unknown): id is string =>
                typeof id === 'string' && isPerk(id),
            )
            .slice(0, 80)
        : [];
      run.draft = itemIds(r.draft, base.unlocked, 3);
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
      run.rescue =
        typeof r.rescue === 'string' && run.rescued.includes(r.rescue)
          ? r.rescue
          : '';
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
            .map(
              (l: Loot): Loot =>
                l.fresh === true && l.kind === 'module'
                  ? { kind: l.kind, id: l.id, fresh: true }
                  : { kind: l.kind, id: l.id },
            )
        : [];
      // Endless circuits keep counting past a single campaign's range.
      run.battleCount = Math.floor(finite(r.battleCount, 0, 1e4, 0));
      run.battlesSinceRescue = Math.floor(
        finite(r.battlesSinceRescue, 0, 100, 0),
      );
      run.bossesDefeated = Math.floor(
        finite(
          r.bossesDefeated,
          0,
          2 + run.loop * 3,
          run.chapter + run.loop * 3,
        ),
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
      run.minibossKills = Math.floor(finite(r.minibossKills, 0, 1e4, 0));
      if (r.research) {
        for (const key of RESEARCH.map((r) => r.id))
          run.research[key] = Math.floor(
            finite(r.research[key], 0, base.research[key], 0),
          );
        // A run launched with the old levelled research keeps its bonuses
        // to the end (statsFor still reads them); the profile got a refund.
        for (const key of Object.keys(LEGACY_RESEARCH)) {
          const level = Math.floor(finite(r.research[key], 0, 5, 0));
          if (level > 0) run.research[key] = level;
        }
      }
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
        base.sceneProgress = restoreProgress(
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
    return refund > 0 ? { meta: base, run, refund } : { meta: base, run };
  } catch {
    return { meta: base, run: null, error: true };
  }
}
export function saveData(meta: Meta, run: Run | null) {
  return JSON.stringify({ version: 1, meta, run });
}
const SAVE_PREFIX = 'OSBB1:';
// UTF-8 aware: resident names and event texts are Cyrillic.
function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  if (typeof btoa !== 'function') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decodeBase64(code: string) {
  const bytes =
    typeof atob === 'function'
      ? Uint8Array.from(atob(code), (c) => c.charCodeAt(0))
      : Uint8Array.from(Buffer.from(code, 'base64'));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
// A portable profile code for moving progress between devices.
export function exportSave(meta: Meta, run: Run | null): string {
  return SAVE_PREFIX + encodeBase64(saveData(meta, run));
}
export function importSave(text: string): {
  meta: Meta;
  run: Run | null;
  error?: boolean;
} {
  const fail = { meta: initialMeta(), run: null, error: true };
  if (typeof text !== 'string') return fail;
  let code = text.trim();
  if (code.slice(0, SAVE_PREFIX.length).toUpperCase() === SAVE_PREFIX)
    code = code.slice(SAVE_PREFIX.length).trim();
  let json = code;
  // Raw JSON from an old backup is accepted as is; codes may be line-wrapped.
  if (!code.startsWith('{')) {
    code = code.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(code)) return fail;
    try {
      json = decodeBase64(code);
    } catch {
      return fail;
    }
  }
  const result = readSave(json);
  return result.error ? fail : result;
}
