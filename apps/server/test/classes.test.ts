import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { bearer, createClass, makeApp, register } from './helpers';

describe('classes', () => {
  it('only teachers can create classes', async () => {
    const app = makeApp();
    const student = await register(app, 'student');
    const res = await app.inject({ method: 'POST', url: '/classes', headers: bearer(student), payload: { title: 'X' } });
    expect(res.statusCode).toBe(403);
  });

  it('creates a class with defaults and a generated password', async () => {
    const app = makeApp();
    const t = await register(app);
    const res = await app.inject({ method: 'POST', url: '/classes', headers: bearer(t), payload: { title: '  Biology  ' } });
    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c).toMatchObject({ title: 'Biology', live: false, waitingRoom: false, chatEnabled: true, studentsCanShare: false, locked: false });
    expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(c.joinPassword).toMatch(/^\d{4}$/);
  });

  it('validates title, color and password', async () => {
    const app = makeApp();
    const t = await register(app);
    const post = (payload: object) => app.inject({ method: 'POST', url: '/classes', headers: bearer(t), payload });
    expect((await post({ title: '' })).statusCode).toBe(400);
    expect((await post({ title: 'A', color: 'javascript:' })).statusCode).toBe(400);
    expect((await post({ title: 'A', password: '12' })).statusCode).toBe(400);
  });

  it('lists only my classes, hides archived ones', async () => {
    const app = makeApp();
    const t1 = await register(app, 'teacher', 't1@x.com');
    const t2 = await register(app, 'teacher', 't2@x.com');
    const a = await createClass(app, t1, { title: 'A' });
    await createClass(app, t2, { title: 'B' });
    let list = (await app.inject({ method: 'GET', url: '/classes', headers: bearer(t1) })).json();
    expect(list.map((c: { title: string }) => c.title)).toEqual(['A']);
    await app.inject({ method: 'DELETE', url: `/classes/${a.id}`, headers: bearer(t1) });
    list = (await app.inject({ method: 'GET', url: '/classes', headers: bearer(t1) })).json();
    expect(list).toEqual([]);
  });

  it("refuses to read or edit another teacher's class", async () => {
    const app = makeApp();
    const t1 = await register(app, 'teacher', 't1@x.com');
    const t2 = await register(app, 'teacher', 't2@x.com');
    const a = await createClass(app, t1);
    expect((await app.inject({ method: 'GET', url: `/classes/${a.id}`, headers: bearer(t2) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `/classes/${a.id}`, headers: bearer(t2), payload: { title: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/classes/${a.id}/start`, headers: bearer(t2) })).statusCode).toBe(404);
  });

  it('updates settings and pushes them to a live room', async () => {
    const app = makeApp();
    const t = await register(app);
    const c = await createClass(app, t);
    await app.inject({ method: 'POST', url: `/classes/${c.id}/start`, headers: bearer(t) });
    const res = await app.inject({ method: 'PATCH', url: `/classes/${c.id}`, headers: bearer(t), payload: { waitingRoom: true, chatEnabled: false, password: '9999' } });
    expect(res.json()).toMatchObject({ waitingRoom: true, chatEnabled: false, joinPassword: '9999' });
    const meta = JSON.parse(app.rc.callsTo('setRoomMetadata').at(-1)![1] as string);
    expect(meta).toMatchObject({ waitingRoom: true, chatEnabled: false, title: 'Math 101' });
  });

  it('start opens a session with an admin token; end closes it and removes everyone', async () => {
    const app = makeApp();
    const t = await register(app);
    const c = await createClass(app, t);
    const start = await app.inject({ method: 'POST', url: `/classes/${c.id}/start`, headers: bearer(t) });
    expect(start.statusCode).toBe(200);
    const info = start.json();
    expect(info).toMatchObject({ role: 'teacher', roomName: c.code, classTitle: 'Math 101', waiting: false });
    expect((decodeJwt(info.token) as { video: { roomAdmin: boolean } }).video.roomAdmin).toBe(true);
    expect(app.rc.callsTo('ensureRoom')[0][0]).toBe(c.code);
    expect((await app.inject({ method: 'GET', url: `/classes/${c.id}`, headers: bearer(t) })).json().live).toBe(true);

    // Starting again reuses the open session.
    await app.inject({ method: 'POST', url: `/classes/${c.id}/start`, headers: bearer(t) });
    const detail = (await app.inject({ method: 'GET', url: `/classes/${c.id}/sessions`, headers: bearer(t) })).json();
    expect(detail).toHaveLength(1);

    const end = await app.inject({ method: 'POST', url: `/classes/${c.id}/end`, headers: bearer(t) });
    expect(end.statusCode).toBe(204);
    expect(app.rc.callsTo('deleteRoom')).toEqual([[c.code]]);
    const after = (await app.inject({ method: 'GET', url: `/classes/${c.id}/sessions`, headers: bearer(t) })).json();
    expect(after[0].endedAt).toBeTypeOf('number');
  });

  it('reports teacher stats', async () => {
    const app = makeApp();
    const t = await register(app);
    const c = await createClass(app, t);
    await app.inject({ method: 'POST', url: `/classes/${c.id}/start`, headers: bearer(t) });
    await app.inject({ method: 'POST', url: `/join/${c.code}`, payload: { name: 'Sara', password: '4821' } });
    const stats = (await app.inject({ method: 'GET', url: '/stats', headers: bearer(t) })).json();
    expect(stats).toMatchObject({ classes: 1, students: 1, sessionsThisWeek: 1 });
  });
});
