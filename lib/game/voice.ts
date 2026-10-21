// Voice-over: every spoken line is a short Opus file in public/voice, named by
// a hash of (voice, text). The generator (scripts/voice) and the game compute
// the same id from the same text, so no table of lines is shipped; the manifest
// only lists which ids exist. Lines with {placeholders} are not voiced.

// One voice per speaker; the chosen head of ОСББ speaks with their own voice.
export const VOICE_KEYS = [
  'mechanic',
  'spark',
  'flora',
  'boris',
  'nina',
  'lev',
  'marta',
  'danilo',
  'solomia',
  'galyna',
  'intercom',
  'svitanok',
  'narrator',
] as const;
export type VoiceKey = (typeof VOICE_KEYS)[number];
// The heads of ОСББ a player can choose.
export const HEAD_VOICES = [
  'mechanic',
  'spark',
  'flora',
  'boris',
  'nina',
  'lev',
  'marta',
  'danilo',
  'solomia',
] as const;

// 53-bit string hash (cyrb53); identical in Node, the browser and tests.
export function hash53(text: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export const voiceId = (key: string, text: string) =>
  hash53(`${key}|${text}`).toString(36);

// The voice for a speaker id from the story ('captain' = the chosen head).
export function voiceKeyFor(who: string, captain: string): VoiceKey | null {
  const id = who === 'captain' ? captain : who;
  return (VOICE_KEYS as readonly string[]).includes(id)
    ? (id as VoiceKey)
    : null;
}
