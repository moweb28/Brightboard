import { USE_CASES, type UseCase, type UserDto } from '@classroom/protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import type { Config } from './config';
import type { Db } from './db';
import { hashPassword, verifyPassword } from './password';

export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message);
  }
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  avatar_color: string;
  about: string;
  use_cases: string;
  onboarded: number;
}

export const toUserDto = (u: UserRow): UserDto => ({
  id: u.id,
  email: u.email,
  displayName: u.display_name,
  avatarColor: u.avatar_color,
  about: u.about,
  useCases: u.use_cases ? (u.use_cases.split(',') as UseCase[]) : [],
  onboarded: !!u.onboarded,
});

const email = { type: 'string', minLength: 3, maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+$' };
const password = { type: 'string', minLength: 8, maxLength: 200 };
export const hexColor = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };

export interface Auth {
  /** The logged-in user, or throws 401. */
  requireUser(req: FastifyRequest): Promise<UserRow>;
  /** The logged-in user if a valid token was sent, else null. */
  optionalUser(req: FastifyRequest): Promise<UserRow | null>;
}

export function registerAuth(app: FastifyInstance, db: Db, cfg: Config): Auth {
  const key = new TextEncoder().encode(cfg.jwtSecret);
  const issue = (userId: number) => new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(String(userId)).setExpirationTime('30d').sign(key);
  const findById = (id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;

  const optionalUser = async (req: FastifyRequest) => {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) return null;
    try {
      const { payload } = await jwtVerify(header.slice(7), key);
      return findById(Number(payload.sub)) ?? null;
    } catch {
      return null;
    }
  };
  const requireUser = async (req: FastifyRequest) => {
    const user = await optionalUser(req);
    if (!user) throw new HttpError(401, 'Please log in again', 'unauthorized');
    return user;
  };

  app.post<{ Body: { email: string; password: string } }>(
    '/auth/register',
    { schema: { body: { type: 'object', required: ['email', 'password'], properties: { email, password } } } },
    async (req, reply) => {
      const addr = req.body.email.trim().toLowerCase();
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(addr)) throw new HttpError(409, 'This email already has an account', 'emailTaken');
      const name = addr.split('@')[0].slice(0, 40);
      const result = db.prepare('INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)').run(addr, await hashPassword(req.body.password), name, Date.now());
      const id = Number(result.lastInsertRowid);
      reply.code(201);
      return { token: await issue(id), user: toUserDto(findById(id)!) };
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    { schema: { body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', maxLength: 200 }, password: { type: 'string', maxLength: 200 } } } } },
    async (req) => {
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email.trim().toLowerCase()) as UserRow | undefined;
      if (!row || !(await verifyPassword(req.body.password, row.password_hash))) throw new HttpError(401, 'Wrong email or password', 'wrongLogin');
      return { token: await issue(row.id), user: toUserDto(row) };
    },
  );

  app.get('/me', async (req) => toUserDto(await requireUser(req)));

  app.patch<{ Body: Partial<{ displayName: string; avatarColor: string; about: string; useCases: UseCase[]; onboarded: boolean }> }>(
    '/me',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 40, pattern: '\\S' },
            avatarColor: hexColor,
            about: { type: 'string', maxLength: 120 },
            useCases: { type: 'array', maxItems: USE_CASES.length, uniqueItems: true, items: { enum: [...USE_CASES] } },
            onboarded: { type: 'boolean' },
          },
        },
      },
    },
    async (req) => {
      const user = await requireUser(req);
      const b = req.body;
      db.prepare('UPDATE users SET display_name = ?, avatar_color = ?, about = ?, use_cases = ?, onboarded = ? WHERE id = ?').run(
        b.displayName?.trim() ?? user.display_name,
        b.avatarColor ?? user.avatar_color,
        b.about?.trim() ?? user.about,
        b.useCases ? b.useCases.join(',') : user.use_cases,
        b.onboarded === undefined ? user.onboarded : Number(b.onboarded),
        user.id,
      );
      return toUserDto(findById(user.id)!);
    },
  );

  app.post<{ Body: { current: string; next: string } }>(
    '/me/password',
    { schema: { body: { type: 'object', required: ['current', 'next'], properties: { current: { type: 'string', maxLength: 200 }, next: password } } } },
    async (req, reply) => {
      const user = await requireUser(req);
      if (!(await verifyPassword(req.body.current, user.password_hash))) throw new HttpError(401, 'Current password is wrong', 'wrongPassword');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(req.body.next), user.id);
      reply.code(204);
    },
  );

  return { requireUser, optionalUser };
}
