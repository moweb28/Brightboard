import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFileSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The user's profile, spaces, schedules and call history live in one JSON file in the app's data folder.
 * Nothing is sent anywhere. Writes go to a temp file first so a crash never leaves a half-written file.
 */
const file = () => join(app.getPath('userData'), 'brightboard-data.json');
let writing: Promise<void> = Promise.resolve();

export function registerStore() {
  ipcMain.handle('store:load', () => {
    try {
      return JSON.parse(readFileSync(file(), 'utf8'));
    } catch {
      return null;
    }
  });

  // Backups: a copy of everything (including the spaces' admin keys) in a file the user picks.
  const filters = [{ name: 'Brightboard backup', extensions: ['json'] }];
  ipcMain.handle('store:backup', async (e, data: unknown, title: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const stamp = new Date().toISOString().slice(0, 10);
    const opts = { title: String(title ?? ''), defaultPath: join(app.getPath('documents'), `Brightboard backup ${stamp}.json`), filters };
    const { canceled, filePath } = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (canceled || !filePath) return false;
    await writeFile(filePath, JSON.stringify(data, null, 1), 'utf8');
    return true;
  });
  ipcMain.handle('store:restore', async (e, title: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts = { title: String(title ?? ''), properties: ['openFile' as const], filters };
    const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (canceled || !filePaths[0]) return null;
    try {
      const data = JSON.parse(await readFile(filePaths[0], 'utf8'));
      return data && data.version === 1 && Array.isArray(data.spaces) ? data : 'invalid';
    } catch {
      return 'invalid';
    }
  });

  ipcMain.handle('store:save', (_e, data: unknown) => {
    const text = JSON.stringify(data);
    // Saves run one after another, newest last.
    writing = writing.then(async () => {
      const tmp = file() + '.tmp';
      await writeFile(tmp, text, 'utf8');
      await rename(tmp, file());
    });
    return writing.catch((e) => console.error('could not save data', e));
  });
}
