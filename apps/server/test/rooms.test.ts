import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { makeApp, registerTeacher } from './helpers';
import { hashPassword } from '../src/password';

async function setup() {
  const app = makeApp();
  const token = await registerTeacher(app);
  const res = await app.inject({ method: 'POST', url: '/rooms', headers: { authorization: `Bearer ${token}` } });
  return { app, token, room: res.json() as { code: string; display: string }, status: res.statusCode };
}

const join = (app: Awaited<ReturnType<typeof setup>>['app'], code: string, name: unknown) =>
  app.inject({ method: 'POST', url: `/rooms/${code}/join`, payload: { name } });

describe('rooms', () => {
  it('requires login to create a room', async () => {
    const res = await makeApp().inject({ method: 'POST', url: '/rooms' });
    expect(res.statusCode).toBe(401);
  });

  it('creates a room with a display code', async () => {
    const { room, status } = await setup();
    expect(status).toBe(201);
    expect(room.display).toBe(`${room.code.slice(0, 3)}-${room.code.slice(3)}`);
  });

  it('lets a student join with a lowercase dashed code, without admin rights', async () => {
    const { app, room } = await setup();
    const res = await join(app, room.display.toLowerCase(), '  Sara  ');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.role).toBe('student');
    expect(body.roomName).toBe(room.code);
    const claims = decodeJwt(body.token) as { name?: string; video: Record<string, unknown> };
    expect(claims.name).toBe('Sara');
    expect(claims.video.roomJoin).toBe(true);
    expect(claims.video.room).toBe(room.code);
    expect(claims.video.roomAdmin).toBeFalsy();
  });

  it('gives students with the same name different identities', async () => {
    const { app, room } = await setup();
    const a = (await join(app, room.code, 'Ali')).json();
    const b = (await join(app, room.code, 'Ali')).json();
    expect(a.identity).not.toBe(b.identity);
  });

  it('rejects blank or too-long names', async () => {
    const { app, room } = await setup();
    expect((await join(app, room.code, '   ')).statusCode).toBe(400);
    expect((await join(app, room.code, 'x'.repeat(41))).statusCode).toBe(400);
  });

  it('returns 404 for unknown codes', async () => {
    const { app } = await setup();
    expect((await join(app, 'AAAAAA', 'Ali')).statusCode).toBe(404);
    expect((await join(app, 'bad', 'Ali')).statusCode).toBe(404);
  });

  it('gives the owning teacher an admin token', async () => {
    const { app, token, room } = await setup();
    const res = await app.inject({ method: 'POST', url: `/rooms/${room.code}/host`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const claims = decodeJwt(res.json().token) as { video: Record<string, unknown> };
    expect(claims.video.roomAdmin).toBe(true);
    expect(res.json().role).toBe('teacher');
  });

  it("refuses to host another teacher's room", async () => {
    const { app, room } = await setup();
    // Registration is closed after the first teacher, so add a second one directly.
    const db = (app as unknown as { classroomDb: import('../src/db').Db }).classroomDb;
    db.prepare('INSERT INTO teachers (email, password_hash) VALUES (?, ?)').run('other@example.com', await hashPassword('password123'));
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'other@example.com', password: 'password123' } });
    const res = await app.inject({ method: 'POST', url: `/rooms/${room.code}/host`, headers: { authorization: `Bearer ${login.json().token}` } });
    expect(res.statusCode).toBe(403);
  });
});
