import { describe, expect, it } from 'vitest';
import { formatTranscript, SpeechChunker } from '../src/transcript';

const RATE = 16000;
const tone = (ms: number, amp = 0.2) => Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => amp * Math.sin(i / 5));
const silence = (ms: number) => new Float32Array((RATE * ms) / 1000);

describe('SpeechChunker', () => {
  it('cuts a chunk at the first pause after speech', () => {
    const c = new SpeechChunker(RATE);
    expect(c.push(tone(2000))).toBeNull();
    const chunk = c.push(silence(800));
    expect(chunk).not.toBeNull();
    expect(chunk!.audio.length).toBeGreaterThanOrEqual(RATE * 2);
    expect(chunk!.startMs).toBe(0);
  });

  it('ignores pure silence and very short blips', () => {
    const c = new SpeechChunker(RATE);
    expect(c.push(silence(3000))).toBeNull();
    expect(c.push(tone(150))).toBeNull();
    expect(c.push(silence(1000))).toBeNull();
  });

  it('never lets a chunk grow past the maximum length', () => {
    const c = new SpeechChunker(RATE, { maxChunkMs: 5000 });
    let chunk = null;
    for (let i = 0; i < 10 && !chunk; i++) chunk = c.push(tone(1000));
    expect(chunk).not.toBeNull();
    expect(chunk!.audio.length).toBeLessThanOrEqual(RATE * 5.5);
  });

  it('reports when each chunk started, relative to the first sample', () => {
    const c = new SpeechChunker(RATE);
    c.push(silence(3000));
    c.push(tone(1500));
    const chunk = c.push(silence(800))!;
    expect(chunk.startMs).toBeGreaterThanOrEqual(2600);
    expect(chunk.startMs).toBeLessThanOrEqual(3000);
  });

  it('flush returns leftover speech', () => {
    const c = new SpeechChunker(RATE);
    c.push(tone(1200));
    expect(c.flush()?.audio.length).toBeGreaterThan(0);
    expect(c.flush()).toBeNull();
  });
});

describe('formatTranscript', () => {
  it('writes a header and timestamped, named lines', () => {
    const text = formatTranscript({
      title: 'Algebra — Grade 9',
      startedAt: new Date(2026, 9, 8, 10, 0),
      endedAt: new Date(2026, 9, 8, 10, 45),
      attendees: ['Huda', 'Omar'],
      lines: [
        { atMs: 5_000, speaker: 'Huda', text: 'Good morning everyone.' },
        { atMs: 65_500, speaker: 'Omar', text: 'صباح الخير' },
        { atMs: 3_725_000, speaker: 'Huda', text: '  ' },
      ],
    });
    expect(text).toContain('Algebra — Grade 9');
    expect(text).toContain('Duration: 45 min');
    expect(text).toContain('Attendees: Huda, Omar');
    expect(text).toContain('[00:05] Huda: Good morning everyone.');
    expect(text).toContain('[01:05] Omar: صباح الخير');
    expect(text).not.toMatch(/Huda: \s*$/m);
  });

  it('uses h:mm:ss after an hour', () => {
    const text = formatTranscript({ title: 'x', startedAt: new Date(0), endedAt: new Date(0), attendees: [], lines: [{ atMs: 3_725_000, speaker: 'A', text: 'late' }] });
    expect(text).toContain('[1:02:05] A: late');
  });
});

describe('isLikelyHallucination', () => {
  it('drops the filler Whisper invents on silence', async () => {
    const { isLikelyHallucination } = await import('../src/transcript');
    for (const t of ['you', ' You. ', 'Thank you.', 'Thanks for watching!', '[Music]', '(silence)', '...', 'شكرا', 'شكرا لكم على المشاهدة']) {
      expect(isLikelyHallucination(t)).toBe(true);
    }
  });
  it('keeps real speech, even short answers', async () => {
    const { isLikelyHallucination } = await import('../src/transcript');
    for (const t of ['Yes.', 'Thank you, Omar, that was a great answer.', 'Page 12', 'نعم', 'صباح الخير']) {
      expect(isLikelyHallucination(t)).toBe(false);
    }
  });
});
