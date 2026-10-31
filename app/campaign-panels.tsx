import { useState } from 'react';
import {
  Coins,
  Home,
  ArrowRight,
  Check,
  Package,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
// Two players decide an event: each picks, the same pick acts, different picks
// go to a coin (coop.ts Ballot). Without it, one player just presses.
export interface EventVote {
  mine: number | null;
  partner: number | null;
  partnerName: string;
  // The choices that may be picked now.
  options: number[];
  done?: { col: number; coin: boolean };
  // Overrides the line under the choices.
  note?: string;
  onVote: (choice: number) => void;
}
interface EventItem {
  label: string;
  detail: string;
  Icon: LucideIcon;
  allowed: boolean;
}
function eventItems(run: Run, meta: Meta): EventItem[] {
  if (run.kind === 'rest')
    return [
      {
        label: 'Відремонтувати будинок',
        detail: '+35% максимальної міцності',
        Icon: Home,
        allowed: true,
      },
      {
        label: 'Обшукати подвір’я',
        detail: '+20 монет · +3 брухту',
        Icon: Coins,
        allowed: true,
      },
    ];
  return eventFor(run).choices.map((choice) => ({
    label: choice.label,
    detail:
      choice.detail +
      (choice.effect.damageMax
        ? ` · ${Math.ceil(statsFor(run, meta).health * choice.effect.damageMax)} міцності`
        : ''),
    Icon: Package,
    allowed: canChooseEvent(run, meta, choice.effect),
  }));
}
function voteNote(vote: EventVote): string {
  if (vote.note) return vote.note;
  if (vote.done)
    return vote.done.coin
      ? 'Ви обрали різне: вирішила монетка.'
      : 'Ви обрали те саме. Діємо.';
  if (vote.mine === null)
    return 'Обери один варіант. Збіглося з другом — діє, ні — вирішить монетка.';
  return vote.partner === null ? `Чекаємо: ${vote.partnerName}…` : '';
}
// The choices of an event, for the host and for the guest alike.
export function EventOptions({
  run,
  meta,
  vote,
  onPick,
}: {
  run: Run;
  meta: Meta;
  vote?: EventVote;
  onPick: (choice: number) => void;
}) {
  const note = vote ? voteNote(vote) : '';
  return (
    <>
      <div className="event-options">
        {eventItems(run, meta).map(({ label, detail, Icon, allowed }, i) => (
          <button
            className={`event-option${vote?.mine === i ? ' mine' : ''}${vote?.done?.col === i ? ' chosen' : ''}`}
            key={i}
            disabled={vote ? !vote.options.includes(i) || !!vote.done : !allowed}
            onClick={() => (vote ? vote.onVote(i) : onPick(i))}
          >
            <b>{label}</b>
            <span>{detail}</span>
            <Icon size={22} />
            {vote && (vote.mine === i || vote.partner === i) && (
              <em className="event-votes">
                {vote.mine === i && <i className="me">ти</i>}
                {vote.partner === i && <i className="mate">{vote.partnerName}</i>}
              </em>
            )}
          </button>
        ))}
      </div>
      {note && (
        <p className="event-vote-note" role="status">
          {note}
        </p>
      )}
    </>
  );
}
// A meeting for two players: each has a role and does their part with a press;
// nothing happens until both have. `mine` is the role this screen plays (null:
// both, two players at one device).
export function TogetherRoles({
  roles,
  names,
  prize,
  done,
  mine,
  open = true,
  finished = false,
  note,
  onAct,
}: {
  roles: [string, string];
  names: [string, string];
  prize: string;
  done: [boolean, boolean];
  mine: 0 | 1 | null;
  open?: boolean;
  finished?: boolean;
  note?: string;
  onAct: (role: 0 | 1) => void;
}) {
  return (
    <div className="together">
      <p className="together-badge">
        <Users size={16} /> Потрібні обоє
      </p>
      <div className="together-roles">
        {roles.map((label, i) => {
          const here = mine === null || mine === i;
          return (
            <button
              key={i}
              className={`together-role${done[i] ? ' done' : ''}${here ? ' mine' : ''}`}
              disabled={!here || done[i] || finished || !open}
              onClick={() => onAct(i as 0 | 1)}
            >
              <small>{names[i]}</small>
              <b>{label}</b>
              <span>
                {done[i]
                  ? '✓ Готово'
                  : here
                    ? 'Натисни, коли готовий'
                    : 'Чекаємо…'}
              </span>
            </button>
          );
        })}
      </div>
      <p className="together-prize">Нагорода: {prize}</p>
      <p className="event-vote-note" role="status">
        {note ??
          (done[0] && done[1]
            ? 'Обоє готові: діємо!'
            : 'Без обох не вийде: поки другий не зробить свою частину, нічого не станеться.')}
      </p>
    </div>
  );
}
export function CampaignEventPanel({
  run,
  meta,
  onChange,
  vote,
  names,
}: {
  run: Run;
  meta: Meta;
  onChange: (run: Run) => void;
  vote?: EventVote;
  // Who plays the two roles of a meeting for two (first, second).
  names?: [string, string];
}) {
  const rest = run.kind === 'rest',
    event = eventFor(run),
    together = rest ? undefined : event.together;
  // Two players at one device: who has done their part.
  const [local, setLocal] = useState<[boolean, boolean]>([false, false]);
  return (
    <>
      <p className="eyebrow">
        {rest
          ? 'ПЕРЕПОЧИНОК'
          : `${together ? 'СПІЛЬНА ЗУСТРІЧ' : 'ЗУСТРІЧ'} · ЛОКАЦІЯ ${run.chapter + 1}`}
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
      ) : together ? (
        <TogetherRoles
          roles={together.roles}
          names={names ?? ['Перший гравець', 'Другий гравець']}
          prize={event.choices[0].detail}
          done={vote ? [vote.mine !== null, vote.partner !== null] : local}
          mine={vote ? 0 : null}
          open={vote ? vote.options.includes(0) : true}
          finished={!!vote?.done}
          note={vote?.note}
          onAct={(role) => {
            if (vote) return vote.onVote(0);
            const next: [boolean, boolean] =
              role === 0 ? [true, local[1]] : [local[0], true];
            setLocal(next);
            if (next[0] && next[1]) onChange(resolveEvent(run, meta, 0));
          }}
        />
      ) : (
        <EventOptions
          run={run}
          meta={meta}
          vote={vote}
          onPick={(i) => onChange(resolveEvent(run, meta, i))}
        />
      )}
      <button
        className={run.eventDone ? 'primary' : 'text-button'}
        onClick={() => onChange(nextNode(run))}
      >
        {run.eventDone
          ? 'Рушати далі'
          : together
            ? 'Піти без угоди'
            : 'Продовжити шлях без угоди'}{' '}
        <ArrowRight size={18} />
      </button>
    </>
  );
}
