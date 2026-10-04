import cors from '@fastify/cors';
import Fastify from 'fastify';
import { registerAuth } from './auth';
import type { Config } from './config';
import { openDb } from './db';

export function buildApp(cfg: Config) {
  const app = Fastify({ logger: false });
  const db = openDb(cfg.dbPath);
  app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true }));
  registerAuth(app, db, cfg);
  return app;
}
