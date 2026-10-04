import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}
