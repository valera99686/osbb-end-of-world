import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'build', sourcemap: false },
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
