// Where the game is served from: "/" at the root (APK, local server) and
// "/osbb-end-of-world/" on GitHub Pages. vite.game.config.ts injects __BASE__;
// without it (tests, Node) the root is assumed.
export function asset(path: string) {
  const base = typeof __BASE__ === 'string' ? __BASE__ : '/';
  return base + path.replace(/^\//, '');
}
