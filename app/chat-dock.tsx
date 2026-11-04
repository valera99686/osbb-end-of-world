// The chat of an online room, on every screen of it (the hub, the map, the
// shop, the fights): a button at the left edge, and a panel with the lines, a
// field for text, quick phrases for the fights and the voice chat. A line the
// partner says shows for a few seconds even while the panel is shut.
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
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
    <div className="chat-dock" data-open={open ? '1' : '0'}>
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
          onClick={() => setOpen(true)}
          aria-label="Відкрити чат"
        >
          {speaking ? <Volume2 size={20} /> : <MessageCircle size={20} />}
          {session.unread > 0 && (
            <span className="chat-badge">{session.unread}</span>
          )}
        </button>
      )}
      {open && (
        <section className="chat-panel" aria-label="Чат кімнати" onKeyDown={keys}>
          <header>
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
              <span className="chat-state">
                Голос працює лише на прямому з’єднанні: зараз зв’язок іде через
                резервний канал.
              </span>
            )}
          </div>
          {voice.error && <p className="chat-error">{voice.error}</p>}
        </section>
      )}
    </div>
  );
}
