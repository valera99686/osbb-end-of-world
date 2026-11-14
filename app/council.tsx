// The council of the house: between the locations the neighbours meet and take
// one decision for the location that comes: a gain and a price. Alone (or two
// at one device) one click decides; online all the players vote on the same
// table (the majority, a coin for a tie), the same as for the map.
import { Check, Gavel } from 'lucide-react';
import { PACT_BY_ID } from '@/lib/game/modes';
import { councilOffers, type Run } from '@/lib/game/model';
import { pickedNames, waitingNames, type VoteMate } from './vote';

// The columns of a council's ballot: the pacts on the table, then "leave it".
export const COUNCIL_COLUMNS = [0, 1, 2, 3];
export interface CouncilVote {
  mine: number | null;
  mates: VoteMate[];
  done?: { col: number; coin: boolean };
  // The vote is not open yet.
  note?: string;
  onVote: (col: number) => void;
}
function note(vote: CouncilVote): string {
  if (vote.note) return vote.note;
  if (vote.done)
    return vote.done.coin
      ? 'Голоси розійшлися порівну: вирішила монетка.'
      : 'Рішення ухвалено.';
  const picked = pickedNames(vote.mates),
    waiting = waitingNames(vote.mates);
  if (vote.mine === null)
    return picked
      ? `Уже обрали: ${picked}. Проголосуй і ти.`
      : 'Обери одне правило на всю локацію. Вирішує більшість, а коли порівну, монетка.';
  return waiting ? `Твій голос віддано. Чекаємо: ${waiting}.` : '';
}

export function CouncilPage({
  run,
  vote,
  onChoose,
}: {
  run: Pick<Run, 'seed' | 'chapter' | 'loop' | 'pact'>;
  vote?: CouncilVote;
  onChoose?: (id: string) => void;
}) {
  const offers = councilOffers(run);
  const pick = (col: number) =>
    vote
      ? vote.onVote(col)
      : onChoose?.(col < offers.length ? offers[col] : '');
  const locked = !!vote?.done || (vote?.note !== undefined && !vote.mine);
  const marks = (col: number) =>
    vote && (vote.mine === col || vote.mates.some((m) => m.col === col)) ? (
      <em className="event-votes">
        {vote.mine === col && <i className="me">ти</i>}
        {vote.mates.map(
          (m, i) =>
            m.col === col && (
              <i className="mate" key={i}>
                {m.name}
              </i>
            ),
        )}
      </em>
    ) : null;
  return (
    <section className="council" aria-label="Збори ОСББ">
      <p className="eyebrow">
        <Gavel size={16} /> ЗБОРИ ОСББ · ЛОКАЦІЯ {run.chapter + 1}
      </p>
      <h2>Правило для нової локації</h2>
      <p className="lead">
        Перед дорогою мешканці збираються на подвір’ї. Кожне правило щось дає й
        чогось коштує, діє до кінця локації.
      </p>
      <div className="council-pacts">
        {offers.map((id, col) => {
          const pact = PACT_BY_ID[id];
          return (
            <button
              key={id}
              type="button"
              className={`council-pact${vote?.mine === col ? ' mine' : ''}${vote?.done?.col === col ? ' chosen' : ''}`}
              disabled={locked}
              onClick={() => pick(col)}
            >
              <b>{pact.name}</b>
              <span>{pact.text}</span>
              <small className="gain">
                <Check size={13} /> {pact.gain}
              </small>
              <small className="cost">− {pact.cost}</small>
              {marks(col)}
            </button>
          );
        })}
        <button
          type="button"
          className={`council-pact stay${vote?.mine === offers.length ? ' mine' : ''}${vote?.done?.col === offers.length ? ' chosen' : ''}`}
          disabled={locked}
          onClick={() => pick(offers.length)}
        >
          <b>Залишити як є</b>
          <span>Без нових правил: усе так, як було.</span>
          {marks(offers.length)}
        </button>
      </div>
      {vote && note(vote) && (
        <p className="event-vote-note" role="status">
          {note(vote)}
        </p>
      )}
    </section>
  );
}
