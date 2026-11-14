'use client';
import { campaignBoss } from '@/lib/game/encounters';
import { minibossFor } from '@/lib/game/minibosses';
import { minibossVariant } from '@/lib/game/model';
import { useState, useEffect, useRef } from 'react';
import {
  type LucideIcon,
  ChefHat,
  Coins,
  Crosshair,
  Hammer,
  Radio,
  ShieldPlus,
  Sprout,
  Wind,
  Play,
  Pause,
  Home,
  Heart,
  Zap,
  Footprints,
  Skull,
  LogOut,
  Settings as SettingsIcon,
} from 'lucide-react';
import './features.css';
import './mobile.css';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { NODE_INFO } from './route-tree';
import { RadioStrip } from './dialogue';
import { isSpeaking, onSpeaking, speak, stopVoice } from './voice';
import {
  BOSS_VOICE,
  bossQuote,
  combatBark,
  type SpeakerId,
} from '@/lib/game/story';
import {
  mateHero,
  mateRun,
  mateSeats,
  partySize,
  statsFor,
  type Meta,
  type Run,
} from '@/lib/game/model';
import { heroAbility, type HeroAbility } from '@/lib/game/heroes';
import { P2_CODES, P2_KEYS, SEAT_COLORS } from '@/lib/game/coop';
import {
  Lockstep,
  STALL_WARN,
  inputDelay,
  type ShareMode,
} from '@/lib/game/net';
import { FeedGroup, FightMux, MirrorClient } from '@/lib/game/mirror';
import type { NetSession } from '@/lib/game/session';
import { CHARACTERS } from '@/lib/game/data';
import {
  Battle,
  AudioEngine,
  type Hud,
  type BattleResult,
} from '@/lib/game/engine';
import { settleBattle } from './battle-end';
import { PerkDraft } from './perk-draft';
import type { PerkId } from '@/lib/game/upgrades';

import { Currency, Meter } from './hud-parts';

const ABILITY_ICONS: Record<HeroAbility['id'], LucideIcon> = {
  quake: Hammer,
  discharge: Zap,
  bloom: Sprout,
  audit: Coins,
  scald: ChefHat,
  volley: Crosshair,
  ward: ShieldPlus,
  express: Wind,
  jam: Radio,
};
// Online both ends stand still while the pick is made: it may take this long,
// then the first card is taken, so that nobody waits for ever.
const DRAFT_SECONDS = 12;
// A guest of the mirror who stays silent: the host takes its first card for it
// this many seconds after its own time is up (only the host simulates there).
const MIRROR_GRACE = 12;
const SECOND_HINT: Record<'dash' | 'pulse', string> = {
  dash: '/',
  pulse: '.',
};

export function Combat({
  run,
  meta,
  audio,
  hold,
  onDone,
  onExit,
  onPauseChange,
  onSettings,
  onAbandon,
  net,
  startSid,
  startMode,
  startAway,
  simMeta,
  onNetLost,
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
  // Ends the whole raid from the pause menu (asks first); a guest has no raid.
  onAbandon?: () => void;
  // Online co-op: the room, the id of this fight (the guest gets it from the
  // host's message, the host asks for one), the profile the host simulates
  // with, and what to do when the fight cannot go on for the guest.
  net?: NetSession;
  startSid?: number;
  // How the host shares this fight (the guest learns it from the host).
  startMode?: ShareMode;
  // The seats whose guests were not here when the host opened the fight.
  startAway?: number[];
  simMeta?: Meta;
  onNetLost?: () => void;
}) {
  const ability = heroAbility(run.character),
    AbilityIcon = ABILITY_ICONS[ability.id],
    coop = !!run.coop,
    online = !!net,
    // Two players on this very device (not a partner on another one).
    duo = coop && !online,
    partner = coop ? heroAbility(run.coop) : null,
    PartnerIcon = partner ? ABILITY_ICONS[partner.id] : null,
    partnerName = CHARACTERS.find((c) => c.id === run.coop)?.name ?? '';
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onNetLostRef = useRef(onNetLost);
  onNetLostRef.current = onNetLost;
  const onPauseRef = useRef(onPauseChange),
    holdRef = useRef(hold);
  useEffect(() => {
    onPauseRef.current = onPauseChange;
    holdRef.current = hold;
  });
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<Battle | null>(null),
    joystick = useRef<HTMLDivElement>(null),
    pointer = useRef<number | null>(null),
    joystick2 = useRef<HTMLDivElement>(null),
    pointer2 = useRef<number | null>(null),
    screen = useRef<HTMLElement>(null),
    // A floating stick: a finger put down anywhere on the arena becomes the
    // centre of the stick (null: the stick in the corner is used).
    centre = useRef<{ x: number; y: number } | null>(null),
    centre2 = useRef<{ x: number; y: number } | null>(null);
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
    [stick2, setStick2] = useState({ x: 0, y: 0 }),
    // Where a floating stick is drawn (in the fight screen's own pixels).
    [float1, setFloat1] = useState<{ x: number; y: number } | null>(null),
    [float2, setFloat2] = useState<{ x: number; y: number } | null>(null),
    // The open drafts of a level-up: the first house's and, in co-op, the
    // second one's (null once taken). Each player takes the perk of their own.
    [draft, setDraft] = useState<{
      offers: PerkId[] | null;
      mateOffers: PerkId[] | null;
      // Every partner's open offers by seat - 1 (null once taken).
      drafts: (PerkId[] | null)[];
      level: number;
    } | null>(null),
    // A guest of the mirror has sent its pick (the host's answer is on its way).
    [sent, setSent] = useState(''),
    [bark, setBark] = useState<{
      who: SpeakerId;
      text: string;
      key: number;
    } | null>(null),
    // Online: the id of this fight (null while the host waits for the guest
    // to build it; 0 means it is played without a partner), and how it is.
    [sid, setSid] = useState<number | null>(
      net ? (net.role === 'guest' ? (startSid ?? 0) : null) : 0,
    ),
    [netNote, setNetNote] = useState<'' | 'wait' | 'lost' | 'drift'>('');
  const alive = useRef(true),
    opened = useRef(false);
  const [draftLeft, setDraftLeft] = useState(DRAFT_SECONDS);
  useEffect(() => {
    // The host asks the guest to build the very same fight and waits for it.
    alive.current = true;
    if (net && net.role === 'host' && !opened.current) {
      opened.current = true;
      // The guests that are not here (the raid keeps their seats) sit this
      // fight out.
      const away = mateSeats(run).filter((s) => !net.seatsHere.includes(s));
      void net.open(run, meta, undefined, away).then((id) => {
        if (alive.current) setSid(id ?? 0);
      });
    }
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!net) return;
    const timer = window.setInterval(() => {
      const b = engine.current;
      const s = b?.sync ?? b?.feed ?? b?.client;
      if (!s) return;
      const stalled = 'stalled' in s ? s.stalled : 0;
      setNetNote(
        'desync' in s && s.desync
          ? 'drift'
          : s.closed
            ? 'lost'
            : stalled > STALL_WARN
              ? 'wait'
              : '',
      );
    }, 500);
    return () => window.clearInterval(timer);
  }, [net]);
  useEffect(() => {
    if (sid === null) return;
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
    const boss = run.kind === 'boss' || run.kind === 'miniboss',
      taunt = boss ? bossQuote(run, meta) : '';
    let tauntTimer = 0,
      stopWaiting: (() => void) | null = null;
    if (boss) {
      // The machine speaks first; the crew answers once it has finished.
      tauntTimer = window.setTimeout(() => speak(BOSS_VOICE, taunt), 1500);
      startTimer = window.setTimeout(() => {
        if (!isSpeaking()) return say('start');
        stopWaiting = onSpeaking((on) => {
          if (on) return;
          stopWaiting?.();
          stopWaiting = null;
          say('start');
        });
      }, 3600);
    }
    // A fight with partners on other devices runs in lockstep, or in a mirror;
    // the guests that could not be reached sit it out, their houses standing
    // still (the host plays alone if none could).
    const linked = !!net && sid > 0 && !!net.link;
    const mode: ShareMode =
      net?.role === 'host' ? net.mode : (startMode ?? 'sync');
    const aim = () => engine.current?.localAim() ?? { x: 0, y: 0 };
    const seats = partySize(run);
    const absent =
      net?.role === 'host'
        ? mateSeats(run).filter((s) => !linked || !net.seatsHere.includes(s))
        : (startAway ?? []);
    const wire = net?.role === 'host' ? net.hub : net?.link;
    const sync =
      linked && mode === 'sync'
        ? new Lockstep(
            net!.role === 'host' ? 0 : net!.seat,
            sid,
            wire!,
            aim,
            inputDelay(seats),
            seats,
          )
        : undefined;
    for (const s of absent) sync?.setSeat(s, 'away');
    // The mirror: the host alone simulates and streams; the guests only draw. In
    // a lockstep fight the group is empty until a guest who left comes back into
    // it, or drifts from it, and is fed as a mirror from then on.
    const feed =
      linked && net!.role === 'host'
        ? new FeedGroup(
            sid,
            net!.hub,
            mode === 'host'
              ? mateSeats(run).filter((s) => !absent.includes(s))
              : [],
          )
        : undefined;
    const client =
      linked && mode === 'host' && net!.role === 'guest'
        ? new MirrorClient(sid, net!.link!, aim)
        : undefined;
    const b = new Battle(
      canvas.current,
      run,
      simMeta ?? meta,
      audio,
      setHud,
      (r) => {
        // The guest of a mirror learns how the fight ended from the host.
        feed?.finish(b, r);
        onDoneRef.current(r);
      },
      {
        sync,
        feed,
        client,
        seat: net?.role === 'guest' ? net.seat : 0,
        away: absent,
        onPerkTaken: (who) =>
          setDraft((d) => {
            if (!d) return d;
            const drafts = d.drafts.map((x, i) => (i === who - 1 ? null : x));
            const next =
              who === 0
                ? { ...d, offers: null }
                : {
                    ...d,
                    drafts,
                    mateOffers: who === 1 ? null : d.mateOffers,
                  };
            return next.offers || next.drafts.some(Boolean) ? next : null;
          }),
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
        onPerkDraft: (offers, level, mateOffers, drafts) => {
          audio.play('rare');
          setDraft({
            offers: offers.length ? offers : null,
            mateOffers,
            drafts: drafts ?? [mateOffers],
            level,
          });
        },
        onPause: () => {
          // Settings hold the arena: Start must not flip the pause under them.
          if (!settle() && !holdRef.current) setPaused((p) => !p);
        },
      },
    );
    // Over each house the name of its player.
    if (net) for (const a of b.allies) a.name = net.nameOf(a.seat);
    const settle = () => settleBattle(b);
    engine.current = b;
    if (import.meta.env.DEV) {
      // For scripts/net-e2e.cjs: the fight and a fingerprint every 60 steps.
      const w = window as unknown as {
        __battle?: Battle;
        __rec?: Record<number, number>;
      };
      w.__battle = b;
      (w as unknown as { __link?: unknown }).__link = net?.link;
      w.__rec = {};
      const stepOnce = b.update.bind(b);
      let n = 0;
      b.update = (dt: number) => {
        stepOnce(dt);
        if (++n % 60 === 0) w.__rec![n] = b.stateHash();
      };
    }
    const link = sync ?? feed ?? client;
    // What the room's session hears of this fight: for a host, the lockstep and
    // the mirror feeds together (a seat may pass from one to the other).
    const mux =
      net?.role === 'host' && feed ? new FightMux(sid, sync ?? null, feed) : null;
    if (link && net) {
      net.attach(mux ?? link);
      if (sync)
        sync.onDesync = (seat) => {
          // A guest whose fight drifted is taken back as a mirror: the host
          // plays on and the guest sees the host's fight instead of its own.
          if (net.role === 'host' && seat && feed && mux) {
            sync.setSeat(seat, 'proxy');
            feed.add(seat);
            mux.restart(seat);
            if (net.restartFor(seat, absent)) return;
            sync.setSeat(seat, 'away');
            feed.seatLost(seat);
          }
          setNetNote('drift');
        };
      // A guest who left comes back into the fight that is on: it is given the
      // fight again, as a mirror, and its seat is played from what it sends.
      if (net.role === 'host' && feed && mux)
        net.onReturn = (seat) => {
          if (b.ended || !mateSeats(run).includes(seat)) return;
          sync?.setSeat(seat, 'proxy');
          feed.add(seat);
          mux.restart(seat);
          if (!net.restartFor(seat, absent)) {
            sync?.setSeat(seat, 'away');
            feed.seatLost(seat);
          }
        };
      link.onClosed = () => setNetNote('lost');
      link.onOver = () => {
        if (!b.ended && net.role === 'guest') onNetLostRef.current?.();
      };
      if (client)
        client.onEnd = (result) => {
          // The host's fight is over: the guest shows how it ended.
          window.setTimeout(
            () => onDoneRef.current(result as BattleResult),
            900,
          );
        };
      // The guest says it listens, then both send their first frames.
      if (net.role === 'guest') net.ready(sid);
      sync?.begin();
    }
    b.start();
    const keys = (e: KeyboardEvent) => {
      // Sliders and switches in the settings dialog need the arrow keys, and
      // the chat field the letters.
      if (holdRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      // While a boss is being presented any of these keys only skips it.
      const second = b.localDuo && P2_CODES.includes(e.code);
      if (
        (['Space', 'KeyE', 'Enter'].includes(e.code) || second) &&
        b.skipIntro()
      ) {
        e.preventDefault();
        return;
      }
      if (second) {
        // The second player's keys: the arrows move the partner, the others act.
        e.preventDefault();
        if ((P2_KEYS.dash as readonly string[]).includes(e.code)) b.allyDash();
        else if ((P2_KEYS.pulse as readonly string[]).includes(e.code))
          b.allyPulse();
        else b.keys.add(e.code);
      } else if (
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
        if (e.code === 'Space') b.localDash();
        else if (e.code === 'KeyE') b.localPulse();
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
    const blur = (hidden = false) => {
      b.keys.clear();
      b.stick = { x: 0, y: 0 };
      b.stick2 = { x: 0, y: 0 };
      // With a partner online, clicking away must not stop their fight: only
      // a hidden page does (it cannot draw anyway).
      if (b.sync && !hidden) return;
      // A backgrounded app may be killed: a decided battle is saved now.
      if (!settle()) setPaused(true);
    };
    const visibility = () => {
      if (document.hidden) blur(true);
    };
    window.addEventListener('keydown', keys);
    window.addEventListener('keyup', up);
    const onBlur = () => blur();
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(startTimer);
      window.clearTimeout(tauntTimer);
      stopWaiting?.();
      stopVoice();
      b.stop();
      if (link && net) {
        // A fight left half way tells the other end; a finished one ends there
        // by itself, a few steps later (or by the host's own message).
        if (!b.ended) {
          if (sync) sync.finish();
          else feed?.leave();
        }
        net.detach(mux ?? link);
        if (net.role === 'host') {
          net.endFight();
          net.onReturn = null;
        }
      }
      window.removeEventListener('keydown', keys);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('osbb-back', back);
    };
  }, [sid]);
  useEffect(() => {
    onPauseRef.current(paused);
    if (engine.current) {
      engine.current.paused = paused || hold;
      if (paused || hold) {
        engine.current.keys.clear();
        engine.current.stick = { x: 0, y: 0 };
        engine.current.stick2 = { x: 0, y: 0 };
        setStick({ x: 0, y: 0 });
        setStick2({ x: 0, y: 0 });
        pointer.current = null;
        pointer2.current = null;
      }
    }
  }, [paused, hold]);
  useEffect(() => () => onPauseRef.current(false), []);
  useEffect(() => {
    engine.current?.setSettings(meta.settings);
  }, [meta.settings]);
  function middle(el: HTMLElement | null) {
    const r = el!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function point(e: React.PointerEvent) {
    if (pointer.current !== e.pointerId) return;
    const c = centre.current ?? middle(joystick.current);
    let x = (e.clientX - c.x) / 40,
      y = (e.clientY - c.y) / 40;
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
    centre.current = null;
    setFloat1(null);
    setStick({ x: 0, y: 0 });
    if (engine.current) engine.current.stick = { x: 0, y: 0 };
  }
  function point2(e: React.PointerEvent) {
    if (pointer2.current !== e.pointerId) return;
    const c = centre2.current ?? middle(joystick2.current);
    let x = (e.clientX - c.x) / 40,
      y = (e.clientY - c.y) / 40;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    setStick2({ x: x * 32, y: y * 32 });
    if (engine.current) engine.current.stick2 = { x, y };
  }
  function release2() {
    pointer2.current = null;
    centre2.current = null;
    setFloat2(null);
    setStick2({ x: 0, y: 0 });
    if (engine.current) engine.current.stick2 = { x: 0, y: 0 };
  }
  function grab(e: React.PointerEvent<HTMLCanvasElement>) {
    engine.current?.skipIntro();
    if (e.pointerType === 'mouse') return;
    const box = screen.current!.getBoundingClientRect();
    const at = { x: e.clientX - box.left, y: e.clientY - box.top };
    const second = duo && e.clientX > box.left + box.width / 2;
    if (second ? pointer2.current !== null : pointer.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (second) {
      pointer2.current = e.pointerId;
      centre2.current = { x: e.clientX, y: e.clientY };
      setFloat2(at);
      point2(e);
    } else {
      pointer.current = e.pointerId;
      centre.current = { x: e.clientX, y: e.clientY };
      setFloat1(at);
      point(e);
    }
  }
  function letGo(e: React.PointerEvent) {
    if (pointer.current === e.pointerId) release();
    if (pointer2.current === e.pointerId) release2();
  }
  // The fight is shared with a partner who is really there.
  const shared = !!net && sid !== null && sid > 0 && !!net.link;
  // Which draft this screen answers. Alone and two on one screen: the first
  // house's, then the second one's. Online: the host its own house, the guest
  // its own (a guest of the mirror reads the drafts from the host's numbers).
  const mirrorGuest = shared && net?.role === 'guest' && startMode === 'host';
  const hostOffers = mirrorGuest
    ? (hud.hostDraft ?? null)
    : (draft?.offers ?? null);
  // The partners' offers by seat - 1 (a guest of the mirror reads them from the
  // host's numbers).
  const drafts: (PerkId[] | null)[] = mirrorGuest
    ? (hud.drafts ?? [hud.mateDraft ?? null])
    : (draft?.drafts ?? [draft?.mateOffers ?? null]);
  const mySeat = net?.role === 'guest' ? net.seat : 1;
  const mateOffers = drafts[(shared ? mySeat : 1) - 1] ?? null;
  const draftLevel = draft?.level ?? hud.level;
  const mateKey = mateOffers ? `${draftLevel}:${mateOffers.join()}` : '';
  const firstDraft = drafts.findIndex(Boolean);
  const mine: { offers: PerkId[]; who: number } | null = !shared
    ? hostOffers
      ? { offers: hostOffers, who: 0 }
      : firstDraft >= 0
        ? { offers: drafts[firstDraft]!, who: firstDraft + 1 }
        : null
    : net?.role === 'guest'
      ? mateOffers && sent !== mateKey
        ? { offers: mateOffers, who: mySeat }
        : null
      : hostOffers
        ? { offers: hostOffers, who: 0 }
        : null;
  const drafting = !!draft || !!hud.drafting;
  const partnerPicks = shared && drafting && !mine;
  const mineRef = useRef(mine);
  useEffect(() => {
    mineRef.current = mine;
  });
  function takePerk(id: PerkId, who: number) {
    audio.play('ui');
    const b = engine.current;
    if (!b) return;
    if (b.client) {
      // The guest of a mirror asks; the host's fight takes it.
      b.client.choose(id);
      setSent(mateKey);
      return;
    }
    // Online both ends take the pick at the same moment.
    b.sync?.choose(id);
    if (who === 0) b.choosePerk(id);
    else b.chooseMatePerk(id, who);
  }
  const draftKey = `${draftLevel}`;
  useEffect(() => {
    if (!shared || !drafting || paused || hold) {
      setDraftLeft(DRAFT_SECONDS);
      return;
    }
    const start = performance.now();
    setDraftLeft(DRAFT_SECONDS);
    let tookMine = false;
    const timer = window.setInterval(() => {
      const left = DRAFT_SECONDS - (performance.now() - start) / 1000;
      setDraftLeft(Math.max(0, Math.ceil(left)));
      if (left > 0) return;
      // Time is up: this player's card is taken for them.
      const own = mineRef.current;
      if (own && !tookMine) {
        tookMine = true;
        takePerk(own.offers[0], own.who);
      }
      // A silent guest of the mirror: the host takes the first card for it.
      const b = engine.current;
      if (b?.feed && left <= -MIRROR_GRACE)
        for (const a of b.allies)
          if (a.draft) b.chooseMatePerk(a.draft[0], a.seat);
      if (!b?.choosing) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [shared, drafting, paused, hold, draftKey]);
  const remaining = Math.max(0, Math.ceil(hud.duration - hud.time));
  return (
    <section className={`battle-screen${duo ? ' duo' : ''}`} ref={screen}>
      {partnerPicks && !paused && !hold && (
        <div className="net-note" role="status">
          {run.coop && partySize(run) > 2 ? 'Інші обирають' : 'Друг обирає'}{' '}
          покращення для свого будинку… ще {draftLeft} с
        </div>
      )}
      {mine && !paused && !hold && (
        <PerkDraft
          key={`${mine.who}:${draftLevel}`}
          run={
            mine.who > 0
              ? mateRun(engine.current?.run ?? run, mine.who)
              : (engine.current?.run ?? run)
          }
          offers={mine.offers}
          level={draftLevel}
          owner={
            !run.coop
              ? undefined
              : shared
                ? 'Для твого будинку'
                : `Гравець ${mine.who + 1} · ${CHARACTERS.find((c) => c.id === (mine.who > 0 ? mateHero(run, mine.who) : run.character))?.name ?? ''}: для свого будинку`
          }
          waiting={shared ? draftLeft : undefined}
          onPick={(id) => takePerk(id, mine.who)}
        />
      )}
      {sid !== null &&
        !netNote &&
        net &&
        (hud.allies ?? []).some((a) => a.away) && (
          <div className="net-note" role="status">
            <span>
              {(hud.allies ?? [])
                .filter((a) => a.away)
                .map((a) => net.nameOf(a.seat))
                .join(', ')}{' '}
              відійшов: будинок стоїть і чекає. Гравець може повернутися в бій.
            </span>
          </div>
        )}
      {(sid === null || netNote) && (
        <div className="net-note" role="status">
          {sid === null ? (
            <span>Очікуємо, поки напарники збудують бій…</span>
          ) : netNote === 'wait' ? (
            <span>
              Чекаємо напарника… Зв’язок повільний або він призупинив гру.
            </span>
          ) : (
            <>
              <span>
                {netNote === 'drift'
                  ? 'Бій розійшовся між двома пристроями й зупинений.'
                  : 'Напарник відключився.'}
              </span>
              <button
                className="secondary"
                onClick={() => {
                  if (net?.role === 'host') {
                    engine.current?.dropPartner();
                    setNetNote('');
                  } else onNetLost?.();
                }}
              >
                {net?.role === 'host' ? 'Продовжити без напарника' : 'Вийти'}
              </button>
            </>
          )}
        </div>
      )}
      <canvas
        ref={canvas}
        className="battle-canvas"
        onPointerDown={grab}
        onPointerMove={(e) => {
          point(e);
          point2(e);
        }}
        onPointerUp={letGo}
        onPointerCancel={letGo}
        onLostPointerCapture={letGo}
        aria-label={
          online
            ? `Бойова арена, гра по мережі. Рух WASD або стрілками, пробіл — ривок, E — вміння: ${ability.name}.`
            : coop
              ? `Бойова арена, двоє гравців. Перший: рух WASD, пробіл — ривок, E — вміння: ${ability.name}. Другий: рух стрілками, скісна риска — ривок, крапка — вміння: ${partner?.name}.`
              : `Бойова арена. Рух WASD або стрілками, пробіл — ривок, E — вміння героя: ${ability.name}.`
        }
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
          {(
            hud.allies ??
            (hud.ally
              ? [{ ...hud.ally, seat: 1, hero: run.coop, away: false }]
              : [])
          ).map((ally, i, all) => {
            // Names and colours by seat: the first partner is the one of the
            // room; with more players each has the colour of their seat.
            const name = net
              ? net.nameOf(ally.seat)
              : i === 0
                ? partnerName
                : (CHARACTERS.find((c) => c.id === ally.hero)?.name ?? '');
            const color =
              all.length > 1
                ? SEAT_COLORS[ally.seat]
                : heroAbility(ally.hero).color;
            return (
              <div
                key={ally.seat}
                className={`ally-bar${ally.down ? ' down' : ''}${ally.away ? ' away' : ''}`}
              >
                <div>
                  <i style={{ background: color }}>{ally.seat + 1}</i>
                  <span>{name}</span>
                  <b>
                    {ally.away
                      ? 'відійшов'
                      : ally.down
                        ? `${Math.round(ally.revive * 100)}%`
                        : Math.ceil(ally.hp)}
                  </b>
                </div>
                <Meter
                  value={ally.down ? ally.revive : ally.hp}
                  max={ally.down ? 1 : ally.max}
                  label={ally.down ? `Підйом: ${name}` : `Здоров’я: ${name}`}
                  color={ally.down ? '#8acdb6' : color}
                />
              </div>
            );
          })}
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
            ? online
              ? net?.role === 'host'
                ? 'Онлайн: ти ведеш будинок, напарник — другий будинок з іншого пристрою. Якщо він упав — підійди будинком, щоб підняти.'
                : 'Онлайн: ти ведеш другий будинок разом із господарем. Якщо впав — нехай він підійде будинком, щоб підняти.'
              : coop
                ? 'Двоє: перший веде будинок (WASD), другий — другий будинок зі стрілками. Якщо він упав — підійди будинком, щоб підняти.'
                : 'Рухайся й збирай лут. Будинок стріляє сам.'
            : run.kind === 'boss'
              ? 'Стеж за червоними снарядами. Ривок захищає від шкоди.'
              : run.kind === 'miniboss'
                ? 'Знищ мінібоса. Виходь із позначених зон до удару; ривок захищає від шкоди.'
                : 'Розбий загін: три хвилі й ватажок. Рухайся — стрільці цілять на випередження.'}
        </div>
      )}
      {float1 && (
        <div
          className="joystick floating"
          style={{ left: float1.x, top: float1.y }}
          aria-hidden="true"
        >
          <div className="stick-cross" />
          <div
            className="stick-knob"
            style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
          />
        </div>
      )}
      {float2 && (
        <div
          className="joystick floating second"
          style={{ left: float2.x, top: float2.y }}
          aria-hidden="true"
        >
          <div className="stick-cross" />
          <div
            className="stick-knob"
            style={{ transform: `translate(${stick2.x}px,${stick2.y}px)` }}
          />
        </div>
      )}
      <div className={`battle-controls${duo ? ' coop' : ''}`}>
        <div
          className={`joystick${float1 ? ' away' : ''}`}
          ref={joystick}
          onPointerDown={(e) => {
            if (pointer.current !== null) return;
            pointer.current = e.pointerId;
            centre.current = null;
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
        {duo && (
          <div className="ability-row first">
            <button
              className="ability"
              onClick={() => engine.current?.dash()}
              disabled={hud.dash > 0}
              aria-label="Ривок першого гравця"
            >
              <Footprints size={24} />
              <b>{hud.dash > 0 ? hud.dash.toFixed(1) : 'РИВОК'}</b>
              <small>Пробіл</small>
            </button>
            <button
              className="ability pulse"
              onClick={() => engine.current?.pulse()}
              disabled={hud.pulse > 0}
              aria-label={`Перший: ${ability.name}`}
              title={ability.text}
            >
              <AbilityIcon size={24} />
              <b>{hud.pulse > 0 ? hud.pulse.toFixed(1) : ability.button}</b>
              <small>E</small>
            </button>
          </div>
        )}
        {duo ? (
          <div className="keyboard-hint coop-hint">
            <span>
              <i className="who">1</i>
              <kbd>W A S D</kbd>
              <kbd>SPACE</kbd>
              <kbd>E</kbd>
            </span>
            <span>
              <i className="who two">2</i>
              <kbd>← ↑ ↓ →</kbd>
              <kbd>{SECOND_HINT.dash}</kbd>
              <kbd>{SECOND_HINT.pulse}</kbd>
            </span>
          </div>
        ) : (
          <div className="keyboard-hint">
            <kbd>W A S D</kbd>
            <span>рух</span>
            <kbd>SPACE</kbd>
            <span>ривок</span>
            <kbd>E</kbd>
            <span>{ability.name.toLowerCase()}</span>
          </div>
        )}
        {duo && partner && PartnerIcon ? (
          <>
            <div className="ability-row second">
              <button
                className="ability pulse"
                onClick={() => engine.current?.allyPulse()}
                disabled={!!hud.ally && (hud.ally.pulse > 0 || hud.ally.down)}
                aria-label={`Другий: ${partner.name}`}
                title={partner.text}
              >
                <PartnerIcon size={24} />
                <b>
                  {hud.ally && hud.ally.pulse > 0
                    ? hud.ally.pulse.toFixed(1)
                    : partner.button}
                </b>
                <small>.</small>
              </button>
              <button
                className="ability"
                onClick={() => engine.current?.allyDash()}
                disabled={!!hud.ally && (hud.ally.dash > 0 || hud.ally.down)}
                aria-label="Ривок другого гравця"
              >
                <Footprints size={24} />
                <b>
                  {hud.ally && hud.ally.dash > 0
                    ? hud.ally.dash.toFixed(1)
                    : 'РИВОК'}
                </b>
                <small>/</small>
              </button>
            </div>
            <div
              className={`joystick second${float2 ? ' away' : ''}`}
              ref={joystick2}
              onPointerDown={(e) => {
                if (pointer2.current !== null) return;
                pointer2.current = e.pointerId;
                centre2.current = null;
                e.currentTarget.setPointerCapture(e.pointerId);
                point2(e);
              }}
              onPointerMove={point2}
              onPointerUp={release2}
              onPointerCancel={release2}
              onLostPointerCapture={release2}
            >
              <div className="stick-cross" />
              <div
                className="stick-knob"
                style={{ transform: `translate(${stick2.x}px,${stick2.y}px)` }}
              />
              <span>РУХ 2</span>
            </div>
          </>
        ) : (
          <div className="ability-row">
            <button
              className="ability"
              onClick={() => engine.current?.localDash()}
              disabled={hud.dash > 0}
              aria-label="Ривок"
            >
              <Footprints size={24} />
              <b>{hud.dash > 0 ? hud.dash.toFixed(1) : 'РИВОК'}</b>
              <small>Пробіл</small>
            </button>
            <button
              className="ability pulse"
              onClick={() => engine.current?.localPulse()}
              disabled={hud.pulse > 0}
              aria-label={ability.name}
              title={ability.text}
            >
              <AbilityIcon size={24} />
              <b>{hud.pulse > 0 ? hud.pulse.toFixed(1) : ability.button}</b>
              <small>E</small>
            </button>
          </div>
        )}
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
          {onAbandon && (
            <button className="secondary" onClick={onAbandon}>
              <LogOut size={18} /> Завершити рейд
            </button>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
