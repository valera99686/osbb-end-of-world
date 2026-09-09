import { useRef, useState, type CSSProperties } from 'react';
import { RotateCw, Package, Wrench, Recycle, Move } from 'lucide-react';
import {
  BAG_WIDTH,
  BAG_HEIGHT,
  itemCells,
  canPack,
  movePacked,
} from '@/lib/game/backpack';
import { FAMILY, ITEM_BY_ID } from '@/lib/game/data';
import type { Run } from '@/lib/game/model';

export function ShapePreview({
  id,
  rotation = 0,
}: {
  id: string;
  rotation?: number;
}) {
  const cells = itemCells(id, rotation);
  const width = Math.max(...cells.map(([x]) => x)) + 1,
    height = Math.max(...cells.map(([, y]) => y)) + 1;
  return (
    <svg
      className="shape-preview"
      width={width * 9}
      height={height * 9}
      viewBox={`0 0 ${width * 9} ${height * 9}`}
      aria-label={`Фігура займає ${cells.length} клітинки`}
    >
      {cells.map(([x, y]) => (
        <rect
          key={`${x}:${y}`}
          x={x * 9 + 1}
          y={y * 9 + 1}
          width={7}
          height={7}
          rx={1}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function Backpack({
  run,
  onChange,
  onInstall,
  onScrap,
}: {
  run: Run;
  onChange: (run: Run) => void;
  onInstall: (uid: number, slot: number) => void;
  onScrap: (uid: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState('');
  const [installing, setInstalling] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    uid: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    rotation: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const selected = run.backpack.find((i) => i.uid === selectedId);
  const occupied = new Map(
    run.backpack.flatMap((item) =>
      itemCells(item.id, item.rotation).map(
        ([x, y]) => [`${x + item.x}:${y + item.y}`, item] as const,
      ),
    ),
  );
  const preview =
    selected && ghost
      ? itemCells(selected.id, rotation).map(
          ([x, y]) => `${x + ghost.x}:${y + ghost.y}`,
        )
      : [];
  const valid =
    !!selected &&
    !!ghost &&
    canPack(
      run.backpack,
      selected.id,
      ghost.x,
      ghost.y,
      rotation,
      selected.uid,
    );
  function choose(uid: number) {
    const item = run.backpack.find((i) => i.uid === uid);
    if (!item) return;
    setSelectedId(uid);
    setRotation(item.rotation);
    setGhost({ x: item.x, y: item.y });
    setMessage('');
    setInstalling(false);
  }
  function place(x: number, y: number, uid = selectedId, turn = rotation) {
    if (uid === null) return;
    const next = movePacked(run.backpack, uid, x, y, turn);
    if (next === run.backpack) {
      setMessage(
        'Фігура не вміщується: перевір край рюкзака й сусідні предмети.',
      );
      return;
    }
    onChange({ ...run, backpack: next });
    setGhost({ x, y });
    setMessage('Предмет переміщено.');
  }
  function position(clientX: number, clientY: number) {
    const rect = grid.current!.getBoundingClientRect();
    return {
      x: Math.floor(((clientX - rect.left) / rect.width) * BAG_WIDTH),
      y: Math.floor(((clientY - rect.top) / rect.height) * BAG_HEIGHT),
    };
  }
  return (
    <div className="backpack-editor">
      <div className="bag-summary">
        <span>
          <Package size={17} /> {occupied.size} / 30 клітинок
        </span>
        <span>{run.backpack.length} предметів</span>
      </div>
      <div
        className="bag-grid"
        ref={grid}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.moved = true;
          if (d.moved) {
            const p = position(e.clientX, e.clientY);
            setGhost({ x: p.x - d.offsetX, y: p.y - d.offsetY });
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (d?.moved) {
            const p = position(e.clientX, e.clientY);
            place(p.x - d.offsetX, p.y - d.offsetY, d.uid, d.rotation);
            suppressClick.current = true;
          }
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
          setGhost(null);
        }}
      >
        {Array.from({ length: 30 }, (_, cell) => {
          const x = cell % BAG_WIDTH,
            y = Math.floor(cell / BAG_WIDTH),
            packed = occupied.get(`${x}:${y}`);
          const item = packed ? ITEM_BY_ID[packed.id] : null;
          const first = packed && itemCells(packed.id, packed.rotation)[0];
          const anchor =
            first && x === packed!.x + first[0] && y === packed!.y + first[1];
          const color = item ? FAMILY[item.family].color : '#597681';
          return (
            <button
              type="button"
              key={cell}
              className={`bag-cell ${packed ? 'filled' : ''} ${packed?.uid === selectedId ? 'chosen' : ''} ${preview.includes(`${x}:${y}`) ? (valid ? 'preview-valid' : 'preview-invalid') : ''}`}
              style={{ '--shape-color': color } as CSSProperties}
              aria-label={`${x + 1}, ${y + 1}: ${item?.name ?? 'порожньо'}`}
              title={item?.name ?? 'Розмістити фігуру'}
              onPointerDown={(e) => {
                suppressClick.current = false;
                if (!packed) return;
                if (selectedId !== packed.uid) choose(packed.uid);
                drag.current = {
                  uid: packed.uid,
                  x: e.clientX,
                  y: e.clientY,
                  offsetX: x - packed.x,
                  offsetY: y - packed.y,
                  moved: false,
                  rotation:
                    selectedId === packed.uid ? rotation : packed.rotation,
                };
                grid.current?.setPointerCapture(e.pointerId);
              }}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                if (packed) choose(packed.uid);
                else place(x, y);
              }}
            >
              {anchor ? (
                <Package size={19} />
              ) : packed ? (
                <span className="bag-rivet" />
              ) : (
                <span>·</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="bag-instructions">
        <Move size={14} /> Перетягни фігуру або обери предмет і натисни клітинку
        для його верхнього лівого кута.
      </p>
      {selected ? (
        <div className="bag-selection">
          <div className="bag-item-heading">
            <ShapePreview id={selected.id} rotation={rotation} />
            <b>{ITEM_BY_ID[selected.id].name}</b>
          </div>
          <p>{ITEM_BY_ID[selected.id].desc}</p>
          <div className="bag-actions">
            <button
              className="secondary small"
              onClick={() => {
                setRotation((r) => (r + 1) % 4);
                setGhost(ghost ?? { x: selected.x, y: selected.y });
              }}
            >
              <RotateCw size={15} /> Повернути
            </button>
            <button
              className="secondary small"
              disabled={!valid}
              onClick={() => ghost && place(ghost.x, ghost.y)}
            >
              Розмістити
            </button>
            <button
              className="secondary small"
              onClick={() => setInstalling(!installing)}
            >
              <Wrench size={15} /> Встановити
            </button>
            <button
              className="text-button danger"
              onClick={() => {
                onScrap(selected.uid);
                setSelectedId(null);
              }}
            >
              <Recycle size={15} /> +2 брухту
            </button>
          </div>
          {installing && (
            <div className="bag-install-slots">
              {run.items.map((id, slot) => (
                <button
                  key={slot}
                  onClick={() => onInstall(selected.uid, slot)}
                >
                  <small>КІМНАТА {slot + 1}</small>
                  {id ? ITEM_BY_ID[id].name : '+ Вільна кімната'}
                </button>
              ))}
            </div>
          )}
          {installing && (
            <p className="bag-instructions">
              Модуль із зайнятої кімнати переїде до рюкзака, якщо в ньому є
              місце.
            </p>
          )}
        </div>
      ) : (
        <p className="bag-empty">
          {run.backpack.length
            ? 'Обери фігуру, щоб повернути, встановити або розібрати предмет.'
            : 'Тут можна зберігати запасні модулі. Після бою або в магазині обери «У рюкзак».'}
        </p>
      )}
      <output className="bag-message">{message}</output>
      <p className="bag-instructions">
        Бонуси дають модулі в будинку. Вміст рюкзака можна переставляти між
        боями.
      </p>
    </div>
  );
}
