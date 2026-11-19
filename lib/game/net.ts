// Online co-op: up to four devices, one fight. Every device runs the very same
// simulation and only the players' inputs cross the network ("lockstep"): the
// engine is deterministic for a given run, meta and sequence of inputs, which
// the tests of the headless simulations already rely on. Whoever hosts the room
// owns the campaign (map, shop, events); the guests join the fights as the
// neighbours of co-op (coop.ts), each controlling a Battle.ally of its seat. The
// guests talk to the host only (a star): it passes on what the others need.
//
// Nothing here knows about PeerJS or the browser: a `Link` is any ordered,
// reliable pipe of messages, so tests wire two fights with a pair of arrays.
import type { Battle } from './engine';

// Both ends must run the same build: the simulation is only repeatable inside
// one version of the code, so a mismatch is refused at the door.
export const NET_PROTOCOL = 10;
// How a fight is shared: both ends simulate it and trade inputs ('sync'), or
// the host alone simulates and streams it to the guest ('host').
export type ShareMode = 'sync' | 'host';
// Whatever a fight at one end is: the lockstep or the mirror feed/client.
export interface FightLink {
  readonly sid: number;
  // `from` is the seat the message came from (a host hears from many).
  receive(msg: Msg, from?: number): void;
  // The link to the host (or to every guest) is gone.
  handleClose(): void;
  // One seat's device is gone: the host's fight goes on without it.
  seatLost?(seat: number): void;
}
// Whatever a fight sends through: a link to the host (a guest), or the host's
// way to its guests, to all of them or only some (by seat).
export interface Wire {
  readonly kind?: 'p2p' | 'relay';
  // The host's way to its guests: how it reaches one of them.
  kindOf?(seat: number): 'p2p' | 'relay';
  readonly open: boolean;
  send(msg: Msg, only?: readonly number[]): void;
}
// The fixed step of the simulation, in seconds: both ends run 60 of them a
// second of game time, whatever their screens do.
export const STEP = 1 / 60;
// Steps of delay between pressing a key and the key mattering: the price of
// waiting for the other end. 5 steps are 83 ms.
export const INPUT_DELAY = 5;
// How often both ends compare a hash of the fight to notice a drift.
export const HASH_EVERY = 120;
// Real seconds a fight may wait for the partner before the UI offers to leave.
export const STALL_WARN = 3;
export const STALL_GIVE_UP = 12;

// What one player does in one step: a direction (hundredths) and two presses.
export interface Frame {
  x: number;
  y: number;
  dash: boolean;
  pulse: boolean;
  // The host's word that nobody plays this seat just now (its device is gone):
  // every end stands the house still and spares it.
  away?: boolean;
}
export const NEUTRAL: Frame = { x: 0, y: 0, dash: false, pulse: false };
const AWAY: Frame = { x: 0, y: 0, dash: false, pulse: false, away: true };

// A router that will not let two devices talk directly (mobile internet, strict
// networks) needs a relay (TURN). No free public one that works without an
// account is left (the servers PeerJS used to give no longer exist), so a player
// who needs one sets up their own: a free account at any TURN provider gives
// the addresses, a user name and a password. It lives on this device and is
// used for every room made or joined from it.
export interface Relay {
  urls: string[];
  username: string;
  credential: string;
}
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
// Free public STUN servers: they only tell a device how it looks from outside.
export const STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
];
// The relay a person typed, or null unless it is usable: one to eight turn:,
// turns: or stun: addresses (at least one turn), a user name and a password.
export function parseRelay(
  urls: unknown,
  username: unknown,
  credential: unknown,
): Relay | null {
  if (
    typeof urls !== 'string' ||
    typeof username !== 'string' ||
    typeof credential !== 'string'
  )
    return null;
  const list = urls.split(/[\s,;]+/).filter(Boolean),
    user = username.trim(),
    pass = credential.trim();
  const fine =
    list.length > 0 &&
    list.length <= 8 &&
    list.every((u) => /^(turns?|stuns?):[^\s]{3,200}$/i.test(u)) &&
    list.some((u) => /^turns?:/i.test(u));
  if (!fine || !user || !pass || user.length > 256 || pass.length > 256)
    return null;
  return { urls: list, username: user, credential: pass };
}
export function iceServers(relay: Relay | null): IceServer[] {
  const out: IceServer[] = STUN_SERVERS.map((urls) => ({ urls }));
  if (relay)
    out.push({
      urls: relay.urls,
      username: relay.username,
      credential: relay.credential,
    });
  return out;
}

// Who is in the room, as everybody is told: seat 0 is the host.
export interface RosterRow {
  seat: number;
  hero: string;
  name: string;
  // The device is in the room (false: the seat is kept for them to come back).
  here: boolean;
  mic: boolean;
  via: 'p2p' | 'relay';
}
export type Msg =
  // Guest to host, first thing: who is knocking, and with which build. A guest
  // coming back brings the token it was given and its seat.
  | {
      t: 'hello';
      v: number;
      build: string;
      hero: string;
      name: string;
      token?: string;
      seat?: number;
    }
  // Host to guest: the seat it has, the token to come back with, and who else
  // is in the room.
  | {
      t: 'welcome';
      v: number;
      build: string;
      seat: number;
      token: string;
      roster: RosterRow[];
    }
  // Host to a guest, whenever somebody comes, goes or switches the microphone:
  // the room, and which seat is the guest's own (`you`).
  | { t: 'roster'; roster: RosterRow[]; you?: number }
  | { t: 'refuse'; why: string }
  // Host to guest between fights: a line of what the host is doing.
  | { t: 'status'; text: string }
  // The map is open and the next stop is a vote: the host's run for the guest
  // to look at, then the votes as they stand (coop.ts Ballot), and the guest's
  // own pick of a column of the step.
  | { t: 'map'; run: unknown } // run null: the vote is over
  | {
      t: 'ballot';
      step: number;
      options: number[];
      votes: (number | null)[];
      away?: number[];
      done?: { col: number; coin: boolean };
    }
  | { t: 'vote'; step: number; col: number }
  // Host to guest, whenever it changes: the host's run as the guest sees it
  // (the house, the guest's modules, its row of the reward, the shop). And
  // guest to host: the guest takes its find or buys from the shop; the host
  // checks it against its own run and does it.
  | { t: 'view'; run: unknown }
  | { t: 'take'; source: 'reward' | 'shop'; index: number; id: string }
  // Guest to host: the guest rearranged its own house (rooms, modules,
  // furniture, expansion); the host takes it only if nothing came from nowhere
  // (model.ts acceptMateHouse). The shared coins and scrap come with it.
  | { t: 'house'; house: unknown; coins: number; scrap: number }
  // Host to guest: a story scene or cutscene begins at the host (by its id),
  // for the guest to watch too, once, if it has not seen it.
  | { t: 'scene'; id: string }
  // A fight begins: the run and the profile the simulation is made from, and
  // how it is shared: 'sync' (both simulate, net.ts) or 'host' (mirror.ts).
  // `seat` is the one the guest plays, `mode` how it takes part: a guest on a
  // slow link is a mirror even in a fight the others simulate.
  | {
      t: 'start';
      sid: number;
      run: unknown;
      meta: unknown;
      mode?: ShareMode;
      seat?: number;
      // Seats whose guests are not here as it begins.
      away?: number[];
    }
  | { t: 'ready'; sid: number }
  // Inputs: [step, x, y, flags] per player-step (flags: 1 dash, 2 pulse, 4 the
  // seat is away). From a guest they are its own; from the host, those of the
  // seat that is named (the host's own, or those it passes on or makes up).
  | { t: 'in'; sid: number; f: number[][]; seat?: number }
  // A perk taken by one player for their own house (who: its seat), for every
  // end to take at the same moment. A guest does not say who: the host knows.
  | { t: 'perk'; sid: number; id: string; who?: number }
  | { t: 'hash'; sid: number; s: number; h: number }
  // Host to a guest: its end of the fight no longer matches (see Lockstep).
  | { t: 'desync'; sid: number }
  // The host left the fight (menu, defeat screen): the guest can leave too.
  | { t: 'over'; sid: number }
  // Mirror mode: the host's snapshot, the guest's input, the host's result.
  | { t: 'snap'; sid: number; s: unknown }
  | { t: 'pin'; sid: number; x: number; y: number; f: number }
  | { t: 'end'; sid: number; result: unknown }
  // The host's raid is over: what it earned, for the guest's share of it.
  | {
      t: 'gift';
      cores: number;
      won: boolean;
      final: boolean;
      // The story of the raid's end for the guest (story.ts raidEndStory):
      // scene ids, all of them to watch (`all`) or the first new one.
      story?: string[];
      all?: boolean;
    }
  // Chat, both ways: a line of text, or the number of a quick phrase (chat.ts
  // QUICK) that each end writes in its own words. The host passes a guest's
  // line on to the others with the seat it came from.
  | { t: 'chat'; text?: string; q?: number; seat?: number }
  // Voice chat, both ways: this end's microphone is on (not muted) or off. The
  // sound itself does not go through here but through the voice calls. The host
  // passes it on with the seat.
  | { t: 'voice'; on: boolean; seat?: number }
  // Each end says now and then that it is still there; silence for long is a
  // link that died without telling (a closed tab, a phone that lost its signal).
  | { t: 'ping' }
  | { t: 'bye' };

// The sound of a voice chat between the two ends of a direct link: each end
// sends its microphone as a call to the other, and answers the other's call to
// listen. A relay link has no such thing (a broker cannot carry sound).
export interface VoiceLink {
  // Sends this microphone to the partner until stop() (an outgoing call).
  send(stream: MediaStream): void;
  stop(): void;
  // Puts another microphone's sound into the call that is going, without a
  // break (false if there is no call to put it in).
  replace(stream: MediaStream): boolean;
  // The partner's sound arrives (a stream), or ends (null).
  onStream: ((stream: MediaStream | null) => void) | null;
  // The partner's sound as it is now, for a screen that opens later.
  readonly stream: MediaStream | null;
  // Lets everything go (the link is gone).
  dispose(): void;
}

export interface Link {
  // 'relay': the messages go through a broker on the internet (slower).
  readonly kind?: 'p2p' | 'relay';
  // Present on a link that can carry sound: a direct one always, a relay one
  // once its voice connection is up (then the sound is a walkie-talkie's).
  readonly voice?: VoiceLink;
  // A relay link opens its voice connection a moment after the link itself.
  readonly voicePending?: boolean;
  // Told when `voice` appears or the wait for it ends.
  onVoice?: (() => void) | null;
  send(msg: Msg): void;
  // Owned by the NetSession (session.ts), which hands fight messages on.
  onMessage: ((msg: Msg) => void) | null;
  onClose: (() => void) | null;
  readonly open: boolean;
  close(): void;
}

// What a guest shows to come back to its seat: hard to guess, short to keep.
export function makeToken(): string {
  const bytes = new Uint8Array(10);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues)
    crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.random() * 256;
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}
// A room is named by five letters and digits that are hard to mix up on a
// phone (no O/0, I/1): about 33 million of them.
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_LENGTH = 5;
export function makeCode(rand: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_LENGTH; i++)
    code += ROOM_ALPHABET[Math.floor(rand() * ROOM_ALPHABET.length)];
  return code;
}
// What a person typed, as a code: upper case, no spaces or dashes; '' if it
// cannot be a code.
export function normalizeCode(text: string): string {
  const code = text.toUpperCase().replace(/[\s\-_.]/g, '');
  return code.length === ROOM_LENGTH &&
    // By code point on purpose: the alphabet is plain ASCII.
    // oxlint-disable-next-line typescript/no-misused-spread
    [...code].every((c) => ROOM_ALPHABET.includes(c))
    ? code
    : '';
}

// A direction held by a stick or keys, capped to the unit circle and rounded
// to hundredths so both ends use the very same number.
export function quantize(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  const k = len > 1 ? 1 / len : 1;
  const q = (v: number) => Math.round(v * k * 100) / 100 || 0;
  return { x: q(x), y: q(y) };
}
const pack = (step: number, f: Frame): number[] => [
  step,
  Math.round(f.x * 100),
  Math.round(f.y * 100),
  (f.dash ? 1 : 0) | (f.pulse ? 2 : 0) | (f.away ? 4 : 0),
];
const unpack = (row: number[]): [number, Frame] => [
  row[0],
  {
    x: (row[1] || 0) / 100,
    y: (row[2] || 0) / 100,
    dash: !!(row[3] & 1),
    pulse: !!(row[3] & 2),
    ...(row[3] & 4 ? { away: true } : {}),
  },
];

// How a seat's frames come to this end: it is this end's own player, a guest
// that sends them (relayed to the others by the host), a guest on a slow link
// whose input the host turns into frames (see Lockstep.pin), or nobody (the
// device is gone: the host makes neutral frames that say so).
export type SeatKind = 'own' | 'peer' | 'proxy' | 'away';
// Steps of delay with more than two seats: a guest's frame goes through the
// host before the others get it.
export const INPUT_DELAY_PARTY = 8;
export const inputDelay = (seats: number) =>
  seats > 2 ? INPUT_DELAY_PARTY : INPUT_DELAY;

// One fight's synchronisation. `me` is the seat this end plays: 0 for the host
// (the house), 1..3 for the guests (the neighbours). The Battle calls pump()
// every animation frame in place of its own update(); input comes through
// `aim`. With more than two seats every guest talks to the host only: the host
// passes each guest's frames on to the others, and makes the frames of a seat
// that nobody plays (or plays through a mirror) itself.
export class Lockstep {
  // The step the simulation runs next.
  step = 0;
  // The frames being applied by the step that is running, by seat: the house,
  // then the neighbours.
  cur: Frame[];
  // Real seconds the fight has been waiting for the partners.
  stalled = 0;
  // This end's fight no longer matches the host's (a guest), or the only
  // guest's does not match (the host).
  desync = false;
  // Host: the seats whose hashes did not match.
  readonly desynced = new Set<number>();
  closed = false;
  // How each seat's frames come, from this end's point of view.
  readonly kinds: SeatKind[];
  private pool: Map<number, Frame>[];
  // Frames made here so far for the seats this end makes frames for.
  private made: number[];
  private acc = 0;
  private dash = false;
  private pulse = false;
  // What a seat played through a mirror last did (the host makes its frames).
  private pins: { x: number; y: number; dash: boolean; pulse: boolean }[];
  private myHash = new Map<number, number>();
  private theirHash: Map<number, number>[];
  private perks: { id: string; who: number }[] = [];
  onDesync?: (seat?: number) => void;
  onClosed?: () => void;
  onOver?: () => void;
  // Host: a guest's end of the link is gone (see seatLost).
  onSeatLost?: (seat: number) => void;
  constructor(
    readonly me: number,
    readonly sid: number,
    readonly link: Wire,
    // Where the local player's stick points now (before rounding).
    readonly aim: () => { x: number; y: number },
    readonly delay = INPUT_DELAY,
    readonly seats = 2,
  ) {
    this.closed = !link.open;
    this.cur = Array.from({ length: seats }, () => NEUTRAL);
    this.kinds = Array.from({ length: seats }, (_, s) =>
      s === me ? 'own' : 'peer',
    );
    this.pool = Array.from({ length: seats }, () => new Map());
    this.made = Array.from({ length: seats }, () => 0);
    this.pins = Array.from({ length: seats }, () => ({
      x: 0,
      y: 0,
      dash: false,
      pulse: false,
    }));
    this.theirHash = Array.from({ length: seats }, () => new Map());
  }
  private get host() {
    return this.me === 0;
  }
  // The seats whose frames come as frames (the ones to send things to).
  private peers(except = -1): number[] {
    return this.kinds.flatMap((k, s) =>
      k === 'peer' && s !== except ? [s] : [],
    );
  }
  // The session tells the fight that the link went away.
  handleClose() {
    this.closed = true;
    this.onClosed?.();
  }
  // Host: one guest's device is gone. Its seat is played by nobody from here
  // on (neutral frames that say so), and the fight goes on without it, alone
  // if it must: the house stands there for the guest to come back to.
  seatLost(seat: number) {
    if (!this.host || seat <= 0 || seat >= this.seats) return;
    this.setSeat(seat, 'away');
    this.onSeatLost?.(seat);
  }
  // Host: how a seat's frames come from now on. Frames the seat has not sent
  // by the time it changes are made up for it, so nobody waits for them.
  setSeat(seat: number, kind: SeatKind) {
    if (
      !this.host ||
      seat <= 0 ||
      seat >= this.seats ||
      this.kinds[seat] === kind
    )
      return;
    this.kinds[seat] = kind;
    if (kind === 'away' || kind === 'proxy') {
      // Start making frames where the seat's own left off.
      let at = this.step;
      while (this.pool[seat].has(at)) at++;
      this.made[seat] = at;
      this.makeFor(seat);
    }
    if (kind === 'peer') this.pool[seat].clear();
  }
  // Host: the input of a seat played through a mirror (a stick and presses).
  pin(seat: number, x: number, y: number, flags: number) {
    const p = this.pins[seat];
    if (!p) return;
    const v = quantize(x / 100, y / 100);
    p.x = v.x;
    p.y = v.y;
    if (flags & 1) p.dash = true;
    if (flags & 2) p.pulse = true;
  }
  // Sends the first frames. The host calls it when the guests said "ready",
  // a guest right after saying it: the ordered link guarantees that each
  // end already listens when the other one's frames arrive.
  begin() {
    this.fill();
  }
  // A press from a key, a button or a pad; it rides the next frame made.
  press(kind: 'dash' | 'pulse') {
    if (kind === 'dash') this.dash = true;
    else this.pulse = true;
  }
  // This player took a perk for their own house: the other ends take it too.
  choose(id: string) {
    // The host says whose it is; a guest's own seat is stamped by the host.
    if (this.host) this.link.send({ t: 'perk', sid: this.sid, id, who: 0 });
    else this.link.send({ t: 'perk', sid: this.sid, id });
  }
  finish() {
    this.link.send({ t: 'over', sid: this.sid });
  }
  receive(m: Msg, from?: number) {
    if (!('sid' in m) || m.sid !== this.sid) return;
    // Whose message it is: a guest hears only the host, the host knows which
    // guest sent it (with one guest in a pair, there is no doubt).
    const who = this.host ? (from ?? (this.seats === 2 ? 1 : -1)) : 0;
    if (m.t === 'in') {
      // The host's frames carry the seat they are for (its own, or a guest's
      // that it passes on); a guest's own carry none.
      const seat = this.host ? who : (m.seat ?? 0);
      if (
        seat < 0 ||
        seat >= this.seats ||
        seat === this.me ||
        (this.host && this.kinds[seat] !== 'peer')
      )
        return;
      const rows: number[][] = [];
      for (const row of m.f) {
        const [step, frame] = unpack(row);
        if (step >= this.step) {
          this.pool[seat].set(step, frame);
          rows.push(row);
        }
      }
      // The host passes a guest's frames on to the other guests.
      if (this.host && rows.length) {
        const to = this.peers(seat);
        if (to.length)
          this.link.send({ t: 'in', sid: this.sid, f: rows, seat }, to);
      }
    } else if (m.t === 'perk') {
      const seat = this.host ? who : (m.who ?? 0);
      if (seat < 0 || seat >= this.seats) return;
      this.perks.push({ id: m.id, who: seat });
      if (this.host) {
        const to = this.peers(seat);
        if (to.length)
          this.link.send({ t: 'perk', sid: this.sid, id: m.id, who: seat }, to);
      }
    } else if (m.t === 'hash') {
      if (this.host) {
        if (who > 0 && who < this.seats) {
          this.theirHash[who].set(m.s, m.h);
          this.compare(m.s, who);
        }
      } else {
        this.theirHash[0].set(m.s, m.h);
        this.compare(m.s, 0);
      }
    } else if (m.t === 'desync') {
      if (!this.host && !this.desync) {
        this.desync = true;
        this.onDesync?.();
      }
    } else if (m.t === 'over') this.onOver?.();
  }
  // Makes the frame of `seat` for the step it is up to, from where it comes.
  private generate(seat: number): Frame {
    if (seat === this.me) {
      const v = quantize(this.aim().x, this.aim().y);
      const f: Frame = { x: v.x, y: v.y, dash: this.dash, pulse: this.pulse };
      this.dash = this.pulse = false;
      return f;
    }
    if (this.kinds[seat] === 'proxy') {
      const p = this.pins[seat];
      const f: Frame = { x: p.x, y: p.y, dash: p.dash, pulse: p.pulse };
      p.dash = p.pulse = false;
      return f;
    }
    return AWAY;
  }
  // Makes the frames of one seat up to `step + delay` and sends the new ones
  // (to the host if this is a guest, to the guests that need them if it is the
  // host).
  private makeFor(seat: number) {
    const fresh: number[][] = [];
    while (this.made[seat] < this.step + this.delay) {
      const f = this.generate(seat);
      this.pool[seat].set(this.made[seat], f);
      fresh.push(pack(this.made[seat], f));
      this.made[seat]++;
    }
    if (!fresh.length || !this.link.open) return;
    if (this.host) {
      const to = this.peers(seat);
      if (to.length)
        this.link.send({ t: 'in', sid: this.sid, f: fresh, seat }, to);
    } else this.link.send({ t: 'in', sid: this.sid, f: fresh });
  }
  private fill() {
    this.makeFor(this.me);
    if (this.host)
      for (let s = 1; s < this.seats; s++)
        if (this.kinds[s] === 'away' || this.kinds[s] === 'proxy')
          this.makeFor(s);
  }
  private compare(step: number, seat: number) {
    const mine = this.myHash.get(step),
      theirs = this.theirHash[seat].get(step);
    if (mine === undefined || theirs === undefined) return;
    this.theirHash[seat].delete(step);
    if (mine === theirs) return;
    if (this.host) {
      if (this.desynced.has(seat)) return;
      this.desynced.add(seat);
      this.link.send({ t: 'desync', sid: this.sid }, [seat]);
      // The screen may take the guest back as a mirror (setSeat 'proxy'); if it
      // does not, the one that drifted is left to play on its own, and nobody
      // waits for it.
      this.onDesync?.(seat);
      if (this.kinds[seat] === 'peer') this.setSeat(seat, 'away');
      // With nobody else to play with, the fight stops here, as for a pair.
      if (!this.peers().length && !this.kinds.includes('proxy'))
        this.desync = true;
    } else if (!this.desync) {
      this.desync = true;
      this.onDesync?.();
    }
  }
  // Frames of every seat for `step`, if all of them have arrived.
  private frames(step: number): Frame[] | null {
    const out: Frame[] = [];
    for (let s = 0; s < this.seats; s++) {
      const f = this.pool[s].get(step);
      if (!f) return null;
      out.push(f);
    }
    return out;
  }
  // The perk some end has picked and this one can take now: the draft it
  // belongs to is open.
  private pickReady(b: Battle) {
    return this.perks.findIndex((p) =>
      p.who === 0 ? !!b.drafting : !!b.allyOf(p.who)?.draft,
    );
  }
  // Real time in, whole simulation steps out. Returns how many were run.
  pump(b: Battle, real: number): number {
    if (this.desync) return 0;
    this.acc = Math.min(this.acc + real, 0.25);
    let ran = 0;
    while (this.acc >= STEP && !b.ended) {
      // The partner's pick is taken the moment the simulation is waiting for
      // it, the same moment at every end: right after the step that opened the
      // draft (the simulation stands still until every house has its own).
      const at = this.pickReady(b);
      if (at >= 0) {
        const pick = this.perks.splice(at, 1)[0];
        if (pick.who === 0) b.choosePerk(pick.id as never);
        else b.chooseMatePerk(pick.id as never, pick.who);
        continue;
      }
      if (b.choosing || b.paused || b.presenting) break;
      const frames = this.frames(this.step);
      if (!frames) {
        this.stalled += real;
        return ran;
      }
      this.stalled = 0;
      this.cur = frames;
      for (let s = 0; s < this.seats; s++) {
        const f = frames[s];
        if (s > 0 && !!f.away !== !!b.allyOf(s)?.away) b.setAway(s, !!f.away);
        if (f.dash) {
          if (s === 0) b.dash();
          else b.allyDash(b.allyOf(s) ?? null);
        }
        if (f.pulse) {
          if (s === 0) b.pulse();
          else b.allyPulse(b.allyOf(s) ?? null);
        }
      }
      b.update(STEP);
      for (const pool of this.pool) pool.delete(this.step);
      this.step++;
      this.acc -= STEP;
      ran++;
      if (this.step % HASH_EVERY === 0) {
        const h = b.stateHash();
        this.myHash.set(this.step, h);
        // A hash is kept a while for the guests that are slow to answer.
        for (const old of this.myHash.keys())
          if (old < this.step - 6 * HASH_EVERY) this.myHash.delete(old);
        // A guest sends its hash to the host; the host sends its own to every
        // guest still playing along.
        if (this.host) {
          const to = this.peers();
          if (to.length)
            this.link.send({ t: 'hash', sid: this.sid, s: this.step, h }, to);
          for (let s = 1; s < this.seats; s++) this.compare(this.step, s);
        } else {
          this.link.send({ t: 'hash', sid: this.sid, s: this.step, h });
          this.compare(this.step, 0);
        }
      }
      this.fill();
    }
    return ran;
  }
}
