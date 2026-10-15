import { ArrowLeft, Lock, Search } from 'lucide-react';
import { CLUES, ENDINGS, canEndingB, canEndingC } from '@/lib/game/story';
import type { Meta } from '@/lib/game/model';
import './dialogue.css';

// «Справа 04:17»: the evidence collected through the story and the endings.
export function CasePage({ meta, onBack }: { meta: Meta; onBack: () => void }) {
  const found = new Set(meta.clues ?? []),
    reached = new Set(meta.endings ?? []);
  const ready: Record<string, boolean> = {
    a: true,
    b: canEndingB(meta),
    c: canEndingC(meta),
  };
  return (
    <section className="collection-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} /> Головне меню
      </button>
      <p className="eyebrow">ПРИТУЛОК № 17 · ПАПКА ГАЛИНИ СТЕПАНІВНИ</p>
      <h2>Справа 04:17</h2>
      <p className="lead">
        Докази збираються з історії: розмов у Притулку, знахідок у рейдах і слів
        ворогів. Знайдено {found.size} із {CLUES.length}.
      </p>
      <div className="case-grid">
        {CLUES.map((c) => {
          const open = found.has(c.id);
          return (
            <article key={c.id} className={`clue-card ${open ? '' : 'locked'}`}>
              <h3>
                {open ? <Search size={15} /> : <Lock size={15} />}{' '}
                {open ? c.title : 'Не знайдено'}
              </h3>
              <p>
                {open
                  ? c.text
                  : 'Це ще треба з’ясувати. Послухай мешканців між рейдами.'}
              </p>
            </article>
          );
        })}
      </div>
      <h3>Кінцівки</h3>
      <p className="lead">Фінальне рішення береться біля ядра Світанку.</p>
      <div className="case-grid">
        {ENDINGS.map((e) => {
          const done = reached.has(e.id);
          return (
            <article
              key={e.id}
              className={`ending-card ${done ? '' : 'locked'}`}
            >
              <h3>{done ? e.title : 'Невідома кінцівка'}</h3>
              <p>
                {done
                  ? 'Побачена. Її можна переглянути в «Історії».'
                  : ready[e.id]
                    ? 'Умови виконані. Обери її біля ядра Світанку.'
                    : e.hint}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
