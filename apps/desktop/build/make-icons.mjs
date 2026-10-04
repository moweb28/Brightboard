// Renders build/icon.svg to the PNG/ICO files Electron and installers need.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const dir = import.meta.dirname;
const svg = join(dir, 'icon.svg');
await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(join(dir, 'icon.png'));
const sizes = await Promise.all([16, 24, 32, 48, 64, 128, 256].map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()));
writeFileSync(join(dir, 'icon.ico'), await pngToIco(sizes));
console.log('icons written');
