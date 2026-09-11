import { useState } from 'react';
import { ITEM_BY_ID } from '@/lib/game/data';
import type { Run, Meta } from '@/lib/game/model';
import { EquipmentPlacement } from './residents';
import { Glyph } from './glyph';
export function Backpack({
  run,
  meta,
  onInstall,
  onScrap,
}: {
  run: Run;
  meta: Meta;
  onInstall: (uid: number, slot: number) => void;
  onScrap: (uid: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const item = run.backpack.find((item) => item.uid === selected);
  return (
    <div>
      {item && (
        <EquipmentPlacement
          run={run}
          level={meta.houseLevel}
          itemId={item.id}
          onInstall={(slot) => onInstall(item.uid, slot)}
        />
      )}
      <p className="bag-instructions">
        {run.backpack.length} запасних модулів. Обери обладнання, потім місце
        всередині квартири.
      </p>
      <div className="storage-list">
        {run.backpack.map((item) => (
          <div key={item.uid}>
            <button
              className="secondary"
              aria-pressed={selected === item.uid}
              onClick={() =>
                setSelected(selected === item.uid ? null : item.uid)
              }
            >
              <Glyph name={ITEM_BY_ID[item.id].icon} size={20} />{' '}
              {ITEM_BY_ID[item.id].name}
            </button>
            <button
              className="text-button danger"
              onClick={() => onScrap(item.uid)}
            >
              Розібрати · +2
            </button>
          </div>
        ))}
      </div>
      {!run.backpack.length && (
        <p className="bag-empty">
          Запасів поки немає. Нагороду або покупку можна залишити «На склад».
        </p>
      )}
    </div>
  );
}
