import type { JoinInfo, ParticipantMeta, Role, RoomMeta, SpaceDto, SpaceKind } from '@classroom/protocol';
import { AccessToken } from 'livekit-server-sdk';
import { HttpError } from './auth';
import type { Config } from './config';
import type { Db } from './db';
import { sourcesFor } from './roomControl';

export interface SpaceRow {
  id: number;
  code: string;
  host_id: number;
  title: string;
  emoji: string;
  color: string;
  kind: SpaceKind;
  schedule: string;
  password: string;
  waiting_room: number;
  mute_on_join: number;
  guests_can_share: number;
  chat_enabled: number;
  locked: number;
  spotlight: string | null;
  recording: number;
  archived: number;
}

/** Host identities look like `h-<userId>`; they are excluded from attendance counts. */
export const HOST_PREFIX = 'h-';

/** Queries shared by the space, join and moderation routes. */
export function spaceStore(db: Db, cfg: Config) {
  const openCall = (spaceId: number) =>
    db.prepare('SELECT id, started_at FROM calls WHERE space_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1').get(spaceId) as
      | { id: number; started_at: number }
      | undefined;

  const toDto = (s: SpaceRow, viewerId: number): SpaceDto => {
    const host = db.prepare('SELECT display_name FROM users WHERE id = ?').get(s.host_id) as { display_name: string };
    const { n } = db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT COALESCE('u' || a.user_id, 'n' || a.name) FROM attendance a JOIN calls c ON c.id = a.call_id
           WHERE c.space_id = ? AND a.identity NOT LIKE '${HOST_PREFIX}%'
           UNION SELECT 'u' || user_id FROM members WHERE space_id = ?)`,
      )
      .get(s.id, s.id) as { n: number };
    const last = db.prepare('SELECT MAX(started_at) AS t FROM calls WHERE space_id = ?').get(s.id) as { t: number | null };
    const isHost = s.host_id === viewerId;
    return {
      id: s.id,
      code: s.code,
      title: s.title,
      emoji: s.emoji,
      color: s.color,
      kind: s.kind,
      schedule: s.schedule,
      hasPassword: s.password !== '',
      ...(isHost ? { password: s.password } : {}),
      isHost,
      hostName: host.display_name,
      waitingRoom: !!s.waiting_room,
      muteOnJoin: !!s.mute_on_join,
      guestsCanShare: !!s.guests_can_share,
      chatEnabled: !!s.chat_enabled,
      locked: !!s.locked,
      live: !!openCall(s.id),
      peopleCount: n,
      lastCallAt: last.t,
    };
  };

  const roomMeta = (s: SpaceRow): RoomMeta => ({
    title: s.title,
    kind: s.kind,
    waitingRoom: !!s.waiting_room,
    muteOnJoin: !!s.mute_on_join,
    guestsCanShare: !!s.guests_can_share,
    chatEnabled: !!s.chat_enabled,
    locked: !!s.locked,
    spotlight: s.spotlight,
    recording: !!s.recording,
  });

  const byId = (id: number) => db.prepare('SELECT * FROM spaces WHERE id = ? AND archived = 0').get(id) as SpaceRow | undefined;

  /** The space if `userId` hosts it; 404 otherwise so ids of other people's spaces don't leak. */
  const findHosted = (id: number, userId: number) => {
    const s = byId(id);
    if (!s || s.host_id !== userId) throw new HttpError(404, 'Space not found', 'notFound');
    return s;
  };

  const issueToken = async (s: SpaceRow, identity: string, name: string, role: Role, opts: { waiting: boolean; avatarColor?: string }): Promise<JoinInfo> => {
    const meta: ParticipantMeta = { role, waiting: opts.waiting, avatarColor: opts.avatarColor };
    const at = new AccessToken(cfg.livekitApiKey, cfg.livekitApiSecret, { identity, name, ttl: '12h', metadata: JSON.stringify(meta) });
    at.addGrant({
      room: s.code,
      roomJoin: true,
      roomAdmin: role === 'host',
      canSubscribe: !opts.waiting,
      canPublish: !opts.waiting,
      canPublishData: !opts.waiting,
      canUpdateOwnMetadata: true,
      canPublishSources: sourcesFor(role === 'host' || !!s.guests_can_share),
    });
    return {
      url: cfg.livekitUrl,
      token: await at.toJwt(),
      identity,
      role,
      roomName: s.code,
      spaceId: s.id,
      spaceTitle: s.title,
      spaceEmoji: s.emoji,
      kind: s.kind,
      waiting: opts.waiting,
    };
  };

  return { openCall, toDto, roomMeta, byId, findHosted, issueToken };
}

export type SpaceStore = ReturnType<typeof spaceStore>;
