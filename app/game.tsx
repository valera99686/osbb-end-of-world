'use client';
import { Workshop } from './workshop';
import { blueprintInfo } from '@/lib/game/progression';
import { LOCATIONS, campaignBoss } from '@/lib/game/encounters';
import { FurnitureCard, CampaignEventPanel } from './campaign-panels';
import { FURNITURE_BY_ID } from '@/lib/game/furniture';
import { minibossFor } from '@/lib/game/minibosses';
import {
  battleRewards,
  minibossVariant,
  advanceLocation,
  claimFurniture,
  buyFurniture,
  furniturePrice,
  rerollShop,
  repairShop,
} from '@/lib/game/model';
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
  Crosshair,
  Hexagon,
  Package,
  ScrollText,
  Recycle,
  Crown,
  Lock,
  Check,
  Skull,
  Plus,
  RefreshCw,
  HelpCircle,
  Download,
  Trophy,
  Target,
  Timer,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { RouteTree, NODE_INFO } from './route-tree';
import { preloadEnemyArt } from '@/lib/game/enemy-art';
import { Glyph } from './glyph';
import { activeEquipment, APARTMENT_SLOTS } from '@/lib/game/equipment';
import { Residents, HousePreview, EquipmentPlacement } from './residents';
import { CutscenePlayer, StoryLibrary } from './cutscenes';
import { CUTSCENES, SCENE_BY_ID, MISSIONS } from '@/lib/game/cutscenes';
import { residentCells, RESIDENT_BY_ID, houseSize } from '@/lib/game/residents';
import { loreForProgress } from '@/lib/game/lore';
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
  priceFor,
  enterNode,
  nextNode,
  equip,
  packItem,
  finishRun,
  readSave,
  saveData,
  SAVE_KEY,
  type Meta,
  type Run,
} from '@/lib/game/model';
import {
  Battle,
  AudioEngine,
  type Hud,
  type BattleResult,
} from '@/lib/game/engine';

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
type Result = {
  won: boolean;
  run: Run;
  cores: number;
  unlocks: string[];
  final: boolean;
  projects: string[];
  coreBreakdown: { label: string; amount: number }[];
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
    bossAttack: '',
    bossPhase: 0,
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
              ? campaignBoss(run.chapter, run.bossVariants[run.chapter]).name
              : run.kind === 'miniboss'
                ? minibossFor(run.chapter, minibossVariant(run)).name
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
            {run.kind === 'miniboss'
              ? `Мінібос · ${minibossFor(run.chapter, minibossVariant(run)).name}`
              : campaignBoss(run.chapter, run.bossVariants[run.chapter])
                  .name}{' '}
            · {Math.ceil(hud.boss)} / {hud.bossMax}
          </span>
          <small className="boss-attack-cue">
            ФАЗА {hud.bossPhase + 1} · {hud.bossAttack || 'Готується до атаки'}
          </small>
          <Meter
            value={hud.boss}
            max={hud.bossMax}
            color="#e69080"
            label={
              run.kind === 'miniboss' ? 'Міцність мінібоса' : 'Міцність боса'
            }
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
              : run.kind === 'miniboss'
                ? 'Знищ мінібоса. Виходь із позначених зон до удару; ривок захищає від шкоди.'
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
            Забіг поставлено на паузу. Повернення до меню збереже стан перед цим
            боєм.
          </DialogDescription>
          <button className="primary" onClick={() => setPaused(false)}>
            <Play size={18} /> Продовжити
          </button>
          <button
            className="secondary"
            onClick={() => onExit({ ...run, page: 'map' })}
          >
            <Home size={18} /> Зберегти й до меню
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
    [screen, setScreen] = useState<
      'hub' | 'play' | 'workshop' | 'codex' | 'lore'
    >('hub');
  const [character, setCharacter] = useState('mechanic'),
    [chapter, setChapter] = useState(0),
    [help, setHelp] = useState(false),
    [housingOpen, setHousingOpen] = useState(false),
    [notice, setNotice] = useState(''),
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
    preloadEnemyArt();
    try {
      const s = readSave(localStorage.getItem(SAVE_KEY));
      setMeta({
        ...s.meta,
        sceneProgress:
          s.meta.sceneProgress ??
          (!s.meta.scenesSeen.includes('prologue')
            ? { id: 'prologue', index: 0 }
            : null),
      });
      setRun(s.run);
      setCharacter(s.run?.character ?? 'mechanic');
      setChapter(0);
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
      if (meta.sceneProgress) {
        e.preventDefault();
        closeScene();
        return;
      }
      if (housingOpen) {
        e.preventDefault();
        setHousingOpen(false);
        return;
      }
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
  }, [
    run?.page,
    screen,
    help,
    housingOpen,
    meta.sceneProgress,
    result,
    pending,
    abandon,
  ]);
  function ping(message: string) {
    setNotice(message);
    audio.current!.play('coin');
  }
  function closeScene() {
    setMeta((m) => ({
      ...m,
      scenesSeen: m.sceneProgress
        ? [...new Set([...m.scenesSeen, m.sceneProgress.id])]
        : m.scenesSeen,
      sceneProgress: null,
    }));
  }
  function playScene(id: string) {
    if (SCENE_BY_ID[id])
      setMeta((m) => ({ ...m, sceneProgress: { id, index: 0 } }));
  }
  function start() {
    if (!ready) return;
    audio.current!.unlock();
    if (run) {
      setScreen('play');
      if (!meta.scenesSeen.includes(`arrival-${run.chapter}`))
        playScene(`arrival-${run.chapter}`);
      return;
    }
    setRun(makeRun(meta, character, 0));
    setMeta({
      ...meta,
      lore: loreForProgress(meta.lore, meta.wins, chapter),
      sceneProgress: !meta.scenesSeen.includes(`arrival-${chapter}`)
        ? { id: `arrival-${chapter}`, index: 0 }
        : null,
    });
    setScreen('play');
    setResult(null);
    setNotice('');
  }
  function back() {
    setHousingOpen(false);
    setScreen('hub');
    setNotice('');
  }
  function ended(b: BattleResult) {
    const gate = b.boss && b.run.step === b.run.nodes.length - 1;
    if (b.won && gate && b.run.chapter < 2) {
      setRun(advanceLocation(b.run, meta));
      setMeta((m) => ({
        ...m,
        scenesSeen: [
          ...new Set([...m.scenesSeen, `arrival-${b.run.chapter + 1}`]),
        ],
        sceneProgress: { id: 'victory-' + b.run.chapter, index: 0 },
      }));
      ping('Локацію пройдено. Будинок і здобич переходять далі.');
      return;
    }
    if (!b.won || gate) {
      const f = finishRun(meta, b.run, b.won);
      setMeta({
        ...f.meta,
        sceneProgress: b.won ? { id: 'victory-2', index: 0 } : null,
      });
      setRun(null);
      setResult({
        won: b.won,
        run: b.run,
        cores: f.cores,
        projects: f.projects,
        coreBreakdown: f.coreBreakdown,
        unlocks: f.unlocks,
        final: b.won,
      });
      setChapter(0);
      setScreen('hub');
    } else setRun(battleRewards(b.run, meta));
  }
  function pick(id: string, source: 'shop' | 'reward', index: number) {
    if (!run) return;
    if (
      source === 'shop' &&
      (run.bought.includes(index) || run.coins < priceFor(ITEM_BY_ID[id], run))
    )
      return;
    setPending({ id, source, index });
  }
  function acquireToBag() {
    if (!run || !pending) return;
    const { id, source, index } = pending;
    const cost = source === 'shop' ? priceFor(ITEM_BY_ID[id], run) : 0;
    if (source === 'shop' && (run.coins < cost || run.bought.includes(index)))
      return;
    let next = packItem(run, meta, id);
    if (next === run) {
      ping(
        'Забагато невстановлених предметів. Встанови або розбери запасний модуль у квартирах.',
      );
      return;
    }
    next = {
      ...next,
      coins: next.coins - cost,
      bought: source === 'shop' ? [...next.bought, index] : next.bought,
    };
    if (source === 'reward') next = nextNode(next);
    setRun(next);
    setPending(null);
    setMeta({
      ...meta,
      seen: [...new Set([...meta.seen, id])],
      unlocked: [...new Set([...meta.unlocked, id])],
    });
    ping(
      `${ITEM_BY_ID[id].name} збережено. Встанови предмет через «Квартири й обладнання».`,
    );
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
    if (next === run) {
      ping(
        'Це місце зайняте або забагато невстановлених предметів. Обери вільну клітинку квартири.',
      );
      return;
    }
    next = {
      ...next,
      coins: next.coins - cost,
      bought: source === 'shop' ? [...next.bought, index] : next.bought,
    };
    setMeta((m) => ({
      ...m,
      seen: [...new Set([...m.seen, id])],
      unlocked: [...new Set([...m.unlocked, id])],
    }));
    if (source === 'reward') next = nextNode(next);
    setRun(next);
    setPending(null);
    ping(
      `${item.name} — квартира ${RESIDENT_BY_ID[APARTMENT_SLOTS[slot].resident].name}${run.items[slot] ? ' · попередній предмет знято та збережено' : ''}.`,
    );
  }
  const stats = run ? statsFor(run, meta) : null;
  const inventory = run && stats && (
    <aside className="inventory">
      <div className="section-kicker">
        <Home size={16} /> БУДИНОК № 17{' '}
        <span>{run.residents.length} мешканців</span>
      </div>
      <HousePreview
        run={run}
        level={run.houseLevel}
        onOpen={() => setHousingOpen(true)}
      />
      <button
        className="primary housing-open"
        onClick={() => setHousingOpen(true)}
      >
        <Home size={18} /> Квартири й обладнання{' '}
        <span>
          {run.residents.reduce((n, r) => n + residentCells(r.id).length, 0)}/
          {houseSize(run.houseLevel).width * houseSize(run.houseLevel).height}
        </span>
      </button>
      <p className="board-help">
        Натисни квартиру: обладнання встановлюється всередині неї. Сусідні
        модулі й мешканці утворюють комбінації.
      </p>
      <div className="equipment-summary">
        <span>
          Обладнання у квартирах <b>{activeEquipment(run).length}</b>
        </span>
      </div>
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
          <b>
            {Math.round(
              stats.damage * (1 + Math.min(0.6, (run.level - 1) * 0.04)),
            )}
          </b>
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
        <p className="scrap-help">
          Брухт — запчастини з боїв, подій і розібраного обладнання. Витрачай їх
          на ремонт або обмін у подіях.
        </p>
        <button
          className="secondary small"
          disabled={run.scrap < 3 || run.hp >= stats.health}
          onClick={() => {
            setRun({
              ...run,
              scrap: run.scrap - 3,
              hp: Math.min(stats.health, run.hp + 35),
            });
            ping(
              `Відремонтовано +${Math.min(35, Math.ceil(stats.health - run.hp))} міцності.`,
            );
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
          aria-label="Головне меню"
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
                : screen === 'lore'
                  ? 'АРХІВ БУДИНКУ'
                  : LOCATIONS[run?.chapter ?? 0].name}
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
              Україна, 2086 рік. Врятуй мешканців будинку №17 і зупини систему,
              яка щоразу повертає місто до початку катастрофи о 04:17.
            </p>
            <div className="crew-select" aria-label="Голова ОСББ для рейду">
              {CHARACTERS.map((c) => (
                <button
                  key={c.id}
                  className={`crew-option ${(run?.character ?? character) === c.id ? 'active' : ''}`}
                  disabled={c.win > meta.wins || !!run}
                  onClick={() => setCharacter(c.id)}
                  title={
                    c.win > meta.wins
                      ? `Заверши ${c.win} повних експедицій`
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
                ? `Голова ОСББ: ${RESIDENT_BY_ID[run.character].name}. На борту — ${run.residents.length}. Урятовані в цій експедиції: ${run.rescued.length}.`
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
              <button className="text-button" onClick={() => setScreen('lore')}>
                <ScrollText size={18} /> Історія{' '}
                <span className="tiny-count">
                  {meta.scenesSeen.length}/{CUTSCENES.length}
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
            <h3>{LOCATIONS[run?.chapter ?? 0].name}</h3>
            <p>{LOCATIONS[run?.chapter ?? 0].desc}</p>
            <ol className="campaign-itinerary">
              {LOCATIONS.map((location, i) => (
                <li
                  key={location.id}
                  className={(run?.chapter ?? 0) === i ? 'active' : ''}
                >
                  <b>0{i + 1}</b>
                  <span>{location.name}</span>
                  {run && run.chapter > i && <Check size={16} />}
                </li>
              ))}
            </ol>
          </div>
          <div className="hub-bottom">
            <span className="micro">
              {meta.wins > 0
                ? 'СВІТАНОК НАСТАВ'
                : '3 ЛОКАЦІЇ · 9 ВАРІАНТІВ БОСІВ'}{' '}
              <span className="divider">/</span> РЕЙДІВ: {meta.runs}
            </span>
            <span className="muted">
              v0.9.0 · Прогрес зберігається на цьому пристрої.
            </span>
          </div>
        </section>
      )}
      {screen === 'play' && run && (
        <>
          {run.page === 'combat' ? (
            <Combat
              key={`${run.seed}-${run.chapter}-${run.step}`}
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
                    <ArrowLeft size={16} /> Меню
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
                    <h2>{LOCATIONS[run.chapter].name}</h2>
                    <p className="lead">{LOCATIONS[run.chapter].desc}</p>
                    <div className="mission-banner">
                      <Target size={22} />
                      <div>
                        <small>МЕТА РЕЙДУ · {run.chapter + 1}/3</small>
                        <p>{MISSIONS[run.chapter]}</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => playScene(`arrival-${run.chapter}`)}
                        aria-label="Переглянути сюжет району"
                      >
                        <Play size={19} />
                      </button>
                    </div>
                    <RouteTree
                      key={`${run.seed}-${run.chapter}-${run.step}`}
                      run={run}
                      onEnter={(id) => {
                        audio.current!.unlock();
                        setNotice('');
                        setRun(enterNode(run, meta, id));
                      }}
                    />
                    <div className="map-note">
                      <Target size={20} />
                      <span>
                        <b>Поверни світанок.</b>
                        <br />
                        Рятуй людей після боїв і в подіях. Пройди три локації з
                        одним будинком. Після поразки зберігаються ядра та
                        креслення; наступна експедиція знову починається з
                        головою ОСББ.
                      </span>
                    </div>
                  </>
                )}
                {run.page === 'reward' && (
                  <>
                    <p className="eyebrow">
                      <Check size={16} />{' '}
                      {run.kind === 'chest' ? 'СКРИНЮ ВІДКРИТО' : 'ЗДОБИЧ'}
                    </p>
                    <h2>Знайшли дещо корисне.</h2>
                    <p className="lead">
                      {run.kind === 'chest'
                        ? 'У скрині один випадковий предмет.'
                        : 'Вибери один предмет.'}{' '}
                      Обладнання й меблі встановлюються всередині квартир.
                    </p>
                    {run.eventResult && (
                      <div className="mission-banner" role="status">
                        <Home size={22} />
                        <p>{run.eventResult}</p>
                        <button
                          className="secondary"
                          onClick={() => setHousingOpen(true)}
                        >
                          Квартири
                        </button>
                      </div>
                    )}
                    <div className="reward-cards">
                      {run.loot.map((loot, i) =>
                        loot.kind === 'module' ? (
                          <ItemCard
                            key={loot.kind + loot.id}
                            item={ITEM_BY_ID[loot.id]}
                            onClick={() => pick(loot.id, 'reward', i)}
                            footer={
                              <>
                                <span>Забрати обладнання</span>
                                <Plus size={18} />
                              </>
                            }
                          />
                        ) : (
                          <FurnitureCard
                            key={loot.kind + loot.id}
                            id={loot.id}
                            footer="Забрати меблі"
                            onClick={() => {
                              const next = claimFurniture(run, i);
                              if (next === run) {
                                ping('Запас меблів заповнений.');
                                return;
                              }
                              setRun(next);
                              ping(
                                FURNITURE_BY_ID[loot.id].name +
                                  ' на борту. Встанови у квартирі.',
                              );
                            }}
                          />
                        ),
                      )}
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setRun(nextNode({ ...run, coins: run.coins + 10 }));
                        ping('Лут продано. +10 монет.');
                      }}
                    >
                      Продати знахідки за 10 монет <ArrowRight size={16} />
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
                    <div className="shop-cards furniture-shop-cards">
                      {run.shopFurniture.map((id, i) => (
                        <FurnitureCard
                          key={id + i}
                          id={id}
                          disabled={
                            run.bought.includes(10 + i) ||
                            run.coins < furniturePrice(run, id) ||
                            run.furniture.length >= 30
                          }
                          footer={
                            run.bought.includes(10 + i) ? (
                              'Придбано'
                            ) : (
                              <Currency amount={furniturePrice(run, id)} />
                            )
                          }
                          onClick={() => {
                            const next = buyFurniture(run, id);
                            if (next !== run) {
                              setRun(next);
                              ping('Меблі на борту. Встанови їх у квартирі.');
                            }
                          }}
                        />
                      ))}
                    </div>
                    <div className="shop-tools">
                      <button
                        className="secondary"
                        disabled={run.coins < 25 + 15 * run.rerolls}
                        onClick={() => setRun(rerollShop(run, meta))}
                      >
                        <RefreshCw size={16} /> Оновити непроданий товар{' '}
                        <Currency amount={25 + 15 * run.rerolls} />
                      </button>
                      <button
                        className="secondary"
                        disabled={
                          run.repairUsed ||
                          run.coins < 30 + run.chapter * 10 ||
                          run.hp >= stats!.health
                        }
                        onClick={() => setRun(repairShop(run, meta))}
                      >
                        <Heart size={16} />{' '}
                        {run.repairUsed ? 'Ремонт використано' : 'Ремонт +30%'}{' '}
                        <Currency amount={30 + run.chapter * 10} />
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
                  <CampaignEventPanel run={run} meta={meta} onChange={setRun} />
                )}
              </section>
              {inventory}
            </div>
          )}
        </>
      )}
      {screen === 'workshop' && (
        <Workshop
          meta={meta}
          onChange={setMeta}
          onBack={back}
          onMessage={ping}
        />
      )}
      {screen === 'codex' && (
        <section className="collection-page">
          <button className="text-button" onClick={back}>
            <ArrowLeft size={16} /> Головне меню
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
      {screen === 'lore' && (
        <StoryLibrary meta={meta} onBack={back} onPlay={playScene} />
      )}
      <Dialog open={housingOpen && !!run} onOpenChange={setHousingOpen}>
        <DialogContent className="game-modal housing-modal">
          <DialogTitle>Будинок №17 / Квартири й обладнання</DialogTitle>
          <DialogDescription>
            Спільні стіни створюють бонуси й конфлікти. Обери квартиру, щоб
            переставити її або знести стіну до сусіда. Обладнання став у вільні
            клітинки всередині квартир.
          </DialogDescription>
          {run && (
            <Residents
              run={run}
              meta={meta}
              onChange={setRun}
              onMetaChange={setMeta}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent className="game-modal">
          <DialogTitle>{pending && ITEM_BY_ID[pending.id].name}</DialogTitle>
          <DialogDescription>
            Обери місце всередині квартири мешканця. Якщо там є модуль, його
            буде знято та збережено для іншої квартири. Портрет мешканця та
            площа поза квартирами недоступні.
          </DialogDescription>
          {run && pending && (
            <EquipmentPlacement
              run={run}
              level={run.houseLevel}
              itemId={pending.id}
              onInstall={(slot) =>
                acquire(pending.id, pending.source, pending.index, slot)
              }
            />
          )}
          <button
            className="secondary"
            disabled={!run || !pending || run.backpack.length >= 30}
            onClick={acquireToBag}
          >
            <Package size={18} /> Встановити пізніше
          </button>
          {run && pending && run.backpack.length >= 30 && (
            <p className="muted">
              Забагато невстановлених предметів. Встанови або розбери один із
              запасних модулів у квартирах.
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!result && !meta.sceneProgress}
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
                : 'Мешканці повернулися до меню. Новий дім буде іншим. Креслення й зароблені ядра залишилися з тобою.'}
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
              <div className="raid-core-breakdown">
                {result.coreBreakdown.map((r) => (
                  <span key={r.label}>
                    {r.label}: +{r.amount}
                  </span>
                ))}
              </div>
              {result.projects.length > 0 && (
                <div className="raid-projects">
                  <h3>Нові проєкти в майстерні</h3>
                  <p>
                    Умови виконано. Придбай креслення за ядра, щоб предмети
                    з’являлися в наступних рейдах.
                  </p>
                  <ul>
                    {result.projects.map((id) => (
                      <li key={id}>{blueprintInfo(id).name}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                className="secondary"
                onClick={() => {
                  setResult(null);
                  setScreen('workshop');
                }}
              >
                Відкрити майстерню <ArrowRight size={18} />
              </button>
              {result.won && (
                <button
                  className="secondary"
                  onClick={() => playScene(`victory-${result.run.chapter}`)}
                >
                  <Play size={17} /> Переглянути сюжет перемоги
                </button>
              )}
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
            Головне меню <ArrowRight size={18} />
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="game-modal help-modal">
          <DialogTitle>Як пережити ще один день</DialogTitle>
          <DialogDescription>
            ОСББ кінця світу · v0.9.0 · 3 локації, 9 мешканців, 9 варіантів
            босів, 9 мінібосів, 18 видів ворогів і сюжетні катсцени.
          </DialogDescription>
          <div className="help-list">
            <p>
              <b>Будуй свій білд.</b> Квартири взаємодіють через спільну стіну.
              План показує бонуси й недоліки до підтвердження перестановки.
              Знеси стіну між двома квартирами: вони стануть однією фігурою із
              захисною хвилею, але сповільнять дім. Стіну можна відновити
              безкоштовно між боями. У другій локації відкриваються спільні
              здібності, у третій — ризиковані режими Іскри та Соломії.
            </p>
            <p>
              <b>Мінібоси.</b> Клітинка зі щитом веде до сильного ворога з
              власною шкалою здоров’я. На карті випадково з’являється 1–4 такі
              клітинки; кожна обирає одного з трьох місцевих мінібосів. Мінібос
              може трапитися і в «?». Бос локації чекає на останньому кроці;
              перемога над ним відкриває наступну локацію.
            </p>
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
              досвід. Новий рівень відновлює 10 міцності й додає 4% шкоди, до
              +60%.
            </p>
            <p>
              <b>04 / Перебудовуйся.</b> У квартирах перетягуй портрет, щоб
              перемістити кімнату. Пральня посилює механіку, Тесла — електрику,
              теплиця — живі кімнати поруч.
            </p>
            <p>
              <b>05 / Повертайся.</b> Предмети й монети належать одному рейду.
              Ядра, дослідження, відкриті креслення та сюжет зберігаються
              назавжди.
            </p>
            <p>
              <b>Мешканці.</b> Відкрий «Розселити мешканців». Повертай і
              перетягуй їхні фігурні кімнати. Сумісні сусіди дають додаткові
              бонуси. Нових людей рятуй після боїв та в подіях. У наступній
              експедиції команду збираєш знову.
            </p>
            <p>
              <b>Історія.</b> Катсцени показують катастрофу, евакуацію й причину
              часової петлі. Вони відкриваються на початку районів та після
              босів. Повторний перегляд — у «Історії» в притулку.
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
      {ready && meta.sceneProgress && (
        <CutscenePlayer
          progress={meta.sceneProgress}
          onAdvance={(index) =>
            setMeta((m) => ({
              ...m,
              sceneProgress: m.sceneProgress
                ? { ...m.sceneProgress, index }
                : null,
            }))
          }
          onClose={closeScene}
        />
      )}
    </main>
  );
}
