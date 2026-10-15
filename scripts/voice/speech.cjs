// Turns a line of the game into what a speaker should read aloud: numbers and
// abbreviations in words, stage directions removed, shouting in lower case.
const UNITS = ['нуль', 'один', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"];
const TEENS = ['десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', "п'ятнадцять", 'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять"];
const TENS = ['', '', 'двадцять', 'тридцять', 'сорок', "п'ятдесят", 'шістдесят', 'сімдесят', 'вісімдесят', "дев'яносто"];

function words(n) {
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + UNITS[n % 10] : '');
  throw new Error('number too large for speech: ' + n);
}

// Ordinals for a year's last two digits: 86 -> "вісімдесят шостий".
const ORD_UNITS = ['', 'перший', 'другий', 'третій', 'четвертий', "п'ятий", 'шостий', 'сьомий', 'восьмий', "дев'ятий"];
const ORD_TEENS = ['десятий', 'одинадцятий', 'дванадцятий', 'тринадцятий', 'чотирнадцятий', "п'ятнадцятий", 'шістнадцятий', 'сімнадцятий', 'вісімнадцятий', "дев'ятнадцятий"];
const ORD_TENS = ['', '', 'двадцятий', 'тридцятий', 'сороковий', "п'ятдесятий", 'шістдесятий', 'сімдесятий', 'вісімдесятий', "дев'яностий"];
function ordinal(n) {
  if (n < 10) return ORD_UNITS[n];
  if (n < 20) return ORD_TEENS[n - 10];
  if (n % 10 === 0) return ORD_TENS[n / 10];
  return TENS[Math.floor(n / 10)] + ' ' + ORD_UNITS[n % 10];
}
// A year 2000-2099 is read as a date: "2086" -> "дві тисячі вісімдесят шостий".
function year(n) {
  const rest = n - 2000;
  return rest ? `дві тисячі ${ordinal(rest)}` : 'дві тисячі';
}

function speech(text) {
  let s = text;
  // Stage directions are for the reader, not the voice.
  s = s.replace(/\s*\((?:пауза|шурхіт|тиша|тихо)\)\s*/gi, ' ');
  // Times: 04:17 is the loop's name; the hour takes the case its preposition
  // asks for ("з четвертої сімнадцять", "о четвертій сімнадцять").
  const CYR = '[А-Яа-яІіЇїЄєҐґ]';
  s = s.replace(
    new RegExp(`(?<!${CYR})(з|до|після|від|о)\\s+(\\d{2}):(\\d{2})(?!\\d)`, 'gi'),
    (_, prep, h, m) => {
      const hour = Number(h),
        low = prep.toLowerCase();
      const form =
        hour === 4 ? (low === 'о' ? 'четвертій' : 'четвертої') : words(hour);
      return `${prep} ${form} ${words(Number(m))}`;
    },
  );
  s = s.replace(/(?<!\d)(\d{2}):(\d{2})(?!\d)/g, (_, h, m) => `${words(Number(h))} ${words(Number(m))}`);
  s = s.replace(/(?<!\d)(20\d{2})(?!\d)/g, (_, n) => year(Number(n)));
  s = s.replace(/ДМ-(\d+)/g, (_, n) => `Де-Ем ${words(Number(n))}`);
  s = s.replace(/ОСББ/g, 'О-Ес-Бе-Бе');
  s = s.replace(/№\s*(\d+)/g, (_, n) => `номер ${words(Number(n))}`);
  s = s.replace(/№/g, 'номер');
  s = s.replace(
    new RegExp(`(?<!${CYR})(мешкан(?:ець|ця))\\s+кв\\.\\s*(\\d+)`, 'gi'),
    (_, w, n) => `${w} квартири ${words(Number(n))}`,
  );
  s = s.replace(
    new RegExp(`(?<!${CYR})(кв)\\.\\s*(\\d+)`, 'gi'),
    (_, w, n) => `${w[0] === 'К' ? 'Квартира' : 'квартира'} ${words(Number(n))}`,
  );
  s = s.replace(/-(\d+)\b/g, (_, n) => ` ${words(Number(n))}`);
  s = s.replace(/\b\d+\b/g, (n) => words(Number(n)));
  // Shouting: УВАГА. ЕВАКУАЦІЯ. -> Увага. Евакуація.
  s = s.replace(/[А-ЯІЇЄҐ]{4,}/g, (w, i) => {
    const lower = w.toLowerCase(),
      before = s.slice(0, i).trimEnd();
    return !before || /[.!?…]$/.test(before) ? lower[0].toUpperCase() + lower.slice(1) : lower;
  });
  return s.replace(/\s{2,}/g, ' ').trim();
}

module.exports = { speech, words };
