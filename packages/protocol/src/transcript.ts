/** Cuts a continuous mono audio stream into speech chunks at natural pauses, for speech-to-text. */
export interface ChunkerOptions {
  /** RMS level (0–1) above which a frame counts as speech. */
  threshold: number;
  /** A pause this long after speech ends the chunk. */
  silenceMs: number;
  /** Chunks with less speech than this are dropped (coughs, clicks). */
  minSpeechMs: number;
  /** Hard cap so long monologues still come out in pieces. */
  maxChunkMs: number;
}

const DEFAULTS: ChunkerOptions = { threshold: 0.012, silenceMs: 700, minSpeechMs: 400, maxChunkMs: 20_000 };
const FRAME_MS = 30;

export interface SpeechChunk {
  audio: Float32Array;
  /** When the chunk starts, in ms since the first sample pushed. */
  startMs: number;
}

export class SpeechChunker {
  private opts: ChunkerOptions;
  private frameSize: number;
  private carry = new Float32Array(0);
  private frames: Float32Array[] = [];
  private speechFrames = 0;
  private silentRun = 0;
  private processed = 0; // samples consumed so far
  private chunkStart = 0; // sample index where the current chunk starts

  constructor(private sampleRate: number, opts: Partial<ChunkerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.frameSize = Math.round((sampleRate * FRAME_MS) / 1000);
  }

  /** Feed samples; returns a finished chunk when a pause (or the length cap) is reached. */
  push(samples: Float32Array): SpeechChunk | null {
    const data = new Float32Array(this.carry.length + samples.length);
    data.set(this.carry);
    data.set(samples, this.carry.length);
    let ready: SpeechChunk | null = null;
    let i = 0;
    for (; i + this.frameSize <= data.length; i += this.frameSize) {
      const frame = data.subarray(i, i + this.frameSize);
      const out = this.frame(frame);
      if (out && !ready) ready = out;
    }
    this.carry = data.slice(i);
    return ready;
  }

  /** Whatever speech is left (call when stopping). */
  flush(): SpeechChunk | null {
    const out = this.emit();
    this.carry = new Float32Array(0);
    return out;
  }

  private frame(frame: Float32Array): SpeechChunk | null {
    let sum = 0;
    for (const v of frame) sum += v * v;
    const loud = Math.sqrt(sum / frame.length) > this.opts.threshold;
    const frameStart = this.processed;
    this.processed += frame.length;

    if (!this.frames.length) {
      if (!loud) return null; // waiting for speech
      this.chunkStart = frameStart;
    }
    this.frames.push(frame.slice());
    if (loud) {
      this.speechFrames++;
      this.silentRun = 0;
    } else {
      this.silentRun++;
    }
    const ms = (n: number) => n * FRAME_MS;
    if (ms(this.silentRun) >= this.opts.silenceMs || ms(this.frames.length) >= this.opts.maxChunkMs) return this.emit();
    return null;
  }

  private emit(): SpeechChunk | null {
    const enough = this.speechFrames * FRAME_MS >= this.opts.minSpeechMs;
    const frames = this.frames;
    const start = this.chunkStart;
    this.frames = [];
    this.speechFrames = 0;
    this.silentRun = 0;
    if (!enough || !frames.length) return null;
    const audio = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
    let o = 0;
    for (const f of frames) {
      audio.set(f, o);
      o += f.length;
    }
    return { audio, startMs: Math.round((start / this.sampleRate) * 1000) };
  }
}

export interface TranscriptLine {
  /** ms since the session started */
  atMs: number;
  speaker: string;
  text: string;
}

function stamp(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Plain-text transcript file: header, then "[mm:ss] Name: words" lines in time order. */
export function formatTranscript(t: { title: string; startedAt: Date; endedAt: Date; attendees: string[]; lines: TranscriptLine[] }) {
  const minutes = Math.max(0, Math.round((t.endedAt.getTime() - t.startedAt.getTime()) / 60_000));
  const header = [
    t.title,
    `Date: ${t.startedAt.toLocaleString()}`,
    `Duration: ${minutes} min`,
    `Attendees: ${t.attendees.join(', ')}`,
    '',
    '—'.repeat(40),
    '',
  ];
  const body = [...t.lines]
    .sort((a, b) => a.atMs - b.atMs)
    .filter((l) => l.text.trim())
    .map((l) => `[${stamp(l.atMs)}] ${l.speaker}: ${l.text.trim()}`);
  return [...header, ...body, ''].join('\r\n');
}

/** Phrases Whisper tends to "hear" in silence or background noise. Compared after normalizing. */
const PHANTOMS = new Set([
  'you', 'thank you', 'thanks', 'thanks for watching', 'thank you for watching', 'thank you so much for watching',
  'please subscribe', 'bye', 'okay', 'شكرا', 'شكرا لكم', 'شكرا للمشاهدة', 'شكرا لكم على المشاهدة', 'اشتركوا في القناة',
]);

/** True for text that is almost certainly not real speech (silence fillers, sound tags, bare punctuation). */
export function isLikelyHallucination(text: string) {
  const t = text.trim();
  if (!t) return true;
  if (/^[[(].*[\])]$/.test(t)) return true; // [Music], (silence)
  const normalized = t.toLowerCase().replace(/[.,!?؟،…'"-]/g, '').replace(/\s+/g, ' ').trim();
  return !normalized || PHANTOMS.has(normalized);
}
