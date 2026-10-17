/**
 * Names the meeting screens use, kept close to LiveKit's so the screens barely changed when calls
 * moved to Cloudflare (Realtime SFU for media, a Durable Object per room for everything else).
 */

export enum RoomEvent {
  ConnectionStateChanged = 'connectionStateChanged',
  Disconnected = 'disconnected',
  ParticipantConnected = 'participantConnected',
  ParticipantDisconnected = 'participantDisconnected',
  ParticipantMetadataChanged = 'participantMetadataChanged',
  ParticipantAttributesChanged = 'participantAttributesChanged',
  ParticipantPermissionsChanged = 'participantPermissionsChanged',
  ParticipantNameChanged = 'participantNameChanged',
  TrackPublished = 'trackPublished',
  TrackUnpublished = 'trackUnpublished',
  TrackSubscribed = 'trackSubscribed',
  TrackUnsubscribed = 'trackUnsubscribed',
  TrackMuted = 'trackMuted',
  TrackUnmuted = 'trackUnmuted',
  LocalTrackPublished = 'localTrackPublished',
  LocalTrackUnpublished = 'localTrackUnpublished',
  ActiveSpeakersChanged = 'activeSpeakersChanged',
  RoomMetadataChanged = 'roomMetadataChanged',
  DataReceived = 'dataReceived',
}

export enum ConnectionState {
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Disconnected = 'disconnected',
}

export enum DisconnectReason {
  CLIENT_INITIATED = 'clientInitiated',
  ROOM_DELETED = 'roomDeleted',
  PARTICIPANT_REMOVED = 'participantRemoved',
  DUPLICATE_IDENTITY = 'duplicateIdentity',
  CONNECTION_LOST = 'connectionLost',
}

export namespace Track {
  export enum Source {
    Camera = 'camera',
    Microphone = 'microphone',
    ScreenShare = 'screen_share',
    ScreenShareAudio = 'screen_share_audio',
  }
  export type Kind = 'audio' | 'video';
}

export interface DataPublishOptions {
  reliable?: boolean;
  topic?: string;
  destinationIdentities?: string[];
}

export interface TextStreamReader {
  readAll(): Promise<string>;
  info: { topic: string };
}
