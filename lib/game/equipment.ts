import { ITEM_BY_ID } from './data';
import { residentCells, type ResidentRoom } from './residents';

// These indices are saved: append new residents, never reorder existing entries.
export const APARTMENT_SLOTS = (
  [
    ['mechanic', 3],
    ['spark', 3],
    ['flora', 3],
    ['boris', 3],
    ['nina', 2],
    ['lev', 2],
    ['marta', 2],
    ['danilo', 1],
    ['solomia', 3],
  ] as const
).flatMap(([resident, count]) =>
  Array.from({ length: count }, (_, index) => ({ resident, cell: index + 1 })),
);
export const STORAGE_LIMIT = 30;
// Returning equipment and migrating saves may temporarily overflow normal storage.
export const RESTORED_STORAGE_LIMIT = STORAGE_LIMIT + APARTMENT_SLOTS.length;
type EquipmentHouse = {
  residents: ResidentRoom[];
  items: (string | null)[];
  furniture: { resident: string | null; cell: number | null }[];
};
export function apartmentSlot(resident: string, cell: number) {
  return APARTMENT_SLOTS.findIndex(
    (slot) => slot.resident === resident && slot.cell === cell,
  );
}
export function equipmentTargets(house: Pick<EquipmentHouse, 'residents'>) {
  return APARTMENT_SLOTS.flatMap((slot, index) => {
    const room = house.residents.find((room) => room.id === slot.resident);
    if (!room) return [];
    const position = residentCells(room.id, room.rotation)[slot.cell];
    return position
      ? [
          {
            ...slot,
            slot: index,
            x: room.x + position[0],
            y: room.y + position[1],
          },
        ]
      : [];
  });
}
export function canEquipAt(house: EquipmentHouse, slot: number) {
  const target = APARTMENT_SLOTS[slot];
  return (
    Number.isInteger(slot) &&
    !!target &&
    house.residents.some((room) => room.id === target.resident) &&
    !house.furniture.some(
      (item) => item.resident === target.resident && item.cell === target.cell,
    )
  );
}
export function activeEquipment(house: EquipmentHouse) {
  return equipmentTargets(house).flatMap((target) => {
    const id = house.items[target.slot];
    return id && ITEM_BY_ID[id] && canEquipAt(house, target.slot)
      ? [{ ...target, id }]
      : [];
  });
}
export function emptyEquipment(): (string | null)[] {
  return APARTMENT_SLOTS.map(() => null);
}
