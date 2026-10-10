import { describe, expect, it } from 'vitest';
import { nextMeeting, upcomingMeetings, type Schedule } from './schedule';

// Wednesday 8 Oct 2025, 09:00 local time.
const wed9 = new Date(2025, 9, 8, 9, 0);
const sunTue10: Schedule = { days: [0, 2], time: '10:00', minutes: 60 };

describe('nextMeeting', () => {
  it('finds the next scheduled day and time', () => {
    const next = nextMeeting(sunTue10, wed9)!;
    expect(next.start).toEqual(new Date(2025, 9, 12, 10, 0)); // Sunday
    expect(next.end).toEqual(new Date(2025, 9, 12, 11, 0));
  });

  it('returns today when it has not started yet', () => {
    const next = nextMeeting({ days: [3], time: '18:30', minutes: 45 }, wed9)!;
    expect(next.start).toEqual(new Date(2025, 9, 8, 18, 30));
  });

  it('keeps a meeting that is happening right now', () => {
    const next = nextMeeting({ days: [3], time: '08:30', minutes: 60 }, wed9)!;
    expect(next.start).toEqual(new Date(2025, 9, 8, 8, 30));
  });

  it('moves to next week once today’s meeting is over', () => {
    const next = nextMeeting({ days: [3], time: '07:00', minutes: 60 }, wed9)!;
    expect(next.start).toEqual(new Date(2025, 9, 15, 7, 0));
  });

  it('has nothing for an empty or broken schedule', () => {
    expect(nextMeeting({ days: [], time: '10:00', minutes: 60 }, wed9)).toBeNull();
    expect(nextMeeting({ days: [1], time: 'soon', minutes: 60 }, wed9)).toBeNull();
  });
});

describe('upcomingMeetings', () => {
  it('lists every space’s next meeting within the window, soonest first', () => {
    const list = upcomingMeetings(
      [
        { id: 'a', schedule: sunTue10 },
        { id: 'b', schedule: { days: [3], time: '18:30', minutes: 45 } },
        { id: 'c', schedule: null },
        { id: 'd', schedule: { days: [3], time: '08:30', minutes: 60 } },
      ],
      wed9,
      7,
    );
    expect(list.map((m) => m.item.id)).toEqual(['d', 'b', 'a']);
    expect(list[0].now).toBe(true);
    expect(list[1].now).toBe(false);
  });

  it('drops meetings further away than the window', () => {
    expect(upcomingMeetings([{ id: 'a', schedule: sunTue10 }], wed9, 2)).toEqual([]);
  });
});
