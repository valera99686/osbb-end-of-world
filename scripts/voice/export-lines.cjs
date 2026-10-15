// Writes every voiced line of the game as JSON for generate.py:
//   [{ id, key, text, speech }]
// Run `npm test` first: it builds the modules this reads from .test-build/.
const fs = require('node:fs');
const path = require('node:path');
const { speech } = require('./speech.cjs');
const story = require('../../.test-build/story.js');

const out = process.argv[2] || path.join(__dirname, 'lines.json');
const lines = story.voiceLines().map((l) => ({ ...l, speech: speech(l.text) }));
const bad = lines.filter((l) => /\d|№|\(|\)|[A-Z]{2,}|[А-ЯІЇЄҐ]{4,}/.test(l.speech));
if (bad.length) {
  console.error('Unspoken symbols left in:', bad.map((l) => l.speech));
  process.exit(1);
}
fs.writeFileSync(out, JSON.stringify(lines, null, 1));
console.log(`${lines.length} lines -> ${out}`);
