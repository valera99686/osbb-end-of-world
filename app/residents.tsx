import { useRef, useState, type CSSProperties } from 'react';
import { RotateCw, Home, ArrowDownToLine } from 'lucide-react';
import {
  RESIDENTS,
  RESIDENT_BY_ID,
  residentCells,
  canHouse,
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
    w = Math.max(...cells.map((c) => c[0])) + 1,
    h = Math.max(...cells.map((c) => c[1])) + 1;
  return (
    <svg
      className="resident-shape"
      width={w * 11}
      height={h * 11}
      viewBox={`0 0 ${w * 11} ${h * 11}`}
      aria-label={`${cells.length} клітинки`}
    >
      {cells.map(([x, y]) => (
        <rect
          key={`${x}:${y}`}
          x={x * 11 + 1}
          y={y * 11 + 1}
          width={9}
          height={9}
          rx={2}
          fill="currentColor"
        />
      ))}
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
  const cells = new Map(
    run.residents.flatMap((r) =>
      residentCells(r.id, r.rotation).map(
        ([x, y]) => [`${x + r.x}:${y + r.y}`, r] as const,
      ),
    ),
  );
  return (
    <button
      className="house-preview"
      onClick={onOpen}
      aria-label="Відкрити план розселення мешканців"
    >
      {Array.from({ length: 30 }, (_, i) => {
        const x = i % 6,
          y = Math.floor(i / 6),
          r = cells.get(`${x}:${y}`),
          first = r && residentCells(r.id, r.rotation)[0];
        return (
          <span
            key={i}
            className={r ? 'occupied' : ''}
            style={
              r
                ? ({
                    '--shape-color': RESIDENT_BY_ID[r.id].color,
                  } as CSSProperties)
                : undefined
            }
          >
            {r && first && x === r.x + first[0] && y === r.y + first[1] ? (
              <Portrait id={r.id} />
            ) : r ? (
              ''
            ) : (
              <span>+</span>
            )}
          </span>
        );
      })}
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
  const [selected, setSelected] = useState(run.character),
    [rotation, setRotation] = useState(
      run.residents.find((r) => r.id === run.character)?.rotation ?? 0,
    ),
    [ghost, setGhost] = useState<{ x: number; y: number } | null>(null),
    [message, setMessage] = useState('');
  const grid = useRef<HTMLDivElement>(null),
    drag = useRef<{
      pointerId: number;
      id: string;
      startX: number;
      startY: number;
      dx: number;
      dy: number;
      rotation: number;
      moved: boolean;
    } | null>(null),
    suppress = useRef(false);
  const person = RESIDENT_BY_ID[selected],
    room = run.residents.find((r) => r.id === selected);
  const occupied = new Map(
    run.residents.flatMap((r) =>
      residentCells(r.id, r.rotation).map(
        ([x, y]) => [`${x + r.x}:${y + r.y}`, r] as const,
      ),
    ),
  );
  const target = ghost ? { id: selected, ...ghost, rotation } : null,
    valid = target && canHouse(run.residents, target);
  const preview = new Set(
    target
      ? residentCells(selected, rotation).map(
          ([x, y]) => `${x + target.x}:${y + target.y}`,
        )
      : [],
  );
  function choose(id: string) {
    const r = run.residents.find((r) => r.id === id);
    setSelected(id);
    setRotation(r?.rotation ?? 0);
    setGhost(r ? { x: r.x, y: r.y } : null);
    setMessage('');
  }
  function place(r: ResidentRoom) {
    const next = houseResident(run, meta, r);
    if (next === run) {
      setMessage(
        'Тут кімната не вміщується. Поверни фігуру або звільни клітинки.',
      );
      return;
    }
    onChange(next);
    setGhost(null);
    setMessage(`${RESIDENT_BY_ID[r.id].name}: кімнату розміщено.`);
  }
  function position(x: number, y: number) {
    const r = grid.current!.getBoundingClientRect();
    return {
      x: Math.floor(((x - r.left) / r.width) * 6),
      y: Math.floor(((y - r.top) / r.height) * 5),
    };
  }
  return (
    <div className="resident-editor">
      <div className="bag-summary">
        <span>
          <Home size={17} /> {occupied.size}/30 клітинок
        </span>
        <span>{run.residents.length} мешканців у рейді</span>
      </div>
      <div className="housing-layout">
        <div>
          <div
            className="bag-grid resident-grid"
            ref={grid}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.pointerId !== e.pointerId) return;
              if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5)
                d.moved = true;
              if (d.moved) {
                const p = position(e.clientX, e.clientY);
                setGhost({ x: p.x - d.dx, y: p.y - d.dy });
              }
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              if (!d || d.pointerId !== e.pointerId) return;
              if (d?.moved) {
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
              setGhost(null);
            }}
            onLostPointerCapture={(e) => {
              if (drag.current?.pointerId === e.pointerId) {
                drag.current = null;
                setGhost(null);
              }
            }}
          >
            {Array.from({ length: 30 }, (_, i) => {
              const x = i % 6,
                y = Math.floor(i / 6),
                r = occupied.get(`${x}:${y}`),
                first = r && residentCells(r.id, r.rotation)[0],
                anchor =
                  first && x === r!.x + first[0] && y === r!.y + first[1];
              return (
                <button
                  type="button"
                  key={i}
                  className={`bag-cell ${r ? 'filled' : ''} ${r?.id === selected ? 'chosen' : ''} ${preview.has(`${x}:${y}`) ? (valid ? 'preview-valid' : 'preview-invalid') : ''}`}
                  style={
                    {
                      '--shape-color': r
                        ? RESIDENT_BY_ID[r.id].color
                        : person.color,
                    } as CSSProperties
                  }
                  aria-label={`Клітинка ${x + 1}, ${y + 1}: ${r ? RESIDENT_BY_ID[r.id].name : 'вільно'}`}
                  onPointerDown={(e) => {
                    if (drag.current || e.button !== 0) return;
                    suppress.current = false;
                    if (!r) return;
                    if (selected !== r.id) choose(r.id);
                    drag.current = {
                      pointerId: e.pointerId,
                      id: r.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      dx: x - r.x,
                      dy: y - r.y,
                      rotation: selected === r.id ? rotation : r.rotation,
                      moved: false,
                    };
                    grid.current?.setPointerCapture(e.pointerId);
                  }}
                  onClick={() => {
                    if (suppress.current) {
                      suppress.current = false;
                      return;
                    }
                    if (r && r.id !== selected) choose(r.id);
                    else if (r && !ghost) choose(r.id);
                    else place({ id: selected, x, y, rotation });
                  }}
                >
                  {anchor ? (
                    <Portrait id={r!.id} />
                  ) : r ? (
                    <span className="bag-rivet" />
                  ) : (
                    <span>+</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="bag-instructions">
            Обери мешканця й натисни клітинку для верхнього лівого кута фігури.
            Заселені кімнати можна перетягувати.
          </p>
          <div
            className="resident-details"
            style={{ '--shape-color': person.color } as CSSProperties}
          >
            <Portrait id={selected} />
            <div>
              <small>
                {person.job}
                {selected === run.character ? ' · голова ОСББ' : ''}
              </small>
              <h3>{person.name}</h3>
              <p>{person.effect}</p>
            </div>
            <ResidentShape id={selected} rotation={rotation} />
          </div>
          <div className="bag-actions">
            <button
              className="secondary small"
              onClick={() => {
                setRotation((rotation + 1) % 4);
                setGhost(
                  ghost ?? (room ? { x: room.x, y: room.y } : { x: 0, y: 0 }),
                );
              }}
            >
              <RotateCw size={16} /> Повернути
            </button>
            <button
              className="secondary small"
              disabled={!valid}
              onClick={() => target && place(target)}
            >
              Розмістити
            </button>
            <button
              className="text-button"
              disabled={!room || selected === run.character}
              onClick={() => {
                onChange(reserveResident(run, meta, selected));
                setGhost(null);
                setMessage(
                  'Мешканець чекатиме у притулку. Його бонус у рейді вимкнено.',
                );
              }}
            >
              <ArrowDownToLine size={15} /> У притулок
            </button>
          </div>
          <output className="bag-message" aria-live="polite">
            {message}
          </output>
        </div>
        <div className="resident-roster">
          <p className="micro">МЕШКАНЦІ · {meta.residents.length}/9</p>
          {RESIDENTS.map((r) => {
            const unlocked = meta.residents.includes(r.id),
              active = run.residents.some((p) => p.id === r.id);
            return (
              <button
                key={r.id}
                disabled={!unlocked}
                className={`resident-card ${selected === r.id ? 'active' : ''}`}
                onClick={() => choose(r.id)}
              >
                <Portrait id={r.id} />
                <span>
                  <b>{r.name}</b>
                  <small>
                    {unlocked
                      ? active
                        ? 'У будинку'
                        : 'У притулку'
                      : ['marta', 'danilo', 'solomia'].includes(r.id)
                        ? 'Знайди під час події'
                        : 'Відкрий наступні розділи'}
                  </small>
                </span>
                <ResidentShape id={r.id} />
              </button>
            );
          })}
        </div>
      </div>
      <p className="bag-instructions">
        Бонуси дають мешканці в будинку. Спільна стіна активує сумісність.
        Голова ОСББ залишається на борту; його стартовий талант діє додатково.
      </p>
    </div>
  );
}
