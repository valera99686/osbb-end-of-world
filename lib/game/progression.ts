import { ITEMS, ITEM_BY_ID, RESEARCH, UNLOCK_TEXT } from './data';
import { FURNITURE_BY_ID } from './furniture';
import type { Meta, Run } from './model';

// Lifetime counters on Meta that unlocks, blueprints and goals can follow.
export type Milestone =
  | 'kills'
  | 'runs'
  | 'totalBosses'
  | 'totalMinibosses'
  | 'totalRescues'
  | 'wins'
  | 'dashes'
  | 'scrapped'
  | 'deaths'
  | 'eliteWins'
  | 'bestDepth';
export function milestoneValue(meta: Meta, gate: Milestone): number {
  const value = meta[gate];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
// Item unlock keys (Item.unlock in data.ts) that follow a lifetime counter.
// Behaviour-changing items sit on milestones a losing run can reach; pure
// stat items wait for full wins. 'start' and 'blueprint' are not listed.
export const UNLOCK_GOALS: Record<string, { gate: Milestone; target: number }> =
  {
    runs1: { gate: 'runs', target: 1 },
    kills50: { gate: 'kills', target: 50 },
    dash10: { gate: 'dashes', target: 10 },
    scrap5: { gate: 'scrapped', target: 5 },
    boss1: { gate: 'totalBosses', target: 1 },
    mini2: { gate: 'totalMinibosses', target: 2 },
    runs3: { gate: 'runs', target: 3 },
    kills300: { gate: 'kills', target: 300 },
    elite3: { gate: 'eliteWins', target: 3 },
    rescue6: { gate: 'totalRescues', target: 6 },
    // Depth 21 is the first step of location three (see runDepth).
    reach3: { gate: 'bestDepth', target: 21 },
    win1: { gate: 'wins', target: 1 },
    win2: { gate: 'wins', target: 2 },
    win3: { gate: 'wins', target: 3 },
    win4: { gate: 'wins', target: 4 },
    win5: { gate: 'wins', target: 5 },
  };
export function unlockReady(meta: Meta, key: string): boolean {
  const goal = UNLOCK_GOALS[key];
  return !!goal && milestoneValue(meta, goal.gate) >= goal.target;
}

// Run depth: ten steps per location, 30 for the last step of location three.
export const DEPTH_STEPS = 10,
  MAX_DEPTH = 30;
export function runDepth(
  run: Pick<Run, 'chapter' | 'step' | 'page' | 'nodes'> & { loop?: number },
): number {
  if ((run.loop ?? 0) > 0) return MAX_DEPTH;
  const rows = Math.max(1, run.nodes?.length || DEPTH_STEPS),
    reached = Math.max(
      0,
      Math.min(rows, run.step + (run.page === 'map' ? 0 : 1)),
    ),
    chapter = Math.max(0, Math.min(2, Math.floor(run.chapter || 0)));
  return Math.min(
    MAX_DEPTH,
    chapter * DEPTH_STEPS + Math.round((reached / rows) * DEPTH_STEPS),
  );
}
export function depthParts(depth: number) {
  const d = Math.max(0, Math.min(MAX_DEPTH, Math.floor(depth || 0)));
  if (!d) return { location: 1, step: 0 };
  const location = Math.floor((d - 1) / DEPTH_STEPS);
  return { location: location + 1, step: d - location * DEPTH_STEPS };
}
export function depthLabel(depth: number) {
  const { location, step } = depthParts(depth);
  return step
    ? `Локація ${location} · крок ${step}/${DEPTH_STEPS}`
    : 'Ще жодного кроку';
}
export const BLUEPRINTS: {
  id: string;
  kind: 'module' | 'furniture';
  cost: number;
  gate: Milestone;
  target: number;
  requirement: string;
}[] = [
  {
    id: 'airbag',
    kind: 'module',
    cost: 5,
    gate: 'kills',
    target: 75,
    requirement: 'Знищити 75 ворогів',
  },
  {
    id: 'flywheel',
    kind: 'module',
    cost: 7,
    gate: 'dashes',
    target: 40,
    requirement: 'Виконати 40 ривків',
  },
  {
    id: 'medpulse',
    kind: 'module',
    cost: 9,
    gate: 'totalBosses',
    target: 2,
    requirement: 'Перемогти 2 босів локацій',
  },
  {
    id: 'redline',
    kind: 'module',
    cost: 8,
    gate: 'deaths',
    target: 2,
    requirement: 'Програти 2 експедиції',
  },
  {
    id: 'firedoor',
    kind: 'furniture',
    cost: 5,
    gate: 'totalRescues',
    target: 3,
    requirement: 'Урятувати 3 мешканців',
  },
  {
    id: 'soupstation',
    kind: 'furniture',
    cost: 4,
    gate: 'kills',
    target: 50,
    requirement: 'Знищити 50 ворогів',
  },
  {
    id: 'chargingseat',
    kind: 'furniture',
    cost: 6,
    gate: 'totalMinibosses',
    target: 2,
    requirement: 'Перемогти 2 мінібосів',
  },
  {
    id: 'seedlibrary',
    kind: 'furniture',
    cost: 5,
    gate: 'totalRescues',
    target: 4,
    requirement: 'Урятувати 4 мешканців',
  },
  {
    id: 'rescue_beacon',
    kind: 'module',
    cost: 3,
    gate: 'totalRescues',
    target: 8,
    requirement: 'Урятувати 8 мешканців',
  },
  {
    id: 'toolwall',
    kind: 'furniture',
    cost: 2,
    gate: 'kills',
    target: 25,
    requirement: 'Знищити 25 ворогів',
  },
  {
    id: 'hammock',
    kind: 'furniture',
    cost: 3,
    gate: 'totalRescues',
    target: 2,
    requirement: 'Урятувати 2 мешканців',
  },
  {
    id: 'workshop_cooler',
    kind: 'module',
    cost: 5,
    gate: 'kills',
    target: 400,
    requirement: 'Знищити 400 ворогів',
  },
  {
    id: 'courier_rails',
    kind: 'module',
    cost: 5,
    gate: 'totalRescues',
    target: 10,
    requirement: 'Урятувати 10 мешканців',
  },
  {
    id: 'ramp',
    kind: 'furniture',
    cost: 4,
    gate: 'totalMinibosses',
    target: 1,
    requirement: 'Перемогти мінібоса',
  },
  {
    id: 'foam_shield',
    kind: 'module',
    cost: 7,
    gate: 'totalBosses',
    target: 3,
    requirement: 'Перемогти 3 босів локацій',
  },
  {
    id: 'relayDesk',
    kind: 'furniture',
    cost: 5,
    gate: 'totalBosses',
    target: 1,
    requirement: 'Перемогти боса локації',
  },
  {
    id: 'induction',
    kind: 'module',
    cost: 8,
    gate: 'totalMinibosses',
    target: 3,
    requirement: 'Перемогти 3 мінібосів',
  },
  {
    id: 'vivarium',
    kind: 'module',
    cost: 8,
    gate: 'totalBosses',
    target: 2,
    requirement: 'Перемогти 2 босів локацій',
  },
  {
    id: 'aquarium',
    kind: 'furniture',
    cost: 6,
    gate: 'totalBosses',
    target: 2,
    requirement: 'Перемогти 2 босів локацій',
  },
  {
    id: 'echo_lens',
    kind: 'module',
    cost: 11,
    gate: 'wins',
    target: 1,
    requirement: 'Завершити повний рейд перемогою',
  },
  {
    id: 'starchart',
    kind: 'furniture',
    cost: 8,
    gate: 'wins',
    target: 1,
    requirement: 'Завершити повний рейд перемогою',
  },
  {
    id: 'pulse_core',
    kind: 'module',
    cost: 14,
    gate: 'wins',
    target: 2,
    requirement: 'Завершити 2 повні рейди перемогою',
  },
];
export const BLUEPRINT_BY_ID = Object.fromEntries(
  BLUEPRINTS.map((b) => [b.id, b]),
);
export function blueprintReady(meta: Meta, id: string) {
  const b = BLUEPRINT_BY_ID[id];
  return !!b && milestoneValue(meta, b.gate) >= b.target;
}
export function blueprintInfo(id: string) {
  const b = BLUEPRINT_BY_ID[id];
  if (b.kind === 'module') {
    const i = ITEM_BY_ID[id];
    return { name: i.name, icon: i.icon, description: i.desc };
  }
  const f = FURNITURE_BY_ID[id];
  return {
    name: f.name,
    icon: f.icon,
    description: `+${f.stat === 'rate' || f.stat === 'crit' ? Math.round(f.value * 100) + '%' : f.value} ${f.unit}. ${f.bonus}.`,
  };
}
export function buyBlueprint(meta: Meta, id: string): Meta {
  const b = BLUEPRINT_BY_ID[id];
  if (
    !b ||
    !blueprintReady(meta, id) ||
    meta.blueprints.includes(id) ||
    meta.cores < b.cost
  )
    return meta;
  return {
    ...meta,
    cores: meta.cores - b.cost,
    blueprints: [...meta.blueprints, id],
    unlocked:
      b.kind === 'module'
        ? [...new Set([...meta.unlocked, id])]
        : meta.unlocked,
    // A bought module opens the next run's first reward, tagged 'НОВЕ'.
    fresh:
      b.kind === 'module'
        ? [...new Set([...(meta.fresh ?? []), id])]
        : meta.fresh,
  };
}
export function researchOwned(
  research: Record<string, number> | undefined,
  id: string,
) {
  return (research?.[id] ?? 0) >= 1;
}
// Run modifiers are bought once; they apply from the next new run.
export function buyResearch(meta: Meta, id: string): Meta {
  const r = RESEARCH.find((r) => r.id === id);
  if (
    !r ||
    researchOwned(meta.research, id) ||
    meta.runs < r.runs ||
    meta.cores < r.cost
  )
    return meta;
  return {
    ...meta,
    cores: meta.cores - r.cost,
    research: { ...meta.research, [id]: 1 },
  };
}
export function blueprintPool(run: { blueprints?: string[] }, id: string) {
  return !BLUEPRINT_BY_ID[id] || !!run.blueprints?.includes(id);
}

export interface Goal {
  kind: 'item' | 'blueprint' | 'modifier';
  id: string;
  name: string;
  icon: string;
  // What to do, as shown under the name.
  text: string;
  value: number;
  target: number;
  // Replaces "value/target" where a plain count reads badly (run depth).
  progress?: string;
  // Done: only a workshop purchase is left.
  ready: boolean;
}
function goal(
  kind: Goal['kind'],
  id: string,
  info: { name: string; icon: string },
  text: string,
  value: number,
  target: number,
  progress?: string,
): Goal {
  return {
    kind,
    id,
    name: info.name,
    icon: info.icon,
    text,
    value: Math.max(0, Math.min(target, Math.floor(value))),
    target,
    ...(progress ? { progress } : {}),
    ready: value >= target,
  };
}
// Everything still ahead on the unlock ladder, the nearest first: the largest
// share already done, then the smallest remaining gap. Finished goals that
// only wait for a workshop purchase come last and are flagged 'ready'.
export function nextGoals(meta: Meta, limit = 3): Goal[] {
  const all: Goal[] = [];
  for (const item of ITEMS) {
    const rule = UNLOCK_GOALS[item.unlock];
    if (!rule || meta.unlocked.includes(item.id)) continue;
    const value = milestoneValue(meta, rule.gate);
    all.push(
      goal(
        'item',
        item.id,
        item,
        UNLOCK_TEXT[item.unlock] ?? '',
        value,
        rule.target,
        rule.gate === 'bestDepth' ? depthLabel(value) : undefined,
      ),
    );
  }
  for (const b of BLUEPRINTS) {
    if (meta.blueprints.includes(b.id)) continue;
    const info = blueprintInfo(b.id);
    all.push(
      blueprintReady(meta, b.id)
        ? goal(
            'blueprint',
            b.id,
            info,
            `Креслення в майстерні: ${b.cost} ядер`,
            meta.cores,
            b.cost,
          )
        : goal(
            'blueprint',
            b.id,
            info,
            b.requirement,
            milestoneValue(meta, b.gate),
            b.target,
          ),
    );
  }
  for (const r of RESEARCH) {
    if (researchOwned(meta.research, r.id)) continue;
    all.push(
      meta.runs < r.runs
        ? goal(
            'modifier',
            r.id,
            r,
            `Відкриється після ${r.runs} експедицій`,
            meta.runs,
            r.runs,
          )
        : goal(
            'modifier',
            r.id,
            r,
            `Модифікатор рейду в майстерні: ${r.cost} ядер`,
            meta.cores,
            r.cost,
          ),
    );
  }
  // A goal already met but not bought is a shopping item, not a target.
  const open = all.filter((g) => !g.ready || g.kind !== 'item');
  return open
    .sort(
      (a, b) =>
        Number(a.ready) - Number(b.ready) ||
        b.value / b.target - a.value / a.target ||
        a.target - a.value - (b.target - b.value),
    )
    .slice(0, limit);
}
// Purchases the workshop can make right now.
export function workshopReady(meta: Meta): number {
  return (
    BLUEPRINTS.filter(
      (b) =>
        !meta.blueprints.includes(b.id) &&
        blueprintReady(meta, b.id) &&
        meta.cores >= b.cost,
    ).length +
    RESEARCH.filter(
      (r) =>
        !researchOwned(meta.research, r.id) &&
        meta.runs >= r.runs &&
        meta.cores >= r.cost,
    ).length
  );
}
