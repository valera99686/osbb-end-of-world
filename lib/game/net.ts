// Online co-op: two devices, one fight. Both run the very same simulation and
// only the players' inputs cross the network ("lockstep"): the engine is
// deterministic for a given run, meta and sequence of inputs, which the tests
// of the headless simulations already rely on. Whoever hosts the room owns the
// campaign (map, shop, events); the guest joins the fights as the neighbour
// of co-op (coop.ts), controlling Battle.ally.
//
// Nothing here knows about PeerJS or the browser: a `Link` is any ordered,
// reliable pipe of messages, so tests wire two fights with a pair of arrays.
import type { Battle } from './engine';

// Both ends must run the same build: the simulation is only repeatable inside
// one version of the code, so a mismatch is refused at the door.
export const NET_PROTOCOL = 3;
// How a fight is shared: both ends simulate it and trade inputs ('sync'), or
// the host alone simulates and streams it to the guest ('host').
export type ShareMode = 'sync' | 'host';
// Whatever a fight at one end is: the lockstep or the mirror feed/client.
export interface FightLink {
  readonly sid: number;
  receive(msg: Msg): void;
  handleClose(): void;
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
}
export const NEUTRAL: Frame = { x: 0, y: 0, dash: false, pulse: false };

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

export type Msg =
  // Guest to host, first thing: who is knocking, and with which build.
  | { t: 'hello'; v: number; build: string; hero: string; name: string }
  | { t: 'welcome'; v: number; build: string }
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
      host: number | null;
      guest: number | null;
      done?: { col: number; coin: boolean };
    }
  | { t: 'vote'; step: number; col: number }
  // A fight begins: the run and the profile the simulation is made from, and
  // how it is shared: 'sync' (both simulate, net.ts) or 'host' (mirror.ts).
  | { t: 'start'; sid: number; run: unknown; meta: unknown; mode?: ShareMode }
  | { t: 'ready'; sid: number }
  // Inputs: [step, x, y, flags] per player-step (flags: 1 dash, 2 pulse).
  | { t: 'in'; sid: number; f: number[][] }
  // The host's choice of a perk, for both ends to take at the same moment.
  | { t: 'perk'; sid: number; id: string }
  | { t: 'hash'; sid: number; s: number; h: number }
  // The host left the fight (menu, defeat screen): the guest can leave too.
  | { t: 'over'; sid: number }
  // Mirror mode: the host's snapshot, the guest's input, the host's result.
  | { t: 'snap'; sid: number; s: unknown }
  | { t: 'pin'; sid: number; x: number; y: number; f: number }
  | { t: 'end'; sid: number; result: unknown }
  // The host's raid is over: what it earned, for the guest's share of it.
  | { t: 'gift'; cores: number; won: boolean; final: boolean }
  | { t: 'bye' };

export interface Link {
  // 'relay': the messages go through a broker on the internet (slower).
  readonly kind?: 'p2p' | 'relay';
  send(msg: Msg): void;
  // Owned by the NetSession (session.ts), which hands fight messages on.
  onMessage: ((msg: Msg) => void) | null;
  onClose: (() => void) | null;
  readonly open: boolean;
  close(): void;
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
  (f.dash ? 1 : 0) | (f.pulse ? 2 : 0),
];
const unpack = (row: number[]): [number, Frame] => [
  row[0],
  {
    x: (row[1] || 0) / 100,
    y: (row[2] || 0) / 100,
    dash: !!(row[3] & 1),
    pulse: !!(row[3] & 2),
  },
];

// One fight's synchronisation. `me` is 0 for the host (the house) and 1 for
// the guest (the neighbour). The Battle calls pump() every animation frame in
// place of its own update(); input comes through `sample`.
export class Lockstep {
  // The step the simulation runs next.
  step = 0;
  // The frames being applied by the step that is running: house, neighbour.
  cur: [Frame, Frame] = [NEUTRAL, NEUTRAL];
  // Real seconds the fight has been waiting for the partner.
  stalled = 0;
  desync = false;
  closed = false;
  private mine = new Map<number, Frame>();
  private theirs = new Map<number, Frame>();
  private made = 0;
  private acc = 0;
  private dash = false;
  private pulse = false;
  private sent: number[][] = [];
  private myHash = new Map<number, number>();
  private theirHash = new Map<number, number>();
  private perks: string[] = [];
  onDesync?: () => void;
  onClosed?: () => void;
  onOver?: () => void;
  constructor(
    readonly me: 0 | 1,
    readonly sid: number,
    readonly link: Link,
    // Where the local player's stick points now (before rounding).
    readonly aim: () => { x: number; y: number },
    readonly delay = INPUT_DELAY,
  ) {
    this.closed = !link.open;
  }
  // The session tells the fight that the link went away.
  handleClose() {
    this.closed = true;
    this.onClosed?.();
  }
  // Sends the first frames. The host calls it when the guest said "ready",
  // the guest right after saying it: the ordered link guarantees that each
  // end already listens when the other one's frames arrive.
  begin() {
    this.fill();
  }
  // A press from a key, a button or a pad; it rides the next frame made.
  press(kind: 'dash' | 'pulse') {
    if (kind === 'dash') this.dash = true;
    else this.pulse = true;
  }
  // The host picked a perk: send it; the guest's copy arrives as onPerk.
  choose(id: string) {
    this.link.send({ t: 'perk', sid: this.sid, id });
  }
  finish() {
    this.link.send({ t: 'over', sid: this.sid });
  }
  receive(m: Msg) {
    if (!('sid' in m) || m.sid !== this.sid) return;
    if (m.t === 'in') {
      for (const row of m.f) {
        const [step, frame] = unpack(row);
        if (step >= this.step) this.theirs.set(step, frame);
      }
    } else if (m.t === 'perk') {
      this.perks.push(m.id);
    } else if (m.t === 'hash') {
      this.theirHash.set(m.s, m.h);
      this.compare(m.s);
    } else if (m.t === 'over') this.onOver?.();
  }
  // Makes the local frames up to `step + delay` and sends the new ones.
  private fill() {
    const fresh: number[][] = [];
    while (this.made < this.step + this.delay) {
      const v = quantize(this.aim().x, this.aim().y);
      const f: Frame = {
        x: v.x,
        y: v.y,
        dash: this.dash,
        pulse: this.pulse,
      };
      this.dash = this.pulse = false;
      this.mine.set(this.made, f);
      fresh.push(pack(this.made, f));
      this.made++;
    }
    if (fresh.length && this.link.open)
      this.link.send({ t: 'in', sid: this.sid, f: fresh });
  }
  private compare(step: number) {
    const mine = this.myHash.get(step),
      theirs = this.theirHash.get(step);
    if (mine === undefined || theirs === undefined) return;
    this.myHash.delete(step);
    this.theirHash.delete(step);
    if (mine !== theirs && !this.desync) {
      this.desync = true;
      this.onDesync?.();
    }
  }
  // Frames of both players for `step`, if both have arrived.
  private frames(step: number): [Frame, Frame] | null {
    const mine = this.mine.get(step),
      theirs = this.theirs.get(step);
    if (!mine || !theirs) return null;
    return this.me === 0 ? [mine, theirs] : [theirs, mine];
  }
  // Real time in, whole simulation steps out. Returns how many were run.
  pump(b: Battle, real: number): number {
    if (this.desync) return 0;
    this.acc = Math.min(this.acc + real, 0.25);
    let ran = 0;
    while (this.acc >= STEP && !b.ended) {
      // The host's pick is taken the moment the simulation is waiting for it,
      // the same moment at both ends: right after the step that opened it.
      if (b.drafting && this.perks.length) {
        const id = this.perks.shift()!;
        if (b.drafting.includes(id as never)) b.choosePerk(id as never);
        continue;
      }
      if (b.drafting || b.paused || b.presenting) break;
      const frames = this.frames(this.step);
      if (!frames) {
        this.stalled += real;
        return ran;
      }
      this.stalled = 0;
      this.cur = frames;
      if (frames[0].dash) b.dash();
      if (frames[0].pulse) b.pulse();
      if (frames[1].dash) b.allyDash();
      if (frames[1].pulse) b.allyPulse();
      b.update(STEP);
      this.mine.delete(this.step);
      this.theirs.delete(this.step);
      this.step++;
      this.acc -= STEP;
      ran++;
      if (this.step % HASH_EVERY === 0) {
        const h = b.stateHash();
        this.myHash.set(this.step, h);
        this.link.send({ t: 'hash', sid: this.sid, s: this.step, h });
        this.compare(this.step);
      }
      this.fill();
    }
    return ran;
  }
}
