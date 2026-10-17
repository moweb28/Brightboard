import type { JoinInfo, ModerateAction } from '@classroom/protocol';
import { ConnectionState, type Room } from '../lib/rtc';
import { CircleDot, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/toast';
import { SessionRecorder } from '../lib/recorder';
import { useSettings } from '../lib/settings';

const REMINDER_MS = 5 * 60_000;

export interface Recording {
  available: boolean;
  recording: boolean;
  /** Show the "Record this session?" dialog. */
  asking: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  answer(record: boolean, dontAskAgain: boolean): void;
}

/** Admin-only session recording with a start-of-session prompt and a one-time reminder. */
export function useRecording(room: Room, join: JoinInfo, connection: ConnectionState, moderate: (a: ModerateAction) => void): Recording {
  const { t, settings, set } = useSettings();
  const toast = useToast();
  const available = join.role === 'host' && SessionRecorder.available();
  const recorder = useRef<SessionRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [asking, setAsking] = useState(false);
  const reminder = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  const start = useCallback(async () => {
    if (recorder.current) return;
    if (reminder.current) clearTimeout(reminder.current);
    const r = new SessionRecorder();
    recorder.current = r;
    try {
      await r.start(room, join.spaceTitle);
      // Stopped (or left the call) while the recorder was still starting: finish this file right away.
      if (recorder.current !== r) return void (await r.stop());
      setRecording(true);
      moderate({ action: 'recording', value: true });
    } catch (e) {
      console.error('recording failed', e);
      recorder.current = null;
      toast({ icon: CircleDot, text: tRef.current.recording.failed, tone: 'warn' });
    }
  }, [room, join.spaceTitle, moderate, toast]);

  const stop = useCallback(async () => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    setRecording(false);
    moderate({ action: 'recording', value: false });
    const path = await r.stop();
    if (path)
      toast({
        icon: CircleDot,
        text: tRef.current.recording.saved,
        tone: 'success',
        action: { label: tRef.current.recording.show, onClick: () => window.brightboard?.files.reveal(path) },
      });
  }, [moderate, toast]);

  // Once connected: record automatically, ask, or do nothing — per the admin's preference.
  const decided = useRef(false);
  useEffect(() => {
    if (!available || decided.current || connection !== ConnectionState.Connected) return;
    decided.current = true;
    if (settings.recordPrompt === 'always') void start();
    else if (settings.recordPrompt === 'ask' && !settings.noRecordAsk.includes(join.spaceId)) setAsking(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, connection]);

  // Leaving the call (or the call ending) always finishes the file. Runs on unmount only.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(
    () => () => {
      if (reminder.current) clearTimeout(reminder.current);
      void stopRef.current();
    },
    [],
  );

  return {
    available,
    recording,
    asking,
    start,
    stop,
    answer(record, dontAskAgain) {
      setAsking(false);
      if (dontAskAgain && !settings.noRecordAsk.includes(join.spaceId)) set('noRecordAsk', [...settings.noRecordAsk, join.spaceId]);
      if (record) return void start();
      // A single gentle nudge later on, in case they forgot.
      reminder.current = setTimeout(() => {
        if (recorder.current) return;
        toast({ icon: FolderOpen, text: tRef.current.recording.reminder, action: { label: tRef.current.recording.start, onClick: () => void start() } });
      }, REMINDER_MS);
    },
  };
}
