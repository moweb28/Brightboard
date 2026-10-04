import cors from '@fastify/cors';
import Fastify from 'fastify';
import { HttpError, registerAuth } from './auth';
import { registerClasses } from './classes';
import { classStore } from './classStore';
import type { Config } from './config';
import { openDb } from './db';
import { registerJoin } from './join';
import { registerModerate } from './moderate';
import { liveKitRoomControl, type RoomControl } from './roomControl';

export function buildApp(cfg: Config, deps: { roomControl?: RoomControl } = {}) {
  const app = Fastify({ logger: false });
  const db = openDb(cfg.dbPath);
  const rc = deps.roomControl ?? liveKitRoomControl(cfg);
  app.register(cors, { origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });

  // Every error response carries a stable `code` the app can translate.
  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ statusCode: err.statusCode, code: err.code, message: err.message });
    if (err.validation) return reply.code(400).send({ statusCode: 400, code: 'invalid', message: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ statusCode: err.statusCode, message: err.message });
    console.error(err);
    return reply.code(500).send({ statusCode: 500, code: 'server', message: 'Something went wrong' });
  });

  app.get('/health', async () => ({ ok: true }));
  const auth = registerAuth(app, db, cfg);
  const store = classStore(db, cfg);
  registerClasses(app, db, auth, store, rc);
  registerJoin(app, db, cfg, auth, store);
  registerModerate(app, db, auth, store, rc);
  return app;
}
