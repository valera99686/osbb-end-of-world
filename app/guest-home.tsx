// The guest of an online room has the same screens as the host: the same page
// (the reward with its two rows, the shop), the same side panel of its own
// house and the same «Квартири й обладнання» to arrange it. It asks (take,
// house), the host checks the ask against its own run and does it.
import { useState } from 'react';
import { Check, Home, Plus } from 'lucide-react';
import { ITEMS, ITEM_BY_ID, CHARACTERS } from '@/lib/game/data';
import {
  eventFor,
  furniturePrice,
  giveMate,
  houseOf,
  mateRun,
  partySize,
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
import { EventOptions, FurnitureCard, TogetherRoles } from './campaign-panels';
import { Currency } from './hud-parts';
import { Residents } from './residents';
import { matesOf } from './vote';
import { CouncilPage } from './council';

// The profile the guest's checks are made with: everything is on the shelf for
// the guest to look at, the host checks the rest.
export const openMeta = (meta: Meta): Meta => ({
  ...meta,
  unlocked: ITEMS.map((i) => i.id),
});

// The guest's own house as a run, with the changes it has made and the host
// has not yet sent back.
export function useGuestHouse(view: Run | null, seat = 1) {
  const [local, setLocal] = useState<{ view: Run; run: Run } | null>(null);
  const mine = !view
    ? null
    : local && local.view === view
      ? local.run
      : mateRun(view, seat);
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
  // This guest's seat: its house, its row of the reward and its finds.
  const seat = session.seat;
  const mate =
    CHARACTERS.find((c) => c.id === (view.mates?.[seat - 1]?.hero ?? view.coop))
      ?.name ?? 'Ти';
  const fits = (id: string) => giveMate(view, open, id, seat) !== view;
  // The other partners' rows: what each has taken (or is still choosing).
  const others = (view.mates ?? [])
    .map((_, i) => i + 1)
    .filter((s) => s !== seat);
  if (view.page === 'reward')
    return (
      <>
        <p className="eyebrow">
          <Check size={16} />{' '}
          {view.kind === 'chest' ? 'СКРИНЮ ВІДКРИТО' : 'ЗДОБИЧ'}
        </p>
        <h2>Знайшли дещо корисне.</h2>
        <p className="lead">
          {view.kind === 'chest'
            ? 'У скрині знахідка для кожного будинку: твоя у твоєму ряду.'
            : 'У кожного будинку своя полиця: кожен бере по одному предмету зі свого ряду.'}
        </p>
        {view.eventResult && (
          <div className="mission-banner" role="status">
            <Home size={22} />
            <p>{view.eventResult}</p>
          </div>
        )}
        {others.map((s) => (
          <div
            key={s}
            className={`reward-owner mate${view.picked?.[s] ? ' done' : ''}`}
          >
            <b>{session.nameOf(s)}</b>
            {view.picked?.[s] ? (
              <span className="took">
                <Check size={14} /> взяв(ла): {takenText(view.picked[s])}
              </span>
            ) : (
              <span>обирає</span>
            )}
          </div>
        ))}
        <div className={`reward-owner host${view.picked?.[0] ? ' done' : ''}`}>
          <b>Господар</b>
          {view.picked?.[0] ? (
            <span className="took">
              <Check size={14} /> взяв: {takenText(view.picked[0])}
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
                locked
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
        <div
          className={`reward-owner mate${view.picked?.[seat] ? ' done' : ''}`}
        >
          <b>Для тебе</b>
          {view.picked?.[seat] ? (
            <span className="took">
              <Check size={14} /> ти взяв: {takenText(view.picked[seat])}
            </span>
          ) : (
            <span>обери один</span>
          )}
        </div>
        <div className="reward-cards">
          {(view.mateLoots?.[seat - 1] ?? []).map((loot, i) =>
            loot.kind === 'furniture' ? (
              FURNITURE_BY_ID[loot.id] && (
                <FurnitureCard
                  key={'mf' + loot.id}
                  id={loot.id}
                  disabled={
                    (view.mates?.[seat - 1]?.furniture.length ?? 0) >= 30
                  }
                  onClick={() => session.take('reward', i, loot.id)}
                  footer={
                    (view.mates?.[seat - 1]?.furniture.length ?? 0) >= 30
                      ? 'Запас меблів повний'
                      : 'Забрати собі'
                  }
                />
              )
            ) : (
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
            ),
          )}
        </div>
      </>
    );
  if (view.page === 'council') {
    const ballot =
      session.ballot && session.ballot.step === view.step
        ? session.ballot
        : null;
    return (
      <CouncilPage
        key={`${view.seed}-${view.chapter}-${view.loop ?? 0}`}
        run={view}
        vote={
          ballot
            ? {
                mine: ballot.votes[session.seat] ?? null,
                mates: matesOf(ballot, session.seat, (s) => session.nameOf(s)),
                done: ballot.done,
                onVote: (col) => session.voteGuest(col),
              }
            : {
                mine: null,
                mates: [],
                note: 'Зараз відкриється вибір…',
                onVote: () => {},
              }
        }
      />
    );
  }
  if (view.page === 'event') {
    // An event is decided by both: the host's picks and this guest's go on one
    // ballot, and its outcome is seen when it is done.
    const rest = view.kind === 'rest',
      event = eventFor(view),
      together = rest ? undefined : event.together,
      ballot =
        session.ballot && session.ballot.step === view.step
          ? session.ballot
          : null;
    return (
      <>
        <p className="eyebrow">
          {rest
            ? 'ПЕРЕПОЧИНОК'
            : `${together ? 'СПІЛЬНА ЗУСТРІЧ' : 'ЗУСТРІЧ'} · ЛОКАЦІЯ ${view.chapter + 1}`}
        </p>
        <h2>{rest ? 'Тихе подвір’я' : event.title}</h2>
        <p className="lead">
          {rest
            ? 'Зупини двигун на кілька хвилин: полагодь будинок або пошукай припаси.'
            : event.text +
              (together && partySize(view) > 2 ? ` ${together.extra}` : '')}
        </p>
        {view.eventDone ? (
          <div className="mission-banner" role="status">
            <Check size={22} />
            <p>{view.eventResult}</p>
          </div>
        ) : together ? (
          <TogetherRoles
            roles={together.roles.slice(0, Math.max(2, partySize(view)))}
            names={Array.from({ length: partySize(view) }, (_, s) =>
              s === session.seat ? 'Ти' : session.nameOf(s),
            )}
            prize={event.choices[0].detail}
            done={Array.from(
              { length: Math.max(2, partySize(view)) },
              (_, s) =>
                (ballot?.votes[s] ?? null) !== null ||
                !!ballot?.away?.includes(s),
            )}
            mine={session.seat}
            open={!!ballot && ballot.options.includes(0)}
            finished={!!ballot?.done}
            note={ballot ? undefined : 'Зараз відкриється вибір…'}
            onAct={() => session.voteGuest(0)}
          />
        ) : (
          <EventOptions
            run={view}
            meta={open}
            onPick={() => {}}
            vote={
              ballot
                ? {
                    mine: ballot.votes[session.seat] ?? null,
                    mates: matesOf(ballot, session.seat, (s) =>
                      session.nameOf(s),
                    ),
                    options: ballot.options,
                    done: ballot.done,
                    onVote: (col) => session.voteGuest(col),
                  }
                : {
                    mine: null,
                    mates: [],
                    options: [],
                    note: 'Зараз відкриється вибір…',
                    onVote: () => {},
                  }
            }
          />
        )}
      </>
    );
  }
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
                      {who === seat
                        ? 'Купив ти'
                        : `Купив ${who ? session.nameOf(who) : 'господар'}`}
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
                    view.boughtBy?.[10 + i] === seat ? (
                      'Купив ти'
                    ) : (
                      `Купив ${view.boughtBy?.[10 + i] ? session.nameOf(view.boughtBy[10 + i]) : 'господар'}`
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
            переставити її. Обладнання став у вільні клітинки всередині квартир.
            Зміни бачить і господар.
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
