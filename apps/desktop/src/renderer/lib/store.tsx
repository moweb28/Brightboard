import {
  EMPTY_LOCAL_DATA,
  generateRoomCode,
  KIND_PRESETS,
  type CallRecord,
  type LocalData,
  type Profile,
  type SharedSpaceInfo,
  type Space,
} from '@classroom/protocol';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { callService } from './call';
import { safeGet, safeSet } from './storage';

export type SpaceInput = Pick<Space, 'title' | 'color' | 'picture' | 'kind' | 'schedule' | 'password'> & Partial<Pick<Space, 'waitingRoom' | 'muteOnJoin' | 'guestsCanShare' | 'chatEnabled'>>;

interface Store {
  /** null until the saved data has been read. */
  data: LocalData | null;
  /** Codes of spaces with a call going on right now. */
  live: ReadonlySet<string>;
  setLive(code: string, live: boolean): void;
  setProfile(profile: Profile): void;
  createSpace(input: SpaceInput): Space;
  updateSpace(id: string, patch: Partial<Space>): void;
  deleteSpace(id: string): void;
  rememberJoined(code: string, info: SharedSpaceInfo, password?: string): void;
  forgetJoined(code: string): void;
  startCall(spaceId: string): string;
  endCall(callId: string): void;
  /** Marks a running call as still going (see CallRecord.lastSeenAt). */
  touchCall(callId: string): void;
  /** Replaces everything with a restored backup. */
  replaceAll(data: unknown): void;
  addAttendee(callId: string, name: string): void;
}

const StoreContext = createContext<Store | null>(null);
const FALLBACK_KEY = 'brightboardData';

const randomId = () => globalThis.crypto.randomUUID();
const randomKey = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');

async function load(): Promise<LocalData> {
  // Without the desktop bridge (a plain browser preview), keep data in localStorage instead.
  return normalize(window.brightboard ? await window.brightboard.store.load() : JSON.parse(safeGet(FALLBACK_KEY) ?? 'null'));
}

/** Saved data (or a restored backup) in today's shape. */
function normalize(raw: unknown): LocalData {
  if (!raw || typeof raw !== 'object' || (raw as LocalData).version !== 1) return EMPTY_LOCAL_DATA;
  const data = { ...EMPTY_LOCAL_DATA, ...(raw as LocalData) };
  // No call can be running while the app starts: close any that the app quit in the middle of.
  return { ...data, calls: data.calls.map((c) => (c.endedAt === null ? { ...c, endedAt: c.lastSeenAt ?? c.startedAt } : c)) };
}

function save(data: LocalData) {
  if (window.brightboard) void window.brightboard.store.save(data);
  else safeSet(FALLBACK_KEY, JSON.stringify(data));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LocalData | null>(null);
  const [live, setLiveSet] = useState<ReadonlySet<string>>(new Set());
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    load().then(setData);
  }, []);

  /** Applies a change to the latest data and saves it. */
  const change = useCallback((fn: (d: LocalData) => LocalData) => {
    const next = fn(dataRef.current ?? EMPTY_LOCAL_DATA);
    dataRef.current = next;
    setData(next);
    save(next);
  }, []);

  const store = useMemo<Store>(() => {
    const updateCall = (callId: string, fn: (c: CallRecord) => CallRecord) =>
      change((d) => ({ ...d, calls: d.calls.map((c) => (c.id === callId ? fn(c) : c)) }));
    return {
      data,
      live,
      setLive(code, isLive) {
        setLiveSet((prev) => {
          if (prev.has(code) === isLive) return prev;
          const next = new Set(prev);
          if (isLive) next.add(code);
          else next.delete(code);
          return next;
        });
      },
      setProfile: (profile) => change((d) => ({ ...d, profile })),
      createSpace(input) {
        const existing = new Set(dataRef.current?.spaces.map((s) => s.code));
        let code = generateRoomCode();
        while (existing.has(code)) code = generateRoomCode();
        const space: Space = { ...KIND_PRESETS[input.kind], ...input, id: randomId(), code, adminKey: randomKey(), createdAt: Date.now() };
        change((d) => ({ ...d, spaces: [...d.spaces, space] }));
        // Claim the code online now. In the one-in-a-billion case it's already someone else's, pick another.
        void callService.claim(code, space.adminKey).then(async (ok) => {
          if (ok !== false) return;
          const fresh = generateRoomCode();
          if ((await callService.claim(fresh, space.adminKey)) === false) return;
          change((d) => ({ ...d, spaces: d.spaces.map((s) => (s.id === space.id ? { ...s, code: fresh } : s)) }));
        });
        return space;
      },
      updateSpace: (id, patch) => change((d) => ({ ...d, spaces: d.spaces.map((s) => (s.id === id ? { ...s, ...patch, id: s.id, code: s.code, adminKey: s.adminKey } : s)) })),
      deleteSpace: (id) => change((d) => ({ ...d, spaces: d.spaces.filter((s) => s.id !== id), calls: d.calls.filter((c) => c.spaceId !== id) })),
      rememberJoined: (code, info, password) =>
        change((d) => ({ ...d, joined: [{ ...info, code, password: password || undefined, lastJoinedAt: Date.now() }, ...d.joined.filter((j) => j.code !== code)] })),
      forgetJoined: (code) => change((d) => ({ ...d, joined: d.joined.filter((j) => j.code !== code) })),
      startCall(spaceId) {
        const id = randomId();
        change((d) => ({ ...d, calls: [...d.calls, { id, spaceId, startedAt: Date.now(), endedAt: null, attendees: [] }] }));
        return id;
      },
      endCall: (callId) => updateCall(callId, (c) => ({ ...c, endedAt: c.endedAt ?? Date.now() })),
      touchCall: (callId) => updateCall(callId, (c) => ({ ...c, lastSeenAt: Date.now() })),
      replaceAll: (raw) => change(() => normalize(raw)),
      addAttendee: (callId, name) =>
        updateCall(callId, (c) => (c.attendees.some((a) => a.name === name) ? c : { ...c, attendees: [...c.attendees, { name, joinedAt: Date.now() }] })),
    };
  }, [data, live, change]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

/** The local profile; only call where one is guaranteed (after first-launch setup). */
export function useProfile(): Profile {
  return useStore().data!.profile!;
}
