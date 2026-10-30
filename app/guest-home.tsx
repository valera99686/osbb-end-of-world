// What the guest of an online room has in the room while the host plays the
// map: the house (the host's, with the guest's own modules in it), what it
// can do, its row of the reward and the shop. The guest asks (session.take),
// the host checks it against its own run and does it.
import { Check, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { FAMILY, ITEMS, ITEM_BY_ID, RARITIES } from '@/lib/game/data';
import { activeEquipment } from '@/lib/game/equipment';
import {
  giveMate,
  mateRun,
  mateStats,
  priceFor,
  readView,
  type Meta,
} from '@/lib/game/model';
import type { NetSession } from '@/lib/game/session';
import { Glyph } from './glyph';
import { HouseStill } from './residents';
import { Currency } from './hud-parts';

function Card({
  id,
  footer,
  onClick,
  disabled,
}: {
  id: string;
  footer: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const item = ITEM_BY_ID[id];
  if (!item) return null;
  return (
    <button
      type="button"
      className={`item-card compact rarity-${item.rarity}`}
      style={{ '--item-color': FAMILY[item.family].color } as CSSProperties}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="item-top">
        <span className="item-emblem">
          <Glyph name={item.icon} size={22} />
        </span>
        <span className="rarity">{RARITIES[item.rarity]}</span>
      </div>
      <h3>{item.name}</h3>
      <span className="family-label">{FAMILY[item.family].name}</span>
      <p>{item.desc}</p>
      <div className="item-footer">{footer}</div>
    </button>
  );
}

const nameOf = (id?: string) => (id ? (ITEM_BY_ID[id]?.name ?? '') : '');

export function GuestHome({
  session,
  meta,
}: {
  session: NetSession;
  meta: Meta;
}) {
  const view = readView(session.view);
  if (!view) return null;
  // Everything is on the shelf for the guest: what the host has opened is not
  // the guest's to judge, the host checks the rest.
  const open: Meta = { ...meta, unlocked: ITEMS.map((i) => i.id) };
  const own = mateRun(view);
  const gear = activeEquipment(own).map((i) => i.id);
  const st = mateStats(view, open);
  const fits = (id: string) => giveMate(view, open, id) !== view;
  const asked = (source: 'reward' | 'shop', index: number, id: string) =>
    session.take(source, index, id);
  return (
    <div className="guest-home">
      <div className="guest-house">
        <b className="guest-house-title">Твій будинок</b>
        <HouseStill run={view} items={view.mateItems ?? []} />
        <div className="mate-gear">
          {gear.length ? (
            gear.map((id, i) => (
              <span
                key={id + i}
                className={`mate-chip rarity-${ITEM_BY_ID[id].rarity}`}
                title={ITEM_BY_ID[id].desc}
              >
                <Glyph name={ITEM_BY_ID[id].icon} size={14} />{' '}
                {ITEM_BY_ID[id].name}
              </span>
            ))
          ) : (
            <span className="mate-chip">модулів нема</span>
          )}
        </div>
        <dl className="guest-stats">
          <div>
            <dt>Міцність</dt>
            <dd>{Math.round(st.health)}</dd>
          </div>
          <div>
            <dt>Шкода</dt>
            <dd>{Math.round(st.damage)}</dd>
          </div>
          <div>
            <dt>Темп</dt>
            <dd>{st.rate.toFixed(1)}/с</dd>
          </div>
          <div>
            <dt>Швидкість</dt>
            <dd>{Math.round(st.speed)}</dd>
          </div>
          <div>
            <dt>Броня</dt>
            <dd>{st.armor}</dd>
          </div>
        </dl>
      </div>
      {view.page === 'reward' && (
        <div className="guest-pick">
          <div className="reward-owner mate">
            <b>Твоя знахідка</b>
            {view.picked?.mate ? (
              <span className="took">
                <Check size={14} /> ти взяв: {nameOf(view.picked.mate)}
              </span>
            ) : (
              <span>обери один</span>
            )}
          </div>
          {view.picked?.host && (
            <p className="guest-note">
              Господар взяв: {nameOf(view.picked.host)}.
            </p>
          )}
          <div className="reward-cards">
            {(view.mateLoot ?? []).map((loot, i) => (
              <Card
                key={'m' + loot.id}
                id={loot.id}
                disabled={!fits(loot.id)}
                onClick={() => asked('reward', i, loot.id)}
                footer={
                  fits(loot.id) ? (
                    <>
                      <span>Забрати собі</span>
                      <Plus size={18} />
                    </>
                  ) : (
                    <span>Немає місця</span>
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
      {view.page === 'shop' && (
        <div className="guest-pick">
          <div className="reward-owner mate">
            <b>Магазин</b>
            <span>каса спільна: {Math.floor(view.coins)} монет</span>
          </div>
          <div className="shop-cards">
            {view.offers.map((id, i) => {
              const item = ITEM_BY_ID[id];
              if (!item) return null;
              const bought = view.bought.includes(i),
                price = priceFor(item, view),
                who = view.boughtBy?.[i];
              return (
                <Card
                  key={`${id}-${i}`}
                  id={id}
                  disabled={bought || view.coins < price || !fits(id)}
                  onClick={() => asked('shop', i, id)}
                  footer={
                    bought ? (
                      <>
                        <Check size={16} />{' '}
                        {who === 'mate' ? 'Купив ти' : 'Купив господар'}
                      </>
                    ) : (
                      <>
                        <Currency amount={price} />
                        <span>{fits(id) ? 'Купити собі' : 'Немає місця'}</span>
                      </>
                    )
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
