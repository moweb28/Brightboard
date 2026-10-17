export * from './roomCode';
export * from './chat';
export * from './remote';
export * from './files';
export * from './webm';
export * from './schedule';
export * from './local';
export * from './relay';

/** In a call: whoever created the space hosts; everyone else is a guest. */
export type Role = 'host' | 'guest';

export const AVATAR_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'] as const;
export const SPACE_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'] as const;
export const SPACE_EMOJIS = ['☀️', '💬', '🎓', '🎉', '💼', '🏡', '🎮', '🎨', '📚', '🧪', '🎵', '⚽', '🍿', '🚀', '🌱', '❤️'] as const;

export const SPACE_KINDS = ['hangout', 'meeting', 'class', 'event'] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

export const USE_CASES = ['friends', 'work', 'school', 'events'] as const;
export type UseCase = (typeof USE_CASES)[number];

export interface SpaceSettings {
  waitingRoom: boolean;
  muteOnJoin: boolean;
  guestsCanShare: boolean;
  chatEnabled: boolean;
  locked: boolean;
}

/** Default settings for each kind of space; the host can change any of them later. */
export const KIND_PRESETS: Record<SpaceKind, Omit<SpaceSettings, 'locked'>> = {
  hangout: { waitingRoom: false, muteOnJoin: false, guestsCanShare: true, chatEnabled: true },
  meeting: { waitingRoom: true, muteOnJoin: false, guestsCanShare: true, chatEnabled: true },
  class: { waitingRoom: true, muteOnJoin: true, guestsCanShare: false, chatEnabled: true },
  event: { waitingRoom: false, muteOnJoin: true, guestsCanShare: false, chatEnabled: true },
};

export const KIND_EMOJI: Record<SpaceKind, string> = { hangout: '☀️', meeting: '💼', class: '🎓', event: '🎉' };

/** The space kind that best fits what someone said they use the app for. */
export function defaultKindFor(useCases: readonly string[]): SpaceKind {
  if (useCases.includes('school')) return 'class';
  if (useCases.includes('work')) return 'meeting';
  if (useCases.includes('events')) return 'event';
  return 'hangout';
}

export interface UserDto {
  id: number;
  email: string;
  displayName: string;
  avatarColor: string;
  about: string;
  useCases: UseCase[];
  onboarded: boolean;
}

export interface SpaceDto extends SpaceSettings {
  id: number;
  code: string;
  title: string;
  emoji: string;
  color: string;
  kind: SpaceKind;
  schedule: string;
  /** Whether a password is needed to join. */
  hasPassword: boolean;
  /** Only present for the host. Empty string = no password. */
  password?: string;
  isHost: boolean;
  hostName: string;
  live: boolean;
  peopleCount: number;
  lastCallAt: number | null;
}

export interface CallDto {
  id: number;
  startedAt: number;
  endedAt: number | null;
  attendeeCount: number;
}

export interface AttendanceDto {
  name: string;
  userId: number | null;
  joinedAt: number;
}

export interface HostStats {
  spaces: number;
  people: number;
  callsThisWeek: number;
  minutesTogether: number;
}

/** Shared state the admin controls, kept by the room relay while the call lasts. */
export interface RoomMeta extends SpaceSettings {
  title: string;
  /** The admin is recording this call (shown to everyone). */
  recording: boolean;
  /** The admin is transcribing everyone (shown to everyone). */
  transcribing: boolean;
  /** The shared whiteboard is on stage for everyone. */
  boardOpen: boolean;
  /** Only the admin may draw. */
  boardLocked: boolean;
  kind: SpaceKind;
  spotlight: string | null;
}

/** Who someone is in a call, as the relay reports it. */
export interface ParticipantMeta {
  role: Role;
  waiting?: boolean;
  avatarColor?: string;
  picture?: string | null;
}

/** Participant attributes each client sets for itself. */
export interface ParticipantAttrs {
  hand?: '1' | '';
  away?: '1' | '';
}

/** What the app needs to enter a call. */
export interface JoinInfo {
  url: string;
  token: string;
  identity: string;
  role: Role;
  /** The room code. */
  roomName: string;
  /** Local space id on the admin's computer; the room code for guests. */
  spaceId: string;
  spaceTitle: string;
  spaceColor: string;
  spacePicture: string | null;
  kind: SpaceKind;
  waiting: boolean;
}

export type ModerateAction =
  | { action: 'mute' | 'stopVideo' | 'lowerHand' | 'remove' | 'admit'; identity: string }
  | { action: 'muteAll' | 'admitAll' }
  | { action: 'allowShare'; identity: string; value: boolean }
  | { action: 'lock' | 'chat' | 'recording' | 'transcribing' | 'board' | 'boardLock'; value: boolean }
  | { action: 'spotlight'; identity: string | null };

export * from './board/sync';
export * from './board/mindmap';
export * from './board/shapes';
export * from './board/measure';
export * from './board/geometry';
export * from './transcript';
