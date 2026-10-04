import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { bearer, createClass, makeApp, register, type TestApp } from './helpers';

async function liveClass(settings: Record<string, unknown> = {}) {
  const app = makeApp();
  const teacher = await register(app);
  const c = await createClass(app, teacher, settings);
  await app.inject({ method: 'POST', url: `/classes/${c.id}/start`, headers: bearer(teacher) });
  return { app, teacher, c };
}

const join = (app: TestApp, code: string, body: Record<string, unknown>, headers: Record<string, string> = {}, ip = '10.0.0.1') =>
  app.inject({ method: 'POST', url: `/join/${code}`, payload: { name: 'Sara', password: '4821', ...body }, headers, remoteAddress: ip });

type Claims = { name?: string; metadata?: string; video: Record<string, unknown> };

describe('joining a class', () => {
  it('lets a guest join a live class with a messy code', async () => {
    const { app, c } = await liveClass();
    const res = await join(app, `${c.code.slice(0, 3).toLowerCase()}-${c.code.slice(3)}`, { name: '  Sara  ' });
    expect(res.statusCode).toBe(200);
    const info = res.json();
    expect(info).toMatchObject({ role: 'student', waiting: false, classTitle: 'Math 101' });
    const claims = decodeJwt(info.token) as Claims;
    expect(claims.name).toBe('Sara');
    expect(claims.video.roomAdmin).toBeFalsy();
    expect(claims.video.canPublishSources).toEqual(['camera', 'microphone']);
    expect(claims.video.canUpdateOwnMetadata).toBe(true);
  });

  it('refuses before the class starts', async () => {
    const app = makeApp();
    const t = await register(app);
    const c = await createClass(app, t);
    const res = await join(app, c.code, {});
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('notStarted');
  });

  it('refuses wrong passwords and rate-limits per address', async () => {
    const { app, c } = await liveClass();
    expect((await join(app, c.code, { password: '0000' })).statusCode).toBe(401);
    for (let i = 0; i < 10; i++) await join(app, c.code, { password: 'bad' }, {}, '10.0.0.9');
    expect((await join(app, c.code, {}, {}, '10.0.0.9')).statusCode).toBe(429);
    expect((await join(app, c.code, {}, {}, '10.0.0.2')).statusCode).toBe(200);
  });

  it('refuses locked classes', async () => {
    const { app, teacher, c } = await liveClass();
    await app.inject({ method: 'POST', url: `/classes/${c.id}/moderate`, headers: bearer(teacher), payload: { action: 'lock', value: true } });
    const res = await join(app, c.code, {});
    expect(res.statusCode).toBe(423);
  });

  it('puts students in the waiting room with no media rights', async () => {
    const { app, c } = await liveClass({ waitingRoom: true });
    const info = (await join(app, c.code, {})).json();
    expect(info.waiting).toBe(true);
    const claims = decodeJwt(info.token) as Claims;
    expect(claims.video.canSubscribe).toBe(false);
    expect(claims.video.canPublish).toBe(false);
    expect(JSON.parse(claims.metadata!)).toMatchObject({ role: 'student', waiting: true });
  });

  it('allows screen share when the class permits it', async () => {
    const { app, c } = await liveClass({ studentsCanShare: true });
    const claims = decodeJwt((await join(app, c.code, {})).json().token) as Claims;
    expect(claims.video.canPublishSources).toEqual(['camera', 'microphone', 'screen_share', 'screen_share_audio']);
  });

  it('enrolls logged-in students, uses their profile name, and lists the class for them', async () => {
    const { app, c } = await liveClass();
    const s = await register(app, 'student', 's@x.com');
    await app.inject({ method: 'PATCH', url: '/me', headers: bearer(s), payload: { displayName: 'Omar' } });
    const info = (await join(app, c.code, { name: 'ignored' }, bearer(s))).json();
    expect(info.identity).toMatch(/^u-\d+$/);
    expect((decodeJwt(info.token) as Claims).name).toBe('Omar');
    const list = (await app.inject({ method: 'GET', url: '/classes', headers: bearer(s) })).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Math 101', live: true });
    expect(list[0].joinPassword).toBeUndefined();
  });

  it('records attendance for the session', async () => {
    const { app, teacher, c } = await liveClass();
    await join(app, c.code, { name: 'Sara' });
    await join(app, c.code, { name: 'Ali' });
    const [session] = (await app.inject({ method: 'GET', url: `/classes/${c.id}/sessions`, headers: bearer(teacher) })).json();
    expect(session.attendeeCount).toBe(2);
    const list = (await app.inject({ method: 'GET', url: `/classes/${c.id}/sessions/${session.id}/attendance`, headers: bearer(teacher) })).json();
    expect(list.map((a: { name: string }) => a.name).sort()).toEqual(['Ali', 'Sara']);
  });

  it('validates names and unknown codes', async () => {
    const { app, c } = await liveClass();
    expect((await join(app, c.code, { name: '  ' })).statusCode).toBe(400);
    expect((await join(app, c.code, { name: 'x'.repeat(41) })).statusCode).toBe(400);
    expect((await join(app, 'AAAAAA', {})).statusCode).toBe(404);
  });
});

describe('invite page', () => {
  it('opens the app for a valid code and escapes bad input', async () => {
    const { app, c } = await liveClass();
    const ok = await app.inject({ method: 'GET', url: `/j/${c.code.toLowerCase()}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain(`brightboard://join/${c.code}`);
    const bad = await app.inject({ method: 'GET', url: '/j/<script>' });
    expect(bad.statusCode).toBe(404);
    expect(bad.body).not.toContain('<script>');
  });
});
