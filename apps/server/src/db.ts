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
      display_name TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL DEFAULT '#4f46e5',
      about TEXT NOT NULL DEFAULT '',
      use_cases TEXT NOT NULL DEFAULT '',
      onboarded INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS spaces (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      host_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '☀️',
      color TEXT NOT NULL DEFAULT '#4f46e5',
      kind TEXT NOT NULL DEFAULT 'hangout' CHECK (kind IN ('hangout', 'meeting', 'class', 'event')),
      schedule TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      waiting_room INTEGER NOT NULL DEFAULT 0,
      mute_on_join INTEGER NOT NULL DEFAULT 0,
      guests_can_share INTEGER NOT NULL DEFAULT 1,
      chat_enabled INTEGER NOT NULL DEFAULT 1,
      locked INTEGER NOT NULL DEFAULT 0,
      spotlight TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY,
      space_id INTEGER NOT NULL REFERENCES spaces(id),
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY,
      call_id INTEGER NOT NULL REFERENCES calls(id),
      identity TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      UNIQUE (call_id, identity)
    );
    CREATE TABLE IF NOT EXISTS members (
      space_id INTEGER NOT NULL REFERENCES spaces(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (space_id, user_id)
    );
  `);
  return db;
}
