import type { Line, Scene } from './story';
import { BOSS_VARIANTS } from './encounters';
import { ORIGIN_ART } from './cutscenes';

// The nine bosses of the campaign (three per location) as characters. Each has
// a line for the intro card of the fight (the first time, and when the crew
// comes back to it) and last words after the fight, answered by someone aboard.
// Everyone in the city is waiting for somebody to confirm that it may go on:
// the bosses are the guards of that wait, and each remembers it in their own way.
// The machines speak with the voice of the Світанок system.
interface BossCharacter {
  intro: [first: string, again: string];
  last: string;
  // Who answers the last words, and what they say.
  reply: { who: Line['who']; text: string };
}

const BOSS_CHARACTERS: Record<string, BossCharacter> = {
  commandant: {
    intro: [
      'Район закрито. Перепустки нема, отже, прохід заборонено. Мій наказ: тримати браму, доки диспетчер не підтвердить усі адреси.',
      'Будинок № 17. Ви вже були. Я щоразу перевіряю ваш реєстр, і щоразу бракує одного.',
    ],
    last: 'Адреси підтверджено. Не всі. Але я стою тут так довго, що вже не пам’ятаю, для кого. Проходьте. Мій наказ сильніший за мене, а ви, здається, ні.',
    reply: {
      who: 'lev',
      text: 'Він просто стояв на посту. Я теж стояв. Тільки в мене були коліна, а в нього наказ.',
    },
  },
  'scrap-press': {
    intro: [
      'Усе, що не рухається, це брухт. Усе, що рухається, це майбутній брухт. Стійте рівно, будинку.',
      'Ви знову цілі. Це непорядок. Зараз виправлю.',
    ],
    last: 'Стискати… нічого… Я лише хотів, щоб усе було рівно. Щоб ніщо більше не впало.',
    reply: {
      who: 'mechanic',
      text: 'Йому теж страшно, що щось упаде. Ми з ним родичі, виходить.',
    },
  },
  signalman: {
    intro: [
      'Патруль, до всіх постів. Невпізнаний будинок у секторі. Назвіть позивний. Хто відповість, тому й повірю.',
      'Знову ви. Я викликаю пости, а відповідаєте лише ви. Отже, постів нема, є тільки ви.',
    ],
    last: 'Пост шостий, відповідайте… Пост шостий. Пост… (тиша) …Ага. Нікого. Давно нікого.',
    reply: {
      who: 'spark',
      text: 'Він стільки ночей кликав порожні пости. Не дивно, що він такий злий.',
    },
  },
  'root-mother': {
    intro: [
      'Я тримаю кожен ваш слід. Кожен крок у моєму корінні. Ви йдете назад? Лишайтеся, тут тепло.',
      'Ви повертаєтесь, а я пам’ятаю. Кожну спробу. Хочете подивитися? Вони всі в землі.',
    ],
    last: 'Я не ловила вас. Я… берегла сліди. Щоб ви знайшли дорогу додому, коли… ніхто більше…',
    reply: {
      who: 'flora',
      text: 'Вона не тримала. Вона пам’ятала. Це не те саме, але дуже схоже на любов.',
    },
  },
  irrigator: {
    intro: [
      'Полив за розкладом. Вас у розкладі нема, отже, ви бур’ян. Вологість: підвищити.',
      'Бур’ян повернувся. Розклад не змінено. Вологість: підвищити.',
    ],
    last: 'Розклад порожній. Поливати нікого. Стривай. Ти ж живий? Пий.',
    reply: {
      who: 'nina',
      text: 'Бідолаха. Стільки ночей поливав порожнє. Налийте йому чаю, хай хоч щось тепле.',
    },
  },
  queen: {
    intro: [
      'Мої діти голодні, а ви пахнете металом і чаєм. Це майже обід.',
      'Мої діти пам’ятають ваш смак. Вони просили добавки.',
    ],
    last: 'Діти… тихо… спіть. Мама втомилась.',
    reply: {
      who: 'solomia',
      text: 'Колискова діє на всіх. Навіть на цю. Я їй трохи заспівала, і вона не заперечувала.',
    },
  },
  architect: {
    intro: [
      'Місто побудовано правильно. Помилка в плані одна: ви. Знесення почнеться негайно.',
      'Ви знову не вписуєтесь у креслення. Допишу вас кварталом нижче.',
    ],
    last: 'У плані було дві дороги. Одна вела до вас. Я її закреслив. Вибачте.',
    reply: {
      who: 'mechanic',
      text: 'Він сам собі закреслив дорогу додому. Ну хто так креслить.',
    },
  },
  collector: {
    intro: [
      'Вихід коштує. Перепустка коштує. Навіть пам’ять коштує. Ваш борг записано в реєстр, мешканцю.',
      'Баланс будинку № 17: одна гривня щомісяця від квартири нуль. Усе інше в боргу.',
    ],
    last: 'Рахунок закрито. Здачі не треба. Це вперше за весь час.',
    reply: {
      who: 'boris',
      text: 'Він закрив рахунок і не взяв здачі. Я такого у своїй бухгалтерії не бачив.',
    },
  },
  chronarch: {
    intro: [
      'Тут завжди 04:17. Ви можете лишитися. Тут усі ще живі, і ніхто нікуди не запізнюється.',
      'Ви повернулися. Люди завжди повертаються до 04:17. Це найтепліша хвилина доби.',
    ],
    last: 'Чотири вісімнадцять. Я ніколи не бачив цієї цифри. Вона… (пауза) …гарна.',
    reply: {
      who: 'galyna',
      text: 'Він теж чекав, що хтось скаже: можна далі. Ми всі чекаємо цього, дитино.',
    },
  },
};

export const BOSS_IDS = BOSS_VARIANTS.map((b) => b.id);
export const bossName = (id: string) =>
  BOSS_VARIANTS.find((b) => b.id === id)?.name ?? 'Бос';

// The boss's line on the intro card, or null for an id with no character.
export function bossIntro(id: string, repeat: boolean): string | null {
  const c = BOSS_CHARACTERS[id];
  return c ? c.intro[repeat ? 1 : 0] : null;
}

// Every intro line, for the voice-over.
export const bossIntroLines = (): string[] =>
  Object.values(BOSS_CHARACTERS).flatMap((c) => c.intro);

// The last words of a boss: the machine's own line, then the answer.
export const bossEndId = (id: string) => `boss-end-${id}`;
// The backdrop is the district where the boss stood.
const DISTRICT_ART = [ORIGIN_ART.scrap, ORIGIN_ART.greenhouse, ORIGIN_ART.pursuit];
export function bossEndScenes(): Record<string, Scene> {
  const out: Record<string, Scene> = {};
  for (const [id, c] of Object.entries(BOSS_CHARACTERS))
    out[bossEndId(id)] = {
      id: bossEndId(id),
      title: bossName(id),
      library: true,
      lines: [
        {
          who: 'boss',
          boss: id,
          text: c.last,
          glitch: true,
          art: DISTRICT_ART[BOSS_VARIANTS.find((b) => b.id === id)?.location ?? 0],
        },
        { who: c.reply.who, text: c.reply.text },
      ],
    };
  return out;
}
