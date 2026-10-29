import { HelpCircle, Gift } from 'lucide-react';
import { campaignBoss } from '@/lib/game/encounters';
import { minibossFor } from '@/lib/game/minibosses';
import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  Coins,
  Flame,
  GitBranch,
  Heart,
  LocateFixed,
  MapPin,
  Skull,
  ShieldAlert,
  Swords,
  type LucideIcon,
} from 'lucide-react';
import {
  availableColumns,
  reachableColumns,
  routeTargets,
  routeNodeX,
  seeded,
  minibossVariant,
  type NodeKind,
  type Run,
} from '@/lib/game/model';

export const NODE_INFO: Record<
  NodeKind,
  { name: string; short: string; desc: string; icon: LucideIcon; color: string }
> = {
  mystery: {
    name: 'Невідома кімната',
    short: '?',
    desc: 'Бій, еліта, магазин, подія, перепочинок, скриня або мінібос. Результат відкриється при вході. Бос локації чекає тільки на 10-му кроці.',
    icon: HelpCircle,
    color: '#c9b2ed',
  },
  chest: {
    name: 'Покинута скриня',
    short: 'Скриня',
    desc: 'Рівно один випадковий предмет із повного каталогу: обладнання або меблі для квартири.',
    icon: Gift,
    color: '#f1c875',
  },
  battle: {
    name: 'Вулиці',
    short: 'Бій',
    desc: 'Розбий загін: три хвилі й ватажок. Отримай модуль, монети й брухт.',
    icon: Swords,
    color: '#82bba9',
  },
  elite: {
    name: 'Небезпечна зона',
    short: 'Еліта',
    desc: 'Загін без передишок: хвилі накочуються одна на одну, стрільці цілять на випередження. Вищий шанс на рідкісний модуль.',
    icon: Flame,
    color: '#e99477',
  },
  miniboss: {
    name: 'Мінібос',
    short: 'Мінібос',
    desc: 'Окремий сильний ворог із власними атаками. Знищ його, щоб отримати предмет на вибір, монети й 4 брухту.',
    icon: ShieldAlert,
    color: '#efbd7d',
  },
  shop: {
    name: 'Нічний ринок',
    short: 'Магазин',
    desc: 'Витрать монети на модулі або ремонт будинку.',
    icon: Coins,
    color: '#e8b666',
  },
  event: {
    name: 'Невідомий сигнал',
    short: 'Подія',
    desc: 'Зустріч, ризикована угода або знахідка. Ти вирішуєш, як діяти.',
    icon: MapPin,
    color: '#b59acb',
  },
  rest: {
    name: 'Тихе подвір’я',
    short: 'Перепочинок',
    desc: 'Віднови міцність будинку або збери ресурси перед наступним боєм.',
    icon: Heart,
    color: '#90cbb5',
  },
  boss: {
    name: 'Бос району',
    short: 'Бос',
    desc: 'Після перемоги — продовження історії та нове дерево наступної локації.',
    icon: Skull,
    color: '#eea28b',
  },
};

const ROW_HEIGHT = 116;
const TOP = 60;
function point(row: number, col: number, count: number, run: Run) {
  if (run.routeVersion >= 6)
    return { x: routeNodeX(run, row, col), y: TOP + row * ROW_HEIGHT };
  if (run.routeVersion === 5) {
    const jitter =
      (seeded(run.seed + run.chapter * 100003 + row * 733 + col * 83)() - 0.5) *
      24;
    return {
      x: count === 1 ? 500 : 100 + (col * 800) / (count - 1) + jitter,
      y: TOP + row * ROW_HEIGHT,
    };
  }
  const columns =
    count === 1
      ? [500]
      : Array.from({ length: count }, (_, i) => 140 + (i * 720) / (count - 1));
  return { x: columns[col], y: TOP + row * ROW_HEIGHT };
}

// Online, the next stop is picked by both players: the columns each of them
// has picked on this step, and what a pick does (a vote, not a departure).
export interface RouteVote {
  mine: number | null;
  partner: number | null;
  partnerName: string;
  done?: { col: number; coin: boolean };
  onVote: (col: number) => void;
}
function voteNote(vote: RouteVote) {
  if (vote.done)
    return vote.done.coin
      ? 'Голоси розійшлись: монетка вирішила. Вирушаємо!'
      : 'Голоси збіглися. Вирушаємо!';
  if (vote.mine === null)
    return vote.partner === null
      ? 'Куди йти — вирішуєте вдвох. Обери вузол і проголосуй.'
      : `${vote.partnerName} уже обрав. Проголосуй і ти.`;
  if (vote.partner === null)
    return `Твій голос віддано. Чекаємо вибір: ${vote.partnerName}.`;
  return vote.mine === vote.partner
    ? 'Голоси збіглися.'
    : 'Голоси розійшлись: вирішить монетка.';
}

export function RouteTree({
  run,
  onEnter,
  vote,
}: {
  run: Run;
  onEnter: (id: string) => void;
  vote?: RouteVote;
}) {
  const available = availableColumns(run);
  const reachable = reachableColumns(run);
  const [selection, setSelection] = useState(
    `${run.step}:${available[0] ?? 0}`,
  );
  const viewport = useRef<HTMLDivElement>(null);
  const [selectedRow, selectedCol] = selection.split(':').map(Number);
  const kind = run.nodes[selectedRow]?.[selectedCol] ?? 'battle';
  const info = NODE_INFO[kind];
  const Icon = info.icon;
  const canEnter = selectedRow === run.step && available.includes(selectedCol);
  const checkpoint = run.path.length > run.step;
  const title =
    kind === 'boss'
      ? campaignBoss(run.chapter, run.bossVariants[run.chapter]).name
      : kind === 'miniboss'
        ? minibossFor(
            run.chapter,
            minibossVariant(run, selectedRow, selectedCol),
          ).name
        : info.name;
  const height = TOP * 2 + (run.nodes.length - 1) * ROW_HEIGHT + 18;
  const wide = run.routeVersion >= 5;
  const focusCurrent = useCallback(() => {
    if (viewport.current) {
      viewport.current.scrollTop = Math.max(
        0,
        TOP + run.step * ROW_HEIGHT - viewport.current.clientHeight * 0.3,
      );
      const col = availableColumns(run)[0] ?? 0;
      const pos = point(run.step, col, run.nodes[run.step].length, run);
      viewport.current.scrollLeft = Math.max(
        0,
        (pos.x / 1000) * viewport.current.scrollWidth -
          viewport.current.clientWidth / 2,
      );
    }
  }, [run]);
  useEffect(() => {
    focusCurrent();
  }, [focusCurrent]);

  function state(row: number, col: number) {
    if (row < run.step) {
      if (row < run.historyStart) return 'unknown';
      return run.path[row] === col ? 'visited' : 'skipped';
    }
    if (row === run.step && available.includes(col)) return 'available';
    return reachable[row].includes(col) ? 'future' : 'skipped';
  }

  return (
    <div className={`route-tree ${wide ? 'tree-wide' : ''}`}>
      <div className="tree-toolbar">
        <span>
          <GitBranch size={17} /> КАРТА РАЙОНУ
        </span>
        <button
          type="button"
          onClick={focusCurrent}
          title="Показати поточну розвилку"
        >
          <LocateFixed size={16} /> Крок {run.step + 1} / {run.nodes.length}
        </button>
      </div>
      <p className="tree-summary">
        {run.nodes.flat().length} клітинок · {run.nodes.length} кроків до боса
        {wide && <span>Прокручуй карту вбік і вниз</span>}
      </p>
      <div className="tree-legend" aria-label="Позначення карти">
        <span className="legend-visited">Пройдено</span>
        <span className="legend-available">Можна йти</span>
        <span className="legend-future">Попереду</span>
        <span className="tree-node-key">
          <HelpCircle size={15} /> Випадкова кімната
        </span>
        <span className="tree-node-key">
          <Gift size={15} /> Скриня
        </span>
        <span className="tree-node-key">
          <ShieldAlert size={15} /> Мінібос
        </span>
        <ArrowDown size={14} aria-label="Рух униз до боса" />
      </div>
      <div
        className="tree-viewport"
        ref={viewport}
        aria-label="Дерево маршрутів. Прокручуй вбік і вниз, щоб оглянути шлях до боса."
        tabIndex={0}
      >
        <div className="tree-canvas" style={{ height }}>
          <div
            className="tree-current-band"
            style={{ top: TOP + run.step * ROW_HEIGHT - 37 }}
          />
          <svg
            className="tree-connections"
            viewBox={`0 0 1000 ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {run.nodes.flatMap((row, step) =>
              row.flatMap((_, col) =>
                routeTargets(step, col, run.nodes, run).map((target) => {
                  const from = point(step, col, row.length, run),
                    to = point(
                      step + 1,
                      target,
                      run.nodes[step + 1].length,
                      run,
                    );
                  const traversed =
                    step >= run.historyStart &&
                    step + 1 < run.path.length &&
                    run.path[step] === col &&
                    run.path[step + 1] === target;
                  const open =
                    step === run.step - 1 &&
                    run.path[step] === col &&
                    available.includes(target);
                  const future =
                    step >= run.step &&
                    reachable[step].includes(col) &&
                    reachable[step + 1].includes(target);
                  return (
                    <path
                      key={`${step}:${col}-${target}`}
                      className={
                        traversed
                          ? 'travelled'
                          : open
                            ? 'open'
                            : future
                              ? 'possible'
                              : 'closed'
                      }
                      d={`M ${from.x} ${from.y + 23} C ${from.x} ${from.y + 67}, ${to.x} ${to.y - 61}, ${to.x} ${to.y - 25}`}
                    />
                  );
                }),
              ),
            )}
          </svg>
          {run.nodes.map((row, step) => (
            <fieldset
              className="tree-level"
              key={step}
              aria-label={`Етап ${step + 1}`}
            >
              <span
                className={`tree-floor ${step === run.step ? 'current' : ''}`}
                style={{ top: TOP + step * ROW_HEIGHT - 7 }}
              >
                {String(step + 1).padStart(2, '0')}
              </span>
              {row.map((nodeKind, col) => {
                const node =
                    NODE_INFO[run.revealed[`${step}:${col}`] ?? nodeKind],
                  C = node.icon;
                const pos = point(step, col, row.length, run),
                  status = state(step, col),
                  id = `${step}:${col}`;
                const statusText =
                  status === 'visited'
                    ? 'Пройдено'
                    : status === 'available'
                      ? checkpoint
                        ? 'Продовжити бій'
                        : 'Доступно'
                      : status === 'skipped'
                        ? 'Інша гілка'
                        : status === 'unknown'
                          ? 'До оновлення'
                          : 'Попереду';
                return (
                  <button
                    type="button"
                    key={id}
                    className={`tree-node ${status} ${selection === id ? 'selected' : ''} ${nodeKind === 'boss' ? 'boss' : ''}`}
                    style={
                      {
                        left: `${pos.x / 10}%`,
                        top: pos.y - 25,
                        '--node-color': node.color,
                      } as CSSProperties
                    }
                    onClick={() => setSelection(id)}
                    aria-pressed={selection === id}
                    aria-label={`Етап ${step + 1}. ${node.name}. ${statusText}. Оглянути.`}
                  >
                    <span className="tree-emblem">
                      <C size={23} strokeWidth={1.7} />
                      {status === 'visited' && (
                        <span className="tree-check">
                          <Check size={10} />
                        </span>
                      )}
                    </span>
                    <b>{node.short}</b>
                    <small>{statusText}</small>
                    {vote && step === run.step && (
                      <span className="tree-votes" aria-hidden="true">
                        {vote.mine === col && <i className="mine">Я</i>}
                        {vote.partner === col && (
                          <i className="partner" title={vote.partnerName}>
                            {vote.partnerName.slice(0, 1).toUpperCase()}
                          </i>
                        )}
                        {vote.done?.col === col && <i className="verdict">✓</i>}
                      </span>
                    )}
                  </button>
                );
              })}
            </fieldset>
          ))}
        </div>
      </div>
      <div
        className="tree-detail"
        style={{ '--node-color': info.color } as CSSProperties}
      >
        <span className="tree-detail-icon">
          <Icon size={25} />
        </span>
        <div className="tree-detail-copy" aria-live="polite">
          <small>
            ЕТАП {String(selectedRow + 1).padStart(2, '0')} ·{' '}
            {canEnter ? 'ТВІЙ НАСТУПНИЙ КРОК' : 'ОГЛЯД МАРШРУТУ'}
          </small>
          <h3>{title}</h3>
          <p>
            {kind === 'boss'
              ? campaignBoss(run.chapter, run.bossVariants[run.chapter]).guide
              : kind === 'miniboss'
                ? minibossFor(
                    run.chapter,
                    minibossVariant(run, selectedRow, selectedCol),
                  ).guide
                : info.desc}
          </p>
        </div>
        <button
          type="button"
          className="tree-go"
          disabled={!canEnter || !!vote?.done}
          onClick={() =>
            vote ? vote.onVote(selectedCol) : onEnter(selection)
          }
        >
          {!canEnter
            ? 'Недоступно'
            : vote
              ? vote.mine === selectedCol
                ? 'Мій голос тут'
                : 'Голосую сюди'
              : checkpoint
                ? 'Продовжити'
                : 'Рушити сюди'}
          <ArrowRight size={17} />
        </button>
      </div>
      {vote && (
        <p className="tree-vote-note" role="status" aria-live="polite">
          {voteNote(vote)}
        </p>
      )}
      <p className="tree-guidance">
        {run.routeVersion >= 6
          ? 'Обирай з’єднані клітинки. «?» відкриває випадкову кімнату, скриня дає один предмет. На 10-му кроці — бос.'
          : 'Цей маршрут уже розпочато й збережено. Наступна локація або новий рейд матиме нові випадкові гілки й кімнати та 10 кроків до боса.'}
      </p>
    </div>
  );
}
