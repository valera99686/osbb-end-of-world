// Voice chat of an online room: this end's microphone goes to the partner as a
// call over the direct link (net-peer.ts PeerVoice), the partner's sound comes
// back the same way and is played here. A link through a relay cannot carry
// sound; then there is no voice chat, and the screen says why.
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
  if (name === 'NotReadableError')
    return 'Мікрофон зайнятий іншою програмою.';
  return 'Не вдалося увімкнути мікрофон.';
}

export class VoiceChat {
  mic: MicState = 'off';
  error = '';
  // The partner's sound is coming in.
  heard = false;
  // The partner's sound is muted at this end.
  silenced = false;
  // How loud this end and the partner are, 0..1.
  me = 0;
  them = 0;
  // The microphones this device has, and the one in use ('' is the device's own
  // choice).
  devices: MicDevice[] = [];
  deviceId = savedMic();
  version = 0;
  private subs = new Set<() => void>();
  private stream: MediaStream | null = null;
  private link: VoiceLink | null = null;
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private meters: {
    node: AnalyserNode;
    data: Uint8Array<ArrayBuffer>;
    set: (v: number) => void;
  }[] = [];
  private timer = 0;
  private theirMic = false;
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
    if (this.mic === 'on' && this.link) {
      try {
        const stream = await this.capture();
        const old = this.stream;
        if (!this.link.replace(stream)) this.link.send(stream);
        this.stream = stream;
        for (const t of old?.getTracks() ?? []) t.stop();
        this.meters = this.meters.filter((m) => m.set !== this.setMe);
        this.meter(stream, this.setMe);
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
    for (const cb of [...this.subs]) cb();
  }
  // The voice goes through the relay (a walkie-talkie, not a call).
  get relayed() {
    return this.session.via === 'relay';
  }
  // Whether there is a voice chat to have on this link.
  get available() {
    return this.session.phase === 'connected' && !!this.session.voiceLink;
  }
  // The room's link changed (or went): the sound follows it.
  private sync() {
    // The partner says their microphone is off: their sound is let go at once
    // (the call itself may take a while to be seen as closed).
    const theirs = this.session.partnerMic;
    if (this.theirMic && !theirs && this.heard) this.hear(null);
    // They switched it on again: a relay's sound keeps one stream for good, so
    // it is taken up again here (a call brings its own stream each time).
    const kept = this.session.voiceLink?.stream;
    if (!this.theirMic && theirs && !this.heard && kept) this.hear(kept);
    this.theirMic = theirs;
    const link = this.session.phase === 'connected' ? this.session.voiceLink : null;
    if (link === this.link) return;
    if (this.link) this.link.onStream = null;
    this.hear(null);
    if (this.mic !== 'off') this.stopMic(false);
    this.link = link;
    if (link) {
      link.onStream = (s) => this.hear(s);
      if (link.stream) this.hear(link.stream);
    }
    this.change();
  }
  async start() {
    const link = this.link;
    if (!link) {
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
      if (this.link !== link || this.session.phase !== 'connected') {
        for (const t of stream.getTracks()) t.stop();
        this.mic = 'off';
        return this.change();
      }
      this.stream = stream;
      link.send(stream);
      this.mic = 'on';
      this.session.tellMic(true);
      this.meter(stream, this.setMe);
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
    this.link?.stop();
    this.mic = 'off';
    this.me = 0;
    this.meters = this.meters.filter((m) => m.set !== this.setMe);
    if (tell) this.session.tellMic(false);
  }
  private setMe = (v: number) => {
    this.me = v;
  };
  // Mutes or unmutes the partner's sound at this end.
  silence(on: boolean) {
    this.silenced = on;
    if (this.audio) this.audio.muted = on;
    this.change();
  }
  // The partner's sound comes in (or ends).
  private hear(stream: MediaStream | null) {
    this.audio?.pause();
    this.audio?.remove();
    this.audio = null;
    this.meters = this.meters.filter((m) => m.set !== this.setThem);
    this.them = 0;
    this.heard = !!stream;
    if (stream) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.muted = this.silenced;
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
      this.audio = audio;
      this.meter(stream, this.setThem);
    }
    this.change();
  }
  private setThem = (v: number) => {
    this.them = v;
  };
  // Starts measuring how loud a stream is.
  private meter(stream: MediaStream, set: (v: number) => void) {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx || !stream.getAudioTracks().length) return;
    try {
      this.ctx ??= new Ctx();
      const node = this.ctx.createAnalyser();
      node.fftSize = 512;
      this.ctx.createMediaStreamSource(stream).connect(node);
      this.meters.push({
        node,
        data: new Uint8Array(new ArrayBuffer(node.fftSize)),
        set,
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
      const before = m.set === this.setMe ? this.me : this.them;
      m.set(peak);
      if ((before > SPEAKING) !== (peak > SPEAKING)) moved = true;
    }
    if (moved) this.change();
  }
  get speakingMe() {
    return this.mic === 'on' && this.me > SPEAKING;
  }
  get speakingThem() {
    return this.heard && !this.silenced && this.them > SPEAKING;
  }
  dispose() {
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDevices);
    this.off?.();
    this.stopMic(false);
    if (this.link) this.link.onStream = null;
    this.hear(null);
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
