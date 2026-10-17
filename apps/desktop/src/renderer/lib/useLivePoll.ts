import { nextMeeting } from '@classroom/protocol';
import { useEffect, useRef } from 'react';
import { callService } from './call';
import { useStore } from './store';

const EVERY_MS = 2 * 60_000;
const SOON_MS = 30 * 60_000;

/**
 * Keeps the green "live" dots current. To stay well inside the free request allowance it only asks
 * about spaces meeting now or within 30 minutes, every 2 minutes, and only while the app is visible.
 */
export function useLivePoll(skip: string | null) {
  const { data, live, setLive } = useStore();
  const latest = useRef({ data, live, setLive, skip });
  latest.current = { data, live, setLive, skip };

  useEffect(() => {
    const poll = async () => {
      const { data, setLive, skip } = latest.current;
      if (!data || document.hidden) return;
      const now = new Date();
      const soon = [...data.spaces, ...data.joined].filter((s) => {
        const next = s.schedule && nextMeeting(s.schedule, now);
        return next && next.start.getTime() - now.getTime() < SOON_MS;
      });
      // Also re-check anything shown as live, so dots clear when a call ends.
      const codes = [...new Set([...soon.map((s) => s.code), ...latest.current.live])].filter((c) => c !== skip);
      if (!codes.length) return;
      const liveNow = await callService.liveRooms(codes);
      for (const code of codes) setLive(code, liveNow.has(code));
    };
    void poll();
    const id = setInterval(poll, EVERY_MS);
    const onVisible = () => !document.hidden && void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
