import type { BoardDesign } from '@classroom/protocol';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { safeGet, safeSet } from './storage';
import { dictionaries, type Dict, type Lang } from './i18n';

export type ThemeMode = 'light' | 'dark' | 'system';
export const SCENES = ['sunrise', 'ocean', 'forest', 'blossom', 'midnight'] as const;
export type Scene = (typeof SCENES)[number];
/** A built-in name from effects.ts (none, blur, a picture) or `custom:<id>` for your own picture. */
export type Background = string;

/** Per-device preferences, kept in local storage. */
export interface Settings {
  theme: ThemeMode;
  scene: Scene;
  lang: Lang;
  cameraId: string;
  micId: string;
  speakerId: string;
  mirror: boolean;
  background: Background;
  soundChat: boolean;
  soundJoin: boolean;
  soundHand: boolean;
  /** Admin: what to do about recording when a session starts. */
  recordPrompt: 'ask' | 'always' | 'never';
  /** Spaces where the admin chose "don't ask again". */
  noRecordAsk: string[];
  /** Whiteboard smart pen. */
  boardShapes: boolean;
  boardHandwriting: boolean;
  /** Admin: the board look used when a whiteboard opens (everyone sees it). */
  boardDesign: BoardDesign;
  /** How names show on video tiles (just for you). */
  nameTags: NameTagStyle;
  /** The main sidebar shows names next to its icons. */
  sidebarOpen: boolean;
  /** Where the other videos go when something is in focus (board, screen, speaker): just for you. */
  videoStrip: VideoStrip;
  /** Whiteboard measuring: the unit, and how many board pixels make one unit (one grid square). */
  measureUnit: MeasureUnit;
  measureScale: number;
  /** Lengths written on the shapes themselves (with or without the grid). */
  measureLabels: boolean;
  /** Transcript: who is transcribed and which speech model. */
  transcriptMode: 'me' | 'everyone';
  transcriptModel: 'standard' | 'accurate';
}

export const NAME_TAG_STYLES = ['tag', 'bar', 'big', 'minimal', 'hidden'] as const;
export type NameTagStyle = (typeof NAME_TAG_STYLES)[number];
export const VIDEO_STRIPS = ['side', 'bottom', 'hidden'] as const;
export type VideoStrip = (typeof VIDEO_STRIPS)[number];
export const MEASURE_UNITS = ['cm', 'm', 'in', 'units'] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];

const DEFAULTS: Settings = {
  theme: 'light',
  scene: 'sunrise',
  lang: 'en',
  cameraId: '',
  micId: '',
  speakerId: '',
  mirror: true,
  background: 'none',
  soundChat: true,
  soundJoin: true,
  soundHand: true,
  recordPrompt: 'ask',
  noRecordAsk: [],
  boardShapes: true,
  boardHandwriting: false,
  boardDesign: 'auto',
  nameTags: 'tag',
  videoStrip: 'side',
  sidebarOpen: false,
  measureUnit: 'cm',
  measureScale: 20,
  measureLabels: true,
  transcriptMode: 'me',
  transcriptModel: 'standard',
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
