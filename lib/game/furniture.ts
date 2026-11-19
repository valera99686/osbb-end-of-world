import type { Stat } from './data';
import { statText } from './stat-text';
import { RESIDENT_BY_ID, type ResidentRoom } from './residents';

export interface Furnishing {
  uid: number;
  id: string;
  resident: string | null;
  // Index in the resident's canonical shape. Moves and rotations keep this slot.
  cell: number | null;
}
export interface FurnitureDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  stat: Stat;
  value: number;
  // A favourite resident doubles the plus, never the minus.
  favorites: string[];
  minus?: { stat: Stat; value: number };
  // A rule of its own, applied in specials.ts.
  rule?: string;
}
type Row = [
  id: string,
  name: string,
  icon: string,
  cost: number,
  stat: Stat,
  value: number,
  favorites: string[],
  minus?: [Stat, number],
  rule?: string,
];
const ROWS: Row[] = [
  [
    'firedoor',
    'Протипожежна перегородка',
    'wrench',
    38,
    'health',
    8,
    [],
    undefined,
    'У квартирі поруч із Борисом: блокує один ворожий удар за бій. Дублікати не додають зарядів',
  ],
  [
    'soupstation',
    'Супова станція',
    'coffee',
    34,
    'health',
    8,
    [],
    undefined,
    'У квартирі поруч із Ніною: хвиля, що влучила у живого ворога, лікує 4 міцності. Раз за хвилю, ефект дублікатів не складається',
  ],
  [
    'chargingseat',
    'Зарядне крісло',
    'wifi',
    38,
    'speed',
    4,
    [],
    undefined,
    'У квартирі поруч з Іскрою: перезаряджання ривка 3,2 с замість 3,8 с. Ефект дублікатів не складається',
  ],
  [
    'seedlibrary',
    'Бібліотека насіння',
    'sprout',
    36,
    'regen',
    0.1,
    [],
    undefined,
    'У квартирі поруч із Флорою: додатково +0,35 відновлення/с на будинок. Ефект дублікатів не складається',
  ],
  [
    'toolwall',
    'Стіна інструментів',
    'hammer',
    30,
    'damage',
    4,
    ['mechanic', 'lev'],
  ],
  ['hammock', 'Підвісне ліжко', 'heart', 30, 'health', 18, ['nina', 'marta']],
  ['ramp', 'Тренажер кур’єра', 'footprints', 32, 'speed', 8, ['danilo']],
  [
    'relayDesk',
    'Пульт координації',
    'wifi',
    35,
    'rate',
    0.1,
    ['solomia', 'spark'],
  ],
  ['aquarium', 'Біоакваріум', 'sprout', 32, 'regen', 0.25, ['flora']],
  ['starchart', 'Мапа зірок', 'scan', 38, 'crit', 0.04, ['solomia', 'lev']],
  ['bench', 'Верстак', 'wrench', 18, 'armor', 1, ['mechanic']],
  ['coffee', 'Кавоварка', 'coffee', 25, 'rate', 0.06, ['spark']],
  ['planter', 'Мінітеплиця', 'sprout', 20, 'health', 10, ['flora', 'nina']],
  ['medkit', 'Аптечка', 'medical', 20, 'regen', 0.15, ['marta']],
  ['radio', 'Радіоприймач', 'radio', 25, 'range', 30, ['lev', 'solomia']],
  ['bike', 'Велотренажер', 'bike', 20, 'speed', 6, ['danilo', 'boris']],
  // 0.43.0
  ['samovar', 'Самовар на дровах', 'flame', 26, 'regen', 0.2, ['nina']],
  [
    'lathe',
    'Токарний верстат',
    'cog',
    34,
    'damage',
    6,
    ['mechanic'],
    ['speed', -4],
  ],
  [
    'sandbags',
    'Мішки з піском',
    'shield',
    30,
    'armor',
    2,
    ['boris'],
    ['speed', -6],
  ],
  ['woodstove', 'Буржуйка', 'flame', 28, 'health', 14, ['nina', 'boris']],
  ['bunkbed', 'Двоярусне ліжко', 'bed', 24, 'health', 12, ['danilo', 'marta']],
  ['dartboard', 'Дартс', 'target', 26, 'crit', 0.03, ['lev']],
  ['gramophone', 'Грамофон', 'music', 28, 'rate', 0.07, ['solomia']],
  [
    'antenna_mast',
    'Щогла антени',
    'tower',
    36,
    'range',
    45,
    ['solomia'],
    ['speed', -5],
  ],
  ['scrap_shelf', 'Стелаж із брухтом', 'package', 22, 'magnet', 40, ['boris']],
  [
    'cash_box',
    'Скарбничка ОСББ',
    'piggy',
    30,
    'luck',
    0.25,
    ['boris'],
    ['health', -8],
  ],
  [
    'treadmill',
    'Бігова доріжка',
    'activity',
    30,
    'speed',
    10,
    ['danilo'],
    ['regen', -0.1],
  ],
  [
    'massage_chair',
    'Масажне крісло',
    'armchair',
    32,
    'regen',
    0.25,
    ['marta', 'nina'],
  ],
  ['fridge', 'Холодильник «Дніпро»', 'fridge', 28, 'health', 16, ['nina']],
  ['herb_rack', 'Сушарка трав', 'leaf', 24, 'regen', 0.18, ['flora', 'marta']],
  [
    'hydroponics',
    'Гідропонна шафа',
    'droplets',
    40,
    'regen',
    0.4,
    ['flora'],
    ['rate', -0.04],
  ],
  ['beehive', 'Вулик на балконі', 'bug', 34, 'thorns', 10, ['flora']],
  [
    'mushroom_box',
    'Грибна скриня',
    'sprout',
    26,
    'health',
    20,
    ['flora'],
    ['speed', -5],
  ],
  ['soldering', 'Паяльна станція', 'plug', 32, 'damage', 5, ['spark']],
  [
    'transformer',
    'Трансформаторна шафа',
    'zap',
    40,
    'rate',
    0.14,
    ['spark'],
    ['health', -12],
  ],
  [
    'server_rack',
    'Серверна стійка',
    'server',
    38,
    'crit',
    0.06,
    ['spark', 'solomia'],
    ['regen', -0.15],
  ],
  [
    'arcade',
    'Ігровий автомат',
    'gamepad',
    30,
    'crit',
    0.05,
    ['danilo'],
    ['luck', -0.25],
  ],
  [
    'telescope',
    'Телескоп на даху',
    'telescope',
    36,
    'range',
    60,
    ['lev', 'solomia'],
    ['speed', -5],
  ],
  [
    'gun_rack',
    'Стійка для гвинтівок',
    'crosshair',
    36,
    'damage',
    7,
    ['lev'],
    ['armor', -1],
  ],
  [
    'punching_bag',
    'Боксерська груша',
    'dumbbell',
    28,
    'damage',
    5,
    ['boris', 'lev'],
  ],
  ['wardrobe', 'Бабусина шафа', 'archive', 26, 'armor', 1, ['nina']],
  [
    'first_aid_post',
    'Медпункт',
    'cross',
    34,
    'regen',
    0.3,
    ['marta'],
    ['speed', -4],
  ],
  [
    'daylight_lamp',
    'Лампа денного світла',
    'lamp',
    22,
    'regen',
    0.12,
    ['flora'],
  ],
  ['map_table', 'Стіл із мапами', 'map', 30, 'speed', 7, ['danilo', 'solomia']],
  [
    'anvil',
    'Ковадло',
    'anvil',
    38,
    'armor',
    2,
    ['mechanic', 'boris'],
    ['rate', -0.05],
  ],
  [
    'battery_bank',
    'Банк акумуляторів',
    'battery',
    34,
    'rate',
    0.09,
    ['spark', 'mechanic'],
  ],
  ['sofa', 'Розкладний диван', 'sofa', 24, 'health', 14, ['marta', 'danilo']],
  [
    'cat_house',
    'Будиночок для кота',
    'cat',
    20,
    'luck',
    0.25,
    ['nina', 'flora'],
  ],
  ['fire_bell', 'Пожежний дзвін', 'bell', 30, 'thorns', 14, ['mechanic']],
  [
    'dryer',
    'Сушильна машина',
    'fan',
    30,
    'speed',
    8,
    ['danilo'],
    ['health', -6],
  ],
  [
    'ham_radio',
    'Аматорська рація',
    'radio',
    30,
    'range',
    35,
    ['solomia', 'lev'],
  ],
];
export const FURNITURE: FurnitureDef[] = ROWS.map(
  ([id, name, icon, cost, stat, value, favorites, minus, rule]) => ({
    id,
    name,
    icon,
    cost,
    stat,
    value,
    favorites,
    ...(minus ? { minus: { stat: minus[0], value: minus[1] } } : {}),
    ...(rule ? { rule } : {}),
  }),
);
export const FURNITURE_BY_ID: Record<string, FurnitureDef> = Object.assign(
  Object.create(null),
  Object.fromEntries(FURNITURE.map((item) => [item.id, item])),
);
// What a piece gives in a resident's flat: the plus (doubled for a favourite),
// the minus and its own rule.
export function furnitureEffect(id: string, resident: string | null) {
  const item = FURNITURE_BY_ID[id];
  const value =
    item.value * (resident && item.favorites.includes(resident) ? 2 : 1);
  const parts = [statText(item.stat, value)];
  if (item.minus) parts.push(statText(item.minus.stat, item.minus.value));
  return {
    stat: item.stat,
    value,
    minus: item.minus,
    label: parts.join(', ') + (item.rule ? '. ' + item.rule : ''),
  };
}
// The text of a piece out of a flat (shop, finds, workshop).
export function furnitureText(id: string) {
  const item = FURNITURE_BY_ID[id];
  const fans = item.favorites.map((r) => RESIDENT_BY_ID[r].name);
  const favourite = fans.length
    ? `${fans.join(' або ')}: ${statText(item.stat, item.value * 2)}`
    : '';
  return [furnitureEffect(id, null).label, favourite]
    .filter(Boolean)
    .join('. ');
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
    if (effect.minus)
      stats[effect.minus.stat] =
        (stats[effect.minus.stat] ?? 0) + effect.minus.value;
    details.push({
      uid: item.uid,
      resident: item.resident,
      label: effect.label,
    });
  }
  return { stats, details };
}
