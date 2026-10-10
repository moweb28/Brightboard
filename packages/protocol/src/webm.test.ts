import { describe, expect, it } from 'vitest';
import { withWebmDuration } from './webm';

const bytes = (...parts: number[][]) => Uint8Array.from(parts.flat());
// EBML header (empty body) + Segment of unknown size, like MediaRecorder writes.
const EBML = [0x1a, 0x45, 0xdf, 0xa3, 0x80];
const SEGMENT = [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const SCALE = [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]; // TimecodeScale = 1,000,000 ns
const APP = [0x4d, 0x80, 0x82, 0x43, 0x68]; // MuxingApp "Ch"
const info = (body: number[]) => [0x15, 0x49, 0xa9, 0x66, 0x80 | body.length, ...body];
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xe7, 0x81, 0x00];

function readDuration(out: Uint8Array) {
  const at = out.findIndex((b, i) => b === 0x44 && out[i + 1] === 0x89);
  expect(at).toBeGreaterThan(0);
  expect(out[at + 2]).toBe(0x88);
  return new DataView(out.buffer, out.byteOffset + at + 3, 8).getFloat64(0);
}

describe('withWebmDuration', () => {
  it('adds a Duration (in timecode units) to the Info block and keeps the rest', () => {
    const head = bytes(EBML, SEGMENT, info([...SCALE, ...APP]), CLUSTER);
    const res = withWebmDuration(head, 83_500)!;
    expect(res).not.toBeNull();
    expect(readDuration(res.bytes)).toBe(83_500);
    // Everything before Info is untouched, and the patched prefix replaces exactly up to the end of Info.
    expect([...res.bytes.slice(0, EBML.length + SEGMENT.length)]).toEqual([...EBML, ...SEGMENT]);
    expect(res.replaced).toBe(head.length - CLUSTER.length);
    // The new Info size covers its old body plus the 11-byte Duration element.
    const infoAt = EBML.length + SEGMENT.length;
    expect(res.bytes[infoAt + 4]).toBe(0x80 | (SCALE.length + APP.length + 11));
  });

  it('honours a non-default TimecodeScale', () => {
    const scale = [0x2a, 0xd7, 0xb1, 0x83, 0x1e, 0x84, 0x80]; // 2,000,000 ns
    const res = withWebmDuration(bytes(EBML, SEGMENT, info(scale), CLUSTER), 10_000)!;
    expect(readDuration(res.bytes)).toBe(5_000);
  });

  it('skips elements before Info and widens the size when it no longer fits', () => {
    const big = Array.from({ length: 120 }, () => 0x41);
    const title = [0x7b, 0xa9, 0x80 | big.length, ...big]; // Title, 123 bytes total
    const voidEl = [0xec, 0x82, 0x00, 0x00];
    const res = withWebmDuration(bytes(EBML, SEGMENT, voidEl, info(title), CLUSTER), 1_000)!;
    expect(readDuration(res.bytes)).toBe(1_000);
    const infoAt = EBML.length + SEGMENT.length + voidEl.length;
    expect(res.bytes[infoAt + 4]).toBe(0x01); // 8-byte size vint
  });

  it('leaves files that already have a duration, or are not WebM, alone', () => {
    const dur = [0x44, 0x89, 0x88, 0x40, 0x8f, 0x40, 0, 0, 0, 0, 0];
    expect(withWebmDuration(bytes(EBML, SEGMENT, info([...SCALE, ...dur]), CLUSTER), 5)).toBeNull();
    expect(withWebmDuration(Uint8Array.from([1, 2, 3, 4]), 5)).toBeNull();
    expect(withWebmDuration(bytes(EBML, SEGMENT.slice(0, 6)), 5)).toBeNull();
  });
});
