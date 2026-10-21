import { TRACK_KINDS, type AdminAction, type ClientMessage, type PeerInfo, type PeerTracks, type RoomMeta, type ServerMessage, type SharedSpaceInfo, type TrackKind, type TrackMeta } from '@classroom/protocol';
import { PartyTracks } from 'partytracks/client';
import { BehaviorSubject, of, type Subscription } from 'rxjs';
import { KIND_OF, Participant, RemoteParticipant, SOURCE_OF, TrackPublication, type CallTrack } from './participant';
import { SpeakingMonitor } from './speaking';
import { ConnectionState, DisconnectReason, RoomEvent, Track, type DataPublishOptions, type TextStreamReader } from './types';

type Hello = Extract<ClientMessage, { t: 'hello' }>;
type Listener = (...args: any[]) => void;
type VideoEffect = (track: MediaStreamTrack) => Promise<MediaStreamTrack>;

export interface RoomConfig {
  /** The relay (apps/relay): VITE_RELAY_URL from apps/desktop/.env.development or .env.production. */
  relayUrl: string;
  code: string;
  hello: Hello;
  devices: { micId?: string; cameraId?: string; speakerId?: string };
}

/** Thrown when the relay refuses a join; `code` matches the `errors` strings. */
export class JoinError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const CAMERA_ENCODINGS: RTCRtpEncodingParameters[] = [
  { rid: 'h', maxBitrate: 1_200_000, maxFramerate: 24 },
  { rid: 'l', maxBitrate: 180_000, maxFramerate: 15, scaleResolutionDownBy: 4 },
];
const SCREEN_ENCODINGS: RTCRtpEncodingParameters[] = [{ maxBitrate: 2_500_000, maxFramerate: 15 }];
const TEXT_TOPIC = '__text';
const TEXT_CHUNK = 400_000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];
/** If a camera, mic or screen hasn't reached the media service by then, the user is told. */
const MEDIA_TIMEOUT = 20_000;
const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }];

/**
 * STUN/TURN servers, fetched with the room pass. partytracks would fetch them without our headers,
 * which the relay rejects, and that failure would stop media from connecting at all.
 */
async function fetchIceServers(prefix: string, ticket: string): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${prefix}/generate-ice-servers`, { headers: { 'X-Ticket': ticket } });
    const list = res.ok ? ((await res.json()) as { iceServers?: RTCIceServer[] | RTCIceServer }).iceServers : undefined;
    return Array.isArray(list) ? list : list ? [list] : FALLBACK_ICE;
  } catch {
    return FALLBACK_ICE;
  }
}

const wsUrl = (relay: string, code: string) => `${relay.replace(/^http/, 'ws').replace(/\/$/, '')}/room/${code}/ws`;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** One local track being sent: the source track can be swapped (device change, effects) without re-pushing. */
interface Outgoing {
  source$: BehaviorSubject<MediaStreamTrack>;
  /** The raw capture, before any effect; stopped when the track is removed. */
  raw: MediaStreamTrack;
  sub: Subscription | null;
  pub: TrackPublication;
}

/** One remote track being received. */
interface Incoming {
  meta: string;
  sub: Subscription;
  participant: Participant;
  kind: TrackKind;
  rid$?: BehaviorSubject<string | undefined>;
}

export class LocalParticipant extends Participant {
  override readonly isLocal = true;
  constructor(private room: Room) {
    super();
  }
  setMicrophoneEnabled(on: boolean) {
    return this.room._setMic(on);
  }
  setCameraEnabled(on: boolean) {
    return this.room._setCamera(on);
  }
  setScreenShareEnabled(on: boolean, opts?: { audio?: boolean } & Record<string, unknown>) {
    return this.room._setScreen(on, !!opts?.audio);
  }
  /** Replaces the microphone with any audio track (used to test the transcript with a clip). */
  publishTrack(track: MediaStreamTrack, _opts?: { source?: Track.Source; name?: string }) {
    return this.room._publishAudio(track);
  }
  async setAttributes(attrs: Record<string, string>) {
    const state: Record<string, boolean> = {};
    if ('hand' in attrs) state.hand = attrs.hand === '1';
    if ('away' in attrs) state.away = attrs.away === '1';
    this.room._sendState(state);
  }
  async publishData(payload: Uint8Array, opts: DataPublishOptions = {}) {
    this.room._send(opts.topic ?? '', { s: dec.decode(payload) }, opts.destinationIdentities);
  }
  async sendText(text: string, opts: DataPublishOptions = {}) {
    this.room._sendText(text, opts);
  }
}

/** A call: who's here, their audio/video, messages, and the room's shared settings. */
export class Room {
  state = ConnectionState.Disconnected;
  localParticipant: LocalParticipant;
  remoteParticipants = new Map<string, RemoteParticipant>();
  activeSpeakers: Participant[] = [];
  metadata = '{}';
  space: SharedSpaceInfo | null = null;

  private listeners = new Map<string, Set<Listener>>();
  private ws: WebSocket | null = null;
  private partyTracks: PartyTracks | null = null;
  private ticket: string | null = null;
  /** From the relay's welcome: lets a dropped connection come back without the waiting room. */
  private resume: string | undefined;
  private outgoing = new Map<TrackKind, Outgoing>();
  private localTracks: PeerTracks = {};
  private incoming = new Map<string, Incoming>();
  private audioEls = new Map<string, HTMLAudioElement>();
  private speaking: SpeakingMonitor;
  private textHandlers = new Map<string, (reader: TextStreamReader, from: { identity: string }) => void>();
  private textParts = new Map<string, string[]>();
  private videoEffect: VideoEffect | null = null;
  private byeReason: DisconnectReason | null = null;
  private closedByUs = false;
  private reconnectTry = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private joinWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;

  constructor(private config: RoomConfig) {
    this.localParticipant = new LocalParticipant(this);
    this.localParticipant.name = config.hello.name;
    this.speaking = new SpeakingMonitor((speakers) => {
      this.activeSpeakers = speakers;
      this.emit(RoomEvent.ActiveSpeakersChanged, speakers);
    });
  }

  // ---------- events ----------
  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return this;
  }
  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
    return this;
  }
  private emit(event: string, ...args: unknown[]) {
    for (const fn of [...(this.listeners.get(event) ?? [])]) {
      try {
        fn(...args);
      } catch (e) {
        console.error('room listener failed', event, e);
      }
    }
  }
  private setState(s: ConnectionState) {
    if (this.state === s) return;
    this.state = s;
    this.emit(RoomEvent.ConnectionStateChanged, s);
  }

  // ---------- connection ----------
  /** Connects and joins. Rejects with a JoinError if the room refuses (wrong password, locked, …). */
  connect(): Promise<void> {
    this.closedByUs = false;
    this.setState(ConnectionState.Connecting);
    return new Promise((resolve, reject) => {
      this.joinWaiter = { resolve, reject };
      this.open();
    });
  }

  private open() {
    const ws = new WebSocket(wsUrl(this.config.relayUrl, this.config.code));
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify(this.resume ? { ...this.config.hello, resume: this.resume } : this.config.hello));
      this.pingTimer ??= setInterval(() => this.raw({ t: 'ping' }), 25_000);
    };
    ws.onmessage = (e) => {
      try {
        void this.handle(JSON.parse(e.data as string) as ServerMessage);
      } catch (err) {
        console.error('bad relay message', err);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUs || this.byeReason) return this.finish(this.byeReason ?? DisconnectReason.CLIENT_INITIATED);
      if (this.joinWaiter) {
        const w = this.joinWaiter;
        this.joinWaiter = null;
        this.finish(DisconnectReason.CONNECTION_LOST, true);
        return w.reject(new JoinError('offline'));
      }
      this.reconnect();
    };
  }

  private reconnect() {
    if (this.reconnectTry >= RECONNECT_DELAYS.length) return this.finish(DisconnectReason.CONNECTION_LOST);
    this.setState(ConnectionState.Reconnecting);
    setTimeout(() => !this.closedByUs && this.open(), RECONNECT_DELAYS[this.reconnectTry++]);
  }

  disconnect() {
    this.closedByUs = true;
    if (this.ws) this.ws.close();
    else this.finish(DisconnectReason.CLIENT_INITIATED);
  }

  private finish(reason: DisconnectReason, silent = false) {
    if (this.state === ConnectionState.Disconnected && silent) return;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    for (const kind of [...this.outgoing.keys()]) this.stopOutgoing(kind);
    this.dropRemotes();
    this.speaking.close();
    this.partyTracks = null;
    this.setState(ConnectionState.Disconnected);
    if (!silent) this.emit(RoomEvent.Disconnected, reason);
  }

  private raw(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  // ---------- incoming ----------
  private async handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'welcome':
        return this.onWelcome(msg);
      case 'peer':
        // News about yourself (e.g. the admin let you share your screen) updates you; it isn't someone new.
        if (msg.peer.id === this.localParticipant.identity) return this.updateLocal(msg.peer);
        return this.upsertPeer(msg.peer);
      case 'left': {
        if (msg.id === this.localParticipant.identity) return;
        const p = this.remoteParticipants.get(msg.id);
        if (!p) return;
        this.removeRemote(p);
        return this.emit(RoomEvent.ParticipantDisconnected, p);
      }
      case 'room':
        this.metadata = JSON.stringify(msg.room);
        return this.emit(RoomEvent.RoomMetadataChanged, this.metadata);
      case 'msg':
        return this.onData(msg.from, msg.topic, msg.data);
      case 'cmd':
        if (msg.cmd === 'mute') await this._setMic(false);
        else if (msg.cmd === 'lowerHand') this._sendState({ hand: false });
        else await this._setCamera(false);
        return;
      case 'bye':
        this.byeReason = msg.reason === 'ended' ? DisconnectReason.ROOM_DELETED : msg.reason === 'removed' ? DisconnectReason.PARTICIPANT_REMOVED : DisconnectReason.DUPLICATE_IDENTITY;
        return;
      case 'error':
        if (this.joinWaiter) {
          const w = this.joinWaiter;
          this.joinWaiter = null;
          this.closedByUs = true;
          this.finish(DisconnectReason.CLIENT_INITIATED, true);
          w.reject(new JoinError(msg.code));
        }
        return;
    }
  }

  private async onWelcome(msg: Extract<ServerMessage, { t: 'welcome' }>) {
    const rejoin = this.state === ConnectionState.Reconnecting;
    if (rejoin) this.dropRemotes();
    this.reconnectTry = 0;
    const local = this.localParticipant;
    const prevMeta = local.metadata;
    local.applyInfo(msg.you);
    this.metadata = JSON.stringify(msg.room);
    this.space = msg.space;
    this.resume = msg.resume ?? this.resume;

    // A new pass (first join, admitted from the waiting room, or after reconnecting) means a fresh media session.
    if (msg.ticket && msg.ticket !== this.ticket) {
      const ticket = msg.ticket;
      this.ticket = ticket;
      const prefix = `${this.config.relayUrl.replace(/\/$/, '')}/partytracks`;
      const iceServers = await fetchIceServers(prefix, ticket);
      // (Skipped if a newer welcome took over while the servers were loading.)
      if (this.ticket === ticket) {
        this.partyTracks = new PartyTracks({ prefix, headers: new Headers({ 'X-Ticket': ticket }), iceServers });
        for (const kind of this.outgoing.keys()) this.pushOutgoing(kind);
        // People whose tracks arrived while media was still starting get pulled now.
        for (const p of this.remoteParticipants.values()) if (p.info) this.syncRemoteTracks(p, p.info);
      }
    }
    for (const peer of msg.peers) this.upsertPeer(peer, true);
    this.setState(ConnectionState.Connected);
    if (prevMeta !== local.metadata) this.emit(RoomEvent.ParticipantMetadataChanged, prevMeta, local);
    this.emit(RoomEvent.RoomMetadataChanged, this.metadata);
    this.sendState(this.localStateSnapshot());
    if (this.joinWaiter) {
      const w = this.joinWaiter;
      this.joinWaiter = null;
      w.resolve();
    }
  }

  /** The relay's new view of you: name, role, permissions (your own media state stays yours). */
  private updateLocal(info: PeerInfo) {
    const local = this.localParticipant;
    const changed = local.applyInfo({ ...info, state: { ...info.state, hand: local.attributes.hand === '1', away: local.attributes.away === '1' } });
    if (changed.metadata !== null) this.emit(RoomEvent.ParticipantMetadataChanged, changed.metadata, local);
    if (changed.permissions) this.emit(RoomEvent.ParticipantPermissionsChanged, undefined, local);
    if (changed.name) this.emit(RoomEvent.ParticipantNameChanged, local.name, local);
  }

  /** `alreadyHere`: someone who was in the room before you arrived (no "joined" news for them). */
  private upsertPeer(info: PeerInfo, alreadyHere = false) {
    let p = this.remoteParticipants.get(info.id);
    const isNew = !p;
    if (!p) {
      p = new RemoteParticipant();
      this.remoteParticipants.set(info.id, p);
    }
    const changed = p.applyInfo(info);
    if (isNew) this.emit(RoomEvent.ParticipantConnected, p, alreadyHere);
    else {
      if (changed.metadata !== null) this.emit(RoomEvent.ParticipantMetadataChanged, changed.metadata, p);
      if (Object.keys(changed.attributes).length) this.emit(RoomEvent.ParticipantAttributesChanged, changed.attributes, p);
      if (changed.permissions) this.emit(RoomEvent.ParticipantPermissionsChanged, undefined, p);
      if (changed.name) this.emit(RoomEvent.ParticipantNameChanged, p.name, p);
    }
    this.syncRemoteTracks(p, info);
  }

  /** Pulls tracks the person started, drops ones they stopped, and mirrors mute state. */
  private syncRemoteTracks(p: RemoteParticipant, info: PeerInfo) {
    for (const kind of TRACK_KINDS) {
      const source = SOURCE_OF[kind];
      const meta = info.tracks[kind];
      const key = `${p.identity}:${kind}`;
      let pub = p.getTrackPublication(source);
      if (!meta || info.waiting) {
        if (pub) this.unpublishRemote(p, pub, key);
        continue;
      }
      if (!pub) {
        pub = new TrackPublication(source, key);
        p.trackPublications.set(key, pub);
        this.emit(RoomEvent.TrackPublished, pub, p);
      }
      const metaKey = `${meta.sessionId}/${meta.trackName}`;
      if (this.incoming.get(key)?.meta !== metaKey) this.pull(p, pub, key, kind, meta, metaKey);
      const muted = kind === 'mic' ? !info.state.micOn : kind === 'camera' ? !info.state.cameraOn : false;
      if (muted !== pub.isMuted) {
        pub.isMuted = muted;
        this.emit(muted ? RoomEvent.TrackMuted : RoomEvent.TrackUnmuted, pub, p);
      }
    }
  }

  private pull(p: RemoteParticipant, pub: TrackPublication, key: string, kind: TrackKind, meta: TrackMeta, metaKey: string) {
    if (!this.partyTracks) return;
    this.stopIncoming(key);
    const rid$ = kind === 'camera' ? new BehaviorSubject<string | undefined>('h') : undefined;
    const sub = this.partyTracks
      .pull(of({ location: 'remote' as const, sessionId: meta.sessionId, trackName: meta.trackName }), rid$ ? { simulcast: { preferredRid$: rid$ } } : undefined)
      .subscribe({
        next: (mst) => {
          const track: CallTrack = { mediaStreamTrack: mst, kind: mst.kind === 'audio' ? 'audio' : 'video' };
          pub.track = track;
          if (kind === 'mic') this.speaking.add(p, mst);
          if (kind === 'mic' || kind === 'screenAudio') this.playAudio(key, mst);
          this.emit(RoomEvent.TrackSubscribed, track, pub, p);
        },
        error: (e) => console.warn('pull failed', kind, e),
      });
    this.incoming.set(key, { meta: metaKey, sub, rid$, participant: p, kind });
  }

  private unpublishRemote(p: Participant, pub: TrackPublication, key: string) {
    const track = pub.track;
    this.stopIncoming(key);
    p.trackPublications.delete(key);
    if (track) this.emit(RoomEvent.TrackUnsubscribed, track, pub, p);
    this.emit(RoomEvent.TrackUnpublished, pub, p);
  }

  private stopIncoming(key: string) {
    const inc = this.incoming.get(key);
    if (!inc) return;
    inc.sub.unsubscribe();
    this.incoming.delete(key);
    if (inc.kind === 'mic') this.speaking.remove(inc.participant);
    const el = this.audioEls.get(key);
    if (el) {
      el.srcObject = null;
      this.audioEls.delete(key);
    }
  }

  private removeRemote(p: RemoteParticipant) {
    for (const [key, pub] of [...p.trackPublications]) this.unpublishRemote(p, pub, key);
    this.remoteParticipants.delete(p.identity);
  }

  private dropRemotes() {
    for (const p of [...this.remoteParticipants.values()]) {
      this.removeRemote(p);
      this.emit(RoomEvent.ParticipantDisconnected, p);
    }
  }

  private playAudio(key: string, track: MediaStreamTrack) {
    const el = this.audioEls.get(key) ?? new Audio();
    el.autoplay = true;
    el.srcObject = new MediaStream([track]);
    if (this.config.devices.speakerId) void (el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(this.config.devices.speakerId).catch(() => undefined);
    void el.play().catch(() => undefined);
    this.audioEls.set(key, el);
  }

  /** Asks for the large or small version of someone's camera (simulcast). */
  setVideoQuality(identity: string, quality: 'high' | 'low') {
    this.incoming.get(`${identity}:camera`)?.rid$?.next(quality === 'high' ? 'h' : 'l');
  }

  // ---------- messages ----------
  private onData(fromId: string, topic: string, data: unknown) {
    const from = this.remoteParticipants.get(fromId);
    if (!from) return;
    if (topic === TEXT_TOPIC) return this.onTextPart(from, data as { id: string; topic: string; i: number; n: number; part: string });
    const s = (data as { s?: unknown })?.s;
    if (typeof s !== 'string') return;
    this.emit(RoomEvent.DataReceived, enc.encode(s), from, undefined, topic);
  }

  private onTextPart(from: Participant, d: { id: string; topic: string; i: number; n: number; part: string }) {
    if (!d || typeof d.part !== 'string' || !(d.n > 0 && d.n < 500)) return;
    const key = `${from.identity}:${d.id}`;
    const parts = this.textParts.get(key) ?? new Array<string>(d.n);
    parts[d.i] = d.part;
    this.textParts.set(key, parts);
    if (parts.filter((x) => x !== undefined).length < d.n) return;
    this.textParts.delete(key);
    const text = parts.join('');
    this.textHandlers.get(d.topic)?.({ readAll: async () => text, info: { topic: d.topic } }, { identity: from.identity });
  }

  registerTextStreamHandler(topic: string, handler: (reader: TextStreamReader, from: { identity: string }) => void) {
    this.textHandlers.set(topic, handler);
  }
  unregisterTextStreamHandler(topic: string) {
    this.textHandlers.delete(topic);
  }

  _send(topic: string, data: unknown, to?: string[]) {
    this.raw({ t: 'send', topic, data, to });
  }

  _sendText(text: string, opts: DataPublishOptions) {
    const id = crypto.randomUUID().slice(0, 8);
    const n = Math.max(1, Math.ceil(text.length / TEXT_CHUNK));
    for (let i = 0; i < n; i++) this._send(TEXT_TOPIC, { id, topic: opts.topic ?? '', i, n, part: text.slice(i * TEXT_CHUNK, (i + 1) * TEXT_CHUNK) }, opts.destinationIdentities);
  }

  /** Admin commands (mute someone, lock, end for everyone, …). The relay ignores them from guests. */
  admin(action: AdminAction) {
    this.raw({ t: 'admin', action });
  }

  // ---------- local media ----------
  private localStateSnapshot() {
    const l = this.localParticipant;
    return { micOn: l.isMicrophoneEnabled, cameraOn: l.isCameraEnabled, hand: l.attributes.hand === '1', away: l.attributes.away === '1' };
  }

  private sendState(state: Record<string, boolean>) {
    this.raw({ t: 'state', state });
  }

  _sendState(state: Record<string, boolean>) {
    const l = this.localParticipant;
    const changed: Record<string, string> = {};
    for (const k of ['hand', 'away'] as const)
      if (k in state && (l.attributes[k] === '1') !== state[k]) {
        changed[k] = state[k] ? '1' : '';
        l.attributes = { ...l.attributes, [k]: changed[k] };
      }
    if (Object.keys(changed).length) this.emit(RoomEvent.ParticipantAttributesChanged, changed, l);
    this.sendState(state);
  }

  private sendTracks() {
    this.raw({ t: 'tracks', tracks: this.localTracks });
  }

  private pushOutgoing(kind: TrackKind) {
    const out = this.outgoing.get(kind);
    if (!out || !this.partyTracks) return;
    out.sub?.unsubscribe();
    const sendEncodings$ = kind === 'camera' ? of(CAMERA_ENCODINGS) : kind === 'screen' ? of(SCREEN_ENCODINGS) : undefined;
    // partytracks retries quietly when the media service can't be reached, so time it here.
    let reached = false;
    const timer = setTimeout(() => !reached && this.outgoing.get(kind) === out && this.emit(RoomEvent.MediaFailed, kind), MEDIA_TIMEOUT);
    out.sub = this.partyTracks.push(out.source$, sendEncodings$ ? { sendEncodings$ } : undefined).subscribe({
      next: (meta) => {
        if (!meta.sessionId || !meta.trackName) return;
        reached = true;
        clearTimeout(timer);
        this.localTracks = { ...this.localTracks, [kind]: { sessionId: meta.sessionId, trackName: meta.trackName } };
        this.sendTracks();
      },
      error: (e) => {
        console.warn('push failed', kind, e);
        this.emit(RoomEvent.MediaFailed, kind);
      },
    });
  }

  private startOutgoing(kind: TrackKind, raw: MediaStreamTrack, sent: MediaStreamTrack = raw) {
    const l = this.localParticipant;
    const source = SOURCE_OF[kind];
    const pub = new TrackPublication(source, `local:${kind}`);
    pub.track = { mediaStreamTrack: sent, kind: sent.kind === 'audio' ? 'audio' : 'video' };
    l.trackPublications.set(pub.trackSid, pub);
    this.outgoing.set(kind, { source$: new BehaviorSubject(sent), raw, sub: null, pub });
    this.pushOutgoing(kind);
    if (kind === 'mic') this.speaking.add(l, raw);
    this.emit(RoomEvent.LocalTrackPublished, pub, l);
    return pub;
  }

  private stopOutgoing(kind: TrackKind) {
    const out = this.outgoing.get(kind);
    if (!out) return;
    out.sub?.unsubscribe();
    out.source$.complete();
    out.raw.stop();
    if (out.source$.value !== out.raw) out.source$.value.stop();
    this.outgoing.delete(kind);
    const { [kind]: _gone, ...rest } = this.localTracks;
    this.localTracks = rest;
    this.sendTracks();
    this.localParticipant.trackPublications.delete(out.pub.trackSid);
    if (kind === 'mic') this.speaking.remove(this.localParticipant);
    this.emit(RoomEvent.LocalTrackUnpublished, out.pub, this.localParticipant);
  }

  private setMuted(pub: TrackPublication, muted: boolean) {
    if (pub.isMuted === muted) return;
    pub.isMuted = muted;
    this.emit(muted ? RoomEvent.TrackMuted : RoomEvent.TrackUnmuted, pub, this.localParticipant);
  }

  async _setMic(on: boolean) {
    const out = this.outgoing.get('mic');
    if (out) {
      out.source$.value.enabled = on;
      this.setMuted(out.pub, !on);
    } else if (on) {
      const raw = await this.capture('audio');
      this.startOutgoing('mic', raw);
    }
    this.sendState({ micOn: on });
  }

  async _publishAudio(track: MediaStreamTrack) {
    const out = this.outgoing.get('mic');
    if (out) {
      out.source$.next(track);
      this.setMuted(out.pub, false);
    } else this.startOutgoing('mic', track);
    this.sendState({ micOn: true });
  }

  /** The camera is only captured while it's on, so its light goes off when you stop video. */
  async _setCamera(on: boolean) {
    if (!on) {
      this.stopOutgoing('camera');
      return this.sendState({ cameraOn: false });
    }
    if (this.outgoing.has('camera')) return;
    const raw = await this.capture('video');
    const sent = this.videoEffect ? await this.videoEffect(raw).catch(() => raw) : raw;
    this.startOutgoing('camera', raw, sent);
    this.sendState({ cameraOn: true });
  }

  async _setScreen(on: boolean, audio: boolean) {
    if (!on) {
      this.stopOutgoing('screen');
      this.stopOutgoing('screenAudio');
      return;
    }
    if (this.outgoing.has('screen')) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio });
    const [video] = stream.getVideoTracks();
    const [sound] = stream.getAudioTracks();
    video.contentHint = 'detail';
    video.addEventListener('ended', () => void this._setScreen(false, false));
    this.startOutgoing('screen', video);
    if (sound) this.startOutgoing('screenAudio', sound);
  }

  private async capture(kind: 'audio' | 'video') {
    const { micId, cameraId } = this.config.devices;
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === 'audio'
        ? { audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
        : { video: { deviceId: cameraId ? { exact: cameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } },
    );
    return kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
  }

  /** Background blur / virtual background: applied to the camera now and whenever it turns on. */
  async setVideoEffect(effect: VideoEffect | null) {
    this.videoEffect = effect;
    const out = this.outgoing.get('camera');
    if (!out) return;
    const sent = effect ? await effect(out.raw).catch(() => out.raw) : out.raw;
    const old = out.source$.value;
    out.source$.next(sent);
    out.pub.track = { mediaStreamTrack: sent, kind: 'video' };
    if (old !== out.raw && old !== sent) old.stop();
    this.emit(RoomEvent.LocalTrackPublished, out.pub, this.localParticipant);
  }

  /** The raw camera track (before effects), for applying a new effect. */
  get rawCameraTrack() {
    return this.outgoing.get('camera')?.raw;
  }

  async switchActiveDevice(kind: MediaDeviceKind, deviceId: string) {
    const id = deviceId === 'default' ? undefined : deviceId;
    if (kind === 'audiooutput') {
      this.config.devices.speakerId = id;
      for (const el of this.audioEls.values()) await (el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(id ?? '').catch(() => undefined);
      return;
    }
    const trackKind: TrackKind = kind === 'audioinput' ? 'mic' : 'camera';
    if (kind === 'audioinput') this.config.devices.micId = id;
    else this.config.devices.cameraId = id;
    const out = this.outgoing.get(trackKind);
    if (!out) return;
    const raw = await this.capture(trackKind === 'mic' ? 'audio' : 'video');
    const sent = trackKind === 'camera' && this.videoEffect ? await this.videoEffect(raw).catch(() => raw) : raw;
    if (trackKind === 'mic') raw.enabled = !out.pub.isMuted;
    const old = out.source$.value;
    out.source$.next(sent);
    out.raw.stop();
    if (old !== out.raw) old.stop();
    out.raw = raw;
    out.pub.track = { mediaStreamTrack: sent, kind: sent.kind === 'audio' ? 'audio' : 'video' };
    if (trackKind === 'mic') {
      this.speaking.add(this.localParticipant, raw);
    }
    this.emit(RoomEvent.LocalTrackPublished, out.pub, this.localParticipant);
  }

  static async getLocalDevices(kind: MediaDeviceKind, _requestPermissions = false) {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === kind);
  }
}

export { KIND_OF };
