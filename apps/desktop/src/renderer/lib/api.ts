import type { AttendanceDto, CallDto, HostStats, JoinInfo, ModerateAction, SpaceDto, SpaceKind, UserDto } from '@classroom/protocol';

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

export interface SpaceInput {
  title?: string;
  emoji?: string;
  color?: string;
  kind?: SpaceKind;
  schedule?: string;
  password?: string;
  waitingRoom?: boolean;
  muteOnJoin?: boolean;
  guestsCanShare?: boolean;
  chatEnabled?: boolean;
}

export const inviteLink = (code: string) => `${API_URL}/j/${code.slice(0, 3)}-${code.slice(3)}`;
export const randomPassword = () => String(1000 + Math.floor(Math.random() * 9000));

export const api = {
  register: (email: string, password: string) => request<{ token: string; user: UserDto }>('POST', '/auth/register', { email, password }),
  login: (email: string, password: string) => request<{ token: string; user: UserDto }>('POST', '/auth/login', { email, password }),
  me: () => request<UserDto>('GET', '/me'),
  updateMe: (patch: Partial<Pick<UserDto, 'displayName' | 'avatarColor' | 'about' | 'useCases' | 'onboarded'>>) => request<UserDto>('PATCH', '/me', patch),
  changePassword: (current: string, next: string) => request<void>('POST', '/me/password', { current, next }),
  stats: () => request<HostStats>('GET', '/stats'),
  spaces: () => request<SpaceDto[]>('GET', '/spaces'),
  getSpace: (id: number) => request<SpaceDto>('GET', `/spaces/${id}`),
  createSpace: (input: SpaceInput) => request<SpaceDto>('POST', '/spaces', input),
  instant: () => request<JoinInfo>('POST', '/spaces/instant'),
  updateSpace: (id: number, input: SpaceInput) => request<SpaceDto>('PATCH', `/spaces/${id}`, input),
  deleteSpace: (id: number) => request<void>('DELETE', `/spaces/${id}`),
  calls: (id: number) => request<CallDto[]>('GET', `/spaces/${id}/calls`),
  attendance: (id: number, callId: number) => request<AttendanceDto[]>('GET', `/spaces/${id}/calls/${callId}/attendance`),
  start: (id: number) => request<JoinInfo>('POST', `/spaces/${id}/start`),
  end: (id: number) => request<void>('POST', `/spaces/${id}/end`),
  moderate: (id: number, action: ModerateAction) => request<void>('POST', `/spaces/${id}/moderate`, action),
  join: (code: string, name: string, password: string) => request<JoinInfo>('POST', `/join/${code}`, { name, password }),
};
