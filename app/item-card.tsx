// The cards and chips of the finds, shared by the host's screens and the
// guest's (the two see the same pages).
import type { CSSProperties } from 'react';
import { ITEM_BY_ID, FAMILY, RARITIES, type Item } from '@/lib/game/data';
import { FURNITURE_BY_ID } from '@/lib/game/furniture';
import { activeEquipment } from '@/lib/game/equipment';
import { evolutionHint, type WeaponId } from '@/lib/game/weapons';
import { mateRun, type Run } from '@/lib/game/model';
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
export function rewardNote(run: Run) {
  if (!run.coop) return '';
  const mine = takenText(run.picked?.host),
    yours = takenText(run.picked?.mate);
  return mine || yours
    ? `: господар — ${mine || 'ще обирає'}, ти — ${yours || 'ще обирає'}`
    : ' для вас обох';
}
export function shopNote(run: Run) {
  if (!run.coop) return '';
  const sold = Object.entries(run.boughtBy ?? {}).filter(([i]) =>
    run.bought.includes(+i),
  );
  if (!sold.length) return '';
  const gear = (who: 'host' | 'mate') =>
    sold
      .filter(([, w]) => w === who)
      .map(([i]) => ITEM_BY_ID[run.offers[+i]]?.name)
      .filter(Boolean)
      .join(', ');
  const mine = gear('host'),
    yours = gear('mate');
  return `: куплено${mine ? ` господарю — ${mine}` : ''}${mine && yours ? ';' : ''}${yours ? ` тобі — ${yours}` : ''}`;
}
// What the second house carries, as a row of chips.
export function MateGear({ run, name }: { run: Run; name: string }) {
  const ids = activeEquipment(mateRun(run)).map((i) => i.id);
  return (
    <div className="mate-gear">
      <b>{name}</b>
      {ids.length ? (
        ids.map((id, i) => (
          <span
            key={id + i}
            className={`mate-chip rarity-${ITEM_BY_ID[id].rarity}`}
            title={ITEM_BY_ID[id].desc}
          >
            <Glyph name={ITEM_BY_ID[id].icon} size={14} /> {ITEM_BY_ID[id].name}
          </span>
        ))
      ) : (
        <span className="mate-chip">порожньо</span>
      )}
    </div>
  );
}
export function ItemCard({
  item,
  footer,
  onClick,
  disabled,
  compact = false,
  fresh = false,
}: {
  item: Item;
  footer?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
  // Newly unlocked: tagged 'НОВЕ' on its first appearance.
  fresh?: boolean;
}) {
  const className = `item-card rarity-${item.rarity} ${compact ? 'compact' : ''} ${fresh ? 'fresh' : ''}`;
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
