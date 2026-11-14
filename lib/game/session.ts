// The ends of an online co-op room (net.ts has the fight itself): who is the
// host and who are the guests (up to three, each with a seat), the greeting
// (build and protocol must match), the host's status lines between fights and
// the opening of each fight. The guests talk to the host only; it passes on
// what the others need. It owns the links, so no message is lost between
// screens: whatever arrives before the fight it belongs to exists is held and
// handed over on attach. A guest that leaves keeps its seat for the raid and
// can come back to it with the token it was given (see `crewLocked`).
import {
  NET_PROTOCOL,
  makeToken,
  type FightLink,
  type Link,
  type Msg,
  type RosterRow,
  type ShareMode,
  type VoiceLink,
  type Wire,
} from './net';
import {
  MAX_PLAYERS,
  castVote,
  newBallot,
  readBallot,
  type Ballot,
} from './coop';
import { CHAT, ChatLimiter, cleanChat, quickText, type ChatLine } from './chat';

// What the host tells the guest while it is in a fight: when it says anything
// else, the fight is over at the host.
export const HOST_IN_FIGHT = 'Господар у бою';
export type Phase = 'waiting' | 'joining' | 'connected' | 'refused' | 'closed';
export interface Partner {
  hero: string;
  name: string;
}
// A guest's seat in the host's room: who it is, the token it comes back with,
// and its link (null while its device is gone and the seat is kept).
export interface Guest {
  seat: number;
  token: string;
  partner: Partner;
  link: Link | null;
}
// A seat of a raid as it is kept to come back to (session.restore).
export interface SavedSeat {
  token: string;
  hero: string;
  name: string;
}
export interface StartMsg {
  sid: number;
  run: unknown;
  meta: unknown;
  mode?: ShareMode;
  seat?: number;
  away?: number[];
}
// A fight that was not answered within this many ms did not start.
export const START_TIMEOUT = 20000;
const HELD_MAX = 900;
const HELD_SCENES = 8;
// What the id of a scene may look like: letters, digits and dashes.
const SCENE_ID = /^[a-z0-9][a-z0-9-]{0,59}$/i;

// The host's way to its guests, for the fights: the room as one Wire.
class HostHub implements Wire {
  constructor(private session: NetSession) {}
  get kind() {
    return this.session.via;
  }
  get open() {
    return this.session.here().length > 0;
  }
  kindOf(seat: number): 'p2p' | 'relay' {
    return this.session.guestAt(seat)?.link?.kind === 'relay' ? 'relay' : 'p2p';
  }
  send(msg: Msg, only?: readonly number[]) {
    this.session.sendTo(msg, only);
  }
}

export class NetSession {
  phase: Phase;
  // The room code (host: the one to tell; guest: the one joined).
  code = '';
  error = '';
  // The other end: the first guest here for the host, the host for the guest.
  partner: Partner | null = null;
  // Guest only: what the host says it is doing between fights (or, while
  // joining, how the connection is going).
  status = '';
  // How the ends are connected: directly, or through a relay (the host: if any
  // of the guests is on a relay).
  via: 'p2p' | 'relay' = 'p2p';
  fight: FightLink | null = null;
  // Host: how the next fights are shared (see net.ts ShareMode).
  mode: ShareMode = 'sync';
  // Host: everybody who has a seat, here or not. Guest: nothing.
  guests: Guest[] = [];
  // Host: the crew of the raid is fixed: nobody new takes a seat, but a guest
  // who left may come back to its own. Between raids anybody may come.
  crewLocked = false;
  // Guest: the seat it plays and the token the host gave it for coming back
  // ('' until the host has said), and everybody in the room as the host told.
  seat = 0;
  token = '';
  roster: RosterRow[] = [];
  // Whose microphone is on, by seat (0 is the host).
  mics: boolean[] = [];
  // Guest only: called when the host opens a fight.
  onStart: ((m: StartMsg) => void) | null = null;
  // Guest only: the host's raid is over and this is what it earned.
  onGift:
    | ((m: {
        cores: number;
        won: boolean;
        final: boolean;
        story: string[];
        all: boolean;
      }) => void)
    | null = null;
  // Bumps on every change, for React's useSyncExternalStore.
  version = 0;
  // The vote for the next stop of the raid, as everybody sees it, and (guest)
  // the host's run to draw the map from. Nothing here while no map is open.
  ballot: Ballot | null = null;
  map: unknown = null;
  // Guest: the host's run to show the house, the finds and the shop from.
  view: unknown = null;
  // Host: a guest (by seat) takes a find or buys something.
  onTake:
    | ((
        m: { source: 'reward' | 'shop'; index: number; id: string },
        seat: number,
      ) => void)
    | null = null;
  // Host: a guest rearranged its house.
  onHouse:
    | ((
        m: { house: unknown; coins: number; scrap: number },
        seat: number,
      ) => void)
    | null = null;
  // Host: a guest has voted.
  onVoted: (() => void) | null = null;
  // Host: a guest has come back to its seat (told after the fact, once).
  onReturn: ((seat: number) => void) | null = null;
  // Guest: a scene begins at the host. Ones that come before anyone listens
  // are held (takeScenes).
  onScene: ((id: string) => void) | null = null;
  private heldScenes: string[] = [];
  // The chat of the room: the last lines, how many of the others' have not
  // been read.
  chat: ChatLine[] = [];
  unread = 0;
  // The chat panel is open (the lines that come are read at once).
  chatOpen = false;
  // A line from somebody has just come (for the screens that show it).
  onChat: ((line: ChatLine) => void) | null = null;
  private chatId = 0;
  private limiters = new Map<number, ChatLimiter>();
  // Host: the room still takes a guest after one has left.
  roomOpen = true;
  private hostLink: Link | null = null;
  // Host: what the guests were last told, for one who comes in later.
  private lastStatus = '';
  private lastView: unknown = null;
  private hostMap: unknown = null;
  // Host: the fight that is on (its run and profile, for a guest who comes back
  // into it).
  private lastStart: { sid: number; run: unknown; meta: unknown } | null = null;
  private pendingStart: StartMsg | null = null;
  private subs = new Set<() => void>();
  private held: { m: Msg; from?: number }[] = [];
  private waiting = new Map<
    number,
    { need: Set<number>; done: (sid: number | null) => void }
  >();
  private sid = 0;
  constructor(
    readonly role: 'host' | 'guest',
    // The version of the game: both ends must run the very same one.
    readonly build: string,
    // This end: its hero and the name it goes by.
    readonly me: Partner,
  ) {
    this.phase = role === 'host' ? 'waiting' : 'joining';
  }
  subscribe = (cb: () => void) => {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  };
  getVersion = () => this.version;
  private change() {
    this.version++;
    // A copy: a listener may unsubscribe (or subscribe) while we call them.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const cb of [...this.subs]) cb();
  }
  // ---- Who is here ----
  // The guests whose devices are in the room, by seat.
  here(): Guest[] {
    return this.guests.filter((g) => g.link).sort((a, b) => a.seat - b.seat);
  }
  guestAt(seat: number): Guest | undefined {
    return this.guests.find((g) => g.seat === seat);
  }
  private guestOf(link: Link): Guest | undefined {
    return this.guests.find((g) => g.link === link);
  }
  // The link to the other end: the host's for a guest, the first guest's for a
  // host (what a room of two has always had).
  get link(): Link | null {
    return this.role === 'guest'
      ? this.hostLink
      : (this.here()[0]?.link ?? null);
  }
  // The seats of the guests that are here.
  get seatsHere(): number[] {
    return this.here().map((g) => g.seat);
  }
  // How many houses a raid with everybody who has a seat has.
  get partySize(): number {
    return this.role === 'host'
      ? 1 + Math.max(1, ...this.guests.map((g) => g.seat))
      : Math.max(2, this.roster.length);
  }
  // How a seat is called in the room (the host's and the guests' names as the
  // players typed them, or "Гравець N").
  nameOf(seat: number): string {
    const row = (this.role === 'host' ? this.roomRoster() : this.roster).find(
      (r) => r.seat === seat,
    );
    return row?.name?.trim() || (seat === 0 ? 'Господар' : `Гравець ${seat + 1}`);
  }
  // Whoever else has the microphone on.
  get partnerMic(): boolean {
    return this.mics.some((on, s) => on && s !== (this.role === 'host' ? 0 : this.seat));
  }
  // The room as everybody is told: the host first.
  roomRoster(): RosterRow[] {
    return [
      {
        seat: 0,
        hero: this.me.hero,
        name: this.me.name,
        here: true,
        mic: !!this.mics[0],
        via: 'p2p',
      },
      ...this.guests
        .slice()
        .sort((a, b) => a.seat - b.seat)
        .map(
          (g): RosterRow => ({
            seat: g.seat,
            hero: g.partner.hero,
            name: g.partner.name,
            here: !!g.link,
            mic: !!this.mics[g.seat],
            via: g.link?.kind === 'relay' ? 'relay' : 'p2p',
          }),
        ),
    ];
  }
  // Host: the way a fight reaches its guests, all or some of them by seat.
  get hub(): Wire {
    return (this.hubOf ??= new HostHub(this));
  }
  private hubOf: HostHub | null = null;
  // Host: sends a message to the guests that are here (or only to some).
  sendTo(msg: Msg, only?: readonly number[]) {
    if (this.role !== 'host') return;
    for (const g of this.here())
      if (!only || only.includes(g.seat)) g.link!.send(msg);
  }
  // Host: the heroes of the guests that are here, by seat: the crew of a raid.
  crew(): string[] {
    return this.here().map((g) => g.partner.hero);
  }
  // Host: a raid begins with whoever is here. The seats close up (a guest who
  // left before it is no part of it) and nobody new may take one until
  // unlockCrew. Returns the heroes of the crew by seat - 1.
  lockCrew(): string[] {
    if (this.role !== 'host') return [];
    this.closeUp(this.here());
    this.crewLocked = true;
    this.sendRoster();
    this.change();
    return this.guests.map((g) => g.partner.hero);
  }
  // Host: the raid is over; the seats of those who are gone are free again.
  unlockCrew() {
    if (this.role !== 'host') return;
    this.crewLocked = false;
    this.closeUp(this.here());
    this.refresh();
    this.sendRoster();
    this.change();
  }
  // Host: the seats of this raid as they were when the room last stood, for
  // the guests to come back to them: nobody is here until they knock with their
  // tokens. The crew is fixed as it was.
  restore(seats: readonly SavedSeat[]) {
    if (this.role !== 'host') return;
    this.guests = seats.slice(0, MAX_PLAYERS - 1).map((s, i) => ({
      seat: i + 1,
      token: String(s.token),
      partner: { hero: String(s.hero), name: String(s.name) },
      link: null,
    }));
    this.crewLocked = true;
    this.refresh();
    this.change();
  }
  // Host: what to keep of the room to come back to it (restore).
  saveSeats(): SavedSeat[] {
    return this.guests
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((g) => ({
        token: g.token,
        hero: g.partner.hero,
        name: g.partner.name,
      }));
  }
  // Host: a guest that is away gives up its seat for good (the raid goes on).
  release(seat: number) {
    if (this.role !== 'host') return;
    const g = this.guestAt(seat);
    if (!g || g.link) return;
    this.guests = this.guests.filter((x) => x !== g);
    this.refresh();
    this.sendRoster();
    this.change();
  }
  private closeUp(guests: Guest[]) {
    this.guests = guests;
    this.guests.forEach((g, i) => {
      g.seat = i + 1;
    });
  }
  // Host: updates what the others read off the room.
  private refresh() {
    if (this.role !== 'host') return;
    const here = this.here();
    this.partner = here[0]?.partner ?? null;
    this.via = here.some((g) => g.link?.kind === 'relay') ? 'relay' : 'p2p';
    if (this.phase === 'closed' || this.phase === 'refused') return;
    this.phase = here.length ? 'connected' : 'waiting';
  }
  // Host: tells every guest who is in the room (and which seat is its own).
  private sendRoster() {
    if (this.role !== 'host') return;
    const roster = this.roomRoster();
    for (const g of this.here())
      g.link!.send({ t: 'roster', roster, you: g.seat });
  }
  // How the connection is going, for the guest's screen.
  note(text: string) {
    this.status = text;
    this.change();
  }
  setCode(code: string) {
    this.code = code;
    this.change();
  }
  fail(why: string) {
    this.error = why;
    if (this.phase !== 'connected') this.phase = 'refused';
    this.change();
  }
  // Takes a link that has just opened: the guest greets, the host listens.
  adopt(link: Link) {
    this.error = '';
    // A slow link suits the host counting the fights alone.
    if (this.role === 'host' && link.kind === 'relay') {
      this.mode = 'host';
      this.via = 'relay';
    }
    link.onMessage = (m) => this.handle(m, link);
    link.onClose = () => this.lost(link);
    link.onVoice = () => this.change();
    if (this.role === 'guest') {
      this.hostLink = link;
      this.via = link.kind === 'relay' ? 'relay' : 'p2p';
      this.phase = 'joining';
      link.send({
        t: 'hello',
        v: NET_PROTOCOL,
        build: this.build,
        hero: this.me.hero,
        name: this.me.name,
        // A guest that was in this room before asks for its own seat back.
        ...(this.token ? { token: this.token, seat: this.seat } : {}),
      });
    }
    this.change();
  }
  // Host: a knock at the door: a new guest takes a free seat, one coming back
  // takes its own.
  private greet(m: Msg & { t: 'hello' }, link: Link) {
    if (m.v !== NET_PROTOCOL || m.build !== this.build) {
      link.send({ t: 'refuse', why: `version:${this.build}` });
      link.close();
      return;
    }
    const name = typeof m.name === 'string' ? m.name.slice(0, 40) : '';
    let guest =
      typeof m.token === 'string' && m.token
        ? this.guests.find((g) => g.token === m.token && g.seat === m.seat)
        : undefined;
    const back = !!guest;
    if (guest) {
      // Its old link may not have been noticed as dead yet.
      const old = guest.link;
      guest.link = link;
      guest.partner = { hero: guest.partner.hero, name };
      if (old && old !== link) {
        old.onClose = null;
        old.onMessage = null;
        try {
          old.close();
        } catch {
          // Already gone.
        }
      }
    } else {
      if (this.crewLocked) {
        link.send({ t: 'refuse', why: 'started' });
        link.close();
        return;
      }
      let seat = 1;
      while (seat < MAX_PLAYERS && this.guestAt(seat)) seat++;
      if (seat >= MAX_PLAYERS) {
        link.send({ t: 'refuse', why: 'busy' });
        link.close();
        return;
      }
      guest = {
        seat,
        token: makeToken(),
        partner: { hero: m.hero, name },
        link,
      };
      this.guests.push(guest);
    }
    this.refresh();
    link.send({
      t: 'welcome',
      v: NET_PROTOCOL,
      build: this.build,
      seat: guest.seat,
      token: guest.token,
      roster: this.roomRoster(),
    });
    this.sendRoster();
    // Whatever the others have been told since the room opened: the status, the
    // house, the map and the vote that are open now.
    if (this.lastStatus) link.send({ t: 'status', text: this.lastStatus });
    if (this.lastView) link.send({ t: 'view', run: this.lastView });
    if (this.hostMap) link.send({ t: 'map', run: this.hostMap });
    if (this.ballot) link.send({ t: 'ballot', ...this.ballot });
    this.change();
    if (back) this.onReturn?.(guest.seat);
  }
  private handle(m: Msg, from: Link) {
    this.heardAt.set(from, Date.now());
    if (m.t === 'ping') return;
    const guest = this.role === 'host' ? this.guestOf(from) : undefined;
    // A host hears only the guests it has greeted.
    if (this.role === 'host') {
      if (m.t === 'hello') return this.greet(m, from);
      if (!guest) return;
    }
    switch (m.t) {
      case 'welcome':
        if (this.role !== 'guest') return;
        this.phase = 'connected';
        this.seat = m.seat;
        this.token = typeof m.token === 'string' ? m.token : '';
        this.takeRoster(m.roster);
        this.change();
        return;
      case 'roster':
        if (this.role !== 'guest') return;
        if (Number.isInteger(m.you) && (m.you as number) > 0)
          this.seat = m.you as number;
        this.takeRoster(m.roster);
        this.change();
        return;
      case 'refuse':
        this.error = m.why;
        this.phase = 'refused';
        this.hostLink?.close();
        this.hostLink = null;
        this.change();
        return;
      case 'status':
        this.status = m.text;
        this.change();
        return;
      case 'map':
        // Guest: the host's run, to draw the map the vote is about; null
        // when the vote is over.
        if (this.role !== 'guest') return;
        if (m.run === null) {
          this.map = null;
          this.ballot = null;
        } else if (m.run && typeof m.run === 'object') this.map = m.run;
        else return;
        this.change();
        return;
      case 'ballot': {
        if (this.role !== 'guest') return;
        const b = readBallot(m);
        if (!b) return;
        this.ballot = b;
        this.change();
        return;
      }
      case 'vote': {
        // Host: a guest picks; only a column of the open step counts.
        if (!guest || !this.ballot || m.step !== this.ballot.step) return;
        const next = castVote(this.ballot, guest.seat, m.col);
        if (next === this.ballot) return;
        this.ballot = next;
        this.broadcast();
        this.change();
        this.onVoted?.();
        return;
      }
      case 'view':
        if (this.role !== 'guest') return;
        this.view = m.run && typeof m.run === 'object' ? m.run : null;
        this.change();
        return;
      case 'take':
        if (
          !guest ||
          (m.source !== 'reward' && m.source !== 'shop') ||
          !Number.isInteger(m.index) ||
          m.index < 0 ||
          m.index > 20 ||
          typeof m.id !== 'string' ||
          m.id.length > 60
        )
          return;
        this.onTake?.({ source: m.source, index: m.index, id: m.id }, guest.seat);
        return;
      case 'house':
        if (
          !guest ||
          !m.house ||
          typeof m.house !== 'object' ||
          typeof m.coins !== 'number' ||
          typeof m.scrap !== 'number'
        )
          return;
        this.onHouse?.(
          { house: m.house, coins: m.coins, scrap: m.scrap },
          guest.seat,
        );
        return;
      case 'start':
        if (this.role !== 'guest') return;
        this.ballot = null;
        this.map = null;
        if (Number.isInteger(m.seat) && (m.seat as number) > 0)
          this.seat = m.seat as number;
        if (this.onStart) this.onStart(m);
        else this.pendingStart = m;
        return;
      case 'ready': {
        // Host: a guest has built the fight; it starts once all of them have.
        if (!guest) return;
        const w = this.waiting.get(m.sid);
        if (!w) return;
        w.need.delete(guest.seat);
        if (!w.need.size) {
          this.waiting.delete(m.sid);
          w.done(m.sid);
        }
        return;
      }
      case 'gift':
        if (this.role === 'guest')
          this.onGift?.({
            cores: m.cores,
            won: !!m.won,
            final: !!m.final,
            // Only ids that look like ours, and not too many of them.
            story: Array.isArray(m.story)
              ? m.story
                  .filter((id) => typeof id === 'string' && SCENE_ID.test(id))
                  .slice(0, 60)
              : [],
            all: !!m.all,
          });
        return;
      case 'scene':
        // Only the id of a scene crosses the wire: the guest plays it from its
        // own copy of the game, and only if the id looks like one of ours.
        if (this.role !== 'guest' || !SCENE_ID.test(String(m.id))) return;
        if (this.onScene) this.onScene(m.id);
        else if (this.heldScenes.length < HELD_SCENES)
          this.heldScenes.push(m.id);
        return;
      case 'chat': {
        // Somebody says something: a line of text or a quick phrase, kept
        // short and clean, and only so fast. The host passes a guest's line on.
        const seat = guest ? guest.seat : Number.isInteger(m.seat) ? (m.seat as number) : 0;
        if (seat === this.seat && this.role === 'guest') return;
        const text = m.q !== undefined ? quickText(m.q) : cleanChat(m.text);
        let limiter = this.limiters.get(seat);
        if (!limiter) this.limiters.set(seat, (limiter = new ChatLimiter()));
        if (!text || !limiter.allow(Date.now())) return;
        this.addLine({
          id: ++this.chatId,
          mine: false,
          seat,
          text,
          quick: m.q !== undefined ? m.q : undefined,
          at: Date.now(),
        });
        if (guest)
          this.sendTo(
            m.q !== undefined
              ? { t: 'chat', q: m.q, seat }
              : { t: 'chat', text, seat },
            this.seatsHere.filter((s) => s !== seat),
          );
        return;
      }
      case 'voice': {
        const seat = guest ? guest.seat : Number.isInteger(m.seat) ? (m.seat as number) : 0;
        this.mics[seat] = !!m.on;
        if (guest)
          this.sendTo(
            { t: 'voice', on: !!m.on, seat },
            this.seatsHere.filter((s) => s !== seat),
          );
        this.change();
        return;
      }
      case 'bye':
        this.lost(from);
        return;
      default:
        // 'in', 'perk', 'hash', 'over', 'snap', 'pin', 'end', 'desync': for the
        // fight, which may not exist yet at this end (the other one began
        // first).
        if (!('sid' in m)) return;
        if (this.fight) {
          if (m.sid === this.fight.sid) this.fight.receive(m, guest?.seat);
        } else if (this.held.length < HELD_MAX)
          this.held.push({ m, from: guest?.seat });
    }
  }
  // Guest: the room as the host described it.
  private takeRoster(roster: RosterRow[] | undefined) {
    if (!Array.isArray(roster)) return;
    this.roster = roster
      .filter(
        (r) =>
          r &&
          Number.isInteger(r.seat) &&
          r.seat >= 0 &&
          r.seat < MAX_PLAYERS &&
          typeof r.hero === 'string' &&
          typeof r.name === 'string',
      )
      .map(
        (r): RosterRow => ({
          seat: r.seat,
          hero: r.hero.slice(0, 40),
          name: r.name.slice(0, 40),
          here: !!r.here,
          mic: !!r.mic,
          via: r.via === 'relay' ? 'relay' : 'p2p',
        }),
      )
      .slice(0, MAX_PLAYERS);
    for (const r of this.roster) this.mics[r.seat] = r.mic;
    const host = this.roster.find((r) => r.seat === 0);
    this.partner = host ? { hero: host.hero, name: host.name } : this.partner;
  }
  private addLine(line: ChatLine) {
    this.chat = [...this.chat, line].slice(-CHAT.keep);
    if (!line.mine && !this.chatOpen) this.unread++;
    this.change();
    if (!line.mine) this.onChat?.(line);
  }
  // ---- Is the other end still there ----
  // Said to a link when it is quiet, and how long a silence is believed.
  static readonly PING_EVERY = 2500;
  static readonly SILENT_FOR = 9000;
  private heardAt = new Map<Link, number>();
  // Called now and then by whoever owns the session (the screen): says "still
  // here" to every link, and lets go of one that has said nothing for long, as
  // if it had closed, so that its seat is kept for it and the fight goes on.
  heartbeat(now = Date.now()) {
    const links: Link[] =
      this.role === 'host'
        ? this.guests.flatMap((g) => (g.link ? [g.link] : []))
        : this.hostLink
          ? [this.hostLink]
          : [];
    for (const link of links) {
      if (!this.heardAt.has(link)) this.heardAt.set(link, now);
      try {
        link.send({ t: 'ping' });
      } catch {
        // The link is closing.
      }
      if (now - (this.heardAt.get(link) ?? now) > NetSession.SILENT_FOR) {
        this.heardAt.delete(link);
        try {
          link.close();
        } catch {
          // Already closed.
        }
        this.lost(link);
      }
    }
  }
  // This end's own seat: 0 for the host.
  get mySeat(): number {
    return this.role === 'host' ? 0 : this.seat;
  }
  // Says a line of text to the others. False if there was nothing to say or
  // nobody to say it to.
  say(text: string): boolean {
    const clean = cleanChat(text);
    if (!clean || !this.talking()) return false;
    this.speak({ t: 'chat', text: clean });
    this.addLine({
      id: ++this.chatId,
      mine: true,
      seat: this.mySeat,
      text: clean,
      at: Date.now(),
    });
    return true;
  }
  // Says quick phrase number `q` to the others.
  sayQuick(q: number): boolean {
    const text = quickText(q);
    if (!text || !this.talking()) return false;
    this.speak({ t: 'chat', q });
    this.addLine({
      id: ++this.chatId,
      mine: true,
      seat: this.mySeat,
      text,
      quick: q,
      at: Date.now(),
    });
    return true;
  }
  private talking(): boolean {
    return this.phase === 'connected' && (this.role === 'host' ? this.here().length > 0 : !!this.hostLink);
  }
  // A guest sends to the host (which passes it on); the host to everybody.
  private speak(msg: Msg) {
    if (this.role === 'host') this.sendTo(msg);
    else this.hostLink?.send(msg);
  }
  // The chat panel is opened or closed; what was read is no longer new.
  openChat(open: boolean) {
    this.chatOpen = open;
    if (open) this.unread = 0;
    this.change();
  }
  // This end's microphone is on or off, told to the others.
  tellMic(on: boolean) {
    this.mics[this.mySeat] = on;
    if (this.talking()) this.speak({ t: 'voice', on });
    this.change();
  }
  // Whether a voice chat is possible on this link (a direct one is).
  get voiceLink() {
    return this.link?.voice ?? null;
  }
  // The voice of every link that has one: a guest's one to the host, a host's
  // one to each guest that is here, by seat.
  voiceLinks(): { seat: number; link: VoiceLink }[] {
    return this.role === 'host'
      ? this.here().flatMap((g) =>
          g.link?.voice ? [{ seat: g.seat, link: g.link.voice }] : [],
        )
      : this.hostLink?.voice
        ? [{ seat: 0, link: this.hostLink.voice }]
        : [];
  }
  // The link is still getting its voice connection ready.
  get voicePending() {
    return !!this.link?.voicePending;
  }
  private lost(link: Link | null) {
    if (this.role === 'guest') {
      if (link && this.hostLink && link !== this.hostLink) return;
      this.mics = [];
      this.hostLink = null;
      this.ballot = null;
      this.map = null;
      this.view = null;
      for (const w of this.waiting.values()) w.done(null);
      this.waiting.clear();
      this.fight?.handleClose();
      if (this.phase !== 'refused') this.phase = 'closed';
      this.change();
      return;
    }
    if (link) this.heardAt.delete(link);
    const guest = link ? this.guestOf(link) : undefined;
    // A link that never greeted, or one that was already replaced.
    if (!guest) return;
    guest.link = null;
    this.mics[guest.seat] = false;
    // Before a raid its seat is free again; during one it is kept for the
    // guest to come back to.
    if (!this.crewLocked) this.guests = this.guests.filter((g) => g !== guest);
    // A fight that was waiting for this guest cannot start.
    for (const [sid, w] of this.waiting)
      if (w.need.has(guest.seat)) {
        this.waiting.delete(sid);
        w.done(null);
      }
    if (this.ballot) {
      this.ballot = {
        ...this.ballot,
        away: this.awaySeats(),
      };
      this.broadcast();
    }
    this.refresh();
    if (!this.here().length) {
      this.ballot = null;
      this.map = null;
      this.view = null;
    }
    // The fight goes on without it where it can, or ends where it cannot.
    if (this.fight) {
      if (this.fight.seatLost) this.fight.seatLost(guest.seat);
      else this.fight.handleClose();
    }
    this.sendRoster();
    this.change();
  }
  // The host tells the guests what it is doing (map, shop, event...).
  sendStatus(text: string) {
    this.lastStatus = text;
    if (this.role !== 'host' || this.phase !== 'connected') return;
    this.sendTo({ t: 'status', text });
  }
  private broadcast() {
    if (this.role === 'host' && this.ballot) this.sendTo({ t: 'ballot', ...this.ballot });
  }
  // The seats a vote has to count: the host's and every guest's (those that
  // are away are marked, and nobody waits for them).
  private ballotSeats(): number {
    return Math.max(2, 1 + Math.max(0, ...this.guests.map((g) => g.seat)));
  }
  private awaySeats(): number[] {
    return this.guests.filter((g) => !g.link).map((g) => g.seat);
  }
  // Host: the map is open and the next stop is a vote; the guests get the map
  // to look at and an empty ballot.
  openVote(run: unknown, step: number, options: readonly number[]) {
    if (this.role !== 'host' || this.phase !== 'connected') return;
    this.ballot = newBallot(step, options, this.ballotSeats(), this.awaySeats());
    this.hostMap = run;
    this.sendTo({ t: 'map', run });
    this.broadcast();
    this.change();
  }
  // Host: the host's own pick.
  voteHost(col: number) {
    if (this.role !== 'host' || !this.ballot) return;
    const next = castVote(this.ballot, 0, col);
    if (next === this.ballot) return;
    this.ballot = next;
    this.broadcast();
    this.change();
  }
  // Guest: the guest's pick, told to the host.
  voteGuest(col: number) {
    if (this.role !== 'guest' || this.phase !== 'connected' || !this.ballot)
      return;
    const next = castVote(this.ballot, this.seat, col);
    if (next === this.ballot) return;
    this.ballot = next;
    this.hostLink?.send({ t: 'vote', step: next.step, col });
    this.change();
  }
  // Host: the vote is decided; every end sees where the raid goes.
  settle(done: { col: number; coin: boolean }) {
    if (this.role !== 'host' || !this.ballot || this.ballot.done) return;
    this.ballot = { ...this.ballot, done };
    this.broadcast();
    this.change();
  }
  // Host: the guests are told what the host sees now (see Msg 'view').
  sendView(run: unknown) {
    if (this.role === 'host') this.lastView = run;
    if (this.role === 'host' && this.phase === 'connected')
      this.sendTo({ t: 'view', run });
  }
  // Guest: takes a find from the reward or buys from the shop.
  take(source: 'reward' | 'shop', index: number, id: string) {
    if (this.role === 'guest' && this.phase === 'connected')
      this.hostLink?.send({ t: 'take', source, index, id });
  }
  // Guest: its own house after a change, for the host to check and take.
  sendHouse(house: unknown, coins: number, scrap: number) {
    if (this.role === 'guest' && this.phase === 'connected')
      this.hostLink?.send({ t: 'house', house, coins, scrap });
  }
  // Host: an event is decided by all the players with the same ballot as the
  // map's, the choices of the event being its columns; no map goes with it.
  openEventVote(step: number, options: readonly number[]) {
    if (this.role !== 'host' || this.phase !== 'connected') return;
    this.ballot = newBallot(step, options, this.ballotSeats(), this.awaySeats());
    this.broadcast();
    this.change();
  }
  // Host: the vote is over (the fight or the room is next).
  closeVote() {
    if (!this.ballot && !this.map) return;
    this.ballot = null;
    this.map = null;
    this.hostMap = null;
    if (this.role === 'host' && this.phase === 'connected')
      this.sendTo({ t: 'map', run: null });
    this.change();
  }
  // Host: opens a fight at the guests' ends; resolves with its id once every
  // guest here has built it, or null if one left or did not answer.
  open(
    run: unknown,
    meta: unknown,
    wait = START_TIMEOUT,
    // Seats of the raid whose guests are not here as the fight begins.
    away: readonly number[] = [],
  ): Promise<number | null> {
    const here = this.here();
    if (this.role !== 'host' || this.phase !== 'connected' || !here.length)
      return Promise.resolve(null);
    const sid = ++this.sid;
    this.ballot = null;
    this.map = null;
    this.hostMap = null;
    this.lastStart = { sid, run, meta };
    for (const g of here)
      g.link!.send({
        t: 'start',
        sid,
        run,
        meta,
        mode: this.mode,
        seat: g.seat,
        ...(away.length ? { away: [...away] } : {}),
      });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(sid);
        resolve(null);
      }, wait);
      this.waiting.set(sid, {
        need: new Set(here.map((g) => g.seat)),
        done: (id) => {
          clearTimeout(timer);
          resolve(id);
        },
      });
    });
  }
  // Host: the fight is over (or left); nobody can come back into it.
  endFight() {
    this.lastStart = null;
  }
  // Host: a guest comes back into the fight that is on, or drifted from it: it
  // is sent the fight again, as a mirror (it draws what the host streams), and
  // the host makes its input into the frames of its seat. Resolves true when
  // there was a fight to bring it into.
  restartFor(seat: number, away: readonly number[] = []): boolean {
    const g = this.guestAt(seat);
    if (this.role !== 'host' || !g?.link || !this.lastStart) return false;
    g.link.send({
      t: 'start',
      ...this.lastStart,
      mode: 'host',
      seat,
      ...(away.length ? { away: [...away] } : {}),
    });
    return true;
  }
  // The sid of the fight that is on.
  get fightSid(): number {
    return this.lastStart?.sid ?? 0;
  }
  // Guest: the fight the host opened before this end could listen, if any.
  takeStart(): StartMsg | null {
    const m = this.pendingStart;
    this.pendingStart = null;
    return m;
  }
  // Host: a scene begins; the guests are shown it too.
  sendScene(id: string) {
    if (this.role === 'host' && this.phase === 'connected')
      this.sendTo({ t: 'scene', id });
  }
  // Guest: the scenes that began before this end listened.
  takeScenes(): string[] {
    const held = this.heldScenes;
    this.heldScenes = [];
    return held;
  }
  // Host: the raid ended; the guests get a share of what it earned and the
  // story of the raid's end to watch from their own copy (story.ts raidEndStory).
  sendGift(
    cores: number,
    won: boolean,
    final: boolean,
    story: { scenes: string[]; all: boolean } = { scenes: [], all: false },
  ) {
    if (this.role === 'host' && this.phase === 'connected')
      this.sendTo({
        t: 'gift',
        cores,
        won,
        final,
        story: story.scenes,
        all: story.all,
      });
  }
  // Guest: the fight is built and listening.
  ready(sid: number) {
    this.hostLink?.send({ t: 'ready', sid });
  }
  attach(fight: FightLink) {
    this.fight = fight;
    const held = this.held.filter(
      (h) => 'sid' in h.m && h.m.sid === fight.sid,
    );
    this.held = [];
    for (const h of held) fight.receive(h.m, h.from);
  }
  detach(fight: FightLink) {
    if (this.fight === fight) this.fight = null;
    this.held = [];
  }
  close() {
    this.roomOpen = false;
    for (const link of this.role === 'host'
      ? this.guests.flatMap((g) => (g.link ? [g.link] : []))
      : this.hostLink
        ? [this.hostLink]
        : []) {
      try {
        link.send({ t: 'bye' });
      } catch {
        // The link is already gone.
      }
      link.close();
    }
    this.hostLink = null;
    for (const g of this.guests) g.link = null;
    this.phase = 'closed';
    for (const w of this.waiting.values()) w.done(null);
    this.waiting.clear();
    this.change();
  }
}
