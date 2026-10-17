import {
  MAX_PEERS,
  MAX_PICTURE_CHARS,
  MIN_ADMIN_KEY,
  type AdminAction,
  type ClientMessage,
  type PeerInfo,
  type RoomMeta,
  type ServerMessage,
  type SharedSpaceInfo,
  type SpaceSettings,
} from '@classroom/protocol';

/** One WebSocket, as the room sees it. */
export interface Conn {
  id: string;
  ip: string;
  send(msg: ServerMessage): void;
  close(): void;
}

interface Options {
  now(): number;
  /** Signs a short-lived pass that lets this peer use the media service. */
  issueTicket(peerId: string): Promise<string>;
  /**
   * The room's owner: a SHA-256 hash of the admin key, kept by the Durable Object so that only the
   * computer that created the space can ever open it as admin. It is the only thing the relay stores.
   */
  owner: { get(): Promise<string | null>; set(hash: string): Promise<void> };
  /** Closes connections that never say hello (defaults to setTimeout). */
  schedule?(fn: () => void, ms: number): void;
}

const MAX_NAME = 40;
const MAX_TITLE = 80;
const MAX_SCHEDULE_CHARS = 4000;
const WRONG_PASSWORD_LIMIT = 10;
const WRONG_PASSWORD_WINDOW = 10 * 60_000;
/** Open sockets per room, counting ones that haven't joined yet. */
const MAX_CONNS = MAX_PEERS + 25;
/** A socket must join (or check/claim) within this time. */
const HELLO_TIMEOUT = 10_000;
/** Per person: steady messages per second, and the burst allowed on top (whiteboard drawing is chatty). */
const RATE_PER_SEC = 40;
const RATE_BURST = 200;
/** Dropping this many messages from one person means they're flooding on purpose: disconnect them. */
const FLOOD_DROPS = 2000;

const SPACE_KINDS = ['hangout', 'meeting', 'class', 'event'] as const;
const DEFAULT_COLOR = '#4f46e5';
const EMPTY_SPACE: SharedSpaceInfo = { title: '', color: DEFAULT_COLOR, picture: null, kind: 'meeting', schedule: null, adminName: '' };

/**
 * Everything a live room knows, in memory only. When the last person leaves it is all forgotten,
 * so the next admin hello opens it fresh. Only the owner hash (see Options.owner) outlives the call.
 */
export class RoomCore {
  private conns = new Map<string, Conn>();
  private rates = new Map<string, { tokens: number; at: number; dropped: number }>();
  /** Connections whose admin hello is being checked, so a second hello can't slip in meanwhile. */
  private joining = new Set<string>();
  /** Peers by connection id; only connections that said hello. */
  private peers = new Map<string, PeerInfo>();
  private adminKey: string | null = null;
  private password = '';
  private space: SharedSpaceInfo = EMPTY_SPACE;
  private meta: RoomMeta = RoomCore.freshMeta();
  private wrongTries = new Map<string, number[]>();

  constructor(private opts: Options) {}

  private static freshMeta(): RoomMeta {
    return {
      title: '',
      kind: 'meeting',
      waitingRoom: false,
      muteOnJoin: false,
      guestsCanShare: true,
      chatEnabled: true,
      locked: false,
      recording: false,
      transcribing: false,
      boardOpen: false,
      boardLocked: false,
      spotlight: null,
    };
  }

  isLive() {
    return this.adminKey !== null && this.peers.size > 0;
  }

  /** Is this person in the room right now (and admitted)? Media passes are only honored while they are. */
  hasPeer(peerId: string) {
    const entry = this.byPeerId(peerId);
    return !!entry && !entry[1].waiting;
  }

  connect(conn: Conn) {
    if (this.conns.size >= MAX_CONNS) {
      conn.send({ t: 'error', code: 'full' });
      conn.close();
      return;
    }
    this.conns.set(conn.id, conn);
    (this.opts.schedule ?? setTimeout)(() => {
      if (this.conns.has(conn.id) && !this.peers.has(conn.id)) {
        conn.close();
        this.disconnect(conn.id);
      }
    }, HELLO_TIMEOUT);
  }

  disconnect(connId: string) {
    this.conns.delete(connId);
    this.rates.delete(connId);
    const peer = this.peers.get(connId);
    if (!peer) return this.forgetIfEmpty();
    this.peers.delete(connId);
    this.toWatchers(peer, { t: 'left', id: peer.id });
    // Recording and transcripts run in the admin's app, so they stop with it.
    if (peer.role === 'host' && (this.meta.recording || this.meta.transcribing)) {
      this.meta = { ...this.meta, recording: false, transcribing: false };
      this.broadcastRoom();
    }
    this.forgetIfEmpty();
  }

  async message(connId: string, msg: ClientMessage) {
    const conn = this.conns.get(connId);
    if (!conn) return;
    if (msg.t === 'ping') return conn.send({ t: 'pong' });
    if (msg.t === 'hello') return this.hello(conn, msg);
    if (msg.t === 'check') return this.check(conn, msg.password);
    if (msg.t === 'claim') return this.claim(conn, msg.key);

    const peer = this.peers.get(connId);
    if (!peer) return;
    if (!this.allow(connId)) return;
    switch (msg.t) {
      case 'tracks':
        if (peer.waiting) return;
        peer.tracks = msg.tracks ?? {};
        return this.toWatchers(peer, { t: 'peer', peer });
      case 'state':
        peer.state = { ...peer.state, ...pickState(msg.state) };
        return this.toWatchers(peer, { t: 'peer', peer });
      case 'send': {
        if (peer.waiting || typeof msg.topic !== 'string') return;
        const to = Array.isArray(msg.to) ? new Set(msg.to) : null;
        for (const [id, p] of this.peers) {
          if (id === connId || p.waiting || (to && !to.has(p.id))) continue;
          this.conns.get(id)?.send({ t: 'msg', from: peer.id, topic: msg.topic, data: msg.data });
        }
        return;
      }
      case 'admin':
        if (peer.role !== 'host') return conn.send({ t: 'error', code: 'notAdmin' });
        return this.admin(msg.action);
    }
  }

  private async hello(conn: Conn, msg: Extract<ClientMessage, { t: 'hello' }>) {
    if (this.peers.has(conn.id) || this.joining.has(conn.id)) return;
    const name = typeof msg.name === 'string' ? msg.name.trim().slice(0, MAX_NAME) : '';
    if (!name) return this.refuse(conn, 'badName');
    const base = {
      name,
      color: cleanColor(msg.color),
      picture: cleanPicture(msg.picture),
      joinedAt: this.opts.now(),
      tracks: {},
      state: { micOn: false, cameraOn: false, hand: false, away: false },
    };

    let peer: PeerInfo;
    if (msg.admin) {
      this.joining.add(conn.id);
      const owner = await this.ownerCheck(msg.admin.key).finally(() => this.joining.delete(conn.id));
      if (!owner || !this.conns.has(conn.id)) return this.refuse(conn, 'notAdmin');
      this.adminKey = owner;
      // The admin's computer holds the space, so its latest details win.
      this.applySpace(msg.admin.space, msg.admin.password);
      if (!this.peers.size) this.meta = { ...this.meta, ...msg.admin.settings, locked: false };
      for (const [id, p] of this.peers) {
        if (p.role !== 'host') continue;
        this.peers.delete(id);
        this.conns.get(id)?.send({ t: 'bye', reason: 'replaced' });
        this.conns.get(id)?.close();
        this.conns.delete(id);
        this.toWatchers(p, { t: 'left', id: p.id });
      }
      peer = { ...base, id: `a-${crypto.randomUUID().slice(0, 8)}`, role: 'host', waiting: false, canShare: true };
    } else {
      const problem = this.guestProblem(conn.ip, msg.password) ?? (this.peers.size >= MAX_PEERS ? 'full' : null);
      if (problem) return this.refuse(conn, problem);
      peer = { ...base, id: `g-${crypto.randomUUID().slice(0, 8)}`, role: 'guest', waiting: this.meta.waitingRoom, canShare: this.meta.guestsCanShare };
    }

    this.peers.set(conn.id, peer);
    await this.welcome(conn, peer);
    this.toWatchers(peer, { t: 'peer', peer });
  }

  /**
   * The owner hash for this key if it may open the room as admin, else null. The first valid key
   * to reach a code owns it for good; the app claims each code as soon as the space is created.
   */
  private async ownerCheck(key: unknown): Promise<string | null> {
    if (typeof key !== 'string' || key.length < MIN_ADMIN_KEY || key.length > 256) return null;
    const hash = await sha256(key);
    const owner = await this.opts.owner.get();
    if (owner === null) await this.opts.owner.set(hash);
    else if (owner !== hash) return null;
    return hash;
  }

  private async claim(conn: Conn, key: unknown) {
    const ok = (await this.ownerCheck(key)) !== null;
    conn.send({ t: 'claimed', ok });
    conn.close();
    this.conns.delete(conn.id);
  }

  /** Token bucket per connection; flooders get cut off. */
  private allow(connId: string) {
    const now = this.opts.now();
    const r = this.rates.get(connId) ?? { tokens: RATE_BURST, at: now, dropped: 0 };
    r.tokens = Math.min(RATE_BURST, r.tokens + ((now - r.at) / 1000) * RATE_PER_SEC);
    r.at = now;
    this.rates.set(connId, r);
    if (r.tokens >= 1) {
      r.tokens -= 1;
      return true;
    }
    if (++r.dropped >= FLOOD_DROPS) {
      this.conns.get(connId)?.close();
      this.disconnect(connId);
    }
    return false;
  }

  private check(conn: Conn, password: unknown) {
    const problem = this.guestProblem(conn.ip, password);
    if (problem) return this.refuse(conn, problem);
    conn.send({ t: 'checked', space: this.space, needsPassword: !!this.password });
    conn.close();
    this.conns.delete(conn.id);
  }

  /** Why a guest can't come in right now, or null. Counts wrong passwords. */
  private guestProblem(ip: string, password: unknown): string | null {
    if (!this.isLive()) return 'notStarted';
    if (this.tooManyTries(ip)) return 'tooMany';
    if (this.password && password !== this.password) {
      this.wrongTries.set(ip, [...(this.wrongTries.get(ip) ?? []), this.opts.now()]);
      return 'wrongPassword';
    }
    return this.meta.locked ? 'locked' : null;
  }

  private async welcome(conn: Conn, peer: PeerInfo) {
    const others = [...this.peers.values()].filter((p) => p !== peer && this.canSee(peer, p));
    conn.send({
      t: 'welcome',
      you: peer,
      ticket: peer.waiting ? null : await this.opts.issueTicket(peer.id),
      room: this.meta,
      space: this.space,
      peers: peer.waiting ? [] : others,
    });
  }

  private async admin(action: AdminAction) {
    const target = 'identity' in action && action.identity ? this.byPeerId(action.identity) : null;
    switch (action.action) {
      case 'mute':
      case 'stopVideo':
        return target && this.conns.get(target[0])?.send({ t: 'cmd', cmd: action.action });
      case 'muteAll':
        for (const [id, p] of this.peers) if (p.role === 'guest' && !p.waiting) this.conns.get(id)?.send({ t: 'cmd', cmd: 'mute' });
        return;
      case 'remove': {
        if (!target || target[1].role === 'host') return;
        const conn = this.conns.get(target[0]);
        conn?.send({ t: 'bye', reason: 'removed' });
        conn?.close();
        return this.disconnect(target[0]);
      }
      case 'admit':
        return target && this.admit(target[0], target[1]);
      case 'admitAll':
        await Promise.all([...this.peers].filter(([, p]) => p.waiting).map(([id, p]) => this.admit(id, p)));
        return;
      case 'allowShare':
        if (!target) return;
        target[1].canShare = action.value;
        return this.toWatchers(target[1], { t: 'peer', peer: target[1] }, true);
      case 'lock':
        return this.setMeta({ locked: action.value });
      case 'chat':
        return this.setMeta({ chatEnabled: action.value });
      case 'recording':
        return this.setMeta({ recording: action.value });
      case 'transcribing':
        return this.setMeta({ transcribing: action.value });
      case 'board':
        return this.setMeta({ boardOpen: action.value });
      case 'boardLock':
        return this.setMeta({ boardLocked: action.value });
      case 'spotlight':
        return this.setMeta({ spotlight: action.identity && this.byPeerId(action.identity) ? action.identity : null });
      case 'settings':
        return this.setMeta(pickSettings(action.patch));
      case 'space':
        this.applySpace(action.space, action.password);
        return this.broadcastRoom();
      case 'end':
        for (const [id, conn] of this.conns) {
          conn.send({ t: 'bye', reason: 'ended' });
          conn.close();
          this.conns.delete(id);
        }
        this.peers.clear();
        return this.forgetIfEmpty();
    }
  }

  private async admit(connId: string, peer: PeerInfo) {
    if (!peer.waiting) return;
    peer.waiting = false;
    const conn = this.conns.get(connId);
    if (conn) await this.welcome(conn, peer);
    this.toWatchers(peer, { t: 'peer', peer });
  }

  private applySpace(space: SharedSpaceInfo, password: string) {
    this.space = cleanSpace(space);
    this.password = typeof password === 'string' ? password.slice(0, 128) : '';
    this.meta = { ...this.meta, title: this.space.title, kind: this.space.kind };
  }

  private setMeta(patch: Partial<RoomMeta>) {
    this.meta = { ...this.meta, ...patch };
    this.broadcastRoom();
  }

  private broadcastRoom() {
    for (const [id] of this.peers) this.conns.get(id)?.send({ t: 'room', room: this.meta });
  }

  /** Waiting peers see nobody; only admins see waiting peers. */
  private canSee(viewer: PeerInfo, other: PeerInfo) {
    if (viewer.waiting) return false;
    return !other.waiting || viewer.role === 'host';
  }

  /** Sends to everyone who can see `peer` (optionally including the peer). */
  private toWatchers(peer: PeerInfo, msg: ServerMessage, includeSelf = false) {
    for (const [id, p] of this.peers) {
      if ((p === peer && !includeSelf) || (p !== peer && !this.canSee(p, peer))) continue;
      this.conns.get(id)?.send(msg);
    }
  }

  private byPeerId(peerId: string): [string, PeerInfo] | null {
    for (const entry of this.peers) if (entry[1].id === peerId) return entry;
    return null;
  }

  private tooManyTries(ip: string) {
    const recent = (this.wrongTries.get(ip) ?? []).filter((t) => this.opts.now() - t < WRONG_PASSWORD_WINDOW);
    this.wrongTries.set(ip, recent);
    return recent.length >= WRONG_PASSWORD_LIMIT;
  }

  private refuse(conn: Conn, code: string) {
    conn.send({ t: 'error', code });
    conn.close();
    this.conns.delete(conn.id);
  }

  private forgetIfEmpty() {
    if (this.peers.size) return;
    this.adminKey = null;
    this.password = '';
    this.space = EMPTY_SPACE;
    this.meta = RoomCore.freshMeta();
  }
}

async function sha256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Only #rrggbb colors pass, so nothing odd ever reaches a style. */
function cleanColor(c: unknown) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : DEFAULT_COLOR;
}

/** Only small base64 WebP/PNG/JPEG pictures pass (no SVG, which can carry scripts). */
function cleanPicture(p: unknown) {
  return typeof p === 'string' && p.length <= MAX_PICTURE_CHARS && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(p) ? p : null;
}

function cleanSpace(s: unknown): SharedSpaceInfo {
  const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const kind = SPACE_KINDS.includes(o.kind as never) ? (o.kind as SharedSpaceInfo['kind']) : EMPTY_SPACE.kind;
  let schedule: SharedSpaceInfo['schedule'] = null;
  try {
    if (o.schedule && typeof o.schedule === 'object' && JSON.stringify(o.schedule).length <= MAX_SCHEDULE_CHARS) schedule = o.schedule as SharedSpaceInfo['schedule'];
  } catch {
    /* not plain data */
  }
  return { title: text(o.title, MAX_TITLE), color: cleanColor(o.color), picture: cleanPicture(o.picture), kind, schedule, adminName: text(o.adminName, MAX_NAME) };
}

function pickState(s: unknown) {
  const out: Record<string, boolean> = {};
  if (s && typeof s === 'object') for (const k of ['micOn', 'cameraOn', 'hand', 'away'] as const) if (typeof (s as Record<string, unknown>)[k] === 'boolean') out[k] = (s as Record<string, boolean>)[k];
  return out;
}

function pickSettings(s: Partial<SpaceSettings>) {
  const out: Partial<SpaceSettings> = {};
  for (const k of ['waitingRoom', 'muteOnJoin', 'guestsCanShare', 'chatEnabled', 'locked'] as const) if (typeof s?.[k] === 'boolean') out[k] = s[k];
  return out;
}
