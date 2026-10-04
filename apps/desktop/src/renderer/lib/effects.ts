import { BackgroundBlur, supportsBackgroundProcessors, VirtualBackground } from '@livekit/track-processors';
import type { LocalVideoTrack } from 'livekit-client';
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

/** Applies (or removes) a camera background effect. Failures leave the plain camera. */
export async function applyBackground(track: LocalVideoTrack, bg: Background) {
  try {
    if (bg === 'none' || !backgroundsSupported()) {
      if (track.getProcessor()) await track.stopProcessor();
      return;
    }
    const processor = bg === 'blur' ? BackgroundBlur(14) : VirtualBackground(BACKGROUND_IMAGES[bg]!);
    await track.setProcessor(processor);
  } catch (e) {
    console.warn('background effect failed', e);
  }
}
