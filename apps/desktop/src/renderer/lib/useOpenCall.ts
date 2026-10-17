import type { Space } from '@classroom/protocol';
import { useCallback } from 'react';
import { useToast } from '../components/toast';
import { callService, toCallError } from './call';
import { useNavigate } from './nav';
import { useT } from './settings';
import { useStore } from './store';

/** Start your own space as admin, or join someone else's by code. Errors become a toast and `false`. */
export function useOpenCall() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, rememberJoined } = useStore();
  const profile = data?.profile;

  return useCallback(
    async (target: { admin: Space } | { code: string; password?: string }) => {
      if (!profile) return false;
      const password = 'admin' in target ? undefined : (target.password ?? data?.joined.find((j) => j.code === target.code)?.password);
      try {
        const { join, space } = await callService.open({
          code: 'admin' in target ? target.admin.code : target.code,
          admin: 'admin' in target ? target.admin : undefined,
          password,
          name: profile.name,
          picture: profile.picture,
          color: profile.color,
        });
        // Someone else's space goes on your list (with its schedule), so it shows in the rail and Upcoming.
        if (!('admin' in target)) rememberJoined(target.code, space, password);
        navigate({ name: 'meeting', join, password: 'admin' in target ? target.admin.password : undefined });
        return true;
      } catch (e) {
        const { code } = toCallError(e);
        // No password typed yet: open the join screen to ask for it. A typed one that's wrong gets a message.
        if (code === 'wrongPassword' && !('admin' in target) && !password) navigate({ name: 'join', code: target.code });
        else toast({ text: t.errors[code] ?? t.errors.generic, tone: 'warn' });
        return false;
      }
    },
    [profile, data?.joined, navigate, toast, t, rememberJoined],
  );
}
