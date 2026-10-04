// Renders the virtual camera backgrounds (1280x720 JPEG) into src/renderer/assets.
import { join } from 'node:path';
import sharp from 'sharp';

const out = join(import.meta.dirname, '..', 'src', 'renderer', 'assets');
const W = 1280, H = 720;
const books = Array.from({ length: 48 }, (_, i) => {
  const shelf = Math.floor(i / 16), x = 70 + (i % 16) * 72 + (i % 3) * 4, h = 120 + ((i * 37) % 40);
  const colors = ['#c2410c', '#1d4ed8', '#15803d', '#a16207', '#7e22ce', '#be123c', '#0f766e'];
  const y = 60 + shelf * 220 + (180 - h);
  return `<rect x="${x}" y="${y}" width="${54 + (i % 4) * 4}" height="${h}" rx="4" fill="${colors[i % colors.length]}" opacity="0.85"/>`;
}).join('');
const scenes = {
  classroom: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#f3e9d8"/>
    <rect y="560" width="${W}" height="160" fill="#c8a97e"/>
    <rect x="240" y="90" width="800" height="380" rx="18" fill="#2f5d50" stroke="#8b6a43" stroke-width="22"/>
    <path d="M330 200 q60 -50 120 0 t120 0" stroke="#e8f1ec" stroke-width="6" fill="none" opacity=".6"/>
    <text x="330" y="330" font-family="Segoe UI, sans-serif" font-size="64" fill="#e8f1ec" opacity=".55">a² + b² = c²</text>
    <circle cx="1130" cy="140" r="54" fill="#fff" stroke="#8b6a43" stroke-width="8"/>
    <rect x="80" y="130" width="90" height="300" rx="10" fill="#ffc83d" opacity=".5"/>
  </svg>`,
  library: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#5b3a29"/>
    ${[0, 1, 2].map((s) => `<rect x="40" y="${240 + s * 220}" width="${W - 80}" height="22" fill="#3b2418"/>`).join('')}
    ${books}
  </svg>`,
  calm: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7d2fe"/><stop offset="1" stop-color="#fde68a"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <circle cx="1000" cy="200" r="160" fill="#fff" opacity=".35"/>
    <circle cx="260" cy="560" r="240" fill="#fff" opacity=".25"/>
    <circle cx="640" cy="360" r="90" fill="#fff" opacity=".2"/>
  </svg>`,
};
for (const [name, svg] of Object.entries(scenes)) {
  await sharp(Buffer.from(svg)).blur(name === 'calm' ? 0.3 : 6).jpeg({ quality: 82 }).toFile(join(out, `bg-${name}.jpg`));
}
console.log('backgrounds written');
