/// <reference lib="webworker" />
/**
 * Runs Whisper (multilingual: Arabic + English, auto-detected per chunk) entirely on this computer.
 * The model downloads once from Hugging Face and is cached by the browser for offline use.
 */
import { pipeline } from '@huggingface/transformers';

export type WorkerIn = { type: 'load'; model: 'standard' | 'accurate' } | { type: 'chunk'; id: number; audio: Float32Array };
export type WorkerOut =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: string }
  | { type: 'text'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };

const MODELS = { standard: 'onnx-community/whisper-base', accurate: 'onnx-community/whisper-small' };

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
let asr: Asr | null = null;
const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);

// Aggregate per-file download progress into one number.
const files = new Map<string, { loaded: number; total: number }>();
function onProgress(p: { status: string; file?: string; loaded?: number; total?: number }) {
  if (p.status !== 'progress' || !p.file) return;
  files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
  let loaded = 0;
  let total = 0;
  for (const f of files.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  post({ type: 'progress', loaded, total });
}

async function load(model: 'standard' | 'accurate') {
  const hasGpu = !!(self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu && !!(await (self.navigator as never as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
  const device = hasGpu ? 'webgpu' : 'wasm';
  const dtype = hasGpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8';
  asr = (await pipeline('automatic-speech-recognition', MODELS[model], { device, dtype, progress_callback: onProgress } as never)) as unknown as Asr;
  post({ type: 'ready', device });
}

let queue: Promise<unknown> = Promise.resolve();

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    load(msg.model).catch((err) => post({ type: 'error', message: String(err?.message ?? err) }));
    return;
  }
  // One chunk at a time, in order.
  queue = queue.then(async () => {
    if (!asr) return post({ type: 'error', id: msg.id, message: 'model not loaded' });
    try {
      const out = await asr(msg.audio, { task: 'transcribe', return_timestamps: false });
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
      post({ type: 'text', id: msg.id, text });
    } catch (err) {
      post({ type: 'error', id: msg.id, message: String((err as Error)?.message ?? err) });
    }
  });
};
