// Voice chat of an online room: this end's microphone goes to the others as a
// call over the direct link (net-peer.ts PeerVoice), what the others say comes
// back the same way and is played here. A link through a relay carries the
// sound as the small frames of a walkie-talkie (relay-link.ts), and the screens
// cannot tell the two apart.
//
// In a room of more than two the guests talk to the host only, so the host is
// the table where the voices meet: it mixes the microphone of everybody with
// the others' and sends each guest what the rest of the room says (never the
// guest's own voice back). A guest hears the room as one stream.
import { useMemo, useSyncExternalStore } from 'react';
import type { VoiceLink } from '@/lib/game/net';
import type { NetSession } from '@/lib/game/session';

export type MicState = 'off' | 'asking' | 'on';
// The microphone the player chose last time (its id on this device).
const MIC_KEY = 'osbb.mic';
const savedMic = () => {
  try {
    return localStorage.getItem(MIC_KEY) ?? '';
  } catch {
    return '';
  }
};
export interface MicDevice {
  id: string;
  label: string;
}
// Above this level (0..1) somebody is taken to be speaking.
const SPEAKING = 0.04;
const METER_EVERY = 140;

// Why a microphone could not be taken, for a person.
export function micError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Мікрофон заборонено. Дозволь його для цього сайту в налаштуваннях браузера й спробуй ще раз.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'Мікрофона не знайдено. Підключи його й спробуй ще раз.';
  if (name === 'NotReadableError') return 'Мікрофон зайнятий іншою програмою.';
  return 'Не вдалося увімкнути мікрофон.';
}

// What one other end of the room sounds like at this one.
interface Remote {
  seat: number;
  link: VoiceLink;
  heard: boolean;
  level: number;
  silenced: boolean;
  audio: HTMLAudioElement | null;
  stream: MediaStream | null;
  // What this end sends this one: nothing, its own microphone, or the mix.
  sent: '' | 'direct' | 'mix';
}

// The host's table: every voice in, and out for each guest all of them but
// that guest's own.
class Mixer {
  private own: MediaStreamAudioSourceNode | null = null;
  private inputs = new Map<number, MediaStreamAudioSourceNode>();
  private outs = new Map<number, MediaStreamAudioDestinationNode>();
  constructor(private ctx: AudioContext) {}
  setOwn(stream: MediaStream | null) {
    this.own?.disconnect();
    this.own = stream ? this.ctx.createMediaStreamSource(stream) : null;
    this.wire();
  }
  setInput(seat: number, stream: MediaStream | null) {
    this.inputs.get(seat)?.disconnect();
    this.inputs.delete(seat);
    if (stream && stream.getAudioTracks().length)
      this.inputs.set(seat, this.ctx.createMediaStreamSource(stream));
    this.wire();
  }
  // What a guest is to be sent.
  out(seat: number): MediaStream {
    let dest = this.outs.get(seat);
    if (!dest) {
      dest = this.ctx.createMediaStreamDestination();
      this.outs.set(seat, dest);
      this.wire();
    }
    return dest.stream;
  }
  drop(seat: number) {
    this.inputs.get(seat)?.disconnect();
    this.inputs.delete(seat);
    this.outs.get(seat)?.disconnect();
    this.outs.delete(seat);
    this.wire();
  }
  private wire() {
    // Disconnecting what was never connected is an error, so each start is clean.
    const apart = (from: AudioNode, to: AudioNode) => {
      try {
        from.disconnect(to);
      } catch {
        // It was not connected.
      }
    };
    for (const [seat, dest] of this.outs) {
      if (this.own) apart(this.own, dest);
      for (const src of this.inputs.values()) apart(src, dest);
      this.own?.connect(dest);
      for (const [from, src] of this.inputs)
        if (from !== seat) src.connect(dest);
    }
  }
  dispose() {
    this.own?.disconnect();
    for (const src of this.inputs.values()) src.disconnect();
    for (const dest of this.outs.values()) dest.disconnect();
    this.inputs.clear();
    this.outs.clear();
  }
}

export class VoiceChat {
  mic: MicState = 'off';
  error = '';
  // The others' sound is muted at this end.
  silenced = false;
  // How loud this end is, 0..1.
  me = 0;
  // The microphones this device has, and the one in use ('' is the device's own
  // choice).
  devices: MicDevice[] = [];
  deviceId = savedMic();
  version = 0;
  private subs = new Set<() => void>();
  private stream: MediaStream | null = null;
  private remotes = new Map<number, Remote>();
  private ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private meters: {
    node: AnalyserNode;
    data: Uint8Array<ArrayBuffer>;
    set: (v: number) => void;
    get: () => number;
  }[] = [];
  private timer = 0;
  private off: (() => void) | null = null;
  constructor(private session: NetSession) {
    this.off = session.subscribe(() => this.sync());
    this.sync();
    // Microphones come and go (a headset plugged in), and show their names
    // only after the browser has let the page use one.
    void this.refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', this.onDevices);
  }
  private onDevices = () => void this.refresh();
  // Looks the microphones up again.
  async refresh() {
    try {
      const all = (await navigator.mediaDevices?.enumerateDevices()) ?? [];
      const mics = all.filter((d) => d.kind === 'audioinput' && d.deviceId);
      this.devices = mics.map((d, i) => ({
        id: d.deviceId,
        label: d.label || `Мікрофон ${i + 1}`,
      }));
      // A microphone that is gone is not remembered as the choice.
      if (this.deviceId && !this.devices.some((d) => d.id === this.deviceId))
        this.deviceId = '';
      this.change();
    } catch {
      // No list: the device's own microphone is used.
    }
  }
  // Takes the sound of the chosen microphone (or of the device's own one if
  // that one is not to be had).
  private async capture(): Promise<MediaStream> {
    const base = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: this.deviceId
          ? { ...base, deviceId: { exact: this.deviceId } }
          : base,
      });
    } catch (e) {
      if (!this.deviceId) throw e;
      this.deviceId = '';
      return navigator.mediaDevices.getUserMedia({ audio: base });
    }
  }
  // Another microphone: remembered, and put into the call at once if the
  // microphone is on.
  async choose(id: string) {
    this.deviceId = id;
    try {
      localStorage.setItem(MIC_KEY, id);
    } catch {
      // Only a convenience: asked again next time.
    }
    if (this.mic === 'on' && this.remotes.size) {
      try {
        const stream = await this.capture();
        const old = this.stream;
        this.stream = stream;
        if (this.host && this.remotes.size > 1) this.mixer?.setOwn(stream);
        else
          for (const r of this.remotes.values())
            if (!r.link.replace(stream)) {
              r.link.stop();
              r.link.send(stream);
            }
        for (const t of old?.getTracks() ?? []) t.stop();
        this.meters = this.meters.filter((m) => m.set !== this.setMe);
        this.meter(stream, this.setMe, () => this.me);
        this.error = '';
      } catch (e) {
        this.error = micError(e);
      }
    }
    this.change();
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
  private get host() {
    return this.session.role === 'host';
  }
  // The voice goes through the relay (a walkie-talkie, not a call).
  get relayed() {
    return this.session.via === 'relay';
  }
  // Whether there is a voice chat to have on these links.
  get available() {
    return this.session.phase === 'connected' && this.remotes.size > 0;
  }
  // Whoever else is heard now, and whoever is speaking.
  get heard() {
    return [...this.remotes.values()].some((r) => r.heard);
  }
  get them() {
    return Math.max(0, ...[...this.remotes.values()].map((r) => r.level));
  }
  // The seats heard now (the host hears each guest on its own).
  heardSeats(): number[] {
    return [...this.remotes.values()].filter((r) => r.heard).map((r) => r.seat);
  }
  speaking(seat: number) {
    const r = this.remotes.get(seat);
    return (
      !!r && r.heard && !r.silenced && !this.silenced && r.level > SPEAKING
    );
  }
  // Host: one guest muted at this end.
  silenceSeat(seat: number, on: boolean) {
    const r = this.remotes.get(seat);
    if (!r) return;
    r.silenced = on;
    if (r.audio) r.audio.muted = on || this.silenced;
    this.change();
  }
  isSilenced(seat: number) {
    return !!this.remotes.get(seat)?.silenced;
  }
  // The room's links changed (or went): the sound follows them.
  private sync() {
    const want = new Map<number, VoiceLink>();
    if (this.session.phase === 'connected')
      for (const { seat, link } of this.session.voiceLinks())
        want.set(seat, link);
    let changed = false;
    for (const [seat, r] of this.remotes) {
      if (want.get(seat) === r.link) continue;
      this.release(r);
      this.remotes.delete(seat);
      this.mixer?.drop(seat);
      changed = true;
    }
    for (const [seat, link] of want) {
      if (this.remotes.has(seat)) continue;
      const r: Remote = {
        seat,
        link,
        heard: false,
        level: 0,
        silenced: false,
        audio: null,
        stream: null,
        sent: '',
      };
      this.remotes.set(seat, r);
      link.onStream = (s) => this.hear(r, s);
      if (link.stream) this.hear(r, link.stream);
      changed = true;
    }
    // Somebody's microphone went off: their sound is let go at once (the call
    // itself may take a while to be seen as closed); a relay's sound keeps one
    // stream for good, so it is taken up again when the microphone is back.
    for (const r of this.remotes.values()) {
      const on = this.micOf(r.seat);
      if (!on && r.heard) this.hear(r, null);
      else if (on && !r.heard && r.link.stream) this.hear(r, r.link.stream);
    }
    this.syncSend();
    if (changed || this.remotes.size) this.change();
  }
  // Whether the player of that seat has their microphone on (the guest hears
  // the room as one: any of the others').
  private micOf(seat: number): boolean {
    const mics = this.session.mics;
    return this.host
      ? !!mics[seat]
      : mics.some((on, s) => on && s !== this.session.mySeat);
  }
  // Sends each remote what it is to hear from this end: a pair directly, a room
  // through the table of the host; and stops sending what nobody is to hear.
  private syncSend() {
    const many = this.host && this.remotes.size > 1;
    for (const r of this.remotes.values()) {
      const others =
        many &&
        (this.mic === 'on' ||
          this.session.mics.some((on, s) => on && s > 0 && s !== r.seat));
      const wants = many ? others : this.mic === 'on';
      const kind: Remote['sent'] = wants ? (many ? 'mix' : 'direct') : '';
      if (kind === r.sent) continue;
      r.link.stop();
      r.sent = '';
      if (!kind) continue;
      if (kind === 'mix') {
        const ctx = this.audioContext();
        if (!ctx) continue;
        if (!this.mixer) {
          this.mixer = new Mixer(ctx);
          // The voices heard so far sit down at the table too.
          for (const o of this.remotes.values())
            this.mixer.setInput(o.seat, o.stream);
        }
        this.mixer.setOwn(this.mic === 'on' ? this.stream : null);
        r.link.send(this.mixer.out(r.seat));
      } else if (this.stream) r.link.send(this.stream);
      else continue;
      r.sent = kind;
    }
  }
  private audioContext(): AudioContext | null {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    try {
      this.ctx ??= new Ctx();
      return this.ctx;
    } catch {
      return null;
    }
  }
  private release(r: Remote) {
    r.link.onStream = null;
    r.audio?.pause();
    r.audio?.remove();
    r.audio = null;
    r.heard = false;
    r.level = 0;
    this.meters = this.meters.filter((m) => m.set !== this.setterOf(r));
    this.mixer?.setInput(r.seat, null);
    if (r.sent) r.link.stop();
    r.sent = '';
  }
  private setters = new WeakMap<Remote, (v: number) => void>();
  private setterOf(r: Remote) {
    let set = this.setters.get(r);
    if (!set) {
      set = (v) => {
        r.level = v;
      };
      this.setters.set(r, set);
    }
    return set;
  }
  async start() {
    if (!this.remotes.size) {
      this.error =
        'Голос зараз недоступний: він не підключився ні напряму, ні через резервний канал.';
      return this.change();
    }
    if (this.mic !== 'off') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = 'Цей браузер не дає доступу до мікрофона.';
      return this.change();
    }
    this.error = '';
    this.mic = 'asking';
    this.change();
    try {
      const stream = await this.capture();
      // The room may have closed while the permission was asked.
      if (!this.remotes.size || this.session.phase !== 'connected') {
        for (const t of stream.getTracks()) t.stop();
        this.mic = 'off';
        return this.change();
      }
      this.stream = stream;
      this.mic = 'on';
      this.syncSend();
      this.session.tellMic(true);
      this.meter(stream, this.setMe, () => this.me);
      void this.ctx?.resume();
      // Now that the page may listen, the microphones have their names.
      void this.refresh();
    } catch (e) {
      this.mic = 'off';
      this.error = micError(e);
    }
    this.change();
  }
  stop() {
    this.stopMic(true);
    this.change();
  }
  private stopMic(tell: boolean) {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    this.mic = 'off';
    this.me = 0;
    this.meters = this.meters.filter((m) => m.set !== this.setMe);
    this.mixer?.setOwn(null);
    if (this.remotes.size) this.syncSend();
    if (tell) this.session.tellMic(false);
  }
  private setMe = (v: number) => {
    this.me = v;
  };
  // Mutes or unmutes the others' sound at this end.
  silence(on: boolean) {
    this.silenced = on;
    for (const r of this.remotes.values())
      if (r.audio) r.audio.muted = on || r.silenced;
    this.change();
  }
  // Somebody's sound comes in (or ends).
  private hear(r: Remote, stream: MediaStream | null) {
    r.audio?.pause();
    r.audio?.remove();
    r.audio = null;
    r.stream = stream;
    this.meters = this.meters.filter((m) => m.set !== this.setterOf(r));
    r.level = 0;
    r.heard = !!stream;
    if (this.host) this.mixer?.setInput(r.seat, stream);
    if (stream) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.muted = this.silenced || r.silenced;
      audio.srcObject = stream;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      audio.play().catch(() => {
        // Waits for a tap: the next click on the page lets it through.
        const go = () => {
          void audio.play().catch(() => {});
          window.removeEventListener('pointerdown', go);
        };
        window.addEventListener('pointerdown', go);
      });
      r.audio = audio;
      this.meter(stream, this.setterOf(r), () => r.level);
      // The table needs this voice at once: the guests that are to hear it.
      if (this.host) this.syncSend();
    } else if (this.host) this.syncSend();
    this.change();
  }
  // Starts measuring how loud a stream is.
  private meter(
    stream: MediaStream,
    set: (v: number) => void,
    get: () => number,
  ) {
    const ctx = this.audioContext();
    if (!ctx || !stream.getAudioTracks().length) return;
    try {
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(node);
      this.meters.push({
        node,
        data: new Uint8Array(new ArrayBuffer(node.fftSize)),
        set,
        get,
      });
      this.timer ||= window.setInterval(() => this.tick(), METER_EVERY);
    } catch {
      // No meter: the voice itself still works.
    }
  }
  private tick() {
    let moved = false;
    for (const m of this.meters) {
      m.node.getByteTimeDomainData(m.data);
      let peak = 0;
      for (const v of m.data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      const before = m.get();
      m.set(peak);
      if (before > SPEAKING !== peak > SPEAKING) moved = true;
    }
    if (moved) this.change();
  }
  get speakingMe() {
    return this.mic === 'on' && this.me > SPEAKING;
  }
  get speakingThem() {
    return (
      !this.silenced &&
      [...this.remotes.values()].some(
        (r) => r.heard && !r.silenced && r.level > SPEAKING,
      )
    );
  }
  dispose() {
    navigator.mediaDevices?.removeEventListener?.(
      'devicechange',
      this.onDevices,
    );
    this.off?.();
    this.stopMic(false);
    for (const r of this.remotes.values()) this.release(r);
    this.remotes.clear();
    this.mixer?.dispose();
    this.mixer = null;
    window.clearInterval(this.timer);
    this.timer = 0;
    void this.ctx?.close();
    this.ctx = null;
    this.subs.clear();
  }
}

const voices = new WeakMap<NetSession, VoiceChat>();
// The voice chat of a room (one for as long as the room lasts).
export function useVoice(session: NetSession): VoiceChat {
  const voice = useMemo(() => {
    let v = voices.get(session);
    if (!v) {
      v = new VoiceChat(session);
      voices.set(session, v);
    }
    return v;
  }, [session]);
  useSyncExternalStore(voice.subscribe, voice.getVersion);
  return voice;
}
// Ends the voice chat of a room that is closed.
export function endVoice(session: NetSession) {
  voices.get(session)?.dispose();
  voices.delete(session);
}
