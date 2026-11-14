// What a vote of the room shows each player: their own pick and what every
// other player here has picked (the map, an event, a meeting).
import type { Ballot } from '@/lib/game/coop';

export interface VoteMate {
  name: string;
  // The column they picked, null while they have not.
  col: number | null;
  // Their device is gone: nobody waits for them.
  away: boolean;
}
// The others of a ballot as seen from `seat`; `name(seat)` is how a seat is called.
export function matesOf(
  ballot: Ballot | null | undefined,
  seat: number,
  name: (seat: number) => string,
): VoteMate[] {
  if (!ballot) return [];
  return ballot.votes.flatMap((col, s) =>
    s === seat
      ? []
      : [{ name: name(s), col, away: !!ballot.away?.includes(s) }],
  );
}
// The names of the mates who have picked / have still to pick.
const list = (mates: VoteMate[]) => mates.map((m) => m.name).join(', ');
export function pickedNames(mates: VoteMate[]) {
  return list(mates.filter((m) => m.col !== null));
}
export function waitingNames(mates: VoteMate[]) {
  return list(mates.filter((m) => m.col === null && !m.away));
}
// Whether everybody who is here has picked the same column as `mine`.
export function allAgree(mine: number | null, mates: VoteMate[]) {
  return mates.every((m) => m.away || m.col === mine);
}
