// The two ends of an online co-op room (net.ts has the fight itself): who is
// the host and who is the guest, the greeting (build and protocol must match),
// the host's status lines between fights and the opening of each fight. It
// owns the link, so no message is lost between screens: whatever arrives
// before the fight it belongs to exists is held and handed over on attach.
import {
  NET_PROTOCOL,
  type FightLink,
  type Link,
  type Msg,
  type ShareMode,
} from './net';
import { castVote, newBallot, readBallot, type Ballot } from './coop';

export type Phase = 'waiting' | 'joining' | 'connected' | 'refused' | 'closed';
export interface Partner {
  hero: string;
  name: string;
}
export interface StartMsg {
  sid: number;
  run: unknown;
  meta: unknown;
  mode?: ShareMode;
}
// A fight that was not answered within this many ms did not start.
export const START_TIMEOUT = 20000;
const HELD_MAX = 900;

export class NetSession {
  phase: Phase;
  // The room code (host: the one to tell; guest: the one joined).
  code = '';
  error = '';
  // The other end: the guest for the host, the host for the guest.
  partner: Partner | null = null;
  // Guest only: what the host says it is doing between fights.
  status = '';
  link: Link | null = null;
  fight: FightLink | null = null;
  // Host: how the next fights are shared (see net.ts ShareMode).
  mode: ShareMode = 'sync';
  // Guest only: called when the host opens a fight.
  onStart: ((m: StartMsg) => void) | null = null;
  // Guest only: the host's raid is over and this is what it earned.
  onGift: ((m: { cores: number; won: boolean; final: boolean }) => void) | null =
    null;
  // Bumps on every change, for React's useSyncExternalStore.
  version = 0;
  // The vote for the next stop of the raid, as both ends see it, and (guest)
  // the host's run to draw the map from. Nothing here while no map is open.
  ballot: Ballot | null = null;
  map: unknown = null;
  // Host: the guest has voted.
  onVoted: (() => void) | null = null;
  // Host: the room still takes a guest after one has left.
  roomOpen = true;
  private pendingStart: StartMsg | null = null;
  private subs = new Set<() => void>();
  private held: Msg[] = [];
  private waiting = new Map<number, (sid: number | null) => void>();
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
    for (const cb of [...this.subs]) cb();
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
    this.link = link;
    this.error = '';
    link.onMessage = (m) => this.handle(m);
    link.onClose = () => this.lost(link);
    if (this.role === 'guest') {
      this.phase = 'joining';
      link.send({
        t: 'hello',
        v: NET_PROTOCOL,
        build: this.build,
        hero: this.me.hero,
        name: this.me.name,
      });
    }
    this.change();
  }
  private handle(m: Msg) {
    switch (m.t) {
      case 'hello': {
        if (this.role !== 'host' || this.phase === 'connected') return;
        if (m.v !== NET_PROTOCOL || m.build !== this.build) {
          this.link?.send({ t: 'refuse', why: `version:${this.build}` });
          this.link?.close();
          this.link = null;
          return;
        }
        this.partner = { hero: m.hero, name: m.name };
        this.phase = 'connected';
        this.link?.send({ t: 'welcome', v: NET_PROTOCOL, build: this.build });
        this.change();
        return;
      }
      case 'welcome':
        if (this.role !== 'guest') return;
        this.phase = 'connected';
        this.partner = { hero: '', name: '' };
        this.change();
        return;
      case 'refuse':
        this.error = m.why;
        this.phase = 'refused';
        this.link?.close();
        this.link = null;
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
        // Host: the guest picks; only a column of the open step counts.
        if (this.role !== 'host' || !this.ballot || m.step !== this.ballot.step)
          return;
        const next = castVote(this.ballot, 'guest', m.col);
        if (next === this.ballot) return;
        this.ballot = next;
        this.broadcast();
        this.change();
        this.onVoted?.();
        return;
      }
      case 'start':
        if (this.role !== 'guest') return;
        this.ballot = null;
        this.map = null;
        if (this.onStart) this.onStart(m);
        else this.pendingStart = m;
        return;
      case 'ready': {
        const done = this.waiting.get(m.sid);
        this.waiting.delete(m.sid);
        done?.(m.sid);
        return;
      }
      case 'gift':
        if (this.role === 'guest') this.onGift?.(m);
        return;
      case 'bye':
        this.lost(this.link);
        return;
      default:
        // 'in', 'perk', 'hash', 'over': for the fight, which may not exist
        // yet at this end (the other one began first).
        if (this.fight) {
          if (m.sid === this.fight.sid) this.fight.receive(m);
        } else if (this.held.length < HELD_MAX) this.held.push(m);
    }
  }
  private lost(link: Link | null) {
    if (link && this.link && link !== this.link) return;
    this.link = null;
    this.ballot = null;
    this.map = null;
    for (const done of this.waiting.values()) done(null);
    this.waiting.clear();
    this.fight?.handleClose();
    if (this.role === 'host' && this.roomOpen) {
      this.partner = null;
      this.phase = 'waiting';
    } else if (this.phase !== 'refused') this.phase = 'closed';
    this.change();
  }
  // The host tells the guest what it is doing (map, shop, event...).
  sendStatus(text: string) {
    if (this.role !== 'host' || this.phase !== 'connected') return;
    this.link?.send({ t: 'status', text });
  }
  private broadcast() {
    if (this.role === 'host' && this.phase === 'connected' && this.ballot)
      this.link?.send({ t: 'ballot', ...this.ballot });
  }
  // Host: the map is open and the next stop is a vote; the guest gets the map
  // to look at and an empty ballot.
  openVote(run: unknown, step: number, options: readonly number[]) {
    if (this.role !== 'host' || this.phase !== 'connected') return;
    this.ballot = newBallot(step, options);
    this.link?.send({ t: 'map', run });
    this.broadcast();
    this.change();
  }
  // Host: the host's own pick.
  voteHost(col: number) {
    if (this.role !== 'host' || !this.ballot) return;
    const next = castVote(this.ballot, 'host', col);
    if (next === this.ballot) return;
    this.ballot = next;
    this.broadcast();
    this.change();
  }
  // Guest: the guest's pick, told to the host.
  voteGuest(col: number) {
    if (this.role !== 'guest' || this.phase !== 'connected' || !this.ballot)
      return;
    const next = castVote(this.ballot, 'guest', col);
    if (next === this.ballot) return;
    this.ballot = next;
    this.link?.send({ t: 'vote', step: next.step, col });
    this.change();
  }
  // Host: the vote is decided; both ends see where the raid goes.
  settle(done: { col: number; coin: boolean }) {
    if (this.role !== 'host' || !this.ballot || this.ballot.done) return;
    this.ballot = { ...this.ballot, done };
    this.broadcast();
    this.change();
  }
  // Host: the vote is over (the fight or the room is next).
  closeVote() {
    if (!this.ballot && !this.map) return;
    this.ballot = null;
    this.map = null;
    if (this.role === 'host' && this.phase === 'connected')
      this.link?.send({ t: 'map', run: null });
    this.change();
  }
  // Host: opens a fight at the guest's end; resolves with its id once the
  // guest has built it, or null if the guest left or did not answer.
  open(
    run: unknown,
    meta: unknown,
    wait = START_TIMEOUT,
  ): Promise<number | null> {
    if (this.role !== 'host' || this.phase !== 'connected' || !this.link)
      return Promise.resolve(null);
    const sid = ++this.sid;
    this.ballot = null;
    this.map = null;
    this.link.send({ t: 'start', sid, run, meta, mode: this.mode });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(sid);
        resolve(null);
      }, wait);
      this.waiting.set(sid, (id) => {
        clearTimeout(timer);
        resolve(id);
      });
    });
  }
  // Guest: the fight the host opened before this end could listen, if any.
  takeStart(): StartMsg | null {
    const m = this.pendingStart;
    this.pendingStart = null;
    return m;
  }
  // Host: the raid ended; the guest gets a share of what it earned.
  sendGift(cores: number, won: boolean, final: boolean) {
    if (this.role === 'host' && this.phase === 'connected')
      this.link?.send({ t: 'gift', cores, won, final });
  }
  // Guest: the fight is built and listening.
  ready(sid: number) {
    this.link?.send({ t: 'ready', sid });
  }
  attach(fight: FightLink) {
    this.fight = fight;
    const held = this.held.filter((m) => 'sid' in m && m.sid === fight.sid);
    this.held = [];
    for (const m of held) fight.receive(m);
  }
  detach(fight: FightLink) {
    if (this.fight === fight) this.fight = null;
    this.held = [];
  }
  close() {
    this.roomOpen = false;
    try {
      this.link?.send({ t: 'bye' });
    } catch {
      // The link is already gone.
    }
    this.link?.close();
    this.link = null;
    this.phase = 'closed';
    for (const done of this.waiting.values()) done(null);
    this.waiting.clear();
    this.change();
  }
}
