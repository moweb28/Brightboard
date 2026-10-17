import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';

export default defineConfig(({ mode }) => {
  // A release must talk to the deployed relay, never the placeholder in .env.production.
  const relay = loadEnv(mode, process.cwd(), "VITE_").VITE_RELAY_URL ?? '';
  if (mode === 'production' && (!relay || relay.includes('YOUR-SUBDOMAIN'))) {
    throw new Error('Set VITE_RELAY_URL in apps/desktop/.env.production to your deployed relay (see apps/relay/DEPLOY.md).');
  }
  return {
    // Bundle the workspace protocol package (it is TypeScript source), externalize real npm deps.
    main: { plugins: [externalizeDepsPlugin({ exclude: ['@classroom/protocol'] })] },
    // Sandboxed preloads must be CommonJS.
    preload: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
    // Workers (speech-to-text) are ES modules.
    renderer: { plugins: [react()], worker: { format: 'es' } },
  };
});
