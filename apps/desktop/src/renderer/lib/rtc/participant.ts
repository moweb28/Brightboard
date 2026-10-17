import type { PeerInfo, TrackKind } from '@classroom/protocol';
import { Track } from './types';

export const SOURCE_OF: Record<TrackKind, Track.Source> = {
  mic: Track.Source.Microphone,
  camera: Track.Source.Camera,
  screen: Track.Source.ScreenShare,
  screenAudio: Track.Source.ScreenShareAudio,
};
export const KIND_OF: Record<Track.Source, TrackKind> = {
  [Track.Source.Microphone]: 'mic',
  [Track.Source.Camera]: 'camera',
  [Track.Source.ScreenShare]: 'screen',
  [Track.Source.ScreenShareAudio]: 'screenAudio',
};

/** A playable track: the browser's MediaStreamTrack. */
export interface CallTrack {
  mediaStreamTrack: MediaStreamTrack;
  kind: Track.Kind;
}

export class TrackPublication {
  track: CallTrack | undefined;
  isMuted = false;
  constructor(
    public source: Track.Source,
    public trackSid: string,
  ) {}
  get isSubscribed() {
    return !!this.track;
  }
  get videoTrack() {
    return this.track?.kind === 'video' ? this.track : undefined;
  }
}

/** Someone in the call (you, or another person). */
export class Participant {
  identity = '';
  name = '';
  /** JSON ParticipantMeta: role, waiting, avatarColor, picture. */
  metadata = '{}';
  attributes: Record<string, string> = {};
  canShare = false;
  isSpeaking = false;
  audioLevel = 0;
  trackPublications = new Map<string, TrackPublication>();
  readonly isLocal: boolean = false;

  getTrackPublication(source: Track.Source) {
    for (const pub of this.trackPublications.values()) if (pub.source === source) return pub;
    return undefined;
  }

  get isMicrophoneEnabled() {
    const pub = this.getTrackPublication(Track.Source.Microphone);
    return !!pub && !pub.isMuted;
  }
  get isCameraEnabled() {
    const pub = this.getTrackPublication(Track.Source.Camera);
    return !!pub && !pub.isMuted;
  }
  get isScreenShareEnabled() {
    return !!this.getTrackPublication(Track.Source.ScreenShare);
  }

  /** The relay's latest view of this person. */
  info: PeerInfo | null = null;

  /** Copies who-they-are fields from the relay's view of this person. Returns what changed. */
  applyInfo(info: PeerInfo) {
    const metadata = JSON.stringify({ role: info.role, waiting: info.waiting, avatarColor: info.color, picture: info.picture });
    const attributes = { hand: info.state.hand ? '1' : '', away: info.state.away ? '1' : '' };
    const changed = {
      metadata: metadata !== this.metadata ? this.metadata : null,
      attributes: Object.fromEntries(Object.entries(attributes).filter(([k, v]) => (this.attributes[k] ?? '') !== v)),
      permissions: info.canShare !== this.canShare,
      name: info.name !== this.name,
    };
    this.info = info;
    this.identity = info.id;
    this.name = info.name;
    this.metadata = metadata;
    this.attributes = attributes;
    this.canShare = info.canShare;
    return changed;
  }
}

export class RemoteParticipant extends Participant {}
