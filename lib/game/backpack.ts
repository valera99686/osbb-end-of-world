import { ITEM_BY_ID } from './data';
export const BAG_WIDTH = 6;
export const BAG_HEIGHT = 5;
export interface PackedItem {
  uid: number;
  id: string;
  x: number;
  y: number;
  rotation: number;
}
type Cell = readonly [number, number];
const SHAPES: Record<string, readonly Cell[]> = {
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  L: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  T: [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
  O: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  J: [
    [1, 0],
    [1, 1],
    [0, 2],
    [1, 2],
  ],
  rod: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  pair: [
    [0, 0],
    [1, 0],
  ],
};
const ITEM_SHAPES: Record<string, string> = {
  cannon: 'I',
  engine: 'L',
  armor: 'O',
  magnet: 'J',
  laundry: 'O',
  scope: 'rod',
  kitchen: 'pair',
  battery: 'pair',
  generator: 'T',
  tesla: 'T',
  greenhouse: 'S',
  heart: 'O',
  reactor: 'O',
  chain: 'I',
  portal: 'O',
  crown: 'T',
};
export function itemCells(id: string, rotation = 0): Cell[] {
  const item = ITEM_BY_ID[id];
  let cells: Cell[] = [
    ...SHAPES[
      ITEM_SHAPES[id] ??
        { machine: 'L', electric: 'T', organic: 'S', cursed: 'J' }[
          item?.family
        ] ??
        'O'
    ],
  ];
  for (let r = 0; r < ((rotation % 4) + 4) % 4; r++)
    cells = cells.map(([x, y]) => [-y, x]);
  const minX = Math.min(...cells.map(([x]) => x)),
    minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}
export function canPack(
  bag: readonly PackedItem[],
  id: string,
  x: number,
  y: number,
  rotation: number,
  ignoreUid?: number,
): boolean {
  if (
    !ITEM_BY_ID[id] ||
    ![x, y, rotation].every(Number.isInteger) ||
    rotation < 0 ||
    rotation > 3
  )
    return false;
  const occupied = new Set(
    bag
      .filter((i) => i.uid !== ignoreUid)
      .flatMap((i) =>
        itemCells(i.id, i.rotation).map(
          ([cx, cy]) => `${i.x + cx}:${i.y + cy}`,
        ),
      ),
  );
  return itemCells(id, rotation).every(
    ([cx, cy]) =>
      x + cx >= 0 &&
      x + cx < BAG_WIDTH &&
      y + cy >= 0 &&
      y + cy < BAG_HEIGHT &&
      !occupied.has(`${x + cx}:${y + cy}`),
  );
}
export function findSpace(bag: readonly PackedItem[], id: string) {
  for (let rotation = 0; rotation < 4; rotation++)
    for (let y = 0; y < BAG_HEIGHT; y++)
      for (let x = 0; x < BAG_WIDTH; x++)
        if (canPack(bag, id, x, y, rotation)) return { x, y, rotation };
  return null;
}
export function movePacked(
  bag: PackedItem[],
  uid: number,
  x: number,
  y: number,
  rotation: number,
): PackedItem[] {
  const item = bag.find((i) => i.uid === uid);
  if (!item || !canPack(bag, item.id, x, y, rotation, uid)) return bag;
  return bag.map((i) => (i.uid === uid ? { ...i, x, y, rotation } : i));
}
export function restoreBag(
  raw: unknown,
  unlocked: readonly string[],
): PackedItem[] {
  const out: PackedItem[] = [];
  if (!Array.isArray(raw)) return out;
  for (const entry of raw.slice(0, 30)) {
    if (
      !entry ||
      !Number.isInteger(entry.uid) ||
      entry.uid < 1 ||
      entry.uid > 1e8 ||
      out.some((i) => i.uid === entry.uid) ||
      !unlocked.includes(entry.id)
    )
      continue;
    const { uid, id, x, y, rotation } = entry;
    if (canPack(out, id, x, y, rotation)) out.push({ uid, id, x, y, rotation });
  }
  return out;
}
