import type { JoinInfo } from '@classroom/protocol';
import type { ErrorKey } from './i18n';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'teacherToken';

export const teacherToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** An error the UI can translate: `key` picks the message in the current language. */
export class AppError extends Error {
  constructor(public key: ErrorKey) {
    super(key);
  }
}

async function call<T>(path: string, body: unknown, opts: { auth?: boolean; errors?: Partial<Record<number, ErrorKey>> } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.auth) headers.authorization = `Bearer ${teacherToken.get() ?? ''}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  } catch {
    throw new AppError('offline');
  }
  if (!res.ok) {
    if (res.status === 401 && opts.auth) teacherToken.clear();
    throw new AppError(opts.errors?.[res.status] ?? 'generic');
  }
  return (await res.json()) as T;
}

export const inviteLink = (code: string) => `${API_URL}/j/${code}`;

export const api = {
  login: (email: string, password: string) => call<{ token: string }>('/auth/login', { email, password }, { errors: { 401: 'wrongLogin' } }),
  register: (email: string, password: string) => call<{ token: string }>('/auth/register', { email, password }, { errors: { 409: 'emailTaken' } }),
  createRoom: (password: string) => call<{ code: string; display: string }>('/rooms', { password }, { auth: true }),
  host: (code: string) => call<JoinInfo>(`/rooms/${code}/host`, {}, { auth: true }),
  join: (code: string, name: string, password: string) =>
    call<JoinInfo>(`/rooms/${code}/join`, { name, password }, { errors: { 401: 'wrongPassword', 404: 'notFound', 429: 'tooMany' } }),
};
