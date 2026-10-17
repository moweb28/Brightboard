import type { SpaceKind, SpaceSettings, UseCase } from './index';
import type { Schedule } from './schedule';

/** Everything the app keeps, stored only on this computer. */

export interface Profile {
  name: string;
  color: string;
  about: string;
  /** Square WebP data URL, or null for colored initials. */
  picture: string | null;
  useCases: UseCase[];
}

/** A space this computer is the admin of. */
export interface Space extends Omit<SpaceSettings, 'locked'> {
  id: string;
  code: string;
  title: string;
  color: string;
  picture: string | null;
  kind: SpaceKind;
  schedule: Schedule | null;
  /** Empty string = no password. */
  password: string;
  /** Proves to the call service that this computer is the admin. Never shared. */
  adminKey: string;
  createdAt: number;
}

/** A space someone else runs, remembered after joining it from a link. */
export interface JoinedSpace {
  code: string;
  title: string;
  color: string;
  picture: string | null;
  kind: SpaceKind;
  schedule: Schedule | null;
  adminName: string;
  lastJoinedAt: number;
  /** Remembered so rejoining doesn't ask again. Stays on this computer. */
  password?: string;
}

export interface CallRecord {
  id: string;
  spaceId: string;
  startedAt: number;
  endedAt: number | null;
  /** Saved every minute during the call, so a call cut short (crash, power cut) still gets an end time. */
  lastSeenAt?: number;
  attendees: { name: string; joinedAt: number }[];
}

export interface LocalData {
  version: 1;
  profile: Profile | null;
  spaces: Space[];
  joined: JoinedSpace[];
  calls: CallRecord[];
}

export const EMPTY_LOCAL_DATA: LocalData = { version: 1, profile: null, spaces: [], joined: [], calls: [] };

/** Space info the admin shares with people who join, so their app can show it and its schedule. */
export interface SharedSpaceInfo {
  title: string;
  color: string;
  picture: string | null;
  kind: SpaceKind;
  schedule: Schedule | null;
  adminName: string;
}
