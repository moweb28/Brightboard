import type { JoinInfo } from '@classroom/protocol';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'teacherToken';

export const teacherToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function call<T>(path: string, body?: unknown, auth = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) headers.authorization = `Bearer ${teacherToken.get() ?? ''}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the class server. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) teacherToken.clear();
    throw new Error(data.message ?? `Something went wrong (${res.status})`);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) => call<{ token: string }>('/auth/login', { email, password }),
  register: (email: string, password: string) => call<{ token: string }>('/auth/register', { email, password }),
  createRoom: () => call<{ code: string; display: string }>('/rooms', undefined, true),
  host: (code: string) => call<JoinInfo>(`/rooms/${code}/host`, undefined, true),
  join: (code: string, name: string) => call<JoinInfo>(`/rooms/${encodeURIComponent(code)}/join`, { name }),
};
