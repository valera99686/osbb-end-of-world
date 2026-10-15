// Voice-over playback: one line at a time, the next one cuts the previous.
// Volume and the master mute come from the profile (Game calls setVoice).
import { asset } from '@/lib/game/assets';
import { voiceId } from '@/lib/game/voice';
import { VOICE_IDS } from '@/lib/game/voice-manifest';

let volume = 0.9,
  enabled = true,
  speaking = false,
  current: HTMLAudioElement | null = null;
const listeners = new Set<(on: boolean) => void>();

// True while a line is playing.
export const isSpeaking = () => speaking;
// Tells the music when a line starts and stops, so it can duck under it.
export function onSpeaking(listener: (on: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function setSpeaking(on: boolean) {
  if (speaking === on) return;
  speaking = on;
  for (const listener of listeners) listener(on);
}

export function stopVoice() {
  setSpeaking(false);
  if (!current) return;
  current.pause();
  current = null;
}

export function setVoice(config: { volume: number; enabled: boolean }) {
  volume = config.volume;
  enabled = config.enabled;
  if (!enabled || volume <= 0) stopVoice();
  else if (current) current.volume = volume;
}

// True when this line has a recording (lines with changing words have none).
export function hasVoice(key: string | null, text: string) {
  return !!key && VOICE_IDS.has(voiceId(key, text));
}

export function speak(key: string | null, text: string) {
  stopVoice();
  if (!key || !enabled || volume <= 0 || typeof Audio === 'undefined') return;
  const id = voiceId(key, text);
  if (!VOICE_IDS.has(id)) return;
  const audio = new Audio(asset(`voice/${id}.ogg`));
  audio.volume = volume;
  current = audio;
  const done = () => {
    if (current !== audio) return;
    current = null;
    setSpeaking(false);
  };
  audio.addEventListener('ended', done);
  audio.addEventListener('error', done);
  // The browser may refuse before the first tap: the line is then just text.
  audio.play().then(() => {
    if (current === audio) setSpeaking(true);
  }, done);
}

// A hidden tab or a backgrounded app must not keep talking.
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopVoice();
  });
