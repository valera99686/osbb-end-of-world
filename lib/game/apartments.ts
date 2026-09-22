import {
  canHouse,
  residentCells,
  RESIDENT_BY_ID,
  type ResidentRoom,
} from './residents';
import type { Stat } from './data';

export type RoomLink = [string, string];
export type RoomMode = 'lab' | 'anomaly';
export interface ApartmentState {
  residents: ResidentRoom[];
  roomLinks?: RoomLink[];
  roomModes?: Record<string, RoomMode>;
  chapter: number;
  houseLevel: number;
}
export function roomsTouch(a: ResidentRoom, b: ResidentRoom) {
  return residentCells(a.id, a.rotation).some(([x, y]) =>
    residentCells(b.id, b.rotation).some(
      ([u, v]) =>
        Math.abs(a.x + x - b.x - u) + Math.abs(a.y + y - b.y - v) === 1,
    ),
  );
}
export function restoreRoomLinks(
  raw: unknown,
  rooms: ResidentRoom[],
): RoomLink[] {
  const used = new Set<string>(),
    result: RoomLink[] = [];
  if (!Array.isArray(raw)) return result;
  for (const pair of raw.slice(0, 9)) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      pair.some((id) => typeof id !== 'string' || used.has(id)) ||
      pair[0] === pair[1]
    )
      continue;
    const a = rooms.find((r) => r.id === pair[0]),
      b = rooms.find((r) => r.id === pair[1]);
    if (!a || !b || !roomsTouch(a, b)) continue;
    result.push([a.id, b.id]);
    used.add(a.id);
    used.add(b.id);
  }
  return result;
}
export function restoreRoomModes(
  raw: unknown,
  rooms: ResidentRoom[],
  chapter: number,
): Record<string, RoomMode> {
  const out: Record<string, RoomMode> = {};
  if (chapter < 2 || !raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  if (obj.spark === 'lab' && rooms.some((r) => r.id === 'spark'))
    out.spark = 'lab';
  if (obj.solomia === 'anomaly' && rooms.some((r) => r.id === 'solomia'))
    out.solomia = 'anomaly';
  return out;
}
export function linkedIds(state: ApartmentState, id: string): string[] {
  return (
    restoreRoomLinks(state.roomLinks, state.residents).find((pair) =>
      pair.includes(id),
    ) ?? [id]
  );
}
// Rotate the entire connected shape around the selected apartment. Local cell
// indices stay with their resident, so furniture and equipment follow the turn.
export function planRoomMove(
  state: ApartmentState,
  target: ResidentRoom,
  validate = true,
): ResidentRoom[] | null {
  if (
    ![target.x, target.y, target.rotation].every(Number.isInteger) ||
    target.rotation < 0 ||
    target.rotation > 3 ||
    !RESIDENT_BY_ID[target.id]
  )
    return null;
  const original = state.residents.find((r) => r.id === target.id);
  if (!original)
    return !validate || canHouse(state.residents, target, state.houseLevel)
      ? [...state.residents, target]
      : null;
  const ids = linkedIds(state, target.id),
    delta = (target.rotation - original.rotation + 4) % 4;
  const turn = (x: number, y: number): [number, number] => {
    for (let i = 0; i < delta; i++) [x, y] = [-y, x];
    return [x, y];
  };
  const anchor = residentCells(original.id, original.rotation).map(([x, y]) =>
    turn(x, y),
  );
  const offsetX = target.x - Math.min(...anchor.map((c) => c[0])),
    offsetY = target.y - Math.min(...anchor.map((c) => c[1]));
  const moved = state.residents
    .filter((r) => ids.includes(r.id))
    .map((r) => {
      const cells = residentCells(r.id, r.rotation).map(([x, y]) =>
        turn(r.x + x - original.x, r.y + y - original.y),
      );
      return {
        ...r,
        x: offsetX + Math.min(...cells.map((c) => c[0])),
        y: offsetY + Math.min(...cells.map((c) => c[1])),
        rotation: (r.rotation + delta) % 4,
      };
    });
  const next = [...state.residents.filter((r) => !ids.includes(r.id))];
  for (const room of moved) {
    if (validate && !canHouse(next, room, state.houseLevel)) return null;
    next.push(room);
  }
  return state.residents.map((r) => next.find((n) => n.id === r.id)!);
}
// Omit a shared wall only for a deliberately joined pair, never for ordinary neighbors.
export function apartmentWalls(
  room: ResidentRoom,
  rooms: ResidentRoom[],
  links: RoomLink[] = [],
): string {
  const cells = residentCells(room.id, room.rotation),
    pair = links.find((p) => p.includes(room.id));
  const own = new Set(cells.map(([x, y]) => `${x}:${y}`));
  const neighbor = rooms.find((r) => r.id !== room.id && pair?.includes(r.id));
  const other = new Set(
    neighbor
      ? residentCells(neighbor.id, neighbor.rotation).map(
          ([x, y]) => `${neighbor.x + x - room.x}:${neighbor.y + y - room.y}`,
        )
      : [],
  );
  const walls: string[] = [];
  for (const [x, y] of cells)
    for (const [dx, dy, path] of [
      [0, -1, `M${x * 100},${y * 100}h100`],
      [1, 0, `M${(x + 1) * 100},${y * 100}v100`],
      [0, 1, `M${(x + 1) * 100},${(y + 1) * 100}h-100`],
      [-1, 0, `M${x * 100},${(y + 1) * 100}v-100`],
    ] as [number, number, string][]) {
      const key = `${x + dx}:${y + dy}`;
      if (!own.has(key) && !other.has(key)) walls.push(path);
    }
  return walls.join(' ');
}
export interface ApartmentEffect {
  id: string;
  title: string;
  text: string;
  negative?: boolean;
  residents: string[];
}
export function apartmentEffects(state: ApartmentState) {
  const stats: Partial<Record<Stat, number>> = {},
    effects: ApartmentEffect[] = [];
  const rooms = state.residents,
    links = restoreRoomLinks(state.roomLinks, rooms);
  const modes = restoreRoomModes(state.roomModes, rooms, state.chapter);
  const touching = (a: string, b: string) => {
    const ra = rooms.find((r) => r.id === a),
      rb = rooms.find((r) => r.id === b);
    return !!ra && !!rb && roomsTouch(ra, rb);
  };
  const add = (key: Stat, value: number) =>
    (stats[key] = (stats[key] ?? 0) + value);
  const effect = (
    id: string,
    title: string,
    text: string,
    residents: string[],
    negative = false,
  ) => effects.push({ id, title, text, residents, negative });
  const kitchen = rooms.find((r) => r.id === 'nina');
  const fed = kitchen
    ? rooms.filter((r) => r !== kitchen && roomsTouch(kitchen, r))
    : [];
  if (fed.length) {
    add('rate', 0.06 * fed.length);
    effect(
      'kitchen',
      'Спільний стіл',
      `+${fed.length * 6}% темпу стрільби. Ніна годує: ${fed.map((r) => RESIDENT_BY_ID[r.id].name).join(', ')}.`,
      ['nina', ...fed.map((r) => r.id)],
    );
  }
  if (touching('mechanic', 'lev')) {
    add('damage', 4);
    effect('workshop', 'Зброярська майстерня', 'Петрович + Микола: +4 шкоди.', [
      'mechanic',
      'lev',
    ]);
  }
  if (touching('mechanic', 'marta')) {
    add('regen', -0.3);
    effect(
      'noise',
      'Шум за стіною',
      'Майстерня заважає Марті: −0,3 відновлення/с. Пересели одну з квартир.',
      ['mechanic', 'marta'],
      true,
    );
  }
  let medicine = 0,
    strain = 0,
    echo = false;
  if (state.chapter >= 1 && touching('marta', 'flora')) {
    medicine = links.some((p) => p.includes('marta') && p.includes('flora'))
      ? 8
      : 6;
    effect(
      'pharmacy',
      'Жива аптека',
      `Марта + Флора: автоматично +${medicine} міцності кожні 12 с бою.`,
      ['marta', 'flora'],
    );
  }
  if (state.chapter >= 1 && touching('mechanic', 'lev')) {
    add('drones', 1);
    effect(
      'drone',
      'Бойовий помічник',
      'Механік і вартовий зібрали додаткового бойового дрона.',
      ['mechanic', 'lev'],
    );
  }
  if (modes.spark === 'lab') {
    const spark = rooms.find((r) => r.id === 'spark')!;
    const neighbors = rooms.filter((r) => r !== spark && roomsTouch(spark, r));
    if (neighbors.length) {
      add('chain', 1);
      add('damage', 6);
      effect(
        'lab',
        'Експериментальна лабораторія',
        'За наявності сусіда: +6 шкоди, снаряди передають удар ще одному ворогу.',
        ['spark', ...neighbors.map((r) => r.id)],
      );
      if (!touching('spark', 'mechanic')) {
        strain = 3;
        effect(
          'lab-risk',
          'Нестабільність',
          'Кожні 10 с −3 міцності обшивки (не нижче 1). Петрович поруч усуває витік.',
          ['spark'],
          true,
        );
      } else
        effect(
          'lab-safe',
          'Контроль експериментів',
          'Петрович поруч: витоку міцності немає.',
          ['spark', 'mechanic'],
        );
    }
  }
  if (modes.solomia === 'anomaly') {
    const radio = rooms.find((r) => r.id === 'solomia')!;
    const neighbors = rooms.filter((r) => r !== radio && roomsTouch(radio, r));
    if (neighbors.length) {
      echo = true;
      // The multiplicative penalty is applied after the firing-rate cap.
      effect(
        'echo',
        'Часове відлуння',
        'Кожен четвертий основний залп повторюється без витрат.',
        ['solomia', ...neighbors.map((r) => r.id)],
      );
      effect(
        'echo-cost',
        'Часовий зсув',
        'Аномалія сповільнює темп стрільби будинку на 15%.',
        ['solomia'],
        true,
      );
    }
  }
  if (links.length) {
    add('speed', -links.length * 6);
    effect(
      'joined',
      'Спільна оборона',
      `Об’єднані квартири: перша захисна хвиля через 6 с, потім кожні 20 с, ${links.length * 24} шкоди ворогам у радіусі 220.`,
      links.flat(),
    );
    effect(
      'joined-cost',
      'Важкі секції',
      `−${links.length * 6} швидкості. Об’єднані квартири переміщуються та обертаються разом.`,
      links.flat(),
      true,
    );
  }
  return { stats, effects, medicine, strain, echo, defense: links.length * 24 };
}
