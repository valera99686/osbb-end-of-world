// Progress moments outside combat: the next goal on the unlock ladder, how
// far a run got against the best one, and where the cores came from.
import type { CSSProperties } from 'react';
import { Hexagon, Lock, Target, Trophy, Wrench } from 'lucide-react';
import {
  DEPTH_STEPS,
  MAX_DEPTH,
  depthLabel,
  depthParts,
  nextGoals,
  workshopReady,
  type Goal,
} from '@/lib/game/progression';
import type { CoreRow, Meta } from '@/lib/game/model';
import { ITEM_BY_ID } from '@/lib/game/data';
import { RESIDENT_BY_ID } from '@/lib/game/residents';
import { Glyph } from './glyph';
import { Portrait } from './residents';
import './rewards.css';

// Dialogue hook: one resident's line announcing the items a run opened, on
// the result screen. The story system registers its picker once at start-up;
// null or an unknown resident shows no line.
export interface UnlockLine {
  residentId: string;
  text: string;
}
export type UnlockLineSource = (
  itemIds: string[],
  meta: Meta,
) => UnlockLine | null | undefined;
let unlockSource: UnlockLineSource | null = null;
export function setUnlockLineSource(source: UnlockLineSource | null) {
  unlockSource = source;
}
export function unlockLine(itemIds: string[], meta: Meta): UnlockLine | null {
  try {
    const line = unlockSource?.(itemIds, meta);
    return line?.text && RESIDENT_BY_ID[line.residentId] ? line : null;
  } catch {
    // A broken line must never hide the unlocks themselves.
    return null;
  }
}

// Items opened by the finished run, framed by rarity, with the optional line.
export function UnlockList({
  ids,
  meta,
  line = unlockLine(ids, meta),
}: {
  ids: string[];
  meta: Meta;
  // Overrides the registered dialogue source; null shows no line.
  line?: UnlockLine | null;
}) {
  const items = ids.map((id) => ITEM_BY_ID[id]).filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="unlock-list">
      <b>ВІДКРИТО · {items.length}</b>
      {items.map((item) => (
        <span key={item.id} className={`unlock-chip rarity-${item.rarity}`}>
          <Glyph name={item.icon} size={15} />
          {item.name}
        </span>
      ))}
      {line && (
        <figure className="unlock-line">
          <Portrait id={line.residentId} />
          <figcaption>
            <small>{RESIDENT_BY_ID[line.residentId].name}</small>«{line.text}»
          </figcaption>
        </figure>
      )}
      <small>
        Новинки чекатимуть у першій нагороді наступного рейду з позначкою
        «НОВЕ».
      </small>
    </div>
  );
}

const KIND_LABEL: Record<Goal['kind'], string> = {
  item: 'НОВИЙ МОДУЛЬ',
  blueprint: 'КРЕСЛЕННЯ',
  modifier: 'МОДИФІКАТОР РЕЙДУ',
};

function GoalRow({ goal }: { goal: Goal }) {
  const share = goal.target ? goal.value / goal.target : 0;
  return (
    <div className="goal-row">
      <span className="goal-icon">
        <Glyph name={goal.icon} size={22} />
      </span>
      <div className="goal-body">
        <small>{KIND_LABEL[goal.kind]}</small>
        <b>{goal.name}</b>
        <span className="goal-text">
          {goal.ready ? <Wrench size={13} /> : <Lock size={13} />} {goal.text}
        </span>
        {/* The count beside it carries the value for screen readers. */}
        <div className="goal-bar" aria-hidden="true">
          <i style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      </div>
      <em className="goal-count">
        {goal.progress ?? `${goal.value}/${goal.target}`}
      </em>
    </div>
  );
}

// 'Наступна ціль': the nearest unlock, blueprint or modifier with a bar.
export function NextGoal({
  meta,
  count = 1,
  className = '',
}: {
  meta: Meta;
  count?: number;
  className?: string;
}) {
  const goals = nextGoals(meta, count),
    shopping = workshopReady(meta);
  if (!goals.length && !shopping) return null;
  return (
    <section className={`next-goal ${className}`} aria-label="Наступна ціль">
      <p className="next-goal-title">
        <Target size={15} /> НАСТУПНА ЦІЛЬ
      </p>
      {goals.map((goal) => (
        <GoalRow key={goal.kind + goal.id} goal={goal} />
      ))}
      {shopping > 0 && (
        <p className="next-goal-ready">
          <Hexagon size={14} /> У майстерні вже можна придбати: {shopping}
        </p>
      )}
    </section>
  );
}

// Three location segments filled to this run's depth, with the best mark.
export function RunProgress({
  depth,
  best,
  previous,
  caption,
}: {
  depth: number;
  best: number;
  previous: number;
  caption?: string;
}) {
  const record = depth > previous && previous > 0;
  // The best mark sits inside its location's segment (5 px gaps between).
  const top = depthParts(best),
    segment = top.location - 1,
    at = `calc((100% - 10px) / 3 * ${segment + top.step / DEPTH_STEPS} + ${segment * 5}px)`;
  return (
    <section className="run-progress" aria-label="Як далеко зайшов будинок">
      <div className="run-progress-head">
        <span>
          <b>{depthLabel(depth)}</b>
          <small>
            {caption ??
              (depth >= MAX_DEPTH
                ? 'Усі три локації пройдено'
                : 'Так далеко дійшов будинок цього разу')}
          </small>
        </span>
        <span className={`run-progress-best ${record ? 'record' : ''}`}>
          <Trophy size={14} />{' '}
          {record
            ? 'Новий рекорд!'
            : `Рекорд: ${best ? depthLabel(best) : '—'}`}
        </span>
      </div>
      {/* The label above carries the depth for screen readers. */}
      <div className="depth-track" aria-hidden="true">
        {[0, 1, 2].map((location) => (
          <span key={location} className="depth-segment">
            <i
              style={{
                width: `${Math.max(0, Math.min(DEPTH_STEPS, depth - location * DEPTH_STEPS)) * 10}%`,
              }}
            />
            <small>{location + 1}</small>
          </span>
        ))}
        {best > 0 && (
          <em
            className="depth-best"
            style={{ '--at': at } as CSSProperties}
            title={`Рекорд: ${depthLabel(best)}`}
          />
        )}
      </div>
    </section>
  );
}

// Where this run's cores came from: one line per source and the total.
export function CoreBreakdown({
  rows,
  total,
}: {
  rows: CoreRow[];
  total: number;
}) {
  return (
    <section className="core-breakdown" aria-label="Зароблені ядра">
      {rows.map((row) => (
        <div key={row.label} className={row.amount ? '' : 'empty'}>
          <span>{row.label}</span>
          {row.detail && <small>{row.detail}</small>}
          <b>+{row.amount}</b>
        </div>
      ))}
      <div className="core-total">
        <span>Разом</span>
        <b>
          <Hexagon size={15} /> {total}
        </b>
      </div>
    </section>
  );
}
