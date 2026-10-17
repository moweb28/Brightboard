import { formatTranscript, type JoinInfo, type ModerateAction, type TranscriptLine } from '@classroom/protocol';
import { RoomEvent, type Participant, type Room } from '../lib/rtc';
import { FileText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/toast';
import { useSettings } from '../lib/settings';
import { SessionTranscriber, type TranscriberStatus } from '../lib/transcriber';
import { allParticipants, isWaiting, nameOf } from './participants';

export interface Transcript {
  available: boolean;
  running: boolean;
  status: TranscriberStatus | null;
  lines: TranscriptLine[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Admin-only local transcript; saved as a .txt in Documents/Brightboard when stopped or when leaving. */
export function useTranscript(room: Room, join: JoinInfo, moderate: (a: ModerateAction) => void): Transcript {
  const { t, settings } = useSettings();
  const toast = useToast();
  const available = join.role === 'host' && !!window.brightboard && typeof Worker !== 'undefined';
  const tx = useRef<SessionTranscriber | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<TranscriberStatus | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const startedAt = useRef<Date>(new Date());
  const attendees = useRef(new Set<string>());
  const tRef = useRef(t);
  tRef.current = t;
  const modeRef = useRef(settings.transcriptMode);

  // Everyone who was in the call while transcribing goes in the file header.
  useEffect(() => {
    if (!running) return;
    for (const p of allParticipants(room)) if (!isWaiting(p)) attendees.current.add(nameOf(p));
    const add = (p: Participant) => void (!isWaiting(p) && attendees.current.add(nameOf(p)));
    const onMeta = (_m: string | undefined, p: Participant) => add(p);
    room.on(RoomEvent.ParticipantConnected, add);
    room.on(RoomEvent.ParticipantMetadataChanged, onMeta);
    return () => {
      room.off(RoomEvent.ParticipantConnected, add);
      room.off(RoomEvent.ParticipantMetadataChanged, onMeta);
    };
  }, [room, running]);

  const start = useCallback(async () => {
    if (tx.current) return;
    startedAt.current = new Date();
    attendees.current = new Set();
    setLines([]);
    modeRef.current = settings.transcriptMode;
    const session = new SessionTranscriber(room, settings.transcriptMode, settings.transcriptModel, (line) => setLines((l) => [...l, line]), setStatus);
    tx.current = session;
    setRunning(true);
    if (settings.transcriptMode === 'everyone') moderate({ action: 'transcribing', value: true });
    try {
      await session.start();
      startedAt.current = new Date(); // listening starts now (after any model download)
    } catch (e) {
      console.error('transcript failed', e);
      tx.current = null;
      setRunning(false);
      setStatus({ phase: 'error', message: String(e) });
      if (settings.transcriptMode === 'everyone') moderate({ action: 'transcribing', value: false });
      toast({ icon: FileText, text: tRef.current.transcript.failed, tone: 'warn' });
    }
  }, [room, settings.transcriptMode, settings.transcriptModel, moderate, toast]);

  const stop = useCallback(async () => {
    const session = tx.current;
    if (!session) return;
    tx.current = null;
    setRunning(false);
    if (modeRef.current === 'everyone') moderate({ action: 'transcribing', value: false });
    const all = await session.stop();
    setStatus(null);
    if (!all.length) return;
    const text = formatTranscript({ title: join.spaceTitle, startedAt: startedAt.current, endedAt: new Date(), attendees: [...attendees.current], lines: all });
    const path = await window.brightboard!.files.saveTranscript(join.spaceTitle, startedAt.current.getTime(), text);
    toast({ icon: FileText, text: tRef.current.transcript.saved, tone: 'success', action: { label: tRef.current.transcript.show, onClick: () => window.brightboard?.files.reveal(path) } });
  }, [join.spaceTitle, moderate, toast]);

  // Leaving the call saves whatever was transcribed. Runs on unmount only.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => void stopRef.current(), []);

  // Test hook (dev builds only): play a clip into the call as this user's microphone.
  if (import.meta.env.DEV)
    (window as unknown as { __playAsMic?: (b64: string) => Promise<number> }).__playAsMic = async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(bytes.buffer);
      const dest = ctx.createMediaStreamDestination();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(dest);
      const { Track } = await import('../lib/rtc');
      await room.localParticipant.publishTrack(dest.stream.getAudioTracks()[0], { source: Track.Source.Microphone, name: 'test-clip' });
      setTimeout(() => src.start(), 500);
      return buffer.duration;
    };

  return { available, running, status, lines, start, stop };
}
