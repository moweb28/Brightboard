import { isLikelyHallucination, SpeechChunker, type TranscriptLine } from '@classroom/protocol';
import type { Room } from './rtc';
import { followCallAudio } from './callAudio';
import type { WorkerIn, WorkerOut } from './transcribe.worker';

export type TranscriptMode = 'me' | 'everyone';
export type TranscriptModel = 'standard' | 'accurate';
export type TranscriberStatus = { phase: 'loading'; loaded: number; total: number } | { phase: 'running'; device: string } | { phase: 'error'; message: string };

const RATE = 16000;

/**
 * Listens to the admin's mic (or every mic, one stream per speaker), cuts speech at pauses and
 * sends each piece to the Whisper worker. Lines come back in order with speaker names and times.
 */
export class SessionTranscriber {
  lines: TranscriptLine[] = [];
  private worker: Worker | null = null;
  private ctx: AudioContext | null = null;
  private stopFollowing: (() => void) | null = null;
  private sources = new Map<string, { node: MediaStreamAudioSourceNode; proc: ScriptProcessorNode; chunker: SpeechChunker; speaker: string; baseMs: number }>();
  private pending = new Map<number, { speaker: string; atMs: number }>();
  private nextId = 1;
  private startedAt = 0;
  private drained: (() => void) | null = null;

  constructor(
    private room: Room,
    private mode: TranscriptMode,
    private model: TranscriptModel,
    private onLine: (line: TranscriptLine) => void,
    private onStatus: (s: TranscriberStatus) => void,
  ) {}

  async start() {
    this.worker = new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
    const ready = new Promise<void>((resolve, reject) => {
      this.worker!.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === 'progress') this.onStatus({ phase: 'loading', loaded: m.loaded, total: m.total });
        else if (m.type === 'ready') {
          this.onStatus({ phase: 'running', device: m.device });
          resolve();
        } else if (m.type === 'text') this.finish(m.id, m.text);
        else if (m.type === 'error') {
          if (m.id === undefined) reject(new Error(m.message));
          else this.finish(m.id, '');
        }
      };
    });
    this.onStatus({ phase: 'loading', loaded: 0, total: 0 });
    this.post({ type: 'load', model: this.model });
    await ready;
    // Line times count from when listening begins, not from the (one-time) model download.
    this.startedAt = Date.now();

    this.ctx = new AudioContext({ sampleRate: RATE });
    this.stopFollowing = followCallAudio(
      this.room,
      ({ key, track, participant }) => {
        if (this.sources.has(key) || !this.ctx) return;
        if (this.mode === 'me' && !participant.isLocal) return;
        const node = this.ctx.createMediaStreamSource(new MediaStream([track]));
        const proc = this.ctx.createScriptProcessor(4096, 1, 1);
        const chunker = new SpeechChunker(RATE);
        const entry = { node, proc, chunker, speaker: participant.name || participant.identity, baseMs: Date.now() - this.startedAt };
        proc.onaudioprocess = (ev) => {
          const chunk = chunker.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
          if (chunk) this.send(chunk.audio, entry.speaker, entry.baseMs + chunk.startMs);
        };
        // A silent sink keeps the processor running without echoing audio.
        const mute = this.ctx.createGain();
        mute.gain.value = 0;
        node.connect(proc).connect(mute).connect(this.ctx.destination);
        this.sources.set(key, entry);
      },
      (key) => this.dropSource(key),
    );
  }

  /** Stops listening, finishes the last pieces (up to 60 s), and returns all lines. */
  async stop(): Promise<TranscriptLine[]> {
    this.stopFollowing?.();
    for (const key of [...this.sources.keys()]) this.dropSource(key);
    if (this.pending.size) {
      await Promise.race([new Promise<void>((r) => (this.drained = r)), new Promise((r) => setTimeout(r, 60_000))]);
    }
    this.worker?.terminate();
    await this.ctx?.close().catch(() => undefined);
    return [...this.lines].sort((a, b) => a.atMs - b.atMs);
  }

  private dropSource(key: string) {
    const s = this.sources.get(key);
    if (!s) return;
    this.sources.delete(key);
    s.proc.onaudioprocess = null;
    s.node.disconnect();
    s.proc.disconnect();
    const last = s.chunker.flush();
    if (last) this.send(last.audio, s.speaker, s.baseMs + last.startMs);
  }

  private send(audio: Float32Array, speaker: string, atMs: number) {
    const id = this.nextId++;
    this.pending.set(id, { speaker, atMs });
    this.post({ type: 'chunk', id, audio }, [audio.buffer]);
  }

  private finish(id: number, text: string) {
    const meta = this.pending.get(id);
    this.pending.delete(id);
    if (meta && text && !isLikelyHallucination(text)) {
      const line = { ...meta, text };
      this.lines.push(line);
      this.onLine(line);
    }
    if (!this.pending.size) this.drained?.();
  }

  private post(msg: WorkerIn, transfer: Transferable[] = []) {
    this.worker?.postMessage(msg, transfer);
  }
}
