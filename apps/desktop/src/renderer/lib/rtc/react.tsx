import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Participant, TrackPublication } from './participant';
import type { Room } from './room';
import { ConnectionState, RoomEvent, Track } from './types';

const RoomContext = createContext<Room | null>(null);

export function RoomProvider({ room, children, className }: { room: Room; children: ReactNode; className?: string }) {
  return (
    <RoomContext.Provider value={room}>
      <div className={className}>{children}</div>
    </RoomContext.Provider>
  );
}

export function useRoomContext() {
  const room = useContext(RoomContext);
  if (!room) throw new Error('useRoomContext outside RoomProvider');
  return room;
}

/** Re-renders when any of `events` fire on the room. */
function useRoomEvents(room: Room, events: RoomEvent[]) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    events.forEach((e) => room.on(e, bump));
    return () => events.forEach((e) => room.off(e, bump));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
}

export function useConnectionState(): ConnectionState {
  const room = useRoomContext();
  useRoomEvents(room, [RoomEvent.ConnectionStateChanged]);
  return room.state;
}

export interface TrackReference {
  participant: Participant;
  source: Track.Source;
  publication: TrackPublication;
}
export type TrackReferenceOrPlaceholder = TrackReference | { participant: Participant; source: Track.Source; publication?: undefined };
export const isTrackReference = (r: TrackReferenceOrPlaceholder): r is TrackReference => !!r.publication;

const TRACK_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ParticipantMetadataChanged,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
];

/** Everyone's tracks of the given sources (with placeholders for people without one, if asked). */
export function useTracks(sources: { source: Track.Source; withPlaceholder: boolean }[], _opts?: { onlySubscribed?: boolean }): TrackReferenceOrPlaceholder[] {
  const room = useRoomContext();
  useRoomEvents(room, TRACK_EVENTS);
  const people: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
  const refs: TrackReferenceOrPlaceholder[] = [];
  for (const { source, withPlaceholder } of sources)
    for (const participant of people) {
      const publication = participant.getTrackPublication(source);
      if (publication) refs.push({ participant, source, publication });
      else if (withPlaceholder) refs.push({ participant, source });
    }
  return refs;
}

export function useIsSpeaking(p: Participant) {
  const room = useRoomContext();
  useRoomEvents(room, [RoomEvent.ActiveSpeakersChanged]);
  return p.isSpeaking;
}

/** Plays a video track. `quality` asks for the small or large version of someone's camera. */
export function VideoTrack({ trackRef, className, quality = 'high' }: { trackRef: TrackReference; className?: string; quality?: 'high' | 'low' }) {
  const room = useRoomContext();
  const ref = useRef<HTMLVideoElement>(null);
  const track = trackRef.publication.track?.mediaStreamTrack;
  const { participant, source } = trackRef;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = track ? new MediaStream([track]) : null;
    if (track) void el.play().catch(() => undefined);
  }, [track]);

  useEffect(() => {
    if (!participant.isLocal && source === Track.Source.Camera) room.setVideoQuality(participant.identity, quality);
  }, [room, participant, source, quality]);

  return <video ref={ref} className={className} autoPlay playsInline muted />;
}
