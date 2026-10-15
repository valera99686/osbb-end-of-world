// The rescue moment: a resident card with the painted portrait instead of a
// log line. The quote slot belongs to the dialogue system (docs/story).
import { Heart, Home, UserPlus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { RESIDENT_BY_ID } from '@/lib/game/residents';
import { researchOwned } from '@/lib/game/progression';
import type { Run } from '@/lib/game/model';
import { Portrait } from './residents';
import './rewards.css';

// Dialogue hook: returns the rescued resident's first line, or null for none.
export type RescueQuoteSource = (
  residentId: string,
  run: Run,
) => string | null | undefined;
let quoteSource: RescueQuoteSource | null = null;
// The story system registers its line picker once at start-up.
export function setRescueQuoteSource(source: RescueQuoteSource | null) {
  quoteSource = source;
}
export function rescueQuote(residentId: string, run: Run): string | null {
  try {
    return quoteSource?.(residentId, run) || null;
  } catch {
    // A broken line must never hide the rescue itself.
    return null;
  }
}

export function RescueCard({
  run,
  residentId,
  quote = rescueQuote(residentId, run),
  onHousing,
}: {
  run: Run;
  residentId: string;
  // Overrides the registered dialogue source; null shows no quote.
  quote?: string | null;
  onHousing?: () => void;
}) {
  const resident = RESIDENT_BY_ID[residentId];
  if (!resident) return null;
  const housed = run.residents.some((r) => r.id === residentId);
  return (
    <article
      className="rescue-card"
      aria-live="polite"
      style={{ '--resident-color': resident.color } as CSSProperties}
    >
      <div className="rescue-portrait">
        <Portrait id={residentId} />
      </div>
      <div className="rescue-body">
        <small className="rescue-kicker">
          <UserPlus size={14} /> УРЯТОВАНО
        </small>
        <h3>
          {resident.name} <span>· {resident.job}</span>
        </h3>
        {quote && <blockquote className="rescue-quote">«{quote}»</blockquote>}
        <p className="rescue-effect">{resident.effect}</p>
        <p className={`rescue-home ${housed ? '' : 'warn'}`}>
          <Home size={14} />{' '}
          {housed
            ? 'Квартиру заселено.'
            : 'Потрібне місце: переплануй або розшир будинок.'}
        </p>
        {researchOwned(run.research, 'medic') && (
          <p className="rescue-heal">
            <Heart size={14} /> Фельдшерка підлатала будинок: +20% міцності.
          </p>
        )}
      </div>
      {onHousing && (
        <button className="secondary small" onClick={onHousing}>
          Квартири
        </button>
      )}
    </article>
  );
}
