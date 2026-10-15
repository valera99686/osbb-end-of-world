import { useState } from 'react';
import { ArrowLeft, Check, Hexagon, Lock, ArrowRight } from 'lucide-react';
import { RESEARCH } from '@/lib/game/data';
import {
  BLUEPRINTS,
  blueprintInfo,
  blueprintReady,
  buyBlueprint,
  buyResearch,
  milestoneValue,
  researchOwned,
} from '@/lib/game/progression';
import type { Meta } from '@/lib/game/model';
import { Glyph } from './glyph';
import { NextGoal } from './progress-goal';
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
        ? 'Модифікатор придбано. Діє з наступного нового рейду.'
        : `${blueprintInfo(id).name}: креслення придбано. Предмет чекатиме в першій нагороді наступного рейду.`,
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
          <b>01 · Здобувай</b>Ядра за пройдені локації, урятованих мешканців,
          мінібосів і бойові дані — навіть після поразки.
        </span>
        <ArrowRight />
        <span>
          <b>02 · Досліджуй</b>Виконай умову й один раз придбай креслення.
        </span>
        <ArrowRight />
        <span>
          <b>03 · Знаходь</b>Новинка з’явиться в першій нагороді наступного
          рейду, далі — у здобичі й магазинах.
        </span>
      </div>
      <NextGoal meta={meta} count={3} className="workshop-goal" />
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
            progress = Math.min(b.target, milestoneValue(meta, b.gate));
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
          <p className="eyebrow">
            МОДИФІКАТОРИ РЕЙДУ ·{' '}
            {RESEARCH.filter((r) => researchOwned(meta.research, r.id)).length}/
            {RESEARCH.length}
          </p>
          <h3>Правила, що змінюють рейд</h3>
        </div>
        <span>Купуються один раз і діють із наступного рейду</span>
      </div>
      <div className="modifier-grid">
        {RESEARCH.map((r) => {
          const owned = researchOwned(meta.research, r.id),
            open = meta.runs >= r.runs;
          return (
            <article
              className={`modifier-card ${owned ? 'owned' : open ? '' : 'locked'}`}
              key={r.id}
            >
              <span className="modifier-icon">
                <Glyph name={r.icon} size={24} />
              </span>
              <h3>{r.name}</h3>
              <p>{r.desc}</p>
              <button
                className={owned ? 'secondary' : open ? 'primary' : 'secondary'}
                disabled={owned || !open || meta.cores < r.cost}
                onClick={() => purchase(r.id, true)}
                aria-label={`Придбати модифікатор: ${r.name}`}
              >
                {owned ? (
                  <>
                    <Check size={16} /> Діє в кожному рейді
                  </>
                ) : !open ? (
                  <>
                    <Lock size={15} /> Після {r.runs}{' '}
                    {r.runs === 1 ? 'експедиції' : 'експедицій'} ({meta.runs}/
                    {r.runs})
                  </>
                ) : (
                  <>
                    {meta.cores < r.cost ? 'Потрібно' : 'Придбати'}{' '}
                    <Hexagon size={16} /> {r.cost} ядер
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
        Модулі з кодексу відкриваються самі, коли виконано умову: перший бос,
        урятовані мешканці, перемоги над елітою, пройдена відстань. Прогрес
        зараховується після завершення рейду — перемогою чи поразкою.
      </p>
    </section>
  );
}
