import { formatRoomCode, generateRoomCode, normalizeRoomCode, type JoinInfo, type Role } from '@classroom/protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AccessToken } from 'livekit-server-sdk';
import { randomBytes } from 'node:crypto';
import { HttpError } from './auth';
import type { Config } from './config';
import type { Db } from './db';

const MAX_NAME = 40;

export function registerRooms(app: FastifyInstance, db: Db, cfg: Config, requireTeacher: (req: FastifyRequest) => Promise<number>) {
  const findRoom = (rawCode: string) => {
    const code = normalizeRoomCode(rawCode);
    const room = code && (db.prepare('SELECT code, teacher_id FROM rooms WHERE code = ?').get(code) as { code: string; teacher_id: number } | undefined);
    if (!room) throw new HttpError(404, 'No class found with that code');
    return room;
  };

  const issue = async (room: string, identity: string, name: string, role: Role): Promise<JoinInfo> => {
    const at = new AccessToken(cfg.livekitApiKey, cfg.livekitApiSecret, { identity, name, ttl: '12h', metadata: JSON.stringify({ role }) });
    at.addGrant({ room, roomJoin: true, roomAdmin: role === 'teacher', canPublish: true, canSubscribe: true, canPublishData: true });
    return { url: cfg.livekitUrl, token: await at.toJwt(), identity, role, roomName: room };
  };

  app.post('/rooms', async (req, reply) => {
    const teacherId = await requireTeacher(req);
    const insert = db.prepare('INSERT OR IGNORE INTO rooms (code, teacher_id, created_at) VALUES (?, ?, ?)');
    let code = generateRoomCode();
    while (insert.run(code, teacherId, Date.now()).changes === 0) code = generateRoomCode();
    reply.code(201);
    return { code, display: formatRoomCode(code) };
  });

  app.post<{ Params: { code: string } }>('/rooms/:code/host', async (req) => {
    const teacherId = await requireTeacher(req);
    const room = findRoom(req.params.code);
    if (room.teacher_id !== teacherId) throw new HttpError(403, 'This is not your class');
    return issue(room.code, `t-${teacherId}`, 'Teacher', 'teacher');
  });

  app.post<{ Params: { code: string }; Body: { name?: unknown } }>('/rooms/:code/join', async (req) => {
    const room = findRoom(req.params.code);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length === 0 || name.length > MAX_NAME) throw new HttpError(400, `Name must be 1–${MAX_NAME} characters`);
    return issue(room.code, `s-${randomBytes(4).toString('hex')}`, name, 'student');
  });
}
