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
      password_hash TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);
  // Dev databases created before class passwords existed lack this column.
  const cols = db.prepare('PRAGMA table_info(rooms)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'password_hash')) db.exec("ALTER TABLE rooms ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
  return db;
}
