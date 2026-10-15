// Builds the web version for GitHub Pages into .pages/ (sub-path base, offline
// cache for that base, the APK linked from the latest GitHub Release).
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
const repo = process.env.OSBB_REPO ?? 'valera99686/osbb-end-of-world';
const name = repo.split('/')[1];
const env = {
  ...process.env,
  OSBB_BASE: `/${name}/`,
  OSBB_OUT: '.pages',
  OSBB_APK_URL: `https://github.com/${repo}/releases/latest/download/osbb.apk`,
};
const run = (args) => {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
await rm('.pages', { recursive: true, force: true });
run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.game.config.ts']);
// The APK is downloaded from the Release, not shipped inside the site.
await rm('.pages/downloads', { recursive: true, force: true });
await writeFile('.pages/.nojekyll', '');
run(['scripts/postbuild.mjs']);
console.log(`Pages build ready in .pages (base /${name}/)`);
