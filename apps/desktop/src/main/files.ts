import { sessionFileName, withWebmDuration } from '@classroom/protocol';
import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import { createReadStream, createWriteStream, mkdirSync, writeFileSync, type WriteStream } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

/**
 * Recordings go to Videos/Brightboard, transcripts to Documents/Brightboard.
 * The renderer streams recording chunks here so a crash loses at most a few seconds.
 */
const recordings = new Map<number, { stream: WriteStream; path: string; startedAt: number }>();
/** Only files we wrote may be revealed in Explorer/Finder. */
const ownFiles = new Set<string>();
let nextId = 1;

function folder(kind: 'videos' | 'documents') {
  const dir = join(app.getPath(kind), 'Brightboard');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Writes the recording's length into the file so players show a normal timeline instead of "live". */
async function addDuration(path: string, durationMs: number) {
  const file = await open(path, 'r');
  let patch: ReturnType<typeof withWebmDuration>;
  try {
    const head = new Uint8Array(64 * 1024);
    const { bytesRead } = await file.read(head, 0, head.length, 0);
    patch = withWebmDuration(head.subarray(0, bytesRead), durationMs);
  } finally {
    await file.close();
  }
  if (!patch) return;
  const tmp = path + '.part';
  try {
    const out = createWriteStream(tmp);
    out.write(patch.bytes);
    await pipeline(createReadStream(path, { start: patch.replaced }), out);
    await rename(tmp, path);
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    throw e;
  }
}

export function registerFileHandlers(mainWindow: () => BrowserWindow | null) {
  ipcMain.handle('rec:windowSource', () => mainWindow()?.getMediaSourceId() ?? null);

  ipcMain.handle('rec:start', (_e, title: unknown) => {
    const path = join(folder('videos'), sessionFileName(String(title ?? ''), new Date(), 'webm'));
    const id = nextId++;
    recordings.set(id, { stream: createWriteStream(path), path, startedAt: Date.now() });
    ownFiles.add(path);
    return { id, path };
  });

  ipcMain.on('rec:chunk', (_e, id: number, chunk: ArrayBuffer) => {
    recordings.get(id)?.stream.write(Buffer.from(chunk));
  });

  ipcMain.handle('rec:stop', async (_e, id: number) => {
    const rec = recordings.get(id);
    if (!rec) return null;
    recordings.delete(id);
    await new Promise<void>((resolve) => rec.stream.end(resolve));
    await addDuration(rec.path, Date.now() - rec.startedAt).catch((e) => console.error('could not add recording length', e));
    return rec.path;
  });

  ipcMain.handle('transcript:save', (_e, title: unknown, startedAt: unknown, text: unknown) => {
    const path = join(folder('documents'), sessionFileName(String(title ?? ''), new Date(Number(startedAt) || Date.now()), 'txt'));
    writeFileSync(path, '﻿' + String(text ?? ''), 'utf8'); // BOM so Notepad shows Arabic correctly
    ownFiles.add(path);
    return path;
  });

  ipcMain.handle('file:reveal', (_e, path: unknown) => {
    if (typeof path === 'string' && ownFiles.has(path)) shell.showItemInFolder(path);
  });

  // Never leave a half-open file behind.
  app.on('before-quit', () => {
    for (const rec of recordings.values()) rec.stream.end();
  });
}
