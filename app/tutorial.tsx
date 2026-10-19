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
  'Ти керуєш цілим будинком',
  'Обирай свій маршрут',
  'Спробуй керування',
  'Сусіди мають значення',
  'Здобич, квартири й нові спроби',
];
const DESCRIPTIONS = [
  'Урятуй мешканців будинку №17, пройди три локації та зупини часову петлю. Сила будинку залежить від того, як ти його облаштуєш.',
  'На кожній локації — 10 кроків до боса. Йти можна лише по з’єднаних клітинках. Натисни один із трьох варіантів нижче.',
  'Стріляєш автоматично. Твоє завдання — рухатися, уникати атак і вчасно застосовувати здібності. Спробуй усі три дії.',
  'Квартири — фігури різної форми. Спільна стіна може дати бонус. Спробуй поставити квартиру Ніни поруч із Петровичем.',
  'Навчальні вправи не витрачають ресурси й не видають предметів. У справжньому рейді будинок збираєш поступово.',
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
              <p>
                Бос переможений → продовження історії → нова карта з іншими
                ворогами.
              </p>
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
                    ? '«?» приховує кімнату: це може бути подія, скриня або навіть мінібос. Бос локації тут не з’явиться.'
                    : route === 'chest'
                      ? 'Скриня дає один випадковий предмет: меблі або обладнання.'
                      : 'Порівнюй нагороду й ризик. Обери будь-яку з’єднану клітинку.'}
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
              <p>
                На телефоні: джойстик зліва, ривок і хвиля справа. У бою
                здібностям потрібен час на відновлення.
              </p>
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
                  ? 'Є спільна стіна! Кухня Ніни додає +6% темпу за сусіда. Так планування посилює дім.'
                  : neighbor === 'far'
                    ? 'Між квартирами є проміжок — бонус сусідства не працює. Спробуй поставити Ніну ближче.'
                    : 'Натисни «Поруч» або «Окремо», щоб перевірити сусідство.'}
              </p>
              <p>
                Став меблі й обладнання у вільні слоти всередині квартир. Бонуси
                працюють лише у встановлених речей та заселених мешканців.
              </p>
            </div>
          )}
          {step === 4 && (
            <div className="tutorial-summary">
              <p>
                <Users />
                <span>
                  <b>Команда й предмети</b>Рятуй людей у рейді. Здобувай меблі
                  та модулі після боїв, у скринях, подіях і магазинах.
                </span>
              </p>
              <p>
                <Coins />
                <span>
                  <b>Монети й брухт — на цю спробу</b>Монети витрачай у
                  магазинах і на дорогу добудову дому. Брухтом ремонтуй
                  пошкодження.
                </span>
              </p>
              <p>
                <Hexagon />
                <span>
                  <b>Ядра й креслення залишаються</b>Після рейду купуй
                  дослідження в майстерні. Відкриті предмети можуть траплятися в
                  наступних спробах.
                </span>
              </p>
              <p>
                Повторити навчання можна через кнопку «?» → «Пройти навчання».
              </p>
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
