import type { Stat } from './data';
import { RESIDENT_BY_ID, type ResidentRoom } from './residents';

export interface Furnishing {
  uid: number;
  id: string;
  resident: string | null;
  // Index in the resident's canonical shape. Moves and rotations keep this slot.
  cell: number | null;
}
export const FURNITURE = [
  {
    id: 'firedoor',
    name: 'Протипожежна перегородка',
    icon: 'wrench',
    cost: 38,
    stat: 'health' as Stat,
    value: 8,
    unit: 'міцності',
    favorites: [],
    bonus:
      'У квартирі поруч із Борисом: блокує один ворожий удар за бій. Дублікати не додають зарядів',
  },
  {
    id: 'soupstation',
    name: 'Супова станція',
    icon: 'coffee',
    cost: 34,
    stat: 'health' as Stat,
    value: 8,
    unit: 'міцності',
    favorites: [],
    bonus:
      'У квартирі поруч із Ніною: хвиля, що влучила у живого ворога, лікує 4 міцності. Раз за хвилю, ефект дублікатів не складається',
  },
  {
    id: 'chargingseat',
    name: 'Зарядне крісло',
    icon: 'wifi',
    cost: 38,
    stat: 'speed' as Stat,
    value: 4,
    unit: 'швидкості',
    favorites: [],
    bonus:
      'У квартирі поруч з Іскрою: перезаряджання ривка 3,2 с замість 3,8 с. Ефект дублікатів не складається',
  },
  {
    id: 'seedlibrary',
    name: 'Бібліотека насіння',
    icon: 'sprout',
    cost: 36,
    stat: 'regen' as Stat,
    value: 0.1,
    unit: 'відновлення/с',
    favorites: [],
    bonus:
      'У квартирі поруч із Флорою: додатково +0,35 відновлення/с на будинок. Ефект дублікатів не складається',
  },
  {
    id: 'toolwall',
    name: 'Стіна інструментів',
    icon: 'hammer',
    cost: 30,
    stat: 'damage' as Stat,
    value: 4,
    unit: 'шкоди',
    favorites: ['mechanic', 'lev'],
    bonus: 'Петрович або Микола: +8 шкоди',
  },
  {
    id: 'hammock',
    name: 'Підвісне ліжко',
    icon: 'heart',
    cost: 30,
    stat: 'health' as Stat,
    value: 18,
    unit: 'міцності',
    favorites: ['nina', 'marta'],
    bonus: 'Ніна або Марта: +36 міцності',
  },
  {
    id: 'ramp',
    name: 'Тренажер кур’єра',
    icon: 'footprints',
    cost: 32,
    stat: 'speed' as Stat,
    value: 8,
    unit: 'швидкості',
    favorites: ['danilo'],
    bonus: 'Данило: +16 швидкості',
  },
  {
    id: 'relayDesk',
    name: 'Пульт координації',
    icon: 'wifi',
    cost: 35,
    stat: 'rate' as Stat,
    value: 0.1,
    unit: 'темпу',
    favorites: ['solomia', 'spark'],
    bonus: 'Соломія або Іскра: +20% темпу',
  },
  {
    id: 'aquarium',
    name: 'Біоакваріум',
    icon: 'sprout',
    cost: 32,
    stat: 'regen' as Stat,
    value: 0.25,
    unit: 'відновлення/с',
    favorites: ['flora'],
    bonus: 'Флора: +0,5 відновлення/с',
  },
  {
    id: 'starchart',
    name: 'Мапа зірок',
    icon: 'scan',
    cost: 38,
    stat: 'crit' as Stat,
    value: 0.04,
    unit: 'шансу критичного удару',
    favorites: ['solomia', 'lev'],
    bonus: 'Соломія або Микола: +8% критичного удару',
  },
  {
    id: 'bench',
    name: 'Верстак',
    icon: 'wrench',
    cost: 18,
    stat: 'armor' as Stat,
    value: 1,
    unit: 'броні',
    favorites: ['mechanic'],
    bonus: 'Петрович: +2 броні',
  },
  {
    id: 'coffee',
    name: 'Кавоварка',
    icon: 'coffee',
    cost: 25,
    stat: 'rate' as Stat,
    value: 0.06,
    unit: 'темпу',
    favorites: ['spark'],
    bonus: 'Іскра: +12% темпу',
  },
  {
    id: 'planter',
    name: 'Мінітеплиця',
    icon: 'sprout',
    cost: 20,
    stat: 'health' as Stat,
    value: 10,
    unit: 'міцності',
    favorites: ['flora', 'nina'],
    bonus: 'Флора або Ніна: +20 міцності',
  },
  {
    id: 'medkit',
    name: 'Аптечка',
    icon: 'medical',
    cost: 20,
    stat: 'regen' as Stat,
    value: 0.15,
    unit: 'відновлення/с',
    favorites: ['marta'],
    bonus: 'Марта: +0,3 відновлення/с',
  },
  {
    id: 'radio',
    name: 'Радіоприймач',
    icon: 'radio',
    cost: 25,
    stat: 'range' as Stat,
    value: 30,
    unit: 'дальності',
    favorites: ['lev', 'solomia'],
    bonus: 'Микола або Соломія: +60 дальності',
  },
  {
    id: 'bike',
    name: 'Велотренажер',
    icon: 'bike',
    cost: 20,
    stat: 'speed' as Stat,
    value: 6,
    unit: 'швидкості',
    favorites: ['danilo', 'boris'],
    bonus: 'Данило або Борис: +12 швидкості',
  },
];
export const FURNITURE_BY_ID: Record<string, (typeof FURNITURE)[number]> =
  Object.assign(
    Object.create(null),
    Object.fromEntries(FURNITURE.map((item) => [item.id, item])),
  );
export function furnitureEffect(id: string, resident: string | null) {
  const item = FURNITURE_BY_ID[id];
  const value =
    item.value * (resident && item.favorites.includes(resident) ? 2 : 1);
  const amount = (
    ['rate', 'crit'].includes(item.stat) ? value * 100 : value
  ).toLocaleString('uk-UA', { maximumFractionDigits: 2 });
  return {
    stat: item.stat,
    value,
    label: `+${amount}${['rate', 'crit'].includes(item.stat) ? '%' : ''} ${item.unit}${['firedoor', 'soupstation', 'chargingseat', 'seedlibrary'].includes(id) ? '. ' + item.bonus : ''}`,
  };
}
export function canFurnish(
  items: Furnishing[],
  rooms: ResidentRoom[],
  uid: number,
  resident: string,
  cell: number,
): boolean {
  return (
    items.some((item) => item.uid === uid && !!FURNITURE_BY_ID[item.id]) &&
    rooms.some((room) => room.id === resident) &&
    Number.isInteger(cell) &&
    cell > 0 &&
    cell < (RESIDENT_BY_ID[resident]?.shape.length ?? 0) &&
    !items.some(
      (item) =>
        item.uid !== uid && item.resident === resident && item.cell === cell,
    )
  );
}
export function restoreFurniture(
  raw: unknown,
  rooms: ResidentRoom[],
): Furnishing[] {
  if (!Array.isArray(raw)) return [];
  const items: Furnishing[] = [];
  for (const entry of raw) {
    if (
      !entry ||
      !FURNITURE_BY_ID[entry.id] ||
      !Number.isInteger(entry.uid) ||
      entry.uid < 1 ||
      entry.uid > 1e8 ||
      items.some((item) => item.uid === entry.uid)
    )
      continue;
    const item: Furnishing = {
      uid: entry.uid,
      id: entry.id,
      resident: null,
      cell: null,
    };
    items.push(item);
    if (canFurnish(items, rooms, item.uid, entry.resident, entry.cell)) {
      item.resident = entry.resident;
      item.cell = entry.cell;
    }
    if (items.length === 30) break;
  }
  return items;
}
export function furnitureBonuses(items: Furnishing[], rooms: ResidentRoom[]) {
  const stats: Partial<Record<Stat, number>> = {};
  const details: { uid: number; resident: string; label: string }[] = [];
  const occupied = new Set<string>();
  for (const item of items) {
    const key = `${item.resident}:${item.cell}`;
    if (
      !item.resident ||
      item.cell === null ||
      occupied.has(key) ||
      !canFurnish([item], rooms, item.uid, item.resident, item.cell)
    )
      continue;
    occupied.add(key);
    const effect = furnitureEffect(item.id, item.resident);
    stats[effect.stat] = (stats[effect.stat] ?? 0) + effect.value;
    details.push({
      uid: item.uid,
      resident: item.resident,
      label: effect.label,
    });
  }
  return { stats, details };
}
