import { ITEM_BY_ID, FAMILY } from '@/lib/game/data';
import {
  apartmentEffects,
  apartmentWalls,
  linkedIds,
  planRoomMove,
  roomsTouch,
  type RoomLink,
} from '@/lib/game/apartments';
import {
  joinApartments,
  splitApartments,
  setApartmentMode,
} from '@/lib/game/model';
import {
  apartmentSlot,
  equipmentTargets,
  canEquipAt,
} from '@/lib/game/equipment';
import { installPacked, moveEquipment } from '@/lib/game/model';
import { Glyph } from './glyph';
import { ApartmentEquipment } from './equipment';
import { useId, useRef, useState, type CSSProperties } from 'react';
import { RotateCw, Home, Move, UserPlus, Check } from 'lucide-react';
import {
  RESIDENT_BY_ID,
  residentCells,
  residentBonuses,
  residentSpace,
  residentGroups,
  roomGeometry,
  houseSize,
  HOUSE_EXPANSION_COSTS,
  type ResidentRoom,
} from '@/lib/game/residents';
import {
  houseResident,
  installFurniture,
  expandRunHouse,
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
  links = [],
  level = 0,
  furniture = [],
  items = [],
  selected,
  target,
  targets,
  valid,
  compact = false,
}: {
  rooms: ResidentRoom[];
  links?: RoomLink[];
  level?: number;
  furniture?: Furnishing[];
  items?: (string | null)[];
  selected?: string;
  target?: ResidentRoom | null;
  targets?: ResidentRoom[];
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
        const chosen =
          room.id === selected ||
          links.some(
            (pair) => pair.includes(room.id) && pair.includes(selected ?? ''),
          );
        return (
          <g
            key={room.id}
            transform={`translate(${room.x * 100} ${room.y * 100})`}
            opacity={
              targets?.some((r) => r.id === room.id) || target?.id === room.id
                ? 0.35
                : 1
            }
          >
            <path d={geometry.floor} fill="#14262b" />
            <path d={geometry.floor} fill={`url(#${uid}-${room.id})`} />
            <path
              d={apartmentWalls(room, rooms, links)}
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
      {(targets ?? (target ? [target] : [])).map((target) => (
        <g
          key={target.id}
          transform={`translate(${target.x * 100} ${target.y * 100})`}
        >
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
      ))}
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
        links={run.roomLinks}
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
          links={run.roomLinks}
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
              aria-label={`Встановити ${ITEM_BY_ID[itemId].name}: квартира ${RESIDENT_BY_ID[target.resident].name}, місце ${target.cell}${run.items[target.slot] ? '. Попередній модуль буде знято та збережено' : ''}`}
              title={`Квартира: ${RESIDENT_BY_ID[target.resident].name}`}
              onClick={() => onInstall(target.slot)}
            />
          ))}
        </div>
      </div>
      <p className="housing-hint">
        Зелений пунктир — вільне місце. Золотий — заміна зі збереженням
        попереднього модуля для іншої квартири. Меблі потрібно спочатку зняти.
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
  const [placing, setPlacing] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState('');
  const [pickedFurniture, setPickedFurniture] = useState<number | null>(null);
  const [pickedModule, setPickedModule] = useState<number | null>(null);
  const [movingModule, setMovingModule] = useState<number | null>(null);
  const [moduleSlot, setModuleSlot] = useState<number | null>(null);
  const size = houseSize(run.houseLevel),
    nextSize = houseSize(run.houseLevel + 1),
    expansionCost = HOUSE_EXPANSION_COSTS[run.houseLevel];
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
  const groups = residentGroups(run.rescued, run.residents);
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
  const planned = target ? planRoomMove(run, target) : null;
  const valid = !!planned;
  const selectedGroup = linkedIds(run, selected);
  const ghostRooms = target
    ? planRoomMove(run, target, false)?.filter((r) =>
        selectedGroup.includes(r.id),
      )
    : undefined;
  function planningEffects(state: Run) {
    const result = apartmentEffects(state);
    result.effects.unshift(
      ...residentBonuses(state.residents).synergies.map((text) => ({
        id: `legacy:${text}`,
        title: 'Сусідство',
        text,
        residents: [],
      })),
    );
    return result;
  }
  const currentEffects = planningEffects(run);
  const futureEffects = planned
    ? planningEffects({ ...run, residents: planned })
    : null;
  const gained =
    futureEffects?.effects.filter(
      (e) =>
        !currentEffects.effects.some(
          (old) => old.id === e.id && old.text === e.text,
        ),
    ) ?? [];
  const lost = futureEffects
    ? currentEffects.effects.filter(
        (e) =>
          !futureEffects.effects.some(
            (next) => next.id === e.id && next.text === e.text,
          ),
      )
    : [];
  const neighbors = room
    ? run.residents.filter((r) => r.id !== selected && roomsTouch(room, r))
    : [];

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
    setMessage(
      selectedGroup.length > 1
        ? 'Об’єднану секцію переміщено разом із меблями й обладнанням.'
        : `${RESIDENT_BY_ID[nextRoom.id].name} — у будинку. Бонус активний.`,
    );
  }
  function beginPlacement() {
    stopDrag();
    setPickedFurniture(null);
    setPickedModule(null);
    setMovingModule(null);
    setModuleSlot(null);
    const candidate =
      room ?? residentSpace(run.residents, selected, run.houseLevel);
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
                links={run.roomLinks}
                level={run.houseLevel}
                furniture={run.furniture}
                items={run.items}
                selected={selected}
                target={target}
                targets={ghostRooms}
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
          <section className="apartment-effects" aria-label="Вплив планування">
            <h3>{placing ? 'Після розміщення' : 'Як працює твій будинок'}</h3>
            {placing && !valid ? (
              <p className="apartment-negative">
                Фігура не вміщується. Об’єднані квартири потребують місця для
                обох мешканців.
              </p>
            ) : placing ? (
              <div aria-live="polite">
                {!gained.length && !lost.length && (
                  <p>Бонуси й недоліки залишаться без змін.</p>
                )}
                {gained.map((e) => (
                  <p
                    key={e.id}
                    className={
                      e.negative ? 'apartment-negative' : 'apartment-positive'
                    }
                  >
                    <b>З’явиться: {e.title}.</b> {e.text}
                  </p>
                ))}
                {lost.map((e) => (
                  <p
                    key={e.id}
                    className={
                      e.negative ? 'apartment-positive' : 'apartment-negative'
                    }
                  >
                    <b>Зникне: {e.title}.</b> {e.text}
                  </p>
                ))}
              </div>
            ) : (
              <>
                {!currentEffects.effects.length && (
                  <p>
                    Посели мешканців через спільну стіну. Кухня підсилює
                    сусідів; майстерня допомагає вартовому, але заважає медику.
                  </p>
                )}
                {currentEffects.effects.map((e) => (
                  <p
                    key={e.id}
                    className={
                      e.negative ? 'apartment-negative' : 'apartment-positive'
                    }
                  >
                    <b>{e.title}.</b> {e.text}
                  </p>
                ))}
              </>
            )}
            <details className="apartment-recipes">
              <summary>
                Сусідства й відкриття · локація {run.chapter + 1}/3
              </summary>
              <p>
                <b>Від початку.</b> Ніна: +6% темпу за кожну сусідню квартиру.
                Петрович + Микола: +4 шкоди. Петрович + Марта: −0,3 лікування/с
                через шум.
              </p>
              <p>
                <b>{run.chapter >= 1 ? 'Відкрито' : 'З другої локації'}.</b>{' '}
                Марта + Флора: аптечка на 6 міцності кожні 12 с. Петрович +
                Микола: бойовий дрон.
              </p>
              <p>
                <b>{run.chapter >= 2 ? 'Відкрито' : 'З третьої локації'}.</b>{' '}
                Квартиру Іскри можна зробити лабораторією, Соломії — часовою
                аномалією. Увімкни режим у картці мешканця; потрібна хоча б одна
                сусідня квартира.
              </p>
              <p>
                <b>Знесення стін.</b> Об’єднай дві сусідні квартири: захисна
                хвиля кожні 20 с, але −6 швидкості. Спільна аптека лікує на 8
                замість 6. Кожна квартира входить лише в одну пару.
              </p>
            </details>
          </section>
          <div className="house-expansion">
            <div>
              <b>Розширення дому</b>
              <p>
                {expansionCost === undefined
                  ? `Досягнуто максимальної площі: ${size.width * size.height} клітинок.`
                  : `${size.width}×${size.height} → ${nextSize.width}×${nextSize.height}. До кінця цієї експедиції.`}
              </p>
              <small>
                Монет у запасі: {Math.floor(run.coins)}. Добудова відкриє місце
                для нових квартир.
              </small>
            </div>
            {expansionCost !== undefined && (
              <button
                className="secondary small"
                disabled={run.coins < expansionCost}
                onClick={() => {
                  const next = expandRunHouse(run);
                  if (next === run) return;
                  stopDrag();
                  cancelPlacement();
                  setPickedFurniture(null);
                  setPickedModule(null);
                  setMovingModule(null);
                  setModuleSlot(null);
                  onChange(next);
                  setMessage(
                    `Дім розширено до ${nextSize.width}×${nextSize.height}. Кімнати залишилися на своїх місцях.`,
                  );
                }}
              >
                Добудувати · {expansionCost} монет
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
          <h3>Урятовані в цій експедиції · {run.rescued.length}</h3>
          <p className="roster-explainer">
            Бонуси діють у заселених квартирах. Урятовані без кімнати чекають на
            перепланування або добудову.
          </p>
          <div className="resident-roster">
            {[...groups.aboard, ...groups.reserve].map((resident) => (
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
                      : resident.job +
                        (run.residents.some((r) => r.id === resident.id)
                          ? ' · заселено'
                          : ' · потрібна квартира')}
                  </small>
                </span>
                {run.residents.some((r) => r.id === resident.id) ? (
                  <Check size={16} className="aboard-check" />
                ) : (
                  <ResidentShape id={resident.id} />
                )}
              </button>
            ))}
            {![...groups.aboard, ...groups.reserve].length && (
              <p className="roster-empty">
                Усі врятовані мешканці зараз у будинку.
              </p>
            )}
          </div>
          {[...groups.aboard, ...groups.reserve].some(
            (r) => r.id === selected,
          ) && (
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
                  : 'Урятовано · потрібна квартира'}
              </span>
              <p className="resident-effect">{person.effect}</p>
              {room && !placing && (
                <div className="apartment-renovation">
                  <h4>Спільна квартира</h4>
                  {selectedGroup.length > 1 ? (
                    <>
                      <p>
                        Об’єднано з{' '}
                        {
                          RESIDENT_BY_ID[
                            selectedGroup.find((id) => id !== selected)!
                          ].name
                        }
                        . Переміщення та поворот — разом.
                      </p>
                      <button
                        className="secondary small"
                        onClick={() => {
                          onChange(splitApartments(run, meta, selected));
                          setMessage(
                            'Стіну відновлено. Квартири знову можна переміщувати окремо.',
                          );
                        }}
                      >
                        Відновити стіну · безкоштовно
                      </button>
                    </>
                  ) : (
                    <>
                      <p>
                        Захисна хвиля: 24 шкоди кожні 20 с у радіусі 220. Ціна:
                        −6 швидкості та одна велика фігура.
                      </p>
                      {!neighbors.length && (
                        <p>
                          Спочатку розмісти іншу квартиру через спільну стіну.
                        </p>
                      )}
                      {neighbors.map((neighbor) => (
                        <button
                          key={neighbor.id}
                          className="secondary small"
                          disabled={linkedIds(run, neighbor.id).length > 1}
                          onClick={() => {
                            const next = joinApartments(
                              run,
                              meta,
                              selected,
                              neighbor.id,
                            );
                            onChange(next);
                            setMessage(
                              'Стіну знесено. Дві квартири тепер рухаються й обертаються разом.',
                            );
                          }}
                        >
                          Знести стіну: {RESIDENT_BY_ID[neighbor.id].name}
                          {linkedIds(run, neighbor.id).length > 1
                            ? ' · вже об’єднано'
                            : ''}
                        </button>
                      ))}
                    </>
                  )}
                  {(selected === 'spark' || selected === 'solomia') && (
                    <div className="apartment-mode">
                      <h4>
                        {selected === 'spark'
                          ? 'Експериментальна лабораторія'
                          : 'Часова аномалія'}
                      </h4>
                      <p>
                        {selected === 'spark'
                          ? 'Зі сусідом: +6 шкоди та ланцюговий удар. Кожні 10 с −3 міцності; Петрович поруч усуває витік.'
                          : 'Зі сусідом: повтор кожного четвертого залпу, але −15% темпу стрільби.'}
                      </p>
                      <button
                        className="secondary small"
                        disabled={run.chapter < 2}
                        aria-pressed={!!run.roomModes?.[selected]}
                        onClick={() => {
                          onChange(
                            setApartmentMode(
                              run,
                              meta,
                              selected,
                              run.roomModes?.[selected]
                                ? 'normal'
                                : selected === 'spark'
                                  ? 'lab'
                                  : 'anomaly',
                            ),
                          );
                        }}
                      >
                        {run.chapter < 2
                          ? 'Відкриється в третій локації'
                          : run.roomModes?.[selected]
                            ? 'Повернути звичайну квартиру'
                            : 'Увімкнути ризикований режим'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="housing-actions">
                {!placing ? (
                  <button className="primary small" onClick={beginPlacement}>
                    {room ? <Move size={16} /> : <UserPlus size={16} />}
                    {room
                      ? selectedGroup.length > 1
                        ? 'Перемістити спільну квартиру'
                        : 'Перемістити кімнату'
                      : 'Заселити в будинок'}
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
              </div>
            </div>
          )}
          <ApartmentFurniture
            run={run}
            meta={meta}
            resident={
              [...groups.aboard, ...groups.reserve].some(
                (person) => person.id === selected,
              )
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
        </div>
      </div>
      <p className="housing-footnote">
        Голова ОСББ залишається на борту. Його стартовий талант діє додатково до
        бонусу кімнати.
      </p>
    </div>
  );
}
