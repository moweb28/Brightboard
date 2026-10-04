export * from './roomCode';
export * from './chat';

export type Role = 'teacher' | 'student';

export const AVATAR_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'] as const;
export const CLASS_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'] as const;

export interface UserDto {
  id: number;
  email: string;
  role: Role;
  displayName: string;
  avatarColor: string;
  school: string;
  subject: string;
  grade: string;
  onboarded: boolean;
}

export interface ClassSettings {
  waitingRoom: boolean;
  muteOnJoin: boolean;
  studentsCanShare: boolean;
  chatEnabled: boolean;
  locked: boolean;
}

export interface ClassDto extends ClassSettings {
  id: number;
  code: string;
  title: string;
  subject: string;
  color: string;
  schedule: string;
  /** Only present for the owning teacher. */
  joinPassword?: string;
  teacherName: string;
  live: boolean;
  studentCount: number;
  lastSessionAt: number | null;
}

export interface SessionDto {
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

export interface TeacherStats {
  classes: number;
  students: number;
  sessionsThisWeek: number;
  minutesTaught: number;
}

/** Shared state the teacher controls, stored as LiveKit room metadata. */
export interface RoomMeta extends ClassSettings {
  title: string;
  spotlight: string | null;
}

/** Stored as LiveKit participant metadata (set by the server). */
export interface ParticipantMeta {
  role: Role;
  waiting?: boolean;
  avatarColor?: string;
}

/** Participant attributes each client sets for itself. */
export interface ParticipantAttrs {
  hand?: '1' | '';
  away?: '1' | '';
}

/** Response from the server's start/join endpoints. */
export interface JoinInfo {
  url: string;
  token: string;
  identity: string;
  role: Role;
  roomName: string;
  classId: number;
  classTitle: string;
  waiting: boolean;
}

export type ModerateAction =
  | { action: 'mute' | 'stopVideo' | 'remove' | 'admit'; identity: string }
  | { action: 'muteAll' | 'admitAll' }
  | { action: 'allowShare'; identity: string; value: boolean }
  | { action: 'lock' | 'chat'; value: boolean }
  | { action: 'spotlight'; identity: string | null };
