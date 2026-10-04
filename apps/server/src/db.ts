import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
      display_name TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL DEFAULT '#4f46e5',
      school TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      onboarded INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      teacher_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#4f46e5',
      schedule TEXT NOT NULL DEFAULT '',
      join_password TEXT NOT NULL,
      waiting_room INTEGER NOT NULL DEFAULT 0,
      mute_on_join INTEGER NOT NULL DEFAULT 0,
      students_can_share INTEGER NOT NULL DEFAULT 0,
      chat_enabled INTEGER NOT NULL DEFAULT 1,
      locked INTEGER NOT NULL DEFAULT 0,
      spotlight TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      identity TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      UNIQUE (session_id, identity)
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      class_id INTEGER NOT NULL REFERENCES classes(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (class_id, user_id)
    );
  `);
  return db;
}
