import type { ModerateAction, RoomMeta } from '@classroom/protocol';
import { Track, type Participant } from 'livekit-client';
import { MicOff, MonitorOff, MonitorUp, Pin, PinOff, Star, StarOff, UserMinus, VideoOff } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useToast } from '../components/toast';
import type { MenuItem } from '../components/ui';
import { api } from '../lib/api';
import type { Dict } from '../lib/i18n';
import { useT } from '../lib/settings';
import { canShareScreen, isHost, nameOf } from './participants';

/** Stable across renders, so hooks that depend on it don't re-run their effects. */
export function useModerate(spaceId: number) {
  const toast = useToast();
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  return useCallback(
    async (action: ModerateAction) => {
      try {
        await api.moderate(spaceId, action);
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'generic';
        toast({ text: tRef.current.errors[code] ?? tRef.current.errors.generic, tone: 'warn' });
      }
    },
    [spaceId, toast],
  );
}

interface Ctx {
  t: Dict;
  amHost: boolean;
  meta: RoomMeta;
  pinned: string | null;
  setPinned: (id: string | null) => void;
  moderate: (a: ModerateAction) => void;
}

/** Menu items for a participant (tile or people list). Teachers get moderation; everyone can pin. */
export function participantActions(p: Participant, { t, amHost, meta, pinned, setPinned, moderate }: Ctx): MenuItem[] {
  const target = !p.isLocal && !isHost(p) && amHost;
  const micOn = p.isMicrophoneEnabled;
  const camOn = p.getTrackPublication(Track.Source.Camera)?.isMuted === false;
  return [
    { icon: pinned === p.identity ? PinOff : Pin, label: pinned === p.identity ? t.meeting.unpin : t.meeting.pin, onClick: () => setPinned(pinned === p.identity ? null : p.identity) },
    {
      icon: meta.spotlight === p.identity ? StarOff : Star,
      label: meta.spotlight === p.identity ? t.meeting.unspotlight : t.meeting.spotlight,
      onClick: () => moderate({ action: 'spotlight', identity: meta.spotlight === p.identity ? null : p.identity }),
      hidden: !amHost,
    },
    { icon: MicOff, label: t.meeting.mute, onClick: () => moderate({ action: 'mute', identity: p.identity }), hidden: !target || !micOn },
    { icon: VideoOff, label: t.meeting.stopVideo, onClick: () => moderate({ action: 'stopVideo', identity: p.identity }), hidden: !target || !camOn },
    {
      icon: canShareScreen(p) ? MonitorOff : MonitorUp,
      label: canShareScreen(p) ? t.meeting.disallowShare : t.meeting.allowShare,
      onClick: () => moderate({ action: 'allowShare', identity: p.identity, value: !canShareScreen(p) }),
      hidden: !target,
    },
    {
      icon: UserMinus,
      label: t.meeting.remove,
      danger: true,
      onClick: () => confirm(t.meeting.removeConfirm(nameOf(p))) && moderate({ action: 'remove', identity: p.identity }),
      hidden: !target,
    },
  ];
}

