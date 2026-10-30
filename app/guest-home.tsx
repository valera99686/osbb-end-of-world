// The guest of an online room has the same screens as the host: the same page
// (the reward with its two rows, the shop), the same side panel of its own
// house and the same «Квартири й обладнання» to arrange it. It asks (take,
// house), the host checks the ask against its own run and does it.
import { useState } from 'react';
import { Check, Home, Plus } from 'lucide-react';
import { ITEMS, ITEM_BY_ID, CHARACTERS } from '@/lib/game/data';
import {
  furniturePrice,
  giveMate,
  houseOf,
  mateRun,
  priceFor,
  type Meta,
  type Run,
} from '@/lib/game/model';
import type { NetSession } from '@/lib/game/session';
import { FURNITURE_BY_ID } from '@/lib/game/furniture';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { HouseAside, PartnerHouse } from './house-aside';
import { ItemCard, takenText } from './item-card';
import { FurnitureCard } from './campaign-panels';
import { Currency } from './hud-parts';
import { Residents } from './residents';

// The profile the guest's checks are made with: everything is on the shelf for
// the guest to look at, the host checks the rest.
export const openMeta = (meta: Meta): Meta => ({
  ...meta,
  unlocked: ITEMS.map((i) => i.id),
});

// The guest's own house as a run, with the changes it has made and the host
// has not yet sent back.
export function useGuestHouse(view: Run | null) {
  const [local, setLocal] = useState<{ view: Run; run: Run } | null>(null);
  const mine = !view
    ? null
    : local && local.view === view
      ? local.run
      : mateRun(view);
  return { mine, set: (run: Run) => view && setLocal({ view, run }) };
}

export function GuestPages({
  session,
  view,
  meta,
}: {
  session: NetSession;
  view: Run;
  meta: Meta;
}) {
  const open = openMeta(meta);
  const mate = CHARACTERS.find((c) => c.id === view.coop)?.name ?? 'Ти';
  const fits = (id: string) => giveMate(view, open, id) !== view;
  if (view.page === 'reward')
    return (
      <>
        <p className="eyebrow">
          <Check size={16} /> ЗДОБИЧ
        </p>
        <h2>Знайшли дещо корисне.</h2>
        <p className="lead">
          У кожного будинку своя полиця: кожен бере по одному предмету зі
          свого ряду.
        </p>
        {view.eventResult && (
          <div className="mission-banner" role="status">
            <Home size={22} />
            <p>{view.eventResult}</p>
          </div>
        )}
        <div className={`reward-owner host${view.picked?.host ? ' done' : ''}`}>
          <b>Господар</b>
          {view.picked?.host ? (
            <span className="took">
              <Check size={14} /> взяв: {takenText(view.picked.host)}
            </span>
          ) : (
            <span>обирає</span>
          )}
        </div>
        <div className="reward-cards">
          {view.loot.map((loot) =>
            loot.kind === 'module' && ITEM_BY_ID[loot.id] ? (
              <ItemCard
                key={loot.kind + loot.id}
                item={ITEM_BY_ID[loot.id]}
                footer={<span>Ряд господаря</span>}
              />
            ) : loot.kind === 'furniture' && FURNITURE_BY_ID[loot.id] ? (
              <FurnitureCard
                key={loot.kind + loot.id}
                id={loot.id}
                footer="Ряд господаря"
                disabled
                onClick={() => {}}
              />
            ) : null,
          )}
        </div>
        <div className={`reward-owner mate${view.picked?.mate ? ' done' : ''}`}>
          <b>Для тебе</b>
          {view.picked?.mate ? (
            <span className="took">
              <Check size={14} /> ти взяв: {takenText(view.picked.mate)}
            </span>
          ) : (
            <span>обери один</span>
          )}
        </div>
        <div className="reward-cards">
          {(view.mateLoot ?? []).map((loot, i) => (
            <ItemCard
              key={'m' + loot.id}
              item={ITEM_BY_ID[loot.id]}
              disabled={!fits(loot.id)}
              onClick={() => session.take('reward', i, loot.id)}
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
      </>
    );
  if (view.page === 'shop')
    return (
      <>
        <p className="eyebrow">ВІДЧИНЕНО ДО СВІТАНКУ</p>
        <h2>Нічний ринок</h2>
        <p className="lead">
          Каса спільна: {Math.floor(view.coins)} монет. Купуєш для себе, {mate}.
        </p>
        <div className="shop-cards">
          {view.offers.map((id, i) => {
            const item = ITEM_BY_ID[id];
            if (!item) return null;
            const bought = view.bought.includes(i),
              price = priceFor(item, view),
              who = view.boughtBy?.[i];
            return (
              <ItemCard
                key={`${id}-${i}`}
                compact
                item={item}
                disabled={bought || view.coins < price || !fits(id)}
                onClick={() => session.take('shop', i, id)}
                footer={
                  bought ? (
                    <>
                      <Check size={16} />{' '}
                      {who === 'mate' ? 'Купив ти' : 'Купив господар'}
                    </>
                  ) : (
                    <>
                      <Currency amount={price} />
                      <Plus size={17} />
                    </>
                  )
                }
              />
            );
          })}
        </div>
        <div className="shop-cards furniture-shop-cards">
          {view.shopFurniture.map((id, i) => {
            if (!FURNITURE_BY_ID[id]) return null;
            const bought = view.bought.includes(10 + i);
            const cost = furniturePrice(view, id);
            return (
              <FurnitureCard
                key={id + i}
                id={id}
                disabled={bought || view.coins < cost}
                footer={
                  bought ? (
                    view.boughtBy?.[10 + i] === 'mate' ? (
                      'Купив ти'
                    ) : (
                      'Купив господар'
                    )
                  ) : (
                    <Currency amount={cost} />
                  )
                }
                onClick={() => session.take('shop', 10 + i, id)}
              />
            );
          })}
        </div>
      </>
    );
  return null;
}

export function GuestAside({
  session,
  view,
  mine,
  setMine,
  meta,
}: {
  session: NetSession;
  view: Run;
  mine: Run;
  setMine: (run: Run) => void;
  meta: Meta;
}) {
  const [housing, setHousing] = useState(false);
  const open = openMeta(meta);
  return (
    <>
      <HouseAside
        run={mine}
        meta={open}
        title="ТВІЙ БУДИНОК"
        onOpen={() => setHousing(true)}
        partner={
          <PartnerHouse
            house={{ ...view, ...houseOf(view) }}
            name="Господар"
            meta={open}
          />
        }
      />
      <Dialog open={housing} onOpenChange={setHousing}>
        <DialogContent className="game-modal housing-modal">
          <DialogTitle>Твій будинок / Квартири й обладнання</DialogTitle>
          <DialogDescription>
            Спільні стіни створюють бонуси й конфлікти. Обери квартиру, щоб
            переставити її. Обладнання став у вільні клітинки всередині
            квартир. Зміни бачить і господар.
          </DialogDescription>
          <Residents
            run={mine}
            meta={open}
            onChange={(next) => {
              setMine(next);
              session.sendHouse(houseOf(next), next.coins, next.scrap);
            }}
            onMetaChange={() => {}}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
