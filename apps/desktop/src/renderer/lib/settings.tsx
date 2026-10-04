import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { safeGet, safeSet } from './api';
import { dictionaries, type Dict, type Lang } from './i18n';

export type ThemeMode = 'light' | 'dark' | 'system';
export const SCENES = ['sunrise', 'ocean', 'forest', 'blossom', 'midnight'] as const;
export type Scene = (typeof SCENES)[number];
export const BACKGROUNDS = ['none', 'blur', 'classroom', 'library', 'calm'] as const;
export type Background = (typeof BACKGROUNDS)[number];

/** Per-device preferences, kept in local storage. */
export interface Settings {
  theme: ThemeMode;
  scene: Scene;
  lang: Lang;
  cameraId: string;
  micId: string;
  speakerId: string;
  mirror: boolean;
  joinMuted: boolean;
  joinCameraOff: boolean;
  background: Background;
  soundChat: boolean;
  soundJoin: boolean;
  soundHand: boolean;
}

const DEFAULTS: Settings = {
  theme: 'light',
  scene: 'sunrise',
  lang: 'en',
  cameraId: '',
  micId: '',
  speakerId: '',
  mirror: true,
  joinMuted: false,
  joinCameraOff: false,
  background: 'none',
  soundChat: true,
  soundJoin: true,
  soundHand: true,
};

const KEY = 'settings';

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(safeGet(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsState {
  settings: Settings;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  t: Dict;
  /** The theme actually shown (system resolved). */
  resolvedTheme: 'light' | 'dark';
}

const SettingsContext = createContext<SettingsState | null>(null);

function useSystemDark() {
  const query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const fn = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener('change', fn);
    return () => query.removeEventListener('change', fn);
  }, [query]);
  return dark;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(load);
  const systemDark = useSystemDark();
  const resolvedTheme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;

  useEffect(() => {
    const html = document.documentElement;
    html.lang = settings.lang;
    html.dir = settings.lang === 'ar' ? 'rtl' : 'ltr';
    html.dataset.theme = resolvedTheme;
    html.dataset.scene = settings.scene;
    safeSet(KEY, JSON.stringify(settings));
  }, [settings, resolvedTheme]);

  const value = useMemo<SettingsState>(
    () => ({
      settings,
      set: (key, value) => setSettings((s) => ({ ...s, [key]: value })),
      t: dictionaries[settings.lang],
      resolvedTheme,
    }),
    [settings, resolvedTheme],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}

export const useT = () => useSettings().t;
