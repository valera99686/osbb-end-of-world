import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };
// OSBB_BASE: "/" (default; APK and local) or a sub-path such as /osbb-end-of-world/.
// OSBB_OUT: output folder, "build" by default. OSBB_APK_URL: external APK link.
const rawBase = process.env.OSBB_BASE ?? '/';
const base = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
export default defineConfig({
  base,
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BASE__: JSON.stringify(base),
    __APK_URL__: JSON.stringify(process.env.OSBB_APK_URL ?? ''),
  },
  build: { outDir: process.env.OSBB_OUT ?? 'build', sourcemap: false },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/.tools/**',
        '**/.android-build/**',
        '**/.test-build/**',
        '**/releases/**',
      ],
    },
  },
});
