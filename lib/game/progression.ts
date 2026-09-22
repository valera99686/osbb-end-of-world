import { ITEM_BY_ID, RESEARCH } from './data';
import { FURNITURE_BY_ID } from './furniture';
import type { Meta } from './model';

export type Milestone =
  | 'kills'
  | 'runs'
  | 'totalBosses'
  | 'totalMinibosses'
  | 'totalRescues'
  | 'wins';
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
    gate: 'totalMinibosses',
    target: 2,
    requirement: 'Перемогти 2 мінібосів',
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
    gate: 'wins',
    target: 1,
    requirement: 'Завершити повний рейд перемогою',
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
    gate: 'kills',
    target: 25,
    requirement: 'Знищити 25 ворогів',
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
    target: 100,
    requirement: 'Знищити 100 ворогів',
  },
  {
    id: 'courier_rails',
    kind: 'module',
    cost: 5,
    gate: 'totalRescues',
    target: 4,
    requirement: 'Урятувати 4 мешканців',
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
    target: 1,
    requirement: 'Перемогти боса локації',
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
  return !!b && (meta[b.gate] ?? 0) >= b.target;
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
  };
}
export function buyResearch(meta: Meta, id: string): Meta {
  const r = RESEARCH.find((r) => r.id === id),
    level = meta.research[id] ?? 0;
  if (!r || level >= 5 || meta.cores < r.cost * (level + 1)) return meta;
  return {
    ...meta,
    cores: meta.cores - r.cost * (level + 1),
    research: { ...meta.research, [id]: level + 1 },
  };
}
export function blueprintPool(run: { blueprints?: string[] }, id: string) {
  return !BLUEPRINT_BY_ID[id] || !!run.blueprints?.includes(id);
}
