import type { Battle } from '@/lib/game/engine';

// A live battle plays a short outro before it reports its result. Once the
// battle is decided, nothing may pause over it or leave it: a pause request,
// the pause menu's exit or the app going to the background hands the result
// over at once (skipping the rest of the outro), so a loss can't be dodged
// and a boss win can't be lost. True when the battle is already over; the
// caller then does nothing else.
export function settleBattle(
  battle: Pick<Battle, 'ended' | 'flushEnd'> | null,
) {
  if (!battle?.ended) return false;
  battle.flushEnd();
  return true;
}
