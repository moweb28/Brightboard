// Creates demo accounts and spaces in the local database (safe to run more than once).
import { loadConfig } from './config';
import { openDb } from './db';
import { hashPassword } from './password';

const db = openDb(loadConfig().dbPath);
const now = Date.now();

async function user(email: string, password: string, name: string, color: string, about: string, useCases: string) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (existing) return existing.id;
  const r = db
    .prepare('INSERT INTO users (email, password_hash, display_name, avatar_color, about, use_cases, onboarded, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
    .run(email, await hashPassword(password), name, color, about, useCases, now);
  return Number(r.lastInsertRowid);
}

const huda = await user('huda@brightboard.test', 'demo1234', 'Huda', '#4f46e5', 'Math teacher & weekend gamer', 'school,friends');
await user('omar@brightboard.test', 'demo1234', 'Omar', '#10b981', 'Student, Grade 9', 'school,friends');

const spaces: [string, string, string, string, string, string, string, number, number, number][] = [
  // code, title, emoji, color, kind, schedule, password, waiting, muteOnJoin, guestsCanShare
  ['MATH29', 'Algebra — Grade 9', '🎓', '#4f46e5', 'class', 'Sun & Tue · 10:00', '1234', 1, 1, 0],
  ['FAM2LY', 'Family Friday', '🏡', '#f59e0b', 'hangout', 'Fridays · 20:00', '', 0, 0, 1],
  ['TEAM42', 'Project sync', '💼', '#0ea5e9', 'meeting', 'Mon · 09:30', '', 1, 0, 1],
];
for (const [code, title, emoji, color, kind, schedule, password, waiting, mute, share] of spaces) {
  db.prepare(
    `INSERT OR IGNORE INTO spaces (code, host_id, title, emoji, color, kind, schedule, password, waiting_room, mute_on_join, guests_can_share, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(code, huda, title, emoji, color, kind, schedule, password, waiting, mute, share, now);
}
console.log('Seeded: huda@brightboard.test / demo1234 (hosts 3 spaces), omar@brightboard.test / demo1234');
