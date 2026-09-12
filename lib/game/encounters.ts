import type { BossPattern } from './bosses';

/** Three stages of one expedition. The selected variant must be saved once,
 * not rerolled when opening the map or reloading a battle. */
export const LOCATIONS = [
  {
    id: 'rust',
    name: 'Іржавий квартал',
    color: '#e7aa70',
    desc: 'Покинуті майстерні й службові машини. Знайди вихід до теплиць.',
    objective: 'Зупини охоронця кварталу та відкрий шлюз до Зелених куполів.',
    enemyTypes: [0, 1, 2],
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
    enemyTypes: [3, 4, 5],
    bossVariants: [0, 1, 2],
    background: ['#233630', '#11231e'],
  },
  {
    id: 'core',
    name: 'Серце мережі',
    color: '#93cfee',
    desc: 'Центральна система відновлює аварію о 04:17. Її останні захисники пам’ятають попередні спроби.',
    objective: 'Переможи захисника ядра та вимкни протокол повторення аварії.',
    enemyTypes: [6, 7, 8],
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
  | 'pulse';

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

export const ENEMY_DEFS: readonly CampaignEnemyDefinition[] = [
  {
    type: 0,
    location: 0,
    name: 'Брухтозбирач',
    behavior: 'chase',
    artIndex: 0,
    color: '#dda071',
    health: 26,
    speed: 57,
    radius: 13,
    contactDamage: 8,
    damage: 8,
    cooldown: 2.5,
    windup: 0.8,
    projectileSpeed: 0,
    range: 34,
    scale: 1,
    guide: 'Повільно переслідує будинок. Не дозволяй зграї оточити тебе.',
  },
  {
    type: 1,
    location: 0,
    name: 'Гончак патруля',
    behavior: 'charge',
    artIndex: 1,
    color: '#84bdd7',
    health: 23,
    speed: 60,
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
      'Завмирає й позначає напрямок перед ривком. Відійди вбік після появи прицілу.',
  },
  {
    type: 2,
    location: 0,
    name: 'Дворовий стрілець',
    behavior: 'fan',
    artIndex: 4,
    color: '#83cbd3',
    health: 34,
    speed: 37,
    radius: 14,
    contactDamage: 7,
    damage: 7,
    cooldown: 3.3,
    windup: 0.85,
    projectileSpeed: 155,
    range: 310,
    scale: 1,
    guide:
      'Тримається на відстані та стріляє трьома снарядами. Між ними є проходи.',
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
      'Вирощує коріння там, де стояв будинок. Виходь із зеленого кола до його заповнення.',
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
    speed: 54,
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
      'Чергує віяло куль і удар опорами. Після втрати половини міцності ударів стає два. Виходь із позначених кіл.',
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
      'Затискає арену двома паралельними ударами, залишаючи коридор. Потім обвалює брухт на твоє попереднє місце.',
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
      'Викликає гончаків і перекриває шлях кільцем повільних куль. У кільці завжди є широкий прохід.',
  },
  {
    location: 1,
    variant: 0,
    id: 'root-mother',
    name: 'Мати теплиць',
    health: 8000,
    speed: 29,
    radius: 49,
    color: '#a2d883',
    artIndex: 1,
    size: 183,
    emblem: 'roots',
    guide:
      'Залишає надовго небезпечні корені й кличе садівників. Веди її вздовж краю, зберігаючи чистий шлях у центр.',
  },
  {
    location: 1,
    variant: 1,
    id: 'irrigator',
    name: 'Верховний зрошувач',
    health: 8400,
    speed: 32,
    radius: 47,
    color: '#77d6c1',
    artIndex: 3,
    size: 180,
    emblem: 'sprinkler',
    guide:
      'Обертає кільця снарядів із проходом та розсікає арену струменями. Прохід змінює напрямок після кожного залпу.',
  },
  {
    location: 1,
    variant: 2,
    id: 'queen',
    name: 'Королева розсадника',
    health: 7600,
    speed: 35,
    radius: 46,
    color: '#d8bf79',
    artIndex: 1,
    size: 177,
    emblem: 'hive',
    guide:
      'Позначає ланцюжок ударів і випускає обприскувачів. Кола спалахують по черзі: рухайся через уже згаслі ділянки.',
  },
  {
    location: 2,
    variant: 0,
    id: 'architect',
    name: 'Архітектор знесення',
    health: 16000,
    speed: 32,
    radius: 48,
    color: '#8ddbf0',
    artIndex: 3,
    size: 185,
    emblem: 'grid',
    guide:
      'Креслить лазерну сітку, а потім діагональний розріз. Після половини міцності додає віяло куль. Шукай вільний сектор до спалаху.',
  },
  {
    location: 2,
    variant: 1,
    id: 'collector',
    name: 'Колектор мережі',
    health: 16800,
    speed: 36,
    radius: 48,
    color: '#c6a3e9',
    artIndex: 2,
    size: 192,
    emblem: 'coins',
    guide:
      'Повільні монетні кільця чергуються з борговими пастками. Пастки забирають міцність і до 5 монет; розрив у кільці веде до безпечного сектора.',
  },
  {
    location: 2,
    variant: 2,
    id: 'chronarch',
    name: 'Хранитель 04:17',
    health: 15200,
    speed: 39,
    radius: 51,
    color: '#ffc38a',
    artIndex: 4,
    size: 204,
    emblem: 'clock',
    guide:
      'Повторює удари в тих самих місцях із затримкою, тоді викликає глушників. Не повертайся одразу в коло, яке щойно згасло.',
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

/** Called after an engine-level 0.8s boss charge indicator. Shots are released
 * immediately; hazard ages contain their own, longer warning. No RNG is used
 * here, so replaying a saved encounter produces the same attack sequence. */
export function campaignBossPattern(
  location: number,
  variant: number,
  phase: number,
  beat: number,
  x: number,
  y: number,
  playerX: number,
  playerY: number,
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
    });
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

  switch (boss.id) {
    case 'commandant': {
      if (turn % 3 === 2) {
        result.name = furious ? 'Подвійний удар опорами' : 'Удар опорами';
        pool(playerX, playerY, 82, 1.15);
        if (furious)
          pool(
            playerX + Math.cos(aimed + 0.8) * 130,
            playerY + Math.sin(aimed + 0.8) * 130,
            73,
            1.55,
          );
      } else {
        result.name = 'Загороджувальний вогонь';
        fan(furious ? 7 : 5, 0.22, furious ? 188 : 164);
      }
      result.cooldown = furious ? 2.25 : 2.8;
      break;
    }
    case 'scrap-press': {
      if (turn % 2 === 0) {
        result.name = 'Коридор між пресами';
        const angle = ((turn % 4) * Math.PI) / 4;
        across(angle, -108, 1.35);
        across(angle, 108, 1.35);
        if (furious) pool(playerX, playerY, 60, 2.05);
      } else {
        result.name = 'Обвал брухту';
        pool(playerX, playerY, furious ? 93 : 80, 1.1);
        pool(playerX + 145, playerY - 90, 61, 1.45);
        pool(playerX - 145, playerY + 90, 61, 1.75);
      }
      result.cooldown = furious ? 2.65 : 3.2;
      break;
    }
    case 'signalman': {
      if (turn % 3 === 0) {
        result.name = 'Виклик патруля';
        result.summons = furious ? [1, 1, 2] : [1, 1];
        fan(3, 0.36, 148);
      } else {
        result.name = 'Кільце оточення';
        ring(furious ? 14 : 11, furious ? 146 : 126, aimed - 0.57, turn % 3);
      }
      result.cooldown = furious ? 2.5 : 3.05;
      break;
    }
    case 'root-mother': {
      result.name = turn % 3 === 2 ? 'Варта коріння' : 'Заростання';
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
      if (turn % 3 === 2) result.summons = furious ? [3, 3, 4] : [3, 3];
      result.cooldown = furious ? 3.2 : 3.85;
      break;
    }
    case 'irrigator': {
      if (turn % 3 !== 2) {
        result.name = 'Обертовий полив';
        ring(furious ? 17 : 14, furious ? 164 : 143, turn * 0.43, turn % 4);
      } else {
        result.name = 'Перехресні струмені';
        across(turn * 0.4, 0, 1.3);
        if (furious) across(turn * 0.4 + Math.PI / 2, 0, 1.8);
      }
      result.cooldown = furious ? 2.2 : 2.75;
      break;
    }
    case 'queen': {
      if (turn % 3 === 2) {
        result.name = 'Виліт обприскувачів';
        result.summons = furious ? [4, 4, 3] : [4, 4];
        fan(5, 0.29, 157);
      } else {
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
      }
      result.cooldown = furious ? 2.75 : 3.35;
      break;
    }
    case 'architect': {
      if (turn % 2 === 0) {
        result.name = 'Сітка знесення';
        line(35, playerY, 1565, playerY, 1.35);
        line(playerX, 35, playerX, 965, 1.35);
        if (furious) fan(5, 0.32, 180, aimed + 0.28);
      } else {
        result.name = 'Діагональ руйнування';
        across(turn % 4 === 1 ? Math.PI / 4 : -Math.PI / 4, 0, 1.15);
        if (furious)
          across(turn % 4 === 1 ? Math.PI / 4 : -Math.PI / 4, 170, 1.7);
      }
      result.cooldown = furious ? 2.35 : 2.9;
      break;
    }
    case 'collector': {
      result.name = turn % 2 ? 'Стягнення боргу' : 'Монетна орбіта';
      ring(furious ? 19 : 16, furious ? 142 : 122, turn * 0.47, turn % 5);
      if (turn % 2) {
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
      }
      result.cooldown = furious ? 2.3 : 2.9;
      break;
    }
    case 'chronarch': {
      if (turn % 3 === 0) {
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
      } else if (turn % 3 === 1) {
        result.name = 'Повторити останній залп';
        fan(furious ? 9 : 7, 0.23, furious ? 205 : 180);
        across(turn * 0.8, 0, 1.4);
      } else {
        result.name = 'Захист точки повернення';
        result.summons = furious ? [6, 8] : [8];
        ring(14, 137, turn * 0.3, 2);
      }
      result.cooldown = furious ? 2.8 : 3.35;
      break;
    }
  }
  return result;
}
