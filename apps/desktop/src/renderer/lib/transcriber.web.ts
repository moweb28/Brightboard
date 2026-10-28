import type { TranscriptLine } from '@classroom/protocol';

/**
 * The website stand-in for transcriber.ts: transcripts are made by the desktop app only (its speech
 * model alone is bigger than a website may serve), so this one is never started.
 */
export type TranscriptMode = 'me' | 'everyone';
export type TranscriptModel = 'standard' | 'accurate';
export type TranscriberStatus = { phase: 'loading'; loaded: number; total: number } | { phase: 'running'; device: string } | { phase: 'error'; message: string };

export class SessionTranscriber {
  lines: TranscriptLine[] = [];
  constructor(..._args: unknown[]) {}
  async start(): Promise<void> {
    throw new Error('Transcripts need the desktop app');
  }
  async stop(): Promise<TranscriptLine[]> {
    return [];
  }
}
