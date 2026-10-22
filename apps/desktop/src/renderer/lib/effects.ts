import { BackgroundBlur, supportsBackgroundProcessors, VirtualBackground } from '@livekit/track-processors';
import calm from '../assets/bg-calm.jpg';
import classroom from '../assets/bg-classroom.jpg';
import library from '../assets/bg-library.jpg';
import type { Background } from './settings';
import { safeGet, safeSet } from './storage';

/** Pictures that ship with the app. */
const PHOTOS: Record<string, string> = { classroom, library, calm };

/** Drawn backgrounds: made once on this computer, so they cost nothing to ship. */
const PAINTED: Record<string, (g: CanvasRenderingContext2D, w: number, h: number) => void> = {
  sunset: (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#ffb88c');
    sky.addColorStop(0.55, '#ff7e8a');
    sky.addColorStop(1, '#7a4f9e');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255, 236, 190, 0.85)';
    g.beginPath();
    g.arc(w * 0.72, h * 0.62, h * 0.16, 0, Math.PI * 2);
    g.fill();
  },
  ocean: (g, w, h) => {
    const sea = g.createLinearGradient(0, 0, w, h);
    sea.addColorStop(0, '#1c6f9c');
    sea.addColorStop(1, '#7fd6e8');
    g.fillStyle = sea;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    g.lineWidth = 6;
    for (let y = h * 0.35; y < h; y += h * 0.12) {
      g.beginPath();
      for (let x = 0; x <= w; x += 20) g.lineTo(x, y + Math.sin(x / 70) * 10);
      g.stroke();
    }
  },
  forest: (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#cfe8c4');
    bg.addColorStop(1, '#3f7a52');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = (i + 0.5) * (w / 9);
      const top = h * (0.25 + (i % 3) * 0.08);
      g.fillStyle = i % 2 ? 'rgba(30, 80, 50, 0.55)' : 'rgba(45, 105, 65, 0.45)';
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x - w / 12, h);
      g.lineTo(x + w / 12, h);
      g.fill();
    }
  },
  chalk: (g, w, h) => {
    g.fillStyle = '#26402f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    g.lineWidth = 3;
    g.font = `${Math.round(h / 9)}px "Segoe Print", "Comic Sans MS", cursive`;
    g.fillStyle = 'rgba(255, 255, 255, 0.16)';
    g.fillText('a² + b² = c²', w * 0.08, h * 0.25);
    g.fillText('π ≈ 3.14', w * 0.62, h * 0.8);
    g.beginPath();
    g.moveTo(w * 0.1, h * 0.75);
    g.lineTo(w * 0.32, h * 0.45);
    g.lineTo(w * 0.42, h * 0.75);
    g.closePath();
    g.stroke();
  },
};

/** Built-in choices, in picker order. */
export const BUILT_IN_BACKGROUNDS = ['none', 'blur-light', 'blur', 'classroom', 'library', 'calm', 'sunset', 'ocean', 'forest', 'chalk'] as const;

const painted = new Map<string, string>();
function paint(name: string) {
  if (!painted.has(name)) {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 720;
    PAINTED[name](c.getContext('2d')!, c.width, c.height);
    painted.set(name, c.toDataURL('image/jpeg', 0.9));
  }
  return painted.get(name)!;
}

// ---------- your own pictures (kept on this computer only) ----------
export interface CustomBackground {
  id: string;
  dataURL: string;
}
const CUSTOM_KEY = 'brightboardBackgrounds';
export const MAX_CUSTOM_BACKGROUNDS = 6;

export function customBackgrounds(): CustomBackground[] {
  try {
    const list = JSON.parse(safeGet(CUSTOM_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((b) => typeof b?.id === 'string' && typeof b?.dataURL === 'string' && b.dataURL.startsWith('data:image/')) : [];
  } catch {
    return [];
  }
}

/** Shrinks a picked file to a 1280-wide JPEG and saves it; resolves to its background name. */
export async function addCustomBackground(file: File): Promise<Background> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  const item = { id: crypto.randomUUID().slice(0, 8), dataURL: c.toDataURL('image/jpeg', 0.85) };
  safeSet(CUSTOM_KEY, JSON.stringify([item, ...customBackgrounds()].slice(0, MAX_CUSTOM_BACKGROUNDS)));
  return `custom:${item.id}`;
}

export function removeCustomBackground(bg: Background) {
  safeSet(CUSTOM_KEY, JSON.stringify(customBackgrounds().filter((b) => `custom:${b.id}` !== bg)));
}

/** The picture behind you for a background choice, or null for none/blur. */
export function backgroundImage(bg: Background): string | null {
  if (bg.startsWith('custom:')) return customBackgrounds().find((b) => `custom:${b.id}` === bg)?.dataURL ?? null;
  if (PHOTOS[bg]) return PHOTOS[bg];
  if (PAINTED[bg]) return paint(bg);
  return null;
}

export const backgroundsSupported = () => {
  try {
    return supportsBackgroundProcessors();
  } catch {
    return false;
  }
};

export type VideoEffect = (track: MediaStreamTrack) => Promise<MediaStreamTrack>;

type FrameProcessor = { readable: ReadableStream };
type FrameGenerator = MediaStreamTrack & { writable: WritableStream };
const Streams = globalThis as unknown as {
  MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => FrameProcessor;
  MediaStreamTrackGenerator?: new (o: { kind: 'video' }) => FrameGenerator;
};

/** The same frames as `track`, on a track with no camera device behind it (falls back to the track itself). */
function relay(track: MediaStreamTrack): { input: MediaStreamTrack; stopRelay: () => void } {
  if (!Streams.MediaStreamTrackProcessor || !Streams.MediaStreamTrackGenerator) return { input: track, stopRelay: () => undefined };
  const reader = new Streams.MediaStreamTrackProcessor({ track });
  const out = new Streams.MediaStreamTrackGenerator({ kind: 'video' });
  const abort = new AbortController();
  reader.readable.pipeTo(out.writable, { signal: abort.signal }).catch(() => undefined);
  return {
    input: out,
    stopRelay: () => {
      abort.abort();
      out.stop();
    },
  };
}

/**
 * The camera background effect for a setting (blur or a picture), or null for none.
 * It returns a processed copy of the camera; stopping that copy also shuts the effect down.
 */
export function videoEffectFor(bg: Background): VideoEffect | null {
  if (bg === 'none' || !backgroundsSupported()) return null;
  const image = backgroundImage(bg);
  if (!image && bg !== 'blur' && bg !== 'blur-light') return null; // e.g. a deleted picture
  return async (track) => {
    const processor = image ? VirtualBackground(image) : BackgroundBlur(bg === 'blur-light' ? 6 : 14);
    // When the processor shuts down it signals its input's *device* to stop, which would end every copy
    // of the camera (and leave it unusable until restart). So it reads a relayed copy that has no device
    // behind it: switching or removing a background never touches the real camera.
    const copy = track.clone();
    const { input, stopRelay } = relay(copy);
    const element = document.createElement('video');
    element.muted = true;
    element.playsInline = true;
    element.srcObject = new MediaStream([input]);
    await element.play().catch(() => undefined);
    const release = () => {
      element.srcObject = null;
      stopRelay();
      copy.stop();
    };
    try {
      await processor.init({ kind: 'video', track: input, element } as never);
    } catch (e) {
      release();
      throw e;
    }
    const processed = processor.processedTrack;
    if (!processed) {
      void processor.destroy().catch(() => undefined);
      release();
      return track;
    }
    const stop = processed.stop.bind(processed);
    processed.stop = () => {
      stop();
      void processor
        .destroy()
        .catch(() => undefined)
        .finally(release);
    };
    return processed;
  };
}
