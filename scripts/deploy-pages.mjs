// Publishes .pages/ to the gh-pages branch as a single fresh commit (history
// of the site is not kept, so the branch never grows). Run build:pages first.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
if (!existsSync('.pages/index.html')) {
  console.error('Run "npm run build:pages" first.');
  process.exit(1);
}
const git = (args, opts = {}) => {
  const r = spawnSync('git', args, { cwd: '.pages', stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const origin = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout.trim();
if (!origin) {
  console.error('No "origin" remote in this repository.');
  process.exit(1);
}
spawnSync('git', ['init', '-q', '-b', 'gh-pages'], { cwd: '.pages' });
git(['add', '-A']);
git(['-c', 'core.autocrlf=false', 'commit', '-q', '-m', 'Deploy the web version']);
git(['push', '-f', origin, 'gh-pages:gh-pages']);
console.log('Published to the gh-pages branch.');
