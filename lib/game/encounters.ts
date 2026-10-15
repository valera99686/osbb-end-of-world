import type { BossPattern } from './bosses';
import type { AffixId } from './modes';

/** Three stages of one expedition. The selected variant must be saved once,
 * not rerolled when opening the map or reloading a battle. */
export const LOCATIONS = [
  {
    id: 'rust',
    name: 'Іржавий квартал',
    color: '#e7aa70',
    desc: 'Покинуті майстерні й службові машини. Знайди вихід до теплиць.',
    objective: 'Зупини охоронця кварталу та відкрий шлюз до Зелених куполів.',
    enemyTypes: [0, 1, 2, 9, 10, 11],
    bossVariants: [0, 1, 2],
    background: ['#282c32', '#141e26'],
  },
  {
    id: 'green',
    name: 'Зелені куполи',
    color: '#9dcd88',
    desc: 'Автоматичні теплиці вважають людей шкідниками. Коріння перекриває шлях до центру.',
    objective:
      'Вимкни вартового теплиць і дістань ключ доступу до Серця мережі.',
    enemyTypes: [3, 4, 5, 12, 13, 14],
    bossVariants: [0, 1, 2],
    background: ['#233630', '#11231e'],
  },
  {
    id: 'core',
    name: 'Серце мережі',
    color: '#93cfee',
    desc: 'Центральна система відновлює аварію о 04:17. Її останні захисники пам’ятають попередні спроби.',
    objective: 'Переможи захисника ядра та вимкни протокол повторення аварії.',
    enemyTypes: [6, 7, 8, 15, 16, 17],
    bossVariants: [0, 1, 2],
    background: ['#222d43', '#111b2e'],
  },
] as const;

export type EnemyBehavior =
  | 'chase'
  | 'charge'
  | 'fan'
  | 'roots'
  | 'spit'
  | 'brood'
  | 'snipe'
  | 'shield'
  | 'pulse'
  | 'mine'
  | 'weld'
  | 'repair'
  | 'strafe'
  | 'volley'
  | 'burst'
  | 'blink'
  | 'cross'
  | 'jam';

export interface CampaignEnemyDefinition {
  type: number;
  location: number;
  name: string;
  guide: string;
  behavior: EnemyBehavior;
  artIndex: number;
  color: string;
  /** Base values already include location progression; only apply a small
   * local-node/elite multiplier, never the old chapter multiplier again. */
  health: number;
  speed: number;
  radius: number;
  contactDamage: number;
  damage: number;
  cooldown: number;
  windup: number;
  projectileSpeed: number;
  range: number;
  /** Presentation and behavior modifiers, not extra universal scaling. */
  scale: number;
  chargeMultiplier?: number;
  chargeDuration?: number;
  frontalDamageMultiplier?: number;
  summonType?: number;
  deathSummonCount?: number;
}

const ORIGINAL_ENEMIES: readonly CampaignEnemyDefinition[] = [
  {
    type: 0,
    location: 0,
    name: 'Брухтозбирач',
    behavior: 'chase',
    artIndex: 0,
    color: '#dda071',
    // Fodder that arrives in packs: two shots from the starting gun, fast
    // enough to reach a house that stands still, slower than a moving one
    // (the house walks at ~177 px/s).
    health: 36,
    speed: 112,
    radius: 13,
    contactDamage: 8,
    damage: 8,
    cooldown: 2.5,
    windup: 0.8,
    projectileSpeed: 0,
    range: 34,
    scale: 1,
    guide:
      'Налітає зграєю й кусає будинок, що стоїть на місці. Рухайся, щоб зграя не оточила тебе.',
  },
  {
    type: 1,
    location: 0,
    name: 'Гончак патруля',
    behavior: 'charge',
    artIndex: 1,
    color: '#84bdd7',
    health: 30,
    speed: 74,
    radius: 12,
    contactDamage: 11,
    damage: 11,
    cooldown: 3.6,
    windup: 0.9,
    projectileSpeed: 0,
    range: 290,
    scale: 0.95,
    chargeMultiplier: 3.1,
    chargeDuration: 0.65,
    guide:
      'Завмирає й веде прицілом за будинком, а перед ривком фіксує напрямок. Відійди вбік, щойно лінія застигне.',
  },
  {
    type: 2,
    location: 0,
    name: 'Дворовий стрілець',
    behavior: 'fan',
    artIndex: 4,
    color: '#83cbd3',
    health: 34,
    speed: 44,
    radius: 14,
    contactDamage: 7,
    damage: 7,
    cooldown: 2.9,
    windup: 0.85,
    projectileSpeed: 185,
    range: 310,
    scale: 1,
    guide:
      'Тримається на відстані та стріляє трьома снарядами. Частина стрільців цілить на випередження: хрестик показує, куди піде залп.',
  },
  {
    type: 3,
    location: 1,
    name: 'Кореневий садівник',
    behavior: 'roots',
    artIndex: 3,
    color: '#a2d57f',
    health: 49,
    speed: 43,
    radius: 15,
    contactDamage: 10,
    damage: 10,
    cooldown: 3.5,
    windup: 1.1,
    projectileSpeed: 0,
    range: 340,
    scale: 1.08,
    guide:
      'Вирощує коріння під будинком або на його шляху: пунктирне коло показує місце. Зміни напрямок до спалаху.',
  },
  {
    type: 4,
    location: 1,
    name: 'Кислотний обприскувач',
    behavior: 'spit',
    artIndex: 5,
    color: '#b9cb79',
    health: 43,
    speed: 48,
    radius: 14,
    contactDamage: 9,
    damage: 9,
    cooldown: 2.9,
    windup: 0.9,
    projectileSpeed: 175,
    range: 290,
    scale: 1,
    guide:
      'Випускає широкий кислотний залп. Рухайся поперек стрільби та підходь між залпами.',
  },
  {
    type: 5,
    location: 1,
    name: 'Розсадник дронів',
    behavior: 'brood',
    artIndex: 2,
    color: '#b8b681',
    health: 92,
    speed: 30,
    radius: 21,
    contactDamage: 14,
    damage: 10,
    cooldown: 5,
    windup: 1.15,
    projectileSpeed: 0,
    range: 0,
    scale: 1.12,
    summonType: 3,
    deathSummonCount: 2,
    guide:
      'Після знищення випускає двох кореневих садівників. Залишай простір для відступу.',
  },
  {
    type: 6,
    location: 2,
    name: 'Променевий наглядач',
    behavior: 'snipe',
    artIndex: 4,
    color: '#8ecffa',
    health: 69,
    speed: 39,
    radius: 15,
    contactDamage: 10,
    damage: 15,
    cooldown: 3.1,
    windup: 1.05,
    projectileSpeed: 0,
    range: 430,
    scale: 1.1,
    guide:
      'Креслить тонку лінію лазера. Перетни її до спалаху, а не тікай уздовж неї.',
  },
  {
    type: 7,
    location: 2,
    name: 'Броньований ревізор',
    behavior: 'shield',
    artIndex: 2,
    color: '#9ba7e2',
    health: 117,
    speed: 43,
    radius: 22,
    contactDamage: 17,
    damage: 13,
    cooldown: 3.8,
    windup: 1,
    projectileSpeed: 0,
    range: 38,
    scale: 1.15,
    frontalDamageMultiplier: 0.55,
    guide:
      'Лобовий щит поглинає частину шкоди. Обходь збоку або використовуй вибухи та хвилю.',
  },
  {
    type: 8,
    location: 2,
    name: 'Імпульсний глушник',
    behavior: 'pulse',
    artIndex: 5,
    color: '#db9dcc',
    health: 73,
    speed: 72,
    radius: 16,
    contactDamage: 12,
    damage: 14,
    cooldown: 3.3,
    windup: 1.05,
    projectileSpeed: 0,
    range: 150,
    scale: 1.1,
    guide:
      'Наближається й заряджає імпульс навколо себе. Вийди з кола або використай ривок.',
  },
];

export const ENEMY_DEFS: readonly CampaignEnemyDefinition[] = [
  ...ORIGINAL_ENEMIES,
  {
    ...ORIGINAL_ENEMIES[2],
    type: 9,
    name: 'Мінувальник',
    behavior: 'mine',
    health: 39,
    speed: 34,
    radius: 16,
    cooldown: 3.9,
    windup: 1.1,
    range: 270,
    damage: 9,
    color: '#d6b566',
    artIndex: 2,
    scale: 0.85,
    guide:
      'Кидає міну під будинок або на його шлях: пунктирне коло показує місце. Зміни напрямок, поки міна не спалахнула.',
  },
  {
    ...ORIGINAL_ENEMIES[2],
    type: 10,
    name: 'Зварювальник',
    behavior: 'weld',
    health: 33,
    speed: 86,
    radius: 13,
    cooldown: 3,
    windup: 1,
    range: 230,
    damage: 12,
    color: '#ffc484',
    artIndex: 0,
    scale: 1.05,
    guide:
      'Підходить близько й ріже короткою смугою полум’я. Відійди вбік, коли засвітиться пальник.',
  },
  {
    ...ORIGINAL_ENEMIES[2],
    type: 11,
    name: 'Ремонтний дрон',
    behavior: 'repair',
    health: 28,
    speed: 46,
    radius: 12,
    cooldown: 5.5,
    windup: 1,
    range: 380,
    damage: 0,
    contactDamage: 5,
    color: '#9cdbd0',
    artIndex: 4,
    scale: 0.8,
    guide:
      'Латає пошкоджених звичайних ворогів поруч. Знищ його першим, щоб ремонт не затягував бій.',
  },
  {
    ...ORIGINAL_ENEMIES[4],
    type: 12,
    name: 'Пилковий метелик',
    behavior: 'strafe',
    health: 41,
    speed: 71,
    radius: 12,
    cooldown: 3.4,
    windup: 0.9,
    range: 310,
    damage: 8,
    projectileSpeed: 155,
    color: '#d8d999',
    artIndex: 4,
    scale: 0.95,
    guide:
      'Кружляє збоку від будинку й випускає парні снаряди. Міняй напрямок, щоб не потрапити в оточення.',
  },
  {
    ...ORIGINAL_ENEMIES[4],
    type: 13,
    name: 'Насіннєвий стрілець',
    behavior: 'volley',
    health: 60,
    speed: 26,
    radius: 17,
    cooldown: 4.3,
    windup: 1.2,
    range: 430,
    damage: 10,
    projectileSpeed: 165,
    color: '#92c899',
    artIndex: 3,
    scale: 1.15,
    guide:
      'Стріляє широким віялом із п’яти насінин. Між снарядами залишаються проходи.',
  },
  {
    ...ORIGINAL_ENEMIES[3],
    type: 14,
    name: 'Колючий повзун',
    behavior: 'burst',
    health: 62,
    speed: 88,
    radius: 16,
    cooldown: 4,
    range: 0,
    damage: 12,
    contactDamage: 16,
    color: '#bcc57c',
    artIndex: 1,
    scale: 1,
    guide:
      'Наздоганяє будинок. Після загибелі розкидає колючки: відійди від позначеного кола до спалаху.',
  },
  {
    ...ORIGINAL_ENEMIES[6],
    type: 15,
    name: 'Фазовий дрон',
    behavior: 'blink',
    health: 68,
    speed: 42,
    radius: 14,
    cooldown: 5.2,
    windup: 1.2,
    range: 460,
    damage: 11,
    projectileSpeed: 180,
    color: '#acd4fa',
    artIndex: 1,
    scale: 1,
    guide:
      'Позначає точку збоку від будинку й переноситься туди. Враховуй місце появи, плануючи відступ.',
  },
  {
    ...ORIGINAL_ENEMIES[6],
    type: 16,
    name: 'Сегментатор',
    behavior: 'cross',
    health: 86,
    speed: 30,
    radius: 18,
    cooldown: 4.5,
    windup: 1.1,
    range: 420,
    damage: 12,
    color: '#9caeea',
    artIndex: 0,
    scale: 1.02,
    guide:
      'Випускає дві лазерні смуги навхрест. Виходь із розмітки по діагоналі до спалаху.',
  },
  {
    ...ORIGINAL_ENEMIES[8],
    type: 17,
    name: 'Вузол придушення',
    behavior: 'jam',
    health: 79,
    speed: 38,
    radius: 17,
    cooldown: 5.8,
    windup: 1.2,
    range: 230,
    damage: 7,
    color: '#c3a4e5',
    artIndex: 3,
    scale: 1.15,
    guide:
      'Створює поле, яке сповільнює будинок. Вийди з кола; ривок дозволяє швидко вирватися.',
  },
];

// Behaviours that attack from a distance; squads place them behind fodder.
export const RANGED_BEHAVIORS: readonly EnemyBehavior[] = [
  'fan',
  'roots',
  'spit',
  'snipe',
  'mine',
  'weld',
  'repair',
  'strafe',
  'volley',
  'blink',
  'cross',
  'jam',
];

/** Icon key for the map node; the UI maps it to a glyph. */
export type EncounterIcon =
  | 'raid'
  | 'artillery'
  | 'repair'
  | 'hounds'
  | 'swarm'
  | 'weeding'
  | 'nursery'
  | 'sweep'
  | 'shield'
  | 'jam'
  | 'audit';

/** A named squad for regular and elite fights: three waves with short
 * breathers, then a final wave around a stronger leader. The fight is won
 * when the squad is broken (see Battle.squadLeft), not when a timer runs out. */
export interface EncounterTemplate {
  id: string;
  location: number;
  name: string;
  icon: EncounterIcon;
  /** One line for the map node and the intro banner. */
  text: string;
  /** Extra copies of this type join every wave as the route goes deeper. */
  fodder: number;
  /** Exactly three regular waves; every first wave has a ranged enemy. */
  waves: readonly (readonly number[])[];
  /** Escort of the final wave; the leader comes on top of it. */
  final: readonly number[];
  leader: number;
  /** The leader's affix in elite fights and deep in a location. */
  leaderAffix: AffixId;
}

export const ENCOUNTERS: readonly EncounterTemplate[] = [
  {
    id: 'rust-raid',
    location: 0,
    name: 'Облава',
    icon: 'raid',
    text: 'Зграї брухтозбирачів налітають з різних боків, стрілець прикриває.',
    fodder: 0,
    waves: [
      [0, 0, 0, 0, 2],
      [0, 0, 0, 0, 1, 1],
      [0, 0, 0, 1, 2, 9],
    ],
    final: [0, 0, 0, 1],
    leader: 1,
    leaderAffix: 'swift',
  },
  {
    id: 'rust-artillery',
    location: 0,
    name: 'Артилерія',
    icon: 'artillery',
    text: 'Стрільці й мінувальники б’ють здалеку, поки брухтозбирачі тиснуть.',
    fodder: 0,
    waves: [
      [2, 9, 0, 0, 0],
      [9, 2, 0, 0, 0, 0],
      [2, 2, 9, 0, 0, 1],
    ],
    final: [2, 9, 0, 0],
    leader: 2,
    leaderAffix: 'armored',
  },
  {
    id: 'rust-repair',
    location: 0,
    name: 'Ремонтна бригада',
    icon: 'repair',
    text: 'Дрони латають зварювальників. Збивай дронів першими.',
    fodder: 0,
    waves: [
      [11, 10, 2, 0, 0],
      [11, 10, 10, 0, 0, 0],
      [11, 10, 10, 2, 0, 0],
    ],
    final: [11, 10, 10, 0],
    leader: 10,
    leaderAffix: 'armored',
  },
  {
    id: 'rust-hounds',
    location: 0,
    name: 'Гончаки',
    icon: 'hounds',
    text: 'Патруль гончаків бере будинок у кліщі. Відходь убік від ривка.',
    fodder: 0,
    waves: [
      [1, 1, 0, 0, 2],
      [1, 1, 0, 0, 0, 9],
      [1, 1, 1, 0, 0, 2],
    ],
    final: [1, 1, 0, 0],
    leader: 1,
    leaderAffix: 'swift',
  },
  {
    id: 'green-swarm',
    location: 1,
    name: 'Рій',
    icon: 'swarm',
    text: 'Пилкові метелики кружляють роєм, колючі повзуни проривають оборону.',
    fodder: 14,
    waves: [
      [12, 12, 14, 14],
      [12, 12, 12, 14, 4],
      [12, 12, 14, 14, 3],
    ],
    final: [12, 12, 14],
    leader: 5,
    leaderAffix: 'splitter',
  },
  {
    id: 'green-artillery',
    location: 1,
    name: 'Насіннєва артилерія',
    icon: 'artillery',
    text: 'Насіннєві стрільці засіли за стіною колючих повзунів.',
    fodder: 14,
    waves: [
      [13, 14, 14, 3],
      [13, 4, 14, 14],
      [13, 13, 4, 14, 14],
    ],
    final: [13, 14, 14],
    leader: 13,
    leaderAffix: 'armored',
  },
  {
    id: 'green-weeding',
    location: 1,
    name: 'Прополка',
    icon: 'weeding',
    text: 'Садівники вирощують коріння на твоєму шляху, обприскувачі прикривають.',
    fodder: 14,
    waves: [
      [3, 3, 14, 14],
      [3, 4, 4, 14],
      [3, 3, 4, 14, 14],
    ],
    final: [3, 4, 14],
    leader: 3,
    leaderAffix: 'medic',
  },
  {
    id: 'green-nursery',
    location: 1,
    name: 'Розсадник',
    icon: 'nursery',
    text: 'Розсадники висаджують садівників. Не дай їм розмножитися.',
    fodder: 14,
    waves: [
      [5, 14, 14, 12],
      [5, 3, 14, 12],
      [5, 5, 14, 14, 4],
    ],
    final: [5, 14],
    leader: 5,
    leaderAffix: 'splitter',
  },
  {
    id: 'core-sweep',
    location: 2,
    name: 'Зачистка',
    icon: 'sweep',
    text: 'Фазові дрони стрибають довкола, глушники тиснуть упритул.',
    fodder: 8,
    waves: [
      [15, 8, 8, 6],
      [15, 15, 8, 8],
      [15, 8, 8, 6, 16],
    ],
    final: [15, 8, 8],
    leader: 8,
    leaderAffix: 'swift',
  },
  {
    id: 'core-shieldwall',
    location: 2,
    name: 'Щитова стіна',
    icon: 'shield',
    text: 'Ревізори зі щитами прикривають наглядачів. Обходь щити збоку.',
    fodder: 8,
    waves: [
      [7, 7, 6],
      [7, 6, 6, 8],
      [7, 7, 6, 16],
    ],
    final: [7, 6, 8],
    leader: 7,
    leaderAffix: 'armored',
  },
  {
    id: 'core-jam',
    location: 2,
    name: 'Глушіння',
    icon: 'jam',
    text: 'Вузли придушення сповільнюють будинок, сегментатори ріжуть арену.',
    fodder: 8,
    waves: [
      [17, 16, 8],
      [17, 16, 8, 8],
      [17, 16, 16, 8, 6],
    ],
    final: [17, 8, 8],
    leader: 16,
    leaderAffix: 'magnetic',
  },
  {
    id: 'core-audit',
    location: 2,
    name: 'Ревізія',
    icon: 'audit',
    text: 'Сегментатори й наглядачі креслять лазери, ревізори наступають.',
    fodder: 8,
    waves: [
      [16, 6, 7],
      [16, 6, 6, 7],
      [16, 16, 6, 7, 8],
    ],
    final: [6, 7, 8],
    leader: 6,
    leaderAffix: 'medic',
  },
];

export function encountersAt(location: number): EncounterTemplate[] {
  const loc = index(location);
  return ENCOUNTERS.filter((e) => e.location === loc);
}

// Same mulberry32 as model.seeded; duplicated to keep this module a leaf.
function stream(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The squad a battle or elite node ('row:col') will field. Pure and seeded,
 * so the map can show it before the fight; the first fight of a location
 * is always its opening squad. */
export function encounterFor(
  run: { seed: number; chapter: number; loop?: number },
  nodeId: string,
): EncounterTemplate {
  const pool = encountersAt(run.chapter);
  const match = /^(\d+):(\d+)$/.exec(nodeId);
  const row = match ? Number(match[1]) : 0,
    col = match ? Number(match[2]) : 0;
  if (row === 0) return pool[0];
  const roll = stream(
    (Number.isFinite(run.seed) ? run.seed : 0) +
      index(run.chapter) * 100003 +
      row * 613 +
      col * 263 +
      (Number.isFinite(run.loop) ? (run.loop ?? 0) : 0) * 7919 +
      4409,
  )();
  return pool[Math.floor(roll * pool.length)];
}

/** Wave lists for a squad: three regular waves and the final escort (the
 * leader is added on top of the last one). Deeper steps add fodder, elite
 * squads one more shooter per wave (the first armed ranged type of the
 * opening wave); `density` is the heat spawn rate (1.15 adds ~15% bodies). */
export function encounterWaves(
  template: EncounterTemplate,
  step: number,
  elite = false,
  density = 1,
): number[][] {
  const deep = Math.floor(Math.max(0, Number.isFinite(step) ? step : 0) / 3);
  const shooter = elite
    ? template.waves[0].find((type) => {
        const behavior = ENEMY_DEFS[type]?.behavior;
        return (
          behavior !== undefined &&
          behavior !== 'repair' &&
          behavior !== 'weld' &&
          RANGED_BEHAVIORS.includes(behavior)
        );
      })
    : undefined;
  return [...template.waves, template.final].map((wave) => {
    const list = [...wave];
    const bodies =
      deep +
      (elite && shooter === undefined ? 1 : 0) +
      Math.round(list.length * Math.max(0, (density || 1) - 1));
    for (let i = 0; i < bodies; i++) list.push(template.fodder);
    if (shooter !== undefined) list.push(shooter);
    return list;
  });
}

export interface CampaignBossDefinition {
  location: number;
  variant: number;
  id: string;
  name: string;
  guide: string;
  health: number;
  speed: number;
  radius: number;
  color: string;
  artIndex: number;
  size: number;
  emblem:
    | 'chevrons'
    | 'press'
    | 'antenna'
    | 'roots'
    | 'sprinkler'
    | 'hive'
    | 'grid'
    | 'coins'
    | 'clock';
}

export const BOSS_VARIANTS: readonly CampaignBossDefinition[] = [
  {
    location: 0,
    variant: 0,
    id: 'commandant',
    name: 'Комендант брами',
    health: 3000,
    speed: 33,
    radius: 44,
    color: '#f0b369',
    artIndex: 0,
    size: 170,
    emblem: 'chevrons',
    guide:
      'Чергує віяло куль, удар опорами й прочісування смугами; у другій фазі додає артобстріл. Після удару опорами він хитається: бий, поки видно тріщини.',
  },
  {
    location: 0,
    variant: 1,
    id: 'scrap-press',
    name: 'Великий прес',
    health: 3300,
    speed: 26,
    radius: 49,
    color: '#d995a3',
    artIndex: 2,
    size: 185,
    emblem: 'press',
    guide:
      'Затискає арену двома паралельними ударами, залишаючи коридор, обвалює брухт і розкидає уламки. Після обвалу він хитається й отримує більше шкоди.',
  },
  {
    location: 0,
    variant: 2,
    id: 'signalman',
    name: 'Диспетчер патруля',
    health: 2850,
    speed: 38,
    radius: 43,
    color: '#81c8e7',
    artIndex: 3,
    size: 165,
    emblem: 'antenna',
    guide:
      'Викликає гончаків, перекриває шлях кільцем куль і кидає сигнальну ракету. У другій фазі перехоплює будинок на ходу: змінюй напрямок.',
  },
  {
    location: 1,
    variant: 0,
    id: 'root-mother',
    name: 'Мати теплиць',
    health: 5500,
    speed: 29,
    radius: 49,
    color: '#a2d883',
    artIndex: 1,
    size: 183,
    emblem: 'roots',
    guide:
      'Залишає надовго небезпечні корені, кличе садівників і б’є коренем. Після удару вона хитається; у другій фазі випускає колючий вал.',
  },
  {
    location: 1,
    variant: 1,
    id: 'irrigator',
    name: 'Верховний зрошувач',
    health: 5800,
    speed: 32,
    radius: 47,
    color: '#77d6c1',
    artIndex: 3,
    size: 180,
    emblem: 'sprinkler',
    guide:
      'Обертає кільця снарядів із проходом, розсікає арену струменями й б’є водяним молотом. У другій фазі залишає туман, що сповільнює.',
  },
  {
    location: 1,
    variant: 2,
    id: 'queen',
    name: 'Королева розсадника',
    health: 5200,
    speed: 35,
    radius: 46,
    color: '#d8bf79',
    artIndex: 1,
    size: 177,
    emblem: 'hive',
    guide:
      'Позначає ланцюжок ударів, випускає обприскувачів і падає згори. Кола спалахують по черзі: рухайся через уже згаслі ділянки.',
  },
  {
    location: 2,
    variant: 0,
    id: 'architect',
    name: 'Архітектор знесення',
    health: 10000,
    speed: 32,
    radius: 48,
    color: '#8ddbf0',
    artIndex: 3,
    size: 185,
    emblem: 'grid',
    guide:
      'Креслить лазерну сітку, діагональний розріз і б’є демонтажним ударом. У другій фазі зносить цілий квартал. Шукай вільний сектор до спалаху.',
  },
  {
    location: 2,
    variant: 1,
    id: 'collector',
    name: 'Колектор мережі',
    health: 10500,
    speed: 36,
    radius: 48,
    color: '#c6a3e9',
    artIndex: 2,
    size: 192,
    emblem: 'coins',
    guide:
      'Монетні кільця чергуються з борговими пастками й банкрутством. Пастки забирають міцність і до 5 монет; розрив у кільці веде до безпечного сектора.',
  },
  {
    location: 2,
    variant: 2,
    id: 'chronarch',
    name: 'Хранитель 04:17',
    health: 9500,
    speed: 39,
    radius: 51,
    color: '#ffc38a',
    artIndex: 4,
    size: 204,
    emblem: 'clock',
    guide:
      'Повторює удари в тих самих місцях із затримкою, викликає глушників і зупиняє час. Не повертайся одразу в коло, яке щойно згасло.',
  },
];

const index = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(2, Math.trunc(value))) : 0;

export function campaignBoss(
  location: number,
  variant: number,
): CampaignBossDefinition {
  return BOSS_VARIANTS[index(location) * 3 + index(variant)];
}

/** Called after the engine's 0.9 s boss windup. Shots are released
 * immediately; hazard ages carry their own, longer warning. No RNG is used
 * here, so replaying a saved encounter produces the same attack sequence.
 * Every boss rotates three moves (04:17 four) and adds one more in phase two;
 * `stagger` marks a heavy slam after which the boss is open for a moment.
 * The house velocity (px/s) lets interception moves aim ahead of it. */
export function campaignBossPattern(
  location: number,
  variant: number,
  phase: number,
  beat: number,
  x: number,
  y: number,
  playerX: number,
  playerY: number,
  playerVx = 0,
  playerVy = 0,
): BossPattern {
  const loc = index(location),
    boss = campaignBoss(loc, variant);
  const furious = phase > 0;
  const turn = Number.isFinite(beat) ? Math.max(0, Math.trunc(beat)) : 0;
  const aimed = Math.atan2(playerY - y, playerX - x);
  const damage = 10 + loc * 3 + (furious ? 1 : 0);
  const result: BossPattern = {
    name: '',
    cooldown: 3,
    shots: [],
    hazards: [],
    summons: [],
  };
  const clampX = (v: number) => Math.max(35, Math.min(1565, v));
  const clampY = (v: number) => Math.max(35, Math.min(965, v));
  const vx = Number.isFinite(playerVx) ? playerVx : 0,
    vy = Number.isFinite(playerVy) ? playerVy : 0;
  // Where the house will be in `t` seconds on its current course.
  const ahead = (t: number): [number, number] => {
    let dx = vx * t,
      dy = vy * t;
    const len = Math.hypot(dx, dy);
    if (len > 220) {
      dx *= 220 / len;
      dy *= 220 / len;
    }
    return [clampX(playerX + dx), clampY(playerY + dy)];
  };
  const fan = (count: number, spread: number, speed: number, angle = aimed) => {
    for (let i = 0; i < count; i++)
      result.shots.push({
        angle: angle + (i - (count - 1) / 2) * spread,
        speed,
        damage,
      });
  };
  // Missing three consecutive spokes create a passage wider than the house.
  const ring = (
    count: number,
    speed: number,
    rotation: number,
    gap: number,
  ) => {
    for (let i = 0; i < count; i++) {
      if ((i - gap + count) % count < 3) continue;
      result.shots.push({
        angle: rotation + (i * Math.PI * 2) / count,
        speed,
        damage,
      });
    }
  };
  const pool = (
    px: number,
    py: number,
    radius: number,
    delay: number,
    duration = 0.4,
    drain = 0,
    slow?: number,
  ) => {
    result.hazards.push({
      x: clampX(px),
      y: clampY(py),
      radius,
      age: -Math.max(0.8, delay),
      duration,
      damage,
      color: boss.color,
      drain,
      ...(slow ? { slow } : {}),
    });
  };
  // The heavy strike of a move: harder, and it leaves the boss staggered.
  const slam = (
    px: number,
    py: number,
    radius: number,
    delay: number,
    drain = 0,
  ) => {
    pool(px, py, radius, delay, 0.35, drain);
    result.hazards[result.hazards.length - 1].damage = damage + 4;
    result.stagger = Math.max(result.stagger ?? 0, Math.max(0.8, delay));
  };
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    delay = 1.2,
    width = 15,
    duration = 0.4,
  ) => {
    result.hazards.push({
      x: clampX(x1),
      y: clampY(y1),
      x2: clampX(x2),
      y2: clampY(y2),
      radius: width,
      age: -Math.max(0.8, delay),
      duration,
      damage,
      color: boss.color,
    });
  };
  const across = (angle: number, offset: number, delay: number) => {
    const cx = playerX - Math.sin(angle) * offset;
    const cy = playerY + Math.cos(angle) * offset;
    line(
      cx - Math.cos(angle) * 1800,
      cy - Math.sin(angle) * 1800,
      cx + Math.cos(angle) * 1800,
      cy + Math.sin(angle) * 1800,
      delay,
    );
  };
  // Pools on a circle around the house with one spot left open.
  const around = (
    count: number,
    radius: number,
    size: number,
    delay: number,
    gap: number,
  ) => {
    for (let i = 0; i < count; i++) {
      if (i === gap % count) continue;
      const a = aimed + (i * Math.PI * 2) / count;
      pool(
        playerX + Math.cos(a) * radius,
        playerY + Math.sin(a) * radius,
        size,
        delay,
      );
    }
  };
  const moves = (base: number) => turn % (base + (furious ? 1 : 0));

  switch (boss.id) {
    case 'commandant': {
      const move = moves(3);
      if (move === 0) {
        result.name = 'Загороджувальний вогонь';
        fan(furious ? 7 : 5, 0.22, furious ? 188 : 164);
      } else if (move === 1) {
        result.name = 'Прочісування';
        across(aimed + Math.PI / 2, 150, 1);
        across(aimed + Math.PI / 2, 0, 1.35);
        across(aimed + Math.PI / 2, -150, 1.7);
      } else if (move === 2) {
        result.name = furious ? 'Подвійний удар опорами' : 'Удар опорами';
        slam(playerX, playerY, 82, 1.15);
        if (furious)
          slam(
            playerX + Math.cos(aimed + 0.8) * 130,
            playerY + Math.sin(aimed + 0.8) * 130,
            73,
            1.55,
          );
      } else {
        result.name = 'Артобстріл';
        around(6, 165, 58, 1.1, turn);
        pool(playerX, playerY, 70, 2.05);
      }
      result.cooldown = furious ? 2.25 : 2.8;
      break;
    }
    case 'scrap-press': {
      const move = moves(3),
        angle = ((turn % 4) * Math.PI) / 4;
      if (move === 0) {
        result.name = 'Коридор між пресами';
        across(angle, -108, 1.35);
        across(angle, 108, 1.35);
        if (furious) pool(playerX, playerY, 60, 2.05);
      } else if (move === 1) {
        result.name = 'Обвал брухту';
        slam(playerX, playerY, furious ? 93 : 80, 1.1);
        pool(playerX + 145, playerY - 90, 61, 1.45);
        pool(playerX - 145, playerY + 90, 61, 1.75);
      } else if (move === 2) {
        result.name = 'Уламки навсібіч';
        ring(furious ? 14 : 12, furious ? 150 : 132, aimed + 0.4, turn % 12);
      } else {
        result.name = 'Подвійний прес';
        across(angle, -108, 1.4);
        across(angle, 108, 1.4);
        across(angle + Math.PI / 2, -108, 1.4);
        across(angle + Math.PI / 2, 108, 1.4);
        pool(playerX, playerY, 64, 2.6);
      }
      result.cooldown = furious ? 2.65 : 3.2;
      break;
    }
    case 'signalman': {
      const move = moves(3);
      if (move === 0) {
        result.name = 'Виклик патруля';
        result.summons = furious ? [1, 1, 2] : [1, 1];
        fan(3, 0.36, 148);
      } else if (move === 1) {
        result.name = 'Кільце оточення';
        ring(furious ? 14 : 11, furious ? 146 : 126, aimed - 0.57, turn % 3);
      } else if (move === 2) {
        result.name = 'Сигнальна ракета';
        slam(playerX, playerY, 90, 1.2);
        for (let i = 0; i < 4; i++) {
          const a = aimed + Math.PI / 4 + (i * Math.PI) / 2;
          pool(
            playerX + Math.cos(a) * 150,
            playerY + Math.sin(a) * 150,
            52,
            1.55,
          );
        }
      } else {
        result.name = 'Перехоплення';
        for (let i = 0; i < 3; i++) {
          const [px, py] = ahead(0.7 + i * 0.55);
          pool(px, py, 58, 1 + i * 0.3);
        }
        const [tx, ty] = ahead(0.9);
        fan(5, 0.2, 170, Math.atan2(ty - y, tx - x));
      }
      result.cooldown = furious ? 2.5 : 3.05;
      break;
    }
    case 'root-mother': {
      const move = moves(3);
      if (move < 2) {
        result.name = move === 1 ? 'Варта коріння' : 'Заростання';
        const count = furious ? 4 : 3;
        for (let i = 0; i < count; i++) {
          const a = turn * 0.85 + i * 2.4;
          pool(
            playerX + (i ? Math.cos(a) * 150 : 0),
            playerY + (i ? Math.sin(a) * 150 : 0),
            56,
            1.2 + i * 0.18,
            2.35,
          );
        }
        if (move === 1) result.summons = furious ? [3, 3, 4] : [3, 3];
      } else if (move === 2) {
        result.name = 'Удар коренем';
        line(x, y, x + Math.cos(aimed) * 700, y + Math.sin(aimed) * 700, 1, 20);
        slam(playerX, playerY, 92, 1.3);
      } else {
        result.name = 'Колючий вал';
        ring(18, 150, turn * 0.5, turn % 18);
        const [px, py] = ahead(0.8);
        pool(px, py, 56, 1.1, 2);
      }
      result.cooldown = furious ? 3.2 : 3.85;
      break;
    }
    case 'irrigator': {
      const move = moves(3);
      if (move === 0) {
        result.name = 'Обертовий полив';
        ring(furious ? 17 : 14, furious ? 164 : 143, turn * 0.43, turn % 4);
      } else if (move === 1) {
        result.name = 'Перехресні струмені';
        across(turn * 0.4, 0, 1.3);
        if (furious) across(turn * 0.4 + Math.PI / 2, 0, 1.8);
      } else if (move === 2) {
        result.name = 'Водяний молот';
        slam(playerX, playerY, 95, 1.2);
        ring(10, 118, aimed, turn % 10);
      } else {
        result.name = 'Туманний шлейф';
        for (let i = 0; i < 3; i++) {
          const [px, py] = ahead(0.5 + i * 0.6);
          pool(px, py, 70, 0.9 + i * 0.2, 2.6, 0, 0.55);
        }
        across(aimed, 0, 1.5);
      }
      result.cooldown = furious ? 2.2 : 2.75;
      break;
    }
    case 'queen': {
      const move = moves(3);
      if (move === 0) {
        result.name = 'Ланцюг насіннєвих зарядів';
        for (let i = 0; i < (furious ? 5 : 4); i++) {
          const offset = (i - 1.5) * 108;
          pool(
            playerX + Math.cos(aimed + Math.PI / 2) * offset,
            playerY + Math.sin(aimed + Math.PI / 2) * offset,
            52,
            1 + i * 0.32,
            0.3,
          );
        }
      } else if (move === 1) {
        result.name = 'Виліт обприскувачів';
        result.summons = furious ? [4, 4, 3] : [4, 4];
        fan(5, 0.29, 157);
      } else if (move === 2) {
        result.name = 'Падіння королеви';
        slam(playerX, playerY, 100, 1.25);
        fan(3, 0.4, 150);
      } else {
        result.name = 'Насіннєва злива';
        ring(15, 140, turn * 0.37, turn % 15);
        ring(15, 105, turn * 0.37 + 0.21, (turn + 7) % 15);
      }
      result.cooldown = furious ? 2.75 : 3.35;
      break;
    }
    case 'architect': {
      const move = moves(3),
        diagonal = turn % 4 === 1 ? Math.PI / 4 : -Math.PI / 4;
      if (move === 0) {
        result.name = 'Сітка знесення';
        line(35, playerY, 1565, playerY, 1.35);
        line(playerX, 35, playerX, 965, 1.35);
        if (furious) fan(5, 0.32, 180, aimed + 0.28);
      } else if (move === 1) {
        result.name = 'Діагональ руйнування';
        across(diagonal, 0, 1.15);
        if (furious) across(diagonal, 170, 1.7);
      } else if (move === 2) {
        result.name = 'Демонтажний удар';
        slam(playerX, playerY, 100, 1.2);
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + (i * Math.PI) / 2;
          pool(
            playerX + Math.cos(a) * 155,
            playerY + Math.sin(a) * 155,
            50,
            1.6,
          );
        }
      } else {
        result.name = 'Знесення кварталу';
        for (const offset of [-150, 150]) {
          line(35, playerY + offset, 1565, playerY + offset, 1.3);
          line(playerX + offset, 35, playerX + offset, 965, 1.3);
        }
        fan(7, 0.26, 190);
      }
      result.cooldown = furious ? 2.35 : 2.9;
      break;
    }
    case 'collector': {
      const move = moves(3);
      if (move < 2) {
        result.name = move ? 'Стягнення боргу' : 'Монетна орбіта';
        ring(furious ? 19 : 16, furious ? 142 : 122, turn * 0.47, turn % 5);
        if (move)
          for (let i = 0; i < (furious ? 4 : 3); i++) {
            const a = aimed + (i * Math.PI) / 2;
            pool(
              playerX + (i ? Math.cos(a) * 122 : 0),
              playerY + (i ? Math.sin(a) * 122 : 0),
              42,
              1.2 + i * 0.12,
              1.35,
              5,
            );
          }
      } else if (move === 2) {
        result.name = 'Банкрутство';
        slam(playerX, playerY, 96, 1.25, 5);
      } else {
        result.name = 'Інкасація';
        const [tx, ty] = ahead(0.8);
        fan(5, 0.14, 215, Math.atan2(ty - y, tx - x));
        fan(5, 0.14, 215, aimed + 0.9);
        fan(5, 0.14, 215, aimed - 0.9);
      }
      result.cooldown = furious ? 2.3 : 2.9;
      break;
    }
    case 'chronarch': {
      const move = moves(4);
      if (move === 0) {
        result.name = 'Відлуння аварії';
        pool(playerX, playerY, 80, 1.05, 0.25);
        pool(playerX, playerY, 80, 2.15, 0.25);
        if (furious) {
          pool(
            playerX + Math.cos(aimed + 1) * 155,
            playerY + Math.sin(aimed + 1) * 155,
            65,
            1.45,
            0.25,
          );
          pool(
            playerX + Math.cos(aimed + 1) * 155,
            playerY + Math.sin(aimed + 1) * 155,
            65,
            2.55,
            0.25,
          );
        }
      } else if (move === 1) {
        result.name = 'Повторити останній залп';
        fan(furious ? 9 : 7, 0.23, furious ? 205 : 180);
        across(turn * 0.8, 0, 1.4);
      } else if (move === 2) {
        result.name = 'Захист точки повернення';
        result.summons = furious ? [6, 8] : [8];
        ring(14, 137, turn * 0.3, 2);
      } else if (move === 3) {
        result.name = 'Зупинка часу';
        pool(playerX, playerY, 140, 0.9, 2.2, 0, 0.5);
        result.hazards[result.hazards.length - 1].damage = 0;
        slam(playerX, playerY, 90, 1.45);
      } else {
        result.name = 'Петля 04:17';
        const [px, py] = ahead(0.6);
        for (const delay of [1, 1.9, 2.8]) pool(px, py, 70, delay, 0.3);
        ring(12, 150, turn * 0.3, turn % 12);
      }
      result.cooldown = furious ? 2.8 : 3.35;
      break;
    }
  }
  return result;
}
