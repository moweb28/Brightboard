import { describe, expect, it } from 'vitest';
import { bearer, makeApp, register } from './helpers';

describe('auth', () => {
  it('registers anyone without a role', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@x.com', password: 'password123' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ email: 'a@x.com', onboarded: false, useCases: [] });
    expect(res.json().user.role).toBeUndefined();
  });

  it('rejects short passwords and duplicate emails', async () => {
    const app = makeApp();
    const reg = (payload: object) => app.inject({ method: 'POST', url: '/auth/register', payload });
    expect((await reg({ email: 'a@b.com', password: 'short' })).statusCode).toBe(400);
    await register(app, 'a@b.com');
    const dup = await reg({ email: 'A@B.com', password: 'password123' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('emailTaken');
  });

  it('logs in with the right password only', async () => {
    const app = makeApp();
    await register(app, 's@x.com');
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'S@x.com', password: 'password123' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 's@x.com', password: 'wrongpass1' } })).statusCode).toBe(401);
  });

  it('updates the profile, use cases and onboarding', async () => {
    const app = makeApp();
    const token = await register(app);
    const patch = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: bearer(token),
      payload: { displayName: '  Huda ', avatarColor: '#10b981', about: 'Math teacher', useCases: ['school', 'friends'], onboarded: true },
    });
    expect(patch.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json()).toMatchObject({ displayName: 'Huda', avatarColor: '#10b981', about: 'Math teacher', useCases: ['school', 'friends'], onboarded: true });
  });

  it('rejects invalid profile values', async () => {
    const app = makeApp();
    const token = await register(app);
    const patch = (payload: object) => app.inject({ method: 'PATCH', url: '/me', headers: bearer(token), payload });
    expect((await patch({ displayName: '' })).statusCode).toBe(400);
    expect((await patch({ avatarColor: 'red;}' })).statusCode).toBe(400);
    expect((await patch({ useCases: ['hacking'] })).statusCode).toBe(400);
  });

  it('changes the password only with the current one', async () => {
    const app = makeApp();
    const token = await register(app, 't@x.com');
    expect((await app.inject({ method: 'POST', url: '/me/password', headers: bearer(token), payload: { current: 'nope12345', next: 'newpassword1' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/me/password', headers: bearer(token), payload: { current: 'password123', next: 'newpassword1' } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 't@x.com', password: 'newpassword1' } })).statusCode).toBe(200);
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
