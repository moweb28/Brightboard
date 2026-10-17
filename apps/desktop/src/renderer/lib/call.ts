import type { ClientMessage, JoinInfo, ModerateAction, ServerMessage, SharedSpaceInfo, Space, SpaceSettings } from '@classroom/protocol';
import { JoinError, Room } from './rtc';

/**
 * The only part of the app that talks to the internet: the Cloudflare connection service
 * (apps/relay). It carries the live call and stores nothing.
 */
export const RELAY_URL: string = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? 'http://127.0.0.1:8787';

/** A call failure with a stable `code` the UI translates (see `errors` in i18n). */
export class CallError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export interface OpenCall {
  code: string;
  name: string;
  picture: string | null;
  color: string;
  /** Present when this computer is the space's admin. */
  admin?: Space;
  password?: string;
}

type Hello = Extract<ClientMessage, { t: 'hello' }>;

/** Join details waiting for the camera check, by JoinInfo.token. */
const pending = new Map<string, Hello>();
/** The call you're in right now, so admin actions reach it. */
let active: { code: string; room: Room } | null = null;

const wsUrl = (code: string) => `${RELAY_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/room/${code}/ws`;

/** Asks the room whether it's open and the password is right, without joining. */
function check(code: string, password: string): Promise<{ space: SharedSpaceInfo }> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(code));
    } catch {
      return reject(new CallError('offline'));
    }
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      ws.close();
    };
    const timer = setTimeout(() => done(() => reject(new CallError('offline'))), 10_000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'check', password } satisfies ClientMessage));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage;
      if (msg.t === 'checked') done(() => resolve({ space: msg.space }));
      else if (msg.t === 'error') done(() => reject(new CallError(msg.code)));
    };
    ws.onerror = () => done(() => reject(new CallError('offline')));
    ws.onclose = () => done(() => reject(new CallError('offline')));
  });
}

export const callService = {
  /**
   * Prepares to enter a call. For your own space nothing goes online yet; for someone else's,
   * the room is asked whether it's open and the password is right (so mistakes show before the camera check).
   */
  async open(req: OpenCall): Promise<{ join: JoinInfo; space: SharedSpaceInfo }> {
    const token = crypto.randomUUID();
    const base = { name: req.name, color: req.color, picture: req.picture };
    let space: SharedSpaceInfo;
    let hello: Hello;
    if (req.admin) {
      const s = req.admin;
      space = { title: s.title, color: s.color, picture: s.picture, kind: s.kind, schedule: s.schedule, adminName: req.name };
      hello = {
        t: 'hello',
        ...base,
        admin: {
          key: s.adminKey,
          space,
          settings: { waitingRoom: s.waitingRoom, muteOnJoin: s.muteOnJoin, guestsCanShare: s.guestsCanShare, chatEnabled: s.chatEnabled },
          password: s.password,
        },
      };
    } else {
      space = (await check(req.code, req.password ?? '')).space;
      hello = { t: 'hello', ...base, password: req.password ?? '' };
    }
    pending.set(token, hello);
    const join: JoinInfo = {
      url: RELAY_URL,
      token,
      identity: '',
      role: req.admin ? 'host' : 'guest',
      roomName: req.code,
      spaceId: req.admin?.id ?? req.code,
      spaceTitle: space.title,
      spaceColor: space.color,
      spacePicture: space.picture,
      kind: space.kind,
      waiting: false,
    };
    return { join, space };
  },

  /** The room for a prepared join; call `connect()` on it after the camera check. */
  createRoom(join: JoinInfo, devices: { micId?: string; cameraId?: string; speakerId?: string }) {
    const hello = pending.get(join.token);
    if (!hello) throw new CallError('generic');
    pending.delete(join.token);
    const room = new Room({ relayUrl: join.url, code: join.roomName, hello, devices });
    active = { code: join.roomName, room };
    return room;
  },

  async moderate(code: string, action: ModerateAction) {
    if (active?.code !== code) throw new CallError('generic');
    active.room.admin(action);
  },
  async updateRoom(code: string, patch: Partial<SpaceSettings>) {
    if (active?.code === code) active.room.admin({ action: 'settings', patch });
  },
  async end(code: string) {
    if (active?.code === code) active.room.admin({ action: 'end' });
  },

  /** Which of these rooms have a call going on. Unreachable rooms count as not live. */
  async liveRooms(codes: string[]): Promise<Set<string>> {
    const results = await Promise.all(
      codes.map(async (code) => {
        try {
          const res = await fetch(`${RELAY_URL.replace(/\/$/, '')}/room/${code}/status`);
          return (await res.json()).live ? code : null;
        } catch {
          return null;
        }
      }),
    );
    return new Set(results.filter((c): c is string => !!c));
  },
};

export const toCallError = (e: unknown) => (e instanceof CallError ? e : e instanceof JoinError ? new CallError(e.code) : new CallError('generic'));

/** `https://…/j/ABC-123`: the page that opens the app, or offers the download. */
export const inviteLink = (code: string) => `${RELAY_URL.replace(/\/$/, '')}/j/${code.slice(0, 3)}-${code.slice(3)}`;

export const randomPassword = () => String(1000 + Math.floor(Math.random() * 9000));
