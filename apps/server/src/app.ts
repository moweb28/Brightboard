import cors from '@fastify/cors';
import Fastify from 'fastify';
import { registerAuth } from './auth';
import type { Config } from './config';
import { openDb } from './db';
import { registerRooms } from './rooms';

export function buildApp(cfg: Config) {
  const app = Fastify({ logger: false });
  const db = openDb(cfg.dbPath);
  app.register(cors, { origin: true });
  app.decorate('classroomDb', db);

  app.get('/health', async () => ({ ok: true }));
  const requireTeacher = registerAuth(app, db, cfg);
  registerRooms(app, db, cfg, requireTeacher);
  return app;
}
