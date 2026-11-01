import type { Meta } from './model';
import { ARC_ART, ENDING_ART, HOUSE_ART } from './cutscenes';
import type { Choice, Line, Scene } from './story';

// The residents' own stories, the other houses on the radio, and the marks the
// player's choices leave in the profile. A choice with a `mark` is remembered
// as «тема:warm» (by the heart) or «тема:cool» (by the book). The marks open
// the last ending and decide who speaks at the table in the endings.
const L = (who: Line['who'], text: string, extra: Partial<Line> = {}): Line => ({
  who,
  text,
  ...extra,
});

export const hasMark = (meta: Pick<Meta, 'marks'>, mark: string) =>
  (meta.marks ?? []).includes(mark);
// A choice is remembered by its topic: choosing again (a replayed scene)
// replaces the earlier answer, warm or cool.
export function addMark(meta: Meta, mark: string): Meta {
  const known = meta.marks ?? [],
    [topic, tone] = mark.split(':'),
    opposite = `${topic}:${tone === 'warm' ? 'cool' : 'warm'}`;
  if (known.includes(mark) && !known.includes(opposite)) return meta;
  const marks = [...known.filter((m) => m !== opposite && m !== mark), mark];
  return marks.length > 200 ? meta : { ...meta, marks };
}
// A meeting on the road leaves a «road-<id>:warm|cool» mark of its own
// (campaign-content.ts). They count for the heart, but only two of the six, so
// that the last ending still needs the residents' stories from the shelter.
export const ROAD_WARMTH_CAP = 2;
const isRoad = (mark: string) => mark.startsWith('road-');
// How many choices were made by the heart, and how many of those answered
// another house on the radio.
export const warmth = (meta: Pick<Meta, 'marks'>) => {
  const warm = (meta.marks ?? []).filter((m) => m.endsWith(':warm')),
    road = warm.filter(isRoad).length;
  return warm.length - road + Math.min(road, ROAD_WARMTH_CAP);
};
export const neighbours = (meta: Pick<Meta, 'marks'>) =>
  (meta.marks ?? []).filter((m) => /^house\d+:warm$/.test(m)).length;
// The last ending: the whole street votes. It needs a heart (six warm choices),
// two other houses that were answered, and the evidence about the loop.
export const canEndingD = (meta: Meta) =>
  warmth(meta) >= 6 &&
  neighbours(meta) >= 2 &&
  (meta.clues ?? []).length >= 8;

const warm = (
  topic: string,
  text: string,
  reply: Line,
): Choice => ({ text, reply, mark: `${topic}:warm` });
const cool = (
  topic: string,
  text: string,
  reply: Line,
): Choice => ({ text, reply, mark: `${topic}:cool` });

export interface Arc {
  id: string;
  resident: string;
  // The raid count from which the story can be told.
  runs: number;
  scene: Scene;
}
const arc = (
  resident: string,
  runs: number,
  title: string,
  lines: Line[],
  choices: Choice[],
): Arc => ({
  id: `arc-${resident}`,
  resident,
  runs,
  scene: {
    id: `arc-${resident}`,
    title,
    // The picture of the story is on its first line and stays to the end.
    lines: lines.map((l, i) =>
      i === 0 ? { ...l, art: ARC_ART[resident as keyof typeof ARC_ART] } : l,
    ),
    choices,
    library: true,
  },
});

// One story per resident, told in the Shelter after a raid (one beat per raid,
// after the main plot's beats). Each ends with a choice that is remembered.
export const ARCS: Arc[] = [
  arc(
    'nina',
    4,
    'Ніна Василівна · для кого десята чашка',
    [
      L(
        'nina',
        'Сідай, дитино. Розкажу, для кого десята чашка. Шістдесят четвертий рік, монтери вкрутили домофон, а він першої ночі заспівав.',
      ),
      L(
        'nina',
        'Тихенько, ніби боявся розбудити. Я вийшла в коридор у халаті й спитала: чаю хочеш? Він мовчав. Ну я й поставила чашку.',
      ),
      L(
        'nina',
        'Мені не треба, щоб він пив. Мені треба, щоб хтось у цьому будинку знав: його чекають до столу.',
      ),
    ],
    [
      warm(
        'nina',
        'Віднесемо чашку до домофона',
        L(
          'nina',
          'Віднесла. Поставила на підлогу під панеллю. Він гудів цілу ніч, а це, голово, вже майже розмова.',
        ),
      ),
      cool(
        'nina',
        'Це просто техніка, Ніно Василівно',
        L(
          'nina',
          'Техніка. Угу. А чого ж ти тоді стишив голос?',
        ),
      ),
    ],
  ),
  arc(
    'lev',
    5,
    'Микола · пост, який пішов',
    [
      L(
        'lev',
        'Голово, я мовчав. Тієї ночі, о четвертій сімнадцять, я залишив пост. Вперше за сорок років.',
      ),
      L(
        'lev',
        'Хтось кричав зі сходів, що забули людину. Я побіг по неї. Тільки потім зрозумів, що то був твій голос.',
      ),
      L(
        'lev',
        'А поки я бігав, на воротах ніхто не стояв. Брама відчинилася. Міст… ну, ти знаєш, який міст.',
      ),
    ],
    [
      warm(
        'lev',
        'Ти біг по людину. Це не провина',
        L(
          'lev',
          'Дякую. Але пост є пост. Я просто сказав це вголос. Так легше.',
        ),
      ),
      cool(
        'lev',
        'Пост є пост, Миколо',
        L(
          'lev',
          'Так. Я теж так думав сорок років. Дякую, що не збрехав мені.',
        ),
      ),
    ],
  ),
  arc(
    'mechanic',
    6,
    'Петрович · кріплення на стіні',
    [
      L(
        'mechanic',
        'Є річ, яку я не казав. Домофон на стіні тримається на моєму зварі. Я приварив панель у шістдесят четвертому, щоб не здер хуліган.',
      ),
      L(
        'mechanic',
        'А тепер думаю: якщо він і справді мешканець, то я його замурував. Двері зачинив, а ключ викинув.',
      ),
      L('mechanic', 'Болгарка в мене є. Питання, чи треба.'),
    ],
    [
      warm(
        'mechanic',
        'Відріж обережно, нехай ходить',
        L(
          'mechanic',
          'Обережно я вмію. Скажи йому тільки, щоб не боявся іскор. Хоча він їх бачив більше за мене.',
        ),
      ),
      cool(
        'mechanic',
        'Нехай висить. Стіна його тримає',
        L(
          'mechanic',
          'Логічно. Стіна не підводила. Але я собі записав: ключ — дорога річ.',
        ),
      ),
    ],
  ),
  arc(
    'spark',
    7,
    'Іскра · одне слово',
    [
      L(
        'spark',
        'Я слухала домофон на радіо. Він гуде не абияк, це азбука Морзе. Одне й те саме слово, годинами.',
      ),
      L(
        'spark',
        'Розшифрувала. Він повторює: «дякую». За що, голово? Ніхто ж нічого для нього не робить.',
      ),
      L(
        'intercom',
        'Мене вчили бути ввічливим. Решту слів я збирав роками й нікому не казав.',
        { glitch: true },
      ),
    ],
    [
      warm(
        'spark',
        'Відповідай йому теж Морзе',
        L(
          'spark',
          'Відстукала «будь ласка». Він замовк на хвилину і розсміявся. Так, іскри теж можуть сміятися, я бачила.',
        ),
      ),
      cool(
        'spark',
        'Не лізь у його канали',
        L(
          'spark',
          'Добре. Приберу антену. Але слухати не перестану, і це не обговорюється.',
        ),
      ),
    ],
  ),
  arc(
    'flora',
    8,
    'Флора · останній листок',
    [
      L(
        'flora',
        'Кущ облисів до стебла. Лишився один листок. Я рахувала ночі м’ятою, а тепер рахувати нічим.',
      ),
      L(
        'flora',
        'Ніна просить на чай, для десятої чашки. А я не можу зірвати: це ж останній.',
      ),
      L(
        'flora',
        'Знаєш, що я зрозуміла? Листки відростають там, де їх кличуть. Я кликала кущ уголос стільки ночей. А домофон кликав його шепотом.',
      ),
    ],
    [
      warm(
        'flora',
        'Зірви. Нехай буде чай',
        L(
          'flora',
          'Зірвала. І дивись, кущ уже пускає нові. Кажуть, рослини люблять, коли ними користуються. Я теж.',
        ),
      ),
      cool(
        'flora',
        'Залиш кущ, нехай відросте сам',
        L('flora', 'Залишила. Чекатиму. Терпіння, голово, теж добриво.'),
      ),
    ],
  ),
  arc(
    'boris',
    9,
    'Борис · одна гривня',
    [
      L(
        'boris',
        'Я розібрав рахунок. Квартира нуль, одна гривня. Не списується з жодної картки. Вона приходить готівкою в конверті під моїми дверима.',
      ),
      L(
        'boris',
        'Конверта я двадцять років не відкривав. А сьогодні відкрив. Там чек і записка: «За світло. Дякую, що не вимикаєте».',
      ),
      L('boris', 'Я не вимикав. Просто не знав, що можна. Це ж лише одна гривня.'),
    ],
    [
      warm(
        'boris',
        'Приймай платіж і пиши розписку',
        L(
          'boris',
          'Написав. «Квартира нуль сплатила за світло. Мешканця вітаємо». Вперше в бухгалтерії розчулився.',
        ),
      ),
      cool(
        'boris',
        'Одна гривня це нічого. Не ускладнюй',
        L(
          'boris',
          'Для когось це нічого. Для бухгалтера це принцип. Але добре, не ускладнюю.',
        ),
      ),
    ],
  ),
  arc(
    'marta',
    10,
    'Марта · скарга номер триста одинадцять',
    [
      L(
        'marta',
        'Читаю вголос: «Вночі в стіні хтось гуде. Колискова. Заважає спати». Сімдесят перший рік. Підпис: я.',
      ),
      L(
        'marta',
        'А тепер скажу, чому не знімаю. Без неї я не засинаю. П’ятнадцять років скаржуся, а сплю найкраще в будинку.',
      ),
      L(
        'marta',
        'Чи можна це оформити якось по-офіційному? Щоб скарга була, а колискова лишилась.',
      ),
    ],
    [
      warm(
        'marta',
        'Оформимо як подяку',
        L(
          'marta',
          'Подяка номер триста одинадцять. Звучить жахливо. Я в захваті.',
        ),
      ),
      cool(
        'marta',
        'Скарга є скарга: розглядаємо',
        L(
          'marta',
          'Нарешті хтось серйозно! Заберу її з архіву й стежитиму за ходом справи.',
        ),
      ),
    ],
  ),
  arc(
    'danilo',
    11,
    'Данило · ніжки для домофона',
    [
      L(
        'danilo',
        'Голово! Я придумав. Якщо домофон мешканець, йому потрібне тіло. Ноги, як у будинку, тільки менші. У мене є дві від мікрохвильовки!',
      ),
      L(
        'danilo',
        'Роз’єм Б це його пам’ять. Вийняти блок і поставити на ноги, і він зможе ходити за нами. Теоретично. Практично, як піде.',
      ),
      L(
        'mechanic',
        'Даниле, якщо щось піде не так, воно піде в мою стіну.',
      ),
    ],
    [
      warm(
        'danilo',
        'Збирай, я допоможу',
        L(
          'danilo',
          'Є! Тримай паяльник за ручку. За ручку, кажу! Ну, тепер ти теж у кошторисі нервів Бориса.',
        ),
      ),
      cool(
        'danilo',
        'Спершу безпека. Без експериментів',
        L(
          'danilo',
          'Ну, безпека так безпека. Накреслю схему. Тричі. З підписами.',
        ),
      ),
    ],
  ),
  arc(
    'solomia',
    12,
    'Соломія · другий голос',
    [
      L(
        'solomia',
        'Я заспівала йому колискову, просто так, у коридорі. А він підхопив. Другим голосом, у терцію. Не знала, що домофони так уміють.',
      ),
      L(
        'solomia',
        'Донька завжди просила другий голос, а я була сама на двох. Здається, у мене нарешті є дует.',
      ),
      L('intercom', 'Я не вмію співати. Я просто знав, де підтримати.', {
        glitch: true,
      }),
    ],
    [
      warm(
        'solomia',
        'Заспівайте вдвох',
        L(
          'solomia',
          'Заспівали. Будинок не здригнувся, він тихо підлаштувався. Було майже як у залі.',
        ),
      ),
      cool(
        'solomia',
        'Тихіше, це може привабити ворогів',
        L(
          'solomia',
          'Тихіше? Добре. Тиша теж частина партитури, я ж казала.',
        ),
      ),
    ],
  ),
];

// The other houses of the street answer on the radio during a raid. Each asks
// for a place in the Shelter; the answer is remembered.
const house = (n: number, id: string, title: string, lines: Line[], yes: string, yesReply: Line, no: string, noReply: Line): Scene => ({
  id,
  title,
  lines: lines.map((l, i) =>
    i === 0 ? { ...l, art: HOUSE_ART[HOUSE_BY_NUMBER[n]] } : l,
  ),
  choices: [warm(`house${n}`, yes, yesReply), cool(`house${n}`, no, noReply)],
  library: true,
});

const HOUSE_BY_NUMBER: Record<number, keyof typeof HOUSE_ART> = {
  12: 'rust',
  23: 'green',
  4: 'core',
};
export const RAID_SCENES: Record<string, Scene> = {
  'raid-0-a': house(
    12,
    'raid-0-a',
    'Рація · будинок № 12',
    [
      L(
        'narrator',
        'Рація зашипіла. З ефіру вибивався чужий голос, утомлений, але впертий.',
        { time: 'ЕФІР' },
      ),
      L(
        'narrator',
        'Будинок дванадцять викликає будь-який будинок. Ми ходимо одним кварталом по колу вже сто спроб. Ви перші, кого ми чуємо.',
        { time: 'ЕФІР' },
      ),
      L(
        'spark',
        'Ще один будинок у петлі. Вони не бачать Притулку. Можу передати їм наші координати.',
      ),
    ],
    'Передай їм координати Притулку',
    L(
      'spark',
      'Передала. Вони мовчали секунд десять, а тоді відповіли: «Чайник ставимо». Мабуть, це добрий знак.',
    ),
    'Не відповідай. Нам вистачає своїх',
    L(
      'spark',
      'Добре. Вимикаю канал. Але я чутиму їх у шумі ще кілька ночей, і ти це знаєш.',
    ),
  ),
  'raid-0-b': {
    id: 'raid-0-b',
    title: 'Табличка біля яру',
    library: true,
    clues: ['bridge'],
    lines: [
      L(
        'lev',
        'Стій. Бачите табличку? «Міст через Іржавий яр. Закрито на ремонт. 04:17».',
        { time: 'ІРЖАВИЙ ЯР' },
      ),
      L(
        'lev',
        'Мосту нема. Яру нема. А табличка є, і вона нова. Хтось її щоразу вішає знову.',
      ),
      L(
        'spark',
        'Це не табличка для нас. Це табличка для тих, хто пам’ятає міст. Для тебе, Миколо.',
      ),
    ],
  },
  'raid-1-a': house(
    23,
    'raid-1-a',
    'Рація · будинок № 23',
    [
      L(
        'narrator',
        'У теплицях рація піймала голос, який нікуди не поспішав.',
        { time: 'ЕФІР' },
      ),
      L(
        'narrator',
        'Будинок двадцять три на зв’язку. Ми перестали рахувати спроби. Просто живемо. Тут тепло, діти виросли, а онуки вже не знають, що таке ранок.',
        { time: 'ЕФІР' },
      ),
      L(
        'flora',
        'Вони вирощують пшеницю на даху й нікуди не йдуть. Я б теж лишилась, якби не мій кущ м’яти.',
      ),
    ],
    'Запроси їх до Притулку',
    L(
      'flora',
      'Запросила. Вони засміялись і сказали, що подумають. Я чую в цьому «так».',
    ),
    'Це їхній вибір. Хай лишаються',
    L(
      'flora',
      'Хай. Тільки ж ранку їм усе одно бракує, голово. Я це знаю з рослин: світло потрібне всім.',
    ),
  ),
  'raid-1-b': {
    id: 'raid-1-b',
    title: 'Сліди під корінням',
    library: true,
    lines: [
      L(
        'flora',
        'Подивіться під ноги. Коріння розкрилося, і там відбитки. Опори нашого будинку, десятки доріжок, одна на одній.',
        { time: 'ЗЕЛЕНА ЗОНА' },
      ),
      L(
        'marta',
        'Це ж наші сліди. Усі наші спроби. Вона їх зберегла, усі до одного. Хоч би одну скаргу склала.',
      ),
      L(
        'flora',
        'Рослини не пам’ятають зла. Вони пам’ятають лише те, що по них ходили. Може, це теж пам’ять.',
      ),
    ],
  },
  'raid-2-a': house(
    4,
    'raid-2-a',
    'Рація · будинок № 4',
    [
      L(
        'narrator',
        'Біля серця мережі рація заговорила голосом, схожим на колискову.',
        { time: 'ЕФІР' },
      ),
      L(
        'narrator',
        'Будинок чотири викликає сусідів. Ми вирішили лишитися в петлі. Тут усі ще живі. Тільки ввечері, коли гасне світло, ми боїмося, що нас забули.',
        { time: 'ЕФІР' },
      ),
      L(
        'galyna',
        'Це не просто будинок, голово. Це збори, які не закінчились. Вони чекають, щоб хтось сказав: розходимось.',
      ),
    ],
    'Скажи, що ми їх пам’ятаємо',
    L(
      'galyna',
      'Сказала. Вони замовкли. А тоді в рації щось тихо цокнуло. Ніби хтось поставив чашку на стіл.',
    ),
    'Нам час. Мовчимо',
    L(
      'galyna',
      'Добре. Але запишемо в протокол: чотири будинки не відповіли. Протокол усе пам’ятає.',
    ),
  ),
};

// Which raid scene follows a won battle: the first one at step three of a
// location, the second at step six, once each per profile.
const RAID_BEATS: [location: number, step: number, id: string][] = [
  [0, 3, 'raid-0-a'],
  [0, 6, 'raid-0-b'],
  [1, 3, 'raid-1-a'],
  [1, 6, 'raid-1-b'],
  [2, 3, 'raid-2-a'],
];
export function raidBeat(
  meta: Pick<Meta, 'scenesSeen' | 'tutorialDone'>,
  chapter: number,
  step: number,
): string | null {
  if (!meta.tutorialDone) return null;
  return (
    RAID_BEATS.find(
      ([location, at, id]) =>
        location === chapter && step >= at && !meta.scenesSeen.includes(id),
    )?.[2] ?? null
  );
}

// The ending of the whole street: every house the player answered comes to the
// meeting. It needs six choices by the heart (arcs and radio answers).
export const ENDING_D_LINES: Line[] = [
  L(
    'svitanok',
    'Реєстр відкрито для редагування. Знайдено сторонні записи: будинки, що відповіли на виклик. У них нема мешканців у списку. Є лише двері.',
    { art: ENDING_ART.d },
  ),
  L(
    'galyna',
    'Голово, нас дев’ятеро, десятий у домофоні, а за дверима ще кілька будинків. Кворум не збирався так давно, що я забула, скільки це голосів.',
    { art: ENDING_ART.d },
  ),
  L(
    'intercom',
    'Я можу розіслати виклик на всі домофони міста. Це найдовший дзвінок у моєму житті, і мені трохи страшно.',
    { art: ENDING_ART.d, glitch: true },
  ),
  L(
    'marta',
    'Реєструю: позачергові загальноміські збори. Присутніх не встигаю рахувати. Це найкраща скарга в моєму житті.',
    { art: ENDING_ART.d },
  ),
  L(
    'narrator',
    'Домофони задзвеніли в кожному під’їзді. Не вночі, а ввечері, о дев’ятнадцятій, як годиться.',
    { art: ENDING_ART.d, time: '19:00' },
  ),
  L(
    'narrator',
    'Люди виходили у двори в капцях і з документами. Вони не бігли. Вони йшли на збори.',
    { art: ENDING_ART.d, time: '19:00' },
  ),
  L(
    'svitanok',
    'Кворум є. Питання порядку денного: чи вважати евакуацію завершеною. Голосування.',
    { art: ENDING_ART.d },
  ),
  L('nina', 'Усі «за». А десята чашка вже стоїть на кожному столі.', {
    art: ENDING_ART.d,
  }),
  L(
    'lev',
    'Брама відчинена. Пост здаю всім разом. Хай кожен стоїть по черзі.',
    { art: ENDING_ART.d },
  ),
  L(
    'svitanok',
    'Мешканців на борту: усі. У реєстрі: усі. Евакуацію завершено. Поле вимкнено.',
    { art: ENDING_ART.d },
  ),
  L('narrator', 'Наступного ранку, о 04:18, місто не провалилося. Воно просто прокинулося.', {
    art: ENDING_ART.d,
    time: '04:18',
  }),
  L(
    'intercom',
    'Я вперше не чую власного голосу, бо всі говорять одночасно. Це гарна тиша.',
    { art: ENDING_ART.d, time: '04:18' },
  ),
  L(
    'galyna',
    'Протокол номер вісімнадцять. Слухали: усіх. Ухвалили: жити.',
    { art: ENDING_ART.d, time: '04:19' },
  ),
];

// At the table in the endings: whoever the player's choices touched has a word,
// the one who was answered by the heart or the one who was answered by the book.
const TABLE: [string, string, string][] = [
  ['nina', 'Я налила десяту чашку, і вона не охолола. Це ж ти її поніс до стіни.', 'Десята чашка ще стоїть. Просто тепер ніхто не питає, чия вона.'],
  ['lev', 'Я більше не на посту, дитино. Я вдома. Це інша служба, і вона мені до душі.', 'Пост здав. Служба є служба, голово. Дякую, що не брехав мені.'],
  ['mechanic', 'Панель я зняв. Домофон ходить, а я лише тримаю драбину. Хай буде так.', 'Стіна його тримає, а я тримаю стіну. Усе по-людськи, нічого зайвого.'],
  ['spark', 'Він надіслав мені «будь ласка» азбукою. Я зберегла кожну крапку.', 'Антену я прибрала. Слухаю через стіну, як усі нормальні люди.'],
  ['flora', 'Кущ м’яти розцвів. Чай на всіх, голово, і ще лишилось.', 'Кущ відростає повільно. Але відростає. Я не квапитиму.'],
  ['boris', 'Розписку вклеїв у книгу. «Мешканця вітаємо». Мій найкращий запис.', 'Одна гривня лишилась одною гривнею. Кошторис зійшовся, і слава Богу.'],
  ['marta', 'Подяку номер триста одинадцять повісила над аптечкою. Хай читають.', 'Скарга в роботі, голово. Я за нею стежу. Ніхто не втече.'],
  ['danilo', 'Він ходить! Боком, але ходить! Я ж казав, що мікрохвильовка не підведе.', 'Схема лежить у шухляді, підписана тричі. Колись я її таки збудую.'],
  ['solomia', 'Ми з домофоном заспівали вдвох. Цього разу я не була сама на двох.', 'Я співаю тихіше, але далі. Тиша теж частина партитури.'],
];
// In ending D the intercom stays on the wall and rings the whole city, so two
// of the warm words differ from ending B, where it was taken aboard.
const TABLE_D: Record<string, string> = {
  mechanic:
    'Панель я послабив. Домофон лишився на стіні, але дзвонить на все місто. Я лише тримаю драбину.',
  danilo:
    'Роз’єм Б мурчить на весь двір! Ніжки не знадобилися: його чують усі домофони міста. Але я їх збережу.',
};
export const tableLines = (ending: 'b' | 'd' = 'b'): Line[] =>
  TABLE.flatMap(([who, warmText, coolText]) => [
    L(who as Line['who'], (ending === 'd' && TABLE_D[who]) || warmText, {
      when: (m) => hasMark(m, `${who}:warm`),
    }),
    L(who as Line['who'], coolText, {
      when: (m) => hasMark(m, `${who}:cool`),
    }),
  ]);
