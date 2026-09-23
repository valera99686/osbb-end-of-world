import ts from 'typescript';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.test-build', { recursive: true });
await writeFile('.test-build/package.json', '{"type":"commonjs"}');
for (const name of [
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
  'model',
  'profile',
  'enemy-art',
  'engine',
]) {
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
const test = spawnSync(
  process.execPath,
  [
    '--test',
    'tests/game.test.cjs',
    'tests/campaign.test.cjs',
    'tests/apartments.test.cjs',
    'tests/progression.test.cjs',
  ],
  {
    stdio: 'inherit',
  },
);
process.exitCode = test.status ?? 1;
