import type { Lang } from './i18n';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = [...parts[0]][0] ?? '';
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Stable color for people without a chosen avatar color (e.g. guests). */
export function colorFor(id: string) {
  const palette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-EG' : 'en-US');

export const formatTime = (ts: number, lang: Lang) => new Date(ts).toLocaleTimeString(locale(lang), { hour: 'numeric', minute: '2-digit' });

export const formatDate = (ts: number, lang: Lang) =>
  new Date(ts).toLocaleDateString(locale(lang), { weekday: 'short', month: 'short', day: 'numeric' });

export function formatRelative(ts: number, lang: Lang) {
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
  const diff = ts - Date.now();
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function dayPart(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

/** Weekday name for 0 = Sunday … 6 = Saturday. */
export function weekdayName(day: number, lang: Lang, width: 'short' | 'long' = 'short') {
  // 2023-01-01 was a Sunday.
  return new Date(2023, 0, 1 + day).toLocaleDateString(locale(lang), { weekday: width });
}

/** The week as people there count it: Sunday first in English, Saturday first in Arabic. */
export const weekOrder = (lang: Lang) => (lang === 'ar' ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]);

/** "Sun and Tue, 10:00 AM" */
export function formatSchedule(schedule: { days: number[]; time: string }, lang: Lang) {
  const [h, m] = schedule.time.split(':').map(Number);
  const time = new Date(2023, 0, 1, h, m).toLocaleTimeString(locale(lang), { hour: 'numeric', minute: '2-digit' });
  const days = weekOrder(lang).filter((d) => schedule.days.includes(d));
  const names = days.length === 7 ? [lang === 'ar' ? 'كل يوم' : 'Every day'] : days.map((d) => weekdayName(d, lang));
  return `${new Intl.ListFormat(locale(lang), { style: 'short', type: 'conjunction' }).format(names)}, ${time}`;
}

/** "Today", "Tomorrow" or "Thu, Oct 16", for an upcoming meeting. */
export function formatDay(date: Date, lang: Lang, now = new Date()) {
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0 || days === 1) return new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' }).format(days, 'day');
  return formatDate(date.getTime(), lang);
}
