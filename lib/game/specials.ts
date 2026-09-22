import type { Run } from './model';
import { activeEquipment } from './equipment';
import { furnitureBonuses } from './furniture';
import { roomsTouch } from './apartments';

// Special effects are unique per house; extra copies only add their base stats.
export function specialEffects(run: Run) {
  const equipment = new Set(activeEquipment(run).map((item) => item.id));
  const valid = new Set(
    furnitureBonuses(run.furniture, run.residents).details.map((f) => f.uid),
  );
  const neighbor = (id: string, person: string) =>
    run.furniture.some((f) => {
      if (f.id !== id || !valid.has(f.uid)) return false;
      const a = run.residents.find((r) => r.id === f.resident);
      const b = run.residents.find((r) => r.id === person);
      return !!a && !!b && a.id !== b.id && roomsTouch(a, b);
    });
  return {
    shields:
      Number(equipment.has('airbag')) + Number(neighbor('firedoor', 'boris')),
    dashShot: equipment.has('flywheel'),
    pulseHeal:
      (equipment.has('medpulse') ? 8 : 0) +
      (neighbor('soupstation', 'nina') ? 4 : 0),
    lastStand: equipment.has('redline'),
    dashCooldown: neighbor('chargingseat', 'spark') ? 3.2 : 3.8,
    gardenRegen: neighbor('seedlibrary', 'flora') ? 0.35 : 0,
  };
}
