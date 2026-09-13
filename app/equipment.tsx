import { Package, Move, Recycle, X } from 'lucide-react';
import { Glyph } from './glyph';
import { ITEM_BY_ID, FAMILY } from '@/lib/game/data';
import { APARTMENT_SLOTS } from '@/lib/game/equipment';
import { RESIDENT_BY_ID } from '@/lib/game/residents';
import {
  stowModule,
  scrapEquipment,
  type Run,
  type Meta,
} from '@/lib/game/model';

export function ApartmentEquipment({
  run,
  meta,
  selectedSlot,
  picked,
  moving,
  onPick,
  onMove,
  onChange,
  onMetaChange,
  onMessage,
}: {
  run: Run;
  meta: Meta;
  selectedSlot: number | null;
  picked: number | null;
  moving: number | null;
  onPick: (uid: number | null) => void;
  onMove: (slot: number | null) => void;
  onChange: (run: Run) => void;
  onMetaChange: (meta: Meta) => void;
  onMessage: (message: string) => void;
}) {
  const selected = selectedSlot === null ? null : run.items[selectedSlot];
  const target = selectedSlot === null ? null : APARTMENT_SLOTS[selectedSlot];
  const pending =
    picked === null
      ? null
      : run.backpack.find((item) => item.uid === picked)?.id;
  const movingId = moving === null ? null : run.items[moving];
  return (
    <section
      className="apartment-equipment"
      aria-label="Обладнання всередині квартир"
    >
      <div className="apartment-equipment-heading">
        <h3>Обладнання квартир</h3>
        <span>
          <Package size={15} /> Невстановлено: {run.backpack.length}
        </span>
      </div>
      <p>
        Обери предмет нижче, потім клітинку з «+» всередині квартири на плані
        вище.
      </p>
      {(pending || movingId) && (
        <div className="equipment-placement-hint" role="status">
          <Glyph name={ITEM_BY_ID[(pending || movingId)!].icon} size={22} />
          <span>
            <b>{ITEM_BY_ID[(pending || movingId)!].name}</b> · обери підсвічене
            місце у квартирі
          </span>
          <button
            aria-label="Скасувати встановлення обладнання"
            onClick={() => {
              onPick(null);
              onMove(null);
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {pending && (
        <div className="apartment-module-details">
          <Glyph name={ITEM_BY_ID[pending].icon} size={28} />
          <div>
            <small>Ще не встановлено</small>
            <h4>{ITEM_BY_ID[pending].name}</h4>
            <p>{ITEM_BY_ID[pending].desc}</p>
          </div>
          <div className="apartment-module-actions">
            <button
              className="text-button danger"
              disabled={run.page === 'combat'}
              onClick={() => {
                if (
                  run.page === 'combat' ||
                  !run.backpack.some((item) => item.uid === picked)
                )
                  return;
                onChange({
                  ...run,
                  backpack: run.backpack.filter((item) => item.uid !== picked),
                  scrap: run.scrap + 2,
                });
                onMetaChange({ ...meta, scrapped: meta.scrapped + 1 });
                onPick(null);
                onMessage('Модуль розібрано: +2 брухту.');
              }}
            >
              <Recycle size={15} /> Розібрати · +2 брухту
            </button>
          </div>
        </div>
      )}
      {!pending && selected && target && (
        <div className="apartment-module-details">
          <Glyph name={ITEM_BY_ID[selected].icon} size={28} />
          <div>
            <small>Квартира: {RESIDENT_BY_ID[target.resident].name}</small>
            <h4>{ITEM_BY_ID[selected].name}</h4>
            <p>{ITEM_BY_ID[selected].desc}</p>
          </div>
          <div className="apartment-module-actions">
            <button
              className="secondary small"
              onClick={() => onMove(selectedSlot)}
            >
              <Move size={15} /> Перемістити
            </button>
            <button
              className="text-button"
              onClick={() => {
                const next = stowModule(run, meta, selectedSlot!);
                if (next === run) {
                  onMessage(
                    'Забагато невстановлених предметів. Спочатку встанови або розбери запасне обладнання.',
                  );
                  return;
                }
                onChange(next);
                onMove(null);
                onMessage('Предмет знято. Можна встановити в іншу квартиру.');
              }}
            >
              <Package size={15} /> Зняти
            </button>
            <button
              className="text-button danger"
              onClick={() => {
                const next = scrapEquipment(run, meta, selectedSlot!);
                if (next === run) return;
                onChange(next);
                onMetaChange({ ...meta, scrapped: meta.scrapped + 1 });
                onMove(null);
                onMessage('Модуль розібрано: +2 брухту.');
              }}
            >
              <Recycle size={15} /> Розібрати · +2 брухту
            </button>
          </div>
        </div>
      )}
      <div className="apartment-module-stock">
        {run.backpack.map((item) => (
          <button
            key={item.uid}
            className={picked === item.uid ? 'selected' : ''}
            aria-pressed={picked === item.uid}
            onClick={() => {
              onPick(picked === item.uid ? null : item.uid);
              onMessage(
                'Обери місце всередині квартири. Попередній предмет буде знято та збережено.',
              );
            }}
          >
            <span style={{ color: FAMILY[ITEM_BY_ID[item.id].family].color }}>
              <Glyph name={ITEM_BY_ID[item.id].icon} size={25} />
            </span>
            <b>{ITEM_BY_ID[item.id].name}</b>
          </button>
        ))}
      </div>
      {!run.backpack.length && (
        <p className="equipment-empty">
          Запасних модулів немає. Натисни обладнання у квартирі, щоб перемістити
          його або зняти. Нові предмети знаходь під час рейду.
        </p>
      )}
    </section>
  );
}
