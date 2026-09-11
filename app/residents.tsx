import { ITEM_BY_ID, FAMILY } from '@/lib/game/data';
import {
  apartmentSlot,
  equipmentTargets,
  canEquipAt,
} from '@/lib/game/equipment';
import { installPacked, moveEquipment } from '@/lib/game/model';
import { Glyph } from './glyph';
import { ApartmentEquipment } from './equipment';
import { useId, useRef, useState, type CSSProperties } from 'react';
import {
  RotateCw,
  Home,
  ArrowDownToLine,
  Move,
  UserPlus,
  Check,
} from 'lucide-react';
import {
  RESIDENT_BY_ID,
  residentCells,
  canHouse,
  residentSpace,
  residentGroups,
  roomGeometry,
  houseSize,
  HOUSE_EXPANSION_COSTS,
  type ResidentRoom,
} from '@/lib/game/residents';
import {
  houseResident,
  reserveResident,
  installFurniture,
  expandHouse,
  type Meta,
  type Run,
} from '@/lib/game/model';
import { ApartmentFurniture, FurnitureIcon } from './furniture';
import {
  FURNITURE_BY_ID,
  furnitureEffect,
  type Furnishing,
} from '@/lib/game/furniture';

export function Portrait({ id }: { id: string }) {
  const r = RESIDENT_BY_ID[id];
  return (
    <span
      className="resident-portrait"
      aria-hidden="true"
      style={{
        backgroundPosition: `${(r.portrait % 3) * 50}% ${Math.floor(r.portrait / 3) * 50}%`,
      }}
    />
  );
}

export function ResidentShape({
  id,
  rotation = 0,
}: {
  id: string;
  rotation?: number;
}) {
  const cells = residentCells(id, rotation),
    geometry = roomGeometry(id, rotation, 10);
  const w = Math.max(...cells.map((c) => c[0])) + 1,
    h = Math.max(...cells.map((c) => c[1])) + 1;
  return (
    <svg
      className="resident-shape"
      width={w * 10 + 2}
      height={h * 10 + 2}
      viewBox={`-1 -1 ${w * 10 + 2} ${h * 10 + 2}`}
      aria-label={`${cells.length} клітинки`}
    >
      <path d={geometry.floor} fill="currentColor" opacity="0.25" />
      <path
        d={geometry.walls}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HousePlan({
  rooms,
  level = 0,
  furniture = [],
  items = [],
  selected,
  target,
  valid,
  compact = false,
}: {
  rooms: ResidentRoom[];
  level?: number;
  furniture?: Furnishing[];
  items?: (string | null)[];
  selected?: string;
  target?: ResidentRoom | null;
  valid?: boolean;
  compact?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const size = houseSize(level);
  return (
    <svg
      className="house-plan"
      viewBox={`0 0 ${size.width * 100} ${size.height * 100}`}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={`${uid}-grid`}
          width="100"
          height="100"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M100 0H0V100"
            fill="none"
            stroke="#40545b"
            strokeWidth="1"
            opacity="0.3"
          />
          <path
            d="M46 50h8M50 46v8"
            stroke="#647a80"
            strokeWidth="1.2"
            opacity="0.3"
          />
        </pattern>
        {rooms.map((room) => (
          <linearGradient id={`${uid}-${room.id}`} key={room.id} x2="1" y2="1">
            <stop
              stopColor={RESIDENT_BY_ID[room.id].color}
              stopOpacity="0.21"
            />
            <stop
              offset="1"
              stopColor={RESIDENT_BY_ID[room.id].color}
              stopOpacity="0.07"
            />
          </linearGradient>
        ))}
      </defs>
      <rect
        width={size.width * 100}
        height={size.height * 100}
        fill="#0d1a20"
        rx="3"
      />
      <rect
        width={size.width * 100}
        height={size.height * 100}
        fill={`url(#${uid}-grid)`}
      />
      {rooms.map((room) => {
        const person = RESIDENT_BY_ID[room.id],
          cells = residentCells(room.id, room.rotation);
        const [x, y] = cells[0],
          geometry = roomGeometry(room.id, room.rotation);
        const chosen = room.id === selected;
        return (
          <g
            key={room.id}
            transform={`translate(${room.x * 100} ${room.y * 100})`}
            opacity={target?.id === room.id ? 0.35 : 1}
          >
            <path d={geometry.floor} fill="#14262b" />
            <path d={geometry.floor} fill={`url(#${uid}-${room.id})`} />
            <path
              d={geometry.walls}
              fill="none"
              stroke={chosen ? '#edc080' : '#789087'}
              strokeWidth={chosen ? 3.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {cells.slice(1).map(([cx, cy], index) => {
              const item = furniture.find(
                (item) => item.resident === room.id && item.cell === index + 1,
              );
              const moduleId = items[apartmentSlot(room.id, index + 1)];
              const module = moduleId ? ITEM_BY_ID[moduleId] : null;
              return (
                <g
                  key={`${cx}:${cy}`}
                  opacity={item || module ? 1 : 0.55}
                  stroke={
                    module
                      ? FAMILY[module.family].color
                      : item
                        ? '#efd4a1'
                        : person.color
                  }
                  color={
                    module
                      ? FAMILY[module.family].color
                      : item
                        ? '#efd4a1'
                        : person.color
                  }
                  fill="none"
                >
                  {module ? (
                    <Glyph
                      name={module.icon}
                      size={42}
                      x={cx * 100 + 29}
                      y={cy * 100 + 25}
                    />
                  ) : item ? (
                    <FurnitureIcon
                      id={item.id}
                      size={42}
                      x={cx * 100 + 29}
                      y={cy * 100 + 25}
                    />
                  ) : (
                    <>
                      <rect
                        x={cx * 100 + 26}
                        y={cy * 100 + 24}
                        width="48"
                        height="48"
                        rx="5"
                        strokeDasharray="4 4"
                      />
                      <path
                        d={`M${cx * 100 + 41} ${cy * 100 + 48}h18M${cx * 100 + 50} ${cy * 100 + 39}v18`}
                      />
                    </>
                  )}
                  {!compact && (
                    <text
                      x={cx * 100 + 50}
                      y={cy * 100 + 88}
                      textAnchor="middle"
                      stroke="none"
                      fill={
                        module
                          ? FAMILY[module.family].color
                          : item
                            ? '#efd4a1'
                            : person.color
                      }
                      fontSize="11"
                    >
                      {module
                        ? module.name
                        : item
                          ? FURNITURE_BY_ID[item.id].name
                          : 'ОБЛАДНАННЯ'}
                    </text>
                  )}
                </g>
              );
            })}
            <svg
              x={x * 100 + 18}
              y={y * 100 + 7}
              width="64"
              height="64"
              viewBox={`${(person.portrait % 3) * 418} ${Math.floor(person.portrait / 3) * 418} 418 418`}
              overflow="hidden"
            >
              <image href="/art/residents-v1.png" width="1254" height="1254" />
            </svg>
            {!compact && (
              <text
                x={x * 100 + 50}
                y={y * 100 + 89}
                textAnchor="middle"
                fill="#edf0e3"
                fontSize="16"
                fontWeight="650"
              >
                {person.name}
              </text>
            )}
          </g>
        );
      })}
      {target && (
        <g transform={`translate(${target.x * 100} ${target.y * 100})`}>
          <path
            d={roomGeometry(target.id, target.rotation).floor}
            fill={valid ? '#87c6ad' : '#ef837d'}
            opacity="0.2"
          />
          <path
            d={roomGeometry(target.id, target.rotation).walls}
            fill="none"
            stroke={valid ? '#a2dfbd' : '#ff9c93'}
            strokeWidth="3"
            strokeDasharray="8 5"
          />
        </g>
      )}
      <rect
        width={size.width * 100}
        height={size.height * 100}
        rx="3"
        fill="none"
        stroke="#6c8384"
        strokeWidth="3"
      />
    </svg>
  );
}

export function HousePreview({
  run,
  level = 0,
  onOpen,
}: {
  run: Run;
  level?: number;
  onOpen: () => void;
}) {
  return (
    <button
      className="house-preview"
      onClick={onOpen}
      aria-label={`План будинку: ${run.residents.length} мешканців. Відкрити розселення`}
    >
      <HousePlan
        rooms={run.residents}
        level={level}
        furniture={run.furniture}
        items={run.items}
        compact
      />
    </button>
  );
}

export function EquipmentPlacement({
  run,
  level,
  itemId,
  onInstall,
}: {
  run: Run;
  level: number;
  itemId: string;
  onInstall: (slot: number) => void;
}) {
  const size = houseSize(level),
    targets = equipmentTargets(run);
  return (
    <div className="equipment-picker">
      <p>
        <b>{ITEM_BY_ID[itemId].name}</b> → натисни місце всередині квартири
      </p>
      <div
        className="housing-canvas"
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
      >
        <HousePlan
          rooms={run.residents}
          level={level}
          furniture={run.furniture}
          items={run.items}
        />
        <div
          className="housing-hit-grid equipment-target-grid"
          style={{
            gridTemplateColumns: `repeat(${size.width}, minmax(0,1fr))`,
            gridTemplateRows: `repeat(${size.height}, minmax(0,1fr))`,
          }}
        >
          {targets.map((target) => (
            <button
              key={target.slot}
              type="button"
              disabled={!canEquipAt(run, target.slot)}
              style={{ gridColumn: target.x + 1, gridRow: target.y + 1 }}
              className={
                run.items[target.slot]
                  ? 'equipment-swap-target'
                  : 'equipment-free-target'
              }
              aria-label={`Встановити ${ITEM_BY_ID[itemId].name}: квартира ${RESIDENT_BY_ID[target.resident].name}, місце ${target.cell}${run.items[target.slot] ? '. Попередній модуль повернеться на склад' : ''}`}
              title={`Квартира: ${RESIDENT_BY_ID[target.resident].name}`}
              onClick={() => onInstall(target.slot)}
            />
          ))}
        </div>
      </div>
      <p className="housing-hint">
        Зелений пунктир — вільне місце. Золотий — заміна зі збереженням
        попереднього модуля на складі. Меблі потрібно спочатку зняти.
      </p>
    </div>
  );
}

export function Residents({
  run,
  meta,
  onChange,
  onMetaChange,
}: {
  run: Run;
  meta: Meta;
  onChange: (r: Run) => void;
  onMetaChange: (meta: Meta) => void;
}) {
  const [selected, setSelected] = useState(run.character);
  const [rotation, setRotation] = useState(
    run.residents.find((r) => r.id === run.character)?.rotation ?? 0,
  );
  const [tab, setTab] = useState<'aboard' | 'reserve'>('aboard');
  const [placing, setPlacing] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState('');
  const [pickedFurniture, setPickedFurniture] = useState<number | null>(null);
  const [pickedModule, setPickedModule] = useState<number | null>(null);
  const [movingModule, setMovingModule] = useState<number | null>(null);
  const [moduleSlot, setModuleSlot] = useState<number | null>(null);
  const size = houseSize(meta.houseLevel),
    nextSize = houseSize(meta.houseLevel + 1),
    expansionCost = HOUSE_EXPANSION_COSTS[meta.houseLevel];
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    id: string;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    rotation: number;
    moved: boolean;
  } | null>(null);
  const suppress = useRef(false);
  const groups = residentGroups(meta.residents, run.residents);
  const person = RESIDENT_BY_ID[selected],
    room = run.residents.find((r) => r.id === selected);
  const occupied = new Map(
    run.residents.flatMap((r) =>
      residentCells(r.id, r.rotation).map(
        ([x, y]) => [`${x + r.x}:${y + r.y}`, r] as const,
      ),
    ),
  );
  const target = placing && ghost ? { id: selected, ...ghost, rotation } : null;
  const valid = !!target && canHouse(run.residents, target, meta.houseLevel);

  function stopDrag() {
    const active = drag.current;
    drag.current = null;
    if (active && grid.current?.hasPointerCapture(active.pointerId)) {
      grid.current.releasePointerCapture(active.pointerId);
    }
  }
  function choose(id: string) {
    stopDrag();
    setPickedFurniture(null);
    setPickedModule(null);
    setMovingModule(null);
    setModuleSlot(null);
    const current = run.residents.find((r) => r.id === id);
    setSelected(id);
    setRotation(current?.rotation ?? 0);
    setGhost(null);
    setPlacing(false);
    setMessage('');
    setTab(current ? 'aboard' : 'reserve');
  }
  function switchTab(next: 'aboard' | 'reserve') {
    stopDrag();
    setPickedFurniture(null);
    setPickedModule(null);
    setMovingModule(null);
    setModuleSlot(null);
    const first = groups[next][0];
    if (first) choose(first.id);
    else {
      setPlacing(false);
      setGhost(null);
      setMessage('');
    }
    setTab(next);
  }
  function place(nextRoom: ResidentRoom) {
    stopDrag();
    const next = houseResident(run, meta, nextRoom);
    if (next === run) {
      setMessage('Кімната не вміщується. Поверни її або обери інше місце.');
      return;
    }
    onChange(next);
    setSelected(nextRoom.id);
    setRotation(nextRoom.rotation);
    setGhost(null);
    setPlacing(false);
    setTab('aboard');
    setMessage(
      `${RESIDENT_BY_ID[nextRoom.id].name} — у будинку. Бонус активний.`,
    );
  }
  function beginPlacement() {
    stopDrag();
    setPickedFurniture(null);
    setPickedModule(null);
    setMovingModule(null);
    setModuleSlot(null);
    const candidate =
      room ?? residentSpace(run.residents, selected, meta.houseLevel);
    setRotation(candidate?.rotation ?? 0);
    setGhost(candidate ? { x: candidate.x, y: candidate.y } : { x: 0, y: 0 });
    setPlacing(true);
    setMessage(
      'Обери місце на плані й підтвердь розміщення. Пунктир показує нову кімнату.',
    );
  }
  function position(x: number, y: number) {
    const bounds = grid.current!.getBoundingClientRect();
    return {
      x: Math.floor(((x - bounds.left) / bounds.width) * size.width),
      y: Math.floor(((y - bounds.top) / bounds.height) * size.height),
    };
  }
  function cancelPlacement() {
    stopDrag();
    setGhost(null);
    setPlacing(false);
    setMessage('');
  }

  return (
    <div className="resident-editor">
      <div className="housing-summary">
        <span>
          <Home size={16} /> На борту <b>{groups.aboard.length}</b>
        </span>
        <span>
          Вільно <b>{size.width * size.height - occupied.size}</b> /{' '}
          {size.width * size.height} клітинок
        </span>
      </div>
      <div className="housing-layout">
        <div className="housing-workspace">
          <div className="house-blueprint">
            <div className="plan-heading">
              <span>ПЛАН ЖИТЛОВОГО ПОВЕРХУ</span>
              <span>
                {size.width} × {size.height}
              </span>
            </div>
            <div
              className="housing-canvas"
              style={{ aspectRatio: `${size.width} / ${size.height}` }}
            >
              <HousePlan
                rooms={run.residents}
                level={meta.houseLevel}
                furniture={run.furniture}
                items={run.items}
                selected={selected}
                target={target}
                valid={valid}
              />
              <div
                className={`housing-hit-grid ${placing ? 'is-placing' : ''}`}
                ref={grid}
                style={{
                  gridTemplateColumns: `repeat(${size.width}, minmax(0,1fr))`,
                  gridTemplateRows: `repeat(${size.height}, minmax(0,1fr))`,
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.pointerId !== e.pointerId) return;
                  if (
                    Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5
                  ) {
                    d.moved = true;
                    grid.current?.setPointerCapture(e.pointerId);
                  }
                  if (d.moved) {
                    const p = position(e.clientX, e.clientY);
                    setPlacing(true);
                    setGhost({ x: p.x - d.dx, y: p.y - d.dy });
                  }
                }}
                onPointerUp={(e) => {
                  const d = drag.current;
                  if (!d || d.pointerId !== e.pointerId) return;
                  if (d.moved) {
                    const p = position(e.clientX, e.clientY);
                    place({
                      id: d.id,
                      x: p.x - d.dx,
                      y: p.y - d.dy,
                      rotation: d.rotation,
                    });
                    suppress.current = true;
                  }
                  drag.current = null;
                }}
                onPointerCancel={(e) => {
                  if (drag.current?.pointerId !== e.pointerId) return;
                  drag.current = null;
                  cancelPlacement();
                }}
                onLostPointerCapture={(e) => {
                  if (drag.current?.pointerId === e.pointerId) {
                    drag.current = null;
                    cancelPlacement();
                  }
                }}
              >
                {Array.from({ length: size.width * size.height }, (_, i) => {
                  const x = i % size.width,
                    y = Math.floor(i / size.width),
                    current = occupied.get(`${x}:${y}`);
                  const currentCell = current
                    ? residentCells(current.id, current.rotation).findIndex(
                        ([cx, cy]) =>
                          cx + current.x === x && cy + current.y === y,
                      )
                    : -1;
                  const currentSlot = current
                    ? apartmentSlot(current.id, currentCell)
                    : -1;
                  const moduleMode =
                    pickedModule !== null || movingModule !== null;
                  const gearTarget = moduleMode && canEquipAt(run, currentSlot);
                  return (
                    <button
                      type="button"
                      key={i}
                      className={
                        gearTarget
                          ? run.items[currentSlot]
                            ? 'equipment-swap-target'
                            : 'equipment-free-target'
                          : current
                            ? 'has-room'
                            : ''
                      }
                      aria-label={`Клітинка ${x + 1}, ${y + 1}: ${current ? 'квартира ' + RESIDENT_BY_ID[current.id].name : 'поза квартирою'}${run.items[currentSlot] ? '. ' + ITEM_BY_ID[run.items[currentSlot]!].name : currentCell > 0 ? '. Місце для обладнання' : current ? '. Портрет мешканця' : ''}${placing ? '. Обрати місце для кімнати' : ''}`}
                      onPointerDown={(e) => {
                        if (drag.current || e.button !== 0) return;
                        suppress.current = false;
                        if (
                          !current ||
                          placing ||
                          pickedFurniture !== null ||
                          moduleMode ||
                          currentCell !== 0
                        )
                          return;
                        choose(current.id);
                        drag.current = {
                          pointerId: e.pointerId,
                          id: current.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          dx: x - current.x,
                          dy: y - current.y,
                          rotation: current.rotation,
                          moved: false,
                        };
                      }}
                      onClick={() => {
                        if (suppress.current) {
                          suppress.current = false;
                          return;
                        }
                        if (moduleMode) {
                          const next =
                            pickedModule !== null
                              ? installPacked(
                                  run,
                                  meta,
                                  pickedModule,
                                  currentSlot,
                                )
                              : moveEquipment(
                                  run,
                                  meta,
                                  movingModule!,
                                  currentSlot,
                                );
                          if (next === run) {
                            setMessage(
                              'Обери місце всередині квартири без меблів. Портрет мешканця зайнятий.',
                            );
                            return;
                          }
                          onChange(next);
                          choose(current!.id);
                          setModuleSlot(currentSlot);
                          setMessage(
                            'Обладнання встановлено у квартирі. Бонус активний.',
                          );
                          return;
                        }
                        if (pickedFurniture !== null) {
                          const cell = current
                            ? residentCells(
                                current.id,
                                current.rotation,
                              ).findIndex(
                                ([cx, cy]) =>
                                  cx + current.x === x && cy + current.y === y,
                              )
                            : -1;
                          const next = current
                            ? installFurniture(
                                run,
                                meta,
                                pickedFurniture,
                                current.id,
                                cell,
                              )
                            : run;
                          if (next === run) {
                            setMessage(
                              'Меблі ставляться у вільний слот усередині квартири. Портрет і площа поза квартирою не підходять.',
                            );
                            return;
                          }
                          const item = run.furniture.find(
                            (item) => item.uid === pickedFurniture,
                          )!;
                          onChange(next);
                          choose(current!.id);
                          setMessage(
                            `${RESIDENT_BY_ID[current!.id].name}: ${furnitureEffect(item.id, current!.id).label}.`,
                          );
                          return;
                        }
                        if (placing) setGhost({ x, y });
                        else if (current) {
                          choose(current.id);
                          setModuleSlot(currentSlot >= 0 ? currentSlot : null);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="plan-legend">
              <span>
                <i /> Заселена кімната
              </span>
              <span>Спільна стіна → бонус сусідства</span>
            </div>
          </div>
          <div className="house-expansion">
            <div>
              <b>Розширення дому</b>
              <p>
                {expansionCost === undefined
                  ? 'Максимальна площа — 48 клітинок.'
                  : `${size.width}×${size.height} → ${nextSize.width}×${nextSize.height}. Назавжди, для всіх наступних рейдів.`}
              </p>
              <small>
                Ядер у запасі: {meta.cores}. Їх отримуєш після завершення рейду.
              </small>
            </div>
            {expansionCost !== undefined && (
              <button
                className="secondary small"
                disabled={meta.cores < expansionCost}
                onClick={() => {
                  const next = expandHouse(meta, run);
                  if (next === meta) return;
                  stopDrag();
                  cancelPlacement();
                  setPickedFurniture(null);
                  setPickedModule(null);
                  setMovingModule(null);
                  setModuleSlot(null);
                  onMetaChange(next);
                  setMessage(
                    `Дім розширено до ${nextSize.width}×${nextSize.height}. Кімнати залишилися на своїх місцях.`,
                  );
                }}
              >
                Добудувати · {expansionCost} ядер
              </button>
            )}
          </div>
          <p className="housing-hint">
            Натисни обладнання у квартирі, щоб керувати ним. Для переміщення
            квартири перетягни портрет мешканця або натисни «Перемістити
            кімнату».
          </p>
          <ApartmentEquipment
            run={run}
            meta={meta}
            selectedSlot={moduleSlot}
            picked={pickedModule}
            moving={movingModule}
            onChange={onChange}
            onMetaChange={onMetaChange}
            onMessage={setMessage}
            onPick={(uid) => {
              cancelPlacement();
              setPickedFurniture(null);
              setMovingModule(null);
              setPickedModule(uid);
            }}
            onMove={(slot) => {
              cancelPlacement();
              setPickedFurniture(null);
              setPickedModule(null);
              setMovingModule(slot);
            }}
          />
          <output className="housing-message" aria-live="polite">
            {message}
          </output>
        </div>
        <div className="housing-sidebar">
          <fieldset
            className="housing-tabs"
            aria-label="Де перебувають мешканці"
          >
            <button
              className={tab === 'aboard' ? 'active' : ''}
              aria-pressed={tab === 'aboard'}
              onClick={() => switchTab('aboard')}
            >
              У будинку <b>{groups.aboard.length}</b>
            </button>
            <button
              className={tab === 'reserve' ? 'active' : ''}
              aria-pressed={tab === 'reserve'}
              onClick={() => switchTab('reserve')}
            >
              Притулок <b>{groups.reserve.length}</b>
            </button>
          </fieldset>
          <p className="roster-explainer">
            {tab === 'aboard'
              ? 'Ці мешканці їдуть із тобою та дають бонуси.'
              : 'Притулок — запас врятованих мешканців. Заселяй їх, коли з’явиться місце; поки вони тут, їхні бонуси в рейді не діють.'}
          </p>
          <div className="resident-roster">
            {groups[tab].map((resident) => (
              <button
                key={resident.id}
                className={`resident-card ${selected === resident.id ? 'active' : ''}`}
                onClick={() => choose(resident.id)}
                aria-pressed={selected === resident.id}
              >
                <Portrait id={resident.id} />
                <span>
                  <b>{resident.name}</b>
                  <small>
                    {resident.id === run.character
                      ? 'Голова ОСББ · на борту'
                      : resident.job}
                  </small>
                </span>
                {tab === 'aboard' ? (
                  <Check size={16} className="aboard-check" />
                ) : (
                  <ResidentShape id={resident.id} />
                )}
              </button>
            ))}
            {!groups[tab].length && (
              <p className="roster-empty">
                Усі врятовані мешканці зараз у будинку.
              </p>
            )}
          </div>
          {groups[tab].some((r) => r.id === selected) && (
            <div
              className="resident-selection"
              style={{ '--shape-color': person.color } as CSSProperties}
            >
              <div className="resident-details">
                <Portrait id={selected} />
                <div>
                  <small>{person.job}</small>
                  <h3>{person.name}</h3>
                </div>
                <ResidentShape id={selected} rotation={rotation} />
              </div>
              <span className={`resident-presence ${room ? 'aboard' : ''}`}>
                {room
                  ? 'У будинку · бонус активний'
                  : 'У притулку · бонус не діє'}
              </span>
              <p className="resident-effect">{person.effect}</p>
              <div className="housing-actions">
                {!placing ? (
                  <button className="primary small" onClick={beginPlacement}>
                    {room ? <Move size={16} /> : <UserPlus size={16} />}
                    {room ? 'Перемістити кімнату' : 'Заселити в будинок'}
                  </button>
                ) : (
                  <>
                    <button
                      className="secondary small"
                      onClick={() => {
                        stopDrag();
                        setRotation((rotation + 1) % 4);
                      }}
                    >
                      <RotateCw size={16} /> Повернути
                    </button>
                    <button
                      className="primary small"
                      disabled={!valid}
                      onClick={() => target && place(target)}
                    >
                      <Check size={16} /> Підтвердити
                    </button>
                    <button className="text-button" onClick={cancelPlacement}>
                      Скасувати
                    </button>
                  </>
                )}
                {room && selected !== run.character && !placing && (
                  <button
                    className="text-button"
                    onClick={() => {
                      const next = reserveResident(run, meta, selected);
                      if (next === run) {
                        setMessage(
                          'Склад переповнений. Звільни місце, щоб зберегти обладнання цієї квартири.',
                        );
                        return;
                      }
                      onChange(next);
                      choose(run.character);
                      setMessage(
                        `${person.name} залишиться у притулку. Бонус у рейді вимкнено.`,
                      );
                    }}
                  >
                    <ArrowDownToLine size={15} /> Залишити у притулку
                  </button>
                )}
              </div>
            </div>
          )}
          <ApartmentFurniture
            run={run}
            meta={meta}
            resident={
              groups[tab].some((person) => person.id === selected)
                ? selected
                : null
            }
            picked={pickedFurniture}
            onChange={onChange}
            onMessage={setMessage}
            onPick={(uid) => {
              stopDrag();
              cancelPlacement();
              setPickedModule(null);
              setMovingModule(null);
              setPickedFurniture(uid);
            }}
          />
          {groups.missing.length > 0 && (
            <details className="missing-residents">
              <summary>Ще не врятовано · {groups.missing.length}</summary>
              <p>Цих людей немає ані в будинку, ані у притулку.</p>
              {groups.missing.map((resident) => (
                <div key={resident.id}>
                  <b>{resident.name}</b>
                  <span>
                    {['marta', 'danilo', 'solomia'].includes(resident.id)
                      ? 'Знайди під час події'
                      : 'Зустрінь у наступних розділах'}
                  </span>
                </div>
              ))}
            </details>
          )}
        </div>
      </div>
      <p className="housing-footnote">
        Голова ОСББ залишається на борту. Його стартовий талант діє додатково до
        бонусу кімнати.
      </p>
    </div>
  );
}
