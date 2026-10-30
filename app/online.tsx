import {
  lazy,
  Suspense,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { Check, Copy, Globe, LogIn, LogOut, Users } from 'lucide-react';
import { CHARACTERS } from '@/lib/game/data';
import { readMapRun } from '@/lib/game/model';
import {
  normalizeCode,
  parseRelay,
  ROOM_LENGTH,
  type ShareMode,
} from '@/lib/game/net';
import { savedRelay, saveRelay } from './relay';
import type { NetSession } from '@/lib/game/session';
import type { BattleResult } from '@/lib/game/engine';

const RouteTree = lazy(() =>
  import('./route-tree').then((m) => ({ default: m.RouteTree })),
);

const none = () => () => {};
// Re-renders the component whenever the room changes.
export function useNet(session: NetSession | null) {
  useSyncExternalStore(
    session ? session.subscribe : none,
    session ? session.getVersion : () => 0,
  );
}
// The errors of the room (net.ts, net-peer.ts) as a sentence for a person.
export function netErrorText(error: string): string {
  if (error === 'busy') return 'У цій кімнаті вже є напарник.';
  const [kind, ...rest] = error.split(':');
  const text = rest.join(':');
  if (kind === 'version')
    return `У господаря інша версія гри (v${text}). Оновіть обидві копії до однієї версії.`;
  if (kind === 'room' || kind === 'net') return text;
  return error;
}
const heroName = (id: string) =>
  CHARACTERS.find((c) => c.id === id)?.name ?? '';

// The way round a router that will not connect two devices directly: a relay
// (TURN) of the player's own (net.ts explains why there is no default one).
function RelaySetup() {
  const [saved, setSaved] = useState(savedRelay),
    [urls, setUrls] = useState(() => savedRelay()?.urls.join('\n') ?? ''),
    [user, setUser] = useState(() => savedRelay()?.username ?? ''),
    [pass, setPass] = useState(() => savedRelay()?.credential ?? ''),
    [note, setNote] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const relay = parseRelay(urls, user, pass);
    if (!relay) {
      setNote('Перевір адреси (turn:… або turns:…), ім’я й пароль.');
      return;
    }
    saveRelay(relay);
    setSaved(relay);
    setNote('Збережено. Діє для наступної кімнати.');
  }
  function clear() {
    saveRelay(null);
    setSaved(null);
    setUrls('');
    setUser('');
    setPass('');
    setNote('Релей прибрано.');
  }
  return (
    <details className="online-relay">
      <summary>
        Не з’єднується з другом? Релей{saved ? ' (налаштовано)' : ''}
      </summary>
      <p>
        Відстань не заважає, заважає роутер: на мобільному інтернеті й у суворих
        мережах пряме з’єднання не виходить, і потрібен релей (TURN).
        Безкоштовних публічних релеїв без акаунта більше нема, тож його можна
        завести самому: безкоштовний акаунт у будь-якого TURN-провайдера
        (наприклад, Metered Open Relay) дає адреси, ім’я й пароль. Зазвичай
        досить, щоб релей налаштував господар. Дані лишаються на цьому пристрої.
      </p>
      <form onSubmit={submit}>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={3}
          placeholder={'turn:адреса:80\nturns:адреса:443?transport=tcp'}
          spellCheck={false}
          aria-label="Адреси релею"
        />
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="Ім’я"
          autoComplete="off"
          spellCheck={false}
          aria-label="Ім’я для релею"
        />
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Пароль"
          autoComplete="off"
          aria-label="Пароль для релею"
        />
        <div className="online-relay-actions">
          <button className="primary">Зберегти</button>
          {saved && (
            <button type="button" className="secondary" onClick={clear}>
              Прибрати
            </button>
          )}
        </div>
      </form>
      {note && <p role="status">{note}</p>}
    </details>
  );
}

// The hub's block for online co-op: open a room, or join one by its code.
export function OnlinePanel({
  session,
  build,
  mode,
  onMode,
  onHost,
  onJoin,
  onClose,
}: {
  session: NetSession | null;
  build: string;
  mode: ShareMode;
  onMode: (mode: ShareMode) => void;
  onHost: () => void;
  onJoin: (code: string) => void;
  onClose: () => void;
}) {
  useNet(session);
  const [typed, setTyped] = useState(''),
    [joining, setJoining] = useState(false),
    [copied, setCopied] = useState(false);
  const code = normalizeCode(typed);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (code) onJoin(code);
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // The code is on the screen: it can be read out.
    }
  }
  return (
    <div className={`online-panel${session ? ' on' : ''}`}>
      <div className="online-head">
        <span className="micro">
          <Globe size={14} /> ГРА ПО МЕРЕЖІ
        </span>
        {session && (
          <button type="button" className="coop-switch" onClick={onClose}>
            <LogOut size={13} /> Закрити
          </button>
        )}
      </div>
      {!session && (
        <>
          <div className="online-actions">
            <button type="button" className="secondary" onClick={onHost}>
              <Users size={16} /> Створити кімнату
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setJoining((v) => !v)}
              aria-expanded={joining}
            >
              <LogIn size={16} /> Приєднатися
            </button>
          </div>
          {joining && (
            <form className="online-join" onSubmit={submit}>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Код кімнати"
                maxLength={ROOM_LENGTH + 3}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="Код кімнати"
              />
              <button className="primary" disabled={!code}>
                Зайти
              </button>
            </form>
          )}
          <div className="share-mode" role="radiogroup" aria-label="Як ділити бій">
            {(
              [
                ['sync', 'Обидва рахують', 'Найточніше й найлегше для мережі. Потрібна однакова версія гри, слабкий пристрій гальмує обох.'],
                ['host', 'Хост рахує', 'Господар рахує бій, гість керує й дивиться. Гість відчуває затримку зв’язку, зате розсинхрону немає.'],
              ] as const
            ).map(([id, name, text]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                className={`share-option${mode === id ? ' active' : ''}`}
                onClick={() => onMode(id)}
                title={text}
              >
                <b>{name}</b>
                <small>{text}</small>
              </button>
            ))}
          </div>
          <p>
            Двоє на різних пристроях: ПК і ПК, ПК і телефон, телефон і телефон.
            Господар веде рейд, гість у боях веде другий будинок. Потрібні інтернет
            і однакова версія гри (v{build}).
          </p>
        </>
      )}
      {session?.role === 'host' && session.phase === 'waiting' && (
        <>
          {session.code ? (
            <div className="room-code">
              <b aria-label={`Код кімнати ${session.code.split('').join(' ')}`}>
                {session.code}
              </b>
              <button
                type="button"
                className="secondary small"
                onClick={() => copy(session.code)}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
                {copied ? 'Скопійовано' : 'Скопіювати'}
              </button>
            </div>
          ) : (
            !session.error && <p>Відкриваємо кімнату…</p>
          )}
          {session.code && (
            <p>
              Скажи цей код другові: у нього в «Приєднатися». Кімната відкрита,
              чекаємо.
            </p>
          )}
        </>
      )}
      {session?.role === 'host' && session.phase === 'connected' && (
        <p>
          <b>
            Напарник підключений: {heroName(session.partner?.hero ?? '')}.
          </b>{' '}
          Вирушай у рейд: він бачитиме й проходитиме бої разом із тобою.
          Карту, магазин і події веде господар.
          {session.via === 'relay' &&
            ' З’єднання йде через резервний канал: затримка більша, а бій рахуєш лише ти.'}
        </p>
      )}
      {session?.role === 'guest' && session.phase === 'joining' && (
        <p>{session.status || 'З’єднуємо з кімнатою…'}</p>
      )}
      {session?.error && <p className="online-error">{netErrorText(session.error)}</p>}
      {session && session.phase === 'closed' && !session.error && (
        <p>Кімнату закрито.</p>
      )}
      {(!session || session.error) && <RelaySetup />}
    </div>
  );
}

// What the guest sees while the host plays the map, the shop and the events,
// and after a fight; the fights themselves open by themselves.
export function GuestRoom({
  session,
  result,
  earned,
  onLeave,
}: {
  session: NetSession;
  result: BattleResult | null;
  // Cores the last fight and raid paid this player.
  earned: { fight: number; raid: number };
  onLeave: () => void;
}) {
  useNet(session);
  // The same map as the host's, when the next stop is a vote of both.
  const map = readMapRun(session.map),
    ballot = session.ballot;
  const voting = !!map && !!ballot && ballot.step === map.step;
  // One way only (or a fight to go on with): the map is shown, nothing to vote.
  const single = !!ballot && ballot.options.length < 2;
  return (
    <section className={`guest-room ${voting ? 'voting' : ''}`}>
      <div className="guest-card">
        <span className="micro">
          <Globe size={14} /> КІМНАТА {session.code}
        </span>
        <h2>
          {!voting
            ? 'Господар веде рейд'
            : single
              ? 'Карта рейду'
              : 'Куди йти — вирішуєте вдвох'}
        </h2>
        <p className="guest-status">
          {session.status || 'Чекаємо, поки господар дійде до бою.'}
        </p>
        {voting && map && ballot && (
          <Suspense fallback={null}>
            <RouteTree
              key={`${map.seed}-${map.chapter}-${map.step}`}
              run={map}
              onEnter={() => {}}
              vote={{
                mine: ballot.guest,
                partner: ballot.host,
                partnerName: 'Господар',
                done: ballot.done,
                onVote: (col) => session.voteGuest(col),
                locked: single
                  ? 'Єдиний шлях: господар вирушає, а ти йдеш за ним.'
                  : undefined,
              }}
            />
          </Suspense>
        )}
        {result && (
          <div className="guest-result">
            <b>{result.won ? 'Бій виграно' : 'Бій програно'}</b>
            <span>Ворогів знищено: {result.run.kills}</span>
            <span>Монет у спільній скарбниці: {Math.floor(result.run.coins)}</span>
            <span className="guest-cores">Ядра тобі за бій: +{earned.fight}</span>
          </div>
        )}
        {earned.raid > 0 && (
          <div className="guest-result">
            <b>Рейд господаря завершено</b>
            <span className="guest-cores">
              Ядра тобі за рейд: +{earned.raid}
            </span>
          </div>
        )}
        <p>
          Коли господар почне бій, він відкриється тут сам. Ти ведеш
          другий будинок: рух, ривок і вміння твого героя, зі своїми
          модулями: нагороди й магазин діляться на двох, гроші спільні.
          Карту, магазин і нагороди веде господар, а що вибрано й для кого,
          видно тут у рядку стану.
        </p>
        <button type="button" className="secondary" onClick={onLeave}>
          <LogOut size={16} /> Вийти з кімнати
        </button>
      </div>
    </section>
  );
}
