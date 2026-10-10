/**
 * MediaRecorder streams WebM without a Duration, so players show recordings as "live" with no length.
 * Given the start of a finished file, returns a patched prefix with Duration added to the Segment Info,
 * and how many original bytes it replaces. Returns null if the file isn't WebM or already has one.
 */
const EBML_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const TIMECODE_SCALE_ID = 0x2ad7b1;
const DURATION_ID = 0x4489;

interface Vint {
  value: number;
  length: number;
  unknown: boolean;
}

function vint(buf: Uint8Array, at: number, keepMarker: boolean): Vint | null {
  const first = buf[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23; // leading zeros within the byte, plus one
  if (at + length > buf.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + buf[at + i];
    if (buf[at + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function element(buf: Uint8Array, at: number) {
  const id = vint(buf, at, true);
  if (!id) return null;
  const size = vint(buf, at + id.length, false);
  if (!size) return null;
  const dataStart = at + id.length + size.length;
  return { id: id.value, dataStart, size: size.unknown ? null : size.value, end: size.unknown ? null : dataStart + size.value };
}

function sizeVint(value: number, width: number) {
  const out = new Uint8Array(width);
  let v = value;
  for (let i = width - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] |= 0x80 >> (width - 1);
  return out;
}

export function withWebmDuration(head: Uint8Array, durationMs: number): { bytes: Uint8Array; replaced: number } | null {
  const ebml = element(head, 0);
  if (!ebml || ebml.id !== EBML_ID || ebml.end === null) return null;
  const segment = element(head, ebml.end);
  if (!segment || segment.id !== SEGMENT_ID) return null;

  // Find Info among the Segment's first children (SeekHead / Void may come before it).
  let at = segment.dataStart;
  let info: NonNullable<ReturnType<typeof element>> | null = null;
  while (at < head.length) {
    const el = element(head, at);
    if (!el || el.end === null) return null;
    if (el.id === INFO_ID) {
      info = el;
      break;
    }
    at = el.end;
  }
  if (!info || info.end === null || info.end > head.length) return null;

  let scale = 1_000_000;
  for (let p = info.dataStart; p < info.end; ) {
    const el = element(head, p);
    if (!el || el.end === null) return null;
    if (el.id === DURATION_ID) return null;
    if (el.id === TIMECODE_SCALE_ID) {
      scale = 0;
      for (let i = el.dataStart; i < el.end; i++) scale = scale * 256 + head[i];
    }
    p = el.end;
  }

  const duration = new Uint8Array(11);
  duration.set([0x44, 0x89, 0x88]);
  new DataView(duration.buffer).setFloat64(3, (durationMs * 1_000_000) / (scale || 1_000_000));

  const idLength = vint(head, at, true)!.length;
  const oldSizeWidth = info.dataStart - at - idLength;
  const newSize = info.size! + duration.length;
  const width = newSize < 2 ** (7 * oldSizeWidth) - 1 ? oldSizeWidth : 8;

  const body = head.subarray(info.dataStart, info.end);
  const size = sizeVint(newSize, width);
  const bytes = new Uint8Array(at + idLength + width + body.length + duration.length);
  bytes.set(head.subarray(0, at + idLength), 0);
  bytes.set(size, at + idLength);
  bytes.set(body, at + idLength + width);
  bytes.set(duration, at + idLength + width + body.length);
  return { bytes, replaced: info.end };
}
