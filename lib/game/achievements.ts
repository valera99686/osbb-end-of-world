import { RESIDENTS } from './residents';
import { RESEARCH } from './data';
import type { Meta, Run } from './model';
import { CLUES } from './story';

export interface Achievement {
  id: string;
  title: string;
  text: string;
  icon: string;
  // Shown as «???» in the list until it is found, with `hint` instead of the text.
  secret?: boolean;
  hint?: string;
}
// `won` marks the final victory of a raid; mid-run checks leave it false.
type Check = (meta: Meta, run: Run | null, won: boolean) => boolean;
type Counter =
  | 'runs'
  | 'kills'
  | 'totalBosses'
  | 'totalMinibosses'
  | 'totalRescues'
  | 'wins'
  | 'deaths'
  | 'playTime'
  | 'totalElites'
  | 'bestHeat'
  | 'endlessBest'
  | 'coopWins'
  | 'coopRevives';
const count = (meta: Meta, key: Counter) => {
  const value = meta[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};
const lifetime =
  (key: Counter, target: number): Check =>
  (meta) =>
    count(meta, key) >= target;
// How many different heads of ОСББ have won a raid.
const headsWon = (meta: Meta) =>
  Object.values(meta.winsByCharacter ?? {}).filter((n) => n > 0).length;
const finalWin = (run: Run | null, won: boolean): run is Run =>
  !!run && won && run.chapter >= 2 && run.mode !== 'endless';
const combo =
  (target: number): Check =>
  (meta, run) =>
    Math.max(meta.bestCombo ?? 0, run?.bestCombo ?? 0) >= target;
const loops =
  (target: number): Check =>
  (meta, run) =>
    Math.max(
      count(meta, 'endlessBest'),
      run?.mode === 'endless' ? run.loop : 0,
    ) >= target;
// Справа 04:17: evidence found and endings seen live in the profile.
const clues =
  (target: number): Check =>
  (meta) =>
    (meta.clues ?? []).length >= target;
const ending =
  (id: 'a' | 'b' | 'c'): Check =>
  (meta) =>
    (meta.endings ?? []).includes(id);
const DEFINITIONS: (Achievement & { check: Check })[] = [
  {
    id: 'first_run',
    title: 'Перший вихід',
    text: 'Заверши першу експедицію.',
    icon: 'Footprints',
    check: lifetime('runs', 1),
  },
  {
    id: 'runs_10',
    title: 'Старожил',
    text: 'Заверши 10 експедицій.',
    icon: 'Repeat',
    check: lifetime('runs', 10),
  },
  {
    id: 'runs_30',
    title: 'Голова ОСББ',
    text: 'Заверши 30 експедицій.',
    icon: 'Crown',
    check: lifetime('runs', 30),
  },
  {
    id: 'kills_100',
    title: 'Прибирання під’їзду',
    text: 'Знищ 100 ворогів за всі експедиції.',
    icon: 'Crosshair',
    check: lifetime('kills', 100),
  },
  {
    id: 'kills_1000',
    title: 'Санітар району',
    text: 'Знищ 1000 ворогів за всі експедиції.',
    icon: 'Target',
    check: lifetime('kills', 1000),
  },
  {
    id: 'kills_5000',
    title: 'Гроза пустки',
    text: 'Знищ 5000 ворогів за всі експедиції.',
    icon: 'Skull',
    check: lifetime('kills', 5000),
  },
  {
    id: 'first_boss',
    title: 'Перший бос',
    text: 'Перемож боса локації.',
    icon: 'Swords',
    check: lifetime('totalBosses', 1),
  },
  {
    id: 'bosses_15',
    title: 'Мисливець на босів',
    text: 'Перемож 15 босів локацій.',
    icon: 'Sword',
    check: lifetime('totalBosses', 15),
  },
  {
    id: 'minibosses_10',
    title: 'Розбірки на сходах',
    text: 'Перемож 10 мінібосів.',
    icon: 'Hammer',
    check: lifetime('totalMinibosses', 10),
  },
  {
    id: 'rescues_10',
    title: 'Добрий сусід',
    text: 'Урятуй 10 мешканців за всі експедиції.',
    icon: 'HeartHandshake',
    check: lifetime('totalRescues', 10),
  },
  {
    id: 'first_win',
    title: 'Кінець світу скасовано',
    text: 'Заверши повний рейд перемогою.',
    icon: 'Trophy',
    check: lifetime('wins', 1),
  },
  {
    id: 'wins_5',
    title: 'Легенда будинку',
    text: 'Заверши 5 повних рейдів перемогою.',
    icon: 'Medal',
    check: lifetime('wins', 5),
  },
  {
    id: 'deaths_10',
    title: 'Досвід через біль',
    text: 'Програй 10 експедицій — і не здавайся.',
    icon: 'Ghost',
    check: lifetime('deaths', 10),
  },
  {
    id: 'playtime_1h',
    title: 'Ще одна спроба',
    text: 'Проведи в рейдах годину.',
    icon: 'Clock',
    check: lifetime('playTime', 3600),
  },
  {
    id: 'playtime_10h',
    title: 'Живу в машині',
    text: 'Проведи в рейдах 10 годин.',
    icon: 'Hourglass',
    check: lifetime('playTime', 36000),
  },
  {
    id: 'blueprints_5',
    title: 'Конструкторське бюро',
    text: 'Придбай 5 креслень у майстерні.',
    icon: 'BookOpen',
    check: (meta) => (meta.blueprints?.length ?? 0) >= 5,
  },
  {
    id: 'research_max',
    title: 'Науковий підхід',
    text: 'Відкрий у майстерні всі модифікатори рейду.',
    icon: 'FlaskConical',
    check: (meta) => RESEARCH.every((r) => (meta.research?.[r.id] ?? 0) >= 1),
  },
  {
    id: 'elites_50',
    title: 'Збирач трофеїв',
    text: 'Знищ 50 посилених ворогів за всі експедиції.',
    icon: 'Gem',
    check: lifetime('totalElites', 50),
  },
  {
    id: 'no_repair_win',
    title: 'Без ремонту',
    text: 'Виграй рейд, жодного разу не полагодивши машину в крамниці.',
    icon: 'Wrench',
    check: (_, run, won) => finalWin(run, won) && (run.repairs ?? 0) === 0,
  },
  {
    id: 'boss_no_hit',
    title: 'Ані подряпини',
    text: 'Перемож боса або мінібоса, не отримавши шкоди.',
    icon: 'ShieldCheck',
    check: (_, run) => (run?.bossNoHit ?? 0) > 0,
  },
  {
    id: 'battle_100',
    title: 'Сотня за бій',
    text: 'Знищ 100 ворогів за один бій.',
    icon: 'Bomb',
    check: (_, run) => (run?.maxBattleKills ?? 0) >= 100,
  },
  {
    id: 'combo_25',
    title: 'На кураже',
    text: 'Набери комбо з 25 знищень.',
    icon: 'Zap',
    check: combo(25),
  },
  {
    id: 'combo_50',
    title: 'Ланцюгова реакція',
    text: 'Набери комбо з 50 знищень.',
    icon: 'Sparkles',
    check: combo(50),
  },
  {
    id: 'affixed_10',
    title: 'Колекція аномалій',
    text: 'Знищ 10 посилених ворогів за одну експедицію.',
    icon: 'Star',
    check: (_, run) => (run?.elitesKilled ?? 0) >= 10,
  },
  {
    id: 'events_3',
    title: 'Нічого особливого',
    text: 'Пройди 3 бойові події за одну експедицію.',
    icon: 'Siren',
    check: (_, run) => (run?.eventsCompleted ?? 0) >= 3,
  },
  {
    id: 'full_house',
    title: 'Повний будинок',
    text: 'Урятуй усіх мешканців за одну експедицію.',
    icon: 'Users',
    check: (_, run) =>
      !!run && RESIDENTS.every((r) => run.rescued.includes(r.id)),
  },
  {
    id: 'daily_1',
    title: 'Щоденна зміна',
    text: 'Заверши щоденний рейд.',
    icon: 'CalendarCheck',
    check: (meta) => Object.keys(meta.dailyBest ?? {}).length >= 1,
  },
  {
    id: 'daily_7',
    title: 'Графік чергувань',
    text: 'Заверши щоденні рейди в 7 різних днів.',
    icon: 'CalendarDays',
    check: (meta) => Object.keys(meta.dailyBest ?? {}).length >= 7,
  },
  {
    id: 'heat_1',
    title: 'Підкрутили загрозу',
    text: 'Виграй рейд на загрозі 1 або вище.',
    icon: 'Thermometer',
    check: lifetime('bestHeat', 1),
  },
  {
    id: 'heat_5',
    title: 'Гаряча точка',
    text: 'Виграй рейд на загрозі 5 або вище.',
    icon: 'Flame',
    check: lifetime('bestHeat', 5),
  },
  {
    id: 'heat_10',
    title: 'Справжній кінець світу',
    text: 'Виграй рейд на загрозі 10.',
    icon: 'ThermometerSun',
    check: lifetime('bestHeat', 10),
  },
  {
    id: 'endless_1',
    title: 'Друге коло',
    text: 'У нескінченному режимі пройди всі три локації й почни нове коло.',
    icon: 'Infinity',
    check: loops(1),
  },
  {
    id: 'endless_3',
    title: 'Вічний рейд',
    text: 'У нескінченному режимі дійди до третього нового кола.',
    icon: 'Orbit',
    check: loops(3),
  },
  {
    id: 'three_heroes',
    title: 'Команда мрії',
    text: 'Виграй рейди трьома різними героями.',
    icon: 'Award',
    check: (meta) => headsWon(meta) >= 3,
  },
  {
    id: 'five_heroes',
    title: 'Збірна двору',
    text: 'Виграй рейди п’ятьма різними героями.',
    icon: 'Award',
    check: (meta) => headsWon(meta) >= 5,
  },
  {
    id: 'all_heroes',
    title: 'Увесь будинок за кермом',
    text: 'Виграй рейди всіма дев’ятьма головами ОСББ.',
    icon: 'Crown',
    check: (meta) => headsWon(meta) >= 9,
  },
  {
    id: 'clues_3',
    title: 'Слідчий з другого поверху',
    text: 'Знайди 3 докази у «Справі 04:17».',
    icon: 'Search',
    check: clues(3),
  },
  {
    id: 'clues_8',
    title: 'Детектив будинку',
    text: 'Знайди 8 доказів у «Справі 04:17».',
    icon: 'FolderOpen',
    check: clues(8),
  },
  {
    id: 'clues_all',
    title: 'Справу закрито',
    text: 'Збери всі докази «Справи 04:17».',
    icon: 'BookOpen',
    check: clues(CLUES.length),
  },
  {
    id: 'ending_first',
    title: 'Перший світанок',
    text: 'Побачи будь-яку кінцівку.',
    icon: 'Sunrise',
    check: (meta) => (meta.endings ?? []).length >= 1,
  },
  {
    id: 'ending_b',
    title: 'Кворум є',
    text: 'Побачи кінцівку «Позачергові збори».',
    icon: 'Vote',
    check: ending('b'),
  },
  {
    id: 'ending_c',
    title: 'Хто веде будинок',
    text: 'Побачи кінцівку «04:16».',
    icon: 'Moon',
    check: ending('c'),
  },
  {
    id: 'endings_all',
    title: 'Усі три світанки',
    text: 'Побачи всі три кінцівки.',
    icon: 'Trophy',
    check: (meta) =>
      (['a', 'b', 'c'] as const).every((id) =>
        (meta.endings ?? []).includes(id),
      ),
  },
  {
    id: 'duo',
    title: 'Двоє в одному будинку',
    text: 'Пройди експедицію вдвох: один веде будинок, другий прикриває двір.',
    icon: 'Users',
    check: lifetime('coopWins', 1),
  },
  {
    id: 'pull_up',
    title: 'Піднімайся, сусіде',
    text: 'Підніми напарника на ноги в кооперативному рейді п’ять разів.',
    icon: 'HeartHandshake',
    check: lifetime('coopRevives', 5),
  },
  // Hidden ones: found by a code or by a habit, not by a goal.
  {
    id: 'konami',
    title: 'Тридцять життів',
    text: 'Старий код із приставок спрацював. Життів він не додає, але досягнення справжнє.',
    hint: 'Старий код, який знає кожен, хто грав на приставках. Вводити в Притулку з клавіатури; з телефона допоможуть швидкі дотики по назві.',
    icon: 'Sparkles',
    secret: true,
    check: (meta) => (meta.secrets ?? []).includes('konami'),
  },
  {
    id: 'night_raid',
    title: 'Порушник тиші',
    text: 'Рейд серед ночі. Марта вже пише скаргу.',
    hint: 'У будинку є години тиші. Марта стежить, хто їх порушує.',
    icon: 'Moon',
    secret: true,
    check: (meta) => (meta.secrets ?? []).includes('night'),
  },
];
export const ACHIEVEMENTS: Achievement[] = DEFINITIONS.map(
  ({ id, title, text, icon, secret, hint }) =>
    secret
      ? { id, title, text, icon, secret, hint }
      : { id, title, text, icon },
);
export const ACHIEVEMENT_BY_ID: Record<string, Achievement> =
  Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export function newAchievements(
  meta: Meta,
  run: Run | null,
  won = false,
): string[] {
  const owned = new Set(meta.achievements ?? []);
  return DEFINITIONS.filter(
    (a) => !owned.has(a.id) && a.check(meta, run, won),
  ).map((a) => a.id);
}
export function applyAchievements(
  meta: Meta,
  run: Run | null,
  won = false,
): { meta: Meta; unlocked: string[] } {
  const unlocked = newAchievements(meta, run, won);
  return {
    meta: unlocked.length
      ? { ...meta, achievements: [...(meta.achievements ?? []), ...unlocked] }
      : meta,
    unlocked,
  };
}
