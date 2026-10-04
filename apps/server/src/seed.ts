// Creates demo accounts and classes in the local database (safe to run more than once).
import { loadConfig } from './config';
import { openDb } from './db';
import { hashPassword } from './password';

const db = openDb(loadConfig().dbPath);
const now = Date.now();

async function user(email: string, password: string, role: 'teacher' | 'student', name: string, color: string, extra: Record<string, string>) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (existing) return existing.id;
  const r = db
    .prepare('INSERT INTO users (email, password_hash, role, display_name, avatar_color, school, subject, grade, onboarded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)')
    .run(email, await hashPassword(password), role, name, color, extra.school ?? '', extra.subject ?? '', extra.grade ?? '', now);
  return Number(r.lastInsertRowid);
}

const teacherId = await user('teacher@brightboard.test', 'teacher123', 'teacher', 'Ms. Huda', '#4f46e5', { school: 'Sunrise School', subject: 'Mathematics' });
await user('student@brightboard.test', 'student123', 'student', 'Omar', '#10b981', { school: 'Sunrise School', grade: 'Grade 9' });

const classes: [string, string, string, string, string][] = [
  ['MATH09', 'Algebra — Grade 9', 'Mathematics', '#4f46e5', 'Sun & Tue · 10:00'],
  ['SCI9AB', 'Physics Lab', 'Science', '#0ea5e9', 'Wed · 12:30'],
  ['ENG9CD', 'English Reading Club', 'English', '#ec4899', 'Thu · 09:00'],
];
for (const [code, title, subject, color, schedule] of classes) {
  db.prepare(
    'INSERT OR IGNORE INTO classes (code, teacher_id, title, subject, color, schedule, join_password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(code.replace(/[01IO]/g, '2'), teacherId, title, subject, color, schedule, '1234', now);
}
console.log('Seeded: teacher@brightboard.test / teacher123, student@brightboard.test / student123 (class password 1234)');
