import { formatRoomCode, generateRoomCode, normalizeRoomCode, type JoinInfo, type Role } from '@classroom/protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AccessToken } from 'livekit-server-sdk';
import { randomBytes } from 'node:crypto';
import { HttpError } from './auth';
import type { Config } from './config';
import type { Db } from './db';
import { invitePage } from './invitePage';
import { hashPassword, verifyPassword } from './password';
import { FailureLimiter } from './rateLimit';

const MAX_NAME = 40;

interface RoomRow {
  code: string;
  teacher_id: number;
  password_hash: string;
}

export function registerRooms(app: FastifyInstance, db: Db, cfg: Config, requireTeacher: (req: FastifyRequest) => Promise<number>) {
  const wrongPasswords = new FailureLimiter(10, 10 * 60_000);

  const lookup = (rawCode: string) => {
    const code = normalizeRoomCode(rawCode);
    return code ? (db.prepare('SELECT code, teacher_id, password_hash FROM rooms WHERE code = ?').get(code) as RoomRow | undefined) : undefined;
  };
  const findRoom = (rawCode: string) => {
    const room = lookup(rawCode);
    if (!room) throw new HttpError(404, 'No class found with that code');
    return room;
  };

  const issue = async (room: string, identity: string, name: string, role: Role): Promise<JoinInfo> => {
    const at = new AccessToken(cfg.livekitApiKey, cfg.livekitApiSecret, { identity, name, ttl: '12h', metadata: JSON.stringify({ role }) });
    at.addGrant({ room, roomJoin: true, roomAdmin: role === 'teacher', canPublish: true, canSubscribe: true, canPublishData: true });
    return { url: cfg.livekitUrl, token: await at.toJwt(), identity, role, roomName: room };
  };

  app.post<{ Body: { password: string } }>(
    '/rooms',
    { schema: { body: { type: 'object', required: ['password'], properties: { password: { type: 'string', minLength: 4, maxLength: 32 } } } } },
    async (req, reply) => {
      const teacherId = await requireTeacher(req);
      const passwordHash = await hashPassword(req.body.password);
      const insert = db.prepare('INSERT OR IGNORE INTO rooms (code, teacher_id, password_hash, created_at) VALUES (?, ?, ?, ?)');
      let code = generateRoomCode();
      while (insert.run(code, teacherId, passwordHash, Date.now()).changes === 0) code = generateRoomCode();
      reply.code(201);
      return { code, display: formatRoomCode(code) };
    },
  );

  app.post<{ Params: { code: string } }>('/rooms/:code/host', async (req) => {
    const teacherId = await requireTeacher(req);
    const room = findRoom(req.params.code);
    if (room.teacher_id !== teacherId) throw new HttpError(403, 'This is not your class');
    return issue(room.code, `t-${teacherId}`, 'Teacher', 'teacher');
  });

  app.post<{ Params: { code: string }; Body: { name?: unknown; password?: unknown } }>('/rooms/:code/join', async (req) => {
    const room = findRoom(req.params.code);
    const limiterKey = `${req.ip}:${room.code}`;
    if (wrongPasswords.isBlocked(limiterKey)) throw new HttpError(429, 'Too many wrong passwords. Try again in 10 minutes.');
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length === 0 || name.length > MAX_NAME) throw new HttpError(400, `Name must be 1–${MAX_NAME} characters`);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!room.password_hash || !(await verifyPassword(password, room.password_hash))) {
      wrongPasswords.fail(limiterKey);
      throw new HttpError(401, 'Wrong class password');
    }
    return issue(room.code, `s-${randomBytes(4).toString('hex')}`, name, 'student');
  });

  app.get<{ Params: { code: string } }>('/j/:code', async (req, reply) => {
    const room = lookup(req.params.code);
    reply.type('text/html; charset=utf-8').code(room ? 200 : 404);
    return invitePage(room?.code ?? null, cfg.downloadUrl);
  });
}
