// The side panel of a house: its plan, what is in it, what it can do. The
// first house's panel and the second one's are this same panel, so both
// players read the same screen.
import { useState, type ReactNode } from 'react';
import {
  Crosshair,
  Eye,
  Footprints,
  Hammer,
  Heart,
  Home,
  Recycle,
  Shield,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { activeEquipment } from '@/lib/game/equipment';
import { ITEM_BY_ID } from '@/lib/game/data';
import { FURNITURE_BY_ID, furnitureEffect } from '@/lib/game/furniture';
import { statsFor, type Meta, type Run } from '@/lib/game/model';
import {
  RESIDENT_BY_ID,
  houseSize,
  residentCells,
} from '@/lib/game/residents';
import { Glyph } from './glyph';
import { HousePreview, HouseStill } from './residents';

export function HouseAside({
  run,
  meta,
  title,
  hp,
  onOpen,
  partner,
  children,
}: {
  // The house to show, as a run (model.ts mateRun for the second one).
  run: Run;
  meta: Meta;
  title: string;
  // Current health, when it is the house's own (the second one has its health
  // only in a fight).
  hp?: number;
  onOpen: () => void;
  // The other house, to look at.
  partner?: ReactNode;
  children?: ReactNode;
}) {
  const stats = statsFor(run, meta);
  return (
    <aside className="inventory">
      <div className="section-kicker">
        <Home size={16} /> {title}{' '}
        <span>{run.residents.length} мешканців</span>
      </div>
      <HousePreview
        run={run}
        level={run.houseLevel}
        onOpen={onOpen}
      />
      <button
        className="primary housing-open"
        onClick={onOpen}
      >
        <Home size={18} /> Квартири й обладнання{' '}
        <span>
          {run.residents.reduce((n, r) => n + residentCells(r.id).length, 0)}/
          {houseSize(run.houseLevel).width * houseSize(run.houseLevel).height}
        </span>
      </button>
      <p className="board-help">
        Натисни квартиру: обладнання встановлюється всередині неї. Сусідні
        модулі й мешканці утворюють комбінації.
      </p>
      <div className="equipment-summary">
        <span>
          Обладнання у квартирах <b>{activeEquipment(run).length}</b>
        </span>
      </div>
      <div className="stat-grid">
        <div>
          <Heart size={16} />
          <span>Міцність</span>
          <b>
            {hp === undefined ? stats.health : `${Math.ceil(hp)}/${stats.health}`}
          </b>
        </div>
        <div>
          <Crosshair size={16} />
          <span>Шкода</span>
          <b>
            {Math.round(
              stats.damage * (1 + Math.min(0.6, (run.level - 1) * 0.04)),
            )}
          </b>
        </div>
        <div>
          <Zap size={16} />
          <span>Темп</span>
          <b>{stats.rate.toFixed(1)}/с</b>
        </div>
        <div>
          <Footprints size={16} />
          <span>Швидкість</span>
          <b>{stats.speed}</b>
        </div>
        <div>
          <Shield size={16} />
          <span>Броня</span>
          <b>{stats.armor}</b>
        </div>
        <div>
          <Recycle size={16} />
          <span>Брухт</span>
          <b>{run.scrap}</b>
        </div>
      </div>
      {stats.synergies.length > 0 && (
        <div className="synergies">
          <b>
            <Zap size={15} /> ПРАЦЮЄ РАЗОМ
          </b>
          {stats.synergies.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
      )}
      {children}
      {partner}
    </aside>
  );
}

// The other player's house: its plan and what it carries, only to look at.
// The whole house opens in a window; on one screen the second player arranges
// theirs from here.
export function PartnerHouse({
  house,
  name,
  meta,
  health,
  onEdit,
}: {
  house: Run;
  name: string;
  meta: Meta;
  // The share of its health the house goes into the next fight with.
  health?: number;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const gear = activeEquipment(house).map((i) => i.id);
  const stats = statsFor(house, meta);
  const placed = house.furniture.filter((f) => f.resident && f.cell !== null);
  return (
    <div className="partner-house">
      <div className="section-kicker">
        <Home size={16} /> ДІМ: {name.toUpperCase()}{' '}
        <span>{house.residents.length} мешканців</span>
      </div>
      <button
        type="button"
        className="partner-plan"
        onClick={() => setOpen(true)}
        aria-label={`Переглянути будинок: ${name}`}
      >
        <HouseStill run={house} items={house.items} />
      </button>
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
      <p className="board-help">
        Міцність {stats.health}, шкода {Math.round(stats.damage)}, темп{' '}
        {stats.rate.toFixed(1)}/с.
        {health !== undefined &&
          ` Після події почне наступний бій з ${Math.round(health * 100)}% міцності.`}
      </p>
      <div className="partner-actions">
        <button type="button" className="secondary small" onClick={() => setOpen(true)}>
          <Eye size={15} /> Переглянути
        </button>
        {onEdit && (
          <button type="button" className="primary small" onClick={onEdit}>
            <Hammer size={15} /> Облаштувати
          </button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="game-modal house-view">
          <DialogTitle>Дім: {name}</DialogTitle>
          <DialogDescription>
            Лише перегляд. Міцність {stats.health}, шкода{' '}
            {Math.round(stats.damage)}, темп {stats.rate.toFixed(1)}/с
            {health !== undefined &&
              `, після події почне наступний бій з ${Math.round(health * 100)}% міцності`}
            .
          </DialogDescription>
          <div className="house-view-body">
            <HouseStill run={house} items={house.items} />
            <div className="house-view-lists">
              <h3>Мешканці · {house.residents.length}</h3>
              <ul>
                {house.residents.map((r) => (
                  <li key={r.id}>
                    <b>{RESIDENT_BY_ID[r.id].name}</b>{' '}
                    {RESIDENT_BY_ID[r.id].effect}
                  </li>
                ))}
              </ul>
              <h3>Обладнання · {gear.length}</h3>
              <ul>
                {gear.map((id, i) => {
                  const [gain, cost] = ITEM_BY_ID[id].desc.split(' Мінус: ');
                  return (
                    <li key={id + i}>
                      <b>{ITEM_BY_ID[id].name}.</b> {gain}
                      {cost && <span className="item-minus"> Мінус: {cost}</span>}
                    </li>
                  );
                })}
                {!gear.length && <li>Модулів у квартирах нема.</li>}
              </ul>
              {house.backpack.length > 0 && (
                <p className="board-help">
                  У запасі ще {house.backpack.length} модулів.
                </p>
              )}
              <h3>Меблі · {placed.length}</h3>
              <ul>
                {placed.map((f) => (
                  <li key={f.uid}>
                    <b>{FURNITURE_BY_ID[f.id].name}</b> (квартира{' '}
                    {RESIDENT_BY_ID[f.resident!].name}):{' '}
                    {furnitureEffect(f.id, f.resident).label}
                  </li>
                ))}
                {!placed.length && <li>Меблів у квартирах нема.</li>}
              </ul>
              {house.furniture.length > placed.length && (
                <p className="board-help">
                  У запасі ще {house.furniture.length - placed.length} меблів.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
