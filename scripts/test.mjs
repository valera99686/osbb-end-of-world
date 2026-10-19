import ts from 'typescript';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const modules = [
  'assets',
  'data',
  'backpack',
  'bosses',
  'minibosses',
  'lore',
  'residents',
  'apartments',
  'furniture',
  'equipment',
  'cutscenes',
  'campaign-content',
  'encounters',
  'progression',
  'specials',
  'modes',
  'upgrades',
  'weapons',
  'heroes',
  'voice',
  'voice-manifest',
  'barks',
  'story',
  'achievements',
  'model',
  'save',
  'profile',
  'arena',
  'enemy-art',
  'audio',
  'engine',
];
const tests = [
  'tests/game.test.cjs',
  'tests/campaign.test.cjs',
  'tests/apartments.test.cjs',
  'tests/progression.test.cjs',
  'tests/features.test.cjs',
  'tests/achievements.test.cjs',
  'tests/audio.test.cjs',
  'tests/feel.test.cjs',
  'tests/combat-variety.test.cjs',
  'tests/ui-flow.test.cjs',
  'tests/rewards.test.cjs',
  'tests/combat-feel.test.cjs',
  'tests/perks.test.cjs',
  'tests/weapons.test.cjs',
  'tests/story.test.cjs',
  'tests/voice.test.cjs',
  'tests/assets.test.cjs',
  'tests/heroes.test.cjs',
];
// Both lists are explicit; a module or test left out fails here, not later.
const missing = [
  ...(await readdir('lib/game'))
    .filter((f) => f.endsWith('.ts') && !modules.includes(f.slice(0, -3)))
    .map((f) => `lib/game/${f}`),
  ...(await readdir('tests'))
    .map((f) => `tests/${f}`)
    .filter((f) => f.endsWith('.test.cjs') && !tests.includes(f)),
];
if (missing.length) {
  console.error(`Add to scripts/test.mjs: ${missing.join(', ')}`);
  process.exit(1);
}
await mkdir('.test-build', { recursive: true });
await writeFile('.test-build/package.json', '{"type":"commonjs"}');
for (const name of modules) {
  const source = await readFile(`lib/game/${name}.ts`, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });
  await writeFile(`.test-build/${name}.js`, result.outputText);
}
const test = spawnSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit',
});
process.exitCode = test.status ?? 1;
