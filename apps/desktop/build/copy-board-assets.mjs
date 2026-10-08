// Copies Excalidraw's fonts into the renderer's public folder so the whiteboard works offline.
// Skips the 13 MB CJK font; other scripts (incl. Arabic) fall back to system fonts.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// The main entry is dist/prod/index.js; fonts sit next to it.
const from = join(dirname(require.resolve('@excalidraw/excalidraw')), 'fonts');
const to = join(import.meta.dirname, '..', 'src', 'renderer', 'public', 'excalidraw-assets', 'fonts');
if (existsSync(to)) process.exit(0);
mkdirSync(to, { recursive: true });
for (const family of readdirSync(from)) if (family !== 'Xiaolai') cpSync(join(from, family), join(to, family), { recursive: true });
console.log('whiteboard fonts copied');
