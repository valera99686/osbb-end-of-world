'use client';
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Cog,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Home,
  Coins,
  Shield,
  Heart,
  Zap,
  Wrench,
  Footprints,
  Magnet,
  WashingMachine,
  ScanEye,
  Soup,
  BatteryCharging,
  Triangle,
  Bell,
  Crosshair,
  Sprout,
  Trees,
  Flower2,
  Hexagon,
  Package,
  Copy,
  Orbit,
  ScrollText,
  Hammer,
  Bot,
  Recycle,
  Atom,
  DoorOpen,
  Crown,
  Wifi,
  Plug,
  Lock,
  Check,
  Skull,
  Swords,
  MapPin,
  Flame,
  Plus,
  RefreshCw,
  HelpCircle,
  Download,
  Trophy,
  Target,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  ITEMS,
  ITEM_BY_ID,
  FAMILY,
  RARITIES,
  CHAPTERS,
  CHARACTERS,
  UNLOCK_TEXT,
  RESEARCH,
  type Item,
} from '@/lib/game/data';
import {
  initialMeta,
  makeRun,
  statsFor,
  offers,
  priceFor,
  enterNode,
  nextNode,
  equip,
  finishRun,
  readSave,
  saveData,
  SAVE_KEY,
  type Meta,
  type Run,
  type NodeKind,
} from '@/lib/game/model';
import {
  Battle,
  AudioEngine,
  type Hud,
  type BattleResult,
} from '@/lib/game/engine';

const ICONS: Record<string, LucideIcon> = {
  crosshair: Crosshair,
  footprints: Footprints,
  shield: Shield,
  magnet: Magnet,
  washing: WashingMachine,
  scan: ScanEye,
  soup: Soup,
  battery: BatteryCharging,
  triangle: Triangle,
  bell: Bell,
  wrench: Wrench,
  zap: Zap,
  wifi: Wifi,
  plug: Plug,
  sprout: Sprout,
  heart: Heart,
  tree: Trees,
  flower: Flower2,
  hexagon: Hexagon,
  coins: Coins,
  package: Package,
  copy: Copy,
  orbit: Orbit,
  scroll: ScrollText,
  hammer: Hammer,
  bot: Bot,
  recycle: Recycle,
  atom: Atom,
  door: DoorOpen,
  crown: Crown,
};
function Glyph({ name, size = 24 }: { name: string; size?: number }) {
  const C = ICONS[name] ?? Package;
  return <C size={size} strokeWidth={1.65} />;
}
function Currency({
  amount,
  cores = false,
}: {
  amount: number;
  cores?: boolean;
}) {
  return (
    <span className={`currency ${cores ? 'cores' : ''}`}>
      {cores ? <Hexagon size={16} /> : <Coins size={16} />} {Math.floor(amount)}
    </span>
  );
}
function Meter({
  value,
  max,
  label,
  color,
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  return (
    <Progress
      className="game-progress"
      value={Math.min(100, Math.max(0, (value / max) * 100))}
      aria-label={label}
      style={{ '--meter-color': color ?? 'var(--teal)' } as CSSProperties}
    />
  );
}
const NODE_INFO: Record<
  NodeKind,
  { name: string; desc: string; icon: LucideIcon; color: string }
> = {
  battle: {
    name: 'Вулиці',
    desc: 'Переживи хвилю. Модуль і брухт.',
    icon: Swords,
    color: '#82bba9',
  },
  elite: {
    name: 'Небезпечна зона',
    desc: 'Більше ворогів, цінніший лут.',
    icon: Flame,
    color: '#e99477',
  },
  shop: {
    name: 'Нічний ринок',
    desc: 'Модулі, ремонт і нові комбінації.',
    icon: Coins,
    color: '#e8b666',
  },
  event: {
    name: 'Невідомий сигнал',
    desc: 'Зустріч, угода або знахідка.',
    icon: MapPin,
    color: '#b59acb',
  },
  rest: {
    name: 'Тихе подвір’я',
    desc: 'Віднови дім або збери ресурси.',
    icon: Heart,
    color: '#90cbb5',
  },
  boss: {
    name: 'Бос району',
    desc: 'Переможи, щоб відкрити новий шар гри.',
    icon: Skull,
    color: '#eea28b',
  },
};
type Result = {
  won: boolean;
  run: Run;
  cores: number;
  unlocks: string[];
  final: boolean;
};
function ItemCard({
  item,
  footer,
  onClick,
  disabled,
  compact = false,
}: {
  item: Item;
  footer?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const content = (
    <>
      <div className="item-top">
        <span className="item-emblem">
          <Glyph name={item.icon} size={compact ? 22 : 34} />
        </span>
        <span className="rarity">{RARITIES[item.rarity]}</span>
      </div>
      <h3>{item.name}</h3>
      <span className="family-label">{FAMILY[item.family].name}</span>
      <p>{item.desc}</p>
      {footer && <div className="item-footer">{footer}</div>}
    </>
  );
  return onClick ? (
    <button
      className={`item-card ${compact ? 'compact' : ''}`}
      style={{ '--item-color': FAMILY[item.family].color } as CSSProperties}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  ) : (
    <article
      className={`item-card ${compact ? 'compact' : ''}`}
      style={{ '--item-color': FAMILY[item.family].color } as CSSProperties}
    >
      {content}
    </article>
  );
}
function Combat({
  run,
  meta,
  audio,
  onDone,
  onExit,
}: {
  run: Run;
  meta: Meta;
  audio: AudioEngine;
  onDone: (r: BattleResult) => void;
  onExit: (r: Run) => void;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<Battle | null>(null),
    joystick = useRef<HTMLDivElement>(null),
    pointer = useRef<number | null>(null);
  const [hud, setHud] = useState<Hud>({
    hp: run.hp,
    max: statsFor(run, meta).health,
    coins: run.coins,
    kills: run.kills,
    level: run.level,
    xp: run.xp,
    need: 10 + run.level * 5,
    time: 0,
    duration: 48,
    dash: 0,
    pulse: 0,
    boss: 0,
    bossMax: 0,
    enemies: 0,
  });
  const [paused, setPaused] = useState(false),
    [stick, setStick] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const b = new Battle(canvas.current, run, meta, audio, setHud, (r) =>
      onDoneRef.current(r),
    );
    engine.current = b;
    b.start();
    const keys = (e: KeyboardEvent) => {
      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Space',
          'KeyE',
        ].includes(e.code)
      ) {
        e.preventDefault();
        if (e.code === 'Space') b.dash();
        else if (e.code === 'KeyE') b.pulse();
        else b.keys.add(e.code);
      }
      if (e.code === 'Escape' || e.code === 'KeyP') setPaused((p) => !p);
    };
    const back = (e: Event) => {
      e.preventDefault();
      setPaused(true);
    };
    document.addEventListener('osbb-back', back);
    const up = (e: KeyboardEvent) => b.keys.delete(e.code);
    const blur = () => {
      b.keys.clear();
      b.stick = { x: 0, y: 0 };
      setPaused(true);
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', keys);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      b.stop();
      window.removeEventListener('keydown', keys);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('osbb-back', back);
    };
  }, []);
  useEffect(() => {
    if (engine.current) {
      engine.current.paused = paused;
      if (paused) {
        engine.current.keys.clear();
        engine.current.stick = { x: 0, y: 0 };
        setStick({ x: 0, y: 0 });
        pointer.current = null;
      }
    }
  }, [paused]);
  function point(e: React.PointerEvent) {
    if (pointer.current !== e.pointerId) return;
    const r = joystick.current!.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / 40,
      y = (e.clientY - r.top - r.height / 2) / 40;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    setStick({ x: x * 32, y: y * 32 });
    if (engine.current) engine.current.stick = { x, y };
  }
  function release() {
    pointer.current = null;
    setStick({ x: 0, y: 0 });
    if (engine.current) engine.current.stick = { x: 0, y: 0 };
  }
  const remaining = Math.max(0, Math.ceil(hud.duration - hud.time));
  return (
    <section className="battle-screen">
      <canvas
        ref={canvas}
        className="battle-canvas"
        aria-label="Бойова арена. Рух WASD або стрілками, пробіл — ривок, E — ударна хвиля."
      />
      <div className="battle-hud">
        <div className="health-block">
          <div>
            <Heart size={15} />
            <b>
              {Math.ceil(hud.hp)} <span>/ {hud.max}</span>
            </b>
          </div>
          <Meter
            value={hud.hp}
            max={hud.max}
            label="Міцність будинку"
            color="#b8ceaa"
          />
        </div>
        <div className="battle-center">
          <span className="micro">
            {run.kind === 'boss'
              ? CHAPTERS[run.chapter].boss
              : NODE_INFO[run.kind].name}
          </span>
          <strong>
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, '0')}
          </strong>
        </div>
        <div className="battle-wallet">
          <Currency amount={hud.coins} />
          <button
            className="icon-button"
            onClick={() => setPaused(true)}
            aria-label="Пауза"
          >
            <Pause size={18} />
          </button>
        </div>
      </div>
      {hud.bossMax > 0 && (
        <div className="boss-health">
          <span>
            {CHAPTERS[run.chapter].boss} · {Math.ceil(hud.boss)} / {hud.bossMax}
          </span>
          <Meter
            value={hud.boss}
            max={hud.bossMax}
            color="#e69080"
            label="Міцність боса"
          />
        </div>
      )}
      <div className="level-strip">
        <span>РІВЕНЬ {hud.level}</span>
        <Meter
          value={hud.xp}
          max={hud.need}
          label="Досвід до наступного рівня"
        />
        <span>
          <Skull size={14} /> {hud.kills}
        </span>
      </div>
      {hud.time < 7 && (
        <div className="battle-hint">
          {run.step === 0
            ? 'Рухайся й збирай лут. Будинок стріляє сам.'
            : run.kind === 'boss'
              ? 'Стеж за червоними снарядами. Ривок захищає від шкоди.'
              : 'Переживи хвилю, щоб отримати новий модуль.'}
        </div>
      )}
      <div className="battle-controls">
        <div
          className="joystick"
          ref={joystick}
          onPointerDown={(e) => {
            if (pointer.current !== null) return;
            pointer.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            point(e);
          }}
          onPointerMove={point}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
        >
          <div className="stick-cross" />
          <div
            className="stick-knob"
            style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
          />
          <span>РУХ</span>
        </div>
        <div className="keyboard-hint">
          <kbd>W A S D</kbd>
          <span>рух</span>
          <kbd>SPACE</kbd>
          <span>ривок</span>
          <kbd>E</kbd>
          <span>хвиля</span>
        </div>
        <div className="ability-row">
          <button
            className="ability"
            onClick={() => engine.current?.dash()}
            disabled={hud.dash > 0}
            aria-label="Ривок"
          >
            <Footprints size={24} />
            <b>{hud.dash > 0 ? hud.dash.toFixed(1) : 'РИВОК'}</b>
            <small>Пробіл</small>
          </button>
          <button
            className="ability pulse"
            onClick={() => engine.current?.pulse()}
            disabled={hud.pulse > 0}
            aria-label="Ударна хвиля"
          >
            <Zap size={24} />
            <b>{hud.pulse > 0 ? hud.pulse.toFixed(1) : 'ХВИЛЯ'}</b>
            <small>E</small>
          </button>
        </div>
      </div>
      <Dialog open={paused} onOpenChange={setPaused}>
        <DialogContent className="game-modal">
          <DialogTitle>Будинок перепочиває</DialogTitle>
          <DialogDescription>
            Забіг поставлено на паузу. Повернення до притулку збереже стан перед
            цим боєм.
          </DialogDescription>
          <button className="primary" onClick={() => setPaused(false)}>
            <Play size={18} /> Продовжити
          </button>
          <button
            className="secondary"
            onClick={() => onExit({ ...run, page: 'map' })}
          >
            <Home size={18} /> Зберегти й до притулку
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export default function Game() {
  const [meta, setMeta] = useState<Meta>(initialMeta),
    [run, setRun] = useState<Run | null>(null),
    [ready, setReady] = useState(false),
    [screen, setScreen] = useState<'hub' | 'play' | 'workshop' | 'codex'>(
      'hub',
    );
  const [character, setCharacter] = useState('mechanic'),
    [chapter, setChapter] = useState(0),
    [help, setHelp] = useState(false),
    [notice, setNotice] = useState(''),
    [selectedSlot, setSelectedSlot] = useState<number | null>(null),
    [pending, setPending] = useState<{
      id: string;
      source: 'shop' | 'reward';
      index: number;
    } | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [abandon, setAbandon] = useState(false),
    [native, setNative] = useState(false);
  const audio = useRef<AudioEngine | null>(null);
  if (!audio.current) audio.current = new AudioEngine();
  useEffect(() => {
    setNative(navigator.userAgent.includes('OSBBAndroid'));
    try {
      const s = readSave(localStorage.getItem(SAVE_KEY));
      setMeta(s.meta);
      setRun(s.run);
      setChapter(Math.min(4, s.meta.wins));
      if (s.error) setNotice('Збереження пошкоджено. Створено новий профіль.');
    } catch {
      setNotice(
        'Сховище браузера недоступне. Прогрес зберігатиметься лише в цій сесії.',
      );
    }
    setReady(true);
    if (
      'serviceWorker' in navigator &&
      !navigator.userAgent.includes('OSBBAndroid') &&
      import.meta.env.PROD
    )
      navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  useEffect(() => {
    if (!ready) return;
    audio.current!.enabled = meta.sound;
    try {
      localStorage.setItem(SAVE_KEY, saveData(meta, run));
    } catch {
      setNotice(
        'Не вдалося записати прогрес. Перевір вільне місце або налаштування браузера.',
      );
    }
  }, [meta, run, ready]);
  useEffect(() => {
    const back = (e: Event) => {
      if (run?.page === 'combat' && screen === 'play') return;
      if (help) {
        e.preventDefault();
        setHelp(false);
      } else if (result) {
        e.preventDefault();
        setResult(null);
      } else if (pending) {
        e.preventDefault();
        setPending(null);
      } else if (abandon) {
        e.preventDefault();
        setAbandon(false);
      } else if (screen !== 'hub') {
        e.preventDefault();
        setScreen('hub');
      }
    };
    document.addEventListener('osbb-back', back);
    return () => document.removeEventListener('osbb-back', back);
  }, [run?.page, screen, help, result, pending, abandon]);
  function ping(message: string) {
    setNotice(message);
    audio.current!.play('coin');
  }
  function start() {
    if (!ready) return;
    audio.current!.unlock();
    if (run) {
      setScreen('play');
      return;
    }
    setRun(makeRun(meta, character, chapter));
    setScreen('play');
    setResult(null);
    setNotice('');
    setSelectedSlot(null);
  }
  function back() {
    setScreen('hub');
    setSelectedSlot(null);
    setNotice('');
  }
  function ended(b: BattleResult) {
    if (!b.won || b.boss) {
      const f = finishRun(meta, b.run, b.won);
      setMeta(f.meta);
      setRun(null);
      setResult({
        won: b.won,
        run: b.run,
        cores: f.cores,
        unlocks: f.unlocks,
        final: b.won && b.run.chapter === 4,
      });
      setChapter(Math.min(4, f.meta.wins));
      setScreen('hub');
    } else {
      const reward = offers(meta, b.run, 3, 67, b.run.kind === 'elite');
      setRun({ ...b.run, page: 'reward', reward });
    }
    setSelectedSlot(null);
  }
  function pick(id: string, source: 'shop' | 'reward', index: number) {
    if (!run) return;
    if (
      source === 'shop' &&
      (run.bought.includes(index) || run.coins < priceFor(ITEM_BY_ID[id], run))
    )
      return;
    const empty = run.items.indexOf(null);
    if (empty < 0) {
      setPending({ id, source, index });
      return;
    }
    acquire(id, source, index, empty);
  }
  function acquire(
    id: string,
    source: 'shop' | 'reward',
    index: number,
    slot: number,
  ) {
    if (!run) return;
    const item = ITEM_BY_ID[id];
    if (!item) return;
    const cost = source === 'shop' ? priceFor(item, run) : 0;
    if (source === 'shop' && (run.coins < cost || run.bought.includes(index)))
      return;
    let next = equip(run, id, slot, meta);
    if (next === run) return;
    next = {
      ...next,
      coins: next.coins - cost,
      scrap: next.scrap + (run.items[slot] ? 1 : 0),
      bought: source === 'shop' ? [...next.bought, index] : next.bought,
    };
    setMeta((m) => ({ ...m, seen: [...new Set([...m.seen, id])] }));
    if (source === 'reward') next = nextNode(next);
    setRun(next);
    setPending(null);
    setSelectedSlot(null);
    ping(
      `${item.name} встановлено${run.items[slot] ? ' · старий модуль розібрано на 1 брухт' : ''}.`,
    );
  }
  function swap(slot: number) {
    if (!run) return;
    if (selectedSlot === null) {
      setSelectedSlot(slot);
      return;
    }
    if (selectedSlot === slot) {
      setSelectedSlot(null);
      return;
    }
    const items = [...run.items];
    [items[slot], items[selectedSlot]] = [items[selectedSlot], items[slot]];
    setRun({ ...run, items });
    setSelectedSlot(null);
  }
  function scrap() {
    if (!run || selectedSlot === null || !run.items[selectedSlot]) return;
    const items = [...run.items];
    items[selectedSlot] = null;
    const next = { ...run, items, scrap: run.scrap + 2 };
    next.hp = Math.min(next.hp, statsFor(next, meta).health);
    setRun(next);
    setMeta((m) => ({ ...m, scrapped: m.scrapped + 1 }));
    setSelectedSlot(null);
    ping(
      'Модуль розібрано: +2 брухту. Креслення нових предметів відкриються після завершення рейду.',
    );
  }
  function research(id: string, cost: number) {
    const level = meta.research[id] ?? 0,
      price = cost * (level + 1);
    if (level >= 5 || meta.cores < price) return;
    setMeta({
      ...meta,
      cores: meta.cores - price,
      research: { ...meta.research, [id]: level + 1 },
    });
    ping('Дослідження завершено. Покращення діє з наступного рейду.');
  }
  function eventChoice(choice: number) {
    if (!run || run.eventDone) return;
    let next = { ...run, eventDone: true };
    const max = statsFor(run, meta).health;
    if (run.kind === 'rest') {
      if (choice === 0) {
        next.hp = Math.min(max, run.hp + max * 0.5);
        ping('Мешканці залатали дім. Відновлено 50% міцності.');
      } else {
        next.scrap += 5;
        next.coins += 15;
        ping('Обшукали гаражі: +5 брухту, +15 монет.');
      }
    } else {
      const event = run.step % 3;
      if (event === 0) {
        if (choice === 0) {
          if (run.coins < 20) return;
          next.coins -= 20;
          next.hp = Math.min(max, run.hp + 60);
          next.scrap += 3;
          ping('Петрович допоміг із ремонтом і залишив 3 брухту.');
        } else {
          next.coins += 18;
          ping('Ви допомогли перетягнути генератор. +18 монет.');
        }
      } else if (event === 1) {
        if (choice === 0) {
          next.hp = Math.max(1, run.hp - 22);
          next.coins += 45;
          next.scrap += 3;
          ping('Вивезли сейф: +45 монет і 3 брухту. Будинок отримав 22 шкоди.');
        } else {
          next.hp = Math.min(max, run.hp + 22);
          ping('Перечекали бурю й підлатали вікна. +22 міцності.');
        }
      } else {
        if (choice === 0) {
          next.reward = offers(meta, run, 3, 404, true);
          next.page = 'reward';
          ping('Врятований сусід віддав креслення. Вибери модуль.');
        } else {
          next.coins += 30;
          next.scrap += 2;
          ping('Доставили вантаж. +30 монет, +2 брухту.');
        }
      }
    }
    setRun(next);
  }
  const stats = run ? statsFor(run, meta) : null;
  const board = (replacement = false) => (
    <div className="house-grid">
      {(run?.items ?? []).map((id, i) => (
        <button
          key={i}
          className={`room ${selectedSlot === i ? 'selected' : ''} ${id ? 'filled' : ''}`}
          style={
            id
              ? ({
                  '--room-color': FAMILY[ITEM_BY_ID[id].family].color,
                } as CSSProperties)
              : undefined
          }
          aria-label={
            id ? `${i + 1}: ${ITEM_BY_ID[id].name}` : `Порожня кімната ${i + 1}`
          }
          title={id ? ITEM_BY_ID[id].name : 'Вільна кімната'}
          onClick={() =>
            replacement && pending
              ? acquire(pending.id, pending.source, pending.index, i)
              : swap(i)
          }
        >
          {id ? (
            <>
              <Glyph name={ITEM_BY_ID[id].icon} size={26} />
              <small>{ITEM_BY_ID[id].name}</small>
            </>
          ) : (
            <Plus size={20} />
          )}
          <span className="room-number">{String(i + 1).padStart(2, '0')}</span>
        </button>
      ))}
    </div>
  );
  const inventory = run && stats && (
    <aside className="inventory">
      <div className="section-kicker">
        <Home size={16} /> БУДИНОК № 17{' '}
        <span>{run.items.filter(Boolean).length}/9</span>
      </div>
      {board()}
      <p className="board-help">
        Обери дві кімнати, щоб поміняти їх місцями. Сусідство створює
        комбінації.
      </p>
      {selectedSlot !== null && run.items[selectedSlot] && (
        <div className="selected-room">
          <b>{ITEM_BY_ID[run.items[selectedSlot]!].name}</b>
          <p>{ITEM_BY_ID[run.items[selectedSlot]!].desc}</p>
          <button className="text-button danger" onClick={scrap}>
            <Recycle size={15} /> Розібрати · +2 брухту
          </button>
        </div>
      )}
      <div className="stat-grid">
        <div>
          <Heart size={16} />
          <span>Міцність</span>
          <b>
            {Math.ceil(run.hp)}/{stats.health}
          </b>
        </div>
        <div>
          <Crosshair size={16} />
          <span>Шкода</span>
          <b>{Math.round(stats.damage * (1 + (run.level - 1) * 0.07))}</b>
        </div>
        <div>
          <Zap size={16} />
          <span>Темп</span>
          <b>{stats.rate.toFixed(1)}/с</b>
        </div>
        <div>
          <Footprints size={16} />
          <span>Швидкість</span>
          <b>{stats.speed}</b>
        </div>
        <div>
          <Shield size={16} />
          <span>Броня</span>
          <b>{stats.armor}</b>
        </div>
        <div>
          <Recycle size={16} />
          <span>Брухт</span>
          <b>{run.scrap}</b>
        </div>
      </div>
      {stats.synergies.length > 0 && (
        <div className="synergies">
          <b>
            <Zap size={15} /> ПРАЦЮЄ РАЗОМ
          </b>
          {stats.synergies.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
      )}
      <div className="craft-box">
        <span>
          <Wrench size={16} /> Польовий ремонт
        </span>
        <button
          className="secondary small"
          disabled={run.scrap < 3 || run.hp >= stats.health}
          onClick={() => {
            setRun({
              ...run,
              scrap: run.scrap - 3,
              hp: Math.min(stats.health, run.hp + 35),
            });
            ping('Відремонтовано +35 міцності.');
          }}
        >
          3 брухту → +35 <Heart size={13} />
        </button>
      </div>
    </aside>
  );
  return (
    <main
      className={`game-shell ${screen === 'play' && run?.page === 'combat' ? 'in-combat' : ''}`}
    >
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            if (run?.page !== 'combat') back();
          }}
          aria-label="До притулку"
        >
          <span className="brand-mark">
            <Home size={19} />
          </span>
          <b>
            ОСББ<span className="muted"> / КІНЦЯ СВІТУ</span>
          </b>
        </button>
        <span className="micro top-location">
          {screen === 'hub'
            ? 'ПРИТУЛОК № 17'
            : screen === 'workshop'
              ? 'МАЙСТЕРНЯ'
              : screen === 'codex'
                ? 'КОДЕКС ЗНАХІДОК'
                : CHAPTERS[run?.chapter ?? 0].name}
        </span>
        <div className="top-actions">
          {screen !== 'play' && <Currency amount={meta.cores} cores />}
          <button
            className="icon-button"
            aria-label={meta.sound ? 'Вимкнути звук' : 'Увімкнути звук'}
            onClick={() => {
              audio.current!.unlock();
              setMeta({ ...meta, sound: !meta.sound });
            }}
          >
            {meta.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          {screen !== 'play' && (
            <button
              className="icon-button"
              aria-label="Як грати"
              onClick={() => setHelp(true)}
            >
              <HelpCircle size={18} />
            </button>
          )}
        </div>
      </header>
      {notice && run?.page !== 'combat' && (
        <div className="notice" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <button
            aria-label="Закрити повідомлення"
            onClick={() => setNotice('')}
          >
            ×
          </button>
        </div>
      )}
      {screen === 'hub' && (
        <section className="hub">
          <div className="hub-art" />
          <div className="hub-copy">
            <p className="eyebrow">
              <span className="status-dot" /> СВІТ ЗАКІНЧИВСЯ. ОРЕНДА — НІ.
            </p>
            <h1>
              ОСББ
              <br />
              <em>кінця світу</em>
            </h1>
            <p className="intro">
              Твій дім. Твоя фортеця.
              <br />
              Твої трохи дивні сусіди.
            </p>
            <div className="crew-select" aria-label="Вибір мешканця">
              {CHARACTERS.map((c) => (
                <button
                  key={c.id}
                  className={`crew-option ${character === c.id ? 'active' : ''}`}
                  disabled={c.win > meta.wins || !!run}
                  onClick={() => setCharacter(c.id)}
                  title={
                    c.win > meta.wins
                      ? `Відкриється після розділу ${c.win}`
                      : c.desc
                  }
                >
                  {c.win > meta.wins ? (
                    <Lock size={17} />
                  ) : (
                    <Glyph name={c.icon} size={19} />
                  )}
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
            <p className="crew-description">
              {run
                ? 'Незавершений рейд збережено.'
                : CHARACTERS.find((c) => c.id === character)?.desc}
            </p>
            <button
              className="primary start-button"
              onClick={start}
              disabled={!ready}
            >
              {run ? 'ПРОДОВЖИТИ РЕЙД' : 'ВИРУШИТИ В РЕЙД'}{' '}
              <ArrowUpRight size={22} />
            </button>
            <div className="hub-links">
              <button
                className="text-button"
                onClick={() => setScreen('workshop')}
              >
                <Cog size={18} /> Майстерня
              </button>
              <button
                className="text-button"
                onClick={() => setScreen('codex')}
              >
                <BookOpen size={18} /> Кодекс{' '}
                <span className="tiny-count">
                  {meta.unlocked.length}/{ITEMS.length}
                </span>
              </button>
            </div>
            {run && (
              <button
                className="text-button muted small"
                onClick={() => setAbandon(true)}
              >
                Завершити поточний рейд
              </button>
            )}
          </div>
          <div className="chapter-plaque">
            <span className="micro">НАСТУПНА ЗУПИНКА</span>
            <h3>{CHAPTERS[chapter].name}</h3>
            <p>{CHAPTERS[chapter].story}</p>
            <div className="chapter-dots">
              {CHAPTERS.map((c, i) => (
                <button
                  key={i}
                  disabled={i > meta.wins || !!run}
                  className={chapter === i ? 'active' : ''}
                  onClick={() => setChapter(i)}
                  title={`${i + 1}. ${c.name}${i > meta.wins ? ' · ще закрито' : ''}`}
                  aria-label={`Розділ ${i + 1}: ${c.name}`}
                >
                  {i < meta.wins ? (
                    <Check size={14} />
                  ) : i > meta.wins ? (
                    <Lock size={12} />
                  ) : (
                    String(i + 1).padStart(2, '0')
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="hub-bottom">
            <span className="micro">
              {meta.wins >= 5
                ? 'СВІТАНОК НАСТАВ'
                : `РОЗДІЛ ${Math.min(meta.wins + 1, 5)} / 5`}{' '}
              <span className="divider">/</span> РЕЙДІВ: {meta.runs}
            </span>
            <span className="muted">
              Прогрес зберігається на цьому пристрої.
            </span>
          </div>
        </section>
      )}
      {screen === 'play' && run && (
        <>
          {run.page === 'combat' ? (
            <Combat
              key={`${run.seed}-${run.step}`}
              run={run}
              meta={meta}
              audio={audio.current!}
              onDone={ended}
              onExit={(r) => {
                setRun(r);
                back();
              }}
            />
          ) : (
            <div className="play-layout">
              <section className="play-main">
                <div className="page-heading">
                  <button className="text-button" onClick={back}>
                    <ArrowLeft size={16} /> Притулок
                  </button>
                  <div className="run-wallet">
                    <Currency amount={run.coins} />
                    <span>
                      <Recycle size={15} /> {run.scrap}
                    </span>
                  </div>
                </div>
                {run.page === 'map' && (
                  <>
                    <p className="eyebrow">
                      ЕКСПЕДИЦІЯ {String(meta.runs + 1).padStart(2, '0')} /
                      РОЗДІЛ {run.chapter + 1}
                    </p>
                    <h2>{CHAPTERS[run.chapter].name}</h2>
                    <p className="lead">{CHAPTERS[run.chapter].story}</p>
                    <div className="route-map">
                      {run.nodes.map((row, i) => (
                        <div
                          key={i}
                          className={`route-row ${i < run.step ? 'passed' : i === run.step ? 'current' : 'locked'}`}
                        >
                          <span className="route-step">
                            {i < run.step ? (
                              <Check size={15} />
                            ) : (
                              String(i + 1).padStart(2, '0')
                            )}
                          </span>
                          <div className="route-choices">
                            {row.map((kind) => {
                              const node = NODE_INFO[kind];
                              const C = node.icon;
                              return (
                                <button
                                  key={kind}
                                  className="route-node"
                                  style={
                                    {
                                      '--node-color': node.color,
                                    } as CSSProperties
                                  }
                                  disabled={i !== run.step}
                                  onClick={() => {
                                    audio.current!.unlock();
                                    setNotice('');
                                    setRun(enterNode(run, meta, kind));
                                    setSelectedSlot(null);
                                  }}
                                >
                                  <C size={24} />
                                  <span>
                                    <b>
                                      {kind === 'boss'
                                        ? CHAPTERS[run.chapter].boss
                                        : node.name}
                                    </b>
                                    <small>
                                      {i === run.step
                                        ? node.desc
                                        : i < run.step
                                          ? 'Пройдено'
                                          : 'Попереду'}
                                    </small>
                                  </span>
                                  {i === run.step && <ArrowUpRight size={18} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="map-note">
                      <Target size={20} />
                      <span>
                        <b>Поверни світло в район.</b>
                        <br />
                        Перемога над босом відкриває наступний розділ і нові
                        системи.
                      </span>
                    </div>
                  </>
                )}
                {run.page === 'reward' && (
                  <>
                    <p className="eyebrow">
                      <Check size={16} /> РАЙОН ЗАЧИЩЕНО
                    </p>
                    <h2>Знайшли дещо корисне.</h2>
                    <p className="lead">
                      Вибери один модуль. Усе, що встановиш, працює вже в
                      наступному бою.
                    </p>
                    <div className="reward-cards">
                      {run.reward.map((id, i) => (
                        <ItemCard
                          key={id}
                          item={ITEM_BY_ID[id]}
                          onClick={() => pick(id, 'reward', i)}
                          footer={
                            <>
                              <span>Встановити безкоштовно</span>
                              <Plus size={18} />
                            </>
                          }
                        />
                      ))}
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setRun(nextNode({ ...run, coins: run.coins + 18 }));
                        ping('Лут продано. +18 монет.');
                      }}
                    >
                      Продати знахідки за 18 монет <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {run.page === 'shop' && (
                  <>
                    <p className="eyebrow">
                      <Coins size={16} /> ВІДЧИНЕНО ДО СВІТАНКУ
                    </p>
                    <h2>Нічний ринок</h2>
                    <p className="lead">
                      «Майже нове. Лише один власник. Він більше не скаржиться».
                    </p>
                    <div className="shop-cards">
                      {run.offers.map((id, i) => (
                        <ItemCard
                          key={`${id}-${i}`}
                          compact
                          item={ITEM_BY_ID[id]}
                          disabled={
                            run.bought.includes(i) ||
                            run.coins < priceFor(ITEM_BY_ID[id], run)
                          }
                          onClick={() => pick(id, 'shop', i)}
                          footer={
                            run.bought.includes(i) ? (
                              <>
                                <Check size={16} /> Встановлено
                              </>
                            ) : (
                              <>
                                <Currency
                                  amount={priceFor(ITEM_BY_ID[id], run)}
                                />
                                <Plus size={17} />
                              </>
                            )
                          }
                        />
                      ))}
                    </div>
                    <div className="shop-tools">
                      <button
                        className="secondary"
                        disabled={run.coins < 18 + run.rerolls * 8}
                        onClick={() =>
                          setRun({
                            ...run,
                            coins: run.coins - (18 + run.rerolls * 8),
                            rerolls: run.rerolls + 1,
                            bought: [],
                            offers: offers(meta, run, 4, 91 + run.rerolls * 97),
                          })
                        }
                      >
                        <RefreshCw size={16} /> Новий товар{' '}
                        <Currency amount={18 + run.rerolls * 8} />
                      </button>
                      <button
                        className="secondary"
                        disabled={run.coins < 20 || run.hp >= stats!.health}
                        onClick={() => {
                          setRun({
                            ...run,
                            coins: run.coins - 20,
                            hp: Math.min(stats!.health, run.hp + 50),
                          });
                          ping('Ремонт завершено: +50 міцності.');
                        }}
                      >
                        <Heart size={16} /> Ремонт +50 <Currency amount={20} />
                      </button>
                    </div>
                    <button
                      className="primary"
                      onClick={() => setRun(nextNode(run))}
                    >
                      Рушати далі <ArrowRight size={18} />
                    </button>
                  </>
                )}
                {run.page === 'event' && (
                  <>
                    <p className="eyebrow">
                      <MapPin size={16} />{' '}
                      {run.kind === 'rest'
                        ? 'ТИХЕ ПОДВІР’Я'
                        : 'НЕВІДОМИЙ СИГНАЛ'}
                    </p>
                    <div className="event-symbol">
                      {run.kind === 'rest' ? (
                        <Soup size={56} />
                      ) : run.step % 3 === 0 ? (
                        <Wrench size={56} />
                      ) : run.step % 3 === 1 ? (
                        <Package size={56} />
                      ) : (
                        <Home size={56} />
                      )}
                    </div>
                    <h2>
                      {run.kind === 'rest'
                        ? 'Борщ ще теплий.'
                        : run.step % 3 === 0
                          ? 'Зустріч із Петровичем'
                          : run.step % 3 === 1
                            ? 'Сейф під руїнами'
                            : 'Сусід просить підвезти'}
                    </h2>
                    <p className="lead">
                      {run.kind === 'rest'
                        ? 'Сьогодні можна трохи побути звичайним будинком. Мешканці накрили стіл, а навколо залишилися незачинені гаражі.'
                        : run.step % 3 === 0
                          ? 'З-під припаркованого кіоску чути знайоме бурчання. Майстер пропонує допомогу — або невелику роботу.'
                          : run.step % 3 === 1
                            ? 'Металеві двері затисло під бетонною плитою. Ваші ноги витягнуть сейф, але фасад цього не забуде.'
                            : 'На балконі самотнього будинку хтось махає кресленнями. Поруч стоять ящики, за доставку яких добре заплатять.'}
                    </p>
                    {!run.eventDone ? (
                      <div className="event-options">
                        <button
                          className="event-option"
                          disabled={
                            run.kind !== 'rest' &&
                            run.step % 3 === 0 &&
                            run.coins < 20
                          }
                          onClick={() => eventChoice(0)}
                        >
                          <b>
                            {run.kind === 'rest'
                              ? 'Відпочити разом'
                              : run.step % 3 === 0
                                ? 'Замовити ремонт'
                                : run.step % 3 === 1
                                  ? 'Витягнути сейф'
                                  : 'Узяти сусіда'}
                          </b>
                          <span>
                            {run.kind === 'rest'
                              ? '+50% міцності'
                              : run.step % 3 === 0
                                ? '−20 монет · +60 міцності · +3 брухту'
                                : run.step % 3 === 1
                                  ? '−22 міцності · +45 монет · +3 брухту'
                                  : 'Один із трьох модулів на вибір'}
                          </span>
                          <ArrowUpRight size={20} />
                        </button>
                        <button
                          className="event-option"
                          onClick={() => eventChoice(1)}
                        >
                          <b>
                            {run.kind === 'rest'
                              ? 'Обшукати гаражі'
                              : run.step % 3 === 0
                                ? 'Допомогти з генератором'
                                : run.step % 3 === 1
                                  ? 'Перечекати бурю'
                                  : 'Узяти вантаж'}
                          </b>
                          <span>
                            {run.kind === 'rest'
                              ? '+5 брухту · +15 монет'
                              : run.step % 3 === 0
                                ? '+18 монет'
                                : run.step % 3 === 1
                                  ? '+22 міцності'
                                  : '+30 монет · +2 брухту'}
                          </span>
                          <ArrowUpRight size={20} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => setRun(nextNode(run))}
                      >
                        Рушати далі <ArrowRight size={18} />
                      </button>
                    )}
                  </>
                )}
              </section>
              {inventory}
            </div>
          )}
        </>
      )}
      {screen === 'workshop' && (
        <section className="collection-page">
          <button className="text-button" onClick={back}>
            <ArrowLeft size={16} /> До притулку
          </button>
          <p className="eyebrow">ТЕ, ЩО ЗАЛИШАЄТЬСЯ З ТОБОЮ</p>
          <div className="collection-title">
            <div>
              <h2>Майстерня</h2>
              <p className="lead">
                Ядра з рейдів відкривають покращення для всіх майбутніх
                будинків.
              </p>
            </div>
            <Currency amount={meta.cores} cores />
          </div>
          <div className="research-grid">
            {RESEARCH.map((r) => {
              const level = meta.research[r.id] ?? 0,
                cost = r.cost * (level + 1);
              return (
                <article className="research-card" key={r.id}>
                  <span className="research-icon">
                    <Glyph name={r.icon} size={32} />
                  </span>
                  <h3>{r.name}</h3>
                  <p>{r.desc}</p>
                  <div className="research-levels">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className={i < level ? 'done' : ''} />
                    ))}
                  </div>
                  <button
                    className="secondary"
                    disabled={level >= 5 || meta.cores < cost}
                    onClick={() => research(r.id, r.cost)}
                  >
                    {level >= 5 ? (
                      'Завершено'
                    ) : (
                      <>
                        Дослідити <Currency amount={cost} cores />
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
          <div className="progression-list">
            <h3>Що чекає за наступними воротами</h3>
            {CHAPTERS.map((c, i) => (
              <div key={i} className={meta.wins > i ? 'completed' : ''}>
                <span>
                  {meta.wins > i ? <Check size={20} /> : <Lock size={20} />}
                </span>
                <div>
                  <b>{c.name}</b>
                  <p>{c.unlock}</p>
                </div>
                <small>{meta.wins > i ? 'ВІДКРИТО' : `РОЗДІЛ ${i + 1}`}</small>
              </div>
            ))}
          </div>
          <div className="career-stats">
            <span>
              Рейди <b>{meta.runs}</b>
            </span>
            <span>
              Перемоги сюжету <b>{meta.wins}/5</b>
            </span>
            <span>
              Вороги <b>{meta.kills}</b>
            </span>
            <span>
              Рекорд рейду <b>{meta.best}</b>
            </span>
          </div>
        </section>
      )}
      {screen === 'codex' && (
        <section className="collection-page">
          <button className="text-button" onClick={back}>
            <ArrowLeft size={16} /> До притулку
          </button>
          <p className="eyebrow">ЗНАЙОМСЯ. КОМБІНУЙ. ЕКСПЕРИМЕНТУЙ.</p>
          <div className="collection-title">
            <div>
              <h2>Кодекс знахідок</h2>
              <p className="lead">
                {meta.unlocked.length} із {ITEMS.length} креслень відкрито.
                Умови відомі — обирай власну ціль.
              </p>
            </div>
            <BookOpen size={42} className="muted" />
          </div>
          <div className="codex-controls">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Назва або ефект предмета…"
              aria-label="Пошук предметів"
            />
            <div className="filter-buttons">
              {[
                ['all', 'Усі'],
                ['open', 'Відкриті'],
                ['locked', 'Закриті'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={filter === id ? 'active' : ''}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="codex-grid">
            {ITEMS.filter(
              (i) =>
                (filter === 'all' ||
                  (filter === 'open' && meta.unlocked.includes(i.id)) ||
                  (filter === 'locked' && !meta.unlocked.includes(i.id))) &&
                (i.name + ' ' + i.desc)
                  .toLocaleLowerCase('uk')
                  .includes(search.toLocaleLowerCase('uk')),
            ).map((i) => (
              <div
                key={i.id}
                className={meta.unlocked.includes(i.id) ? '' : 'locked-item'}
              >
                <ItemCard
                  item={i}
                  compact
                  footer={
                    <span className="unlock-rule">
                      {meta.unlocked.includes(i.id) ? (
                        <Check size={14} />
                      ) : (
                        <Lock size={14} />
                      )}{' '}
                      {meta.unlocked.includes(i.id)
                        ? 'Є в нагородах і магазинах'
                        : UNLOCK_TEXT[i.unlock]}
                    </span>
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent className="game-modal">
          <DialogTitle>Усі квартири зайняті</DialogTitle>
          <DialogDescription>
            Вибери кімнату для заміни на «
            {pending && ITEM_BY_ID[pending.id].name}». Старий модуль дасть 1
            брухту.
          </DialogDescription>
          {board(true)}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!result}
        onOpenChange={(open) => {
          if (!open) setResult(null);
        }}
      >
        <DialogContent className="game-modal result-modal">
          <div className={`result-symbol ${result?.won ? 'won' : ''}`}>
            {result?.final ? (
              <Crown size={40} />
            ) : result?.won ? (
              <Trophy size={40} />
            ) : (
              <Home size={40} />
            )}
          </div>
          <DialogTitle>
            {result?.final
              ? 'Світанок настав.'
              : result?.won
                ? 'Район знову живий.'
                : 'Будинок не витримав.'}
          </DialogTitle>
          <DialogDescription>
            {result?.final
              ? 'Місто більше не замкнене. Ваші сусіди нарешті побачили ранок. Історію завершено — інші збірки й колекція ще чекають.'
              : result?.won
                ? CHAPTERS[result.run.chapter].unlock
                : 'Мешканці повернулися до притулку. Новий дім буде іншим. Креслення й зароблені ядра залишилися з тобою.'}
          </DialogDescription>
          {result && (
            <>
              <div className="result-stats">
                <span>
                  <Skull size={16} /> {result.run.kills} ворогів
                </span>
                <span>
                  <Timer size={16} /> {Math.floor(result.run.time / 60)} хв{' '}
                  {Math.floor(result.run.time % 60)} с
                </span>
                <Currency amount={result.cores} cores />
              </div>
              {result.unlocks.length > 0 && (
                <div className="unlock-list">
                  <b>НОВІ КРЕСЛЕННЯ · {result.unlocks.length}</b>
                  {result.unlocks.map((id) => (
                    <span key={id}>
                      <Glyph name={ITEM_BY_ID[id].icon} size={15} />
                      {ITEM_BY_ID[id].name}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <button className="primary" onClick={() => setResult(null)}>
            До притулку <ArrowRight size={18} />
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="game-modal help-modal">
          <DialogTitle>Як пережити ще один день</DialogTitle>
          <DialogDescription>
            ОСББ кінця світу · 5 сюжетних рейдів, 36 модулів і сотні можливих
            комбінацій.
          </DialogDescription>
          <div className="help-list">
            <p>
              <b>01 / Керуй будинком.</b> WASD або стрілки. На телефоні —
              джойстик ліворуч. Стрільба автоматична.
            </p>
            <p>
              <b>02 / Уникай шкоди.</b> Пробіл — ривок із коротким захистом. E —
              ударна хвиля. На телефоні використовуй кнопки праворуч.
            </p>
            <p>
              <b>03 / Збирай ресурси.</b> Жовте — монети для магазину. Зелене —
              досвід. Новий рівень відновлює 18 міцності й додає 7% базової
              шкоди.
            </p>
            <p>
              <b>04 / Перебудовуйся.</b> На карті натисни дві кімнати, щоб
              поміняти їх місцями. Пральня посилює механіку, Тесла — електрику,
              теплиця — живі кімнати поруч.
            </p>
            <p>
              <b>05 / Повертайся.</b> Предмети й монети належать одному рейду.
              Ядра, дослідження, відкриті креслення та сюжет зберігаються
              назавжди.
            </p>
            <p>
              <b>06 / Заверши історію.</b> Кожна перемога відкриває новий район
              і механіки. П’ята веде до справжнього фіналу. Предмети можна
              дозбирати після нього.
            </p>
          </div>
          <p className="privacy-note">
            Гра зберігає прогрес лише на цьому пристрої. Немає реклами, покупок
            за реальні гроші, акаунтів чи збору персональних даних.
            Android-версія працює без інтернету.
          </p>
          {!native && (
            <a
              className="secondary download-link"
              href="/downloads/osbb.apk"
              download
            >
              <Download size={17} /> Завантажити Android APK
            </a>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={abandon} onOpenChange={setAbandon}>
        <DialogContent className="game-modal">
          <DialogTitle>Завершити цей рейд?</DialogTitle>
          <DialogDescription>
            Поточний будинок і монети зникнуть. Зароблені ядра та умови
            відкриття предметів буде враховано.
          </DialogDescription>
          <button
            className="primary"
            onClick={() => {
              if (run) ended({ run, won: false, boss: false });
              setAbandon(false);
            }}
          >
            Завершити й повернутися
          </button>
          <button className="secondary" onClick={() => setAbandon(false)}>
            Залишитися в рейді
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
