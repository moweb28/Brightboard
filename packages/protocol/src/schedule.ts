/** A repeating meeting time: days of the week (0 = Sunday), start time and length. */
export interface Schedule {
  days: number[];
  /** "HH:MM", 24-hour, local time. */
  time: string;
  minutes: number;
}

export interface Occurrence {
  start: Date;
  end: Date;
}

function parseTime(time: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h < 24 && min < 60 ? [h, min] : null;
}

/** The meeting happening now, or else the next one. */
export function nextMeeting(schedule: Schedule, now: Date): Occurrence | null {
  const hm = parseTime(schedule.time);
  if (!hm || !schedule.days.length) return null;
  for (let offset = 0; offset <= 7; offset++) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hm[0], hm[1]);
    if (!schedule.days.includes(start.getDay())) continue;
    const end = new Date(start.getTime() + Math.max(1, schedule.minutes) * 60_000);
    if (end > now) return { start, end };
  }
  return null;
}

/** Next meeting of each item within `days`, soonest first; `now` marks meetings already under way. */
export function upcomingMeetings<T extends { schedule: Schedule | null }>(items: T[], now: Date, days: number) {
  const limit = now.getTime() + days * 86_400_000;
  return items
    .flatMap((item) => {
      const next = item.schedule && nextMeeting(item.schedule, now);
      return next && next.start.getTime() <= limit ? [{ item, ...next, now: next.start <= now }] : [];
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
