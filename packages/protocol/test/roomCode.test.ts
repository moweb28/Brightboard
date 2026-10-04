import { describe, expect, it } from 'vitest';
import { extractRoomCode, formatRoomCode, generateRoomCode, normalizeRoomCode } from '../src/roomCode';

describe('room codes', () => {
  it('generates 6 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 1000; i++) expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('normalizes user input', () => {
    expect(normalizeRoomCode(' k7p-2qx ')).toBe('K7P2QX');
    expect(normalizeRoomCode('k7p 2qx')).toBe('K7P2QX');
  });

  it('rejects wrong length or characters', () => {
    expect(normalizeRoomCode('K7P2Q')).toBeNull();
    expect(normalizeRoomCode('K7P2Q0')).toBeNull();
  });

  it('formats for display', () => {
    expect(formatRoomCode('K7P2QX')).toBe('K7P-2QX');
  });
});

describe('extractRoomCode', () => {
  it('reads codes from invite links, app links and plain text', () => {
    expect(extractRoomCode('http://localhost:4000/j/K7P-2QX')).toBe('K7P2QX');
    expect(extractRoomCode('https://brightboard.example/j/k7p2qx?x=1')).toBe('K7P2QX');
    expect(extractRoomCode('brightboard://join/K7P2QX')).toBe('K7P2QX');
    expect(extractRoomCode(' k7p-2qx ')).toBe('K7P2QX');
  });

  it('returns null for anything else', () => {
    expect(extractRoomCode('https://example.com/other')).toBeNull();
    expect(extractRoomCode('')).toBeNull();
  });
});
