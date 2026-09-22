import { useState } from 'react';
import { ArrowLeft, Check, Hexagon, Lock, ArrowRight } from 'lucide-react';
import { RESEARCH } from '@/lib/game/data';
import {
  BLUEPRINTS,
  blueprintInfo,
  blueprintReady,
  buyBlueprint,
  buyResearch,
} from '@/lib/game/progression';
import type { Meta } from '@/lib/game/model';
import { Glyph } from './glyph';
import './workshop.css';

export function Workshop({
  meta,
  onChange,
  onBack,
  onMessage,
}: {
  meta: Meta;
  onChange: (m: Meta) => void;
  onBack: () => void;
  onMessage: (s: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const available = BLUEPRINTS.filter(
    (b) => blueprintReady(meta, b.id) && !meta.blueprints.includes(b.id),
  );
  function purchase(id: string, research = false) {
    const next = research ? buyResearch(meta, id) : buyBlueprint(meta, id);
    if (next === meta) return;
    onChange(next);
    onMessage(
      research
        ? 'Покращення придбано. Діє з наступного нового рейду.'
        : `${blueprintInfo(id).name}: креслення придбано. Шукай предмет у наступних рейдах.`,
    );
  }
  return (
    <section className="collection-page workshop-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} /> Головне меню
      </button>
      <p className="eyebrow">КРЕСЛЕННЯ БУДИНКУ №17</p>
      <div className="collection-title">
        <div>
          <h2>Майстерня</h2>
          <p className="lead">
            Рейд приносить досвід. Креслення перетворюють його на нову здобич.
          </p>
        </div>
        <span className="workshop-wallet">
          <Hexagon size={24} />
          <b>{meta.cores}</b> ядер
        </span>
      </div>
      <div className="workshop-flow">
        <span>
          <b>01 · Здобувай</b>Ядра за ворогів, мінібосів і босів — навіть після
          поразки.
        </span>
        <ArrowRight />
        <span>
          <b>02 · Досліджуй</b>Виконай умову й один раз придбай креслення.
        </span>
        <ArrowRight />
        <span>
          <b>03 · Знаходь</b>Із наступного рейду предмет може випасти або
          з’явитися в магазині.
        </span>
      </div>
      <div className="workshop-section-title">
        <div>
          <p className="eyebrow">
            КОЛЕКЦІЯ · {meta.blueprints.length}/{BLUEPRINTS.length}
          </p>
          <h3>Ексклюзивні креслення</h3>
        </div>
        <span>{available.length} доступно для дослідження</span>
      </div>
      <p className="workshop-note">
        Покупка розширює список можливої здобичі. Предмети не видаються на
        старті, а поточний рейд не змінюється.
      </p>
      <div className="workshop-filters" aria-label="Фільтри креслень">
        {[
          ['all', 'Усі'],
          ['module', 'Обладнання'],
          ['furniture', 'Меблі'],
          ['ready', 'Доступні'],
          ['owned', 'Придбані'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? 'active' : ''}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="blueprint-grid">
        {BLUEPRINTS.filter(
          (b) =>
            filter === 'all' ||
            filter === b.kind ||
            (filter === 'ready' && available.includes(b)) ||
            (filter === 'owned' && meta.blueprints.includes(b.id)),
        ).map((b) => {
          const info = blueprintInfo(b.id),
            owned = meta.blueprints.includes(b.id),
            ready = blueprintReady(meta, b.id),
            progress = Math.min(b.target, meta[b.gate] ?? 0);
          return (
            <article
              className={`blueprint-card ${owned ? 'owned' : ready ? 'ready' : 'locked'}`}
              key={b.id}
            >
              <div className="blueprint-top">
                <span className="blueprint-icon">
                  <Glyph name={info.icon} size={30} />
                </span>
                <span>
                  {b.kind === 'module' ? 'МОДУЛЬ' : 'МЕБЛІ'} · ЕКСКЛЮЗИВ
                </span>
                {owned && <Check size={19} />}
              </div>
              <h3>{info.name}</h3>
              <p>{info.description}</p>
              <div className="blueprint-gate">
                <span>
                  {ready ? <Check size={15} /> : <Lock size={15} />}{' '}
                  {b.requirement}
                </span>
                <b>
                  {progress}/{b.target}
                </b>
              </div>
              <progress
                value={progress}
                max={b.target}
                aria-label={b.requirement}
              />
              <button
                className={
                  owned ? 'secondary' : ready ? 'primary' : 'secondary'
                }
                disabled={owned || !ready || meta.cores < b.cost}
                onClick={() => purchase(b.id)}
                aria-label={`Придбати креслення: ${info.name}`}
              >
                {owned ? (
                  'У здобичі нових рейдів'
                ) : !ready ? (
                  'Спочатку виконай умову'
                ) : (
                  <>
                    {meta.cores < b.cost ? 'Потрібно' : 'Дослідити'}{' '}
                    <Hexagon size={16} /> {b.cost} ядер
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
      {filter === 'ready' && !available.length && (
        <p className="workshop-empty">
          Нових доступних креслень поки немає. Умови й прогрес видно у вкладці
          «Усі».
        </p>
      )}
      {filter === 'owned' && !meta.blueprints.length && (
        <p className="workshop-empty">
          Ще немає придбаних креслень. Найперші відкриються після 25 знищених
          ворогів.
        </p>
      )}
      <div className="workshop-section-title">
        <div>
          <p className="eyebrow">ПОСТІЙНА ПІДГОТОВКА</p>
          <h3>Покращення будинку</h3>
        </div>
        <span>Діють із наступного рейду</span>
      </div>
      <div className="research-grid">
        {RESEARCH.map((r) => {
          const level = meta.research[r.id] ?? 0,
            cost = r.cost * (level + 1);
          return (
            <article className="research-card" key={r.id}>
              <span className="research-icon">
                <Glyph name={r.icon} size={28} />
              </span>
              <h3>{r.name}</h3>
              <p>{r.desc}</p>
              <div
                className="research-levels"
                aria-label={`Рівень ${level} із 5`}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={i < level ? 'done' : ''} />
                ))}
              </div>
              <button
                className="secondary"
                disabled={level >= 5 || meta.cores < cost}
                onClick={() => purchase(r.id, true)}
                aria-label={`Покращити: ${r.name}`}
              >
                {level >= 5 ? (
                  'Максимальний рівень'
                ) : (
                  <>
                    {level}/5 · <Hexagon size={16} /> {cost} ядер
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
      <div className="workshop-section-title">
        <h3>Спадщина рейдів</h3>
      </div>
      <div className="workshop-career">
        <span>
          Рейди<b>{meta.runs}</b>
        </span>
        <span>
          Боси<b>{meta.totalBosses}</b>
        </span>
        <span>
          Мінібоси<b>{meta.totalMinibosses}</b>
        </span>
        <span>
          Порятунки<b>{meta.totalRescues}</b>
        </span>
      </div>
      <p className="workshop-note">
        Після перших п’яти повних перемог також автоматично відкриваються
        звичайні тематичні набори з кодексу. Усі попередні відкриття збережені.
        Прогрес умов зараховується після завершення рейду перемогою або
        поразкою.
      </p>
    </section>
  );
}
