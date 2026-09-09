import { useState } from 'react';
import { ITEM_BY_ID } from '@/lib/game/data';
import type { Run } from '@/lib/game/model';
export function Backpack({
  run,
  onInstall,
  onScrap,
}: {
  run: Run;
  onInstall: (uid: number, slot: number) => void;
  onScrap: (uid: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div>
      <p className="bag-instructions">
        {run.backpack.length}/30 запасних модулів. Працює лише встановлене
        обладнання.
      </p>
      <div className="storage-list">
        {run.backpack.map((i) => (
          <div key={i.uid}>
            <button
              className="secondary"
              onClick={() => setSelected(selected === i.uid ? null : i.uid)}
            >
              {ITEM_BY_ID[i.id].name}
            </button>
            <button
              className="text-button danger"
              onClick={() => onScrap(i.uid)}
            >
              Розібрати · +2
            </button>
            {selected === i.uid && (
              <div className="bag-install-slots">
                {run.items.map((id, slot) => (
                  <button
                    key={slot}
                    onClick={() => {
                      onInstall(i.uid, slot);
                      setSelected(null);
                    }}
                  >
                    <small>ОБЛАДНАННЯ {slot + 1}</small>
                    {id ? ITEM_BY_ID[id].name : '+ Вільне кріплення'}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {!run.backpack.length && (
        <p className="bag-empty">
          Запасів поки немає. Нагороду або покупку можна залишити «На склад».
        </p>
      )}
      <p className="bag-instructions">
        Під час встановлення старий модуль повертається на склад.
      </p>
    </div>
  );
}
