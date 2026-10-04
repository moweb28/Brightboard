import { extractRoomCode } from '@classroom/protocol';
import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from 'electron';
import { join, resolve } from 'node:path';
import icon from '../../build/icon.png?asset';

const PROTOCOL = 'brightboard';
const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen']);

let mainWindow: BrowserWindow | null = null;
/** A class code from a brightboard:// link that the renderer has not picked up yet. */
let pendingJoinCode: string | null = null;

app.setName('Brightboard');

// Register brightboard:// links. In dev, Electron runs as `electron <app dir>`, so pass the app path too.
if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient(PROTOCOL);

function handleLink(argv: string[]) {
  const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  const code = url && extractRoomCode(url);
  if (!code) return;
  pendingJoinCode = code;
  if (mainWindow) {
    mainWindow.webContents.send('join-link', code);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => handleLink(argv)); // Windows/Linux: link opened while running
  app.on('open-url', (e, url) => { e.preventDefault(); handleLink([url]); }); // macOS
  handleLink(process.argv); // Windows/Linux: app launched by a link

  app.whenReady().then(() => {
    ipcMain.handle('take-pending-join', () => {
      const code = pendingJoinCode;
      pendingJoinCode = null;
      return code;
    });

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
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Brightboard',
    icon,
    backgroundColor: '#FFF9F0',
    autoHideMenuBar: true,
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), contextIsolation: true, sandbox: true },
  });
  mainWindow.on('closed', () => (mainWindow = null));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
