import { describe, expect, it } from 'vitest';
import { sessionFileName } from '../src/files';

describe('sessionFileName', () => {
  const at = new Date(2026, 9, 7, 14, 5);
  it('combines title and local time', () => {
    expect(sessionFileName('Family Friday', at, 'webm')).toBe('Family Friday 2026-10-07 14-05.webm');
  });
  it('strips characters Windows does not allow and trailing dots', () => {
    expect(sessionFileName('Q3: plan/review?..', at, 'txt')).toBe('Q3 plan review 2026-10-07 14-05.txt');
  });
  it('keeps Arabic and falls back when empty', () => {
    expect(sessionFileName('درس الجبر', at, 'txt')).toBe('درس الجبر 2026-10-07 14-05.txt');
    expect(sessionFileName('***', at, 'webm')).toBe('Brightboard 2026-10-07 14-05.webm');
  });
});
