import { ArrowLeft, BookOpen, Lock, Radio } from 'lucide-react';
import { CHAPTERS } from '@/lib/game/data';
import { LORE } from '@/lib/game/lore';
export function LoreFragment({
  chapter,
  victory = false,
}: {
  chapter: number;
  victory?: boolean;
}) {
  const entry = LORE.find(
    (e) => e.chapter === chapter && e.unlock === (victory ? 'win' : 'visit'),
  )!;
  return (
    <details className="lore-fragment" open={victory}>
      <summary>
        <Radio size={16} />
        <span>{entry.title}</span>
      </summary>
      <small>{entry.source}</small>
      <p>{entry.body}</p>
    </details>
  );
}
export function LoreJournal({
  unlocked,
  onBack,
}: {
  unlocked: string[];
  onBack: () => void;
}) {
  return (
    <section className="collection-page lore-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} /> До притулку
      </button>
      <p className="eyebrow">АРХІВ БУДИНКУ № 17 · 04:17</p>
      <div className="collection-title">
        <div>
          <h2>Місто, яке забуло ранок</h2>
          <p className="lead">
            {unlocked.length} із {LORE.length} записів. Відвідуй райони та
            перемагай охоронців, щоб дізнатися, чому все починається знову.
          </p>
        </div>
        <BookOpen size={42} className="muted" />
      </div>
      <div className="lore-grid">
        {LORE.map((entry, index) =>
          unlocked.includes(entry.id) ? (
            <article className="lore-entry" key={entry.id}>
              <span className="eyebrow">
                ЗАПИС {String(index + 1).padStart(2, '0')} ·{' '}
                {entry.unlock === 'start'
                  ? 'ПРИТУЛОК'
                  : CHAPTERS[entry.chapter].short}
              </span>
              <h3>{entry.title}</h3>
              <small>{entry.source}</small>
              <p>{entry.body}</p>
            </article>
          ) : (
            <article className="lore-entry sealed" key={entry.id}>
              <Lock size={23} />
              <h3>Нерозшифрований запис</h3>
              <p>
                {entry.unlock === 'visit'
                  ? 'Відвідай район'
                  : 'Переможи охоронця району'}{' '}
                «{CHAPTERS[entry.chapter].name}».
              </p>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
