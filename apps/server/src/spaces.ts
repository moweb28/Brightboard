import { generateRoomCode, KIND_EMOJI, KIND_PRESETS, SPACE_COLORS, SPACE_KINDS, type AttendanceDto, type CallDto, type HostStats, type SpaceKind } from '@classroom/protocol';
import type { FastifyInstance } from 'fastify';
import { hexColor, type Auth, type UserRow } from './auth';
import type { Db } from './db';
import type { RoomControl } from './roomControl';
import { HOST_PREFIX, type SpaceRow, type SpaceStore } from './spaceStore';

const WEEK = 7 * 24 * 60 * 60_000;

const spaceBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
    emoji: { type: 'string', minLength: 1, maxLength: 16 },
    color: hexColor,
    kind: { enum: [...SPACE_KINDS] },
    schedule: { type: 'string', maxLength: 80 },
    // Empty string = no password.
    password: { anyOf: [{ type: 'string', maxLength: 0 }, { type: 'string', minLength: 4, maxLength: 32 }] },
    waitingRoom: { type: 'boolean' },
    muteOnJoin: { type: 'boolean' },
    guestsCanShare: { type: 'boolean' },
    chatEnabled: { type: 'boolean' },
  },
};

export interface SpaceBody {
  title?: string;
  emoji?: string;
  color?: string;
  kind?: SpaceKind;
  schedule?: string;
  password?: string;
  waitingRoom?: boolean;
  muteOnJoin?: boolean;
  guestsCanShare?: boolean;
  chatEnabled?: boolean;
}

type IdParams = { Params: { id: string } };

export function registerSpaces(app: FastifyInstance, db: Db, auth: Auth, store: SpaceStore, rc: RoomControl) {
  const create = (host: UserRow, b: SpaceBody) => {
    const kind = b.kind ?? 'hangout';
    const preset = KIND_PRESETS[kind];
    const insert = db.prepare(
      `INSERT OR IGNORE INTO spaces (code, host_id, title, emoji, color, kind, schedule, password, waiting_room, mute_on_join, guests_can_share, chat_enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const args = [
      host.id,
      b.title!.trim(),
      b.emoji ?? KIND_EMOJI[kind],
      b.color ?? SPACE_COLORS[0],
      kind,
      b.schedule?.trim() ?? '',
      b.password ?? '',
      Number(b.waitingRoom ?? preset.waitingRoom),
      Number(b.muteOnJoin ?? preset.muteOnJoin),
      Number(b.guestsCanShare ?? preset.guestsCanShare),
      Number(b.chatEnabled ?? preset.chatEnabled),
      Date.now(),
    ] as const;
    let result = insert.run(generateRoomCode(), ...args);
    while (result.changes === 0) result = insert.run(generateRoomCode(), ...args);
    return store.byId(Number(result.lastInsertRowid))!;
  };

  const start = async (host: UserRow, s: SpaceRow) => {
    if (!store.openCall(s.id)) {
      // A fresh call starts unlocked with no spotlight.
      db.prepare('UPDATE spaces SET locked = 0, spotlight = NULL, board_open = 0, board_locked = 0 WHERE id = ?').run(s.id);
      db.prepare('INSERT INTO calls (space_id, started_at) VALUES (?, ?)').run(s.id, Date.now());
    }
    // Only the admin's app records, and it is (re)joining right now, so nothing is being recorded yet.
    db.prepare('UPDATE spaces SET recording = 0, transcribing = 0 WHERE id = ?').run(s.id);
    const fresh = store.byId(s.id)!;
    await rc.ensureRoom(fresh.code, JSON.stringify(store.roomMeta(fresh)));
    return store.issueToken(fresh, `${HOST_PREFIX}${host.id}`, host.display_name || 'Host', 'host', { waiting: false, avatarColor: host.avatar_color });
  };

  /** Spaces I host plus spaces I've joined as a member. */
  app.get('/spaces', async (req) => {
    const user = await auth.requireUser(req);
    const rows = db
      .prepare(
        `SELECT s.* FROM spaces s WHERE s.archived = 0 AND (s.host_id = ? OR s.id IN (SELECT space_id FROM members WHERE user_id = ?))
         ORDER BY s.created_at DESC`,
      )
      .all(user.id, user.id) as unknown as SpaceRow[];
    return rows.map((s) => store.toDto(s, user.id));
  });

  app.post<{ Body: SpaceBody }>('/spaces', { schema: { body: { ...spaceBody, required: ['title'] } } }, async (req, reply) => {
    const user = await auth.requireUser(req);
    reply.code(201);
    return store.toDto(create(user, req.body), user.id);
  });

  /** One click: a fresh hangout, already started. */
  app.post('/spaces/instant', async (req) => {
    const user = await auth.requireUser(req);
    const s = create(user, { title: `${user.display_name || 'My'}'s space`.slice(0, 80), kind: 'hangout', color: user.avatar_color });
    return start(user, s);
  });

  app.get<IdParams>('/spaces/:id', async (req) => {
    const user = await auth.requireUser(req);
    return store.toDto(store.findHosted(Number(req.params.id), user.id), user.id);
  });

  app.patch<IdParams & { Body: SpaceBody }>('/spaces/:id', { schema: { body: spaceBody } }, async (req) => {
    const user = await auth.requireUser(req);
    const s = store.findHosted(Number(req.params.id), user.id);
    const b = req.body;
    const flag = (v: boolean | undefined, current: number) => (v === undefined ? current : Number(v));
    db.prepare(
      `UPDATE spaces SET title = ?, emoji = ?, color = ?, kind = ?, schedule = ?, password = ?, waiting_room = ?, mute_on_join = ?, guests_can_share = ?, chat_enabled = ? WHERE id = ?`,
    ).run(
      b.title?.trim() ?? s.title,
      b.emoji ?? s.emoji,
      b.color ?? s.color,
      b.kind ?? s.kind,
      b.schedule?.trim() ?? s.schedule,
      b.password ?? s.password,
      flag(b.waitingRoom, s.waiting_room),
      flag(b.muteOnJoin, s.mute_on_join),
      flag(b.guestsCanShare, s.guests_can_share),
      flag(b.chatEnabled, s.chat_enabled),
      s.id,
    );
    const updated = store.byId(s.id)!;
    if (store.openCall(s.id)) await rc.setRoomMetadata(s.code, JSON.stringify(store.roomMeta(updated)));
    return store.toDto(updated, user.id);
  });

  app.delete<IdParams>('/spaces/:id', async (req, reply) => {
    const user = await auth.requireUser(req);
    const s = store.findHosted(Number(req.params.id), user.id);
    await endCall(s);
    db.prepare('UPDATE spaces SET archived = 1 WHERE id = ?').run(s.id);
    reply.code(204);
  });

  app.get<IdParams>('/spaces/:id/calls', async (req): Promise<CallDto[]> => {
    const user = await auth.requireUser(req);
    const s = store.findHosted(Number(req.params.id), user.id);
    const rows = db
      .prepare(
        `SELECT c.id, c.started_at, c.ended_at, (SELECT COUNT(*) FROM attendance a WHERE a.call_id = c.id AND a.identity NOT LIKE '${HOST_PREFIX}%') AS n
         FROM calls c WHERE c.space_id = ? ORDER BY c.started_at DESC LIMIT 50`,
      )
      .all(s.id) as { id: number; started_at: number; ended_at: number | null; n: number }[];
    return rows.map((r) => ({ id: r.id, startedAt: r.started_at, endedAt: r.ended_at, attendeeCount: r.n }));
  });

  app.get<{ Params: { id: string; cid: string } }>('/spaces/:id/calls/:cid/attendance', async (req): Promise<AttendanceDto[]> => {
    const user = await auth.requireUser(req);
    const s = store.findHosted(Number(req.params.id), user.id);
    const rows = db
      .prepare(
        `SELECT a.name, a.user_id, a.joined_at FROM attendance a JOIN calls c ON c.id = a.call_id
         WHERE c.id = ? AND c.space_id = ? AND a.identity NOT LIKE '${HOST_PREFIX}%' ORDER BY a.joined_at`,
      )
      .all(Number(req.params.cid), s.id) as { name: string; user_id: number | null; joined_at: number }[];
    return rows.map((r) => ({ name: r.name, userId: r.user_id, joinedAt: r.joined_at }));
  });

  app.post<IdParams>('/spaces/:id/start', async (req) => {
    const user = await auth.requireUser(req);
    return start(user, store.findHosted(Number(req.params.id), user.id));
  });

  async function endCall(s: SpaceRow) {
    const open = store.openCall(s.id);
    if (!open) return;
    db.prepare('UPDATE calls SET ended_at = ? WHERE id = ?').run(Date.now(), open.id);
    await rc.deleteRoom(s.code);
  }

  app.post<IdParams>('/spaces/:id/end', async (req, reply) => {
    const user = await auth.requireUser(req);
    await endCall(store.findHosted(Number(req.params.id), user.id));
    reply.code(204);
  });

  app.get('/stats', async (req): Promise<HostStats> => {
    const user = await auth.requireUser(req);
    const now = Date.now();
    const one = <T>(sql: string, ...args: (number | string)[]) => db.prepare(sql).get(...args) as T;
    const { spaces } = one<{ spaces: number }>('SELECT COUNT(*) AS spaces FROM spaces WHERE host_id = ? AND archived = 0', user.id);
    const { people } = one<{ people: number }>(
      `SELECT COUNT(DISTINCT COALESCE('u' || a.user_id, 'n' || a.name)) AS people
       FROM attendance a JOIN calls c ON c.id = a.call_id JOIN spaces s ON s.id = c.space_id
       WHERE s.host_id = ? AND a.identity NOT LIKE '${HOST_PREFIX}%'`,
      user.id,
    );
    const { week } = one<{ week: number }>('SELECT COUNT(*) AS week FROM calls c JOIN spaces s ON s.id = c.space_id WHERE s.host_id = ? AND c.started_at > ?', user.id, now - WEEK);
    const { ms } = one<{ ms: number | null }>('SELECT SUM(COALESCE(c.ended_at, ?) - c.started_at) AS ms FROM calls c JOIN spaces s ON s.id = c.space_id WHERE s.host_id = ?', now, user.id);
    return { spaces, people, callsThisWeek: week, minutesTogether: Math.round((ms ?? 0) / 60_000) };
  });
}
