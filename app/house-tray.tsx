import { useState } from 'react';
import { Check } from 'lucide-react';
import { FAMILY, ITEM_BY_ID } from '@/lib/game/data';
import { FURNITURE_BY_ID } from '@/lib/game/furniture';
import type { Resident } from '@/lib/game/residents';
import type { Run } from '@/lib/game/model';
import { Glyph } from './glyph';
import { FurnitureIcon } from './furniture';
import { Portrait } from './residents';

type Tab = 'people' | 'modules' | 'furniture';

// What can go onto the plan, right under it: the rescued residents, the spare
// modules and the furniture not yet in a flat. A card is dragged onto the plan
// (the data-drag attributes are read by the house editor) or tapped and then
// a cell is tapped.
export function HouseTray({
  run,
  people,
  selected,
  pickedModule,
  pickedFurniture,
  message,
  onChoose,
  onPickModule,
  onPickFurniture,
}: {
  run: Run;
  people: Resident[];
  selected: string;
  pickedModule: number | null;
  pickedFurniture: number | null;
  // The last word of the editor (placed, did not fit): shown by the plan.
  message: string;
  onChoose: (id: string) => void;
  onPickModule: (uid: number | null) => void;
  onPickFurniture: (uid: number | null) => void;
}) {
  const loose = run.furniture.filter((item) => item.resident === null);
  const [chosen, setTab] = useState<Tab>(
    run.backpack.length ? 'modules' : loose.length ? 'furniture' : 'people',
  );
  // The last module or piece went onto the plan: show what is still waiting.
  const tab: Tab =
    chosen === 'modules' && !run.backpack.length && loose.length
      ? 'furniture'
      : chosen === 'furniture' && !loose.length && run.backpack.length
        ? 'modules'
        : chosen;
  const housed = (id: string) => run.residents.some((r) => r.id === id);
  const tabs: [Tab, string, number][] = [
    ['people', 'Мешканці', people.length],
    ['modules', 'Обладнання', run.backpack.length],
    ['furniture', 'Меблі', loose.length],
  ];
  const picked =
    (tab === 'modules' && pickedModule !== null) ||
    (tab === 'furniture' && pickedFurniture !== null);
  return (
    <section className="house-tray" aria-label="Що поставити на план">
      <div className="tray-tabs" role="tablist">
        {tabs.map(([id, name, count]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {name} <b>{count}</b>
          </button>
        ))}
      </div>
      <div className="tray-row" role="tabpanel">
        {tab === 'people' &&
          people.map((r) => (
            <button
              key={r.id}
              data-drag="resident"
              data-drag-id={r.id}
              data-drag-label={r.name}
              className={`tray-card person ${selected === r.id ? 'selected' : ''}`}
              aria-pressed={selected === r.id}
              onClick={() => onChoose(r.id)}
            >
              <Portrait id={r.id} />
              <span>
                <b>{r.name}</b>
                <small>
                  {housed(r.id) ? 'у будинку' : 'потрібна квартира'}
                </small>
              </span>
              {housed(r.id) && <Check size={14} className="aboard-check" />}
            </button>
          ))}
        {tab === 'modules' &&
          run.backpack.map((item) => {
            const def = ITEM_BY_ID[item.id];
            return (
              <button
                key={item.uid}
                data-drag="module"
                data-drag-id={item.uid}
                data-drag-label={def.name}
                className={`tray-card ${pickedModule === item.uid ? 'selected' : ''}`}
                aria-pressed={pickedModule === item.uid}
                onClick={() =>
                  onPickModule(pickedModule === item.uid ? null : item.uid)
                }
              >
                <span style={{ color: FAMILY[def.family].color }}>
                  <Glyph name={def.icon} size={24} />
                </span>
                <b>{def.name}</b>
              </button>
            );
          })}
        {tab === 'furniture' &&
          loose.map((item) => (
            <button
              key={item.uid}
              data-drag="furniture"
              data-drag-id={item.uid}
              data-drag-label={FURNITURE_BY_ID[item.id].name}
              className={`tray-card ${pickedFurniture === item.uid ? 'selected' : ''}`}
              aria-pressed={pickedFurniture === item.uid}
              onClick={() =>
                onPickFurniture(pickedFurniture === item.uid ? null : item.uid)
              }
            >
              <FurnitureIcon id={item.id} size={24} />
              <b>{FURNITURE_BY_ID[item.id].name}</b>
            </button>
          ))}
        {tab === 'modules' && !run.backpack.length && (
          <p className="tray-empty">
            Запасних модулів немає. Нові знаходь у рейді.
          </p>
        )}
        {tab === 'furniture' && !loose.length && (
          <p className="tray-empty">
            Меблів у запасі немає. Вони бувають у скринях, магазинах і подіях.
          </p>
        )}
      </div>
      <p className="tray-hint" aria-live="polite">
        {message ||
          (picked
            ? 'Тепер натисни клітинку всередині квартири на плані.'
            : tab === 'people'
              ? 'Перетягни мешканця на план або натисни, щоб побачити його квартиру.'
              : 'Перетягни на квартиру або натисни, а потім клітинку на плані.')}
      </p>
    </section>
  );
}
