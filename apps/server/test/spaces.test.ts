import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { bearer, createSpace, makeApp, register } from './helpers';

describe('spaces', () => {
  it('anyone can create a space; the kind sets default settings', async () => {
    const app = makeApp();
    const t = await register(app);
    const res = await app.inject({ method: 'POST', url: '/spaces', headers: bearer(t), payload: { title: '  Biology  ', kind: 'class' } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ title: 'Biology', kind: 'class', isHost: true, live: false, waitingRoom: true, muteOnJoin: true, guestsCanShare: false, hasPassword: false, password: '' });
    expect(res.json().code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('explicit settings override the kind preset', async () => {
    const app = makeApp();
    const t = await register(app);
    const s = await createSpace(app, t, { kind: 'class', waitingRoom: false });
    expect(s).toMatchObject({ waitingRoom: false, muteOnJoin: true, hasPassword: true, password: '4821' });
  });

  it('quick-starts a hangout named after the host', async () => {
    const app = makeApp();
    const t = await register(app);
    await app.inject({ method: 'PATCH', url: '/me', headers: bearer(t), payload: { displayName: 'Huda' } });
    const res = await app.inject({ method: 'POST', url: '/spaces/instant', headers: bearer(t) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: 'host', waiting: false, kind: 'hangout', spaceTitle: "Huda's space" });
  });

  it('validates title, kind, emoji, color and password', async () => {
    const app = makeApp();
    const t = await register(app);
    const post = (payload: object) => app.inject({ method: 'POST', url: '/spaces', headers: bearer(t), payload });
    expect((await post({ title: '' })).statusCode).toBe(400);
    expect((await post({ title: 'A', kind: 'party' })).statusCode).toBe(400);
    expect((await post({ title: 'A', color: 'javascript:' })).statusCode).toBe(400);
    expect((await post({ title: 'A', emoji: 'x'.repeat(20) })).statusCode).toBe(400);
    expect((await post({ title: 'A', password: '12' })).statusCode).toBe(400);
  });

  it('lists hosted spaces and hides archived ones', async () => {
    const app = makeApp();
    const t1 = await register(app, 't1@x.com');
    const t2 = await register(app, 't2@x.com');
    const a = await createSpace(app, t1, { title: 'A' });
    await createSpace(app, t2, { title: 'B' });
    let list = (await app.inject({ method: 'GET', url: '/spaces', headers: bearer(t1) })).json();
    expect(list.map((c: { title: string }) => c.title)).toEqual(['A']);
    await app.inject({ method: 'DELETE', url: `/spaces/${a.id}`, headers: bearer(t1) });
    list = (await app.inject({ method: 'GET', url: '/spaces', headers: bearer(t1) })).json();
    expect(list).toEqual([]);
  });

  it("refuses to read or edit someone else's space", async () => {
    const app = makeApp();
    const t1 = await register(app, 't1@x.com');
    const t2 = await register(app, 't2@x.com');
    const a = await createSpace(app, t1);
    expect((await app.inject({ method: 'GET', url: `/spaces/${a.id}`, headers: bearer(t2) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `/spaces/${a.id}`, headers: bearer(t2), payload: { title: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/spaces/${a.id}/start`, headers: bearer(t2) })).statusCode).toBe(404);
  });

  it('updates settings (including removing the password) and pushes them to a live room', async () => {
    const app = makeApp();
    const t = await register(app);
    const s = await createSpace(app, t);
    await app.inject({ method: 'POST', url: `/spaces/${s.id}/start`, headers: bearer(t) });
    const res = await app.inject({ method: 'PATCH', url: `/spaces/${s.id}`, headers: bearer(t), payload: { waitingRoom: true, chatEnabled: false, password: '' } });
    expect(res.json()).toMatchObject({ waitingRoom: true, chatEnabled: false, hasPassword: false });
    const meta = JSON.parse(app.rc.callsTo('setRoomMetadata').at(-1)![1] as string);
    expect(meta).toMatchObject({ waitingRoom: true, chatEnabled: false, title: 'Math 101', kind: 'hangout' });
  });

  it('start opens a call with a host token; end closes it and removes everyone', async () => {
    const app = makeApp();
    const t = await register(app);
    const s = await createSpace(app, t);
    const start = await app.inject({ method: 'POST', url: `/spaces/${s.id}/start`, headers: bearer(t) });
    expect(start.statusCode).toBe(200);
    const info = start.json();
    expect(info).toMatchObject({ role: 'host', roomName: s.code, spaceTitle: 'Math 101', waiting: false });
    expect((decodeJwt(info.token) as { video: { roomAdmin: boolean } }).video.roomAdmin).toBe(true);
    await app.inject({ method: 'POST', url: `/spaces/${s.id}/start`, headers: bearer(t) });
    expect((await app.inject({ method: 'GET', url: `/spaces/${s.id}/calls`, headers: bearer(t) })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url: `/spaces/${s.id}/end`, headers: bearer(t) })).statusCode).toBe(204);
    expect(app.rc.callsTo('deleteRoom')).toEqual([[s.code]]);
    expect((await app.inject({ method: 'GET', url: `/spaces/${s.id}/calls`, headers: bearer(t) })).json()[0].endedAt).toBeTypeOf('number');
  });

  it('reports host stats', async () => {
    const app = makeApp();
    const t = await register(app);
    const s = await createSpace(app, t);
    await app.inject({ method: 'POST', url: `/spaces/${s.id}/start`, headers: bearer(t) });
    await app.inject({ method: 'POST', url: `/join/${s.code}`, payload: { name: 'Sara', password: '4821' } });
    expect((await app.inject({ method: 'GET', url: '/stats', headers: bearer(t) })).json()).toMatchObject({ spaces: 1, people: 1, callsThisWeek: 1 });
  });
});
