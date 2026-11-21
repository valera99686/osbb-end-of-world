import { ENEMY_DEFS, campaignBoss } from './encounters';
import { MINIBOSS_TYPE, minibossFor } from './minibosses';

// What a profile has met in fights, for the gallery: `enemy:<type>`,
// `boss:<id>` and `mini:<location>-<variant>`.
export const ENEMY_KEYS = ENEMY_DEFS.map((d) => `enemy:${d.type}`);
export const LEADERS = [0, 1, 2].flatMap((chapter) =>
  [0, 1, 2].map((variant) => {
    const boss = campaignBoss(chapter, variant);
    const mini = minibossFor(chapter, variant);
    return {
      chapter,
      variant,
      boss: {
        key: `boss:${boss.id}`,
        id: boss.id,
        name: boss.name,
        guide: boss.guide,
      },
      mini: {
        key: `mini:${chapter}-${variant}`,
        name: mini.name,
        guide: mini.guide,
      },
    };
  }),
);
const KNOWN = new Set([
  ...ENEMY_KEYS,
  ...LEADERS.flatMap((l) => [l.boss.key, l.mini.key]),
]);
export const knownMet = (key: unknown): key is string =>
  typeof key === 'string' && KNOWN.has(key);

// The key of an enemy on the arena (null for a courier or a leader's helper).
export function metKey(
  type: number,
  chapter: number,
  bossVariant: number,
  miniVariant: number,
): string | null {
  const key =
    type === 99
      ? `boss:${campaignBoss(chapter, bossVariant).id}`
      : type === MINIBOSS_TYPE
        ? `mini:${chapter}-${miniVariant}`
        : `enemy:${type}`;
  return KNOWN.has(key) ? key : null;
}

// A profile from before 0.44.0 kept no list: the enemies of every location it
// has walked into count as met (depth 11 is the first step of location two).
export function metBefore(runs: number, bestDepth: number): string[] {
  if (!runs) return [];
  const reached = bestDepth >= 21 ? 2 : bestDepth >= 11 ? 1 : 0;
  return ENEMY_DEFS.filter((d) => d.location <= reached).map(
    (d) => `enemy:${d.type}`,
  );
}

export function withMet<T extends { met?: string[] }>(
  meta: T,
  keys: readonly string[],
): T {
  const add = keys.filter(knownMet);
  if (add.every((k) => meta.met?.includes(k))) return meta;
  return { ...meta, met: [...new Set([...(meta.met ?? []), ...add])] };
}
