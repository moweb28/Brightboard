import { BackgroundBlur, supportsBackgroundProcessors, VirtualBackground } from '@livekit/track-processors';
import calm from '../assets/bg-calm.jpg';
import classroom from '../assets/bg-classroom.jpg';
import library from '../assets/bg-library.jpg';
import type { Background } from './settings';

export const BACKGROUND_IMAGES: Partial<Record<Background, string>> = { classroom, library, calm };

export const backgroundsSupported = () => {
  try {
    return supportsBackgroundProcessors();
  } catch {
    return false;
  }
};

export type VideoEffect = (track: MediaStreamTrack) => Promise<MediaStreamTrack>;

/**
 * The camera background effect for a setting (blur or a picture), or null for none.
 * It returns a processed copy of the camera; stopping that copy also shuts the effect down.
 */
export function videoEffectFor(bg: Background): VideoEffect | null {
  if (bg === 'none' || !backgroundsSupported()) return null;
  return async (track) => {
    const processor = bg === 'blur' ? BackgroundBlur(14) : VirtualBackground(BACKGROUND_IMAGES[bg]!);
    await processor.init({ kind: 'video', track } as never);
    const processed = processor.processedTrack;
    if (!processed) {
      void processor.destroy();
      return track;
    }
    const stop = processed.stop.bind(processed);
    processed.stop = () => {
      stop();
      void processor.destroy().catch(() => undefined);
    };
    return processed;
  };
}
