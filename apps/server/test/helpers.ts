import { buildApp } from '../src/app';
import type { Config } from '../src/config';

export const testConfig: Config = {
  port: 0,
  jwtSecret: 'test-secret-test-secret-test-secret',
  dbPath: ':memory:',
  livekitUrl: 'ws://localhost:7880',
  livekitApiKey: 'devkey',
  livekitApiSecret: 'secret-secret-secret-secret-secret',
};

export function makeApp() {
  return buildApp(testConfig);
}

export async function registerTeacher(app: ReturnType<typeof makeApp>, email = 'teacher@example.com') {
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123' } });
  return res.json().token as string;
}
