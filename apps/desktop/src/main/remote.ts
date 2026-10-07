import { codeToNutKey, isStopCombo, mapToDisplay, RemoteGate, sanitizeInput, type RemoteInput } from '@classroom/protocol';
import { BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen, systemPreferences, type Display } from 'electron';

/**
 * Lets the host drive this computer while the user shares their screen and has said yes.
 * Every input is checked against the gate (right person, still allowed, not idle) before it is injected.
 */

type Nut = typeof import('@nut-tree-fork/nut-js');
export type GrantResult = { ok: true } | { ok: false; reason: 'notScreen' | 'permission' | 'unavailable' };
export type EndReason = 'local' | 'remote' | 'idle' | 'shareEnded';

const STOP_SHORTCUT = 'CommandOrControl+Alt+Q';

const gate = new RemoteGate();
let nut: Nut | null = null;
let sharedSourceId: string | null = null;
let display: Display | null = null;
/** nut.js may work in physical pixels (Windows, DPI-aware) or DIPs; detected at grant time. */
let usePhysicalPixels = false;
let overlay: BrowserWindow | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let queue: Promise<unknown> = Promise.resolve();
const heldKeys = new Set<string>();
const heldButtons = new Set<string>();
let getMainWindow: () => BrowserWindow | null = () => null;

/** Called by the share handler so we know which screen is being shown. */
export function setSharedSource(id: string | null) {
  sharedSourceId = id;
  if (!id && gate.active) stop('shareEnded');
}

async function loadNut() {
  if (!nut) {
    nut = await import('@nut-tree-fork/nut-js');
    nut.mouse.config.autoDelayMs = 0;
    nut.keyboard.config.autoDelayMs = 0;
  }
  return nut;
}

async function findDisplay(sourceId: string) {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  const source = sources.find((s) => s.id === sourceId);
  return screen.getAllDisplays().find((d) => String(d.id) === source?.display_id) ?? screen.getPrimaryDisplay();
}

function toDriverPoint(nx: number, ny: number) {
  const p = mapToDisplay(nx, ny, display!.bounds);
  return usePhysicalPixels && process.platform === 'win32' ? screen.dipToScreenPoint(p) : p;
}

const BUTTON = { left: 'LEFT', right: 'RIGHT', middle: 'MIDDLE' } as const;

async function inject(e: RemoteInput) {
  const n = nut!;
  switch (e.k) {
    case 'move':
      await n.mouse.setPosition(toDriverPoint(e.x, e.y));
      break;
    case 'down':
    case 'up': {
      await n.mouse.setPosition(toDriverPoint(e.x, e.y));
      const button = n.Button[BUTTON[e.b]];
      if (e.k === 'down') {
        heldButtons.add(e.b);
        await n.mouse.pressButton(button);
      } else {
        heldButtons.delete(e.b);
        await n.mouse.releaseButton(button);
      }
      break;
    }
    case 'wheel':
      if (e.dy > 0) await n.mouse.scrollDown(e.dy);
      if (e.dy < 0) await n.mouse.scrollUp(-e.dy);
      if (e.dx > 0) await n.mouse.scrollRight(e.dx);
      if (e.dx < 0) await n.mouse.scrollLeft(-e.dx);
      break;
    case 'keydown':
    case 'keyup': {
      if (e.k === 'keydown' && isStopCombo(e.code, heldKeys)) return; // never let the controller press the stop shortcut
      const key = n.Key[codeToNutKey(e.code) as keyof typeof n.Key];
      if (e.k === 'keydown') {
        heldKeys.add(e.code);
        await n.keyboard.pressKey(key);
      } else if (heldKeys.delete(e.code)) {
        await n.keyboard.releaseKey(key);
      }
      break;
    }
  }
}

/** Releases anything the controller left pressed, so the user never ends up with a stuck key. */
async function releaseAll() {
  if (!nut) return;
  for (const code of heldKeys) await nut.keyboard.releaseKey(nut.Key[codeToNutKey(code) as keyof typeof nut.Key]).catch(() => undefined);
  for (const b of heldButtons) await nut.mouse.releaseButton(nut.Button[BUTTON[b as keyof typeof BUTTON]]).catch(() => undefined);
  heldKeys.clear();
  heldButtons.clear();
}

function stop(reason: EndReason) {
  const wasActive = gate.active;
  gate.revoke();
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = null;
  if (globalShortcut.isRegistered(STOP_SHORTCUT)) globalShortcut.unregister(STOP_SHORTCUT);
  overlay?.destroy();
  overlay = null;
  queue = queue.then(releaseAll);
  if (wasActive) getMainWindow()?.webContents.send('remote:ended', reason);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Always-on-top bar on the controlled screen, so the user always knows and can stop it. */
function showOverlay(text: string, stopLabel: string, rtl: boolean) {
  const { bounds } = display!;
  const width = 560;
  overlay = new BrowserWindow({
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: bounds.y + 12,
    width,
    height: 52,
    frame: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    backgroundColor: '#d93f45',
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true);
  // The Stop "link" navigates to a sentinel URL; we cancel the navigation and stop control.
  overlay.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    if (url.startsWith('https://brightboard.invalid/stop')) stop('local');
  });
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const html = `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
    body{margin:0;height:52px;display:flex;align-items:center;gap:12px;padding:0 10px 0 16px;background:#d93f45;color:#fff;
      font:600 14px 'Segoe UI',system-ui,sans-serif;-webkit-app-region:drag;user-select:none}
    span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dot{width:10px;height:10px;border-radius:50%;background:#fff;flex:none;animation:p 1.2s infinite}
    @keyframes p{50%{opacity:.35}}
    a{-webkit-app-region:no-drag;background:#fff;color:#b42318;text-decoration:none;padding:8px 14px;border-radius:999px;font-weight:700;white-space:nowrap}
  </style></head><body><i class="dot"></i><span>${escapeHtml(text)}</span><a href="https://brightboard.invalid/stop">${escapeHtml(stopLabel)}</a></body></html>`;
  overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

export function registerRemoteControl(mainWindow: () => BrowserWindow | null) {
  getMainWindow = mainWindow;

  ipcMain.handle('remote:grant', async (_e, args: { controller: string; text: string; stopLabel: string; rtl: boolean }): Promise<GrantResult> => {
    if (!sharedSourceId?.startsWith('screen:')) return { ok: false, reason: 'notScreen' };
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(true)) return { ok: false, reason: 'permission' };
    try {
      const n = await loadNut();
      display = await findDisplay(sharedSourceId);
      const primary = screen.getPrimaryDisplay();
      usePhysicalPixels = (await n.screen.width()) !== primary.bounds.width;
    } catch (err) {
      console.error('remote control unavailable', err);
      return { ok: false, reason: 'unavailable' };
    }
    stop('local'); // close any previous session silently
    gate.grant(String(args.controller), Date.now());
    showOverlay(String(args.text).slice(0, 120), String(args.stopLabel).slice(0, 40), !!args.rtl);
    globalShortcut.register(STOP_SHORTCUT, () => stop('local'));
    idleTimer = setInterval(() => gate.expired(Date.now()) && stop('idle'), 5000);
    return { ok: true };
  });

  ipcMain.on('remote:input', (_e, from: unknown, raw: unknown) => {
    if (typeof from !== 'string' || !gate.accept(from, Date.now())) return;
    const input = sanitizeInput(raw);
    if (!input) return;
    queue = queue.then(() => inject(input)).catch((err) => console.warn('inject failed', err));
  });

  ipcMain.handle('remote:stop', (_e, remote: boolean) => stop(remote ? 'remote' : 'local'));
}
