import type { ClassDto, JoinInfo, ParticipantMeta, Role, RoomMeta } from '@classroom/protocol';
import { AccessToken } from 'livekit-server-sdk';
import { HttpError } from './auth';
import type { Config } from './config';
import type { Db } from './db';
import { sourcesFor } from './roomControl';

export interface ClassRow {
  id: number;
  code: string;
  teacher_id: number;
  title: string;
  subject: string;
  color: string;
  schedule: string;
  join_password: string;
  waiting_room: number;
  mute_on_join: number;
  students_can_share: number;
  chat_enabled: number;
  locked: number;
  spotlight: string | null;
  archived: number;
}

/** Queries shared by the class, join and moderation routes. */
export function classStore(db: Db, cfg: Config) {
  const openSession = (classId: number) =>
    db.prepare('SELECT id, started_at FROM sessions WHERE class_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1').get(classId) as
      | { id: number; started_at: number }
      | undefined;

  const toDto = (c: ClassRow, forOwner: boolean): ClassDto => {
    const teacher = db.prepare('SELECT display_name FROM users WHERE id = ?').get(c.teacher_id) as { display_name: string };
    const { n } = db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT COALESCE('u' || a.user_id, 'n' || a.name) FROM attendance a JOIN sessions s ON s.id = a.session_id
           WHERE s.class_id = ? AND a.identity NOT LIKE 't-%'
           UNION SELECT 'u' || user_id FROM enrollments WHERE class_id = ?)`,
      )
      .get(c.id, c.id) as { n: number };
    const last = db.prepare('SELECT MAX(started_at) AS t FROM sessions WHERE class_id = ?').get(c.id) as { t: number | null };
    return {
      id: c.id,
      code: c.code,
      title: c.title,
      subject: c.subject,
      color: c.color,
      schedule: c.schedule,
      ...(forOwner ? { joinPassword: c.join_password } : {}),
      teacherName: teacher.display_name,
      waitingRoom: !!c.waiting_room,
      muteOnJoin: !!c.mute_on_join,
      studentsCanShare: !!c.students_can_share,
      chatEnabled: !!c.chat_enabled,
      locked: !!c.locked,
      live: !!openSession(c.id),
      studentCount: n,
      lastSessionAt: last.t,
    };
  };

  const roomMeta = (c: ClassRow): RoomMeta => ({
    title: c.title,
    waitingRoom: !!c.waiting_room,
    muteOnJoin: !!c.mute_on_join,
    studentsCanShare: !!c.students_can_share,
    chatEnabled: !!c.chat_enabled,
    locked: !!c.locked,
    spotlight: c.spotlight,
  });

  const byId = (id: number) => db.prepare('SELECT * FROM classes WHERE id = ? AND archived = 0').get(id) as ClassRow | undefined;

  /** The class if `teacherId` owns it; 404 otherwise so ids of other teachers' classes don't leak. */
  const findOwned = (id: number, teacherId: number) => {
    const c = byId(id);
    if (!c || c.teacher_id !== teacherId) throw new HttpError(404, 'Class not found', 'notFound');
    return c;
  };

  const issueToken = async (
    c: ClassRow,
    identity: string,
    name: string,
    role: Role,
    opts: { waiting: boolean; avatarColor?: string },
  ): Promise<JoinInfo> => {
    const meta: ParticipantMeta = { role, waiting: opts.waiting, avatarColor: opts.avatarColor };
    const at = new AccessToken(cfg.livekitApiKey, cfg.livekitApiSecret, { identity, name, ttl: '12h', metadata: JSON.stringify(meta) });
    const canShare = role === 'teacher' || !!c.students_can_share;
    at.addGrant({
      room: c.code,
      roomJoin: true,
      roomAdmin: role === 'teacher',
      canSubscribe: !opts.waiting,
      canPublish: !opts.waiting,
      canPublishData: !opts.waiting,
      canUpdateOwnMetadata: true,
      canPublishSources: sourcesFor(canShare),
    });
    return {
      url: cfg.livekitUrl,
      token: await at.toJwt(),
      identity,
      role,
      roomName: c.code,
      classId: c.id,
      classTitle: c.title,
      waiting: opts.waiting,
    };
  };

  return { openSession, toDto, roomMeta, byId, findOwned, issueToken };
}

export type ClassStore = ReturnType<typeof classStore>;
