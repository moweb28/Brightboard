import type { FastifyInstance, FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import type { Config } from './config';
import type { Db } from './db';
import { hashPassword, verifyPassword } from './password';

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const credentialsSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', minLength: 3, maxLength: 200 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
};

interface Credentials {
  email: string;
  password: string;
}

export function registerAuth(app: FastifyInstance, db: Db, cfg: Config) {
  const key = new TextEncoder().encode(cfg.jwtSecret);

  const issue = (teacherId: number) =>
    new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(String(teacherId)).setExpirationTime('7d').sign(key);

  app.post<{ Body: Credentials }>('/auth/register', { schema: credentialsSchema }, async (req, reply) => {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM teachers').get() as { count: number };
    if (count > 0) throw new HttpError(403, 'Registration is closed');
    const email = req.body.email.trim().toLowerCase();
    const result = db.prepare('INSERT INTO teachers (email, password_hash) VALUES (?, ?)').run(email, await hashPassword(req.body.password));
    reply.code(201);
    return { token: await issue(Number(result.lastInsertRowid)) };
  });

  app.post<{ Body: Credentials }>('/auth/login', { schema: credentialsSchema }, async (req) => {
    const row = db.prepare('SELECT id, password_hash FROM teachers WHERE email = ?').get(req.body.email.trim().toLowerCase()) as
      | { id: number; password_hash: string }
      | undefined;
    if (!row || !(await verifyPassword(req.body.password, row.password_hash))) throw new HttpError(401, 'Wrong email or password');
    return { token: await issue(row.id) };
  });

  /** Returns the teacher id from the Bearer token, or throws 401. */
  return async function requireTeacher(req: FastifyRequest): Promise<number> {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Not logged in');
    try {
      const { payload } = await jwtVerify(header.slice(7), key);
      return Number(payload.sub);
    } catch {
      throw new HttpError(401, 'Session expired, please log in again');
    }
  };
}
