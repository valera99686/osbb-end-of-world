import { apartmentSlot } from '@/lib/game/equipment';
import { ITEM_BY_ID } from '@/lib/game/data';
import {
  Wrench,
  Coffee,
  Sprout,
  BriefcaseMedical,
  Radio,
  Bike,
  X,
  Coins,
} from 'lucide-react';
import {
  FURNITURE,
  FURNITURE_BY_ID,
  furnitureEffect,
  canFurnish,
} from '@/lib/game/furniture';
import { RESIDENT_BY_ID } from '@/lib/game/residents';
import {
  buyFurniture,
  installFurniture,
  removeFurniture,
  type Run,
  type Meta,
} from '@/lib/game/model';

const ICONS = {
  wrench: Wrench,
  coffee: Coffee,
  sprout: Sprout,
  medical: BriefcaseMedical,
  radio: Radio,
  bike: Bike,
};
export function FurnitureIcon({
  id,
  size = 20,
  x,
  y,
}: {
  id: string;
  size?: number;
  x?: number;
  y?: number;
}) {
  const icon = FURNITURE_BY_ID[id].icon as keyof typeof ICONS;
  const Icon = ICONS[icon];
  return <Icon size={size} x={x} y={y} strokeWidth={1.7} aria-hidden="true" />;
}
export function ApartmentFurniture({
  run,
  meta,
  resident,
  picked,
  onPick,
  onChange,
  onMessage,
}: {
  run: Run;
  meta: Meta;
  resident: string | null;
  picked: number | null;
  onPick: (uid: number | null) => void;
  onChange: (run: Run) => void;
  onMessage: (message: string) => void;
}) {
  const inventory = run.furniture.filter((item) => item.resident === null);
  const person = resident ? RESIDENT_BY_ID[resident] : null;
  const aboard = run.residents.some((room) => room.id === resident);
  function install(cell: number) {
    if (picked === null || !resident || !person) return;
    const next = installFurniture(run, meta, picked, resident, cell);
    if (next === run) {
      onMessage('Обери вільний слот у квартирі мешканця.');
      return;
    }
    const item = run.furniture.find((item) => item.uid === picked)!;
    onChange(next);
    onPick(null);
    onMessage(
      `${person.name}: ${FURNITURE_BY_ID[item.id].name}, ${furnitureEffect(item.id, resident).label}.`,
    );
  }
  return (
    <section className="apartment-furniture" aria-label="Меблі для квартир">
      <h3>Меблі для квартир</h3>
      <p>
        Обери предмет, потім вільний слот у квартирі на плані або нижче. Меблі
        рухаються й повертаються разом із кімнатою.
      </p>
      {aboard && person && resident && (
        <div className="apartment-slots">
          <h4>Квартира: {person.name}</h4>
          {person.shape.slice(1).map((_, index) => {
            const cell = index + 1,
              item = run.furniture.find(
                (item) => item.resident === resident && item.cell === cell,
              );
            const moduleId = run.items[apartmentSlot(resident, cell)];
            if (moduleId)
              return (
                <div className="apartment-slot installed" key={cell}>
                  <span>Обладнання: {ITEM_BY_ID[moduleId].name}</span>
                </div>
              );
            return item ? (
              <div className="apartment-slot installed" key={cell}>
                <FurnitureIcon id={item.id} />
                <span>
                  <b>{FURNITURE_BY_ID[item.id].name}</b>
                  <small>{furnitureEffect(item.id, resident).label}</small>
                </span>
                <button
                  aria-label={`Зняти ${FURNITURE_BY_ID[item.id].name}`}
                  onClick={() => {
                    onChange(removeFurniture(run, meta, item.uid));
                    onMessage('Предмет повернувся до запасу меблів.');
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                className="apartment-slot empty"
                key={cell}
                disabled={
                  picked === null ||
                  !canFurnish(
                    run.furniture,
                    run.residents,
                    picked,
                    resident,
                    cell,
                  )
                }
                onClick={() => install(cell)}
              >
                <span>＋</span> Слот {cell}{' '}
                {picked !== null ? '· встановити' : '· порожньо'}
              </button>
            );
          })}
        </div>
      )}
      <div className="furniture-stock-title">
        <b>У запасі · {inventory.length}</b>
        {picked !== null && (
          <button className="text-button" onClick={() => onPick(null)}>
            Скасувати
          </button>
        )}
      </div>
      <div className="furniture-stock">
        {inventory.map((item) => (
          <button
            key={item.uid}
            className={picked === item.uid ? 'selected' : ''}
            aria-pressed={picked === item.uid}
            onClick={() => {
              onPick(picked === item.uid ? null : item.uid);
              onMessage(
                'Натисни вільний слот усередині квартири. Клітинка з портретом зайнята мешканцем.',
              );
            }}
          >
            <FurnitureIcon id={item.id} />
            <span>{FURNITURE_BY_ID[item.id].name}</span>
          </button>
        ))}
      </div>
      {!inventory.length && (
        <p>
          Усі меблі встановлено. Зніми предмет із квартири або придбай новий.
        </p>
      )}
      <details className="furniture-shop">
        <summary>
          Купити меблі{' '}
          <span>
            <Coins size={14} /> {run.coins}
          </span>
        </summary>
        {FURNITURE.map((item) => (
          <div key={item.id} className="furniture-offer">
            <FurnitureIcon id={item.id} />
            <div>
              <b>{item.name}</b>
              <p>
                {furnitureEffect(item.id, null).label}. {item.bonus}.
              </p>
            </div>
            <button
              className="secondary small"
              disabled={run.coins < item.cost || run.furniture.length >= 30}
              onClick={() => {
                const next = buyFurniture(run, item.id);
                if (next === run) return;
                onChange(next);
                onPick(run.nextFurnitureId);
                onMessage(`${item.name} придбано. Обери слот у квартирі.`);
              }}
              aria-label={`Купити ${item.name} за ${item.cost} монет`}
            >
              <Coins size={13} /> {item.cost}
            </button>
          </div>
        ))}
      </details>
      <p>
        На початку рейду є безкоштовні верстак і мінітеплиця. Меблі належать
        поточному рейду; добудова дому зберігається назавжди.
      </p>
    </section>
  );
}
