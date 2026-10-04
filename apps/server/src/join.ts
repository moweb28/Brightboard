import { normalizeRoomCode } from '@classroom/protocol';
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { HttpError, type Auth } from './auth';
import type { ClassRow, ClassStore } from './classStore';
import type { Config } from './config';
import type { Db } from './db';
import { invitePage } from './invitePage';
import { FailureLimiter } from './rateLimit';

const MAX_NAME = 40;

export function registerJoin(app: FastifyInstance, db: Db, cfg: Config, auth: Auth, store: ClassStore) {
  const wrongPasswords = new FailureLimiter(10, 10 * 60_000);

  const byCode = (raw: string) => {
    const code = normalizeRoomCode(raw);
    return code ? (db.prepare('SELECT * FROM classes WHERE code = ? AND archived = 0').get(code) as ClassRow | undefined) : undefined;
  };

  app.post<{ Params: { code: string }; Body: { name?: unknown; password?: unknown } }>('/join/:code', async (req) => {
    const c = byCode(req.params.code);
    if (!c) throw new HttpError(404, 'No class found with that code', 'notFound');
    const limiterKey = `${req.ip}:${c.code}`;
    if (wrongPasswords.isBlocked(limiterKey)) throw new HttpError(429, 'Too many wrong passwords', 'tooMany');

    const user = await auth.optionalUser(req);
    if (user?.role === 'teacher' && user.id === c.teacher_id) throw new HttpError(400, 'Start your class from the dashboard', 'ownClass');

    const typedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const name = user ? user.display_name || typedName : typedName;
    if (name.length === 0 || name.length > MAX_NAME) throw new HttpError(400, `Name must be 1–${MAX_NAME} characters`, 'badName');

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password !== c.join_password) {
      wrongPasswords.fail(limiterKey);
      throw new HttpError(401, 'Wrong class password', 'wrongPassword');
    }
    if (c.locked) throw new HttpError(423, 'The teacher has locked this class', 'locked');
    const session = store.openSession(c.id);
    if (!session) throw new HttpError(409, "This class hasn't started yet", 'notStarted');

    const identity = user ? `u-${user.id}` : `g-${randomBytes(4).toString('hex')}`;
    db.prepare('INSERT OR IGNORE INTO attendance (session_id, identity, user_id, name, joined_at) VALUES (?, ?, ?, ?, ?)').run(
      session.id,
      identity,
      user?.id ?? null,
      name,
      Date.now(),
    );
    if (user?.role === 'student') db.prepare('INSERT OR IGNORE INTO enrollments (class_id, user_id, joined_at) VALUES (?, ?, ?)').run(c.id, user.id, Date.now());

    return store.issueToken(c, identity, name, 'student', { waiting: !!c.waiting_room, avatarColor: user?.avatar_color });
  });

  app.get<{ Params: { code: string } }>('/j/:code', async (req, reply) => {
    const c = byCode(req.params.code);
    reply.type('text/html; charset=utf-8').code(c ? 200 : 404);
    return invitePage(c?.code ?? null, cfg.downloadUrl, c?.title);
  });
}
