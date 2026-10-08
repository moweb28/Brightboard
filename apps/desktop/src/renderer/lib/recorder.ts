import type { Room } from 'livekit-client';
import { followCallAudio } from './callAudio';

const MIME_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

/**
 * Records what the admin sees (this app window) plus every voice in the call, mixed.
 * Chunks are streamed to disk by the main process every few seconds.
 */
export class SessionRecorder {
  private recorder: MediaRecorder | null = null;
  private video: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private stopFollowing: (() => void) | null = null;
  private fileId = 0;
  private writes: Promise<unknown> = Promise.resolve();

  static available() {
    return !!window.brightboard && typeof MediaRecorder !== 'undefined';
  }

  async start(room: Room, title: string) {
    const files = window.brightboard!.files;
    const sourceId = await files.windowSource();
    if (!sourceId) throw new Error('no window source');
    // Electron's legacy constraint form for capturing a specific window without a picker.
    this.video = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxFrameRate: 24, maxWidth: 1920, maxHeight: 1080 } },
    } as unknown as MediaStreamConstraints);

    this.ctx = new AudioContext();
    const mix = this.ctx.createMediaStreamDestination();
    const nodes = new Map<string, MediaStreamAudioSourceNode>();
    this.stopFollowing = followCallAudio(
      room,
      ({ key, track }) => {
        if (nodes.has(key) || !this.ctx) return;
        const node = this.ctx.createMediaStreamSource(new MediaStream([track]));
        node.connect(mix);
        nodes.set(key, node);
      },
      (key) => {
        nodes.get(key)?.disconnect();
        nodes.delete(key);
      },
    );

    const stream = new MediaStream([...this.video.getVideoTracks(), ...mix.stream.getAudioTracks()]);
    const mimeType = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
    const { id, path } = await files.startRecording(title);
    this.fileId = id;
    this.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    this.recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      // Keep chunks in order even though arrayBuffer() is async.
      this.writes = this.writes.then(() => e.data.arrayBuffer()).then((buf) => files.writeRecording(this.fileId, buf));
    };
    this.recorder.start(5000);
    return path;
  }

  /** Stops, flushes the last chunk and returns the saved file path. */
  async stop(): Promise<string | null> {
    const rec = this.recorder;
    if (!rec) return null;
    this.recorder = null;
    if (rec.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        rec.stop();
      });
    }
    await this.writes;
    this.stopFollowing?.();
    this.video?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => undefined);
    return window.brightboard!.files.stopRecording(this.fileId);
  }
}
