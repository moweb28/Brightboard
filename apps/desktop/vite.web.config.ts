import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * The browser version: the same screens as the desktop app, built as a website into out/web.
 * The relay serves it, so people can join from a phone, tablet or any computer without installing.
 * `npm run build:web` (uses .env.web).
 */
export default defineConfig({
  root: 'src/renderer',
  envDir: '../..',
  base: '/',
  plugins: [react()],
  // Transcripts are desktop-only: their speech model is bigger than the 25 MB a website file may be.
  resolve: { alias: [{ find: /^\.\.\/lib\/transcriber$/, replacement: fileURLToPath(new URL('./src/renderer/lib/transcriber.web.ts', import.meta.url)) }] },
  worker: { format: 'es' },
  build: { outDir: '../../out/web', emptyOutDir: true },
});
