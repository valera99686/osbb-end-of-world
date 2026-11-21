import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, Hand, Lock } from 'lucide-react';
import { ITEMS, UNLOCK_TEXT } from '@/lib/game/data';
import { ENEMY_DEFS, LOCATIONS } from '@/lib/game/encounters';
import { FURNITURE, furnitureText } from '@/lib/game/furniture';
import { ENEMY_KEYS, LEADERS } from '@/lib/game/gallery';
import { enemyPicture } from '@/lib/game/enemy-art';
import { asset } from '@/lib/game/assets';
import type { Meta } from '@/lib/game/model';
import { ItemCard } from './item-card';
import { FurnitureIcon } from './furniture';

type Tab = 'items' | 'furniture' | 'enemies' | 'leaders';

// An enemy kind drawn from the fights' own sprite; one not met yet is a dark
// silhouette.
function EnemyPicture({
  type,
  location,
  met,
}: {
  type: number;
  location: number;
  met: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let tries = 0;
    const paint = () => {
      const sprite = enemyPicture(type, location);
      const c = ref.current?.getContext('2d');
      if (!sprite || !c) return false;
      const n = c.canvas.width;
      c.clearRect(0, 0, n, n);
      c.drawImage(sprite, 0, 0, n, n);
      if (!met) {
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = '#0b161c';
        c.fillRect(0, 0, n, n);
        c.globalCompositeOperation = 'source-over';
      }
      return true;
    };
    if (paint()) return;
    // The atlas loads in the background: try again until it is there.
    const t = window.setInterval(() => {
      if (paint() || ++tries > 40) window.clearInterval(t);
    }, 250);
    return () => window.clearInterval(t);
  }, [type, location, met]);
  return (
    <canvas
      ref={ref}
      width={160}
      height={160}
      className="gallery-picture"
      aria-hidden="true"
    />
  );
}

export function Gallery({ meta, onBack }: { meta: Meta; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('items');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const seen = new Set(meta.seen);
  const met = new Set(meta.met ?? []);
  const found = (text: string) =>
    text.toLocaleLowerCase('uk').includes(search.toLocaleLowerCase('uk'));
  const metEnemies = ENEMY_KEYS.filter((k) => met.has(k)).length;
  const metLeaders = LEADERS.flatMap((l) => [l.boss.key, l.mini.key]).filter(
    (k) => met.has(k),
  ).length;
  const tabs: [Tab, string, string][] = [
    [
      'items',
      'Предмети',
      `${ITEMS.filter((i) => seen.has(i.id)).length}/${ITEMS.length}`,
    ],
    [
      'furniture',
      'Меблі',
      `${FURNITURE.filter((f) => seen.has(f.id)).length}/${FURNITURE.length}`,
    ],
    ['enemies', 'Вороги', `${metEnemies}/${ENEMY_KEYS.length}`],
    ['leaders', 'Боси й мінібоси', `${metLeaders}/${LEADERS.length * 2}`],
  ];
  return (
    <section className="collection-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} /> Головне меню
      </button>
      <p className="eyebrow">ЗНАЙОМСЯ. КОМБІНУЙ. ЕКСПЕРИМЕНТУЙ.</p>
      <div className="collection-title">
        <div>
          <h2>Галерея</h2>
          <p className="lead">
            Усе, що вже було в руках і траплялося в боях. {meta.unlocked.length}{' '}
            із {ITEMS.length} креслень відкрито.
          </p>
        </div>
        <BookOpen size={42} className="muted" />
      </div>
      <div className="gallery-tabs" role="tablist">
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
      {(tab === 'items' || tab === 'furniture') && (
        <div className="codex-controls">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Назва або ефект…"
            aria-label="Пошук"
          />
          <div className="filter-buttons">
            {(tab === 'items'
              ? [
                  ['all', 'Усі'],
                  ['held', 'Були в руках'],
                  ['open', 'Відкриті'],
                  ['locked', 'Закриті'],
                ]
              : [
                  ['all', 'Усі'],
                  ['held', 'Були в руках'],
                ]
            ).map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? 'active' : ''}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'items' && (
        <div className="codex-grid">
          {ITEMS.filter(
            (i) =>
              (filter === 'all' ||
                (filter === 'held' && seen.has(i.id)) ||
                (filter === 'open' && meta.unlocked.includes(i.id)) ||
                (filter === 'locked' && !meta.unlocked.includes(i.id))) &&
              found(i.name + ' ' + i.desc),
          ).map((i) => (
            <div
              key={i.id}
              className={meta.unlocked.includes(i.id) ? '' : 'locked-item'}
            >
              <ItemCard
                item={i}
                compact
                fresh={meta.fresh?.includes(i.id)}
                footer={
                  <span className="unlock-rule">
                    {seen.has(i.id) ? (
                      <>
                        <Hand size={14} /> Був у руках
                      </>
                    ) : meta.unlocked.includes(i.id) ? (
                      <>
                        <Check size={14} /> Є в нагородах і магазинах
                      </>
                    ) : (
                      <>
                        <Lock size={14} /> {UNLOCK_TEXT[i.unlock]}
                      </>
                    )}
                  </span>
                }
              />
            </div>
          ))}
        </div>
      )}
      {tab === 'furniture' && (
        <div className="codex-grid">
          {FURNITURE.filter(
            (f) =>
              (filter !== 'held' || seen.has(f.id)) &&
              found(f.name + ' ' + furnitureText(f.id)),
          ).map((f) => (
            <article
              key={f.id}
              className={`item-card compact ${seen.has(f.id) ? '' : 'unmet'}`}
            >
              <div className="item-top">
                <span className="item-emblem">
                  <FurnitureIcon id={f.id} size={22} />
                </span>
                <span className="rarity">МЕБЛІ</span>
              </div>
              <h3>{f.name}</h3>
              <p>{furnitureText(f.id)}.</p>
              <div className="item-footer">
                <span className="unlock-rule">
                  {seen.has(f.id) ? (
                    <>
                      <Hand size={14} /> Були в руках
                    </>
                  ) : (
                    'Ще не траплялися'
                  )}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
      {tab === 'enemies' && (
        <div className="gallery-grid">
          {ENEMY_DEFS.map((d) => {
            const known = met.has(`enemy:${d.type}`);
            return (
              <article
                key={d.type}
                className={`gallery-card ${known ? '' : 'unmet'}`}
              >
                <EnemyPicture type={d.type} location={d.location} met={known} />
                <h3>{known ? d.name : '???'}</h3>
                <small>{LOCATIONS[d.location].name}</small>
                <p>{known ? d.guide : 'Ще не траплявся в бою.'}</p>
                {known && (
                  <p className="gallery-stats">
                    Міцність {d.health}, швидкість {d.speed}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {tab === 'leaders' && (
        <div className="gallery-grid">
          {LEADERS.flatMap((l) => [
            {
              key: l.boss.key,
              art: `art/boss-${l.boss.id}.webp`,
              name: l.boss.name,
              guide: l.boss.guide,
              chapter: l.chapter,
              kind: 'Бос',
            },
            {
              key: l.mini.key,
              art: `art/mini-${l.chapter}-${l.variant}.webp`,
              name: l.mini.name,
              guide: l.mini.guide,
              chapter: l.chapter,
              kind: 'Мінібос',
            },
          ]).map((x) => {
            const known = met.has(x.key);
            return (
              <article
                key={x.key}
                className={`gallery-card leader ${known ? '' : 'unmet'}`}
              >
                <img
                  src={asset(x.art)}
                  alt=""
                  className="gallery-portrait"
                  loading="lazy"
                />
                <h3>{known ? x.name : '???'}</h3>
                <small>
                  {x.kind} · {LOCATIONS[x.chapter].name}
                </small>
                <p>{known ? x.guide : 'Ще не зустрічався.'}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
