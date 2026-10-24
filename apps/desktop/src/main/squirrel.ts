import { app } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/**
 * The Windows installer (Squirrel) puts each version in its own folder next to Update.exe and a
 * small Brightboard.exe that always starts the newest one. These helpers only matter when installed that way.
 */
const root = resolve(process.execPath, '..', '..');
const updateExe = join(root, 'Update.exe');
export const installedBySquirrel = process.platform === 'win32' && existsSync(updateExe);

/** The program links should open: the stable launcher, so they survive updates. */
export const launcherPath = installedBySquirrel ? join(root, basename(process.execPath)) : process.execPath;

/**
 * The installer runs the app with a --squirrel-* flag to add or remove shortcuts, then waits for it to quit.
 * Returns true when this run was one of those (the app must not open a window).
 */
export function handleSquirrelEvent(onUninstall: () => void): boolean {
  if (!installedBySquirrel) return false;
  const event = process.argv[1];
  if (!event?.startsWith('--squirrel-') || event === '--squirrel-firstrun') return false;
  const update = (args: string[]) => spawn(updateExe, args, { detached: true }).on('close', () => app.quit());
  const exe = basename(process.execPath);
  if (event === '--squirrel-install' || event === '--squirrel-updated') update(['--createShortcut', exe, '--shortcut-locations', 'Desktop,StartMenu']);
  else if (event === '--squirrel-uninstall') {
    onUninstall();
    update(['--removeShortcut', exe]);
  } else app.quit(); // --squirrel-obsolete: an older version being cleaned up
  return true;
}
