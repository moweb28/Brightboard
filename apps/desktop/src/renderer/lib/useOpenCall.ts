import type { Space } from '@classroom/protocol';
import { useCallback } from 'react';
import { useToast } from '../components/toast';
import { CallError, callService } from './call';
import { useNavigate } from './nav';
import { useT } from './settings';
import { useStore } from './store';

/** Start your own space as admin, or join someone else's by code. Errors become a toast and `false`. */
export function useOpenCall() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { data } = useStore();
  const profile = data?.profile;

  return useCallback(
    async (target: { admin: Space } | { code: string; password?: string }) => {
      if (!profile) return false;
      try {
        const join = await callService.open({
          code: 'admin' in target ? target.admin.code : target.code,
          admin: 'admin' in target ? target.admin : undefined,
          password: 'password' in target ? target.password : undefined,
          name: profile.name,
          picture: profile.picture,
          color: profile.color,
        });
        navigate({ name: 'meeting', join, password: 'admin' in target ? target.admin.password : undefined });
        return true;
      } catch (e) {
        const code = e instanceof CallError ? e.code : 'generic';
        if (code === 'wrongPassword' && !('admin' in target)) navigate({ name: 'join', code: target.code });
        else toast({ text: t.errors[code] ?? t.errors.generic, tone: 'warn' });
        return false;
      }
    },
    [profile, navigate, toast, t],
  );
}
