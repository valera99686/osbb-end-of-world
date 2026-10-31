// Writes every voiced line of the game as JSON for the voice generators:
//   [{ id, key, text, speech }]
// `speech` is what the voice reads, with the emotion tags of the engine:
// OmniVoice (generate.py) by default, Eleven v4 (eleven.py) with --eleven.
// Run `npm test` first: it builds the modules this reads from .test-build/.
const fs = require('node:fs');
const path = require('node:path');
const { speech } = require('./speech.cjs');
const { tone } = require('./tones.cjs');
const { elevenSpeech } = require('./eleven-tones.cjs');
const story = require('../../.test-build/story.js');

const args = process.argv.slice(2),
  eleven = args.includes('--eleven'),
  out = args.find((a) => !a.startsWith('--')) || path.join(__dirname, eleven ? 'lines-eleven.json' : 'lines.json');
const lines = story
  .voiceLines()
  .map((l) => ({ ...l, speech: eleven ? elevenSpeech(l.text) : tone(l.text, speech(l.text)) }));
const bad = lines.filter((l) => /\d|№|\(|\)|[A-Z]{2,}|[А-ЯІЇЄҐ]{4,}/.test(l.speech.replace(/\[[a-z-]+\]/g, '')));
if (bad.length) {
  console.error('Unspoken symbols left in:', bad.map((l) => l.speech));
  process.exit(1);
}
fs.writeFileSync(out, JSON.stringify(lines, null, 1));
console.log(`${lines.length} lines -> ${out}`);
