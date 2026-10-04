import { describe, expect, it } from 'vitest';
import { makeApp, registerTeacher } from './helpers';

describe('auth', () => {
  it('registers the first teacher', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'password123' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().token).toBeTypeOf('string');
  });

  it('lets more teachers register, but not the same email twice', async () => {
    const app = makeApp();
    await registerTeacher(app);
    const other = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'x@y.com', password: 'password123' } });
    expect(other.statusCode).toBe(201);
    const dup = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'Teacher@Example.com', password: 'password123' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toMatch(/already/i);
  });

  it('rejects short passwords', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'short' } });
    expect(res.statusCode).toBe(400);
  });

  it('logs in with the right password only', async () => {
    const app = makeApp();
    await registerTeacher(app);
    const ok = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'TEACHER@example.com', password: 'password123' } });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'teacher@example.com', password: 'wrongpass1' } });
    expect(bad.statusCode).toBe(401);
  });

  it('answers health checks', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ ok: true });
  });
});
