import { Coins, Home, ArrowRight, Check, Package } from 'lucide-react';
import { FurnitureIcon } from './furniture';
import { FURNITURE_BY_ID, furnitureEffect } from '@/lib/game/furniture';
import {
  statsFor,
  eventFor,
  canChooseEvent,
  resolveEvent,
  nextNode,
  type Run,
  type Meta,
} from '@/lib/game/model';

export function FurnitureCard({
  id,
  footer,
  onClick,
  disabled = false,
}: {
  id: string;
  footer: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  const item = FURNITURE_BY_ID[id];
  return (
    <button
      className="item-card furniture-reward"
      onClick={onClick}
      disabled={disabled}
    >
      <div className="item-top">
        <span className="item-emblem">
          <FurnitureIcon id={id} size={32} />
        </span>
        <span className="rarity">МЕБЛІ</span>
      </div>
      <h3>{item.name}</h3>
      <span className="family-label">Один слот усередині квартири</span>
      <p>
        {furnitureEffect(id, null).label}. {item.bonus}.
      </p>
      <div className="item-footer">{footer}</div>
    </button>
  );
}
export function CampaignEventPanel({
  run,
  meta,
  onChange,
}: {
  run: Run;
  meta: Meta;
  onChange: (run: Run) => void;
}) {
  const rest = run.kind === 'rest',
    event = eventFor(run);
  return (
    <>
      <p className="eyebrow">
        {rest ? 'ПЕРЕПОЧИНОК' : `ЗУСТРІЧ · ЛОКАЦІЯ ${run.chapter + 1}`}
      </p>
      <h2>{rest ? 'Тихе подвір’я' : event.title}</h2>
      <p className="lead">
        {rest
          ? 'Зупини двигун на кілька хвилин: полагодь будинок або пошукай припаси.'
          : event.text}
      </p>
      {run.eventDone ? (
        <div className="mission-banner" role="status">
          <Check size={22} />
          <p>{run.eventResult}</p>
        </div>
      ) : (
        <div className="event-options">
          {rest ? (
            <>
              <button
                className="event-option"
                onClick={() => onChange(resolveEvent(run, meta, 0))}
              >
                <b>Відремонтувати будинок</b>
                <span>+35% максимальної міцності</span>
                <Home size={22} />
              </button>
              <button
                className="event-option"
                onClick={() => onChange(resolveEvent(run, meta, 1))}
              >
                <b>Обшукати подвір’я</b>
                <span>+20 монет · +3 брухту</span>
                <Coins size={22} />
              </button>
            </>
          ) : (
            event.choices.map((choice, i) => (
              <button
                className="event-option"
                key={i}
                disabled={!canChooseEvent(run, meta, choice.effect)}
                onClick={() => onChange(resolveEvent(run, meta, i))}
              >
                <b>{choice.label}</b>
                <span>
                  {choice.detail}
                  {choice.effect.damageMax
                    ? ` · ${Math.ceil(statsFor(run, meta).health * choice.effect.damageMax)} міцності`
                    : ''}
                </span>
                <Package size={22} />
              </button>
            ))
          )}
        </div>
      )}
      <button
        className={run.eventDone ? 'primary' : 'text-button'}
        onClick={() => onChange(nextNode(run))}
      >
        {run.eventDone ? 'Рушати далі' : 'Продовжити шлях без угоди'}{' '}
        <ArrowRight size={18} />
      </button>
    </>
  );
}
