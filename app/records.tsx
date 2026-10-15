import { useState } from 'react';
import {
  ArrowLeft,
  Award,
  Bomb,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  Clock,
  Crosshair,
  Crown,
  Flame,
  FlaskConical,
  FolderOpen,
  Footprints,
  Gem,
  Ghost,
  Hammer,
  HeartHandshake,
  Hourglass,
  Infinity as InfinityIcon,
  Lock,
  Medal,
  Moon,
  Orbit,
  Repeat,
  Search,
  ShieldCheck,
  Siren,
  Skull,
  Sparkles,
  Star,
  Sunrise,
  Sword,
  Swords,
  Target,
  Thermometer,
  ThermometerSun,
  Trophy,
  Users,
  Vote,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { ACHIEVEMENTS } from '@/lib/game/achievements';
import { CHARACTERS } from '@/lib/game/data';
import { dateKey } from '@/lib/game/modes';
import type { Meta } from '@/lib/game/model';
import { Glyph } from './glyph';

// Achievement definitions name their icon; only these are bundled.
const ICONS: Record<string, LucideIcon> = {
  Award,
  Bomb,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Clock,
  Crosshair,
  Crown,
  Flame,
  FlaskConical,
  FolderOpen,
  Footprints,
  Gem,
  Ghost,
  Hammer,
  HeartHandshake,
  Hourglass,
  Infinity: InfinityIcon,
  Medal,
  Moon,
  Orbit,
  Repeat,
  Search,
  ShieldCheck,
  Siren,
  Skull,
  Sparkles,
  Star,
  Sunrise,
  Sword,
  Swords,
  Target,
  Thermometer,
  ThermometerSun,
  Trophy,
  Users,
  Vote,
  Wrench,
  Zap,
};
export function AchievementIcon({
  name,
  size = 22,
}: {
  name: string;
  size?: number;
}) {
  const Icon = ICONS[name] ?? Award;
  return <Icon size={size} />;
}
export function ownedAchievements(meta: Meta) {
  const owned = new Set(meta.achievements ?? []);
  return ACHIEVEMENTS.filter((a) => owned.has(a.id)).length;
}
// Seconds as h:mm; battles are the only clock the game keeps.
export function playTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}
export function totalWins(meta: Meta) {
  const byHero = Object.values(meta.winsByCharacter ?? {}).reduce(
    (sum, n) => sum + (Number.isFinite(n) ? n : 0),
    0,
  );
  return Math.max(meta.wins, byHero);
}
export function StatsPage({
  meta,
  onBack,
}: {
  meta: Meta;
  onBack: () => void;
}) {
  const today = meta.dailyBest?.[dateKey(new Date())];
  const rows: [LucideIcon, string, string | number][] = [
    [Repeat, 'Рейдів', meta.runs],
    [Crown, 'Перемог', totalWins(meta)],
    [Ghost, 'Поразок', meta.deaths ?? 0],
    [Skull, 'Ворогів знищено', meta.kills],
    [Target, 'Рекорд за рейд', meta.best],
    [Swords, 'Босів переможено', meta.totalBosses],
    [ShieldCheck, 'Мінібосів', meta.totalMinibosses],
    [HeartHandshake, 'Урятовано сусідів', meta.totalRescues],
    [Footprints, 'Ривків', meta.dashes],
    [Sparkles, 'Посилених ворогів', meta.totalElites ?? 0],
    [Zap, 'Найкраще комбо', meta.bestCombo ?? 0],
    [Flame, 'Найвища загроза', meta.bestHeat ?? 0],
    [InfinityIcon, 'Нескінченна: кіл', meta.endlessBest ?? 0],
    [Clock, 'Час у боях', playTime(meta.playTime ?? 0)],
    [CalendarDays, 'Денний забіг сьогодні', today ?? '—'],
    [Award, 'Досягнень', `${ownedAchievements(meta)}/${ACHIEVEMENTS.length}`],
  ];
  return (
    <section className="collection-page records-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} /> Головне меню
      </button>
      <p className="eyebrow">ЖУРНАЛ ГОЛОВИ ОСББ</p>
      <div className="collection-title">
        <div>
          <h2>Статистика</h2>
          <p className="lead">
            Усе, що будинок №17 пережив між кінцем світу й світанком. Рахунок
            ведеться лише на цьому пристрої.
          </p>
        </div>
        <ChartColumn size={42} className="muted" />
      </div>
      <div className="stats-grid">
        {rows.map(([Icon, label, value]) => (
          <div className="stat-tile" key={label}>
            <Icon size={18} />
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <h3 className="records-heading">Перемоги за героями</h3>
      <div className="stats-grid heroes">
        {CHARACTERS.map((c) => (
          <div
            className={`stat-tile ${c.win > meta.wins ? 'locked' : ''}`}
            key={c.id}
          >
            {c.win > meta.wins ? (
              <Lock size={18} />
            ) : (
              <Glyph name={c.icon} size={18} />
            )}
            <span>
              {c.name} · {c.job}
            </span>
            <b>{meta.winsByCharacter?.[c.id] ?? 0}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
export function AchievementsPage({
  meta,
  onBack,
}: {
  meta: Meta;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const owned = new Set(meta.achievements ?? []);
  const count = ownedAchievements(meta);
  return (
    <section className="collection-page records-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} /> Головне меню
      </button>
      <p className="eyebrow">ЗАСЛУГИ ПЕРЕД БУДИНКОМ</p>
      <div className="collection-title">
        <div>
          <h2>Досягнення</h2>
          <p className="lead">
            Віхи рейдів, героїзм у боях і дивні рекорди. Кожне відкривається
            назавжди.
          </p>
        </div>
        <span className="achievement-count">
          <Trophy size={22} />
          <b>
            {count} / {ACHIEVEMENTS.length}
          </b>
        </span>
      </div>
      <div className="codex-controls">
        <div className="filter-buttons">
          {[
            ['all', 'Усі'],
            ['open', 'Відкриті'],
            ['locked', 'Закриті'],
          ].map(([id, label]) => (
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
      <div className="achievement-grid">
        {ACHIEVEMENTS.filter(
          (a) => filter === 'all' || (filter === 'open') === owned.has(a.id),
        ).map((a) => {
          const done = owned.has(a.id);
          return (
            <article
              key={a.id}
              className={`achievement-card ${done ? 'done' : 'locked'}`}
            >
              <span className="achievement-icon">
                <AchievementIcon name={a.icon} />
                {!done && (
                  <span className="achievement-lock">
                    <Lock size={11} />
                  </span>
                )}
              </span>
              <div>
                <h3>{a.title}</h3>
                <p>{a.text}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
