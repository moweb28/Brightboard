// Downloads the official livekit-server binary for this platform into .bin/ (once).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const binDir = join(import.meta.dirname, '..', '.bin');
const exe = join(binDir, process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server');
if (existsSync(exe)) process.exit(0);

const os = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
const release = await (await fetch('https://api.github.com/repos/livekit/livekit/releases/latest')).json();
const asset = release.assets.find((a) => a.name.includes(`_${os}_${arch}.`));
if (!asset) throw new Error(`No LiveKit build for ${os}/${arch} in ${release.tag_name}`);

console.log(`Downloading ${asset.name}...`);
mkdirSync(binDir, { recursive: true });
const archive = join(binDir, asset.name);
writeFileSync(archive, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()));
// Windows' own tar (bsdtar) reads zip; Git Bash's GNU tar does not.
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
execFileSync(tar, ['-xf', asset.name], { cwd: binDir });
console.log(`LiveKit ${release.tag_name} ready at ${exe}`);
