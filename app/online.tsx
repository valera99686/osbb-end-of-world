import {
  lazy,
  Suspense,
  useState,
  useSyncExternalStore,
  type SyntheticEvent,
} from 'react';
import {
  Check,
  Copy,
  Globe,
  LogIn,
  LogOut,
  Recycle,
  Users,
} from 'lucide-react';
import { Currency } from './hud-parts';
import { CHARACTERS } from '@/lib/game/data';
import { readMapRun, readView } from '@/lib/game/model';
import {
  formatCode,
  normalizeCode,
  parseRelay,
  ROOM_LENGTH,
  type ShareMode,
} from '@/lib/game/net';
import { MAX_PLAYERS } from '@/lib/game/coop';
import { savedRelay, saveRelay } from './relay';
import type { NetSession } from '@/lib/game/session';
import type { BattleResult } from '@/lib/game/engine';
import type { Meta } from '@/lib/game/model';
import { GuestAside, GuestPages, useGuestHouse } from './guest-home';
import { NickField } from './settings';
import { matesOf } from './vote';

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
  function submit(e: SyntheticEvent) {
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
  hasRun,
  onMode,
  onHost,
  onJoin,
  onClose,
  savedRoom,
  onRejoin,
  savedHost,
  onResume,
  onForget,
  nick,
  myHero,
  onNick,
}: {
  session: NetSession | null;
  build: string;
  // The name typed for the room, the hero's name in its place, and its change.
  nick: string;
  myHero: string;
  onNick: (nick: string) => void;
  // A room this device was thrown out of (as a guest), and the room of the raid
  // this device hosted before the page closed: ways back into the same game.
  savedRoom?: { code: string } | null;
  onRejoin?: () => void;
  savedHost?: { code: string } | null;
  onResume?: () => void;
  onForget?: () => void;
  mode: ShareMode;
  // A raid of this player is unfinished: a room is for a new one.
  hasRun: boolean;
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
  // Seats still free (before a raid): a friend more may come.
  const free =
    session?.role === 'host' && !session.crewLocked
      ? MAX_PLAYERS - 1 - session.guests.length
      : 0;
  function submit(e: SyntheticEvent) {
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
      {session && (
        <div className="online-head">
          <span className="micro">
            <Globe size={14} /> КІМНАТА
          </span>
          <button type="button" className="coop-switch" onClick={onClose}>
            <LogOut size={13} /> Закрити
          </button>
        </div>
      )}
      {!session && (savedRoom || savedHost) && (
        <div className="online-back" role="group" aria-label="Повернутися в гру">
          {savedHost && (
            <button type="button" className="primary" onClick={onResume}>
              <LogIn size={18} />
              <span>
                <b>Продовжити рейд у кімнаті {savedHost.code}</b>
                <small>Друзі повернуться на свої місця</small>
              </span>
            </button>
          )}
          {savedRoom && !savedHost && (
            <button type="button" className="primary" onClick={onRejoin}>
              <LogIn size={18} />
              <span>
                <b>Повернутися в кімнату {savedRoom.code}</b>
                <small>Твоє місце й будинок чекають</small>
              </span>
            </button>
          )}
          <button type="button" className="text-button" onClick={onForget}>
            Забути цю кімнату
          </button>
        </div>
      )}
      {!session && (
        <>
          <NickField value={nick} hero={myHero} onChange={onNick} />
          <div className="online-actions">
            <button type="button" className="secondary" onClick={onHost}>
              <Users size={18} />
              <span>
                <b>Створити кімнату</b>
                <small>Отримаєш код для друзів (до трьох)</small>
              </span>
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setJoining((v) => !v)}
              aria-expanded={joining}
            >
              <LogIn size={18} />
              <span>
                <b>Приєднатися</b>
                <small>У мене є код</small>
              </span>
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
                // The only field of the join form: the cursor belongs in it.
                // oxlint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                aria-label="Код кімнати"
              />
              <button className="primary" disabled={!code}>
                Зайти
              </button>
            </form>
          )}
          {hasRun && (
            <p>
              <b>Рейд уже триває.</b> Приєднатися до друга можна будь-коли, а
              щоб створити кімнату, поточний рейд доведеться завершити.
            </p>
          )}
          <p>Потрібні інтернет і однакова версія гри (v{build}).</p>
          <details className="online-more">
            <summary>Як ділити бій</summary>
            <div
              className="share-mode"
              role="radiogroup"
              aria-label="Як ділити бій"
            >
              {(
                [
                  [
                    'sync',
                    'Обидва рахують',
                    'Найточніше й найлегше для мережі. Слабкий пристрій гальмує всіх.',
                  ],
                  [
                    'host',
                    'Хост рахує',
                    'Господар рахує бій, гість керує й дивиться. Гість відчуває затримку зв’язку, зате розсинхрону немає.',
                  ],
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
          </details>
        </>
      )}
      {session?.role === 'host' &&
        (session.phase === 'waiting' || session.phase === 'connected') && (
          <>
            {session.code ? (
              (session.phase === 'waiting' || free > 0) && (
                <div className="room-code">
                  <b
                    aria-label={`Код кімнати ${session.code.split('').join(' ')}`}
                  >
                    {formatCode(session.code)}
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
              )
            ) : (
              !session.error && <p>Відкриваємо кімнату…</p>
            )}
            {session.code && session.phase === 'waiting' && (
              <p>
                Скажи цей код друзям (до трьох): кожен вводить його в
                «Приєднатися». Чекаємо.
              </p>
            )}
          </>
        )}
      {session?.role === 'host' && session.phase === 'connected' && (
        <>
          <ul className="room-guests" aria-label="Гравці в кімнаті">
            {session.guests.map((g) => (
              <li key={g.seat} className={g.link ? '' : 'away'}>
                <b>{g.partner.name || heroName(g.partner.hero)}</b>
                <small>
                  {heroName(g.partner.hero)}
                  {g.link ? '' : ' · відійшов, місце за ним'}
                </small>
              </li>
            ))}
          </ul>
          <p>
            <b>
              Підключено: {session.here().length} із {MAX_PLAYERS - 1}.
            </b>{' '}
            Тисни «Вирушити в рейд»: усі будуть поруч у кожному бою.
            {free > 0 &&
              ` Можна запросити ще ${free}: скажи їм код ${formatCode(session.code)}.`}
            {session.via === 'relay' &&
              ' З’єднання когось іде через резервний канал: затримка більша, а бій рахуєш лише ти.'}
          </p>
        </>
      )}
      {session?.role === 'guest' && session.phase === 'joining' && (
        <p>{session.status || 'З’єднуємо з кімнатою…'}</p>
      )}
      {session?.error && (
        <p className="online-error">{netErrorText(session.error)}</p>
      )}
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
  meta,
  result,
  earned,
  onLeave,
}: {
  session: NetSession;
  meta: Meta;
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
  // The host's run, to read the page from, and the guest's own house in it.
  const view = readView(session.view);
  const house = useGuestHouse(view, session.seat);
  const page =
    view &&
    (view.page === 'reward' ||
      view.page === 'shop' ||
      view.page === 'event' ||
      view.page === 'council');
  const card = (
    <div className={`guest-card${view ? ' wide' : ''}`}>
      <span className="micro">
        <Globe size={14} /> КІМНАТА {session.code}
      </span>
      <h2>
        {!voting
          ? 'Господар веде рейд'
          : single
            ? 'Карта рейду'
            : 'Куди йти — вирішуєте разом'}
      </h2>
      <p className="guest-status">
        {session.status || 'Чекаємо, поки господар дійде до бою.'}
      </p>
      {!view && session.roster.length > 0 && (
        <ul className="room-guests" aria-label="Гравці в кімнаті">
          {session.roster.map((r) => (
            <li key={r.seat} className={r.here ? '' : 'away'}>
              <b>{session.nameOf(r.seat)}</b>
              <small>
                {heroName(r.hero)}
                {r.seat === 0 && ' · господар'}
                {r.seat === session.seat && ' · це ти'}
              </small>
            </li>
          ))}
        </ul>
      )}
      {voting && map && ballot && (
        <Suspense fallback={null}>
          <RouteTree
            key={`${map.seed}-${map.chapter}-${map.step}`}
            run={map}
            onEnter={() => {}}
            vote={{
              mine: ballot.votes[session.seat] ?? null,
              mates: matesOf(ballot, session.seat, (s) => session.nameOf(s)),
              done: ballot.done,
              onVote: (col) => session.voteGuest(col),
              locked: single
                ? 'Єдиний шлях: господар вирушає, а ти йдеш за ним.'
                : undefined,
            }}
          />
        </Suspense>
      )}
      {view && page && <GuestPages session={session} view={view} meta={meta} />}
      {result && (
        <div className="guest-result">
          <b>{result.won ? 'Бій виграно' : 'Бій програно'}</b>
          <span>Ворогів знищено: {result.run.kills}</span>
          <span>
            Монет у спільній скарбниці: {Math.floor(result.run.coins)}
          </span>
          <span className="guest-cores">Ядра тобі за бій: +{earned.fight}</span>
        </div>
      )}
      {earned.raid > 0 && (
        <div className="guest-result">
          <b>Рейд господаря завершено</b>
          <span className="guest-cores">
            Ядра тобі за рейд: +{earned.raid} (разом із ядрами за бої стільки ж,
            скільки в господаря)
          </span>
        </div>
      )}
      <p>
        Коли господар почне бій, він відкриється тут сам. Ти ведеш свій будинок:
        рух, ривок і вміння твого героя. Нагороди, магазин і мешканці діляться
        між будинками гравців, каса спільна; карту веде господар, а куди йти,
        вирішуєте разом. Якщо вилетів або вийшов випадково, зайди знову: місце
        за тобою до кінця рейду.
      </p>
      <button type="button" className="secondary" onClick={onLeave}>
        <LogOut size={16} /> Вийти з кімнати
      </button>
    </div>
  );
  if (!view || !house.mine)
    return (
      <section
        className={`guest-room ${voting ? 'voting' : ''}`}
        data-seat={session.seat}
      >
        {card}
      </section>
    );
  return (
    <section
      className={`guest-room play ${voting ? 'voting' : ''}`}
      data-seat={session.seat}
    >
      <div className="play-layout">
        <section className="play-main">
          <div className="page-heading">
            <span className="micro">
              <Globe size={14} /> КІМНАТА {session.code}
            </span>
            <div className="run-wallet">
              <Currency amount={view.coins} />
              <span>
                <Recycle size={15} /> {view.scrap}
              </span>
            </div>
          </div>
          {card}
        </section>
        <GuestAside
          session={session}
          view={view}
          mine={house.mine}
          setMine={house.set}
          meta={meta}
        />
      </div>
    </section>
  );
}
