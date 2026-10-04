import { CLASS_COLORS, generateRoomCode, type AttendanceDto, type SessionDto, type TeacherStats } from '@classroom/protocol';
import type { FastifyInstance } from 'fastify';
import { hexColor, type Auth } from './auth';
import type { ClassStore } from './classStore';
import type { Db } from './db';
import type { RoomControl } from './roomControl';

const randomPassword = () => String(1000 + Math.floor(Math.random() * 9000));
const WEEK = 7 * 24 * 60 * 60_000;

const classBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
    subject: { type: 'string', maxLength: 60 },
    color: hexColor,
    schedule: { type: 'string', maxLength: 80 },
    password: { type: 'string', minLength: 4, maxLength: 32 },
    waitingRoom: { type: 'boolean' },
    muteOnJoin: { type: 'boolean' },
    studentsCanShare: { type: 'boolean' },
    chatEnabled: { type: 'boolean' },
  },
};

interface ClassBody {
  title?: string;
  subject?: string;
  color?: string;
  schedule?: string;
  password?: string;
  waitingRoom?: boolean;
  muteOnJoin?: boolean;
  studentsCanShare?: boolean;
  chatEnabled?: boolean;
}

type IdParams = { Params: { id: string } };

export function registerClasses(app: FastifyInstance, db: Db, auth: Auth, store: ClassStore, rc: RoomControl) {
  app.get('/classes', async (req) => {
    const user = await auth.requireUser(req);
    if (user.role === 'teacher') {
      const rows = db.prepare('SELECT * FROM classes WHERE teacher_id = ? AND archived = 0 ORDER BY created_at DESC').all(user.id);
      return rows.map((c) => store.toDto(c as never, true));
    }
    const rows = db
      .prepare('SELECT c.* FROM classes c JOIN enrollments e ON e.class_id = c.id WHERE e.user_id = ? AND c.archived = 0 ORDER BY e.joined_at DESC')
      .all(user.id);
    return rows.map((c) => store.toDto(c as never, false));
  });

  app.post<{ Body: ClassBody }>('/classes', { schema: { body: { ...classBody, required: ['title'] } } }, async (req, reply) => {
    const teacher = await auth.requireTeacher(req);
    const b = req.body;
    const insert = db.prepare(
      `INSERT OR IGNORE INTO classes (code, teacher_id, title, subject, color, schedule, join_password, waiting_room, mute_on_join, students_can_share, chat_enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const args = [
      teacher.id,
      b.title!.trim(),
      b.subject?.trim() ?? '',
      b.color ?? CLASS_COLORS[0],
      b.schedule?.trim() ?? '',
      b.password ?? randomPassword(),
      Number(b.waitingRoom ?? false),
      Number(b.muteOnJoin ?? false),
      Number(b.studentsCanShare ?? false),
      Number(b.chatEnabled ?? true),
      Date.now(),
    ] as const;
    let result = insert.run(generateRoomCode(), ...args);
    while (result.changes === 0) result = insert.run(generateRoomCode(), ...args);
    reply.code(201);
    return store.toDto(store.byId(Number(result.lastInsertRowid))!, true);
  });

  app.get<IdParams>('/classes/:id', async (req) => {
    const user = await auth.requireUser(req);
    return store.toDto(store.findOwned(Number(req.params.id), user.id), true);
  });

  app.patch<IdParams & { Body: ClassBody }>('/classes/:id', { schema: { body: classBody } }, async (req) => {
    const teacher = await auth.requireUser(req);
    const c = store.findOwned(Number(req.params.id), teacher.id);
    const b = req.body;
    db.prepare(
      `UPDATE classes SET title = ?, subject = ?, color = ?, schedule = ?, join_password = ?, waiting_room = ?, mute_on_join = ?, students_can_share = ?, chat_enabled = ? WHERE id = ?`,
    ).run(
      b.title?.trim() ?? c.title,
      b.subject?.trim() ?? c.subject,
      b.color ?? c.color,
      b.schedule?.trim() ?? c.schedule,
      b.password ?? c.join_password,
      b.waitingRoom === undefined ? c.waiting_room : Number(b.waitingRoom),
      b.muteOnJoin === undefined ? c.mute_on_join : Number(b.muteOnJoin),
      b.studentsCanShare === undefined ? c.students_can_share : Number(b.studentsCanShare),
      b.chatEnabled === undefined ? c.chat_enabled : Number(b.chatEnabled),
      c.id,
    );
    const updated = store.byId(c.id)!;
    if (store.openSession(c.id)) await rc.setRoomMetadata(c.code, JSON.stringify(store.roomMeta(updated)));
    return store.toDto(updated, true);
  });

  app.delete<IdParams>('/classes/:id', async (req, reply) => {
    const teacher = await auth.requireUser(req);
    const c = store.findOwned(Number(req.params.id), teacher.id);
    await endSession(c.id, c.code);
    db.prepare('UPDATE classes SET archived = 1 WHERE id = ?').run(c.id);
    reply.code(204);
  });

  app.get<IdParams>('/classes/:id/sessions', async (req): Promise<SessionDto[]> => {
    const teacher = await auth.requireUser(req);
    const c = store.findOwned(Number(req.params.id), teacher.id);
    const rows = db
      .prepare(
        `SELECT s.id, s.started_at, s.ended_at, (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.identity NOT LIKE 't-%') AS n
         FROM sessions s WHERE s.class_id = ? ORDER BY s.started_at DESC LIMIT 50`,
      )
      .all(c.id) as { id: number; started_at: number; ended_at: number | null; n: number }[];
    return rows.map((r) => ({ id: r.id, startedAt: r.started_at, endedAt: r.ended_at, attendeeCount: r.n }));
  });

  app.get<{ Params: { id: string; sid: string } }>('/classes/:id/sessions/:sid/attendance', async (req): Promise<AttendanceDto[]> => {
    const teacher = await auth.requireUser(req);
    const c = store.findOwned(Number(req.params.id), teacher.id);
    const rows = db
      .prepare(
        `SELECT a.name, a.user_id, a.joined_at FROM attendance a JOIN sessions s ON s.id = a.session_id
         WHERE s.id = ? AND s.class_id = ? AND a.identity NOT LIKE 't-%' ORDER BY a.joined_at`,
      )
      .all(Number(req.params.sid), c.id) as { name: string; user_id: number | null; joined_at: number }[];
    return rows.map((r) => ({ name: r.name, userId: r.user_id, joinedAt: r.joined_at }));
  });

  app.post<IdParams>('/classes/:id/start', async (req) => {
    const teacher = await auth.requireUser(req);
    const c = store.findOwned(Number(req.params.id), teacher.id);
    if (!store.openSession(c.id)) {
      // A fresh session starts unlocked with no spotlight.
      db.prepare('UPDATE classes SET locked = 0, spotlight = NULL WHERE id = ?').run(c.id);
      db.prepare('INSERT INTO sessions (class_id, started_at) VALUES (?, ?)').run(c.id, Date.now());
    }
    const fresh = store.byId(c.id)!;
    await rc.ensureRoom(c.code, JSON.stringify(store.roomMeta(fresh)));
    return store.issueToken(fresh, `t-${teacher.id}`, teacher.display_name || 'Teacher', 'teacher', { waiting: false, avatarColor: teacher.avatar_color });
  });

  async function endSession(classId: number, code: string) {
    const open = store.openSession(classId);
    if (!open) return;
    db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(Date.now(), open.id);
    await rc.deleteRoom(code);
  }

  app.post<IdParams>('/classes/:id/end', async (req, reply) => {
    const teacher = await auth.requireUser(req);
    const c = store.findOwned(Number(req.params.id), teacher.id);
    await endSession(c.id, c.code);
    reply.code(204);
  });

  app.get('/stats', async (req): Promise<TeacherStats> => {
    const teacher = await auth.requireTeacher(req);
    const now = Date.now();
    const one = <T>(sql: string, ...args: (number | string)[]) => db.prepare(sql).get(...args) as T;
    const { classes } = one<{ classes: number }>('SELECT COUNT(*) AS classes FROM classes WHERE teacher_id = ? AND archived = 0', teacher.id);
    const { students } = one<{ students: number }>(
      `SELECT COUNT(DISTINCT COALESCE('u' || a.user_id, 'n' || a.name)) AS students
       FROM attendance a JOIN sessions s ON s.id = a.session_id JOIN classes c ON c.id = s.class_id
       WHERE c.teacher_id = ? AND a.identity NOT LIKE 't-%'`,
      teacher.id,
    );
    const { week } = one<{ week: number }>(
      'SELECT COUNT(*) AS week FROM sessions s JOIN classes c ON c.id = s.class_id WHERE c.teacher_id = ? AND s.started_at > ?',
      teacher.id,
      now - WEEK,
    );
    const { ms } = one<{ ms: number | null }>(
      'SELECT SUM(COALESCE(s.ended_at, ?) - s.started_at) AS ms FROM sessions s JOIN classes c ON c.id = s.class_id WHERE c.teacher_id = ?',
      now,
      teacher.id,
    );
    return { classes, students, sessionsThisWeek: week, minutesTaught: Math.round((ms ?? 0) / 60_000) };
  });
}
