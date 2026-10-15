// Emotion for the voice-over. OmniVoice understands a few inline tags: a sigh,
// a laugh, surprise, displeasure, agreement. They are added to the text that is
// *spoken* only; the line on screen (and its recording id) stays as written.
//
// A rule matches a line by a piece of its text (so the numbered variants and the
// four heads share it) and puts a tag at the start (`lead`), at the end (`tail`)
// or in place of a word (`swap`). The first matching rule wins. Keep it sparse:
// a tag is a noise the model makes, so a line with one tag is acted, a line with
// five is a mess.
const TAGS = [
  '[laughter]',
  '[sigh]',
  '[confirmation-en]',
  '[question-en]',
  '[question-ah]',
  '[question-oh]',
  '[question-ei]',
  '[question-yi]',
  '[surprise-ah]',
  '[surprise-oh]',
  '[surprise-wa]',
  '[surprise-yo]',
  '[dissatisfaction-hnn]',
];

const SIGH = '[sigh]',
  LAUGH = '[laughter]',
  OH = '[surprise-oh]',
  AH = '[surprise-ah]',
  HNN = '[dissatisfaction-hnn]',
  YES = '[confirmation-en]';

const TONES = [
  // Resignation, grief, tenderness.
  { has: 'Так… Так, мабуть.', lead: SIGH },
  { has: 'Квартира нуль. Моя провина.', lead: SIGH },
  { has: 'Рішення за тобою. Протокол я підпишу', lead: SIGH },
  { has: 'Він пам’ятає, де я впала на мосту', lead: SIGH },
  { has: 'А я лишився на стіні.', lead: SIGH },
  { has: 'Світає без домофона', lead: SIGH },
  { has: 'Кущ облисів.', lead: SIGH },
  { has: 'Я теж так подумала. І мені від цього не по собі.', lead: SIGH },
  { has: 'Я знову стояв на посту, поки ви вмирали.', lead: SIGH },
  { has: 'Командировка номер… я збився з ліку.', lead: SIGH },
  { has: 'Я вже й не дивуюся.', lead: SIGH },
  { has: 'Дякую. Я теж так думала, поки не почула', lead: SIGH },
  { has: 'Ласкаво просимо додому. Знову.', lead: SIGH },
  { has: 'Ставлю десяту чашку, а потім прибираю.', lead: SIGH },
  { has: 'Я досі ставлю десяту чашку.', lead: SIGH },
  { has: 'Мені снилося, що я вже сідала в цей будинок.', lead: SIGH },
  // Jokes land with a laugh.
  { has: 'Мами тут нема.', tail: LAUGH },
  { has: 'Він майже не горить.', tail: LAUGH },
  { has: 'Фото вийшло з бородою.', tail: LAUGH },
  { has: 'Для науки.', tail: LAUGH },
  { has: 'Ну, як завжди.', tail: LAUGH },
  { has: 'з двома тостерами.', tail: LAUGH },
  { has: 'Ха! Скаргу задоволено.', swap: ['Ха!', LAUGH] },
  { has: 'Можна я порахую?', lead: '[surprise-wa]', swap: ['Вау,', ''], tail: LAUGH },
  { has: 'Ми його зробили!', lead: LAUGH },
  { has: 'Струм — це просто електрони', tail: LAUGH },
  { has: 'одна подяка і одна копійка.', tail: LAUGH },
  { has: 'Пробивний.', tail: LAUGH },
  { has: 'Кулями.', tail: LAUGH },
  { has: 'Він теж.', tail: LAUGH },
  // Surprise.
  { has: 'Ви прописали… ДОМОФОН?', lead: OH },
  { has: 'Тобто ти нас… тренував?', lead: OH },
  { has: 'Серії «Світанок-1»?', lead: OH },
  { has: 'Тобто кінець світу крутиться через протокол зборів?', lead: AH },
  { has: 'Дитино, ти по мене?', lead: AH },
  { has: 'Скільки ж вас?', lead: OH },
  // Displeasure, the complaints of Marta.
  { has: 'Знову ви. Скаргу номер триста одинадцять', lead: HNN },
  { has: 'Ці машини порушують тишу', lead: HNN },
  { has: 'Тоді навіщо я пам’ятаю тріск', lead: HNN },
  // Agreement.
  { has: 'Прийняв. Я біля трансформатора', lead: YES },
  { has: 'Записую. Рука не тремтить.', lead: YES },
  { has: 'Записую. Кошторис — святе.', lead: YES },
  { has: 'Пост здав, пост прийняв.', lead: YES },
];

// The spoken text of a line with its emotion: `shown` is the line as written,
// `spoken` its normalised form (numbers in words and so on).
function tone(shown, spoken) {
  const rule = TONES.find((t) => shown.includes(t.has));
  if (!rule) return spoken;
  let out = spoken;
  if (rule.swap) out = out.replace(rule.swap[0], rule.swap[1]);
  if (rule.lead) out = `${rule.lead} ${out}`;
  if (rule.tail) out = `${out} ${rule.tail}`;
  return out.replace(/\s{2,}/g, ' ').trim();
}

module.exports = { tone, TONES, TAGS };
