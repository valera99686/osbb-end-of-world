// Level-up draft: three perk cards, each offered by a resident with a line.
// Keys 1/2/3, taps and the gamepad menu (focusable buttons) pick a card.
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { PERK_BY_ID, perkLevel, type PerkId } from '@/lib/game/upgrades';
import { perkOfferLine } from '@/lib/game/barks';
import { RESIDENT_BY_ID } from '@/lib/game/residents';
import type { Run } from '@/lib/game/model';
import { Portrait } from './residents';
import './perk-draft.css';

const RARITY = ['', 'Звичайний', 'Рідкісний', 'Легендарний'];

export function PerkDraft({
  run,
  offers,
  level,
  onPick,
}: {
  run: Run;
  offers: PerkId[];
  level: number;
  onPick: (id: PerkId) => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const n = [
        'Digit1',
        'Digit2',
        'Digit3',
        'Numpad1',
        'Numpad2',
        'Numpad3',
      ].indexOf(e.code);
      if (n < 0) return;
      const id = offers[n % 3];
      if (id) {
        e.preventDefault();
        onPick(id);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [offers, onPick]);
  return (
    <div
      className="perk-draft"
      data-gamepad-scope
      role="dialog"
      aria-label={`Рівень ${level}: вибери покращення`}
    >
      <header>
        <small>РІВЕНЬ {level}</small>
        <h2>Сусіди пропонують</h2>
      </header>
      <div className="perk-cards">
        {offers.map((id, i) => {
          const perk = PERK_BY_ID[id],
            owner = RESIDENT_BY_ID[perk.owner],
            stack = perkLevel(run, id);
          return (
            <button
              key={id}
              className={`perk-card perk-r${perk.rarity}`}
              style={
                {
                  '--perk-owner': owner?.color ?? '#aee6cb',
                  animationDelay: `${i * 90}ms`,
                } as CSSProperties
              }
              onClick={() => onPick(id)}
              autoFocus={i === 0}
            >
              <span className="perk-key">{i + 1}</span>
              <span className="perk-portrait">
                <Portrait id={perk.owner} />
              </span>
              <span className="perk-owner">{owner?.name}</span>
              <q className="perk-line">{perkOfferLine(perk.owner, id, run)}</q>
              <strong className="perk-name">
                {perk.name}
                {perk.max > 1 && (
                  <em>
                    {' '}
                    {stack + 1}/{perk.max}
                  </em>
                )}
              </strong>
              <span className="perk-text">{perk.text}</span>
              <small className="perk-rarity">{RARITY[perk.rarity]}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
