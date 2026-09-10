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
  type ResidentRoom,
} from '@/lib/game/residents';
import {
  houseResident,
  reserveResident,
  type Meta,
  type Run,
} from '@/lib/game/model';

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
  selected,
  target,
  valid,
  compact = false,
}: {
  rooms: ResidentRoom[];
  selected?: string;
  target?: ResidentRoom | null;
  valid?: boolean;
  compact?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg className="house-plan" viewBox="0 0 600 500" aria-hidden="true">
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
      <rect width="600" height="500" fill="#0d1a20" rx="3" />
      <rect width="600" height="500" fill={`url(#${uid}-grid)`} />
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
            {cells.slice(1).map(([cx, cy]) => (
              <g
                key={`${cx}:${cy}`}
                opacity="0.32"
                stroke={person.color}
                fill="none"
              >
                <rect
                  x={cx * 100 + 29}
                  y={cy * 100 + 26}
                  width="42"
                  height="48"
                  rx="5"
                />
                <path
                  d={`M${cx * 100 + 34} ${cy * 100 + 39}h32M${cx * 100 + 34} ${cy * 100 + 65}h32`}
                />
              </g>
            ))}
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
        width="600"
        height="500"
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
  onOpen,
}: {
  run: Run;
  onOpen: () => void;
}) {
  return (
    <button
      className="house-preview"
      onClick={onOpen}
      aria-label={`План будинку: ${run.residents.length} мешканців. Відкрити розселення`}
    >
      <HousePlan rooms={run.residents} compact />
    </button>
  );
}

export function Residents({
  run,
  meta,
  onChange,
}: {
  run: Run;
  meta: Meta;
  onChange: (r: Run) => void;
}) {
  const [selected, setSelected] = useState(run.character);
  const [rotation, setRotation] = useState(
    run.residents.find((r) => r.id === run.character)?.rotation ?? 0,
  );
  const [tab, setTab] = useState<'aboard' | 'reserve'>('aboard');
  const [placing, setPlacing] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState('');
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
  const valid = !!target && canHouse(run.residents, target);

  function stopDrag() {
    const active = drag.current;
    drag.current = null;
    if (active && grid.current?.hasPointerCapture(active.pointerId)) {
      grid.current.releasePointerCapture(active.pointerId);
    }
  }
  function choose(id: string) {
    stopDrag();
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
    const candidate = room ?? residentSpace(run.residents, selected);
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
      x: Math.floor(((x - bounds.left) / bounds.width) * 6),
      y: Math.floor(((y - bounds.top) / bounds.height) * 5),
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
          Вільно <b>{30 - occupied.size}</b> / 30 клітинок
        </span>
      </div>
      <div className="housing-layout">
        <div className="housing-workspace">
          <div className="house-blueprint">
            <div className="plan-heading">
              <span>ПЛАН ЖИТЛОВОГО ПОВЕРХУ</span>
              <span>6 × 5</span>
            </div>
            <div className="housing-canvas">
              <HousePlan
                rooms={run.residents}
                selected={selected}
                target={target}
                valid={valid}
              />
              <div
                className={`housing-hit-grid ${placing ? 'is-placing' : ''}`}
                ref={grid}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.pointerId !== e.pointerId) return;
                  if (
                    Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5
                  )
                    d.moved = true;
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
                {Array.from({ length: 30 }, (_, i) => {
                  const x = i % 6,
                    y = Math.floor(i / 6),
                    current = occupied.get(`${x}:${y}`);
                  return (
                    <button
                      type="button"
                      key={i}
                      className={current ? 'has-room' : ''}
                      aria-label={`Клітинка ${x + 1}, ${y + 1}: ${current ? RESIDENT_BY_ID[current.id].name : 'вільно'}${placing ? '. Обрати місце для кімнати' : ''}`}
                      onPointerDown={(e) => {
                        if (drag.current || e.button !== 0) return;
                        suppress.current = false;
                        if (!current || placing) return;
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
                        grid.current?.setPointerCapture(e.pointerId);
                      }}
                      onClick={() => {
                        if (suppress.current) {
                          suppress.current = false;
                          return;
                        }
                        if (placing) setGhost({ x, y });
                        else if (current) choose(current.id);
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
          <p className="housing-hint">
            {placing
              ? 'Верхній лівий кут фігури прив’язується до обраної клітинки. Червоний контур — місця недостатньо.'
              : 'Натисни кімнату, щоб обрати мешканця. Перетягни її, щоб змінити сусідів.'}
          </p>
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
              : 'Ці мешканці залишилися у притулку. Їхні бонуси в рейді не діють.'}
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
                      if (next === run) return;
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
