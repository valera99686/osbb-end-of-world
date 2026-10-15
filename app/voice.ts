// Voice-over playback: one line at a time, the next one cuts the previous.
// Volume and the master mute come from the profile (Game calls setVoice).
import { voiceId } from '@/lib/game/voice';
import { VOICE_IDS } from '@/lib/game/voice-manifest';

let volume = 0.9,
  enabled = true,
  current: HTMLAudioElement | null = null;

export function stopVoice() {
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
  const audio = new Audio(`/voice/${id}.ogg`);
  audio.volume = volume;
  current = audio;
  // The browser may refuse before the first tap: the line is then just text.
  audio.play().catch(() => {
    if (current === audio) current = null;
  });
}

// A hidden tab or a backgrounded app must not keep talking.
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopVoice();
  });
