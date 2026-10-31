import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Home,
  Crosshair,
  Gift,
  CircleHelp,
  Footprints,
  Zap,
  Check,
  Hexagon,
  Coins,
  Users,
  Hammer,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import './tutorial.css';

const TITLES = [
  'Твоя місія',
  'Обери маршрут',
  'Спробуй керування',
  'Сусіди дають бонуси',
  'Готово до рейду',
];
const DESCRIPTIONS = [
  'Ти — голова ОСББ. Рятуй мешканців будинку №17 і зупини петлю 04:17.',
  'Натисни одну з трьох клітинок.',
  'Стрільба сама. Рухайся, ухиляйся, вмикай вміння.',
  'Постав Ніну поруч із Петровичем.',
  'Навчання нічого не витрачає. Далі — справжній рейд.',
];
export function Tutorial({
  step,
  onStep,
  onFinish,
}: {
  step: number;
  onStep: (n: number) => void;
  onFinish: () => void;
}) {
  const [route, setRoute] = useState('');
  const [position, setPosition] = useState({ x: 38, y: 52 });
  const [actions, setActions] = useState<string[]>([]);
  const [neighbor, setNeighbor] = useState<'near' | 'far' | null>(null);
  const [effect, setEffect] = useState('');
  function act(name: string, dx = 0, dy = 0) {
    setActions((a) => [...new Set([...a, name])]);
    setPosition((p) => ({
      x: Math.max(12, Math.min(78, p.x + dx)),
      y: Math.max(20, Math.min(78, p.y + dy)),
    }));
    setEffect(name);
  }
  useEffect(() => {
    if (step !== 2) return;
    const key = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement && e.target.closest('input,textarea'))
      )
        return;
      const moves: Record<string, number[]> = {
        KeyW: [0, -10],
        ArrowUp: [0, -10],
        KeyS: [0, 10],
        ArrowDown: [0, 10],
        KeyA: [-10, 0],
        ArrowLeft: [-10, 0],
        KeyD: [10, 0],
        ArrowRight: [10, 0],
      };
      if (moves[e.code]) {
        e.preventDefault();
        act('move', ...(moves[e.code] as [number, number]));
      }
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLElement && e.target.closest('button'))
      ) {
        e.preventDefault();
        act('dash', 16, 0);
      }
      if (e.code === 'KeyE') {
        e.preventDefault();
        act('pulse');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [step]);
  useEffect(() => {
    if (!effect) return;
    const t = setTimeout(() => setEffect(''), 550);
    return () => clearTimeout(t);
  }, [effect]);
  const allowed =
    step === 1
      ? !!route
      : step === 2
        ? ['move', 'dash', 'pulse'].every((s) => actions.includes(s))
        : step === 3
          ? neighbor === 'near'
          : true;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onFinish();
      }}
    >
      <DialogContent
        className="game-modal tutorial-modal"
        showCloseButton={false}
      >
        <div className="tutorial-top">
          <span>ПЕРШИЙ РЕЙД · {step + 1} / 5</span>
          <button className="text-button" onClick={onFinish}>
            Пропустити навчання
          </button>
        </div>
        <div className="tutorial-progress" aria-label={`Крок ${step + 1} із 5`}>
          {TITLES.map((_, i) => (
            <span key={i} className={i <= step ? 'done' : ''} />
          ))}
        </div>
        <div className="tutorial-body" key={step}>
          <DialogTitle>{TITLES[step]}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[step]}</DialogDescription>
          {step === 0 && (
            <div className="tutorial-intro">
              <Home size={64} />
              <strong>Будинок №17 — твій герой</strong>
              <div>
                <span>
                  <Users />
                  Рятуй людей
                </span>
                <span>
                  <Hammer />
                  Облаштовуй квартири
                </span>
                <span>
                  <Crosshair />
                  Перемагай босів
                </span>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="tutorial-routes">
              <div className="tutorial-origin">
                <Home /> Ти тут
              </div>
              <div className="tutorial-branches" aria-hidden="true" />
              <div className="tutorial-options">
                {[
                  ['fight', 'Бій', Crosshair],
                  ['mystery', '?', CircleHelp],
                  ['chest', 'Скриня', Gift],
                ].map(([id, label, Icon]) => {
                  const Glyph = Icon as typeof Home;
                  return (
                    <button
                      key={id as string}
                      aria-pressed={route === id}
                      onClick={() => setRoute(id as string)}
                    >
                      <Glyph />
                      <b>{label as string}</b>
                    </button>
                  );
                })}
              </div>
              <p role="status">
                {route === 'fight'
                  ? 'Бій: переживи хвилю й отримай нагороду.'
                  : route === 'mystery'
                    ? '«?» — подія, скриня або мінібос.'
                    : route === 'chest'
                      ? 'Скриня: один випадковий предмет.'
                      : 'На карті їх буде десять кроків до боса.'}
              </p>
            </div>
          )}
          {step === 2 && (
            <div className="tutorial-controls">
              <div
                className="tutorial-arena"
                tabIndex={0}
                aria-label="Тренувальне поле: WASD або стрілки — рух, пробіл — ривок, E — хвиля"
              >
                <span className="tutorial-target">
                  <Crosshair /> Мішень
                </span>
                <span
                  className={`tutorial-house ${effect}`}
                  style={{ left: position.x + '%', top: position.y + '%' }}
                >
                  <Home size={35} />
                </span>
                <span className="tutorial-arena-caption">
                  Безпечне тренування · без шкоди
                </span>
              </div>
              <div className="tutorial-practice-buttons">
                <div className="tutorial-dpad">
                  {[
                    [0, -10, 'Вгору', ArrowUp],
                    [-10, 0, 'Ліворуч', ArrowLeft],
                    [0, 10, 'Вниз', ArrowDown],
                    [10, 0, 'Праворуч', ArrowRight],
                  ].map(([x, y, label, Icon]) => {
                    const Glyph = Icon as typeof Home;
                    return (
                      <button
                        key={label as string}
                        aria-label={label as string}
                        onClick={() => act('move', x as number, y as number)}
                      >
                        <Glyph />
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => act('dash', 16, 0)}>
                  <Footprints />
                  Ривок
                </button>
                <button onClick={() => act('pulse')}>
                  <Zap />
                  Вміння
                </button>
              </div>
              <ul className="tutorial-checks">
                {[
                  ['move', 'WASD / стрілки — рух'],
                  ['dash', 'Пробіл — ривок із коротким захистом'],
                  ['pulse', 'E — вміння героя проти ворогів поруч'],
                ].map(([id, label]) => (
                  <li key={id} className={actions.includes(id) ? 'done' : ''}>
                    <Check size={16} />
                    {label}
                  </li>
                ))}
              </ul>
              <p>На телефоні: джойстик зліва, кнопки справа.</p>
            </div>
          )}
          {step === 3 && (
            <div className="tutorial-housing">
              <div className="tutorial-floor">
                <div className="tutorial-petrovych">
                  Петрович
                  <br />
                  <WrenchIcon />
                </div>
                <button
                  className={neighbor === 'near' ? 'placed' : ''}
                  onClick={() => setNeighbor('near')}
                >
                  Ніна
                  <br />
                  Поруч
                </button>
                <span />
                <button
                  className={neighbor === 'far' ? 'placed' : ''}
                  onClick={() => setNeighbor('far')}
                >
                  Ніна
                  <br />
                  Окремо
                </button>
              </div>
              <p role="status">
                {neighbor === 'near'
                  ? 'Спільна стіна: +6% темпу. Так сусіди посилюють дім.'
                  : neighbor === 'far'
                    ? 'Є проміжок — бонусу нема. Спробуй ближче.'
                    : 'Натисни «Поруч».'}
              </p>
            </div>
          )}
          {step === 4 && (
            <div className="tutorial-summary">
              <p>
                <Users />
                <span>
                  <b>Команда й предмети</b>Рятуй людей, збирай меблі й модулі.
                </span>
              </p>
              <p>
                <Coins />
                <span>
                  <b>Монети й брухт</b>Лише на цей рейд: магазини й ремонт.
                </span>
              </p>
              <p>
                <Hexagon />
                <span>
                  <b>Ядра й креслення</b>Лишаються назавжди: купуй у майстерні.
                </span>
              </p>
              <p>Повторити: «?» → «Пройти навчання».</p>
            </div>
          )}
        </div>
        <div className="tutorial-footer">
          <button
            className="secondary"
            disabled={step === 0}
            onClick={() => onStep(step - 1)}
          >
            <ArrowLeft size={18} />
            Назад
          </button>
          <button
            className="primary"
            disabled={!allowed}
            onClick={() => (step === 4 ? onFinish() : onStep(step + 1))}
          >
            {step === 4 ? 'Готово, грати!' : 'Далі'}
            <ArrowRight size={18} />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function WrenchIcon() {
  return <Hammer size={28} />;
}
