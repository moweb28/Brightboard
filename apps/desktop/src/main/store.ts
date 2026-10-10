import { app, ipcMain } from 'electron';
import { readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
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
