import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Flame,
  Infinity as InfinityIcon,
  Timer,
  Users,
} from 'lucide-react';
import { CHARACTERS } from '@/lib/game/data';
import {
  DAILY_MODIFIERS,
  HEAT_LEVELS,
  dailySetup,
  dateKey,
  heatName,
  heatSummary,
  type RunMode,
} from '@/lib/game/modes';
import type { Meta, Run } from '@/lib/game/model';

export type Launch = {
  mode: RunMode;
  character: string;
  heat: number;
  seed?: number;
  daily?: string;
  // Hero of the second player; the hub fills it in, the daily run ignores it.
  coop?: string;
};
export const MODE_NAMES: Record<RunMode, string> = {
  campaign: 'кампанію',
  daily: 'денний забіг',
  endless: 'нескінченну експедицію',
};
// '2026-09-24' -> '24.09'
export function shortDate(key: string) {
  return key.length === 10 ? `${key.slice(8, 10)}.${key.slice(5, 7)}` : key;
}
export function dailyLaunch(meta: Meta, key: string): Launch {
  const setup = dailySetup(key, meta);
  return {
    mode: 'daily',
    character: setup.character,
    heat: setup.heat,
    seed: setup.seed,
    daily: key,
  };
}
// Minute-resolution clock: the daily card only shows hours and minutes.
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);
  return now;
}
function untilMidnight(now: number) {
  const d = new Date(now);
  const left = Math.max(
    0,
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now,
  );
  const minutes = Math.ceil(left / 60000);
  return `${Math.floor(minutes / 60)} год ${String(minutes % 60).padStart(2, '0')} хв`;
}
export function HeatSelect({
  max,
  value,
  onChange,
}: {
  max: number;
  value: number;
  onChange: (heat: number) => void;
}) {
  const level = HEAT_LEVELS[value - 1];
  return (
    <div className="heat-select">
      <div className="heat-head">
        <span className="micro">
          <Flame size={14} /> СКЛАДНІСТЬ {value} · {heatName(value)}
        </span>
        <small>{value > 0 ? `+${value * 10}% ядер` : 'Без бонусу'}</small>
      </div>
      <div className="heat-levels" aria-label="Рівень складності">
        {Array.from({ length: max + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={value === i}
            className={value === i ? 'active' : ''}
            onClick={() => onChange(i)}
          >
            {i}
          </button>
        ))}
      </div>
      <p>
        {level ? (
          <>
            <b>{level.title}.</b> {level.text}
            {value > 1 && ' Діють і всі попередні правила.'}{' '}
            <span className="heat-sum">{heatSummary(value)}</span>
          </>
        ) : (
          'Звичайна експедиція без додаткових правил.'
        )}
      </p>
    </div>
  );
}
export function HubModes({
  meta,
  run,
  heat,
  onLaunch,
  onContinue,
}: {
  meta: Meta;
  run: Run | null;
  heat: number;
  onLaunch: (launch: Launch) => void;
  onContinue: () => void;
}) {
  const now = useMinuteClock();
  const key = dateKey(new Date(now));
  const showDaily = meta.tutorialDone,
    showEndless = meta.wins >= 1;
  if (!showDaily && !showEndless) return null;
  const setup = dailySetup(key, meta);
  const modifier = DAILY_MODIFIERS.find((m) => m.id === setup.modifier);
  const hero = CHARACTERS.find((c) => c.id === setup.character);
  const best = meta.dailyBest?.[key];
  const practice = (meta.dailyAttempts?.[key] ?? 0) > 0;
  const dailyActive = run?.mode === 'daily' && run.daily === key,
    endlessActive = run?.mode === 'endless';
  return (
    <div className="mode-cards">
      {showDaily && (
        <article className="mode-card daily">
          <header>
            <CalendarDays size={18} />
            <b>Денний забіг</b>
            <span className="micro">{shortDate(key)}</span>
          </header>
          {modifier && (
            <p>
              <b>{modifier.title}.</b> {modifier.text}
            </p>
          )}
          <p className="mode-meta">
            Голова: {hero?.name ?? '—'} · Складність {setup.heat} · Рекорд дня:{' '}
            {best ?? '—'}
          </p>
          <p className="mode-meta">
            {dailyActive
              ? run?.dailyRanked
                ? 'Це залікова спроба дня.'
                : 'Це тренування: рекорд не зміниться.'
              : practice
                ? 'Спробу дня вже використано. Далі лише тренування.'
                : 'Рекорд ставить перша спроба дня.'}
          </p>
          <footer>
            <span>
              <Timer size={14} /> Новий через {untilMidnight(now)}
            </span>
            <button
              className="secondary small"
              onClick={() =>
                dailyActive ? onContinue() : onLaunch(dailyLaunch(meta, key))
              }
            >
              {dailyActive ? 'Продовжити' : practice ? 'Тренування' : 'Почати'}{' '}
              <ArrowRight size={15} />
            </button>
          </footer>
        </article>
      )}
      {showEndless && (
        <article className="mode-card endless">
          <header>
            <InfinityIcon size={18} />
            <b>Нескінченна експедиція</b>
          </header>
          <p>
            Після третього боса будинок іде на нове коло: складність +2, а
            мешканці, обладнання й ресурси залишаються.
          </p>
          <p className="mode-meta">
            Рекорд: {meta.endlessBest ?? 0} кіл · Старт зі складністю {heat}
          </p>
          <footer>
            <span>
              <Flame size={14} /> +2 складності за коло
            </span>
            <button
              className="secondary small"
              onClick={() =>
                endlessActive
                  ? onContinue()
                  : onLaunch({
                      mode: 'endless',
                      character: '',
                      heat,
                    })
              }
            >
              {endlessActive ? 'Продовжити' : 'Почати'} <ArrowRight size={15} />
            </button>
          </footer>
        </article>
      )}
    </div>
  );
}
export function RunBadge({ run }: { run: Run }) {
  if (run.mode === 'campaign' && !run.heat && !run.coop) return null;
  return (
    <span className="run-badge">
      {run.coop && (
        <span className="coop" title="Двоє гравців на одному пристрої">
          <Users size={13} /> Вдвох ·{' '}
          {CHARACTERS.find((c) => c.id === run.coop)?.name}
        </span>
      )}
      {run.mode === 'daily' && (
        <span>
          <CalendarDays size={13} /> Денний · {shortDate(run.daily)}
          {!run.dailyRanked && ' · тренування'}
        </span>
      )}
      {run.mode === 'endless' && (
        <span>
          <InfinityIcon size={13} /> Коло {run.loop + 1}
        </span>
      )}
      {run.heat > 0 && (
        <span className="heat" title="Рівень складності">
          <Flame size={13} /> {run.heat}
        </span>
      )}
    </span>
  );
}
