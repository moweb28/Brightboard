import { app, BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Snipping tool for the whiteboard: hides Brightboard, photographs the screen under the mouse,
 * and lets the user drag a rectangle over a full-screen overlay. The cut-out goes back to the
 * board as an image. Nothing is saved; the temporary screenshot is deleted right away.
 */
export interface Snip {
  dataURL: string;
  mimeType: 'image/png' | 'image/jpeg';
  /** Size on screen (device-independent pixels), so it lands on the board at a natural size. */
  width: number;
  height: number;
}

const DONE_URL = 'https://brightboard.invalid/snip';
const MAX_WIDTH = 1920;
const MAX_PNG_BYTES = 1_500_000;
let busy = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function overlayHtml(hint: string, rtl: boolean) {
  return `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden;cursor:crosshair;user-select:none;background:#000}
  img{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}
  #dim{position:fixed;inset:0;background:rgba(10,12,24,.45)}
  #box{position:fixed;display:none;outline:2px solid #fff;box-shadow:0 0 0 9999px rgba(10,12,24,.45)}
  #size{position:absolute;top:-28px;left:0;padding:3px 8px;border-radius:6px;background:#5b5bd6;color:#fff;font:600 12px 'Segoe UI',system-ui,sans-serif;white-space:nowrap}
  #hint{position:fixed;top:18px;left:50%;transform:translateX(-50%);padding:10px 16px;border-radius:10px;background:rgba(20,22,32,.92);color:#fff;font:600 14px 'Segoe UI',system-ui,sans-serif;pointer-events:none}
  .picking #dim{display:none}
</style></head><body>
<img src="shot.png" alt=""><div id="dim"></div><div id="box"><span id="size"></span></div><div id="hint">${escapeHtml(hint)}</div>
<script>
  const box = document.getElementById('box'), size = document.getElementById('size'), hint = document.getElementById('hint');
  let start = null, rect = null;
  const done = (q) => { location.href = '${DONE_URL}' + q; };
  addEventListener('keydown', (e) => { if (e.key === 'Escape') done('?cancel=1'); });
  addEventListener('contextmenu', (e) => { e.preventDefault(); done('?cancel=1'); });
  addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    document.body.classList.add('picking');
    hint.style.display = 'none';
  });
  addEventListener('mousemove', (e) => {
    if (!start) return;
    const x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY);
    rect = { x, y, w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) };
    Object.assign(box.style, { display: 'block', left: x + 'px', top: y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
    size.textContent = Math.round(rect.w) + ' × ' + Math.round(rect.h);
    size.style.top = y < 32 ? '6px' : '-28px';
  });
  addEventListener('mouseup', () => {
    if (!start) return;
    start = null;
    if (!rect || rect.w < 6 || rect.h < 6) {
      // A click without a drag: start over.
      rect = null; box.style.display = 'none'; document.body.classList.remove('picking'); hint.style.display = '';
      return;
    }
    done('?x=' + rect.x + '&y=' + rect.y + '&w=' + rect.w + '&h=' + rect.h);
  });
</script></body></html>`;
}

/** Shows the overlay and resolves with the chosen rectangle (in overlay pixels), or null if cancelled. */
function pickArea(bounds: Electron.Rectangle, dir: string): Promise<{ x: number; y: number; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      enableLargerThanScreen: true,
      backgroundColor: '#000000',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    let settled = false;
    const finish = (value: { x: number; y: number; w: number; h: number } | null) => {
      if (settled) return;
      settled = true;
      if (!win.isDestroyed()) win.destroy();
      resolve(value);
    };
    win.webContents.on('will-navigate', (e, url) => {
      e.preventDefault();
      if (!url.startsWith(DONE_URL)) return;
      const q = new URL(url).searchParams;
      if (q.has('cancel')) return finish(null);
      const n = (k: string) => Number(q.get(k));
      const area = { x: n('x'), y: n('y'), w: n('w'), h: n('h') };
      finish(Object.values(area).every((v) => Number.isFinite(v) && v >= 0) ? area : null);
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => finish(null));
    win.once('ready-to-show', () => {
      win.setBounds(bounds);
      win.setAlwaysOnTop(true, 'screen-saver');
      win.show();
      win.focus();
    });
    void win.loadFile(join(dir, 'index.html'));
  });
}

export function registerSnip(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('snip:start', async (_e, hint: unknown, rtl: unknown): Promise<Snip | null> => {
    if (busy) return null;
    busy = true;
    const main = getMainWindow();
    const dir = join(app.getPath('temp'), `brightboard-snip-${randomUUID()}`);
    try {
      // Get Brightboard out of the way so the user can snip whatever is behind it.
      const wasVisible = !!main?.isVisible();
      main?.hide();
      await sleep(350);

      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const { width, height } = display.size;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(width * display.scaleFactor), height: Math.round(height * display.scaleFactor) },
      });
      const shot = (sources.find((s) => s.display_id === String(display.id)) ?? sources[0])?.thumbnail;
      if (!shot || shot.isEmpty()) {
        if (wasVisible) main?.show();
        return null;
      }

      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'shot.png'), shot.toPNG());
      await writeFile(join(dir, 'index.html'), overlayHtml(String(hint ?? ''), rtl === true));
      const area = await pickArea(display.bounds, dir);

      if (wasVisible && main && !main.isDestroyed()) {
        main.show();
        main.focus();
      }
      if (!area) return null;

      // The screenshot is in physical pixels; the overlay worked in screen (DIP) pixels.
      const ratio = shot.getSize().width / display.bounds.width;
      const crop = {
        x: Math.round(area.x * ratio),
        y: Math.round(area.y * ratio),
        width: Math.max(1, Math.round(area.w * ratio)),
        height: Math.max(1, Math.round(area.h * ratio)),
      };
      let img = shot.crop(crop);
      if (img.getSize().width > MAX_WIDTH) img = img.resize({ width: MAX_WIDTH, quality: 'best' });
      // PNG keeps text sharp; very large snips switch to JPEG so the board syncs quickly.
      const png = img.toPNG();
      const useJpeg = png.length > MAX_PNG_BYTES;
      const bytes = useJpeg ? img.toJPEG(85) : png;
      const mimeType = useJpeg ? 'image/jpeg' : 'image/png';
      return { dataURL: `data:${mimeType};base64,${bytes.toString('base64')}`, mimeType, width: Math.round(area.w), height: Math.round(area.h) };
    } finally {
      busy = false;
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      if (main && !main.isDestroyed() && !main.isVisible()) main.show();
    }
  });
}
