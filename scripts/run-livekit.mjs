// Runs LiveKit in dev mode (key: devkey, secret: secret) on ws://localhost:7880.
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const exe = join(import.meta.dirname, '..', '.bin', process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server');
spawn(exe, ['--dev', '--bind', '0.0.0.0'], { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0));
