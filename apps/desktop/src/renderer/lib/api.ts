import type { AttendanceDto, ClassDto, JoinInfo, ModerateAction, Role, SessionDto, TeacherStats, UserDto } from '@classroom/protocol';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'authToken';

export const authToken = {
  get: () => safeGet(TOKEN_KEY),
  set: (t: string) => safeSet(TOKEN_KEY, t),
  clear: () => safeSet(TOKEN_KEY, null),
};

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

/** An API failure with a stable `code` the UI translates (see `errors` in i18n). */
export class ApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = authToken.get();
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('offline', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && data.code === 'unauthorized') onUnauthorized();
    throw new ApiError(data.code ?? 'generic', res.status);
  }
  return data as T;
}

export interface ClassInput {
  title?: string;
  subject?: string;
  color?: string;
  schedule?: string;
  password?: string;
  waitingRoom?: boolean;
  muteOnJoin?: boolean;
  studentsCanShare?: boolean;
  chatEnabled?: boolean;
}

export const inviteLink = (code: string) => `${API_URL}/j/${code.slice(0, 3)}-${code.slice(3)}`;

export const api = {
  register: (email: string, password: string, role: Role) => request<{ token: string; user: UserDto }>('POST', '/auth/register', { email, password, role }),
  login: (email: string, password: string) => request<{ token: string; user: UserDto }>('POST', '/auth/login', { email, password }),
  me: () => request<UserDto>('GET', '/me'),
  updateMe: (patch: Partial<Pick<UserDto, 'displayName' | 'avatarColor' | 'school' | 'subject' | 'grade' | 'onboarded'>>) => request<UserDto>('PATCH', '/me', patch),
  changePassword: (current: string, next: string) => request<void>('POST', '/me/password', { current, next }),
  stats: () => request<TeacherStats>('GET', '/stats'),
  classes: () => request<ClassDto[]>('GET', '/classes'),
  getClass: (id: number) => request<ClassDto>('GET', `/classes/${id}`),
  createClass: (input: ClassInput) => request<ClassDto>('POST', '/classes', input),
  updateClass: (id: number, input: ClassInput) => request<ClassDto>('PATCH', `/classes/${id}`, input),
  archiveClass: (id: number) => request<void>('DELETE', `/classes/${id}`),
  sessions: (id: number) => request<SessionDto[]>('GET', `/classes/${id}/sessions`),
  attendance: (id: number, sessionId: number) => request<AttendanceDto[]>('GET', `/classes/${id}/sessions/${sessionId}/attendance`),
  start: (id: number) => request<JoinInfo>('POST', `/classes/${id}/start`),
  end: (id: number) => request<void>('POST', `/classes/${id}/end`),
  moderate: (id: number, action: ModerateAction) => request<void>('POST', `/classes/${id}/moderate`, action),
  join: (code: string, name: string, password: string) => request<JoinInfo>('POST', `/join/${code}`, { name, password }),
};
