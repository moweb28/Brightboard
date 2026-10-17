import type { JoinInfo } from '@classroom/protocol';
import { DoorOpen, Home as HomeIcon, UserMinus, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui';
import { callService, toCallError } from '../lib/call';
import { useNavigate } from '../lib/nav';
import { DisconnectReason, RoomEvent, RoomProvider, type Participant, type Room } from '../lib/rtc';
import { useSettings, useT } from '../lib/settings';
import { useStore } from '../lib/store';
import { metaOf } from './participants';
import { PreJoin, type JoinChoices } from './PreJoin';
import { RoomView } from './RoomView';

type Phase =
  | { name: 'prejoin' }
  | { name: 'connecting' }
  | { name: 'live'; room: Room; choices: JoinChoices }
  | { name: 'ended'; reason?: DisconnectReason; error?: string };

export function Meeting({ join, password }: { join: JoinInfo; password?: string }) {
  const t = useT();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ name: 'prejoin' });
  const goHome = () => navigate({ name: 'home' });

  const enter = async (choices: JoinChoices) => {
    setPhase({ name: 'connecting' });
    const room = callService.createRoom(join, { micId: settings.micId || undefined, cameraId: settings.cameraId || undefined, speakerId: settings.speakerId || undefined });
    room.on(RoomEvent.Disconnected, (reason: DisconnectReason) => setPhase({ name: 'ended', reason }));
    try {
      await room.connect();
      setPhase({ name: 'live', room, choices });
    } catch (e) {
      setPhase({ name: 'ended', error: toCallError(e).code });
    }
  };

  if (phase.name === 'prejoin') return <PreJoin join={join} onJoin={enter} onCancel={goHome} />;
  if (phase.name === 'connecting')
    return (
      <div className="center-screen">
        <div className="spinner-wrap">
          <div className="waiting-pulse" aria-hidden />
          <p className="muted">{t.common.loading}</p>
        </div>
      </div>
    );
  if (phase.name === 'ended') return <Ended reason={phase.reason} error={phase.error} onHome={goHome} />;

  return (
    <RoomProvider room={phase.room} className="meeting">
      {join.role === 'host' && <CallHistory room={phase.room} join={join} />}
      <RoomView join={join} choices={phase.choices} password={password} />
    </RoomProvider>
  );
}

/** The admin's app keeps a local record of each call: when, how long, and who came. */
function CallHistory({ room, join }: { room: Room; join: JoinInfo }) {
  const { data, startCall, endCall, touchCall, addAttendee, setLive } = useStore();
  const saved = !!data?.spaces.some((s) => s.id === join.spaceId);
  const store = useRef({ endCall, touchCall, addAttendee });
  store.current = { endCall, touchCall, addAttendee };

  useEffect(() => {
    setLive(join.roomName, true);
    const callId = saved ? startCall(join.spaceId) : null;
    const add = (p: Participant) => callId && !metaOf(p).waiting && store.current.addAttendee(callId, p.name);
    for (const p of room.remoteParticipants.values()) add(p);
    const onMeta = (_prev: string, p: Participant) => !p.isLocal && add(p);
    room.on(RoomEvent.ParticipantConnected, add);
    room.on(RoomEvent.ParticipantMetadataChanged, onMeta);
    const heartbeat = callId ? setInterval(() => store.current.touchCall(callId), 60_000) : null;
    return () => {
      if (heartbeat) clearInterval(heartbeat);
      room.off(RoomEvent.ParticipantConnected, add);
      room.off(RoomEvent.ParticipantMetadataChanged, onMeta);
      if (callId) store.current.endCall(callId);
      setLive(join.roomName, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  return null;
}

function Ended({ reason, error, onHome }: { reason?: DisconnectReason; error?: string; onHome: () => void }) {
  const t = useT();
  const text = error
    ? (t.errors[error] ?? t.errors.generic)
    : reason === DisconnectReason.ROOM_DELETED
      ? t.meeting.ended
      : reason === DisconnectReason.PARTICIPANT_REMOVED
        ? t.meeting.removed
        : reason === DisconnectReason.CONNECTION_LOST
          ? t.errors.offline
          : t.meeting.disconnected;
  const Icon = reason === DisconnectReason.PARTICIPANT_REMOVED ? UserMinus : error || reason === DisconnectReason.CONNECTION_LOST ? WifiOff : DoorOpen;
  return (
    <div className="center-screen">
      <div className="card card-pad ended">
        <span className="done-icon">
          <Icon size={34} />
        </span>
        <h1>{text}</h1>
        <Button size="lg" icon={HomeIcon} onClick={onHome} autoFocus>
          {t.nav.home}
        </Button>
      </div>
    </div>
  );
}
