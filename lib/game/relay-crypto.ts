import { toBase64 } from './vox';

// What keeps a room private on a public MQTT broker (app/relay-link.ts). Every
// message is sealed with AES-GCM under a key made from the room code, and the
// room's topic is a tag made from the same code, so the broker sees neither the
// code nor a word of the game, and nobody can write into the room without it.
//
// The code is eight characters (about 1.1 trillion), and every try at it costs
// 200 000 rounds of key stretching, so the broker, the curious and anyone who
// would speak in a room are stopped, and so is anyone who records a message
// and tries codes against it.
const ROUNDS = 200_000;
const SALT = 'osbb-relay-v1';
// A sealed message longer than this is not ours (the broker packets are capped
// at a megabyte too, lib/game/mqtt.ts).
const MAX_SEALED = 1 << 20;
const IV = 12;
const TAG = 16;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface Room {
  // Names the room's topics. It stands where the code would.
  readonly tag: string;
  // Seals a text for a topic: the topic is part of what is signed, so a message
  // cannot be moved from one topic to another.
  seal(topic: string, text: string): Promise<string>;
  // The text inside a sealed message, or null when it is not ours, is for
  // another topic, or was changed on the way.
  open(topic: string, sealed: string): Promise<string | null>;
}

export async function deriveRoom(code: string): Promise<Room> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(code),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: encoder.encode(SALT),
        iterations: ROUNDS,
      },
      material,
      384,
    ),
  );
  const key = await crypto.subtle.importKey(
    'raw',
    bits.slice(0, 32),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  const tag = Array.from(bits.slice(32), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return {
    tag,
    async seal(topic, text) {
      const iv = crypto.getRandomValues(new Uint8Array(IV));
      const body = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, additionalData: encoder.encode(topic) },
          key,
          encoder.encode(text),
        ),
      );
      const out = new Uint8Array(IV + body.length);
      out.set(iv);
      out.set(body, IV);
      return toBase64(out);
    },
    async open(topic, sealed) {
      if (sealed.length > MAX_SEALED) return null;
      let raw: Uint8Array<ArrayBuffer>;
      try {
        raw = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));
      } catch {
        return null;
      }
      if (raw.length < IV + TAG) return null;
      try {
        const plain = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: raw.slice(0, IV),
            additionalData: encoder.encode(topic),
          },
          key,
          raw.slice(IV),
        );
        return decoder.decode(plain);
      } catch {
        // Wrong code, wrong topic or a changed message: all the same to us.
        return null;
      }
    },
  };
}
