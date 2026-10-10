import { extractRoomCode } from '@classroom/protocol';
import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from 'electron';
import { join, resolve } from 'node:path';
import icon from '../../build/icon.png?asset';
import { registerFileHandlers } from './files';
import { registerRemoteControl, setSharedSource } from './remote';
import { registerStore } from './store';

const PROTOCOL = 'brightboard';
const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen']);

let mainWindow: BrowserWindow | null = null;
/** A class code from a brightboard:// link that the renderer has not picked up yet. */
let pendingJoinCode: string | null = null;
/** The screen/window the user confirmed in our share picker; used once by the next share request. */
let selectedScreenSource: string | null = null;

app.setName('Brightboard');
// Keep painting while the window is covered by other apps, so recordings and shares never freeze.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

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

    ipcMain.handle('screen:sources', async () => {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true });
      return sources
        .filter((s) => s.name !== 'Brightboard')
        .map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.id.startsWith('screen:') ? 'screen' : 'window',
          thumbnail: s.thumbnail.toDataURL(),
          icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
        }));
    });
    ipcMain.on('screen:stopped', () => setSharedSource(null));
    registerRemoteControl(() => mainWindow);
    registerFileHandlers(() => mainWindow);
    registerStore();
    ipcMain.handle('screen:select', (_e, id: string) => {
      selectedScreenSource = typeof id === 'string' ? id : null;
    });

    // Screen share only proceeds with a source the user confirmed in our picker.
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      const id = selectedScreenSource;
      selectedScreenSource = null;
      const source = id && (await desktopCapturer.getSources({ types: ['screen', 'window'] })).find((s) => s.id === id);
      if (!source) return callback({});
      setSharedSource(source.id);
      const wantsAudio = request.audioRequested && process.platform === 'win32';
      callback(wantsAudio ? { video: source, audio: 'loopback' } : { video: source });
    });

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
    backgroundColor: '#1f2024',
    autoHideMenuBar: true,
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
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
