// Draws the installer's "Installing Brightboard" animation into build/installer.gif.
// Run with Electron (it renders the frames), then ffmpeg turns them into a GIF:
//   npx electron build/make-installer-gif.cjs
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const W = 520;
const H = 340;
const FPS = 25;
const SECONDS = 2.4; // one loop
const logo = `data:image/svg+xml;base64,${fs.readFileSync(path.join(__dirname, 'icon.svg')).toString('base64')}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { font-family: 'Segoe UI Variable Display', 'Segoe UI', sans-serif; color: #fff;
    background: radial-gradient(420px 260px at 18% 0%, #7c7cf5 0%, transparent 70%),
                radial-gradient(360px 240px at 100% 100%, #f59e0b55 0%, transparent 70%),
                linear-gradient(150deg, #4f46e5, #312e81);
    display: grid; place-items: center; }
  .dots { position: absolute; inset: 0; background: radial-gradient(circle, #ffffff22 1.2px, transparent 1.8px) 0 0 / 20px 20px;
    -webkit-mask-image: linear-gradient(to bottom, #000, transparent 80%); }
  .chalk { position: absolute; inset: 0; }
  .chalk path, .chalk circle, .chalk rect { fill: none; stroke: #ffffff30; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 260; animation: draw ${SECONDS}s ease-in-out infinite; }
  .chalk circle { animation-delay: -0.6s; } .chalk rect { animation-delay: -1.2s; }
  @keyframes draw { 0% { stroke-dashoffset: 260; } 45%, 70% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -260; } }
  .card { position: relative; display: grid; justify-items: center; gap: 14px; }
  .logo { width: 96px; height: 96px; border-radius: 26px; box-shadow: 0 14px 36px #1e1b4b88; animation: bob ${SECONDS}s ease-in-out infinite; }
  @keyframes bob { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-8px) rotate(2deg); } }
  h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.3px; }
  p { font-size: 14px; color: #e0e7ff; margin-top: -6px; }
  .bar { width: 220px; height: 6px; border-radius: 3px; background: #ffffff2e; overflow: hidden; margin-top: 4px; }
  .bar i { display: block; width: 40%; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #ffd25a, #ffb020);
    animation: slide ${SECONDS}s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-110%); } 100% { transform: translateX(260%); } }
</style></head><body>
  <div class="dots"></div>
  <svg class="chalk" viewBox="0 0 ${W} ${H}">
    <path d="M40 300 L80 236 L120 300 Z"/><circle cx="470" cy="70" r="26"/>
    <rect x="420" y="250" width="44" height="44" rx="5" transform="rotate(12 442 272)"/>
    <path d="M36 70 q24 -24 48 0 t48 0"/>
  </svg>
  <div class="card">
    <img class="logo" src="${logo}">
    <h1>Brightboard</h1>
    <p>Setting things up for you…</p>
    <div class="bar"><i></i></div>
  </div>
</body></html>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => document.querySelector(".logo").decode())');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-gif-'));
  const frames = Math.round(SECONDS * FPS);
  for (let i = 0; i < frames; i++) {
    // Every animation is paused and set to this frame's time, so the loop is exact.
    await win.webContents.executeJavaScript(`document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ${(i * 1000) / FPS}; }); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(3, '0')}.png`), img.resize({ width: W, height: H }).toPNG());
  }
  const out = path.join(__dirname, 'installer.gif');
  const frames_ = path.join(dir, 'f%03d.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', frames_, '-vf', `split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=sierra2_4a`, '-loop', '0', out]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('wrote', out, Math.round(fs.statSync(out).size / 1024), 'KB');
  app.quit();
});
