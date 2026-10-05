import type { UserDto } from '@classroom/protocol';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, authToken, setUnauthorizedHandler } from './api';

interface AuthState {
  /** undefined while checking a saved session at startup */
  user: UserDto | null | undefined;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): void;
  update(patch: Parameters<typeof api.updateMe>[0]): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null | undefined>(authToken.get() ? undefined : null);

  useEffect(() => {
    const logout = () => {
      authToken.clear();
      setUser(null);
    };
    setUnauthorizedHandler(logout);
    if (authToken.get()) api.me().then(setUser, (e) => (e.code === 'offline' ? setUser(null) : logout()));
  }, []);

  const value: AuthState = {
    user,
    async login(email, password) {
      const res = await api.login(email, password);
      authToken.set(res.token);
      setUser(res.user);
    },
    async register(email, password) {
      const res = await api.register(email, password);
      authToken.set(res.token);
      setUser(res.user);
    },
    logout() {
      authToken.clear();
      setUser(null);
    },
    async update(patch) {
      setUser(await api.updateMe(patch));
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
