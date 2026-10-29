// Dialogue scenes with portraits (lib/game/story.ts): the story of «Справа
// 04:17». Space / Enter / → advance, ← goes back, Esc skips; touch and the
// gamepad menu press the same buttons.
import { asset } from '@/lib/game/assets';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bot, FastForward, Lock } from 'lucide-react';
import {
  CAPTAINS,
  SPEAKERS,
  fillLine,
  type Choice,
  type Line,
  type Scene,
  type SpeakerId,
} from '@/lib/game/story';
import {
  STORY_YEAR,
  SCENE_IMAGE_BY_ART,
  shelterBackdrop,
} from '@/lib/game/cutscenes';
import type { Meta } from '@/lib/game/model';
import { voiceKeyFor } from '@/lib/game/voice';
import { Portrait } from './residents';
import { SceneArt } from './cutscenes';
import { speak, stopVoice } from './voice';
import './dialogue.css';

const CITY_ART = 6;

export function SpeakerPortrait({
  who,
  captain,
  size = 72,
}: {
  who: SpeakerId;
  captain: string;
  size?: number;
}) {
  const id = who === 'captain' ? captain : who;
  const speaker = SPEAKERS[id as keyof typeof SPEAKERS];
  let inner: React.ReactNode = null;
  if (who === 'narrator') return null;
  if (who === 'captain' || speaker?.portrait === 'resident')
    inner = <Portrait id={id} />;
  else if (speaker?.portrait === 'galyna')
    inner = <img src={asset('art/portrait-galyna.webp')} alt="" />;
  else if (speaker?.portrait === 'intercom')
    inner = <img src={asset('art/portrait-intercom.webp')} alt="" />;
  else if (speaker?.portrait === 'svitanok')
    inner = <img src={asset('art/portrait-svitanok.webp')} alt="" />;
  else
    inner = (
      <span className="portrait-icon">
        <Bot size={size * 0.55} aria-hidden="true" />
      </span>
    );
  return (
    <span
      className={`speaker-portrait speaker-${who}`}
      style={{
        width: size,
        height: size,
        borderColor: speaker?.color ?? '#aee6cb',
      }}
    >
      {inner}
    </span>
  );
}

export function speakerName(who: SpeakerId, captain: string) {
  if (who === 'captain')
    return {
      name: CAPTAINS[captain]?.name ?? 'Голова ОСББ',
      role: 'голова ОСББ',
    };
  const s = SPEAKERS[who as keyof typeof SPEAKERS];
  return { name: s?.name ?? '', role: s?.role ?? '' };
}

export function DialoguePlayer({
  scene,
  index,
  meta,
  captain,
  onAdvance,
  onChoose,
  onClose,
}: {
  scene: Scene;
  index: number;
  meta: Meta;
  captain: string;
  onAdvance: (index: number) => void;
  // A picked choice (an ending choice leaves the scene to its ending).
  onChoose: (choice: Choice) => void;
  onClose: () => void;
}) {
  const [reply, setReply] = useState<{ line: Line; choice: Choice } | null>(
    null,
  );
  const last = scene.lines.length - 1,
    at = Math.max(0, Math.min(last, index)),
    line: Line = reply ? reply.line : scene.lines[at],
    atEnd = reply ? true : at === last,
    choosing = !reply && atEnd && !!scene.choices?.length,
    decides = !!scene.choices?.some((c) => c.ending);
  // Backdrop: the latest art given up to this line, else the shelter glow.
  const art = useMemo(() => {
    for (let i = at; i >= 0; i--) {
      const a = scene.lines[i].art;
      if (a !== undefined) return a;
    }
    return undefined;
  }, [scene, at]);
  // The next two backdrops load while this line is read.
  useEffect(() => {
    for (let i = at + 1; i <= Math.min(last, at + 2); i++) {
      const a = scene.lines[i].art,
        src = a === undefined ? undefined : SCENE_IMAGE_BY_ART[a];
      if (src) new Image().src = src;
    }
  }, [scene, at, last]);
  const who = speakerName(line.who, captain),
    text = fillLine(line.text, meta, captain),
    speaker = SPEAKERS[line.who as keyof typeof SPEAKERS];
  // Each line is spoken when it appears; leaving the scene stops the voice.
  useEffect(() => {
    speak(voiceKeyFor(line.who, captain), text);
  }, [scene.id, at, reply, captain, text, line.who]);
  useEffect(() => () => stopVoice(), []);
  const next = () => {
    if (reply) {
      onChoose(reply.choice);
      return;
    }
    if (!atEnd) onAdvance(at + 1);
    else if (!choosing) onClose();
  };
  const back = () => {
    if (!reply && at > 0) onAdvance(at - 1);
  };
  const skip = () => {
    if (!decides) onClose();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('textarea,input')) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        // A focused choice button handles Space and Enter itself.
        if (choosing && target?.closest('.dlg-choice')) return;
        if (choosing) return;
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  return (
    <div
      className="dlg"
      data-gamepad-scope
      role="dialog"
      aria-modal="true"
      aria-label={scene.title}
    >
      <div className="dlg-stage dlg-shelter">
        <SceneArt
          art={art === undefined ? shelterBackdrop(scene.id) : (art ?? CITY_ART)}
        />
        <div className="dlg-haze" />
      </div>
      <header className="dlg-top">
        <span>
          {scene.title.toUpperCase()}
          <small> · УКРАЇНА · {STORY_YEAR}</small>
        </span>
        {line.time && <b className="dlg-time">{line.time}</b>}
        {!decides && (
          <button className="text-button" onClick={skip}>
            <FastForward size={15} /> Пропустити
          </button>
        )}
      </header>
      <div
        className={`dlg-card ${line.glitch ? 'dlg-glitch' : ''}`}
        key={`${scene.id}-${at}-${reply ? 'r' : ''}`}
      >
        <SpeakerPortrait who={line.who} captain={captain} size={76} />
        <div className="dlg-body">
          {who.name && (
            <span
              className="dlg-name"
              style={{ color: speaker?.color ?? '#aee6cb' }}
            >
              {who.name}
              {who.role && <small> · {who.role}</small>}
            </span>
          )}
          <p className={line.who === 'narrator' ? 'dlg-narration' : ''}>
            {text}
          </p>
        </div>
      </div>
      {choosing && (
        <div className="dlg-choices">
          {scene.choices!.map((c) => {
            const open = !c.requires || c.requires(meta);
            return (
              <button
                key={c.text}
                className="dlg-choice"
                disabled={!open}
                autoFocus={
                  open &&
                  c ===
                    scene.choices!.find((x) => !x.requires || x.requires(meta))
                }
                onClick={() => {
                  if (c.reply) setReply({ line: c.reply, choice: c });
                  else onChoose(c);
                }}
              >
                {!open && <Lock size={14} aria-hidden="true" />}
                <span>{c.text}</span>
                {!open && c.locked && <small>{c.locked}</small>}
              </button>
            );
          })}
        </div>
      )}
      <footer className="dlg-controls">
        <button
          className="text-button"
          onClick={back}
          disabled={reply !== null || at === 0}
          aria-label="Назад"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="dlg-count">
          {Math.min(at + 1, scene.lines.length)} / {scene.lines.length}
        </span>
        {!choosing && (
          <button className="primary small" onClick={next} autoFocus>
            {reply || atEnd ? 'Готово' : 'Далі'}
            <ArrowRight size={17} />
          </button>
        )}
      </footer>
    </div>
  );
}

// Run-end protocol: one or two lines in the result window.
export function ProtocolCard({
  lines,
  meta,
  captain,
}: {
  lines: Line[];
  meta: Meta;
  captain: string;
}) {
  useEffect(() => {
    const first = lines[0];
    if (first)
      speak(
        voiceKeyFor(first.who, captain),
        fillLine(first.text, meta, captain),
      );
    return () => stopVoice();
  }, [lines, captain]);
  return (
    <aside className="protocol-card" aria-label="Протокол Притулку">
      {lines.slice(0, 2).map((l, i) => {
        const who = speakerName(l.who, captain);
        return (
          <div className="protocol-line" key={i}>
            <SpeakerPortrait who={l.who} captain={captain} size={44} />
            <p>
              <b>{who.name}</b> {fillLine(l.text, meta, captain)}
            </p>
          </div>
        );
      })}
    </aside>
  );
}

// Combat radio: a short line with the speaker's portrait.
export function RadioStrip({
  who,
  text,
  captain,
}: {
  who: SpeakerId;
  text: string;
  captain: string;
}) {
  const n = speakerName(who, captain);
  useEffect(() => {
    speak(voiceKeyFor(who, captain), text);
    return () => stopVoice();
  }, [who, text, captain]);
  return (
    <div className="radio-strip" role="status">
      <SpeakerPortrait who={who} captain={captain} size={40} />
      <p>
        <b>{n.name}</b>
        {text}
      </p>
    </div>
  );
}
