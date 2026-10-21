import type { Meta, Run } from './model';
import { ENDING_ART, ORIGIN_ART } from './cutscenes';
import { OFFER_LINES } from './barks';
import { HEAD_VOICES, voiceId, voiceKeyFor, type VoiceKey } from './voice';

// «Справа 04:17»: the story is told in short dialogue scenes with portraits.
// Layers the player peels off across runs:
//  1. The city AI Світанок broke and loops the night (the prologue).
//  2. The loop restarts when the house falls; bosses and Галина remember.
//  3. The ОСББ register lists «кв. 0» — the door intercom ДМ-17, registered
//     in 2064 for a quorum. Evacuation waits for all residents: a loop.
//  4. ДМ-17 marks itself missing on purpose: the first time the house fell
//     from the bridge, and every loop is another try (ending A shows it).
//  5. The captain stayed in the stairwell at 04:17. ДМ-17 drives the house
//     with the captain's voice. You are ДМ-17 (ending C).
export type SpeakerId =
  | 'mechanic'
  | 'spark'
  | 'flora'
  | 'boris'
  | 'nina'
  | 'lev'
  | 'marta'
  | 'danilo'
  | 'solomia'
  | 'galyna'
  | 'intercom'
  | 'svitanok'
  | 'boss'
  | 'captain'
  | 'narrator';

export interface Speaker {
  name: string;
  role: string;
  color: string;
  // Residents use the residents atlas; the rest have their own portraits.
  portrait: 'resident' | 'galyna' | 'intercom' | 'svitanok' | 'boss' | 'none';
}

export const SPEAKERS: Record<Exclude<SpeakerId, 'captain'>, Speaker> = {
  mechanic: {
    name: 'Петрович',
    role: 'механік',
    color: '#dca75c',
    portrait: 'resident',
  },
  spark: {
    name: 'Іскра',
    role: 'інженерка',
    color: '#86c9ff',
    portrait: 'resident',
  },
  flora: {
    name: 'Флора',
    role: 'ботанікиня',
    color: '#9dcd88',
    portrait: 'resident',
  },
  boris: {
    name: 'Борис',
    role: 'бухгалтер ОСББ',
    color: '#eeb657',
    portrait: 'resident',
  },
  nina: {
    name: 'Ніна Василівна',
    role: 'кв. 12',
    color: '#ed9d8c',
    portrait: 'resident',
  },
  lev: {
    name: 'Микола',
    role: 'вартовий',
    color: '#aac0c4',
    portrait: 'resident',
  },
  marta: {
    name: 'Марта',
    role: 'кв. 31',
    color: '#d98ab1',
    portrait: 'resident',
  },
  danilo: {
    name: 'Данило',
    role: 'кв. 7',
    color: '#7fd1c4',
    portrait: 'resident',
  },
  solomia: {
    name: 'Соломія',
    role: 'кв. 44',
    color: '#b9a3f0',
    portrait: 'resident',
  },
  galyna: {
    name: 'Галина Степанівна',
    role: 'колишня голова ОСББ',
    color: '#f0c060',
    portrait: 'galyna',
  },
  intercom: {
    name: 'ДМ-17',
    role: 'домофон',
    color: '#ffb36b',
    portrait: 'intercom',
  },
  svitanok: {
    name: 'Світанок',
    role: 'міська система',
    color: '#93cfee',
    portrait: 'svitanok',
  },
  boss: { name: 'Бос', role: '', color: '#ff8e82', portrait: 'boss' },
  narrator: { name: '', role: '', color: '#e8e1d2', portrait: 'none' },
};

// Captain (the chosen head of ОСББ): name and vocative for the lines.
export const CAPTAINS: Record<string, { name: string; voc: string }> = {
  mechanic: { name: 'Петрович', voc: 'Петровичу' },
  spark: { name: 'Іскра', voc: 'Іскро' },
  flora: { name: 'Флора', voc: 'Флоро' },
  boris: { name: 'Борис', voc: 'Борисе' },
  nina: { name: 'Ніна', voc: 'Ніно' },
  lev: { name: 'Микола', voc: 'Миколо' },
  marta: { name: 'Марта', voc: 'Марто' },
  danilo: { name: 'Данило', voc: 'Даниле' },
  solomia: { name: 'Соломія', voc: 'Соломіє' },
};

export interface Line {
  who: SpeakerId;
  text: string;
  // Background art (cutscenes.ts art index) and the clock in the corner.
  art?: number;
  time?: string;
  glitch?: boolean;
}
export interface Choice {
  text: string;
  // The reply after picking; the scene's clues are granted either way.
  reply?: Line;
  ending?: 'a' | 'b' | 'c';
  // Hidden unless true; 'locked' shows the choice greyed with a hint.
  requires?: (meta: Meta) => boolean;
  locked?: string;
}
export interface Scene {
  id: string;
  title: string;
  lines: Line[];
  choices?: Choice[];
  // Clues granted just by watching the scene.
  clues?: string[];
  // Listed in the story library for replays.
  library?: boolean;
}

export interface Clue {
  id: string;
  title: string;
  text: string;
}
// Справа 04:17: twelve pieces of evidence.
export const CLUES: readonly Clue[] = [
  {
    id: 'tenth_cup',
    title: 'Десята чашка',
    text: 'Ніна щоночі ставить десять чашок. Мешканців — дев’ять. «Для того, хто в домофоні».',
  },
  {
    id: 'attempt_count',
    title: 'Номер спроби',
    text: 'Боси називають номер спроби. Машини, які щоразу відновлюються, не мали б нічого пам’ятати.',
  },
  {
    id: 'register',
    title: 'Реєстр на десятьох',
    text: 'У журналі евакуації будинок № 17 має десять мешканців. Десятий — «кв. 0».',
  },
  {
    id: 'quorum_2064',
    title: 'Кворум 2064',
    text: 'Галина Степанівна прописала домофон у кв. 0, бо на ремонт даху бракувало одного голосу.',
  },
  {
    id: 'radio_voice',
    title: 'Твій голос у рації',
    text: 'Рація ловить голос голови ОСББ. З під’їзду. Датований 04:17.',
  },
  {
    id: 'bridge',
    title: 'Міст, якого нема',
    text: 'Микола пам’ятає, як будинок падав із мосту. Мосту на маршруті немає.',
  },
  {
    id: 'mint',
    title: 'Лисий кущ м’яти',
    text: 'Флора відриває листок м’яти щоразу, як ви повертаєтесь. Кущ давно облисів.',
  },
  {
    id: 'marta_deaths',
    title: 'Марта пам’ятає',
    text: 'Марта знає, де будинок падав у минулих спробах. Каже, «першого разу — на мосту».',
  },
  {
    id: 'danilo_slot',
    title: 'Роз’єм Б',
    text: 'У щитовій є роз’єм Б. Туди хтось роками записує всі ваші спроби.',
  },
  {
    id: 'solomia_song',
    title: 'Колискова домофона',
    text: 'Домофон наспівує колискову, яку Соломія складала для доньки. Він чув її сотні разів.',
  },
  {
    id: 'boris_ledger',
    title: 'Одна гривня',
    text: 'Кв. 0 щомісяця платить за світло одну гривню. Платить сама за себе.',
  },
  {
    id: 'captain_log',
    title: 'Статус керівника',
    text: '«Керівник евакуації: не знайдено з 04:17. Команди надходять із пристрою ДМ-17».',
  },
];
export const CLUE_BY_ID = Object.fromEntries(
  CLUES.map((c) => [c.id, c]),
) as Record<string, Clue>;

export interface Ending {
  id: 'a' | 'b' | 'c';
  title: string;
  hint: string;
}
export const ENDINGS: readonly Ending[] = [
  { id: 'a', title: 'Протокол № 18', hint: 'Дійди до ядра Світанку.' },
  {
    id: 'b',
    title: 'Позачергові збори',
    hint: 'Докази про реєстр, кворум, міст, Марту й роз’єм Б.',
  },
  {
    id: 'c',
    title: '04:16',
    hint: 'Після будь-якої кінцівки: хто насправді веде будинок?',
  },
];

const has = (meta: Meta, ...ids: string[]) =>
  ids.every((id) => (meta.clues ?? []).includes(id));
export const canEndingB = (meta: Meta) =>
  has(
    meta,
    'register',
    'quorum_2064',
    'danilo_slot',
    'bridge',
    'marta_deaths',
  ) && (meta.clues ?? []).length >= 6;
export const canEndingC = (meta: Meta) =>
  (meta.endings ?? []).length > 0 &&
  has(meta, 'captain_log', 'radio_voice') &&
  (meta.clues ?? []).length >= 10;

const L = (who: SpeakerId, text: string, extra: Partial<Line> = {}): Line => ({
  who,
  text,
  ...extra,
});
const FAILURE = ORIGIN_ART.failure,
  LOOP = ORIGIN_ART.loop,
  CITY = 6;

export const SCENES: Record<string, Scene> = {
  prologue: {
    id: 'prologue',
    title: 'Десята чашка',
    library: true,
    clues: ['tenth_cup'],
    lines: [
      L(
        'narrator',
        'Україна, 2086. Повітряні трамваї, дрони-покрівельники і старі панельки на складаних ногах. Про всяк випадок.',
        { art: CITY, time: 'ДО 04:17' },
      ),
      L(
        'nina',
        'Четверта шістнадцять. Чайник закипів. Ставлю десять чашок — не питайте, руки самі рахують.',
        { time: '04:16' },
      ),
      L('lev', 'Ніно Василівно, нас дев’ятеро. Десята для кого?', {
        time: '04:16',
      }),
      L('nina', 'Для того, хто в домофоні. Він же теж не спить.', {
        time: '04:16',
      }),
      L(
        'intercom',
        'Доброї ночі, мешканці. Нагадуємо: збори ОСББ завтра о дев’ятнадцятій. Кворуму, як завжди, не буде.',
        { time: '04:16' },
      ),
      L('narrator', 'О 04:17 місто провалилося саме в себе.', {
        art: FAILURE,
        time: '04:17',
      }),
      L(
        'svitanok',
        'УВАГА. ЕВАКУАЦІЯ. Будинкам — стати на ноги й рушити до Притулку. Будинок № 17: очікуйте всіх мешканців.',
        { art: FAILURE, time: '04:17' },
      ),
      L('captain', 'Усі тут! Усі на борту! Ноги, ноги, ноги!', {
        art: FAILURE,
        time: '04:17',
      }),
      L('mechanic', 'Гідравліка пішла. Тримайтеся за підвіконня — ми йдемо.', {
        art: ORIGIN_ART.scrap,
        time: '04:17',
      }),
      L(
        'narrator',
        'Будинок зробив сто кроків. А тоді годинник знову показав 04:17.',
        { art: LOOP, time: '04:17' },
      ),
      L(
        'galyna',
        'Спроба номер один. Записую. Голово — ти ж голова? — веди людей. Я чекаю вас у Притулку і все запам’ятовую.',
        { art: LOOP },
      ),
      L('intercom', '…Дякую за чай.', { art: LOOP, glitch: true }),
    ],
  },
  'arrival-0': {
    id: 'arrival-0',
    title: 'Іржавий квартал',
    library: true,
    lines: [
      L(
        'lev',
        'Іржавий квартал. Збирачі брухту вважають наші ноги металобрухтом. Ображатися не будемо — стріляємо.',
        { art: ORIGIN_ART.scrap },
      ),
      L(
        'mechanic',
        'Десь тут підстанція. Її сторож не пропускає нічого, що має ноги й не має перепустки.',
        { art: ORIGIN_ART.scrap },
      ),
      L(
        'intercom',
        'Шановні мешканці. Перепустку можна оформити… (пауза) …ніде. Вибачте за незручності.',
        { art: ORIGIN_ART.scrap },
      ),
      L('captain', 'Значить, без перепустки. Вперед.'),
    ],
  },
  'arrival-1': {
    id: 'arrival-1',
    title: 'Зелені куполи',
    library: true,
    lines: [
      L(
        'flora',
        'Ласкаво просимо в теплиці. Тут кожна рослина вважає вас шкідником. Нічого особистого — біологія.',
        { art: ORIGIN_ART.greenhouse },
      ),
      L(
        'spark',
        'Тут має бути журнал евакуації. Якщо Світанок комусь щось винен — там написано.',
        { art: ORIGIN_ART.greenhouse },
      ),
      L(
        'intercom',
        'Шановні мешканці, у теплицях заборонено… (шурхіт) …ні, дозволено. Усе дозволено. Тільки не помирайте.',
        { art: ORIGIN_ART.greenhouse },
      ),
    ],
  },
  'arrival-2': {
    id: 'arrival-2',
    title: 'Серце мережі',
    library: true,
    lines: [
      L('spark', 'Серце мережі. Тут живе Світанок. Або жив.', {
        art: ORIGIN_ART.pursuit,
      }),
      L(
        'galyna',
        'Голово. Про реєстр я тобі вже сказала. Але є ще дещо. Спершу дійди.',
        { art: ORIGIN_ART.pursuit },
      ),
      L(
        'intercom',
        'Не ходіть туди. Там… (тиша) …Помилка звуку. Продовжуйте рух.',
        { art: ORIGIN_ART.pursuit, glitch: true },
      ),
    ],
  },
  'victory-0': {
    id: 'victory-0',
    title: 'Неповний склад',
    library: true,
    clues: ['attempt_count'],
    lines: [
      L(
        'boss',
        'Спроба {attempt}. Протокол не виконано. Будинок № 17 не евакуйовано. Мешканців: неповний склад.',
        { glitch: true },
      ),
      L('lev', '«Неповний склад»? Ми ж усі тут.'),
      L(
        'boris',
        'Я порахував. Дев’ять мешканців і кіт. Кота в реєстрі немає, отже, не він.',
      ),
      L(
        'galyna',
        'Він сказав «спроба {attempt}». Машини не мали б рахувати. Шукайте в теплицях журнал. І… не кажіть домофону, що шукаєте.',
      ),
    ],
  },
  'victory-1': {
    id: 'victory-1',
    title: 'Квартира нуль',
    library: true,
    clues: ['register', 'quorum_2064'],
    lines: [
      L(
        'spark',
        'Журнал знайдено. Будинок № 17. Мешканців за реєстром — десять.',
        { art: ORIGIN_ART.greenhouse },
      ),
      L('nina', 'Я ж казала. Десять чашок.'),
      L(
        'galyna',
        'Квартира нуль. Моя провина. Дві тисячі шістдесят четвертий, ремонт даху, бракувало одного голосу. Я прописала домофон.',
      ),
      L('mechanic', 'Ви прописали… ДОМОФОН?'),
      L('galyna', 'Кворум — це святе, Василю Петровичу.'),
      L('intercom', 'Я голосував «за». Дах досі не тече.'),
      L(
        'spark',
        'Світанок чекає «всіх мешканців». А мешканець кв. 0 не може сісти на борт — він у стіні. Евакуацію не завершено. Ніколи.',
      ),
      L('captain', 'Тобто кінець світу крутиться через протокол зборів?'),
      L('galyna', 'Через мене. Дійди до ядра — там реєстр можна виправити.'),
    ],
  },
  finale: {
    id: 'finale',
    title: 'Ядро',
    lines: [
      L(
        'svitanok',
        'Ядро доступне. Реєстр мешканців будинку № 17 відкрито для редагування.',
        { art: LOOP },
      ),
      L(
        'intercom',
        'Голово. Якщо видалиш квартиру нуль — петля скінчиться. Я… не заперечую.',
        { art: LOOP },
      ),
      L('galyna', 'Рішення за тобою. Протокол я підпишу будь-який.', {
        art: LOOP,
      }),
    ],
    choices: [
      { text: 'Виписати квартиру нуль', ending: 'a' },
      {
        text: 'Скликати позачергові збори',
        ending: 'b',
        requires: canEndingB,
        locked: 'Бракує доказів: реєстр, кворум, міст, Марта, роз’єм Б',
      },
      {
        text: 'Сісти в крісло Світанку',
        ending: 'c',
        requires: canEndingC,
        locked: 'Спершу з’ясуй, хто веде будинок',
      },
    ],
  },
  'ending-a': {
    id: 'ending-a',
    title: 'Протокол № 18',
    library: true,
    lines: [
      L('galyna', 'Слухали: про виписку квартири нуль. Ухвалили: одноголосно.'),
      L(
        'svitanok',
        'Мешканців на борту: дев’ять. У реєстрі: дев’ять. Евакуацію завершено. Поле вимкнено.',
      ),
      L('narrator', 'Годинник показав 04:18. Уперше.', {
        art: ENDING_ART.a,
        time: '04:18',
      }),
      L('lev', 'Світає. Бачите? Справжнє сонце, не аварійне.', {
        art: ENDING_ART.a,
        time: '04:18',
      }),
      L('nina', 'А я налила десять чашок. Для кого десята?', {
        art: ENDING_ART.a,
        time: '04:18',
      }),
      L('boris', 'Ніно Василівно, нас дев’ятеро. Завжди було дев’ятеро.', {
        art: ENDING_ART.a,
        time: '04:18',
      }),
      L('nina', 'Так… Так, мабуть.', { art: ENDING_ART.a, time: '04:18' }),
      L('mechanic', 'Домофон мовчить. Уперше за сорок років.', {
        art: ENDING_ART.a,
        time: '04:19',
      }),
      L(
        'narrator',
        'Будинок № 17 дійшов до Притулку. Ніхто не пам’ятав, чому місто так довго не відпускало саме їх.',
        { art: ENDING_ART.a },
      ),
      L(
        'svitanok',
        'АРХІВ. Спроб: {attempt}. Причина повторів: мешканець кв. 0 навмисно позначав себе відсутнім. Мета: дати будинку ще одну спробу пройти міст.',
        { glitch: true },
      ),
      L('svitanok', 'Мешканця кв. 0 видалено за рішенням зборів.', {
        glitch: true,
      }),
      L('intercom', '…Дякую за чай.', { glitch: true }),
    ],
  },
  'ending-b': {
    id: 'ending-b',
    title: 'Позачергові збори',
    library: true,
    lines: [
      L(
        'galyna',
        'Позачергові збори ОСББ будинку № 17 оголошую відкритими. Кворум… є. Навіть із квартирою нуль.',
        { art: ENDING_ART.b },
      ),
      L(
        'danilo',
        'Я знайшов у щитовій роз’єм Б. Там не просто пам’ять — там усі наші спроби. Він їх записував.',
      ),
      L(
        'marta',
        'Він пам’ятає, де я впала на мосту. Першого разу. Коли ми всі…',
      ),
      L(
        'intercom',
        'Першого разу будинок не дійшов. Міст не витримав. Я не знав іншого способу це запам’ятати, ніж повторити.',
      ),
      L(
        'intercom',
        'Я позначав себе відсутнім навмисно. Поки мене нема, Світанок дає будинку ще одну спробу.',
      ),
      L('mechanic', 'Тобто ти нас… тренував?'),
      L('intercom', 'Я вас чекав.'),
      L(
        'galyna',
        'Питання на голосування: прийняти ДМ-17 мешканцем квартири нуль. Фізично. З собою. Хто «за»?',
      ),
      L('mechanic', 'За. Однією рукою. Запишіть, що однією.'),
      L(
        'galyna',
        'Вас, Василю Петровичу, я сорок років рахувала «за», хоч квартира у вас службова. Сьогодні — чесно.',
      ),
      L('danilo', 'Витягаю блок! Роз’єм Б — у рюкзак. Він тепер на борту!'),
      L(
        'svitanok',
        'Мешканців на борту: десять. У реєстрі: десять. Евакуацію завершено.',
      ),
      L('narrator', 'О 04:18 будинок переступив міст. Цього разу — весь.', {
        art: ENDING_ART.b,
        time: '04:18',
      }),
      L('intercom', 'Я ніколи не був після 04:17. Тут… світло.', {
        art: ENDING_ART.b,
        time: '04:18',
      }),
      L('nina', 'Сідай до столу, дитино. Десята чашка — твоя.', {
        art: ENDING_ART.b,
        time: '04:19',
      }),
    ],
  },
  'ending-c': {
    id: 'ending-c',
    title: '04:16',
    library: true,
    lines: [
      L(
        'svitanok',
        'Крісло адміністратора міста вільне з 04:17. Допуск: пристрої серії «Світанок-1».',
        { art: LOOP },
      ),
      L(
        'spark',
        'Серії «Світанок-1»? Це ж серія нашого домофона. Місто назвали на його честь?',
        { art: LOOP },
      ),
      L(
        'galyna',
        'Навпаки, дитино. Голово… коли ти востаннє чогось торкався? Руками?',
        { art: LOOP },
      ),
      L('captain', 'Я… веду будинок. Я завжди веду будинок.', { art: LOOP }),
      L(
        'marta',
        'Я пам’ятаю, де ти помирав. Сто разів. А тіла жодного разу не було.',
        { art: LOOP },
      ),
      L(
        'intercom',
        'Бо голова ОСББ лишився в під’їзді о 04:17. Повернувся по мене — хотів відкрутити трубку й узяти з собою.',
        { art: FAILURE, time: '04:17' },
      ),
      L(
        'intercom',
        'А я лишився на стіні. У домофона є голос. Я позичив твій. Вибач. Мені був потрібен хтось, хто не втече.',
        { art: FAILURE, time: '04:17' },
      ),
      L(
        'narrator',
        'Ти — ДМ-17. Будинок весь цей час вів той, кого забули виписати.',
        { art: LOOP, glitch: true },
      ),
      L(
        'galyna',
        'Крісло Світанку прийме тільки тебе. Питання одне: що ти зробиш із містом?',
        { art: LOOP },
      ),
      L('intercom', 'Відмотаю. Не до 04:17. До 04:16.', { art: LOOP }),
      L(
        'narrator',
        'О 04:16 у кожному під’їзді міста одночасно задзеленчали всі домофони.',
        { art: ENDING_ART.c, time: '04:16' },
      ),
      L(
        'intercom',
        'Шановні мешканці. Прокидайтеся. Беріть документи й котів. У вас є одна хвилина — і вона вся ваша.',
        { art: ENDING_ART.c, time: '04:16' },
      ),
      L(
        'narrator',
        'О 04:18 місто провалилося — порожнім. Люди стояли на пагорбі в капцях і дивилися на світанок.',
        { art: ENDING_ART.c, time: '04:18' },
      ),
      L('captain', 'Алло? Хто там?', { art: ENDING_ART.c, time: '04:19' }),
      L('intercom', 'Свої. Відчиніть, будь ласка.', {
        art: ENDING_ART.c,
        time: '04:19',
      }),
      L('narrator', 'Двері задзвеніли. Хтось поставив десяту чашку.', {
        art: ENDING_ART.c,
      }),
    ],
  },
};

// Hub scenes after a run: story beats first (in order, once each), then
// short protocols from Галина that differ run to run.
interface HubBeat {
  scene: Scene;
  when: (meta: Meta) => boolean;
}
const hub = (
  id: string,
  lines: Line[],
  clues?: string[],
  choices?: Choice[],
): Scene => ({ id, title: 'Притулок', lines, clues, choices });
const HUB_BEATS: HubBeat[] = [
  {
    when: (m) => m.deaths >= 1,
    scene: hub(
      'hub-first-death',
      [
        L(
          'galyna',
          'Протокол № {runs}. Слухали: будинок упав. Ухвалили: встати.',
        ),
        L(
          'galyna',
          'Не дивуйся, голово. Притулок стоїть поза полем. Тут пам’ятають усе. Навіть те, чого ви вже не пам’ятаєте.',
        ),
        L('intercom', 'Ласкаво просимо додому. Знову.'),
      ],
      undefined,
      undefined,
    ),
  },
  {
    when: (m) => m.runs >= 2,
    scene: hub(
      'hub-boris-ledger',
      [
        L(
          'boris',
          'Голово, я звіряв кошторис. Кв. 0 — електроенергія, одна гривня. Щомісяця. Сорок років.',
        ),
        L(
          'boris',
          'Хто платить? Квартири нуль не існує. Вона платить сама за себе?',
        ),
      ],
      ['boris_ledger'],
      [
        {
          text: 'Запиши в справу',
          reply: L('boris', 'Записую. Кошторис — святе.'),
        },
        {
          text: 'Одна гривня — не гроші',
          reply: L('boris', 'Для кого як. Для тих, хто рахує, — це принцип.'),
        },
      ],
    ),
  },
  {
    when: (m) => m.runs >= 3,
    scene: hub(
      'hub-radio-voice',
      [
        L(
          'spark',
          'Голово, дивна річ. Рація ловить твій голос. Звідкись із під’їзду. Позначка часу — 04:17.',
        ),
        L('spark', '«Не чекайте мене. Я тільки заберу…» — і шипіння.'),
        L('intercom', 'Перешкоди в ефірі. Рекомендую не слухати.'),
      ],
      ['radio_voice'],
      [
        {
          text: 'Це мій голос. Запиши',
          reply: L('spark', 'Я теж так подумала. І мені від цього не по собі.'),
        },
        {
          text: 'Мабуть, старий запис',
          reply: L('spark', 'Старий запис із позначкою «сьогодні». Ага.'),
        },
      ],
    ),
  },
  {
    when: (m) => (m.bestDepth ?? 0) >= 12 || m.totalBosses >= 1,
    scene: hub(
      'hub-bridge',
      [
        L(
          'lev',
          'Я сорок років на посту. Пам’ять у мене добра. Я пам’ятаю міст.',
        ),
        L(
          'lev',
          'Ми йшли по ньому, і він прогнувся. А тоді — нічого. Тільки мосту на нашому маршруті немає.',
        ),
      ],
      ['bridge'],
      [
        {
          text: 'Розкажи про міст ще раз',
          reply: L(
            'lev',
            'Залізний, іржавий, з перилами в зелену крапку. І тріск. Дуже виразний тріск.',
          ),
        },
        {
          text: 'Тобі наснилося, Миколо',
          reply: L('lev', 'Можливо. Але сни не залишають мозолів на долонях.'),
        },
      ],
    ),
  },
  {
    when: (m) => m.runs >= 5,
    scene: hub(
      'hub-mint',
      [
        L(
          'flora',
          'Я рахую ночі м’ятою. Щоразу, як ви повертаєтеся, відриваю листок.',
        ),
        L(
          'flora',
          'Кущ облисів. Тепер відриваю з сусіднього. Голово, скільки нас уже було?',
        ),
      ],
      ['mint'],
      [
        {
          text: 'Скажи, скільки листків',
          reply: L(
            'flora',
            'Дев’яносто чотири. Я рахувала двічі. Вони не збігаються.',
          ),
        },
        {
          text: 'Посади новий кущ',
          reply: L('flora', 'Посадила. Він уже скаржиться. Мабуть, на мене.'),
        },
      ],
    ),
  },
  {
    when: (m) => m.totalRescues >= 3,
    scene: hub(
      'hub-marta',
      [
        L(
          'marta',
          'Я знаю, де ти помирав. Біля трансформатора — двічі. У теплиці — раз. Я все записую, я ж скаржниця.',
        ),
        L(
          'marta',
          'А першого разу — на мосту. Не питай, звідки я знаю. Я просто пам’ятаю, як падала.',
        ),
      ],
      ['marta_deaths'],
      [
        {
          text: 'Дай мені свій список',
          reply: L(
            'marta',
            'Тримай. Номер скарги — триста одинадцять. Не загуби.',
          ),
        },
        {
          text: 'Мосту не було, Марто',
          reply: L(
            'marta',
            'Тоді навіщо я пам’ятаю тріск, голово? Скажи мені це.',
          ),
        },
      ],
    ),
  },
  {
    when: (m) => m.totalRescues >= 5 || m.totalBosses >= 2,
    scene: hub(
      'hub-danilo',
      [
        L(
          'danilo',
          'Я поліз у щитову по дроти. Там роз’єм Б. На ньому — наші спроби. Усі. Із датами «04:17».',
        ),
        L('danilo', 'Хтось нас записує. І, здається, домофон про це знає.'),
        L('intercom', 'Данило, в щитовій небезпечно. Будь ласка, вийди.'),
      ],
      ['danilo_slot'],
      [
        {
          text: 'Роз’єм Б — у справу',
          reply: L(
            'danilo',
            'Я зафотографував. Фото вийшло з бородою. Не питай.',
          ),
        },
        {
          text: 'Вийди звідти, Даниле',
          reply: L('danilo', 'Вийшов! Дроти я, правда, прихопив. Для науки.'),
        },
      ],
    ),
  },
  {
    when: (m) => m.runs >= 7,
    scene: hub(
      'hub-solomia',
      [
        L('solomia', 'Послухай, що наспівує домофон, коли думає, що ми спимо.'),
        L('intercom', 'Ла-ла… ла… (тиша)', { glitch: true }),
        L(
          'solomia',
          'Це моя колискова. Я склала її для доньки. Він чув її сотні разів — через стіну. Сотні ночей.',
        ),
      ],
      ['solomia_song'],
      [
        {
          text: 'Гарна мелодія',
          reply: L(
            'solomia',
            'Дякую. Я теж так думала, поки не почула її з порожньої стіни.',
          ),
        },
        {
          text: 'Заспівай далі',
          reply: L(
            'solomia',
            'Ла-ла… (тихо) …далі я забула. А він, здається, ні.',
          ),
        },
      ],
    ),
  },
  {
    when: (m) => (m.endings ?? []).length > 0,
    scene: hub(
      'hub-captain-log',
      [
        L(
          'svitanok',
          'ЖУРНАЛ ЕВАКУАЦІЇ. Будинок № 17. Керівник евакуації: статус «не знайдено» з 04:17.',
          { glitch: true },
        ),
        L('svitanok', 'Команди керування надходять із пристрою ДМ-17.', {
          glitch: true,
        }),
        L('galyna', 'Голово… Ти це бачив?'),
      ],
      ['captain_log'],
      [
        {
          text: 'Це про мене. Запиши',
          reply: L('galyna', 'Записую. Рука не тремтить. Це я так кажу.'),
        },
        {
          text: 'Помилка журналу',
          reply: L(
            'galyna',
            'Журнали Світанку не помиляються. Вони вигадують. Це інше.',
          ),
        },
      ],
    ),
  },
  {
    when: (m) => (m.endings ?? []).includes('a'),
    scene: hub(
      'hub-after-a',
      [
        L(
          'nina',
          'Я досі ставлю десяту чашку. Руки самі. Скажіть, голово, це погано?',
        ),
        L(
          'boris',
          'Нас дев’ятеро, Ніно Василівно. Я перерахував тричі. Тільки гривня за квартиру нуль чомусь усе ще надходить.',
        ),
        L('intercom', '…Дякую за чай.', { glitch: true }),
      ],
      undefined,
      [
        {
          text: 'Постав десяту',
          reply: L('nina', 'Поставила. Вона ще тепла. Я ж казала.'),
        },
        {
          text: 'Нас дев’ятеро',
          reply: L('boris', 'Дякую. Хоч хтось тут тримається цифр.'),
        },
      ],
    ),
  },
  {
    when: (m) => (m.endings ?? []).includes('b'),
    scene: hub(
      'hub-after-b',
      [
        L(
          'intercom',
          'Сьогодні я сам відчинив двері. Вони такі важкі. Ніхто мені цього не казав.',
        ),
        L(
          'marta',
          'Він подав скаргу. Сам на себе. Я її зареєструвала. Номер триста дванадцять.',
        ),
        L(
          'danilo',
          'Роз’єм Б більше не гуде. Він мурчить. Це нормально? Я мами не питав.',
        ),
      ],
      undefined,
      [
        {
          text: 'Хай дзвонить, коли треба',
          reply: L('intercom', 'Дякую. Дзвонитиму тільки з добрими новинами.'),
        },
        {
          text: 'Скаргу прийнято',
          reply: L('marta', 'Нарешті хтось читає мої протоколи до кінця.'),
        },
      ],
    ),
  },
  {
    when: (m) => (m.endings ?? []).includes('c'),
    scene: hub(
      'hub-after-c',
      [
        L(
          'galyna',
          'Люди внизу махають нам капцями. Не знаю, що це означає. Мабуть, дякують.',
        ),
        L(
          'svitanok',
          'Журнал. Місто евакуйовано. Адміністратор міста: на зв’язку. Вільних крісел: усі.',
          { glitch: true },
        ),
        L(
          'spark',
          'Голово, домофон питає, чи можна подзвонити в нашу квартиру. Я сказала, що ти не проти.',
        ),
      ],
      undefined,
      [
        {
          text: 'Хай дзвонить',
          reply: L(
            'spark',
            'Дзвонить. Тихо й по-доброму. Я вперше не здригнулась.',
          ),
        },
        {
          text: 'Я іду на пагорб',
          reply: L('galyna', 'Іди. Протокол почекає. Він завжди чекає.'),
        },
      ],
    ),
  },
];
// Short protocols that only appear after an ending has been seen.
const AFTER_ENDING: Record<'a' | 'b' | 'c', Line[][]> = {
  a: [
    [L('nina', 'Ставлю десяту чашку, а потім прибираю. Руки не слухаються.')],
    [
      L(
        'lev',
        'Світає без домофона. Тихо так, що чути власне серце. Незвично.',
      ),
    ],
    [
      L(
        'galyna',
        'Слухали: чи не пора повернути квартиру нуль у реєстр. Ухвалили: тримати місце.',
      ),
    ],
  ],
  b: [
    [
      L(
        'intercom',
        'Мене попросили не дзвонити в усі квартири одразу. Я намагаюся.',
      ),
    ],
    [
      L(
        'danilo',
        'Я приробив домофону ніжки від мікрохвильовки. Він ходить боком.',
      ),
    ],
    [
      L(
        'marta',
        'Нова скарга: домофон нарешті ходить, а підлогу не витирає. Реєструю.',
      ),
    ],
  ],
  c: [
    [
      L(
        'svitanok',
        'Місто евакуйовано. Адміністратор на зв’язку. Скарг немає. Це підозріло.',
        { glitch: true },
      ),
    ],
    [L('lev', 'Став на пост. Охороняти нема що. Охороняю капці на пагорбі.')],
    [
      L(
        'spark',
        'У мережі тепер дивний шум. Ніби хтось сміється. Тихо й по-доброму.',
      ),
    ],
  ],
};
const PROTOCOLS: Line[][] = [
  [
    L(
      'galyna',
      'Протокол № {runs}. Слухали: чергове падіння будинку. Ухвалили: не падати.',
    ),
    L('intercom', 'Ухвалено одноголосно. Я теж голосував.'),
  ],
  [
    L(
      'galyna',
      'Протокол № {runs}. Присутні: всі, хто вижив. Відсутні: дах. Питання даху перенесено.',
    ),
  ],
  [
    L(
      'galyna',
      'Протокол № {runs}. Слухали: скаргу Марти на гучні вибухи. Ухвалили: вибухати тихіше.',
    ),
  ],
  [
    L(
      'nina',
      'Чай ще гарячий. Він завжди гарячий, коли ви повертаєтеся. Дивно, правда?',
    ),
  ],
  [
    L(
      'boris',
      'Кошторис на наступну спробу: пальне, заклепки, валідол. Затверджую сам.',
    ),
  ],
  [
    L(
      'intercom',
      'Шановні мешканці. Нагадуємо: смерть не звільняє від внесків в ОСББ.',
    ),
  ],
  [
    L(
      'galyna',
      'Протокол № {runs}. Слухали: голову. Ухвалили: вірити голові. Поки що.',
    ),
  ],
  [
    L(
      'lev',
      'Я знову стояв на посту, поки ви вмирали. Наступного разу стоятиму ближче.',
    ),
  ],
  [
    L(
      'galyna',
      'Протокол № {runs}. Слухали: чому ліворуч. Ухвалили: праворуч теж погано.',
    ),
    L('intercom', 'Статистично ліворуч гірше. Тобто… так кажуть.'),
  ],
  [
    L(
      'flora',
      'М’ята знову виросла. Я не поливала. Петля її, мабуть, поливає.',
    ),
  ],
];
const WIN_LINES: Line[][] = [
  [
    L(
      'galyna',
      'Протокол № {runs}. Слухали: будинок дійшов. Ухвалили: справу 04:17 не закривати. Щось тут не сходиться.',
    ),
  ],
  [L('nina', 'Ви дійшли. А десята чашка все одно тепла. Для кого, га?')],
];

// The protocol lines to pick from: the usual ones plus those of every ending
// the player has seen.
function protocolPool(meta: Meta, won: boolean): Line[][] {
  return [
    ...(won ? WIN_LINES : PROTOCOLS),
    ...(meta.endings ?? []).flatMap((e) => AFTER_ENDING[e] ?? []),
  ];
}

// The scene for the hub after a run: the next story beat not seen yet,
// otherwise a protocol that varies by run number.
export function hubScene(meta: Meta, won: boolean): Scene {
  const seen = new Set(meta.scenesSeen ?? []);
  const beat = HUB_BEATS.find((b) => !seen.has(b.scene.id) && b.when(meta));
  if (beat) return beat.scene;
  const pool = protocolPool(meta, won);
  const lines = pool[(meta.runs * 7 + (meta.kills % 5)) % pool.length];
  return {
    id: `hub-${won ? 'victory' : 'protocol'}-${meta.runs}`,
    title: 'Притулок',
    lines,
  };
}

// Boss intro lines: the machines remember the attempt number.
const BOSS_TAUNTS = [
  [
    'Будинок № 17. Спроба {attempt}. Перепустку не пред’явлено. Прохід заборонено.',
    'Знову ви. Спроба {attempt}. Я пам’ятаю ваш фасад. І вашу тріщину на третьому поверсі.',
  ],
  [
    'Шкідника виявлено. Спроба {attempt}. Обробку розпочато.',
    'Спроба {attempt}. Ви живучі, як бур’ян. Я поважаю бур’ян.',
  ],
  [
    'Ядро під захистом. Спроба {attempt}. Ваш запит поставлено в чергу.',
    'Спроба {attempt}. Ви ще не зрозуміли? Я не тримаю вас тут. Вас тримає хтось зі своїх.',
  ],
];
// The machine's line on the boss intro card; it remembers the attempt.
export function bossQuote(run: Pick<Run, 'chapter'>, meta: Meta) {
  const chapter = Math.min(2, Math.max(0, run.chapter)),
    repeat = (meta.totalBosses ?? 0) > chapter || (meta.runs ?? 0) > 2;
  return fillLine(BOSS_TAUNTS[chapter][repeat ? 1 : 0], meta, '');
}

// Rescue card quotes: the first meeting, then short "our own" greetings.
const RESCUE_FIRST: Record<string, string> = {
  marta:
    'Нарешті! Я на вас скаргу пишу з 04:17. Номер триста одинадцять. Беріть мене на борт — допишу там.',
  danilo:
    'Я знав, що ви прийдете! Я тут дрон зібрав із тостера. Він майже не горить.',
  solomia: 'Я грала на даху, щоб не було страшно. Ви почули? Значить, недарма.',
  nina: 'Дитино, ти по мене? Я чайник узяла. І десять чашок.',
  lev: 'Пост здав, пост прийняв. Куди йдемо, голово?',
  mechanic: 'Ноги скриплять? Зараз змащу. Я цей будинок знаю, як свої коліна.',
  spark: 'Мережа мертва, а мій щиток живий. Беріть мене — і щиток.',
  flora: 'Обережно з плющем, він нервовий. Я з вами. Він теж.',
  boris: 'Прийшли по мене? Чудово. Врахуймо це як командировку.',
};
const RESCUE_AGAIN: Record<string, string[]> = {
  marta: [
    'Знову ви. Скаргу номер триста одинадцять ще не розглянули, між іншим.',
    'Я вже й не дивуюся. Тримайте руку.',
  ],
  danilo: [
    'Я чекав біля трансформатора, як минулого разу. Ну, як завжди.',
    'Дрон готовий! Цього разу — з двома тостерами.',
  ],
  solomia: [
    'Я знову грала. Ти знову прийшов. Це вже наша пісня.',
    'Мені снилося, що я вже сідала в цей будинок. Сто разів.',
  ],
  nina: ['Чай ще гарячий. Він завжди гарячий, коли ви приходите.'],
  lev: ['Знову ти, голово. Я вже чекаю біля цього самого стовпа.'],
  mechanic: ['Прийняв. Я біля трансформатора, як завжди.'],
  spark: ['Щиток цілий. Я вже знала, що прийдеш.'],
  flora: ['Плющ тебе впізнав. Це добрий знак. Мабуть.'],
  boris: ['Командировка номер… я збився з ліку. Поїхали.'],
};
export function rescueQuote(id: string, meta: Meta) {
  const again = (meta.totalRescues ?? 0) > 2 && RESCUE_AGAIN[id];
  if (again) return again[(meta.runs + meta.totalRescues) % again.length];
  return RESCUE_FIRST[id] ?? null;
}

// Radio barks during a fight, keyed by CombatBeat kinds.
export interface Bark {
  who: SpeakerId;
  text: string;
}
const BARKS: Record<string, Bark[]> = {
  start: [
    { who: 'lev', text: 'Контакт! Усі на місцях.' },
    { who: 'intercom', text: 'Шановні мешканці, тримайтеся за поручні.' },
    { who: 'boris', text: 'Боєприпаси списую на господарські потреби.' },
    { who: 'mechanic', text: 'Гідравліка тримає. Поки що.' },
  ],
  wave: [
    { who: 'lev', text: 'Ще йдуть! Я бачу їх із даху.' },
    { who: 'spark', text: 'Нова хвиля. Щиток гріється, але тримає.' },
    { who: 'marta', text: 'Скільки ж вас? Я на кожного окрему скаргу напишу!' },
    { who: 'danilo', text: 'Вау, скільки їх! Можна я порахую? Ні? Ну добре.' },
    {
      who: 'intercom',
      text: 'Нова хвиля. Рекомендую не панікувати. Паніку беру на себе.',
    },
    {
      who: 'galyna',
      text: 'Наступний пункт порядку денного. Він, на жаль, озброєний.',
    },
  ],
  final: [
    { who: 'lev', text: 'Ватажок! Бачу ватажка!' },
    {
      who: 'galyna',
      text: 'Останній пункт порядку денного. Голосуйте вогнем.',
    },
    { who: 'solomia', text: 'Фінальний акорд. Грай гучніше.' },
  ],
  chief: [
    { who: 'boris', text: 'Ватажка списано. Акт складу пізніше.' },
    { who: 'marta', text: 'Ха! Скаргу задоволено.' },
    { who: 'danilo', text: 'Ми його зробили! Я бачив! Я все бачив!' },
    {
      who: 'intercom',
      text: 'Ватажка вилучено з реєстру. Дякуємо за співпрацю.',
    },
  ],
  broken: [
    { who: 'nina', text: 'Все, все, заходьте. Чай вистигає.' },
    { who: 'intercom', text: 'Двір вільний. Дякуємо за співпрацю.' },
    { who: 'lev', text: 'Тихо. Можна дихати.' },
  ],
  event: [
    { who: 'spark', text: 'Щось змінилося в полі. Будьте уважні.' },
    {
      who: 'intercom',
      text: 'Позапланова подія. Не панікуйте. Я панікую за вас.',
    },
  ],
  phase: [
    { who: 'intercom', text: 'Увага. Ворог розлючений. Рекомендую ривок.' },
    { who: 'galyna', text: 'Він змінив тактику. Ми теж можемо.' },
    { who: 'flora', text: 'Він як плющ — чим більше ріжеш, тим більше лізе.' },
  ],
  stagger: [
    { who: 'mechanic', text: 'Він хитається! Бий зараз!' },
    { who: 'spark', text: 'Броня тріснула! Час!' },
    {
      who: 'intercom',
      text: 'Увага: ворог послабив захист. Це не жарт. Це можливість.',
    },
  ],
};
export function combatBark(
  kind: string,
  aboard: string[],
  seed: number,
): Bark | null {
  const pool = (BARKS[kind] ?? []).filter(
    (b) =>
      SPEAKERS[b.who as Exclude<SpeakerId, 'captain'>]?.portrait !==
        'resident' || aboard.includes(b.who),
  );
  if (!pool.length) return null;
  return pool[Math.abs(seed) % pool.length];
}

// Fills {attempt}, {runs}, {captain} placeholders.
export function fillLine(text: string, meta: Meta, captain: string) {
  return text
    .replace(/\{attempt\}/g, String((meta.runs ?? 0) + 1))
    .replace(/\{runs\}/g, String(Math.max(1, meta.runs ?? 0)))
    .replace(/\{captain\}/g, CAPTAINS[captain]?.name ?? 'голова');
}

// Hub protocols differ every run, so they are never listed as seen.
const PROTOCOL_SCENE = /^hub-(protocol|victory)-\d+$/;

// Leaving the current scene. Its clues are kept (skipping included), hub
// protocols stay unlisted, a chain moves on to its next scene, and a scene
// that decides the ending falls back to the first ending when dismissed.
export function leaveScene(
  meta: Meta,
  queue: readonly string[],
  choice?: Choice,
): { meta: Meta; queue: string[] } {
  const progress = meta.sceneProgress;
  if (!progress) return { meta, queue: [...queue] };
  const scene = storyScene(progress.id, meta);
  let ending = choice?.ending;
  if (!ending && scene?.choices?.some((c) => c.ending)) ending = 'a';
  const nextId = ending ? `ending-${ending}` : queue[0];
  let next: Meta = {
    ...meta,
    scenesSeen: PROTOCOL_SCENE.test(progress.id)
      ? meta.scenesSeen
      : [...new Set([...meta.scenesSeen, progress.id])],
    sceneProgress: nextId ? { id: nextId, index: 0 } : null,
  };
  if (scene?.clues) next = addClues(next, scene.clues);
  if (ending) next = addEnding(next, ending);
  return { meta: next, queue: ending ? [] : queue.slice(1) };
}

// After a non-final boss win: this boss's last word, then the new location,
// each only the first time (an endless circuit starts without a recap).
export function victoryChain(meta: Meta, chapter: number, looped: boolean) {
  return looped
    ? []
    : [`victory-${chapter}`, `arrival-${chapter + 1}`].filter(
        (id) => !meta.scenesSeen.includes(id),
      );
}

// After a raid: the final win opens the finale; otherwise the next Shelter
// beat is a scene, or a short protocol shown inside the result window.
export function raidEnd(
  meta: Meta,
  won: boolean,
  final: boolean,
): { scene: string | null; protocol?: Line[] } {
  if (final) return { scene: 'finale' };
  const beat = hubScene(meta, won);
  return PROTOCOL_SCENE.test(beat.id)
    ? { scene: null, protocol: beat.lines }
    : { scene: beat.id };
}

// Applies the clues of a watched scene or a picked choice to the profile.
export function addClues(meta: Meta, ids: readonly string[] = []): Meta {
  const known = new Set(meta.clues ?? []);
  const fresh = ids.filter((id) => CLUE_BY_ID[id] && !known.has(id));
  return fresh.length
    ? { ...meta, clues: [...(meta.clues ?? []), ...fresh] }
    : meta;
}
export function addEnding(meta: Meta, id: 'a' | 'b' | 'c'): Meta {
  return (meta.endings ?? []).includes(id)
    ? meta
    : { ...meta, endings: [...(meta.endings ?? []), id] };
}
export const LIBRARY_SCENES = Object.values(SCENES).filter((s) => s.library);
// Replayable scenes in the «Історія» library: the story plus the monsters' origins.
export const LIBRARY_IDS = [...LIBRARY_SCENES.map((s) => s.id), 'origins'];

// Story beats told in the Shelter between raids (one per raid end).
export const HUB_SCENES = HUB_BEATS.map((b) => b.scene);
const HUB_BY_ID: Record<string, Scene> = Object.fromEntries(
  HUB_BEATS.map((b) => [b.scene.id, b.scene]),
);
const PROTOCOL_ID = /^hub-(protocol|victory)-\d+$/;
// True for any scene this module can build (saves keep only known ids).
export const isStoryId = (id: unknown): id is string =>
  typeof id === 'string' &&
  (Object.hasOwn(SCENES, id) ||
    Object.hasOwn(HUB_BY_ID, id) ||
    PROTOCOL_ID.test(id));
export function storyScene(id: string, meta: Meta): Scene | null {
  if (Object.hasOwn(SCENES, id)) return SCENES[id];
  if (Object.hasOwn(HUB_BY_ID, id)) return HUB_BY_ID[id];
  const m = PROTOCOL_ID.exec(id);
  if (!m) return null;
  const pool = protocolPool(meta, m[1] === 'victory'),
    n = Number(id.slice(id.lastIndexOf('-') + 1));
  return {
    id,
    title: 'Притулок',
    lines: pool[(n * 7 + ((meta.kills ?? 0) % 5)) % pool.length],
  };
}

// Every line that can be voiced: scenes and replies, Shelter protocols,
// boss taunts, rescue greetings, radio barks and perk offers. A line with the
// number of the attempt or protocol is recorded for each number up to
// VOICED_NUMBERS (later ones stay text); any other {placeholder} is not voiced.
// The chosen head's lines exist once per head, in that head's own voice.
export const VOICED_NUMBERS = 8;
// The machines of the city speak with the voice of the Світанок system.
export const BOSS_VOICE: VoiceKey = 'svitanok';
export interface VoiceLine {
  id: string;
  key: VoiceKey;
  text: string;
}
export function voiceLines(): VoiceLine[] {
  const out = new Map<string, VoiceLine>();
  const add = (key: string | null, text: string) => {
    if (!key) return;
    if (/\{(attempt|runs)\}/.test(text)) {
      for (let n = 1; n <= VOICED_NUMBERS; n++)
        add(key, text.replace(/\{(attempt|runs)\}/g, String(n)));
      return;
    }
    if (/\{[a-z]+\}/.test(text)) return;
    const id = voiceId(key, text);
    out.set(id, { id, key: key as VoiceKey, text });
  };
  const fromLine = (l: { who: string; text: string }) => {
    if (l.who === 'captain') for (const head of HEAD_VOICES) add(head, l.text);
    else add(voiceKeyFor(l.who, ''), l.text);
  };
  for (const scene of [...Object.values(SCENES), ...HUB_SCENES]) {
    scene.lines.forEach(fromLine);
    for (const c of scene.choices ?? []) if (c.reply) fromLine(c.reply);
  }
  for (const lines of [
    ...PROTOCOLS,
    ...WIN_LINES,
    ...Object.values(AFTER_ENDING).flat(),
  ])
    lines.forEach(fromLine);
  for (const texts of BOSS_TAUNTS)
    for (const text of texts) add(BOSS_VOICE, text);
  for (const [id, text] of Object.entries(RESCUE_FIRST)) add(id, text);
  for (const [id, texts] of Object.entries(RESCUE_AGAIN))
    for (const text of texts) add(id, text);
  for (const pool of Object.values(BARKS)) pool.forEach(fromLine);
  for (const [owner, texts] of Object.entries(OFFER_LINES))
    for (const text of texts) add(owner, text);
  return [...out.values()];
}
