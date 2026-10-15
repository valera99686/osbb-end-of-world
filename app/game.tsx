'use client';
import {
  PROFILE_BACKUP_KEY,
  importProfile,
  resetProfile,
  restoreProfile,
} from '@/lib/game/profile';
import { Tutorial } from './tutorial';
import { Workshop } from './workshop';
import { blueprintInfo, runDepth } from '@/lib/game/progression';
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
  rerollCost,
  repairCost,
  isFinalVictory,
  skipDraft,
  type CoreRow,
} from '@/lib/game/model';
import {
  NextGoal,
  RunProgress,
  CoreBreakdown,
  UnlockList,
} from './progress-goal';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
} from 'react';
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
  ChartColumn,
  Search,
  Award,
  CalendarDays,
  Flame,
  Infinity as InfinityIcon,
  MonitorDown,
  Settings as SettingsIcon,
} from 'lucide-react';
import {
  ACHIEVEMENTS,
  applyAchievements,
  newAchievements,
} from '@/lib/game/achievements';
import { renderThemePreview, type MusicTheme } from '@/lib/game/audio';
import { dateKey, runScore } from '@/lib/game/modes';
import { SettingsDialog } from './settings';
import { StatsPage, AchievementsPage, ownedAchievements } from './records';
import { Toasts, achievementToasts, type Toast } from './toasts';
import { useGamepadMenu } from './gamepad-menu';
import { useInstallPrompt, useServiceWorker } from './pwa';
import {
  HeatSelect,
  HubModes,
  RunBadge,
  MODE_NAMES,
  dailyLaunch,
  shortDate,
  type Launch,
} from './modes-panel';
import './features.css';
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
import { DialoguePlayer, ProtocolCard, RadioStrip } from './dialogue';
import { CasePage } from './case-file';
import {
  CLUES,
  LIBRARY_IDS,
  addClues,
  addEnding,
  bossQuote,
  combatBark,
  hubScene,
  isStoryId,
  rescueQuote as storyRescueQuote,
  storyScene,
  type Choice,
  type Line,
  type SpeakerId,
} from '@/lib/game/story';
import { RescueCard, setRescueQuoteSource } from './rescue-card';
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
  type Settings,
} from '@/lib/game/model';
import {
  Battle,
  AudioEngine,
  type Hud,
  type BattleResult,
} from '@/lib/game/engine';
import { settleBattle } from './battle-end';
import { PerkDraft } from './perk-draft';
import { evolutionHint, type WeaponId } from '@/lib/game/weapons';
import type { PerkId } from '@/lib/game/upgrades';

// Injected by vite.game.config.ts; other bundlers leave it undefined.
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
const THEMES: MusicTheme[] = ['rust', 'green', 'core'];
// Manifest shortcut from the launch URL, read once: StrictMode runs the load
// effect twice and the URL is already cleaned up by the second pass.
const SHORTCUT = (() => {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  if (params.get('continue') === '1') return 'continue';
  return params.get('daily') === '1' ? 'daily' : '';
})();
// Opens a cutscene only the first time it is reached.
function firstScene(meta: Meta, id: string) {
  return meta.scenesSeen.includes(id) ? null : { id, index: 0 };
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
type Result = {
  won: boolean;
  run: Run;
  cores: number;
  unlocks: string[];
  final: boolean;
  projects: string[];
  coreBreakdown: CoreRow[];
  // Run depth reached, the new best and the best before this run.
  progress: { depth: number; best: number; previous: number };
  // Daily score and whether it beat the stored best for that day.
  score: number;
  record: boolean;
  dayBest: number;
  // Galyna's protocol of the finished raid, shown inside the result.
  protocol?: Line[];
};
// Weapon cores name the neighbour that evolves them.
function EvolutionHint({ weapon }: { weapon: WeaponId }) {
  const evo = evolutionHint(weapon),
    partner = evo && ITEM_BY_ID[evo.partner];
  if (!evo || !partner) return null;
  return (
    <small className="evolution-hint">
      Поруч із «{partner.name}» → <b>{evo.name}</b>
    </small>
  );
}
function ItemCard({
  item,
  footer,
  onClick,
  disabled,
  compact = false,
  fresh = false,
}: {
  item: Item;
  footer?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
  // Newly unlocked: tagged 'НОВЕ' on its first appearance.
  fresh?: boolean;
}) {
  const className = `item-card rarity-${item.rarity} ${compact ? 'compact' : ''} ${fresh ? 'fresh' : ''}`;
  const content = (
    <>
      {fresh && <span className="new-badge">НОВЕ</span>}
      <div className="item-top">
        <span className="item-emblem">
          <Glyph name={item.icon} size={compact ? 22 : 34} />
        </span>
        <span className="rarity">{RARITIES[item.rarity]}</span>
      </div>
      <h3>{item.name}</h3>
      <span className="family-label">{FAMILY[item.family].name}</span>
      <p>{item.desc}</p>
      {!compact && item.weapon && <EvolutionHint weapon={item.weapon} />}
      {footer && <div className="item-footer">{footer}</div>}
    </>
  );
  return onClick ? (
    <button
      className={className}
      style={{ '--item-color': FAMILY[item.family].color } as CSSProperties}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  ) : (
    <article
      className={className}
      style={{ '--item-color': FAMILY[item.family].color } as CSSProperties}
    >
      {content}
    </article>
  );
}
// Reveal cue for a set of reward cards: the best card's sound lands with its
// flip (cards flip 140 ms apart; see rewards.css).
function revealCue(cards: { rarity: number; fresh: boolean }[]) {
  const legendary = cards.findIndex((c) => c.rarity >= 4);
  if (legendary >= 0)
    return { kind: 'legendary' as const, at: legendary * 140 + 110 };
  const rare = cards.findIndex((c) => c.rarity === 3 || c.fresh);
  return rare >= 0 ? { kind: 'rare' as const, at: rare * 140 + 240 } : null;
}
function Combat({
  run,
  meta,
  audio,
  hold,
  onDone,
  onExit,
  onPauseChange,
  onSettings,
}: {
  run: Run;
  meta: Meta;
  audio: AudioEngine;
  // Settings are open on top: the arena freezes without the pause menu.
  hold: boolean;
  onDone: (r: BattleResult) => void;
  onExit: (r: Run) => void;
  onPauseChange: (paused: boolean) => void;
  onSettings: () => void;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onPauseRef = useRef(onPauseChange),
    holdRef = useRef(hold);
  useEffect(() => {
    onPauseRef.current = onPauseChange;
    holdRef.current = hold;
  });
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
    [stick, setStick] = useState({ x: 0, y: 0 }),
    [draft, setDraft] = useState<{ offers: PerkId[]; level: number } | null>(
      null,
    ),
    [bark, setBark] = useState<{
      who: SpeakerId;
      text: string;
      key: number;
    } | null>(null);
  useEffect(() => {
    // Radio barks: few, short, never during the perk draft.
    let lastBark = -1e9,
      barks = 0,
      hideTimer = 0,
      startTimer = 0;
    const aboard = (run.residents ?? []).map((r) => r.id);
    const say = (kind: string, urgent = false) => {
      const now = performance.now();
      if (barks >= 5 || now - lastBark < (urgent ? 4000 : 11000)) return;
      const line = combatBark(
        kind,
        aboard,
        run.seed + run.step * 7 + barks * 13,
      );
      if (!line) return;
      lastBark = now;
      barks++;
      setBark({ ...line, key: barks });
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setBark(null), 4600);
    };
    if (run.kind === 'boss' || run.kind === 'miniboss')
      startTimer = window.setTimeout(() => say('start'), 2600);
    const b = new Battle(
      canvas.current,
      run,
      meta,
      audio,
      setHud,
      (r) => onDoneRef.current(r),
      {
        settings: meta.settings,
        introQuote:
          run.kind === 'boss' || run.kind === 'miniboss'
            ? bossQuote(run, meta)
            : undefined,
        onBeat: (beat) => {
          if (beat.kind === 'wave')
            say(
              beat.wave === 1
                ? 'start'
                : beat.wave === beat.waves
                  ? 'final'
                  : 'wave',
            );
          else if (
            beat.kind === 'chief' ||
            beat.kind === 'broken' ||
            beat.kind === 'event'
          )
            say(beat.kind);
          else if (beat.kind === 'phase' || beat.kind === 'stagger')
            say(beat.kind, true);
        },
        onPerkDraft: (offers, level) => {
          audio.play('rare');
          setDraft({ offers, level });
        },
        onPause: () => {
          // Settings hold the arena: Start must not flip the pause under them.
          if (!settle() && !holdRef.current) setPaused((p) => !p);
        },
      },
    );
    const settle = () => settleBattle(b);
    engine.current = b;
    b.start();
    const keys = (e: KeyboardEvent) => {
      // Sliders and switches in the settings dialog need the arrow keys.
      if (holdRef.current) return;
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
      if ((e.code === 'Escape' || e.code === 'KeyP') && !settle())
        setPaused((p) => !p);
    };
    // Android back and gamepad B: pause, or leave the pause menu again. With
    // Settings on top, Game's own handler closes them; the arena stays paused.
    const back = (e: Event) => {
      e.preventDefault();
      if (!settle()) setPaused((p) => holdRef.current || !p);
    };
    document.addEventListener('osbb-back', back);
    const up = (e: KeyboardEvent) => b.keys.delete(e.code);
    const blur = () => {
      b.keys.clear();
      b.stick = { x: 0, y: 0 };
      // A backgrounded app may be killed: a decided battle is saved now.
      if (!settle()) setPaused(true);
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', keys);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(startTimer);
      b.stop();
      window.removeEventListener('keydown', keys);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('osbb-back', back);
    };
  }, []);
  useEffect(() => {
    onPauseRef.current(paused);
    if (engine.current) {
      engine.current.paused = paused || hold;
      if (paused || hold) {
        engine.current.keys.clear();
        engine.current.stick = { x: 0, y: 0 };
        setStick({ x: 0, y: 0 });
        pointer.current = null;
      }
    }
  }, [paused, hold]);
  useEffect(() => () => onPauseRef.current(false), []);
  useEffect(() => {
    engine.current?.setSettings(meta.settings);
  }, [meta.settings]);
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
      {draft && !paused && !hold && (
        <PerkDraft
          run={engine.current?.run ?? run}
          offers={draft.offers}
          level={draft.level}
          onPick={(id) => {
            audio.play('ui');
            setDraft(null);
            engine.current?.choosePerk(id);
          }}
        />
      )}
      <canvas
        ref={canvas}
        className="battle-canvas"
        aria-label="Бойова арена. Рух WASD або стрілками, пробіл — ривок, E — ударна хвиля."
      />
      {bark && !draft && (
        <RadioStrip
          key={bark.key}
          who={bark.who}
          text={bark.text}
          captain={run.character}
        />
      )}
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
                : (hud.squad ?? NODE_INFO[run.kind].name)}
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
            onClick={() => {
              if (!settleBattle(engine.current)) setPaused(true);
            }}
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
                : 'Розбий загін: три хвилі й ватажок. Рухайся — стрільці цілять на випередження.'}
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
      <Dialog open={paused && !hold} onOpenChange={setPaused}>
        <DialogContent className="game-modal">
          <DialogTitle>Будинок перепочиває</DialogTitle>
          <DialogDescription>
            Забіг поставлено на паузу. Повернення до меню збереже стан перед цим
            боєм.
          </DialogDescription>
          <button className="primary" onClick={() => setPaused(false)}>
            <Play size={18} /> Продовжити
          </button>
          <button className="secondary" onClick={onSettings}>
            <SettingsIcon size={18} /> Налаштування
          </button>
          <button
            className="secondary"
            onClick={() => {
              // A battle decided under the menu keeps its result.
              if (!settleBattle(engine.current))
                onExit({ ...run, page: 'map' });
            }}
          >
            <Home size={18} /> Зберегти й до меню
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
// Hub protocols differ every run, so they are not listed as seen.
const PROTOCOL_SCENE = /^hub-(protocol|victory)-\d+$/;
export default function Game() {
  const [meta, setMeta] = useState<Meta>(initialMeta),
    [run, setRun] = useState<Run | null>(null),
    [ready, setReady] = useState(false),
    [screen, setScreen] = useState<
      | 'hub'
      | 'play'
      | 'workshop'
      | 'codex'
      | 'lore'
      | 'stats'
      | 'achievements'
      | 'case'
    >('hub');
  const [character, setCharacter] = useState('mechanic'),
    [chapter, setChapter] = useState(0),
    [help, setHelp] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [combatPaused, setCombatPaused] = useState(false),
    [heat, setHeat] = useState(0),
    [queued, setQueued] = useState<Launch | null>(null),
    [toasts, setToasts] = useState<Toast[]>([]),
    [updateHidden, setUpdateHidden] = useState(false),
    [profileAction, setProfileAction] = useState<'reset' | 'restore' | null>(
      null,
    ),
    [hasProfileBackup, setHasProfileBackup] = useState(false),
    [housingOpen, setHousingOpen] = useState(false),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState<{
      id: string;
      source: 'shop' | 'reward' | 'draft';
      index: number;
    } | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [abandon, setAbandon] = useState(false),
    [native, setNative] = useState(false),
    [sceneQueue, setSceneQueue] = useState<string[]>([]);
  const audio = useRef<AudioEngine | null>(null);
  if (!audio.current) audio.current = new AudioEngine();
  // The result modal opens at its title: the tall summary would otherwise
  // scroll down to its first button and hide how the run went.
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const isNative =
    typeof navigator !== 'undefined' &&
    navigator.userAgent.includes('OSBBAndroid');
  const install = useInstallPrompt(!isNative);
  const sw = useServiceWorker(!isNative && import.meta.env.PROD);
  const inCombat = screen === 'play' && run?.page === 'combat';
  const cutscene = ready && meta.tutorialDone && !!meta.sceneProgress;
  // Toasts wait for a free screen: in battle or under a dialog they would
  // expire unseen or cover the dialog's own buttons. Each one's timer starts
  // only once it is actually shown.
  const toastsWait =
    inCombat ||
    cutscene ||
    (ready && !meta.tutorialDone) ||
    settingsOpen ||
    help ||
    abandon ||
    (housingOpen && !!run) ||
    !!pending ||
    !!result ||
    profileAction !== null;
  useGamepadMenu(!inCombat || combatPaused || settingsOpen);
  // Records newly earned achievements and shows them as toasts.
  function grant(ids: string[]) {
    if (!ids.length) return;
    setMeta((m) => ({
      ...m,
      achievements: [...new Set([...(m.achievements ?? []), ...ids])],
    }));
    const fresh = achievementToasts(ids);
    setToasts((list) => [
      ...list.filter((t) => !fresh.some((f) => f.id === t.id)),
      ...fresh,
    ]);
    audio.current!.play('achievement');
  }
  const dismissToast = useCallback((id: string) => {
    if (id === 'update') setUpdateHidden(true);
    else setToasts((list) => list.filter((t) => t.id !== id));
  }, []);
  useEffect(() => {
    setNative(navigator.userAgent.includes('OSBBAndroid'));
    preloadEnemyArt();
    if (import.meta.env.DEV)
      Object.assign(window, { __osbbAudioPreview: renderThemePreview });
    const shortcut = SHORTCUT;
    if (shortcut)
      window.history.replaceState(null, '', window.location.pathname);
    try {
      setHasProfileBackup(!!localStorage.getItem(PROFILE_BACKUP_KEY));
      const s = readSave(localStorage.getItem(SAVE_KEY));
      let loaded: Meta = {
        ...s.meta,
        sceneProgress:
          s.meta.sceneProgress ??
          (!s.meta.scenesSeen.includes('prologue')
            ? { id: 'prologue', index: 0 }
            : null),
      };
      let loadedRun = s.run;
      // Home-screen shortcuts from the web app manifest.
      if (shortcut === 'continue' && loadedRun) {
        loaded = {
          ...loaded,
          sceneProgress:
            loaded.sceneProgress ??
            firstScene(loaded, `arrival-${loadedRun.chapter}`),
        };
        setScreen('play');
      } else if (shortcut === 'daily' && loaded.tutorialDone) {
        if (loadedRun)
          setNotice(
            'Спершу заверши поточний рейд — тоді зможеш почати денний забіг.',
          );
        else {
          const d = dailyLaunch(loaded, dateKey(new Date()));
          loadedRun = makeRun(loaded, d.character, 0, d.seed, d);
          loaded = {
            ...loaded,
            fresh: [],
            lore: loreForProgress(loaded.lore, loaded.wins, 0),
            sceneProgress:
              loaded.sceneProgress ?? firstScene(loaded, 'arrival-0'),
          };
          setScreen('play');
        }
      }
      setMeta(loaded);
      setRun(loadedRun);
      setCharacter(s.run?.character ?? 'mechanic');
      setChapter(0);
      const stored = Number(localStorage.getItem('osbb.heat'));
      if (Number.isFinite(stored)) setHeat(Math.max(0, Math.floor(stored)));
      if (s.error) setNotice('Збереження пошкоджено. Створено новий профіль.');
      else if (s.refund)
        setNotice(
          `Дослідження тепер — модифікатори рейду в майстерні. Витрачені ядра повернуто: +${s.refund}.`,
        );
    } catch {
      setNotice(
        'Сховище браузера недоступне. Прогрес зберігатиметься лише в цій сесії.',
      );
    }
    setReady(true);
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
    audio.current!.setVolumes(meta.settings);
    const root = document.documentElement;
    root.style.setProperty('--text-scale', String(meta.settings.textScale));
    root.toggleAttribute('data-colorblind', meta.settings.colorblind);
    root.toggleAttribute('data-reduced-flashes', meta.settings.reducedFlashes);
  }, [meta.settings]);
  // Menus share the hub theme; each location has its own. The engine lifts
  // the battle layer to 'boss' by itself in the second phase.
  const theme: MusicTheme =
    screen === 'play' && run ? (THEMES[run.chapter] ?? 'hub') : 'hub';
  useEffect(() => {
    if (!ready) return;
    audio.current!.setMusic(
      cutscene ? 'hub' : theme,
      !cutscene && inCombat ? 'battle' : 'calm',
    );
  }, [ready, theme, inCombat, cutscene]);
  // Settings over the pause menu lift the duck: the music slider is judged
  // against the real mix, not the muffled pause one.
  useEffect(() => {
    audio.current!.setPaused(
      cutscene || (inCombat && combatPaused && !settingsOpen),
    );
  }, [cutscene, inCombat, combatPaused, settingsOpen]);
  useEffect(() => {
    // Browsers keep audio locked until the first gesture.
    const unlock = () => audio.current!.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, []);
  // Catch-all for goals reached outside battle (events, workshop, loading an
  // older profile); battle and raid ends announce their own.
  useEffect(() => {
    if (!ready || inCombat) return;
    const ids = newAchievements(meta, run);
    if (ids.length) grant(ids);
  }, [ready, inCombat, meta, run]);
  useEffect(() => {
    const back = (e: Event) => {
      if (profileAction) {
        e.preventDefault();
        setProfileAction(null);
        return;
      }
      if (settingsOpen) {
        e.preventDefault();
        setSettingsOpen(false);
        return;
      }
      if (!meta.tutorialDone) {
        e.preventDefault();
        setMeta((m) => ({ ...m, tutorialDone: true }));
        return;
      }
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
    settingsOpen,
    housingOpen,
    meta.sceneProgress,
    sceneQueue,
    meta.tutorialDone,
    profileAction,
    result,
    pending,
    abandon,
  ]);
  // Rarity sounds land with the card flips of a reward or the start draft.
  const revealCards =
    screen === 'play' && run
      ? run.page === 'reward'
        ? run.loot.map((l) => ({
            rarity: l.kind === 'module' ? (ITEM_BY_ID[l.id]?.rarity ?? 1) : 1,
            fresh: !!l.fresh,
          }))
        : run.page === 'map' && run.draft?.length
          ? run.draft.map((id) => ({
              rarity: ITEM_BY_ID[id]?.rarity ?? 1,
              fresh: false,
            }))
          : []
      : [];
  const revealKey =
    run && revealCards.length
      ? `${run.seed}:${run.chapter}:${run.step}:${run.page}:${revealCards
          .map((c) => c.rarity + (c.fresh ? '*' : ''))
          .join()}`
      : '';
  useEffect(() => {
    const cue = revealKey ? revealCue(revealCards) : null;
    if (!cue) return;
    const still =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = setTimeout(
      () => audio.current!.play(cue.kind),
      still ? 0 : cue.at,
    );
    return () => clearTimeout(id);
  }, [revealKey]);
  function ping(message: string) {
    setNotice(message);
    audio.current!.play('coin');
  }
  // The story picks its rescue line from the profile at the moment of the card.
  const storyMeta = useRef(meta);
  storyMeta.current = meta;
  useEffect(() => {
    setRescueQuoteSource((id) => storyRescueQuote(id, storyMeta.current));
    return () => setRescueQuoteSource(null);
  }, []);
  // Leaves the current scene. Its clues are kept (skipping included), hub
  // protocols stay unlisted, a chain moves on to its next scene, and a skipped
  // finale falls back to the first ending.
  function closeScene(choice?: Choice) {
    const progress = meta.sceneProgress;
    if (!progress) return;
    const scene = storyScene(progress.id, meta);
    let ending = choice?.ending;
    if (!ending && scene?.choices?.some((c) => c.ending)) ending = 'a';
    const nextId = ending ? `ending-${ending}` : sceneQueue[0];
    setSceneQueue(ending ? [] : sceneQueue.slice(1));
    setMeta((m) => {
      let n: Meta = {
        ...m,
        scenesSeen: PROTOCOL_SCENE.test(progress.id)
          ? m.scenesSeen
          : [...new Set([...m.scenesSeen, progress.id])],
        sceneProgress: nextId ? { id: nextId, index: 0 } : null,
      };
      if (scene?.clues) n = addClues(n, scene.clues);
      if (ending) n = addEnding(n, ending);
      return n;
    });
  }
  function playScene(id: string) {
    if (SCENE_BY_ID[id] || isStoryId(id)) {
      setSceneQueue([]);
      setMeta((m) => ({ ...m, sceneProgress: { id, index: 0 } }));
    }
  }
  const heatChoice = Math.min(heat, meta.heatUnlocked ?? 0);
  function pickHeat(value: number) {
    setHeat(value);
    try {
      localStorage.setItem('osbb.heat', String(value));
    } catch {
      // Only a convenience: the choice resets to 0 next time.
    }
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
    launch({ mode: 'campaign', character, heat: heatChoice });
  }
  function launch(spec: Launch, base: Meta = meta) {
    audio.current!.unlock();
    setRun(
      makeRun(base, spec.character || character, 0, spec.seed ?? Date.now(), {
        mode: spec.mode,
        heat: spec.heat,
        daily: spec.daily,
      }),
    );
    setMeta({
      ...base,
      // The new run carries the 'НОВЕ' items into its first reward.
      fresh: [],
      lore: loreForProgress(base.lore, base.wins, chapter),
      sceneProgress: firstScene(base, `arrival-${chapter}`),
    });
    setScreen('play');
    setResult(null);
    setNotice('');
  }
  // A new mode while a raid is active goes through the abandon dialog.
  function requestLaunch(spec: Launch) {
    if (!ready) return;
    if (!run) return launch(spec);
    setQueued(spec);
    setAbandon(true);
  }
  function back() {
    setHousingOpen(false);
    setScreen('hub');
    setNotice('');
  }
  function ended(b: BattleResult) {
    const gate = b.boss && b.run.step === b.run.nodes.length - 1;
    if (b.won && gate && !isFinalVictory(b.run)) {
      const next = advanceLocation(b.run, meta),
        looped = next.loop > b.run.loop;
      // The boss's last word, then the new location; each only the first time.
      const chain = looped
        ? []
        : ['victory-' + b.run.chapter, `arrival-${b.run.chapter + 1}`].filter(
            (id) => !meta.scenesSeen.includes(id),
          );
      setRun(next);
      setSceneQueue(chain.slice(1));
      setMeta((m) => ({
        ...m,
        sceneProgress: chain[0] ? { id: chain[0], index: 0 } : null,
      }));
      grant(applyAchievements(meta, b.run).unlocked);
      ping(
        looped
          ? `Коло ${next.loop + 1}. Загроза ${next.heat}: будинок, мешканці й здобич ідуть далі.`
          : 'Локацію пройдено. Будинок і здобич переходять далі.',
      );
      return;
    }
    if (!b.won || gate) {
      const final = b.won && isFinalVictory(b.run),
        daily = b.run.mode === 'daily',
        dayBest = daily ? (meta.dailyBest?.[b.run.daily] ?? 0) : 0,
        score = runScore(b.run, final);
      const f = finishRun(meta, b.run, b.won);
      // After a raid: the next story beat as a scene, else a short protocol.
      const beat = final ? null : hubScene(f.meta, b.won),
        storyBeat = beat && !PROTOCOL_SCENE.test(beat.id) ? beat : null;
      setSceneQueue([]);
      setMeta({
        ...f.meta,
        sceneProgress: final
          ? { id: 'finale', index: 0 }
          : storyBeat
            ? { id: storyBeat.id, index: 0 }
            : null,
      });
      setRun(null);
      setResult({
        won: b.won,
        run: b.run,
        cores: f.cores,
        projects: f.projects,
        coreBreakdown: f.coreBreakdown,
        progress: f.progress,
        unlocks: f.unlocks,
        final,
        score,
        record: daily && score > dayBest,
        dayBest: Math.max(dayBest, score),
        protocol: beat && !storyBeat ? beat.lines : undefined,
      });
      if (f.achievements.length) {
        setToasts((list) => [...list, ...achievementToasts(f.achievements)]);
        audio.current!.play('achievement');
      }
      setChapter(0);
      setScreen('hub');
    } else {
      const next = battleRewards(b.run, meta);
      setRun(next);
      grant(applyAchievements(meta, next).unlocked);
    }
  }
  // Swaps the whole profile for an exported code, backing up the current one.
  function importCode(code: string): string | null {
    let imported: ReturnType<typeof importProfile>;
    try {
      imported = importProfile(localStorage, saveData(meta, run), code);
    } catch (e) {
      return e instanceof Error && e.message === 'Invalid profile code'
        ? 'Код не розпізнано. Перевір, що скопійовано його повністю.'
        : 'Не вдалося записати збереження. Перевір доступ до сховища браузера.';
    }
    setMeta({
      ...imported.meta,
      sceneProgress:
        imported.meta.sceneProgress ?? firstScene(imported.meta, 'prologue'),
    });
    setRun(imported.run);
    setCharacter(imported.run?.character ?? 'mechanic');
    setHasProfileBackup(true);
    setResult(null);
    setPending(null);
    setScreen('hub');
    setToasts([]);
    ping(
      'Профіль завантажено. Попередній збережено: його можна повернути в налаштуваннях.',
    );
    return null;
  }
  function pick(
    id: string,
    source: 'shop' | 'reward' | 'draft',
    index: number,
  ) {
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
    if (source === 'draft') next = skipDraft(next);
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
    source: 'shop' | 'reward' | 'draft',
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
    if (source === 'draft') next = skipDraft(next);
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
                  : screen === 'case'
                    ? 'СПРАВА 04:17'
                    : screen === 'stats'
                      ? 'СТАТИСТИКА'
                      : screen === 'achievements'
                        ? 'ДОСЯГНЕННЯ'
                        : LOCATIONS[run?.chapter ?? 0].name +
                          (run?.mode === 'endless'
                            ? ` · КОЛО ${run.loop + 1}`
                            : run?.mode === 'daily'
                              ? ' · ДЕННИЙ'
                              : '')}
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
          <button
            className="icon-button"
            aria-label="Налаштування"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon size={18} />
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
            {run ? (
              <RunBadge run={run} />
            ) : (
              (meta.heatUnlocked ?? 0) > 0 && (
                <HeatSelect
                  max={meta.heatUnlocked}
                  value={heatChoice}
                  onChange={pickHeat}
                />
              )
            )}
            <button
              className="primary start-button"
              onClick={start}
              disabled={!ready}
            >
              {run ? 'ПРОДОВЖИТИ РЕЙД' : 'ВИРУШИТИ В РЕЙД'}{' '}
              <ArrowUpRight size={22} />
            </button>
            {ready && meta.tutorialDone && (
              <div className="hub-goal">
                {(run || meta.bestDepth > 0) && (
                  <RunProgress
                    depth={run ? runDepth(run) : meta.bestDepth}
                    best={meta.bestDepth}
                    previous={meta.bestDepth}
                    caption={
                      run ? 'Поточний рейд' : 'Найдалі, куди доходив будинок'
                    }
                  />
                )}
                <NextGoal meta={meta} />
              </div>
            )}
            <HubModes
              meta={meta}
              run={run}
              heat={heatChoice}
              onLaunch={requestLaunch}
              onContinue={start}
            />
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
                  {
                    LIBRARY_IDS.filter((id) => meta.scenesSeen.includes(id))
                      .length
                  }
                  /{LIBRARY_IDS.length}
                </span>
              </button>
              <button className="text-button" onClick={() => setScreen('case')}>
                <Search size={18} /> Справа 04:17{' '}
                <span className="tiny-count">
                  {meta.clues?.length ?? 0}/{CLUES.length}
                </span>
              </button>
              <button
                className="text-button"
                onClick={() => setScreen('achievements')}
              >
                <Award size={18} /> Досягнення{' '}
                <span className="tiny-count">
                  {ownedAchievements(meta)}/{ACHIEVEMENTS.length}
                </span>
              </button>
              <button
                className="text-button"
                onClick={() => setScreen('stats')}
              >
                <ChartColumn size={18} /> Статистика
              </button>
            </div>
            {(run || install.canInstall) && (
              <div className="hub-secondary">
                {run && (
                  <button
                    className="text-button muted small"
                    onClick={() => {
                      setQueued(null);
                      setAbandon(true);
                    }}
                  >
                    Завершити поточний рейд
                  </button>
                )}
                {install.canInstall && (
                  <button
                    className="text-button small"
                    onClick={install.install}
                  >
                    <MonitorDown size={16} /> Встановити гру
                  </button>
                )}
              </div>
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
              {APP_VERSION && `v${APP_VERSION} · `}Прогрес зберігається на цьому
              пристрої.
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
              hold={settingsOpen}
              onDone={ended}
              onExit={(r) => {
                setRun(r);
                back();
              }}
              onPauseChange={setCombatPaused}
              onSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <div className="play-layout">
              <section className="play-main">
                <div className="page-heading">
                  <button className="text-button" onClick={back}>
                    <ArrowLeft size={16} /> Меню
                  </button>
                  <RunBadge run={run} />
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
                    {run.draft.length > 0 && (
                      <section
                        className="draft-panel"
                        aria-label="Стартовий вибір"
                      >
                        <header>
                          <div>
                            <h3>Стартовий вибір</h3>
                            <p>
                              Модифікатор рейду: забери один модуль із собою.
                              Решта залишиться в притулку.
                            </p>
                          </div>
                          <button
                            className="text-button small"
                            onClick={() => setRun(skipDraft(run))}
                          >
                            Пропустити
                          </button>
                        </header>
                        <div className="reward-cards">
                          {run.draft.map((id, i) => (
                            <ItemCard
                              key={id}
                              item={ITEM_BY_ID[id]}
                              onClick={() => pick(id, 'draft', i)}
                              footer={
                                <>
                                  <span>Взяти на старт</span>
                                  <Plus size={18} />
                                </>
                              }
                            />
                          ))}
                        </div>
                      </section>
                    )}
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
                    <h2>
                      {run.loot.some(
                        (l) =>
                          l.kind === 'module' && ITEM_BY_ID[l.id]?.rarity >= 4,
                      )
                        ? 'Легендарна знахідка!'
                        : run.loot.some((l) => l.fresh)
                          ? 'Щось нове на полицях.'
                          : 'Знайшли дещо корисне.'}
                    </h2>
                    <p className="lead">
                      {run.kind === 'chest'
                        ? run.loot.length > 1
                          ? 'Подвійне дно: у скрині дві знахідки, забери одну.'
                          : 'У скрині один випадковий предмет.'
                        : 'Вибери один предмет.'}{' '}
                      Обладнання й меблі встановлюються всередині квартир.
                    </p>
                    {run.rescue && RESIDENT_BY_ID[run.rescue] && (
                      <RescueCard
                        run={run}
                        residentId={run.rescue}
                        onHousing={() => setHousingOpen(true)}
                      />
                    )}
                    {run.eventResult &&
                      // A battle rescue's log line is replaced by the card;
                      // an event keeps its own outcome text.
                      !(
                        run.rescue && run.eventResult.startsWith('Урятовано:')
                      ) && (
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
                            fresh={!!loot.fresh}
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
                        disabled={run.coins < rerollCost(run)}
                        onClick={() => setRun(rerollShop(run, meta))}
                      >
                        <RefreshCw size={16} /> Оновити непроданий товар{' '}
                        {rerollCost(run) === 0 ? (
                          <span className="free-reroll">безкоштовно</span>
                        ) : (
                          <Currency amount={rerollCost(run)} />
                        )}
                      </button>
                      <button
                        className="secondary"
                        disabled={
                          run.repairUsed ||
                          run.coins < repairCost(run) ||
                          run.hp >= stats!.health
                        }
                        onClick={() => setRun(repairShop(run, meta))}
                      >
                        <Heart size={16} />{' '}
                        {run.repairUsed ? 'Ремонт використано' : 'Ремонт +30%'}{' '}
                        <Currency amount={repairCost(run)} />
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
                {run.page === 'event' &&
                  run.rescue &&
                  RESIDENT_BY_ID[run.rescue] && (
                    <RescueCard
                      run={run}
                      residentId={run.rescue}
                      onHousing={() => setHousingOpen(true)}
                    />
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
                  fresh={meta.fresh?.includes(i.id)}
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
      {screen === 'stats' && <StatsPage meta={meta} onBack={back} />}
      {screen === 'case' && <CasePage meta={meta} onBack={back} />}
      {screen === 'achievements' && (
        <AchievementsPage meta={meta} onBack={back} />
      )}
      <Toasts
        items={
          toastsWait
            ? []
            : sw.updateReady && !updateHidden
              ? [{ id: 'update', kind: 'update' }, ...toasts]
              : toasts
        }
        onDismiss={dismissToast}
        onUpdate={sw.update}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        meta={meta}
        run={run}
        native={native}
        locked={inCombat}
        hasProfileBackup={hasProfileBackup}
        onChange={(settings: Settings) => setMeta((m) => ({ ...m, settings }))}
        onImport={importCode}
        onProfileAction={(action) => {
          setSettingsOpen(false);
          setProfileAction(action);
        }}
      />
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
        <DialogContent
          className="game-modal result-modal"
          initialFocus={resultTitle}
        >
          <div className={`result-symbol ${result?.won ? 'won' : ''}`}>
            {result?.final ? (
              <Crown size={40} />
            ) : result?.won ? (
              <Trophy size={40} />
            ) : (
              <Home size={40} />
            )}
          </div>
          <DialogTitle ref={resultTitle} tabIndex={-1}>
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
          {result?.protocol && (
            <ProtocolCard
              lines={result.protocol}
              meta={meta}
              captain={result.run.character}
            />
          )}
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
              {result.run.mode !== 'campaign' || result.run.heat > 0 ? (
                <div className="result-mode">
                  {result.run.mode === 'daily' && (
                    <>
                      <span>
                        <CalendarDays size={16} /> Денний забіг ·{' '}
                        {shortDate(result.run.daily)}
                      </span>
                      <b>Рахунок: {result.score}</b>
                      <small className={result.record ? 'record' : ''}>
                        {result.record
                          ? 'Новий рекорд дня!'
                          : `Рекорд дня: ${result.dayBest}`}
                      </small>
                    </>
                  )}
                  {result.run.mode === 'endless' && (
                    <>
                      <span>
                        <InfinityIcon size={16} /> Нескінченна експедиція
                      </span>
                      <b>Пройдено кіл: {result.run.loop}</b>
                      <small>Рекорд: {meta.endlessBest ?? 0}</small>
                    </>
                  )}
                  {result.run.heat > 0 && (
                    <small>
                      <Flame size={14} /> Загроза {result.run.heat}
                    </small>
                  )}
                </div>
              ) : null}
              {result.progress && (
                <RunProgress
                  depth={result.progress.depth}
                  best={result.progress.best}
                  previous={result.progress.previous}
                />
              )}
              <UnlockList ids={result.unlocks} meta={meta} />
              <CoreBreakdown rows={result.coreBreakdown} total={result.cores} />
              <NextGoal meta={meta} count={2} />
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
                  onClick={() =>
                    playScene(`ending-${meta.endings?.at(-1) ?? 'a'}`)
                  }
                >
                  <Play size={17} /> Переглянути кінцівку
                </button>
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
            ОСББ кінця світу{APP_VERSION && ` · v${APP_VERSION}`} · 3 локації, 9
            мешканців, 9 варіантів босів, 9 мінібосів, 18 видів ворогів і
            сюжетні катсцени.
          </DialogDescription>
          <button
            className="primary"
            onClick={() => {
              setHelp(false);
              setMeta((m) => ({ ...m, tutorialDone: false, tutorialStep: 0 }));
            }}
          >
            Пройти навчання <ArrowRight size={18} />
          </button>
          <button
            className="secondary"
            onClick={() => {
              setHelp(false);
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon size={17} /> Налаштування
          </button>
          <p className="help-settings-note">
            Гучність, розмір тексту, збереження на інший пристрій і скидання
            прогресу — у налаштуваннях.
          </p>
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
              <b>06 / Заверши історію.</b> Переможи босів трьох локацій за один
              рейд, щоб завершити евакуацію. Нові спроби відкривають інші
              предмети й комбінації.
            </p>
            <p>
              <b>Режими.</b> Денний забіг щодня однаковий для всіх: той самий
              маршрут і особливе правило. Після першої перемоги відкриваються
              рівні загрози — кожен додає правило й +10% ядер — і нескінченна
              експедиція, де після третього боса починається нове, гарячіше
              коло.
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
      <Dialog
        open={profileAction !== null}
        onOpenChange={(open) => {
          if (!open) setProfileAction(null);
        }}
      >
        <DialogContent className="game-modal">
          <DialogTitle>
            {profileAction === 'restore'
              ? 'Відновити попередній профіль?'
              : 'Почати з нуля?'}
          </DialogTitle>
          <DialogDescription>
            {profileAction === 'restore'
              ? 'Поточну спробу буде замінено збереженням перед останнім скиданням.'
              : 'Рейд, ядра, покупки, відкриття та історія почнуться заново. Навчання відкриється з першого кроку. Збережемо копію: її можна повернути через «Налаштування» → «Відновити прогрес до скидання».'}
          </DialogDescription>
          <button
            className="primary"
            onClick={() => {
              try {
                if (profileAction === 'restore') restoreProfile(localStorage);
                else resetProfile(localStorage, saveData(meta, run));
                window.location.reload();
              } catch {
                setNotice(
                  'Не вдалося записати збереження. Профіль не скинуто. Перевір доступ до сховища браузера.',
                );
                setProfileAction(null);
              }
            }}
          >
            {profileAction === 'restore'
              ? 'Відновити збереження'
              : 'Скинути й почати заново'}
          </button>
          <button className="secondary" onClick={() => setProfileAction(null)}>
            Скасувати
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={abandon} onOpenChange={setAbandon}>
        <DialogContent className="game-modal">
          <DialogTitle>Завершити цей рейд?</DialogTitle>
          <DialogDescription>
            {queued &&
              `Щоб почати ${MODE_NAMES[queued.mode]}, спершу треба завершити поточний рейд. `}
            Поточний будинок і монети зникнуть. Зароблені ядра та умови
            відкриття предметів буде враховано.
          </DialogDescription>
          <button
            className="primary"
            onClick={() => {
              // The closing dialog stays clickable while it fades out; a
              // second tap must not abandon the raid that was just launched.
              if (!abandon) return;
              if (run && queued) {
                // Close the old raid quietly and go straight to the new one.
                const f = finishRun(meta, run, false);
                launch(queued, f.meta);
                if (f.achievements.length) {
                  setToasts((list) => [
                    ...list,
                    ...achievementToasts(f.achievements),
                  ]);
                  audio.current!.play('achievement');
                }
                ping(`Попередній рейд завершено: +${f.cores} ядер.`);
              } else if (run) ended({ run, won: false, boss: false });
              setAbandon(false);
            }}
          >
            {queued ? 'Завершити й почати' : 'Завершити й повернутися'}
          </button>
          <button className="secondary" onClick={() => setAbandon(false)}>
            Залишитися в рейді
          </button>
        </DialogContent>
      </Dialog>
      {ready && !meta.tutorialDone && (
        <Tutorial
          step={meta.tutorialStep}
          onStep={(tutorialStep) => setMeta((m) => ({ ...m, tutorialStep }))}
          onFinish={() => setMeta((m) => ({ ...m, tutorialDone: true }))}
        />
      )}
      {ready &&
        meta.tutorialDone &&
        meta.sceneProgress &&
        (() => {
          const story = storyScene(meta.sceneProgress.id, meta);
          const advance = (index: number) =>
            setMeta((m) => ({
              ...m,
              sceneProgress: m.sceneProgress
                ? { ...m.sceneProgress, index }
                : null,
            }));
          return story ? (
            <DialoguePlayer
              key={story.id}
              scene={story}
              index={meta.sceneProgress.index}
              meta={meta}
              captain={run?.character ?? character}
              onAdvance={advance}
              onChoose={(c) => closeScene(c)}
              onClose={() => closeScene()}
            />
          ) : (
            <CutscenePlayer
              progress={meta.sceneProgress}
              onAdvance={advance}
              onClose={() => closeScene()}
            />
          );
        })()}
    </main>
  );
}
