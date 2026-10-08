import type { ParticipantMeta, RoomMeta } from '@classroom/protocol';
import { RoomEvent, type Participant, type Room } from 'livekit-client';
import { useEffect, useState } from 'react';
import { colorFor } from '../lib/format';

/** protocol TrackSource.SCREEN_SHARE */
const SCREEN_SHARE_SOURCE = 3;

export function metaOf(p: Participant): ParticipantMeta {
  try {
    return { role: 'guest', ...JSON.parse(p.metadata || '{}') };
  } catch {
    return { role: 'guest' };
  }
}

export const isHost = (p: Participant) => metaOf(p).role === 'host';
export const isWaiting = (p: Participant) => !!metaOf(p).waiting;
export const handUp = (p: Participant) => p.attributes?.hand === '1';
export const isAway = (p: Participant) => p.attributes?.away === '1';
export const colorOf = (p: Participant) => metaOf(p).avatarColor || colorFor(p.identity);
export const nameOf = (p: Participant) => p.name || p.identity;

/** Whether the server lets this participant publish a screen share. Empty list = everything allowed. */
export function canShareScreen(p: Participant) {
  const sources = p.permissions?.canPublishSources as number[] | undefined;
  return !sources || sources.length === 0 || sources.includes(SCREEN_SHARE_SOURCE);
}

const EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ParticipantMetadataChanged,
  RoomEvent.ParticipantAttributesChanged,
  RoomEvent.ParticipantPermissionsChanged,
  RoomEvent.ParticipantNameChanged,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.RoomMetadataChanged,
  RoomEvent.ConnectionStateChanged,
] as const;

/** Re-renders whenever anything about participants or the room changes. */
export function useRoomVersion(room: Room) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    EVENTS.forEach((e) => room.on(e, bump));
    return () => EVENTS.forEach((e) => room.off(e, bump));
  }, [room]);
  return version;
}

export function roomMetaOf(room: Room): RoomMeta {
  const defaults: RoomMeta = { title: '', recording: false, kind: 'hangout', waitingRoom: false, muteOnJoin: false, guestsCanShare: false, chatEnabled: true, locked: false, spotlight: null };
  try {
    return { ...defaults, ...JSON.parse(room.metadata || '{}') };
  } catch {
    return defaults;
  }
}

export function allParticipants(room: Room): Participant[] {
  return [room.localParticipant, ...room.remoteParticipants.values()];
}
