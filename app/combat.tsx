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
  Settings as SettingsIcon,
} from 'lucide-react';
import './features.css';
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
import { statsFor, type Meta, type Run } from '@/lib/game/model';
import { heroAbility, type HeroAbility } from '@/lib/game/heroes';
import { P2_CODES, P2_KEYS } from '@/lib/game/coop';
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
  const ability = heroAbility(run.character),
    AbilityIcon = ABILITY_ICONS[ability.id],
    coop = !!run.coop,
    partner = coop ? heroAbility(run.coop) : null,
    PartnerIcon = partner ? ABILITY_ICONS[partner.id] : null,
    partnerName = CHARACTERS.find((c) => c.id === run.coop)?.name ?? '';
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
    pointer = useRef<number | null>(null),
    joystick2 = useRef<HTMLDivElement>(null),
    pointer2 = useRef<number | null>(null);
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
      // While a boss is being presented any of these keys only skips it.
      const second = !!b.ally && P2_CODES.includes(e.code);
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
      b.stick2 = { x: 0, y: 0 };
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
      window.clearTimeout(tauntTimer);
      stopWaiting?.();
      stopVoice();
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
  function point2(e: React.PointerEvent) {
    if (pointer2.current !== e.pointerId) return;
    const r = joystick2.current!.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / 40,
      y = (e.clientY - r.top - r.height / 2) / 40;
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
    setStick2({ x: 0, y: 0 });
    if (engine.current) engine.current.stick2 = { x: 0, y: 0 };
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
        onPointerDown={() => engine.current?.skipIntro()}
        aria-label={
          coop
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
          {hud.ally && (
            <div className={`ally-bar${hud.ally.down ? ' down' : ''}`}>
              <div>
                <i style={{ background: partner?.color }}>2</i>
                <span>{partnerName}</span>
                <b>
                  {hud.ally.down
                    ? `${Math.round(hud.ally.revive * 100)}%`
                    : Math.ceil(hud.ally.hp)}
                </b>
              </div>
              <Meter
                value={hud.ally.down ? hud.ally.revive : hud.ally.hp}
                max={hud.ally.down ? 1 : hud.ally.max}
                label={
                  hud.ally.down
                    ? 'Підйом напарника'
                    : `Здоров’я: ${partnerName}`
                }
                color={hud.ally.down ? '#8acdb6' : partner?.color}
              />
            </div>
          )}
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
            ? coop
              ? 'Двоє: перший веде будинок (WASD), другий — сусід зі стрілками. Якщо сусід упав — підійди будинком, щоб підняти.'
              : 'Рухайся й збирай лут. Будинок стріляє сам.'
            : run.kind === 'boss'
              ? 'Стеж за червоними снарядами. Ривок захищає від шкоди.'
              : run.kind === 'miniboss'
                ? 'Знищ мінібоса. Виходь із позначених зон до удару; ривок захищає від шкоди.'
                : 'Розбий загін: три хвилі й ватажок. Рухайся — стрільці цілять на випередження.'}
        </div>
      )}
      <div className={`battle-controls${coop ? ' coop' : ''}`}>
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
        {coop && (
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
        {coop ? (
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
        {coop && partner && PartnerIcon ? (
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
              className="joystick second"
              ref={joystick2}
              onPointerDown={(e) => {
                if (pointer2.current !== null) return;
                pointer2.current = e.pointerId;
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
        </DialogContent>
      </Dialog>
    </section>
  );
}
