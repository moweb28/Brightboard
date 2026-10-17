import type { ModerateAction, Role, RoomMeta, SpaceSettings } from './index';
import type { SharedSpaceInfo } from './local';

/**
 * Messages between the app and the room relay (a Cloudflare Durable Object per room code).
 * The relay only passes things along and keeps who-is-here in memory; it never stores anything.
 */

/** Where a pushed track lives on the Realtime SFU (PartyTracks' TrackMetadata). */
export interface TrackMeta {
  sessionId: string;
  trackName: string;
  location?: 'local' | 'remote';
  mid?: string | null;
}

export const TRACK_KINDS = ['mic', 'camera', 'screen', 'screenAudio'] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];
export type PeerTracks = Partial<Record<TrackKind, TrackMeta>>;

/** Things each person sets about themselves. */
export interface PeerState {
  micOn: boolean;
  cameraOn: boolean;
  hand: boolean;
  away: boolean;
}

export interface PeerInfo {
  id: string;
  name: string;
  color: string;
  /** Small WebP data URL, or null. */
  picture: string | null;
  role: Role;
  /** In the waiting room: sees nothing and is seen by the admin only. */
  waiting: boolean;
  /** May share their screen (admins always may). */
  canShare: boolean;
  joinedAt: number;
  tracks: PeerTracks;
  state: PeerState;
}

export interface AdminHello {
  key: string;
  space: SharedSpaceInfo;
  settings: Omit<SpaceSettings, 'locked'>;
  /** Empty = no password. */
  password: string;
}

export type ClientMessage =
  | { t: 'hello'; name: string; color: string; picture: string | null; password?: string; admin?: AdminHello }
  /** Before the camera check: is the room open, and is this password right? Doesn't join. */
  | { t: 'check'; password?: string }
  /** Ties a new space's code to its admin key, so nobody else can ever open it as admin. Doesn't join. */
  | { t: 'claim'; key: string }
  | { t: 'tracks'; tracks: PeerTracks }
  | { t: 'state'; state: Partial<PeerState> }
  /** Relay `data` on `topic` to everyone (or only `to`). */
  | { t: 'send'; topic: string; data: unknown; to?: string[] }
  | { t: 'admin'; action: AdminAction }
  | { t: 'ping' };

export type AdminAction =
  | ModerateAction
  | { action: 'settings'; patch: Partial<SpaceSettings> }
  | { action: 'space'; space: SharedSpaceInfo; password: string }
  | { action: 'end' };

export type ByeReason = 'ended' | 'removed' | 'replaced';

export type ServerMessage =
  | { t: 'checked'; space: SharedSpaceInfo; needsPassword: boolean }
  | { t: 'claimed'; ok: boolean }
  | { t: 'welcome'; you: PeerInfo; ticket: string | null; room: RoomMeta; space: SharedSpaceInfo; peers: PeerInfo[] }
  | { t: 'peer'; peer: PeerInfo }
  | { t: 'left'; id: string }
  | { t: 'room'; room: RoomMeta }
  | { t: 'msg'; from: string; topic: string; data: unknown }
  | { t: 'cmd'; cmd: 'mute' | 'stopVideo' }
  | { t: 'bye'; reason: ByeReason }
  | { t: 'error'; code: string }
  | { t: 'pong' };

/** Largest message the relay accepts (Durable Object WebSockets allow 1 MiB). */
export const MAX_MESSAGE_BYTES = 900 * 1024;
/** Profile and space pictures are 256 px WebP, well under this. */
export const MAX_PICTURE_CHARS = 120_000;
/** Most people in one room, admin included. */
export const MAX_PEERS = 100;
/** Admin keys are 48 hex characters; much shorter ones are refused. */
export const MIN_ADMIN_KEY = 32;
