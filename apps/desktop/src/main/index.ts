import { app, BrowserWindow, desktopCapturer, session, shell } from 'electron';
import { join } from 'node:path';

const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen']);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Classroom',
    backgroundColor: '#0e1014',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));

  // Screen share: use the OS picker where available, otherwise share the primary screen.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const [screen] = await desktopCapturer.getSources({ types: ['screen'] });
      callback(process.platform === 'win32' ? { video: screen, audio: 'loopback' } : { video: screen });
    },
    { useSystemPicker: true },
  );

  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
