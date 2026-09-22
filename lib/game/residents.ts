import { CHARACTERS, type Stat } from './data';

export interface Resident {
  id: string;
  name: string;
  job: string;
  portrait: number;
  color: string;
  shape: [number, number][];
  effect: string;
  stats: Partial<Record<Stat, number>>;
}
export interface ResidentRoom {
  id: string;
  x: number;
  y: number;
  rotation: number;
}
export const HOUSE_WIDTH = 4,
  HOUSE_HEIGHT = 4;
export const HOUSE_EXPANSION_COSTS = [200, 360, 520];
export function houseSize(level = 0) {
  const sizes = [
    { width: 4, height: 4 },
    { width: 5, height: 4 },
    { width: 5, height: 5 },
    { width: 6, height: 6 },
    { width: 8, height: 6 }, // Retained floor for expeditions saved before 0.5.
  ];
  return sizes[
    Number.isFinite(level) ? Math.max(0, Math.min(4, Math.floor(level))) : 0
  ];
}

// Ownership is permanent; presence belongs to this expedition only.
export function residentGroups(roster: string[], rooms: ResidentRoom[]) {
  const aboard = new Set(rooms.map((room) => room.id));
  const owned = new Set(roster);
  return {
    aboard: RESIDENTS.filter((resident) => aboard.has(resident.id)),
    reserve: RESIDENTS.filter(
      (resident) => owned.has(resident.id) && !aboard.has(resident.id),
    ),
    missing: RESIDENTS.filter(
      (resident) => !owned.has(resident.id) && !aboard.has(resident.id),
    ),
  };
}

// Adjacent cells share a floor, but only exposed edges become room walls.
export function roomGeometry(id: string, rotation = 0, unit = 100) {
  const cells = residentCells(id, rotation);
  const occupied = new Set(cells.map(([x, y]) => `${x}:${y}`));
  const edges: string[] = [];
  const floor = cells
    .map(([x, y]) => {
      const left = x * unit,
        top = y * unit;
      if (!occupied.has(`${x}:${y - 1}`)) edges.push(`M${left},${top}h${unit}`);
      if (!occupied.has(`${x + 1}:${y}`))
        edges.push(`M${left + unit},${top}v${unit}`);
      if (!occupied.has(`${x}:${y + 1}`))
        edges.push(`M${left + unit},${top + unit}h${-unit}`);
      if (!occupied.has(`${x - 1}:${y}`))
        edges.push(`M${left},${top + unit}v${-unit}`);
      return `M${left},${top}h${unit}v${unit}h${-unit}Z`;
    })
    .join(' ');
  return { floor, walls: edges.join(' '), edgeCount: edges.length };
}
export const RESIDENTS: Resident[] = [
  {
    id: 'mechanic',
    name: 'Петрович',
    job: 'Механік',
    portrait: 0,
    color: '#dca75c',
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
    effect: '+2 броні. Поруч з Іскрою: +15% темпу.',
    stats: { armor: 2 },
  },
  {
    id: 'spark',
    name: 'Іскра',
    job: 'Інженерка',
    portrait: 1,
    color: '#74bdd6',
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 1],
    ],
    effect: '+12% темпу стрільби.',
    stats: { rate: 0.12 },
  },
  {
    id: 'flora',
    name: 'Флора',
    job: 'Ботанік',
    portrait: 2,
    color: '#8cbd83',
    shape: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    effect: '+18 міцності. Поруч із Ніною: +0,5 відновлення/с.',
    stats: { health: 18 },
  },
  {
    id: 'boris',
    name: 'Борис',
    job: 'Комірник',
    portrait: 3,
    color: '#bd9981',
    shape: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    effect: '+40 радіусу збору та +1 удачі.',
    stats: { magnet: 40, luck: 1 },
  },
  {
    id: 'nina',
    name: 'Ніна',
    job: 'Кухарка',
    portrait: 4,
    color: '#df997a',
    shape: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    effect: '+12 міцності. Поруч із Мартою: +0,7 відновлення/с.',
    stats: { health: 12 },
  },
  {
    id: 'lev',
    name: 'Микола',
    job: 'Вартовий',
    portrait: 5,
    color: '#93acbd',
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    effect: '+3 шкоди. Поруч із Соломією: +60 дальності.',
    stats: { damage: 3 },
  },
  {
    id: 'marta',
    name: 'Марта',
    job: 'Медикиня',
    portrait: 6,
    color: '#9bcebf',
    shape: [
      [0, 0],
      [0, 1],
      [1, 1],
    ],
    effect: '+0,6 відновлення міцності/с.',
    stats: { regen: 0.6 },
  },
  {
    id: 'danilo',
    name: 'Данило',
    job: 'Кур’єр',
    portrait: 7,
    color: '#f0c15e',
    shape: [
      [0, 0],
      [0, 1],
    ],
    effect: '+16 швидкості будинку.',
    stats: { speed: 16 },
  },
  {
    id: 'solomia',
    name: 'Соломія',
    job: 'Радистка',
    portrait: 8,
    color: '#b7a0d9',
    shape: [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
    effect: '+1 бойовий дрон.',
    stats: { drones: 1 },
  },
];
export const RESIDENT_BY_ID: Record<string, Resident> = Object.assign(
  Object.create(null),
  Object.fromEntries(RESIDENTS.map((r) => [r.id, r])),
);
export function residentRoster(saved: unknown, wins: number): string[] {
  return [
    ...new Set([
      'nina',
      'lev',
      ...CHARACTERS.filter((c) => c.win <= wins).map((c) => c.id),
      ...(Array.isArray(saved)
        ? saved.filter(
            (id): id is string =>
              typeof id === 'string' && !!RESIDENT_BY_ID[id],
          )
        : []),
    ]),
  ];
}
export function residentCells(id: string, rotation = 0): [number, number][] {
  let cells =
    RESIDENT_BY_ID[id]?.shape.map(([x, y]): [number, number] => [x, y]) ?? [];
  for (let i = 0; i < ((rotation % 4) + 4) % 4; i++)
    cells = cells.map(([x, y]) => [-y, x]);
  const minX = Math.min(...cells.map((c) => c[0])),
    minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}
export function canHouse(
  rooms: ResidentRoom[],
  room: ResidentRoom,
  level = 0,
): boolean {
  const size = houseSize(level);
  if (
    !RESIDENT_BY_ID[room.id] ||
    ![room.x, room.y, room.rotation].every(Number.isInteger) ||
    room.rotation < 0 ||
    room.rotation > 3
  )
    return false;
  const occupied = new Set(
    rooms
      .filter((r) => r.id !== room.id)
      .flatMap((r) =>
        residentCells(r.id, r.rotation).map(
          ([x, y]) => `${x + r.x}:${y + r.y}`,
        ),
      ),
  );
  return residentCells(room.id, room.rotation).every(
    ([x, y]) =>
      x + room.x >= 0 &&
      y + room.y >= 0 &&
      x + room.x < size.width &&
      y + room.y < size.height &&
      !occupied.has(`${x + room.x}:${y + room.y}`),
  );
}
export function residentSpace(
  rooms: ResidentRoom[],
  id: string,
  level = 0,
): ResidentRoom | null {
  const size = houseSize(level);
  for (let rotation = 0; rotation < 4; rotation++)
    for (let y = 0; y < size.height; y++)
      for (let x = 0; x < size.width; x++) {
        const r = { id, x, y, rotation };
        if (canHouse(rooms, r, level)) return r;
      }
  return null;
}
export function initialHouse(captain: string): ResidentRoom[] {
  const rooms: ResidentRoom[] = [];
  for (const id of [captain]) {
    const r = residentSpace(rooms, id);
    if (r) rooms.push(r);
  }
  return rooms;
}
export function restoreResidents(
  raw: unknown,
  roster: string[],
  captain: string,
  level = 0,
): ResidentRoom[] {
  if (!Array.isArray(raw)) return initialHouse(captain);
  const rooms: ResidentRoom[] = [];
  // The captain is always restored first, even in a partially damaged save.
  const ordered = [
    ...raw.filter((r) => r?.id === captain),
    ...raw.filter((r) => r?.id !== captain),
  ];
  for (const r of ordered)
    if (
      r &&
      roster.includes(r.id) &&
      !rooms.some((p) => p.id === r.id) &&
      canHouse(rooms, r, level)
    )
      rooms.push({ id: r.id, x: r.x, y: r.y, rotation: r.rotation });
  if (!rooms.some((r) => r.id === captain)) {
    const c = residentSpace(rooms, captain, level);
    if (c) rooms.push(c);
    else return initialHouse(captain);
  }
  return rooms;
}
export function residentBonuses(rooms: ResidentRoom[]): {
  stats: Partial<Record<Stat, number>>;
  synergies: string[];
} {
  const stats: Partial<Record<Stat, number>> = {},
    synergies: string[] = [];
  for (const r of rooms)
    for (const [k, v] of Object.entries(RESIDENT_BY_ID[r.id]?.stats ?? {}))
      stats[k as Stat] = (stats[k as Stat] ?? 0) + v;
  const touching = (a: string, b: string) => {
    const ra = rooms.find((r) => r.id === a),
      rb = rooms.find((r) => r.id === b);
    if (!ra || !rb) return false;
    return residentCells(a, ra.rotation).some(([x, y]) =>
      residentCells(b, rb.rotation).some(
        ([u, v]) =>
          Math.abs(x + ra.x - u - rb.x) + Math.abs(y + ra.y - v - rb.y) === 1,
      ),
    );
  };
  const pairs: [string, string, Stat, number, string][] = [
    ['mechanic', 'spark', 'rate', 0.15, 'Спільна майстерня: +15% темпу'],
    ['nina', 'marta', 'regen', 0.7, 'Турбота про дім: +0,7 відновлення/с'],
    ['flora', 'nina', 'regen', 0.5, 'Власний врожай: +0,5 відновлення/с'],
    ['lev', 'solomia', 'range', 60, 'Радіодозор: +60 дальності'],
  ];
  for (const [a, b, k, v, label] of pairs)
    if (touching(a, b)) {
      stats[k] = (stats[k] ?? 0) + v;
      synergies.push(label);
    }
  return { stats, synergies };
}
