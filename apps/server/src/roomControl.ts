import { RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { Config } from './config';

export interface RoomParticipant {
  identity: string;
  metadata: string;
  /** `source` is the TrackSource name, e.g. MICROPHONE, CAMERA. */
  tracks: { sid: string; source: string }[];
}

export interface ParticipantPermission {
  canSubscribe: boolean;
  canPublish: boolean;
  canPublishData: boolean;
  canUpdateMetadata: boolean;
  canPublishSources: TrackSource[];
}

/** The LiveKit server operations the API needs. Injected so tests can use a fake. */
export interface RoomControl {
  ensureRoom(room: string, metadata: string): Promise<void>;
  deleteRoom(room: string): Promise<void>;
  setRoomMetadata(room: string, metadata: string): Promise<void>;
  listParticipants(room: string): Promise<RoomParticipant[]>;
  muteTrack(room: string, identity: string, trackSid: string): Promise<void>;
  removeParticipant(room: string, identity: string): Promise<void>;
  updateParticipant(room: string, identity: string, metadata: string | undefined, permission: Partial<ParticipantPermission> | undefined): Promise<void>;
}

export const sourcesFor = (canShare: boolean) =>
  canShare
    ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
    : [TrackSource.CAMERA, TrackSource.MICROPHONE];

export function liveKitRoomControl(cfg: Config): RoomControl {
  const client = new RoomServiceClient(cfg.livekitUrl.replace(/^ws/, 'http'), cfg.livekitApiKey, cfg.livekitApiSecret);
  // Most calls fail harmlessly when the room is already gone; callers decide whether that matters.
  return {
    async ensureRoom(room, metadata) {
      await client.createRoom({ name: room, metadata, emptyTimeout: 10 * 60, departureTimeout: 60 });
      await client.updateRoomMetadata(room, metadata);
    },
    async deleteRoom(room) {
      await client.deleteRoom(room).catch(() => undefined);
    },
    async setRoomMetadata(room, metadata) {
      await client.updateRoomMetadata(room, metadata).catch(() => undefined);
    },
    async listParticipants(room) {
      const list = await client.listParticipants(room).catch(() => []);
      return list.map((p) => ({
        identity: p.identity,
        metadata: p.metadata,
        tracks: p.tracks.map((t) => ({ sid: t.sid, source: TrackSource[t.source] })),
      }));
    },
    async muteTrack(room, identity, trackSid) {
      await client.mutePublishedTrack(room, identity, trackSid, true);
    },
    async removeParticipant(room, identity) {
      await client.removeParticipant(room, identity);
    },
    async updateParticipant(room, identity, metadata, permission) {
      await client.updateParticipant(room, identity, { metadata, permission });
    },
  };
}
