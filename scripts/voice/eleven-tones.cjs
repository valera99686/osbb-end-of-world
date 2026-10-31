// Emotion for the Eleven v4 voice-over. The model is directed by audio tags in
// square brackets ([sighs], [laughs], [gasps]...). They are added to the text
// that is *spoken* only; the line on screen (and its recording id) stays as
// written. The rules are those of tones.cjs (OmniVoice), with their tags
// translated, so a line keeps the same acting whichever engine speaks it.
const { speech } = require('./speech.cjs');
const { TONES } = require('./tones.cjs');

const TAG = {
  '[sigh]': '[sighs]',
  '[laughter]': '[laughs]',
  '[surprise-oh]': '[gasps]',
  '[surprise-ah]': '[gasps]',
  '[surprise-wa]': '[excited]',
  '[dissatisfaction-hnn]': '[annoyed]',
  '[confirmation-en]': '',
};
// Stage directions in a line become tags instead of being dropped.
const DIRECTIONS = [
  [/\s*\((?:пауза|тиша)\)\s*/gi, ' [pause] '],
  [/\s*\(шурхіт\)\s*/gi, ' [rustling] '],
  [/\s*\(тихо\)\s*/gi, ' [softly] '],
];

// What the voice reads for a line: numbers in words, directions as tags, then
// the emotion of the matching rule (at most one tag from the rules).
function elevenSpeech(shown) {
  let marked = shown;
  for (const [pattern, tag] of DIRECTIONS) marked = marked.replace(pattern, tag);
  let spoken = speech(marked).replace(/\s*\[(pause|rustling|softly)\]\s*/g, ' [$1] ');
  const rule = TONES.find((t) => shown.includes(t.has));
  if (rule) {
    const tag = (t) => (t in TAG ? TAG[t] : t);
    if (rule.swap) spoken = spoken.replace(rule.swap[0], tag(rule.swap[1]));
    if (rule.lead && tag(rule.lead)) spoken = `${tag(rule.lead)} ${spoken}`;
    if (rule.tail && tag(rule.tail)) spoken = `${spoken} ${tag(rule.tail)}`;
  }
  return spoken.replace(/\s{2,}/g, ' ').trim();
}

module.exports = { elevenSpeech };
