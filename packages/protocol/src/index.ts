export * from './roomCode';

export type Role = 'teacher' | 'student';

/** Response from the server's host/join endpoints. */
export interface JoinInfo {
  url: string;
  token: string;
  identity: string;
  role: Role;
  roomName: string;
}
