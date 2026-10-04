import { describe, expect, it } from 'vitest';
import { bearer, makeApp, register } from './helpers';

describe('auth', () => {
  it('registers teachers and students with their role', async () => {
    const app = makeApp();
    for (const role of ['teacher', 'student']) {
      const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: `${role}@x.com`, password: 'password123', role } });
      expect(res.statusCode).toBe(201);
      expect(res.json().user).toMatchObject({ role, onboarded: false, email: `${role}@x.com` });
    }
  });

  it('rejects unknown roles, short passwords and duplicate emails', async () => {
    const app = makeApp();
    const reg = (payload: object) => app.inject({ method: 'POST', url: '/auth/register', payload });
    expect((await reg({ email: 'a@b.com', password: 'password123', role: 'admin' })).statusCode).toBe(400);
    expect((await reg({ email: 'a@b.com', password: 'short', role: 'teacher' })).statusCode).toBe(400);
    await register(app, 'teacher', 'a@b.com');
    const dup = await reg({ email: 'A@B.com', password: 'password123', role: 'student' });
    expect(dup.statusCode).toBe(409);
  });

  it('logs in with the right password only and returns the user', async () => {
    const app = makeApp();
    await register(app, 'student', 's@x.com');
    const ok = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'S@x.com', password: 'password123' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.role).toBe('student');
    const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 's@x.com', password: 'wrongpass1' } });
    expect(bad.statusCode).toBe(401);
  });

  it('reads and updates the profile, finishing onboarding', async () => {
    const app = makeApp();
    const token = await register(app);
    const patch = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: bearer(token),
      payload: { displayName: '  Ms. Huda ', avatarColor: '#10b981', school: 'Cairo School', subject: 'Math', onboarded: true },
    });
    expect(patch.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json()).toMatchObject({ displayName: 'Ms. Huda', avatarColor: '#10b981', school: 'Cairo School', subject: 'Math', onboarded: true });
  });

  it('rejects invalid profile values', async () => {
    const app = makeApp();
    const token = await register(app);
    const res = await app.inject({ method: 'PATCH', url: '/me', headers: bearer(token), payload: { displayName: '' } });
    expect(res.statusCode).toBe(400);
    const color = await app.inject({ method: 'PATCH', url: '/me', headers: bearer(token), payload: { avatarColor: 'red;}' } });
    expect(color.statusCode).toBe(400);
  });

  it('changes the password only with the current one', async () => {
    const app = makeApp();
    const token = await register(app, 'teacher', 't@x.com');
    const wrong = await app.inject({ method: 'POST', url: '/me/password', headers: bearer(token), payload: { current: 'nope12345', next: 'newpassword1' } });
    expect(wrong.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/me/password', headers: bearer(token), payload: { current: 'password123', next: 'newpassword1' } });
    expect(ok.statusCode).toBe(204);
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 't@x.com', password: 'newpassword1' } });
    expect(login.statusCode).toBe(200);
  });

  it('requires a valid token for /me', async () => {
    const app = makeApp();
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/me', headers: bearer('garbage') })).statusCode).toBe(401);
  });

  it('answers health checks', async () => {
    expect((await makeApp().inject({ method: 'GET', url: '/health' })).json()).toEqual({ ok: true });
  });
});
