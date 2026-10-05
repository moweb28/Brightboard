import { normalizeRoomCode } from '@classroom/protocol';
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { HttpError, type Auth } from './auth';
import type { Config } from './config';
import type { Db } from './db';
import { invitePage } from './invitePage';
import { FailureLimiter } from './rateLimit';
import type { SpaceRow, SpaceStore } from './spaceStore';

const MAX_NAME = 40;

export function registerJoin(app: FastifyInstance, db: Db, cfg: Config, auth: Auth, store: SpaceStore) {
  const wrongPasswords = new FailureLimiter(10, 10 * 60_000);

  const byCode = (raw: string) => {
    const code = normalizeRoomCode(raw);
    return code ? (db.prepare('SELECT * FROM spaces WHERE code = ? AND archived = 0').get(code) as SpaceRow | undefined) : undefined;
  };

  app.post<{ Params: { code: string }; Body: { name?: unknown; password?: unknown } }>('/join/:code', async (req) => {
    const s = byCode(req.params.code);
    if (!s) throw new HttpError(404, 'No space found with that code', 'notFound');
    const limiterKey = `${req.ip}:${s.code}`;
    if (wrongPasswords.isBlocked(limiterKey)) throw new HttpError(429, 'Too many wrong passwords', 'tooMany');

    const user = await auth.optionalUser(req);
    if (user && user.id === s.host_id) throw new HttpError(400, 'This is your space — start it from Home', 'ownSpace');

    const typedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const name = user ? user.display_name || typedName : typedName;
    if (name.length === 0 || name.length > MAX_NAME) throw new HttpError(400, `Name must be 1–${MAX_NAME} characters`, 'badName');

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const member = user && db.prepare('SELECT 1 FROM members WHERE space_id = ? AND user_id = ?').get(s.id, user.id);
    if (s.password && !member && password !== s.password) {
      wrongPasswords.fail(limiterKey);
      throw new HttpError(401, 'Wrong password', 'wrongPassword');
    }
    if (s.locked) throw new HttpError(423, 'The host has locked this space', 'locked');
    const call = store.openCall(s.id);
    if (!call) throw new HttpError(409, "This space isn't live yet", 'notStarted');

    const identity = user ? `u-${user.id}` : `g-${randomBytes(4).toString('hex')}`;
    db.prepare('INSERT OR IGNORE INTO attendance (call_id, identity, user_id, name, joined_at) VALUES (?, ?, ?, ?, ?)').run(call.id, identity, user?.id ?? null, name, Date.now());
    if (user) db.prepare('INSERT OR IGNORE INTO members (space_id, user_id, joined_at) VALUES (?, ?, ?)').run(s.id, user.id, Date.now());

    return store.issueToken(s, identity, name, 'guest', { waiting: !!s.waiting_room, avatarColor: user?.avatar_color });
  });

  app.get<{ Params: { code: string } }>('/j/:code', async (req, reply) => {
    const s = byCode(req.params.code);
    reply.type('text/html; charset=utf-8').code(s ? 200 : 404);
    return invitePage(s?.code ?? null, cfg.downloadUrl, s ? `${s.emoji} ${s.title}` : undefined);
  });
}
