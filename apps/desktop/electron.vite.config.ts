import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  // Bundle the workspace protocol package (it is TypeScript source), externalize real npm deps.
  main: { plugins: [externalizeDepsPlugin({ exclude: ['@classroom/protocol'] })] },
  // Sandboxed preloads must be CommonJS.
  preload: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  // Workers (speech-to-text) are ES modules.
  renderer: { plugins: [react()], worker: { format: 'es' } },
});
