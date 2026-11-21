'use client';
import { asset } from '@/lib/game/assets';
import { heroAbility } from '@/lib/game/heroes';
import {
  PROFILE_BACKUP_KEY,
  importProfile,
  resetProfile,
  restoreProfile,
} from '@/lib/game/profile';
import { blueprintInfo, runDepth } from '@/lib/game/progression';
import { LOCATIONS, campaignBoss } from '@/lib/game/encounters';
import { FurnitureCard, CampaignEventPanel } from './campaign-panels';
import { matesOf } from './vote';
import { COUNCIL_COLUMNS, CouncilPage } from './council';
import {
  loadGuestRoom,
  loadHostRoom,
  saveGuestRoom,
  saveHostRoom,
  type GuestRoom as SavedGuestRoom,
  type HostRoom as SavedHostRoom,
} from './rooms';
import {
  FURNITURE,
  FURNITURE_BY_ID,
  canFurnish,
  furnitureEffect,
} from '@/lib/game/furniture';
import { withMet } from '@/lib/game/gallery';
import { Gallery } from './gallery';
import {
  battleRewards,
  advanceLocation,
  claimFurniture,
  buyFurniture,
  installFurniture,
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
  Fragment,
  Suspense,
  lazy,
  useState,
  useEffect,
  useRef,
  useCallback,
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
  Home,
  Coins,
  Heart,
  Wrench,
  Crosshair,
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
  LogOut,
  MonitorDown,
  Route,
  Users,
  Coffee,
  ShoppingBag,
  Settings as SettingsIcon,
} from 'lucide-react';
import {
  ACHIEVEMENTS,
  applyAchievements,
  newAchievements,
} from '@/lib/game/achievements';
import { dateKey, heatChoices, pactOf, runScore } from '@/lib/game/modes';
import { resultQuip, tabTitle } from '@/lib/game/notices';
import { discover, isQuietHour, konamiStep, tapStep } from '@/lib/game/secrets';
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
import { NoticeBoard } from './notice-board';
import { CoopSelect } from './coop-select';
import { PlayModes, type PlayMode } from './play-modes';
import { GuestRoom, OnlinePanel, useNet } from './online';
import { HOST_IN_FIGHT, NetSession } from '@/lib/game/session';
import type { ShareMode } from '@/lib/game/net';
import {
  ballotResult,
  coopHero,
  coopPartners,
  guestFightCores,
  guestRunCores,
  VOTE,
} from '@/lib/game/coop';
import './features.css';
import './mobile.css';
import { HouseAside, PartnerHouse } from './house-aside';
import { ChatDock } from './chat-dock';
import { cleanNick } from '@/lib/game/chat';
import { CvdFilters } from './cvd-filters';
import { endVoice } from './voice-chat';
import { ItemCard, rewardNote, shopNote, takenText } from './item-card';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DemoOffer, DemoShop, type OfferId } from './demo-offers';
import { preloadEnemyArt } from '@/lib/game/enemy-art';
import { Glyph } from './glyph';
import { APARTMENT_SLOTS, equipmentTargets } from '@/lib/game/equipment';
import {
  Residents,
  EquipmentPlacement,
  FurniturePlacement,
} from './residents';
import { DialoguePlayer, ProtocolCard } from './dialogue';
import { onSpeaking, setVoice } from './voice';
import { CasePage } from './case-file';
import {
  CLUES,
  HUB_IDS,
  LIBRARY_IDS,
  addMark,
  isStoryId,
  leaveScene,
  raidBeat,
  raidBeatsAt,
  raidEnd,
  raidEndStory,
  victoryChain,
  rescueQuote as storyRescueQuote,
  storyScene,
  type Choice,
  type Line,
} from '@/lib/game/story';
import { RescueCard, setRescueQuoteSource } from './rescue-card';
import { SCENE_BY_ID, MISSIONS } from '@/lib/game/cutscenes';
import { RESIDENT_BY_ID } from '@/lib/game/residents';
import { loreForProgress } from '@/lib/game/lore';
import {
  ITEMS,
  ITEM_BY_ID,
  CHAPTERS,
  CHARACTERS,
} from '@/lib/game/data';
import {
  initialMeta,
  makeRun,
  startDaily,
  statsFor,
  priceFor,
  enterNode,
  availableColumns,
  eventColumns,
  eventFor,
  resolveEvent,
  nextNode,
  councilOffers,
  choosePact,
  openCouncil,
  equip,
  packItem,
  withCrew,
  mateHero,
  mateSeats,
  partySize,
  mateRun,
  withMateHouse,
  giveMate,
  giveMateFurniture,
  buyFurnitureMate,
  acceptMateHouse,
  settleReward,
  earned,
  finishRun,
  readSave,
  saveData,
  SAVE_KEY,
  type Meta,
  type Run,
  type Settings,
} from '@/lib/game/model';
import {
  AudioEngine,
  renderThemePreview,
  type MusicTheme,
} from '@/lib/game/audio';
import type { BattleResult } from '@/lib/game/engine';
import { Currency } from './hud-parts';

// The battle engine is the heaviest part of the game: load it with the first raid.
const Combat = lazy(() =>
  import('./combat').then((m) => ({ default: m.Combat })),
);
// Screens that are not needed at start load on first use.
const Tutorial = lazy(() =>
  import('./tutorial').then((m) => ({ default: m.Tutorial })),
);
const Workshop = lazy(() =>
  import('./workshop').then((m) => ({ default: m.Workshop })),
);
const StoryLibrary = lazy(() =>
  import('./cutscenes').then((m) => ({ default: m.StoryLibrary })),
);
const CutscenePlayer = lazy(() =>
  import('./cutscenes').then((m) => ({ default: m.CutscenePlayer })),
);
const RouteTree = lazy(() =>
  import('./route-tree').then((m) => ({ default: m.RouteTree })),
);
// Injected by vite.game.config.ts; other bundlers leave it undefined.
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
// A guest thrown out of its room knocks again this often, for this long (ms).
const REJOIN_EVERY = 3500;
const REJOIN_FOR = 180000;
const APK_URL = typeof __APK_URL__ === 'string' ? __APK_URL__ : '';
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
function revealCue(cards: { rarity: number; fresh: boolean }[]) {
  const legendary = cards.findIndex((c) => c.rarity >= 4);
  if (legendary >= 0)
    return { kind: 'legendary' as const, at: legendary * 140 + 110 };
  const rare = cards.findIndex((c) => c.rarity === 3 || c.fresh);
  return rare >= 0 ? { kind: 'rare' as const, at: rare * 140 + 240 } : null;
}
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
      | 'guest'
      | 'shop'
    >('hub');
  const [character, setCharacter] = useState('mechanic'),
    [chapter, setChapter] = useState(0),
    [help, setHelp] = useState(false),
    // The proposed purchases, shown where they would live (docs/finmodel.md):
    // demo windows, nothing is sold.
    [offer, setOffer] = useState<OfferId | null>(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [combatPaused, setCombatPaused] = useState(false),
    [heat, setHeat] = useState(0),
    // Hero of the second player; '' when the next raid is played alone.
    [coopPick, setCoopPick] = useState(''),
    // The hub's first choice: alone, two on one device, or two over the net.
    [playMode, setPlayMode] = useState<PlayMode>('solo'),
    // A room waits for the unfinished raid to be closed first.
    [hostAfter, setHostAfter] = useState(false),
    // Online co-op: the room, the fight the host opened for a guest, how the
    // last one ended, and whether the current raid was begun with a partner.
    [net, setNet] = useState<NetSession | null>(null),
    [guestFight, setGuestFight] = useState<{
      sid: number;
      run: Run;
      meta: Meta;
      mode: ShareMode;
      // The seats whose guests were not here when the host opened the fight.
      away: number[];
      // How many times this fight has been given to this guest (it is given
      // again, as a mirror, when the guest comes back into it).
      n: number;
    } | null>(null),
    // The room this device was in and can go back to: as a guest or as a host
    // (a raid in the saved run).
    [savedRoom, setSavedRoom] = useState<SavedGuestRoom | null>(null),
    [savedHost, setSavedHost] = useState<SavedHostRoom | null>(null),
    // A guest is trying to get back into its room.
    [rejoin, setRejoin] = useState<{
      room: SavedGuestRoom;
      since: number;
      tries: number;
    } | null>(null),
    // How the host's fights are shared with a guest (a hub choice).
    [shareMode, setShareMode] = useState<ShareMode>('sync'),
    [guestResult, setGuestResult] = useState<BattleResult | null>(null),
    // Cores the guest was paid for the last fight and for the host's raid.
    [guestEarned, setGuestEarned] = useState({ fight: 0, raid: 0 }),
    // The guest's cores from the fights of the host's raid so far: an advance
    // on its equal share at the end of the raid.
    guestAdvance = useRef(0),
    [onlineRun, setOnlineRun] = useState(false),
    [queued, setQueued] = useState<Launch | null>(null),
    [toasts, setToasts] = useState<Toast[]>([]),
    [updateHidden, setUpdateHidden] = useState(false),
    [profileAction, setProfileAction] = useState<'reset' | 'restore' | null>(
      null,
    ),
    [hasProfileBackup, setHasProfileBackup] = useState(false),
    [housingOpen, setHousingOpen] = useState(false),
    // On one screen: the partner's house being arranged (its seat).
    [mateHousing, setMateHousing] = useState<number | null>(null),
    [notice, setNotice] = useState(''),
    // A piece of furniture just taken (its uid): offered a place at once.
    [placing, setPlacing] = useState<number | null>(null),
    [pending, setPending] = useState<{
      id: string;
      source: 'shop' | 'reward' | 'draft';
      index: number;
    } | null>(null),
    // Co-op shop: whose house the next purchase is for.
    [buyFor, setBuyFor] = useState<'host' | 'mate'>('host'),
    [result, setResult] = useState<Result | null>(null),
    [abandon, setAbandon] = useState(false),
    [native, setNative] = useState(false),
    [sceneQueue, setSceneQueue] = useState<string[]>([]);
  const audio = useRef<AudioEngine | null>(null);
  if (!audio.current) audio.current = new AudioEngine();
  const roomHandle = useRef<{ close(): void } | null>(null);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  useNet(net);
  // The result modal opens at its title: the tall summary would otherwise
  // scroll down to its first button and hide how the run went.
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const isNative =
    typeof navigator !== 'undefined' &&
    navigator.userAgent.includes('OSBBAndroid');
  const install = useInstallPrompt(!isNative);
  const sw = useServiceWorker(!isNative && import.meta.env.PROD);
  const inCombat =
    (screen === 'play' && run?.page === 'combat') ||
    (screen === 'guest' && !!guestFight);
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
    !!offer ||
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
    // The battle code loads while the menu is open, so the first raid starts
    // at once; a few seconds in, after the first screens have settled.
    window.setTimeout(() => void import('./combat'), 3500);
    if (import.meta.env.DEV)
      Object.assign(window, {
        __osbbAudioPreview: renderThemePreview,
        // For scripts/net-e2e.cjs: puts the raid on another page (an event).
        __osbbRun: (patch: Partial<Run>) =>
          setRun((r) => (r ? { ...r, ...patch } : r)),
      });
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
      const savedCoop = coopHero(
        loaded.wins,
        localStorage.getItem('osbb.coop'),
      );
      setCoopPick(savedCoop);
      if (savedCoop) setPlayMode('local');
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
    if (meta.settings.cvd === 'off') delete root.dataset.cvd;
    else root.dataset.cvd = meta.settings.cvd;
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
  // The art for the fights is decoded a moment after a raid begins, one
  // picture at a time. At app start it froze the first seconds on slow phones.
  const raidChapter = run ? run.chapter : -1;
  useEffect(() => {
    if (raidChapter < 0) return;
    const id = window.setTimeout(() => preloadEnemyArt(raidChapter), 2500);
    return () => window.clearTimeout(id);
  }, [raidChapter]);
  // Secrets: the old cheat code on a keyboard and seven quick taps on the title
  // on a touch screen. The catch-all below announces what they unlock.
  const konami = useRef(0),
    titleTaps = useRef<number[]>([]);
  useEffect(() => {
    if (screen !== 'hub') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.repeat) return;
      const step = konamiStep(konami.current, e.key);
      konami.current = step.at;
      if (step.done) setMeta((m) => discover(m, 'konami'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);
  function tapTitle() {
    const step = tapStep(titleTaps.current, Date.now());
    titleTaps.current = step.taps;
    if (step.done) setMeta((m) => discover(m, 'konami'));
  }
  // While the game waits in a background tab the title nags the player.
  useEffect(() => {
    const home = document.title;
    let n = 0;
    const onVisibility = () => {
      document.title = document.hidden
        ? tabTitle(Math.floor(Date.now() / 1000) + n++)
        : home;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.title = home;
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
        // A scene that decides the ending must not be dismissed by Back.
        const open = storyScene(meta.sceneProgress.id, meta);
        if (!open?.choices?.some((c) => c.ending)) closeScene();
        return;
      }
      if (housingOpen) {
        e.preventDefault();
        setHousingOpen(false);
        return;
      }
      if (run?.page === 'combat' && screen === 'play') return;
      if (offer) {
        e.preventDefault();
        setOffer(null);
      } else if (help) {
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
    offer,
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
  // Voice-over follows the profile: its own volume and the master mute.
  useEffect(() => {
    setVoice({ volume: meta.settings.voice, enabled: meta.sound });
  }, [meta.settings.voice, meta.sound]);
  // Music ducks under voice lines.
  useEffect(() => onSpeaking((on) => audio.current?.setSpeaking(on)), []);
  // A soft click on every button and link, except the combat controls (they
  // have their own sounds) and the perk cards (which play it themselves).
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const el =
        e.target instanceof Element
          ? e.target.closest('button, a[href], [role="tab"]')
          : null;
      if (
        !el ||
        el.hasAttribute('disabled') ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.closest('.battle-controls, .perk-draft')
      )
        return;
      audio.current?.play('ui');
    };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, []);
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
    if (!meta.sceneProgress) return;
    setSceneQueue(leaveScene(meta, sceneQueue, choice).queue);
    setMeta((m) => leaveScene(m, sceneQueue, choice).meta);
  }
  // Online: the scenes this moment of a raid for two opens, whether or not
  // this profile has seen them; the guest watches those new to its own.
  function shareScenes(
    ids: readonly (string | null | undefined)[],
    partner = livePartner && onlineRun,
  ) {
    if (!partner || net?.role !== 'host') return;
    for (const id of ids) if (id) net.sendScene(id);
  }
  function playScene(id: string) {
    if (SCENE_BY_ID[id] || isStoryId(id)) {
      setSceneQueue([]);
      setMeta((m) => ({ ...m, sceneProgress: { id, index: 0 } }));
    }
  }
  const heatChoice = Math.min(heat, heatChoices(meta.heatUnlocked));
  function pickHeat(value: number) {
    setHeat(value);
    try {
      localStorage.setItem('osbb.heat', String(value));
    } catch {
      // Only a convenience: the choice resets to 0 next time.
    }
  }
  const coopChoice = coopHero(meta.wins, coopPick);
  // A guest is in the room and listening: the host's next raid is for two.
  const livePartner = net?.role === 'host' && net.phase === 'connected';
  const nameOf = (id: string) =>
    CHARACTERS.find((c) => c.id === id)?.name ?? id;
  // What the others in a room see this player as: the typed nick, else the hero.
  const onlineName = cleanNick(meta.settings.nick) || nameOf(character);
  // A partner's house in the texts: the player's name online, else their hero.
  const houseName = (seat: number) =>
    run?.coop
      ? onlineRun && net?.role === 'host'
        ? net.nameOf(seat)
        : nameOf(mateHero(run, seat))
      : '';
  // The second house in the texts.
  const mateName = houseName(1);
  const netPhase = net?.phase;
  // The guest opens the fights the host starts, and a connected guest lives
  // in the room screen; a lost room sends everyone back.
  useEffect(() => {
    if (!net) return;
    if (net.role === 'guest') {
      net.onStart = (m) => {
        const r = m.run as Run | null;
        if (!r || typeof r.seed !== 'number' || !Array.isArray(r.items)) return;
        setGuestResult(null);
        setGuestEarned({ fight: 0, raid: 0 });
        // A fight does not wait for a scene: the guest is needed in it.
        setSceneQueue([]);
        setMeta((m) => (m.sceneProgress ? { ...m, sceneProgress: null } : m));
        setGuestFight((f) => ({
          sid: m.sid,
          run: r,
          meta: m.meta as Meta,
          mode: m.mode === 'host' ? 'host' : 'sync',
          away: Array.isArray(m.away)
            ? m.away.filter((s) => Number.isInteger(s) && s > 0 && s < 4)
            : [],
          n: (f?.n ?? 0) + 1,
        }));
        setScreen('guest');
      };
      // The host's raid is over: the guest's profile gets its share.
      net.onGift = (g) => {
        // As many cores as the host; the fights already paid an advance.
        const pay = guestRunCores(g.cores, guestAdvance.current),
          now = metaRef.current;
        guestAdvance.current = 0;
        const next = {
          ...now,
          cores: now.cores + pay,
          coopWins: (now.coopWins ?? 0) + (g.won && g.final ? 1 : 0),
        };
        setGuestEarned((e) => ({ ...e, raid: pay }));
        setMeta(next);
        grant(applyAchievements(next, null).unlocked);
        // The story of the raid's end, from this profile's own copy: after the
        // final win all of it, otherwise the first Shelter beat new here.
        const story = g.all
          ? g.story
          : g.story.filter((id) => !now.scenesSeen.includes(id)).slice(0, 1);
        for (const id of story) watch(id, true);
      };
      // A scene that begins at the host is shown here once, if it is new to
      // this profile; one that comes while another plays waits its turn.
      // A Shelter beat of the host's own comes with the end of the raid
      // (onGift above), not on its own: the guest is told its own next one.
      const watch = (id: string, raidEnd = false) => {
        const now = metaRef.current;
        if (
          (!raidEnd && HUB_IDS.has(id)) ||
          now.scenesSeen.includes(id) ||
          now.sceneProgress?.id === id ||
          !(SCENE_BY_ID[id] || isStoryId(id))
        )
          return;
        if (now.sceneProgress)
          setSceneQueue((q) => (q.includes(id) ? q : [...q, id]));
        else setMeta((m) => ({ ...m, sceneProgress: { id, index: 0 } }));
      };
      net.onScene = (id) => watch(id);
      for (const id of net.takeScenes()) watch(id);
      const early = net.takeStart();
      if (early) net.onStart(early);
    }
    return () => {
      net.onStart = null;
      net.onGift = null;
      net.onScene = null;
    };
  }, [net]);
  useEffect(() => {
    if (!net) return;
    if (net.role === 'guest') {
      if (net.phase === 'connected') {
        setScreen((s) => (s === 'hub' ? 'guest' : s));
        // In: the way back is kept, and no more trying.
        if (net.token)
          saveGuestRoom({
            code: net.code,
            seat: net.seat,
            token: net.token,
            build: APP_VERSION,
            at: Date.now(),
          });
        setRejoin(null);
      } else if (net.phase === 'closed') {
        // The link went: the seat is kept, and the way back is tried at once.
        const room = loadGuestRoom(APP_VERSION);
        closeOnline(true);
        if (room) {
          setNotice('Зв’язок із кімнатою втрачено: повертаємось…');
          setRejoin({ room, since: Date.now(), tries: 0 });
        } else setNotice('Зв’язок із кімнатою втрачено.');
      } else if (net.phase === 'refused' && rejoin) {
        // The room is not there (yet): again after a pause, unless it will not
        // have us (a full room, a raid that has begun without us, another build).
        const final = /^(busy|started|version)/.test(net.error);
        if (final || Date.now() - rejoin.since > REJOIN_FOR) {
          saveGuestRoom(null);
          setRejoin(null);
          closeOnline(true);
          setNotice(
            final
              ? 'Кімната більше не приймає: рейд іде без тебе.'
              : 'Не вдалося повернутися в кімнату: хост недоступний.',
          );
        } else {
          const tries = rejoin.tries;
          const timer = window.setTimeout(
            () => setRejoin((r) => (r ? { ...r, tries: r.tries + 1 } : r)),
            REJOIN_EVERY,
          );
          void tries;
          return () => window.clearTimeout(timer);
        }
      }
    }
  }, [netPhase]);
  // For scripts/party-e2e.cjs: the room, to look at.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __net?: NetSession | null }).__net = net;
  }, [net]);
  // Each end says now and then that it is still there, and a link that has
  // been silent for long is let go of: its seat is kept, its fight goes on.
  useEffect(() => {
    if (!net) return;
    const timer = window.setInterval(
      () => net.heartbeat(),
      NetSession.PING_EVERY,
    );
    return () => window.clearInterval(timer);
  }, [net]);
  // A guest who is trying to get back knocks again, with its token.
  useEffect(() => {
    if (!rejoin) return;
    let stopped = false;
    void (async () => {
      roomHandle.current?.close();
      roomHandle.current = null;
      const room = new NetSession('guest', APP_VERSION, {
        hero: character,
        name: onlineName,
      });
      room.code = rejoin.room.code;
      room.seat = rejoin.room.seat;
      room.token = rejoin.room.token;
      setNet(room);
      try {
        const { joinRoom } = await import('./net-peer');
        if (stopped) return;
        roomHandle.current = await joinRoom(rejoin.room.code, {
          link: (link) => room.adopt(link),
          error: (why) => room.fail(why),
          note: (text) => room.note(text),
        });
      } catch {
        room.fail('net:Не вдалося завантажити мережевий модуль.');
      }
    })();
    return () => {
      stopped = true;
    };
  }, [rejoin?.room.code, rejoin?.tries]);
  // What this device can go back to, found when the page opens.
  useEffect(() => {
    const guestRoom = loadGuestRoom(APP_VERSION),
      hostRoom = loadHostRoom(APP_VERSION);
    setSavedRoom(guestRoom);
    setSavedHost(hostRoom);
    // The way back is shown where it is: on the online tab.
    if (guestRoom || hostRoom) setPlayMode('online');
  }, []);
  // Host: a guest leaves or comes back. The raid goes on: the seat of a guest
  // who left is kept, its house stands and waits.
  const hereKey = net?.role === 'host' ? net.seatsHere.join() : '';
  const wasHere = useRef<number[]>([]);
  useEffect(() => {
    if (net?.role !== 'host') {
      wasHere.current = [];
      return;
    }
    const now = net.seatsHere,
      before = wasHere.current;
    wasHere.current = now;
    if (!onlineRun) return;
    const left = before.filter((s) => !now.includes(s)),
      came = now.filter((s) => !before.includes(s));
    const names = (seats: number[]) => seats.map((s) => net.nameOf(s)).join(', ');
    if (left.length)
      setNotice(
        `${names(left)} відійшов: рейд триває, будинок стоїть і чекає на повернення.`,
      );
    else if (came.length) setNotice(`${names(came)} повернувся до рейду.`);
  }, [hereKey]);
  // A reward waits for every house; a player who is not here does not pick, so
  // their house takes the first find that fits (or none) and the raid goes on.
  const rewardKey =
    run?.coop && run.page === 'reward' && onlineRun && net?.role === 'host'
      ? `${run.seed}-${run.chapter}-${run.step}-${hereKey}-${(run.mateLoots ?? []).map((r) => r.length).join()}`
      : '';
  useEffect(() => {
    if (!rewardKey || !run || net?.role !== 'host') return;
    let next = run;
    for (const seat of mateSeats(run)) {
      const row = next.mateLoots?.[seat - 1] ?? [];
      if (!row.length || net.seatsHere.includes(seat)) continue;
      let took = next;
      for (const [i, loot] of row.entries()) {
        if (loot.kind === 'module') {
          const given = giveMate(next, metaRef.current, loot.id, seat);
          took = given === next ? next : settleReward(given, seat, loot.id);
        } else took = giveMateFurniture(next, i, seat);
        if (took !== next) break;
      }
      next = took !== next ? took : settleReward(next, seat);
    }
    if (next !== run) setRun(next);
  }, [rewardKey]);
  // The raid is over (or never was): the seats of those who are gone are free.
  useEffect(() => {
    if (net?.role === 'host' && !run && net.crewLocked) net.unlockCrew();
  }, [run, net]);
  // Host: the room of a raid is kept as long as the raid is, so that the host
  // too can come back to it (and the guests to the host).
  useEffect(() => {
    if (net?.role !== 'host' || !net.code) return;
    if (!onlineRun || !run?.coop) {
      if (!run) {
        saveHostRoom(null);
        setSavedHost(null);
      }
      return;
    }
    saveHostRoom({
      code: net.code,
      build: APP_VERSION,
      mode: net.mode,
      seats: net.saveSeats(),
      at: Date.now(),
    });
  }, [net, net?.code, onlineRun, !!run, hereKey]);
  // A scene that begins at the host in a raid for two is shown to the guest too.
  const sceneId = meta.sceneProgress?.id;
  useEffect(() => {
    if (sceneId && livePartner && onlineRun) net?.sendScene(sceneId);
  }, [sceneId]);
  // What the guest reads while the host is away from the fights.
  useEffect(() => {
    if (net?.role !== 'host' || net.phase !== 'connected') return;
    net.sendStatus(
      screen !== 'play' || !run
        ? 'Господар у Притулку'
        : run.page === 'council'
          ? 'Збори ОСББ: правило для нової локації'
          : run.page === 'map'
          ? `Карта: ${LOCATIONS[run.chapter]?.name ?? ''}, крок ${run.step + 1}`
          : run.page === 'shop'
            ? 'Господар у магазині' + shopNote(run)
            : run.page === 'event'
              ? run.kind !== 'rest' && run.coop && eventFor(run).together
                ? 'Господар на спільній події: потрібні обоє'
                : 'Господар на події'
              : run.page === 'reward'
                ? 'Господар вибирає нагороду' + rewardNote(run)
                : HOST_IN_FIGHT,
    );
  }, [
    netPhase,
    screen,
    run?.page,
    run?.step,
    run?.chapter,
    run?.picked?.[0],
    run?.picked?.[1],
    run?.bought.length,
  ]);
  // The guest sees the same house, its own modules, its row of the reward and
  // the shop, and takes from them; what it asks for is checked here.
  const houseKey = (h: Run) =>
    [
      h.items.join(),
      h.backpack.map((i) => i.id).join(),
      h.residents.map((r) => r.id + r.x + r.y + r.rotation).join(),
      h.furniture.map((f) => `${f.id}${f.resident}${f.cell}`).join(),
      h.houseLevel,
    ].join('/');
  const viewKey =
    livePartner && screen === 'play' && run?.coop
      ? [
          run.page,
          run.step,
          run.eventDone,
          run.eventResult,
          Math.floor(run.coins),
          Math.floor(run.scrap),
          houseKey(run),
          ...(run.mates ?? []).map((_, i) => houseKey(mateRun(run, i + 1))),
          run.loot.map((l) => l.id).join(),
          (run.mateLoots ?? []).map((row) => row.map((l) => l.id).join()).join(),
          run.offers.join(),
          run.bought.join(),
          JSON.stringify(run.boughtBy ?? {}),
          JSON.stringify(run.picked ?? {}),
        ].join('|')
      : '';
  useEffect(() => {
    if (net?.role === 'host' && viewKey && run) net.sendView(run);
  }, [netPhase, viewKey]);
  const takeRef = useRef<
    (
      m: { source: 'reward' | 'shop'; index: number; id: string },
      seat?: number,
    ) => void
  >(() => {});
  takeRef.current = (m, seat = 1) => {
    if (!run?.coop || seat < 1 || seat >= partySize(run)) return;
    const row = run.mateLoots?.[seat - 1];
    if (m.source === 'shop' && m.index >= 10) {
      if (run.page === 'shop' && run.shopFurniture[m.index - 10] === m.id)
        buyFurnitureFor(m.id, seat);
    } else if (
      m.source === 'reward' &&
      run.page === 'reward' &&
      row?.[m.index]?.id === m.id &&
      row[m.index].kind === 'furniture'
    )
      giveFurnitureToMate(m.index, seat);
    else if (
      m.source === 'reward'
        ? run.page === 'reward' && row?.[m.index]?.id === m.id
        : run.page === 'shop' && run.offers[m.index] === m.id
    )
      giveToMate(m.id, m.source, m.index, seat);
  };
  const houseRef = useRef<
    (
      m: { house: unknown; coins: number; scrap: number },
      seat?: number,
    ) => void
  >(() => {});
  houseRef.current = (m, seat = 1) => {
    const next = run && acceptMateHouse(run, m, seat);
    // Refused: the guest is shown the true state again.
    if (next) setRun(next);
    else if (run && net?.role === 'host') net.sendView(run);
  };
  useEffect(() => {
    if (net?.role !== 'host') return;
    net.onTake = (m, seat) => takeRef.current(m, seat);
    net.onHouse = (m, seat) => houseRef.current(m, seat);
    return () => {
      net.onTake = null;
      net.onHouse = null;
    };
  }, [net]);
  // Online, where the raid goes next is a vote of both players on one map
  // (coop.ts): a fork is voted on, a single way or a fight to continue is not.
  const ballot = net?.role === 'host' ? net.ballot : null;
  // The guest sees the map whenever the host does; a fork is voted on.
  const mapOpen = livePartner && screen === 'play' && run?.page === 'map';
  const voting =
    mapOpen && run.path.length <= run.step && availableColumns(run).length > 1;
  const voteKey =
    mapOpen && run ? `${run.seed}-${run.chapter}-${run.step}` : '';
  const [guestSilent, setGuestSilent] = useState(false);
  useEffect(() => {
    if (net?.role !== 'host') return;
    if (voteKey && run) {
      setGuestSilent(false);
      net.openVote(run, run.step, availableColumns(run));
    } else net.closeVote();
  }, [voteKey, netPhase]);
  // An event of a raid for two is decided by both, like the map: each pick
  // travels, the same one acts, different ones go to a coin.
  const eventOpen =
    livePartner &&
    onlineRun &&
    screen === 'play' &&
    run?.page === 'event' &&
    !run.eventDone;
  const eventKey =
    eventOpen && run ? `${run.seed}-${run.chapter}-${run.step}` : '';
  useEffect(() => {
    if (net?.role !== 'host' || !eventKey || !run) return;
    setGuestSilent(false);
    net.openEventVote(run.step, eventColumns(run, metaRef.current));
    return () => net.closeVote();
  }, [eventKey, netPhase]);
  // The council of the house between the locations is voted on by all of them
  // the same way: the most picked rule, a coin for a tie.
  const councilOpen =
    livePartner && onlineRun && screen === 'play' && run?.page === 'council';
  const councilKey =
    councilOpen && run ? `${run.seed}-${run.chapter}-${run.loop ?? 0}` : '';
  useEffect(() => {
    if (net?.role !== 'host' || !councilKey || !run) return;
    setGuestSilent(false);
    net.openEventVote(run.step, COUNCIL_COLUMNS);
    return () => net.closeVote();
  }, [councilKey, netPhase]);
  // A meeting with a moral side leaves its mark in the profile at both ends
  // (each end resolves the same choice); the same meeting met again replaces
  // the earlier answer.
  useEffect(() => {
    const mark = run?.eventDone ? run.eventMark : undefined;
    if (mark) setMeta((m) => addMark(m, mark));
  }, [run?.eventDone, run?.eventMark]);
  // A guest who does not answer does not hold the host up for ever.
  useEffect(() => {
    if (!(voting || eventOpen || councilOpen) || !ballot || ballot.done) return;
    // A meeting for two is not decided for a partner who is silent.
    if (eventOpen && run && eventFor(run).together) return;
    // Only the host has picked and somebody here has not: wait a while for them.
    if (
      ballot.votes[0] === null ||
      ballot.votes.every((v, s) => v !== null || ballot.away?.includes(s))
    )
      return;
    const timer = setTimeout(() => setGuestSilent(true), VOTE.silent * 1000);
    return () => clearTimeout(timer);
  }, [voting, eventOpen, ballot?.step, ballot?.votes.join(), ballot?.away?.join()]);
  // Both have picked (or the guest is silent): the verdict goes to both ends.
  useEffect(() => {
    if (net?.role !== 'host' || !run || !ballot || ballot.done) return;
    const verdict = ballotResult(ballot, run.seed, guestSilent);
    if (verdict && ballot.step === run.step) net.settle(verdict);
  }, [ballot?.step, ballot?.votes.join(), ballot?.away?.join(), guestSilent]);
  // A moment to see the verdict, then the raid goes there.
  useEffect(() => {
    const done = ballot?.done,
      step = ballot?.step;
    if (!done || step === undefined) return;
    const timer = setTimeout(
      () =>
        setRun((r) =>
          !r || r.step !== step
            ? r
            : r.page === 'map'
              ? enterNode(r, metaRef.current, `${step}:${done.col}`)
              : r.page === 'event' && !r.eventDone
                ? resolveEvent(r, metaRef.current, done.col)
                : r.page === 'council'
                  ? choosePact(r, councilOffers(r)[done.col] ?? '')
                  : r,
        ),
      done.coin ? 1800 : 900,
    );
    return () => clearTimeout(timer);
  }, [ballot?.done?.col, ballot?.done?.coin, ballot?.step]);
  // A guest does not stay in a fight nobody runs: when the host has said it is
  // in the fight and then says it is somewhere else (and the fight's own end
  // did not come, lost on the way or never sent), the guest leaves it after a
  // moment, long enough for the result of a normal end to be shown first.
  const hostSays = net?.role === 'guest' ? net.status : '';
  const sawFight = useRef(false);
  useEffect(() => {
    if (!guestFight) {
      sawFight.current = false;
      return;
    }
    if (hostSays === HOST_IN_FIGHT) {
      sawFight.current = true;
      return;
    }
    if (!sawFight.current || !hostSays) return;
    const sid = guestFight.sid;
    const timer = setTimeout(() => {
      setGuestFight((f) => (f && f.sid === sid ? null : f));
      setNotice('Господар уже поза боєм: чекаємо на нього в кімнаті.');
    }, 3500);
    return () => clearTimeout(timer);
  }, [hostSays, guestFight?.sid]);
  function closeOnline(keepSeat = false) {
    // A new room is a new raid: no advance carries over.
    guestAdvance.current = 0;
    if (!keepSeat) {
      // The player means to leave: no way back is kept.
      saveGuestRoom(null);
      setSavedRoom(null);
      setRejoin(null);
    }
    roomHandle.current?.close();
    roomHandle.current = null;
    net?.close();
    if (net) endVoice(net);
    setNet(null);
    setGuestFight(null);
    setGuestResult(null);
    setScreen((s) => (s === 'guest' ? 'hub' : s));
  }
  async function hostOnline() {
    closeOnline();
    const room = new NetSession('host', APP_VERSION, {
      hero: character,
      name: onlineName,
    });
    room.mode = shareMode;
    setNet(room);
    try {
      const { createRoom } = await import('./net-peer');
      roomHandle.current = await createRoom({
        code: (c) => room.setCode(c),
        guest: (link) => room.adopt(link),
        error: (why) => room.fail(why),
      });
    } catch {
      room.fail(
        'net:Не вдалося завантажити мережевий модуль. Перевір інтернет.',
      );
    }
  }
  // Host: the room of the raid that was on when this page closed opens again
  // with the same code, and the guests come back to their seats with their tokens.
  async function resumeRoom() {
    const saved = loadHostRoom(APP_VERSION);
    if (!saved || !run?.coop || (run.mates?.length ?? 0) !== saved.seats.length)
      return;
    closeOnline(true);
    const room = new NetSession('host', APP_VERSION, {
      hero: character,
      name: onlineName,
    });
    room.mode = saved.mode;
    room.restore(saved.seats);
    setNet(room);
    setOnlineRun(true);
    setSavedHost(null);
    try {
      const { createRoom } = await import('./net-peer');
      roomHandle.current = await createRoom(
        {
          code: (c) => room.setCode(c),
          guest: (link) => room.adopt(link),
          error: (why) => room.fail(why),
        },
        saved.code,
      );
    } catch {
      room.fail(
        'net:Не вдалося завантажити мережевий модуль. Перевір інтернет.',
      );
    }
    setScreen('play');
  }
  async function joinOnline(code: string) {
    closeOnline();
    const room = new NetSession('guest', APP_VERSION, {
      hero: character,
      name: onlineName,
    });
    room.code = code;
    setNet(room);
    try {
      const { joinRoom } = await import('./net-peer');
      roomHandle.current = await joinRoom(code, {
        link: (link) => room.adopt(link),
        error: (why) => room.fail(why),
        note: (text) => room.note(text),
      });
    } catch {
      room.fail(
        'net:Не вдалося завантажити мережевий модуль. Перевір інтернет.',
      );
    }
  }
  function pickCoop(hero: string) {
    setCoopPick(hero);
    try {
      localStorage.setItem('osbb.coop', hero);
    } catch {
      // Only a convenience: the second player is off again next time.
    }
  }
  function pickMode(next: PlayMode) {
    setPlayMode(next);
    // Only "Вдвох тут" starts the next raid with a second player on the device;
    // online the partner comes with the room.
    pickCoop(
      next === 'local'
        ? coopChoice || (coopPartners(meta.wins)[0]?.id ?? '')
        : '',
    );
  }
  // A room is for a new raid: an unfinished one is closed first, with a say.
  function askHost() {
    if (!run) return void hostOnline();
    setQueued(null);
    setHostAfter(true);
    setAbandon(true);
  }
  // What the next hub is built for: the extras wait for a finished first raid.
  const veteran = ready && meta.tutorialDone && meta.runs > 0;
  function start() {
    if (!ready) return;
    audio.current!.unlock();
    if (run) {
      setScreen('play');
      if (!meta.scenesSeen.includes(`arrival-${run.chapter}`))
        playScene(`arrival-${run.chapter}`);
      shareScenes([`arrival-${run.chapter}`]);
      return;
    }
    launch({ mode: 'campaign', character, heat: heatChoice });
  }
  function launch(spec: Launch, base: Meta = meta) {
    audio.current!.unlock();
    // The first raid opens with the way out of the loop (cutscene 'goal'), then
    // with the district; each only the first time.
    const opening = chapter === 0 ? firstScene(base, 'goal') : null;
    setSceneQueue(
      opening && !base.scenesSeen.includes(`arrival-${chapter}`)
        ? [`arrival-${chapter}`]
        : [],
    );
    let started = makeRun(
      base,
      spec.character || character,
      0,
      spec.seed ?? Date.now(),
      {
        mode: spec.mode,
        heat: spec.heat,
        daily: spec.daily,
        // The daily run stays a single-player ranking.
        coop: spec.mode === 'daily' ? '' : (spec.coop ?? coopChoice),
      },
    );
    // The partners who joined the room are not held to this profile's unlocks:
    // everybody who is here is in the raid, each with a house of their own.
    const crew =
      livePartner && spec.mode !== 'daily' && net
        ? net.lockCrew().filter((id) => CHARACTERS.some((c) => c.id === id))
        : [];
    if (crew.length) started = withCrew(started, crew);
    setOnlineRun(!!started.coop && crew.length > 0);
    shareScenes(
      chapter === 0 ? ['goal', `arrival-${chapter}`] : [`arrival-${chapter}`],
      !!started.coop && crew.length > 0,
    );
    setBuyFor('host');
    setRun(started);
    const begun = startDaily(base, started);
    setMeta({
      // A raid that starts in the quiet hours is a secret of its own.
      ...(isQuietHour(new Date()) ? discover(begun, 'night') : begun),
      // The new run carries the 'НОВЕ' items into its first reward.
      fresh: [],
      lore: loreForProgress(base.lore, base.wins, chapter),
      sceneProgress: opening ?? firstScene(base, `arrival-${chapter}`),
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
  function ended(result: BattleResult) {
    // A partner who left in the middle of the fight keeps their seat: they may
    // come back before the next one.
    const b = result;
    // Who was met in this fight goes into the gallery.
    const met = b.met ?? [];
    if (met.length) setMeta((m) => withMet(m, met));
    const gate = b.boss && b.run.step === b.run.nodes.length - 1;
    // The boss met at the end of this location: it has last words of its own.
    const bossId = b.run.bossVariants
      ? campaignBoss(b.run.chapter, b.run.bossVariants[b.run.chapter] ?? 0).id
      : '';
    if (b.won && gate && !isFinalVictory(b.run)) {
      const next = advanceLocation(b.run, meta),
        looped = next.loop > b.run.loop;
      // The boss's last word, then the new location; each only the first time.
      const chain = victoryChain(meta, b.run.chapter, looped, bossId);
      // The guest is offered the whole chain, seen here or not.
      shareScenes(
        victoryChain(
          { ...meta, scenesSeen: [] },
          b.run.chapter,
          looped,
          bossId,
        ),
      );
      // Before the new location, the neighbours meet to take one rule for it.
      setRun(openCouncil(next));
      setSceneQueue(chain.slice(1));
      setMeta((m) => ({
        ...m,
        sceneProgress: chain[0] ? { id: chain[0], index: 0 } : null,
      }));
      grant(applyAchievements(meta, b.run).unlocked);
      ping(
        looped
          ? `Коло ${next.loop + 1}. Складність ${next.heat}: будинок, мешканці й здобич ідуть далі.`
          : 'Локацію пройдено. Будинок і здобич переходять далі.',
      );
      return;
    }
    if (!b.won || gate) {
      const final = b.won && isFinalVictory(b.run),
        daily = b.run.mode === 'daily',
        dayBest = daily ? (meta.dailyBest?.[b.run.daily] ?? 0) : 0,
        score = runScore(b.run, final);
      const f = finishRun(withMet(meta, met), b.run, b.won);
      // The partners in the room get a share of the cores of this raid.
      if (livePartner && b.run.coop)
        net?.sendGift(
          f.cores,
          b.won,
          final,
          raidEndStory(f.meta, final, b.won && gate ? bossId : ''),
        );
      // After a raid: the next story beat as a scene, else a short protocol.
      const after = raidEnd(f.meta, b.won, final, b.won && gate ? bossId : '');
      setSceneQueue(after.then ?? []);
      setMeta({
        ...f.meta,
        sceneProgress: after.scene ? { id: after.scene, index: 0 } : null,
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
        record: daily && b.run.dailyRanked && score > dayBest,
        dayBest: Math.max(dayBest, score),
        protocol: after.protocol,
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
      // Somewhere on the way a story beat can find the crew (the radio of
      // another house, a sign by the road); it is told once and the raid goes on.
      const beat = meta.sceneProgress
        ? null
        : raidBeat(meta, b.run.chapter, b.run.step);
      shareScenes(raidBeatsAt(meta, b.run.chapter, b.run.step));
      if (beat) {
        setSceneQueue([]);
        setMeta((m) => ({ ...m, sceneProgress: { id: beat, index: 0 } }));
      }
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
    if (source === 'shop' && run.coop && !livePartner && buyFor === 'mate')
      return giveToMate(id, 'shop', index);
    setPending({ id, source, index });
  }
  // Furniture from the shop for one of the houses (seat 0 is the first).
  function buyFurnitureFor(id: string, seat: number | 'host' | 'mate') {
    if (!run) return;
    const who = seat === 'host' ? 0 : seat === 'mate' ? 1 : seat;
    const next =
      who > 0 ? buyFurnitureMate(run, id, who) : buyFurniture(run, id);
    if (next === run) return;
    const index = 10 + run.shopFurniture.indexOf(id);
    setRun({
      ...next,
      boughtBy: { ...next.boughtBy, [index]: who },
    });
    setMeta((m) => ({ ...m, seen: [...new Set([...m.seen, id])] }));
    if (who > 0) ping(`Меблі для дому ${houseName(who)}.`);
    else offerPlace(next, run.nextFurnitureId);
  }
  // A piece just taken goes into a flat now, if there is a free cell for it.
  function offerPlace(next: Run, uid: number) {
    const piece = next.furniture.find((f) => f.uid === uid);
    if (!piece) return;
    const free = equipmentTargets(next).some(
      (t) =>
        !next.items[t.slot] &&
        canFurnish(next.furniture, next.residents, uid, t.resident, t.cell),
    );
    if (free) setPlacing(uid);
    else
      ping(
        `${FURNITURE_BY_ID[piece.id].name} на борту. Вільних місць у квартирах немає: встанови пізніше.`,
      );
  }
  function placeFurniture(resident: string, cell: number) {
    if (!run || placing === null) return;
    const piece = run.furniture.find((f) => f.uid === placing);
    const next = installFurniture(run, meta, placing, resident, cell);
    if (!piece || next === run) {
      ping('Це місце зайняте. Обери вільну клітинку квартири.');
      return;
    }
    setRun(next);
    setPlacing(null);
    ping(
      `${RESIDENT_BY_ID[resident].name}: ${FURNITURE_BY_ID[piece.id].name}, ${furnitureEffect(piece.id, resident).label}.`,
    );
  }
  // A partner house gets a module, from the shop or from its row of a reward:
  // it goes straight into its rooms (no placing by hand).
  function giveToMate(
    id: string,
    source: 'shop' | 'reward',
    index: number,
    seat = 1,
  ) {
    if (!run) return;
    const item = ITEM_BY_ID[id];
    if (!item) return;
    const cost = source === 'shop' ? priceFor(item, run) : 0;
    if (source === 'shop' && (run.coins < cost || run.bought.includes(index)))
      return;
    let next = giveMate(run, meta, id, seat);
    if (next === run) {
      ping(
        `У ${houseName(seat)} немає місця: усі кімнати зайняті модулями не гіршими за цей.`,
      );
      return;
    }
    next = { ...next, coins: next.coins - cost };
    if (source === 'shop')
      next = {
        ...next,
        bought: [...next.bought, index],
        boughtBy: { ...next.boughtBy, [index]: seat },
      };
    setMeta((m) => ({
      ...m,
      seen: [...new Set([...m.seen, id])],
      unlocked: [...new Set([...m.unlocked, id])],
    }));
    if (source === 'reward') next = settleReward(next, seat, id);
    setRun(next);
    ping(`${item.name} — ${houseName(seat)}.`);
  }
  // A partner house takes the piece of furniture from its row of a reward.
  function giveFurnitureToMate(index: number, seat = 1) {
    const loot = run?.mateLoots?.[seat - 1]?.[index];
    if (!run || loot?.kind !== 'furniture') return;
    const next = giveMateFurniture(run, index, seat);
    if (next === run) {
      ping(`У ${houseName(seat)} запас меблів заповнений.`);
      return;
    }
    setRun(next);
    ping(
      `${FURNITURE_BY_ID[loot.id]?.name ?? loot.id} — ${houseName(seat)}.` +
        (onlineRun ? '' : ' Постав через «Облаштувати» на картці будинку.'),
    );
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
      boughtBy:
        source === 'shop' ? { ...next.boughtBy, [index]: 0 } : next.boughtBy,
    };
    if (source === 'reward') next = settleReward(next, 0, id);
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
      boughtBy:
        source === 'shop' ? { ...next.boughtBy, [index]: 0 } : next.boughtBy,
    };
    setMeta((m) => ({
      ...m,
      seen: [...new Set([...m.seen, id])],
      unlocked: [...new Set([...m.unlocked, id])],
    }));
    if (source === 'reward') next = settleReward(next, 0, id);
    if (source === 'draft') next = skipDraft(next);
    setRun(next);
    setPending(null);
    ping(
      `${item.name} — квартира ${RESIDENT_BY_ID[APARTMENT_SLOTS[slot].resident].name}${run.items[slot] ? ' · попередній предмет знято та збережено' : ''}.`,
    );
  }
  const stats = run ? statsFor(run, meta) : null;
  const inventory = run && stats && (
    <HouseAside
      run={run}
      meta={meta}
      title="БУДИНОК № 17"
      // A module with a minus lowers the most: the fight starts at that.
      hp={Math.min(run.hp, stats.health)}
      onOpen={() => setHousingOpen(true)}
      partner={
        run.coop &&
        mateSeats(run).map((seat) => (
          <PartnerHouse
            key={seat}
            house={mateRun(run, seat)}
            name={houseName(seat)}
            meta={meta}
            health={run.mates?.[seat - 1]?.health}
            // Online each player arranges their own house on their device.
            onEdit={onlineRun ? undefined : () => setMateHousing(seat)}
          />
        ))
      }
    >
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
    </HouseAside>
  );
  return (
    <main className={`game-shell ${inCombat ? 'in-combat' : ''}`}>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            if (run?.page !== 'combat' && screen !== 'guest') back();
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
            : screen === 'guest'
              ? 'ОНЛАЙН-КІМНАТА'
              : screen === 'workshop'
                ? 'МАЙСТЕРНЯ'
                : screen === 'codex'
                  ? 'ГАЛЕРЕЯ'
                  : screen === 'lore'
                    ? 'АРХІВ БУДИНКУ'
                    : screen === 'case'
                      ? 'СПРАВА 04:17'
                      : screen === 'shop'
                        ? 'МАГАЗИН (ДЕМО)'
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
          {screen === 'hub' && (
            <button
              className="icon-button coffee-button"
              aria-label="Кава для ОСББ (демо)"
              title="Кава для ОСББ (демо)"
              onClick={() => setOffer('coffee')}
            >
              <Coffee size={18} />
            </button>
          )}
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
            {/* The secret seven taps on the title: not meant for the keyboard. */}
            {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
            <h1 onClick={tapTitle}>
              ОСББ
              <br />
              <em>кінця світу</em>
            </h1>
            <PlayModes mode={playMode} onMode={pickMode} roomOpen={!!net}>
              {playMode === 'local' && (
                <>
                  <CoopSelect
                    wins={meta.wins}
                    value={coopChoice}
                    onChange={pickCoop}
                  />
                  {run && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        requestLaunch({
                          mode: 'campaign',
                          character,
                          heat: heatChoice,
                          coop: coopChoice,
                        })
                      }
                    >
                      Почати новий рейд вдвох
                    </button>
                  )}
                </>
              )}
              {playMode === 'online' && (
                <OnlinePanel
                  session={net}
                  build={APP_VERSION}
                  nick={meta.settings.nick}
                  myHero={nameOf(character)}
                  onNick={(nick) =>
                    setMeta((m) => ({ ...m, settings: { ...m.settings, nick } }))
                  }
                  mode={shareMode}
                  hasRun={!!run}
                  onMode={(m) => {
                    setShareMode(m);
                    if (net?.role === 'host') net.mode = m;
                  }}
                  onHost={askHost}
                  onJoin={joinOnline}
                  onClose={() => closeOnline()}
                  savedRoom={rejoin ? null : savedRoom}
                  onRejoin={() => {
                    if (!savedRoom) return;
                    setRejoin({ room: savedRoom, since: Date.now(), tries: 0 });
                    setNotice(`Повертаємось у кімнату ${savedRoom.code}…`);
                  }}
                  savedHost={run?.coop && !net ? savedHost : null}
                  onResume={resumeRoom}
                  onForget={() => {
                    saveGuestRoom(null);
                    saveHostRoom(null);
                    setSavedRoom(null);
                    setSavedHost(null);
                  }}
                />
              )}
            </PlayModes>
            <section className="hub-brief">
              <div className="hub-mission">
                <span className="micro">ТВОЯ МІСІЯ</span>
                <p>
                  <b>Ти — голова ОСББ.</b> Виведи будинок №17 з петлі 04:17:
                  дійди до диспетчерської й вивези ядро «Світанку».
                </p>
              </div>
              <ol className="hub-howto">
                <li>
                  <Route size={22} />
                  <b>Обери маршрут</b>
                  <span>На карті: бій, магазин чи подія.</span>
                </li>
                <li>
                  <Crosshair size={22} />
                  <b>Виживай у бою</b>
                  <span>WASD чи джойстик, пробіл — ривок, E — вміння.</span>
                </li>
                <li>
                  <Users size={22} />
                  <b>Рятуй сусідів</b>
                  <span>Розселяй їх: вони посилюють дім.</span>
                </li>
              </ol>
            </section>
            {run && (
              <div className="hub-resume">
                <b>Рейд триває:</b> {LOCATIONS[run.chapter].name}, крок{' '}
                {run.step + 1}. Голова ОСББ:{' '}
                {RESIDENT_BY_ID[run.character].name}, врятовано{' '}
                {run.rescued.length}. <RunBadge run={run} />
                <button
                  type="button"
                  className="secondary stop-raid"
                  onClick={() => {
                    setQueued(null);
                    setAbandon(true);
                  }}
                >
                  <LogOut size={16} /> Завершити рейд
                </button>
              </div>
            )}
            <button
              className="primary start-button"
              onClick={start}
              disabled={!ready}
            >
              {run ? 'ПРОДОВЖИТИ РЕЙД' : 'ВИРУШИТИ В РЕЙД'}{' '}
              <ArrowUpRight size={22} />
            </button>
            {!run && (
              <details className="hub-setup">
                <summary>
                  Голова:{' '}
                  <b>{CHARACTERS.find((c) => c.id === character)?.name}</b>
                  {heatChoice > 0 && (
                    <>
                      {' '}
                      · складність <b>{heatChoice}</b>
                    </>
                  )}
                  <span className="muted"> — змінити</span>
                </summary>
                <div className="crew-select" aria-label="Голова ОСББ для рейду">
                  {CHARACTERS.map((c) => (
                    <button
                      key={c.id}
                      className={`crew-option ${character === c.id ? 'active' : ''}`}
                      disabled={c.win > meta.wins}
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
                        <Glyph name={c.icon} size={17} />
                      )}
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
                <p className="crew-description">
                  {CHARACTERS.find((c) => c.id === character)?.desc}
                  <br />
                  <b>E — {heroAbility(character).name}.</b>{' '}
                  {heroAbility(character).text}
                </p>
                <HeatSelect
                  max={heatChoices(meta.heatUnlocked)}
                  value={heatChoice}
                  onChange={pickHeat}
                />
              </details>
            )}
            {veteran && (
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
            {veteran && (
              <HubModes
                meta={meta}
                run={run}
                heat={heatChoice}
                onLaunch={requestLaunch}
                onContinue={start}
              />
            )}
            {veteran && <NoticeBoard />}
            {veteran && (
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
                  <BookOpen size={18} /> Галерея{' '}
                  <span className="tiny-count">
                    {meta.seen.length}/{ITEMS.length + FURNITURE.length}
                  </span>
                </button>
                <button
                  className="text-button"
                  onClick={() => setScreen('lore')}
                >
                  <ScrollText size={18} /> Історія{' '}
                  <span className="tiny-count">
                    {
                      LIBRARY_IDS.filter((id) => meta.scenesSeen.includes(id))
                        .length
                    }
                    /{LIBRARY_IDS.length}
                  </span>
                </button>
                <button
                  className="text-button"
                  onClick={() => setScreen('case')}
                >
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
            )}
            <div className="hub-secondary">
              <button
                className="demo-shop-link"
                onClick={() => setScreen('shop')}
              >
                <ShoppingBag size={16} /> Магазин ОСББ (демо)
              </button>
              {install.canInstall && (
                <button
                  className="text-button small"
                  onClick={install.install}
                >
                  <MonitorDown size={16} /> Встановити гру
                </button>
              )}
            </div>
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
              <li className="demo-locked">
                <button
                  className="text-button small"
                  onClick={() => setOffer('chapter')}
                  aria-label="Доповнення «Сусідній будинок» (демо)"
                >
                  <b>0{LOCATIONS.length + 1}</b>
                  <span>Сусідній будинок · доповнення</span>
                  <Lock size={15} />
                </button>
              </li>
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
            <Suspense
              fallback={<section className="battle-screen" aria-busy="true" />}
            >
              <Combat
                key={`${run.seed}-${run.chapter}-${run.step}`}
                run={
                  onlineRun && !livePartner && run.coop
                    ? { ...run, coop: '' }
                    : run
                }
                meta={meta}
                audio={audio.current!}
                hold={settingsOpen || abandon}
                net={livePartner && run.coop && net ? net : undefined}
                onDone={ended}
                onExit={(r) => {
                  setRun(r);
                  back();
                }}
                onPauseChange={setCombatPaused}
                onSettings={() => setSettingsOpen(true)}
                onAbandon={() => {
                  setQueued(null);
                  setAbandon(true);
                }}
              />
            </Suspense>
          ) : (
            <div className="play-layout">
              <section className="play-main">
                <div className="page-heading">
                  <div className="page-actions">
                    <button className="text-button" onClick={back}>
                      <ArrowLeft size={16} /> Меню
                    </button>
                    <button
                      className="text-button stop-raid-link"
                      onClick={() => {
                        setQueued(null);
                        setAbandon(true);
                      }}
                    >
                      <LogOut size={16} /> Завершити рейд
                    </button>
                  </div>
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
                    {pactOf(run.pact) && (
                      <p className="pact-chip">
                        <b>Правило локації: {pactOf(run.pact)!.name}</b>
                        <span>{pactOf(run.pact)!.gain}</span>
                        <span>− {pactOf(run.pact)!.cost}</span>
                      </p>
                    )}
                    {onlineRun &&
                      net?.role === 'host' &&
                      net.crewLocked &&
                      run.coop &&
                      net.here().length < partySize(run) - 1 && (
                        <div className="net-note waiting" role="status">
                          <span>
                            Чекаємо на повернення:{' '}
                            {mateSeats(run)
                              .filter((s) => !net.seatsHere.includes(s))
                              .map((s) => net.nameOf(s))
                              .join(', ')}
                            . Їхні місця й будинки збережено; можна іти й без
                            них.
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              for (const s of mateSeats(run))
                                if (!net.seatsHere.includes(s)) net.release(s);
                            }}
                          >
                            Не чекати
                          </button>
                        </div>
                      )}
                    <Suspense fallback={null}>
                      <RouteTree
                        key={`${run.seed}-${run.chapter}-${run.step}`}
                        run={run}
                        onEnter={(id) => {
                          audio.current!.unlock();
                          setNotice('');
                          setRun(enterNode(run, meta, id));
                        }}
                        vote={
                          voting && net
                            ? {
                                mine: ballot?.votes[0] ?? null,
                                mates: matesOf(ballot, 0, (s) => net.nameOf(s)),
                                done: ballot?.done,
                                onVote: (col) => {
                                  audio.current!.unlock();
                                  net.voteHost(col);
                                },
                              }
                            : undefined
                        }
                      />
                    </Suspense>
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
                        ? run.coop
                          ? 'У скрині знахідка для кожного будинку: кожен бере зі свого ряду.'
                          : run.loot.length > 1
                            ? 'Подвійне дно: у скрині дві знахідки, забери одну.'
                            : 'У скрині один випадковий предмет.'
                        : run.coop
                          ? 'У кожного будинку своя полиця: кожен бере по одному предмету.'
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
                    {run.coop && (
                      <div
                        className={`reward-owner host${run.picked?.[0] ? ' done' : ''}`}
                      >
                        <b>Для тебе</b>
                        {run.picked?.[0] ? (
                          <span className="took">
                            <Check size={14} /> взяв:{' '}
                            {takenText(run.picked[0])}
                          </span>
                        ) : (
                          <span>обери один</span>
                        )}
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
                              setMeta((m) => ({
                                ...m,
                                seen: [...new Set([...m.seen, loot.id])],
                              }));
                              offerPlace(next, run.nextFurnitureId);
                            }}
                          />
                        ),
                      )}
                    </div>
                    {run.coop &&
                      mateSeats(run).map((seat) => {
                        const name = houseName(seat),
                          taken = run.picked?.[seat],
                          row = run.mateLoots?.[seat - 1] ?? [],
                          // A player who is here chooses for their own house.
                          theirs =
                            livePartner && !!net?.seatsHere.includes(seat);
                        return (
                          <Fragment key={seat}>
                            <div
                              className={`reward-owner mate${taken ? ' done' : ''}`}
                            >
                              <b>Для {name}</b>
                              {taken ? (
                                <span className="took">
                                  <Check size={14} /> взяв(ла): {takenText(taken)}
                                </span>
                              ) : (
                                <span>обери один</span>
                              )}
                            </div>
                            <div className="reward-cards">
                              {row.map((loot, i) => {
                                if (loot.kind === 'furniture') {
                                  const room =
                                    (run.mates?.[seat - 1]?.furniture.length ??
                                      0) < 30;
                                  return (
                                    <FurnitureCard
                                      key={'mf' + loot.id}
                                      id={loot.id}
                                      disabled={!room || theirs}
                                      onClick={() => giveFurnitureToMate(i, seat)}
                                      footer={
                                        theirs
                                          ? `Обирає ${name}`
                                          : room
                                            ? `Віддати: ${name}`
                                            : 'Запас меблів повний'
                                      }
                                    />
                                  );
                                }
                                const fits =
                                  giveMate(run, meta, loot.id, seat) !== run;
                                return (
                                  <ItemCard
                                    key={'m' + loot.id}
                                    item={ITEM_BY_ID[loot.id]}
                                    disabled={!fits || theirs}
                                    onClick={() =>
                                      giveToMate(loot.id, 'reward', i, seat)
                                    }
                                    footer={
                                      theirs ? (
                                        <span>Обирає {name}</span>
                                      ) : fits ? (
                                        <>
                                          <span>Віддати: {name}</span>
                                          <Plus size={18} />
                                        </>
                                      ) : (
                                        <span>Немає місця</span>
                                      )
                                    }
                                  />
                                );
                              })}
                            </div>
                            {theirs && run.picked?.[0] && !taken && row.length > 0 && (
                              <button
                                className="text-button"
                                onClick={() => setRun(settleReward(run, seat))}
                              >
                                {name} не обирає: пропустити його ряд{' '}
                                <ArrowRight size={16} />
                              </button>
                            )}
                          </Fragment>
                        );
                      })}
                    <button
                      className="text-button"
                      onClick={() => {
                        const pay = earned(run, 10);
                        setRun(nextNode({ ...run, coins: run.coins + pay }));
                        ping(`Лут продано. +${pay} монет.`);
                      }}
                    >
                      Продати знахідки за {earned(run, 10)} монет{' '}
                      <ArrowRight size={16} />
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
                    {run.coop && !livePartner && (
                      <div className="shop-owner">
                        <span>Купувати для:</span>
                        <button
                          className={`coop-switch${buyFor === 'host' ? ' active' : ''}`}
                          aria-pressed={buyFor === 'host'}
                          onClick={() => setBuyFor('host')}
                        >
                          Тебе
                        </button>
                        <button
                          className={`coop-switch${buyFor === 'mate' ? ' active' : ''}`}
                          aria-pressed={buyFor === 'mate'}
                          onClick={() => setBuyFor('mate')}
                        >
                          {mateName}
                        </button>
                        <span className="till">Каса спільна</span>
                      </div>
                    )}
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
                                <Check size={16} />{' '}
                                {run.coop
                                  ? (run.boughtBy?.[i] ?? 0) > 0
                                    ? `Купили: ${houseName(run.boughtBy![i])}`
                                    : 'Купили: ти'
                                  : 'Встановлено'}
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
                              run.coop ? (
                                (run.boughtBy?.[10 + i] ?? 0) > 0 ? (
                                  `Купили: ${houseName(run.boughtBy![10 + i])}`
                                ) : (
                                  'Купили: ти'
                                )
                              ) : (
                                'Придбано'
                              )
                            ) : (
                              <Currency amount={furniturePrice(run, id)} />
                            )
                          }
                          onClick={() =>
                            buyFurnitureFor(
                              id,
                              run.coop && !livePartner && buyFor === 'mate'
                                ? 'mate'
                                : 'host',
                            )
                          }
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
                {run.page === 'council' && (
                  <CouncilPage
                    key={`${run.seed}-${run.chapter}-${run.loop ?? 0}`}
                    run={run}
                    onChoose={(id) => setRun(choosePact(run, id))}
                    vote={
                      councilOpen && net
                        ? ballot && ballot.step === run.step
                          ? {
                              mine: ballot.votes[0],
                              mates: matesOf(ballot, 0, (s) => net.nameOf(s)),
                              done: ballot.done,
                              onVote: (col) => net.voteHost(col),
                            }
                          : {
                              mine: null,
                              mates: [],
                              note: 'Відкриваємо вибір…',
                              onVote: () => {},
                            }
                        : undefined
                    }
                  />
                )}
                {run.page === 'event' && (
                  <CampaignEventPanel
                    key={`${run.seed}-${run.chapter}-${run.step}`}
                    run={run}
                    meta={meta}
                    onChange={setRun}
                    names={
                      onlineRun && net?.role === 'host'
                        ? Array.from({ length: partySize(run) }, (_, s) =>
                            net.nameOf(s),
                          )
                        : ['Перший гравець', mateName || 'Другий гравець']
                    }
                    vote={
                      eventOpen && net
                        ? ballot && ballot.step === run.step
                          ? {
                              mine: ballot.votes[0],
                              mates: matesOf(ballot, 0, (s) => net.nameOf(s)),
                              options: ballot.options,
                              done: ballot.done,
                              onVote: (col) => net.voteHost(col),
                            }
                          : {
                              mine: null,
                              mates: [],
                              options: [],
                              note: 'Відкриваємо вибір…',
                              onVote: () => {},
                            }
                        : undefined
                    }
                  />
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
      {screen === 'guest' &&
        net?.role === 'guest' &&
        (guestFight ? (
          <Suspense
            fallback={<section className="battle-screen" aria-busy="true" />}
          >
            <Combat
              key={`${guestFight.sid}:${guestFight.mode}:${guestFight.n}`}
              run={guestFight.run}
              meta={meta}
              simMeta={guestFight.meta}
              startSid={guestFight.sid}
              startMode={guestFight.mode}
              startAway={guestFight.away}
              net={net}
              audio={audio.current!}
              hold={settingsOpen}
              onDone={(r) => {
                // The fight pays by what this player did in it.
                const pay = guestFightCores(
                  r.won,
                  r.boss,
                  Math.max(0, r.run.kills - guestFight.run.kills),
                );
                setGuestEarned({ fight: pay, raid: 0 });
                guestAdvance.current += pay;
                setMeta((m) =>
                  withMet({ ...m, cores: m.cores + pay }, r.met ?? []),
                );
                setGuestResult(r);
                setGuestFight(null);
              }}
              onExit={() => closeOnline()}
              onPauseChange={setCombatPaused}
              onSettings={() => setSettingsOpen(true)}
              onNetLost={() => setGuestFight(null)}
            />
          </Suspense>
        ) : (
          <GuestRoom
            session={net}
            meta={meta}
            result={guestResult}
            earned={guestEarned}
            onLeave={closeOnline}
          />
        ))}
      {screen === 'shop' && <DemoShop onBack={back} onOffer={setOffer} />}
      {screen === 'workshop' && (
        <Suspense fallback={null}>
          <Workshop
            onOffer={setOffer}
            meta={meta}
            onChange={setMeta}
            onBack={back}
            onMessage={ping}
          />
        </Suspense>
      )}
      {screen === 'codex' && <Gallery meta={meta} onBack={back} />}
      {screen === 'lore' && (
        <Suspense fallback={null}>
          <StoryLibrary meta={meta} onBack={back} onPlay={playScene} />
        </Suspense>
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
        heroName={nameOf(character)}
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
        open={mateHousing !== null && !!run?.coop}
        onOpenChange={(open) => {
          if (!open) setMateHousing(null);
        }}
      >
        <DialogContent className="game-modal housing-modal">
          <DialogTitle>
            Дім: {mateHousing !== null ? houseName(mateHousing) : ''} / Квартири
            й обладнання
          </DialogTitle>
          <DialogDescription>
            Будинок другого гравця. Монети спільні: добудова й ремонт беруться з
            одної каси.
          </DialogDescription>
          {run && mateHousing !== null && (
            <Residents
              key={mateHousing}
              run={mateRun(run, mateHousing)}
              meta={meta}
              onChange={(next) => setRun(withMateHouse(run, next, mateHousing))}
              onMetaChange={setMeta}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={placing !== null && !!run}
        onOpenChange={(open) => {
          if (!open) setPlacing(null);
        }}
      >
        <DialogContent className="game-modal">
          <DialogTitle>
            {run &&
              FURNITURE_BY_ID[
                run.furniture.find((f) => f.uid === placing)?.id ?? ''
              ]?.name}
          </DialogTitle>
          <DialogDescription>
            Обери місце всередині квартири мешканця. Меблі можна переставити
            потім у вікні «Квартири й обладнання».
          </DialogDescription>
          {run && placing !== null && (
            <FurniturePlacement
              run={run}
              uid={placing}
              onPlace={placeFurniture}
            />
          )}
          <button className="secondary" onClick={() => setPlacing(null)}>
            <Package size={18} /> Поставити пізніше
          </button>
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
          {result && (
            <p className="result-quip">
              {resultQuip(
                result.won,
                result.run.seed + result.run.kills + result.run.step,
              )}
            </p>
          )}
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
                        {!result.run.dailyRanked
                          ? `Тренування: рекорд дня не змінюється (${result.dayBest})`
                          : result.record
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
                      <Flame size={14} /> Складність {result.run.heat}
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
              {result.won && (
                <button
                  className="text-button small demo-offer-link"
                  onClick={() => {
                    setResult(null);
                    setOffer('coffee');
                  }}
                >
                  <Coffee size={16} /> Сподобалось? Пригости ОСББ кавою (демо)
                </button>
              )}
            </>
          )}
          <button className="primary" onClick={() => setResult(null)}>
            Головне меню <ArrowRight size={18} />
          </button>
        </DialogContent>
      </Dialog>
      <DemoOffer offer={offer} onClose={() => setOffer(null)} />
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
              <b>По мережі.</b> У Притулку «Хто грає?» → «По мережі»:
              господар створює кімнату й каже другові код із восьми символів, той
              вводить його в «Приєднатися». Господар веде рейд, гість у боях
              веде другий будинок і отримує ядра у свій профіль. Працює між ПК і
              телефонами; потрібні інтернет і однакова версія гри.
            </p>
            <p>
              <b>Вдвох.</b> У Притулку («Хто грає?» → «Вдвох тут») можна
              ввімкнути другого гравця на тому ж пристрої. Перший веде будинок
              (WASD, пробіл, E), другий — другий будинок на ногах зі стрілками
              (/ — ривок, . — вміння свого героя) або з другим геймпадом чи
              джойстиком на екрані. Якщо він упав, підведи будинок до нього й
              постій 2,5 с. Ворогів у такому рейді більше.
            </p>
            <p>
              <b>02 / Уникай шкоди.</b> Пробіл — ривок із коротким захистом. E —
              вміння героя: у кожного голови ОСББ своє. На телефоні використовуй
              кнопки праворуч.
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
              рівні складності — кожен додає правило й +10% ядер — і нескінченна
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
              href={APK_URL || asset('downloads/osbb.apk')}
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
      <Dialog
        open={abandon}
        onOpenChange={(open) => {
          setAbandon(open);
          if (!open) setHostAfter(false);
        }}
      >
        <DialogContent className="game-modal">
          <DialogTitle>Завершити цей рейд?</DialogTitle>
          <DialogDescription>
            {queued &&
              `Щоб почати ${MODE_NAMES[queued.mode]}, спершу треба завершити поточний рейд. `}
            {hostAfter &&
              'Кімната створюється для нового рейду, тож поточний спершу треба завершити. '}
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
              if (hostAfter) {
                setHostAfter(false);
                void hostOnline();
              }
              setAbandon(false);
            }}
          >
            {queued
              ? 'Завершити й почати'
              : hostAfter
                ? 'Завершити й створити кімнату'
                : 'Завершити й повернутися'}
          </button>
          <button
            className="secondary"
            onClick={() => {
              setHostAfter(false);
              setAbandon(false);
            }}
          >
            Залишитися в рейді
          </button>
        </DialogContent>
      </Dialog>
      {ready && !meta.tutorialDone && screen !== 'guest' && (
        <Suspense fallback={null}>
          <Tutorial
            step={meta.tutorialStep}
            onStep={(tutorialStep) => setMeta((m) => ({ ...m, tutorialStep }))}
            onFinish={() => setMeta((m) => ({ ...m, tutorialDone: true }))}
          />
        </Suspense>
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
            <Suspense fallback={null}>
              <CutscenePlayer
                progress={meta.sceneProgress}
                onAdvance={advance}
                onClose={() => closeScene()}
              />
            </Suspense>
          );
        })()}
      <CvdFilters />
      {rejoin && (
        <div className="net-note rejoin-note" role="status">
          <span>
            Повертаємось у кімнату {rejoin.room.code}… спроба {rejoin.tries + 1}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              saveGuestRoom(null);
              setSavedRoom(null);
              closeOnline();
            }}
          >
            Не повертатись
          </button>
        </div>
      )}
      {net && net.phase === 'connected' && (
        <ChatDock
          session={net}
          name={
            net.partner?.name || (net.role === 'host' ? 'Гість' : 'Господар')
          }
        />
      )}
    </main>
  );
}
