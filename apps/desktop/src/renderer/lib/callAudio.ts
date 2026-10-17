import { RoomEvent, Track, type LocalTrackPublication, type Participant, type RemoteTrack, type RemoteTrackPublication, type Room } from './rtc';

export interface AudioSource {
  /** Stable per publication. */
  key: string;
  track: MediaStreamTrack;
  participant: Participant;
}

/**
 * Follows every microphone in the call (local + remote) and reports when one appears or goes away.
 * Used by the recorder (mix everything) and the transcript (one stream per speaker).
 */
export function followCallAudio(room: Room, onAdd: (s: AudioSource) => void, onRemove: (key: string) => void) {
  const isMic = (source: Track.Source) => source === Track.Source.Microphone;

  const local = room.localParticipant;
  for (const pub of local.trackPublications.values()) {
    if (isMic(pub.source) && pub.track) onAdd({ key: pub.trackSid, track: pub.track.mediaStreamTrack, participant: local });
  }
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (isMic(pub.source) && pub.track) onAdd({ key: pub.trackSid, track: pub.track.mediaStreamTrack, participant: p });
    }
  }

  const subscribed = (track: RemoteTrack, pub: RemoteTrackPublication, p: Participant) => {
    if (isMic(pub.source)) onAdd({ key: pub.trackSid, track: track.mediaStreamTrack, participant: p });
  };
  const unsubscribed = (_t: RemoteTrack, pub: RemoteTrackPublication) => onRemove(pub.trackSid);
  // Also fires when the mic is switched to another device, so swap the old track out first.
  const localPublished = (pub: LocalTrackPublication) => {
    if (!isMic(pub.source) || !pub.track) return;
    onRemove(pub.trackSid);
    onAdd({ key: pub.trackSid, track: pub.track.mediaStreamTrack, participant: local });
  };
  const localUnpublished = (pub: LocalTrackPublication) => onRemove(pub.trackSid);

  room.on(RoomEvent.TrackSubscribed, subscribed);
  room.on(RoomEvent.TrackUnsubscribed, unsubscribed);
  room.on(RoomEvent.LocalTrackPublished, localPublished);
  room.on(RoomEvent.LocalTrackUnpublished, localUnpublished);
  return () => {
    room.off(RoomEvent.TrackSubscribed, subscribed);
    room.off(RoomEvent.TrackUnsubscribed, unsubscribed);
    room.off(RoomEvent.LocalTrackPublished, localPublished);
    room.off(RoomEvent.LocalTrackUnpublished, localUnpublished);
  };
}
