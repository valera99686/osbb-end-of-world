// The cards and chips of the finds, shared by the host's screens and the
// guest's (the two see the same pages).
import type { CSSProperties } from 'react';
import { ITEM_BY_ID, FAMILY, RARITIES, type Item } from '@/lib/game/data';
import { FURNITURE_BY_ID } from '@/lib/game/furniture';
import { evolutionHint, type WeaponId } from '@/lib/game/weapons';
import type { Run } from '@/lib/game/model';
import { Glyph } from './glyph';

// Weapon cores name the neighbour that evolves them.
export function EvolutionHint({ weapon }: { weapon: WeaponId }) {
  const evo = evolutionHint(weapon),
    partner = evo && ITEM_BY_ID[evo.partner];
  if (!evo || !partner) return null;
  return (
    <small className="evolution-hint">
      Поруч із «{partner.name}» → <b>{evo.name}</b>
    </small>
  );
}
// What the host tells the guest about the finds (the guest has no cards of
// its own): who took what from the reward and what the shop sold to whom.
export function takenText(id?: string) {
  return id ? (ITEM_BY_ID[id]?.name ?? FURNITURE_BY_ID[id]?.name ?? '') : '';
}
// What the guests read of the host's reward: who took what, by seat.
export function rewardNote(run: Run) {
  if (!run.coop) return '';
  const seats = [0, ...(run.mates ?? []).map((_, i) => i + 1)];
  const took = seats.map((s) => takenText(run.picked?.[s]));
  if (!took.some(Boolean))
    return seats.length > 2 ? ' для всіх' : ' для вас обох';
  return (
    ': ' +
    seats
      .map(
        (s, i) =>
          `${s === 0 ? 'господар' : `гравець ${s + 1}`} — ${took[i] || 'ще обирає'}`,
      )
      .join(', ')
  );
}
export function shopNote(run: Run) {
  if (!run.coop) return '';
  const sold = Object.entries(run.boughtBy ?? {}).filter(([i]) =>
    run.bought.includes(+i),
  );
  if (!sold.length) return '';
  const gear = (who: number) =>
    sold
      .filter(([, w]) => +w === who)
      .map(([i]) => ITEM_BY_ID[run.offers[+i]]?.name)
      .filter(Boolean)
      .join(', ');
  const parts = [0, ...(run.mates ?? []).map((_, i) => i + 1)]
    .map((s) => [s, gear(s)] as const)
    .filter(([, text]) => text)
    .map(
      ([s, text]) => `${s === 0 ? 'господарю' : `гравцю ${s + 1}`} — ${text}`,
    );
  return parts.length ? `: куплено ${parts.join('; ')}` : ': куплено';
}
export function ItemCard({
  item,
  footer,
  onClick,
  disabled,
  compact = false,
  fresh = false,
  locked = false,
}: {
  item: Item;
  footer?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
  // Newly unlocked: tagged 'НОВЕ' on its first appearance.
  fresh?: boolean;
  // Shown for looking at (the other player's row), not to be taken.
  locked?: boolean;
}) {
  const className = `item-card rarity-${item.rarity} ${compact ? 'compact' : ''} ${fresh ? 'fresh' : ''} ${locked ? 'locked' : ''}`;
  const content = (
    <>
      {fresh && <span className="new-badge">НОВЕ</span>}
      <div className="item-top">
        <span className="item-emblem">
          <Glyph name={item.icon} size={compact ? 22 : 34} />
        </span>
        <span className="rarity">{RARITIES[item.rarity]}</span>
      </div>
      <h3>{item.name}</h3>
      <span className="family-label">{FAMILY[item.family].name}</span>
      <p>{item.desc}</p>
      {!compact && item.weapon && <EvolutionHint weapon={item.weapon} />}
      {footer && <div className="item-footer">{footer}</div>}
    </>
  );
  return onClick ? (
    <button
      className={className}
      style={{ '--item-color': FAMILY[item.family].color } as CSSProperties}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  ) : (
    <article
      className={className}
      style={{ '--item-color': FAMILY[item.family].color } as CSSProperties}
    >
      {content}
    </article>
  );
}
// Reveal cue for a set of reward cards: the best card's sound lands with its
// flip (cards flip 140 ms apart; see rewards.css).
