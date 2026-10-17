import type { Participant } from './participant';

const THRESHOLD = 0.035;
/** Keep the ring on briefly after someone pauses, so it doesn't flicker between words. */
const HANGOVER_MS = 600;
const TICK_MS = 150;

interface Meter {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
  lastLoud: number;
}

/** Measures each microphone's loudness and reports who is speaking (loudest first). */
export class SpeakingMonitor {
  private ctx: AudioContext | null = null;
  private meters = new Map<Participant, Meter>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = '';

  constructor(private onChange: (speakers: Participant[]) => void) {}

  add(p: Participant, track: MediaStreamTrack) {
    this.remove(p);
    this.ctx ??= new AudioContext();
    const source = this.ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    this.meters.set(p, { source, analyser, buf: new Float32Array(analyser.fftSize), lastLoud: 0 });
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  remove(p: Participant) {
    const m = this.meters.get(p);
    if (!m) return;
    m.source.disconnect();
    this.meters.delete(p);
    if (p.isSpeaking) {
      p.isSpeaking = false;
      p.audioLevel = 0;
      this.report();
    }
  }

  close() {
    for (const p of [...this.meters.keys()]) this.remove(p);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private tick() {
    const now = performance.now();
    for (const [p, m] of this.meters) {
      m.analyser.getFloatTimeDomainData(m.buf);
      let sum = 0;
      for (const v of m.buf) sum += v * v;
      const level = Math.sqrt(sum / m.buf.length);
      // A muted mic still delivers silence, so this also turns the ring off when muted.
      if (level > THRESHOLD && (p.isLocal ? p.isMicrophoneEnabled : true)) m.lastLoud = now;
      p.audioLevel = level;
      p.isSpeaking = now - m.lastLoud < HANGOVER_MS;
    }
    this.report();
  }

  private report() {
    const speakers = [...this.meters.keys()].filter((p) => p.isSpeaking).sort((a, b) => b.audioLevel - a.audioLevel);
    const key = speakers.map((p) => p.identity).join(',');
    if (key === this.last) return;
    this.last = key;
    this.onChange(speakers);
  }
}
