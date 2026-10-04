import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { makeApp, registerTeacher } from './helpers';

const PASSWORD = '4821';

async function setup() {
  const app = makeApp();
  const token = await registerTeacher(app);
  const res = await app.inject({ method: 'POST', url: '/rooms', headers: { authorization: `Bearer ${token}` }, payload: { password: PASSWORD } });
  return { app, token, room: res.json() as { code: string; display: string }, status: res.statusCode };
}

type App = Awaited<ReturnType<typeof setup>>['app'];

const join = (app: App, code: string, name: unknown, password: unknown = PASSWORD, ip = '10.0.0.1') =>
  app.inject({ method: 'POST', url: `/rooms/${code}/join`, payload: { name, password }, remoteAddress: ip });

describe('rooms', () => {
  it('requires login to create a room', async () => {
    const res = await makeApp().inject({ method: 'POST', url: '/rooms', payload: { password: PASSWORD } });
    expect(res.statusCode).toBe(401);
  });

  it('creates a room with a display code', async () => {
    const { room, status } = await setup();
    expect(status).toBe(201);
    expect(room.display).toBe(`${room.code.slice(0, 3)}-${room.code.slice(3)}`);
  });

  it('requires a class password of 4–32 characters', async () => {
    const app = makeApp();
    const token = await registerTeacher(app);
    const create = (password: unknown) =>
      app.inject({ method: 'POST', url: '/rooms', headers: { authorization: `Bearer ${token}` }, payload: { password } });
    expect((await create('123')).statusCode).toBe(400);
    expect((await create('x'.repeat(33))).statusCode).toBe(400);
    expect((await create(undefined)).statusCode).toBe(400);
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

  it('rejects a wrong class password', async () => {
    const { app, room } = await setup();
    const res = await join(app, room.code, 'Ali', '0000');
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/password/i);
  });

  it('blocks an address after 10 wrong passwords but not others', async () => {
    const { app, room } = await setup();
    for (let i = 0; i < 10; i++) await join(app, room.code, 'Ali', 'wrong', '10.0.0.9');
    expect((await join(app, room.code, 'Ali', PASSWORD, '10.0.0.9')).statusCode).toBe(429);
    expect((await join(app, room.code, 'Ali', PASSWORD, '10.0.0.2')).statusCode).toBe(200);
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
    const other = await registerTeacher(app, 'other@example.com');
    const res = await app.inject({ method: 'POST', url: `/rooms/${room.code}/host`, headers: { authorization: `Bearer ${other}` } });
    expect(res.statusCode).toBe(403);
  });
});

describe('invite link page', () => {
  it('serves a page that opens the app for a valid code', async () => {
    const { app, room } = await setup();
    const res = await app.inject({ method: 'GET', url: `/j/${room.display.toLowerCase()}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain(`brightboard://join/${room.code}`);
    expect(res.body).toContain(room.display);
  });

  it('shows a friendly page for unknown codes', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/j/<script>' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('<script>');
  });
});
