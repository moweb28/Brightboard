import { describe, expect, it } from 'vitest';
import { defaultKindFor, KIND_PRESETS } from '../src';

describe('space kinds', () => {
  it('picks a default kind from use cases, school first', () => {
    expect(defaultKindFor([])).toBe('hangout');
    expect(defaultKindFor(['friends'])).toBe('hangout');
    expect(defaultKindFor(['work', 'friends'])).toBe('meeting');
    expect(defaultKindFor(['events'])).toBe('event');
    expect(defaultKindFor(['work', 'school'])).toBe('class');
  });
  it('classes start with a waiting room and muted guests', () => {
    expect(KIND_PRESETS.class).toMatchObject({ waitingRoom: true, muteOnJoin: true, guestsCanShare: false });
    expect(KIND_PRESETS.hangout.waitingRoom).toBe(false);
  });
});
