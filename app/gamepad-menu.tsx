import { useEffect, useRef } from 'react';

type Key = 'up' | 'down' | 'left' | 'right' | 'a' | 'b';
const KEYS: Key[] = ['up', 'down', 'left', 'right', 'a', 'b'];
const FOCUSABLE =
  'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';
const FIRST_REPEAT = 380,
  REPEAT = 130;

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return (
    r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  );
}
// The top-most open dialog owns the focus; otherwise the current screen.
function scope(): HTMLElement {
  const dialogs = [
    ...document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"]'),
  ].filter(visible);
  return (
    dialogs[dialogs.length - 1] ??
    document.querySelector<HTMLElement>('main') ??
    document.body
  );
}
function targets(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => visible(el) && !el.closest('[inert], [aria-hidden="true"]'),
  );
}
function focus(el: HTMLElement) {
  document.documentElement.classList.add('gamepad-nav');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
// Spatial search: the nearest target past the current edge, preferring
// ones that line up on the cross axis; DOM order as the last resort.
function move(dir: Key) {
  const root = scope(),
    list = targets(root);
  if (!list.length) return;
  const current = document.activeElement as HTMLElement | null;
  if (!current || !list.includes(current)) return focus(list[0]);
  if (
    current instanceof HTMLInputElement &&
    current.type === 'range' &&
    (dir === 'left' || dir === 'right')
  )
    return nudge(current, dir === 'left' ? -1 : 1);
  const a = current.getBoundingClientRect(),
    horizontal = dir === 'left' || dir === 'right';
  let best: HTMLElement | null = null,
    score = Number.POSITIVE_INFINITY;
  for (const el of list) {
    if (el === current || el.contains(current) || current.contains(el))
      continue;
    const r = el.getBoundingClientRect();
    const gap =
      dir === 'down'
        ? r.top - a.bottom
        : dir === 'up'
          ? a.top - r.bottom
          : dir === 'right'
            ? r.left - a.right
            : a.left - r.right;
    if (gap < -4) continue;
    // Sideways moves stay within the same row.
    if (horizontal && (r.bottom <= a.top || r.top >= a.bottom)) continue;
    const cross = horizontal
      ? Math.abs(r.top + r.height / 2 - (a.top + a.height / 2))
      : Math.abs(r.left + r.width / 2 - (a.left + a.width / 2));
    const s = Math.max(0, gap) + cross * 2;
    if (s < score) {
      score = s;
      best = el;
    }
  }
  if (!best && !horizontal) {
    const i = list.indexOf(current);
    best = list[dir === 'down' ? i + 1 : i - 1] ?? null;
  }
  if (best) focus(best);
}
function nudge(input: HTMLInputElement, sign: number) {
  const step = Number(input.step) || 1,
    min = input.min === '' ? 0 : Number(input.min),
    max = input.max === '' ? 100 : Number(input.max);
  const value = Math.min(max, Math.max(min, Number(input.value) + sign * step));
  // React tracks the value property, so go through the native setter.
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set?.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function press() {
  const root = scope(),
    current = document.activeElement as HTMLElement | null;
  if (!current || !root.contains(current) || current === root) {
    const first = targets(root)[0];
    if (first) focus(first);
    return;
  }
  if (
    current instanceof HTMLTextAreaElement ||
    (current instanceof HTMLInputElement && current.type !== 'checkbox')
  )
    return;
  current.click();
}
// Same path as the Android back button: whoever is open closes itself.
function back() {
  document.dispatchEvent(new CustomEvent('osbb-back', { cancelable: true }));
}
function read(pad: Gamepad): Record<Key, boolean> {
  const on = (i: number) => !!pad.buttons[i]?.pressed;
  const x = pad.axes[0] ?? 0,
    y = pad.axes[1] ?? 0;
  return {
    up: on(12) || y < -0.55,
    down: on(13) || y > 0.55,
    left: on(14) || x < -0.55,
    right: on(15) || x > 0.55,
    a: on(0),
    b: on(1),
  };
}
// Menu navigation with a controller outside of battle. Polls only while a
// pad is connected; buttons held while inactive fire only after release.
export function useGamepadMenu(active: boolean) {
  const enabled = useRef(active);
  useEffect(() => {
    enabled.current = active;
  }, [active]);
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      typeof navigator.getGamepads !== 'function'
    )
      return;
    let frame = 0;
    const held: Record<Key, boolean> = {
        up: false,
        down: false,
        left: false,
        right: false,
        a: false,
        b: false,
      },
      next: Record<Key, number> = {
        up: 0,
        down: 0,
        left: 0,
        right: 0,
        a: 0,
        b: 0,
      };
    const pads = () => {
      try {
        return [...navigator.getGamepads()].filter(
          (p): p is Gamepad => !!p && p.connected,
        );
      } catch {
        return [];
      }
    };
    const fire = (key: Key) => {
      if (key === 'a') press();
      else if (key === 'b') back();
      else move(key);
    };
    const loop = (time: number) => {
      const list = pads();
      if (!list.length) {
        frame = 0;
        return;
      }
      const state = read(list[0]);
      for (const pad of list.slice(1)) {
        const extra = read(pad);
        for (const key of KEYS) state[key] = state[key] || extra[key];
      }
      for (const key of KEYS) {
        if (!state[key]) {
          held[key] = false;
          continue;
        }
        const first = !held[key];
        held[key] = true;
        if (!enabled.current) {
          next[key] = Number.POSITIVE_INFINITY;
          continue;
        }
        if (first) {
          fire(key);
          next[key] = time + FIRST_REPEAT;
        } else if (key !== 'a' && key !== 'b' && time >= next[key]) {
          fire(key);
          next[key] = time + REPEAT;
        }
      }
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };
    const pointer = () =>
      document.documentElement.classList.remove('gamepad-nav');
    window.addEventListener('gamepadconnected', start);
    window.addEventListener('pointerdown', pointer);
    if (pads().length) start();
    return () => {
      window.removeEventListener('gamepadconnected', start);
      window.removeEventListener('pointerdown', pointer);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
  }, []);
}
