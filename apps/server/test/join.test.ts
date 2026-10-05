import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { bearer, createSpace, makeApp, register, type TestApp } from './helpers';

async function liveSpace(settings: Record<string, unknown> = {}) {
  const app = makeApp();
  const host = await register(app);
  const c = await createSpace(app, host, settings);
  await app.inject({ method: 'POST', url: `/spaces/${c.id}/start`, headers: bearer(host) });
  return { app, host, c };
}

const join = (app: TestApp, code: string, body: Record<string, unknown>, headers: Record<string, string> = {}, ip = '10.0.0.1') =>
  app.inject({ method: 'POST', url: `/join/${code}`, payload: { name: 'Sara', password: '4821', ...body }, headers, remoteAddress: ip });

type Claims = { name?: string; metadata?: string; video: Record<string, unknown> };

describe('joining a space', () => {
  it('lets a guest join a live space with a messy code', async () => {
    const { app, c } = await liveSpace({ guestsCanShare: false });
    const res = await join(app, `${c.code.slice(0, 3).toLowerCase()}-${c.code.slice(3)}`, { name: '  Sara  ' });
    expect(res.statusCode).toBe(200);
    const info = res.json();
    expect(info).toMatchObject({ role: 'guest', waiting: false, spaceTitle: 'Math 101', kind: 'hangout' });
    const claims = decodeJwt(info.token) as Claims;
    expect(claims.name).toBe('Sara');
    expect(claims.video.roomAdmin).toBeFalsy();
    expect(claims.video.canPublishSources).toEqual(['camera', 'microphone']);
    expect(claims.video.canUpdateOwnMetadata).toBe(true);
  });

  it('needs no password when the space has none', async () => {
    const { app, c } = await liveSpace({ password: '' });
    expect((await join(app, c.code, { password: '' })).statusCode).toBe(200);
  });

  it('refuses before the call starts', async () => {
    const app = makeApp();
    const t = await register(app);
    const c = await createSpace(app, t);
    const res = await join(app, c.code, {});
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('notStarted');
  });

  it('refuses wrong passwords and rate-limits per address', async () => {
    const { app, c } = await liveSpace();
    expect((await join(app, c.code, { password: '0000' })).statusCode).toBe(401);
    for (let i = 0; i < 10; i++) await join(app, c.code, { password: 'bad' }, {}, '10.0.0.9');
    expect((await join(app, c.code, {}, {}, '10.0.0.9')).statusCode).toBe(429);
    expect((await join(app, c.code, {}, {}, '10.0.0.2')).statusCode).toBe(200);
  });

  it('refuses locked spaces', async () => {
    const { app, host, c } = await liveSpace();
    await app.inject({ method: 'POST', url: `/spaces/${c.id}/moderate`, headers: bearer(host), payload: { action: 'lock', value: true } });
    expect((await join(app, c.code, {})).statusCode).toBe(423);
  });

  it('puts guests in the waiting room with no media rights', async () => {
    const { app, c } = await liveSpace({ waitingRoom: true });
    const info = (await join(app, c.code, {})).json();
    expect(info.waiting).toBe(true);
    const claims = decodeJwt(info.token) as Claims;
    expect(claims.video.canSubscribe).toBe(false);
    expect(claims.video.canPublish).toBe(false);
    expect(JSON.parse(claims.metadata!)).toMatchObject({ role: 'guest', waiting: true });
  });

  it('allows screen share when the space permits it', async () => {
    const { app, c } = await liveSpace({ guestsCanShare: true });
    const claims = decodeJwt((await join(app, c.code, {})).json().token) as Claims;
    expect(claims.video.canPublishSources).toEqual(['camera', 'microphone', 'screen_share', 'screen_share_audio']);
  });

  it('makes logged-in people members, uses their profile name, and lists the space for them', async () => {
    const { app, c } = await liveSpace();
    const s = await register(app, 's@x.com');
    await app.inject({ method: 'PATCH', url: '/me', headers: bearer(s), payload: { displayName: 'Omar' } });
    const info = (await join(app, c.code, { name: 'ignored' }, bearer(s))).json();
    expect(info.identity).toMatch(/^u-\d+$/);
    expect((decodeJwt(info.token) as Claims).name).toBe('Omar');
    const list = (await app.inject({ method: 'GET', url: '/spaces', headers: bearer(s) })).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Math 101', live: true, isHost: false, hasPassword: true });
    expect(list[0].password).toBeUndefined();
  });

  it('lets members rejoin without the password', async () => {
    const { app, c } = await liveSpace();
    const s = await register(app, 's@x.com');
    await join(app, c.code, {}, bearer(s));
    expect((await join(app, c.code, { password: '' }, bearer(s))).statusCode).toBe(200);
    const stranger = await register(app, 'z@x.com');
    expect((await join(app, c.code, { password: '' }, bearer(stranger))).statusCode).toBe(401);
  });

  it('tells the host to start their own space from Home', async () => {
    const { app, host, c } = await liveSpace();
    expect((await join(app, c.code, {}, bearer(host))).json().code).toBe('ownSpace');
  });

  it('records attendance for the call', async () => {
    const { app, host, c } = await liveSpace();
    await join(app, c.code, { name: 'Sara' });
    await join(app, c.code, { name: 'Ali' });
    const [call] = (await app.inject({ method: 'GET', url: `/spaces/${c.id}/calls`, headers: bearer(host) })).json();
    expect(call.attendeeCount).toBe(2);
    const list = (await app.inject({ method: 'GET', url: `/spaces/${c.id}/calls/${call.id}/attendance`, headers: bearer(host) })).json();
    expect(list.map((a: { name: string }) => a.name).sort()).toEqual(['Ali', 'Sara']);
  });

  it('validates names and unknown codes', async () => {
    const { app, c } = await liveSpace();
    expect((await join(app, c.code, { name: '  ' })).statusCode).toBe(400);
    expect((await join(app, c.code, { name: 'x'.repeat(41) })).statusCode).toBe(400);
    expect((await join(app, 'AAAAAA', {})).statusCode).toBe(404);
  });
});

describe('invite page', () => {
  it('opens the app for a valid code and escapes bad input', async () => {
    const { app, c } = await liveSpace({ title: '<b>Fun</b>' });
    const ok = await app.inject({ method: 'GET', url: `/j/${c.code.toLowerCase()}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain(`brightboard://join/${c.code}`);
    expect(ok.body).not.toContain('<b>Fun</b>');
    const bad = await app.inject({ method: 'GET', url: '/j/<script>' });
    expect(bad.statusCode).toBe(404);
    expect(bad.body).not.toContain('<script>');
  });
});
