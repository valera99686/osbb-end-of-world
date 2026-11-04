// The chat of an online room, on every screen of it (the hub, the map, the
// shop, the fights): a button at the left edge, and a panel with the lines, a
// field for text, quick phrases for the fights and the voice chat. A line the
// partner says shows for a few seconds even while the panel is shut.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  GripHorizontal,
  MessageCircle,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CHAT, QUICK, type ChatLine } from '@/lib/game/chat';
import type { NetSession } from '@/lib/game/session';
import { useNet } from './online';
import { useVoice } from './voice-chat';

const TOAST_MS = 5200;
// Where the player left the chat (top-left corner, in pixels), kept on the device.
const POS_KEY = 'osbb.chat.pos';
interface Pos {
  x: number;
  y: number;
}
function savedPos(): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    return p && Number.isFinite(p.x) && Number.isFinite(p.y)
      ? { x: p.x, y: p.y }
      : null;
  } catch {
    return null;
  }
}
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(Math.max(lo, hi), v));

export function ChatDock({
  session,
  name,
}: {
  session: NetSession;
  // How the partner is called in the panel.
  name: string;
}) {
  useNet(session);
  const voice = useVoice(session);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [toast, setToast] = useState<ChatLine | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // The dock can be dragged by its button and by the top of the panel.
  const dock = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(savedPos);
  const grab = useRef<{
    id: number;
    dx: number;
    dy: number;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);
  const justDragged = useRef(false);
  // The latest place while dragging (the state lags the pointer by a frame).
  const latest = useRef<Pos | null>(null);
  const keepInside = (p: Pos): Pos => {
    const r = dock.current?.getBoundingClientRect();
    const w = r?.width ?? 44,
      h = r?.height ?? 44;
    return {
      x: clamp(p.x, 4, window.innerWidth - w - 4),
      y: clamp(p.y, 4, window.innerHeight - h - 4),
    };
  };
  const down = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('.chat-close')) return;
    const r = dock.current?.getBoundingClientRect();
    if (!r) return;
    grab.current = {
      id: e.pointerId,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return;
    g.moved = true;
    const next = keepInside({ x: e.clientX - g.dx, y: e.clientY - g.dy });
    latest.current = next;
    setPos(next);
  };
  const drop = (e: PointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    grab.current = null;
    if (!g.moved) return;
    // The click that ends a drag is not a tap on the button.
    justDragged.current = true;
    window.setTimeout(() => (justDragged.current = false), 0);
    if (latest.current) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(latest.current));
      } catch {
        // Only a convenience: back at the edge next time.
      }
    }
  };
  // The panel is taller than the button: when it opens, or the window changes,
  // it is kept on the screen.
  useLayoutEffect(() => {
    setPos((p) => (p ? keepInside(p) : p));
  }, [open]);
  useEffect(() => {
    const fit = () => setPos((p) => (p ? keepInside(p) : p));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  // Takes the dock back to its place at the edge.
  const reset = () => {
    setPos(null);
    try {
      localStorage.removeItem(POS_KEY);
    } catch {
      // Nothing was kept.
    }
  };
  // What the partner says shows over the screen while the panel is shut.
  useEffect(() => {
    let timer = 0;
    session.onChat = (line) => {
      if (session.chatOpen) return;
      setToast(line);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), TOAST_MS);
    };
    return () => {
      window.clearTimeout(timer);
      session.onChat = null;
    };
  }, [session]);
  useEffect(() => {
    session.openChat(open);
    if (open) {
      setToast(null);
      window.setTimeout(() => field.current?.focus(), 50);
    }
    return () => session.openChat(false);
  }, [open, session]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [session.chat.length, open]);
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (session.say(text)) setText('');
  };
  const keys = (e: KeyboardEvent) => {
    // The fight listens to the keys of the whole page: the field keeps its own.
    e.stopPropagation();
    if (e.key === 'Escape') setOpen(false);
  };
  const who = (line: ChatLine) => (line.mine ? 'Ти' : name);
  const speaking = voice.speakingThem;
  return (
    <div
      className="chat-dock"
      data-open={open ? '1' : '0'}
      data-moved={pos ? '1' : '0'}
      ref={dock}
      style={pos ? { left: pos.x, top: pos.y, bottom: 'auto' } : undefined}
    >
      {!open && toast && (
        <button
          type="button"
          className="chat-toast"
          onClick={() => setOpen(true)}
          aria-live="polite"
        >
          <b>{name}</b> {toast.text}
        </button>
      )}
      {!open && (
        <button
          type="button"
          className={`chat-open${speaking ? ' talking' : ''}`}
          onClick={() => {
            if (!justDragged.current) setOpen(true);
          }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={drop}
          onPointerCancel={drop}
          aria-label="Відкрити чат (можна перетягнути)"
        >
          {speaking ? <Volume2 size={20} /> : <MessageCircle size={20} />}
          {session.unread > 0 && (
            <span className="chat-badge">{session.unread}</span>
          )}
        </button>
      )}
      {open && (
        <section className="chat-panel" aria-label="Чат кімнати" onKeyDown={keys}>
          <header
            className="chat-grip"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={drop}
            onPointerCancel={drop}
            onDoubleClick={reset}
            title="Перетягни, щоб перенести чат. Подвійний клік повертає на місце."
          >
            <GripHorizontal size={16} aria-hidden />
            <b>Чат із: {name}</b>
            <button
              type="button"
              className="chat-close"
              onClick={() => setOpen(false)}
              aria-label="Закрити чат"
            >
              <X size={18} />
            </button>
          </header>
          <div className="chat-log" ref={list} role="log" aria-live="polite">
            {session.chat.length === 0 && (
              <p className="chat-empty">
                Напиши другові або тицни швидку фразу.
              </p>
            )}
            {session.chat.map((line) => (
              <p key={line.id} className={line.mine ? 'mine' : 'theirs'}>
                <b>{who(line)}</b> {line.text}
              </p>
            ))}
          </div>
          <div className="chat-quick">
            {QUICK.map((phrase, i) => (
              <button
                type="button"
                key={phrase}
                onClick={() => session.sayQuick(i)}
              >
                {phrase}
              </button>
            ))}
          </div>
          <form className="chat-form" onSubmit={send}>
            <input
              ref={field}
              value={text}
              maxLength={CHAT.max}
              onChange={(e) => setText(e.target.value)}
              placeholder="Написати…"
              enterKeyHint="send"
              autoComplete="off"
            />
            <button type="submit" disabled={!text.trim()} aria-label="Надіслати">
              <Send size={18} />
            </button>
          </form>
          <div className="chat-voice" data-heard={voice.heard ? '1' : '0'}>
            <b className="chat-voice-title">
              <Mic size={14} aria-hidden /> Голосовий чат
            </b>
            {voice.available ? (
              <>
                <button
                  type="button"
                  className={`chat-mic ${voice.mic}`}
                  disabled={voice.mic === 'asking'}
                  onClick={() => (voice.mic === 'on' ? voice.stop() : void voice.start())}
                >
                  {voice.mic === 'on' ? <Mic size={18} /> : <MicOff size={18} />}{' '}
                  {voice.mic === 'on'
                    ? 'Мікрофон увімкнено'
                    : voice.mic === 'asking'
                      ? 'Просимо доступ…'
                      : 'Увімкнути мікрофон'}
                  {voice.speakingMe && <i className="chat-dot" aria-label="ти говориш" />}
                </button>
                <button
                  type="button"
                  className="chat-mute"
                  aria-pressed={voice.silenced}
                  onClick={() => voice.silence(!voice.silenced)}
                  aria-label={voice.silenced ? 'Увімкнути звук друга' : 'Вимкнути звук друга'}
                >
                  {voice.silenced ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                {voice.devices.length > 1 && (
                  <select
                    className="chat-device"
                    value={voice.deviceId}
                    onChange={(e) => void voice.choose(e.target.value)}
                    aria-label="Який мікрофон"
                  >
                    <option value="">Мікрофон за замовчуванням</option>
                    {voice.devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                )}
                {voice.relayed && (
                  <span className="chat-state chat-note">
                    Звук іде через резервний канал, як у рації: якість як у
                    телефона, затримка близько секунди.
                  </span>
                )}
                <span className="chat-state">
                  {voice.heard
                    ? voice.speakingThem
                      ? `${name} говорить`
                      : `${name} на звʼязку`
                    : session.partnerMic
                      ? `${name} вмикає голос…`
                      : `${name} без мікрофона`}
                </span>
              </>
            ) : (
              <>
                <button type="button" className="chat-mic" disabled>
                  <MicOff size={18} />{' '}
                  {session.voicePending
                    ? 'Голос підключається…'
                    : 'Мікрофон недоступний'}
                </button>
                <span className="chat-state">
                  {session.voicePending
                    ? 'Готуємо звук через резервний канал, це кілька секунд.'
                    : 'Голос не підключився: ні напряму між пристроями, ні через резервний канал. Спробуйте іншу мережу (Wi‑Fi замість мобільного інтернету) і створіть кімнату наново, або додайте власний TURN-релей: «Гра по мережі», «Релей».'}
                </span>
              </>
            )}
          </div>
          {voice.error && <p className="chat-error">{voice.error}</p>}
        </section>
      )}
    </div>
  );
}
