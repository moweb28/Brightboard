import type { JoinInfo } from '@classroom/protocol';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { DisconnectReason, VideoPresets, type RoomOptions } from 'livekit-client';
import { DoorOpen, Home as HomeIcon, UserMinus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useNavigate } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { PreJoin, type JoinChoices } from './PreJoin';
import { RoomView } from './RoomView';

type Phase = { name: 'prejoin' } | { name: 'live'; choices: JoinChoices } | { name: 'ended'; reason?: DisconnectReason };

export function Meeting({ join, invitePassword }: { join: JoinInfo; invitePassword?: string }) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ name: 'prejoin' });
  const goHome = () => navigate(user ? { name: 'home' } : { name: 'welcome' });

  const options = useMemo<RoomOptions>(
    () => ({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { deviceId: settings.cameraId || undefined, resolution: VideoPresets.h720.resolution },
      audioCaptureDefaults: { deviceId: settings.micId || undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      audioOutput: settings.speakerId ? { deviceId: settings.speakerId } : undefined,
    }),
    // Devices are read once when joining; in-class changes go through switchActiveDevice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (phase.name === 'prejoin') return <PreJoin join={join} onJoin={(choices) => setPhase({ name: 'live', choices })} onCancel={goHome} />;
  if (phase.name === 'ended') return <Ended reason={phase.reason} onHome={goHome} />;

  return (
    <LiveKitRoom
      serverUrl={join.url}
      token={join.token}
      connect
      audio={false}
      video={false}
      options={options}
      onDisconnected={(reason) => setPhase({ name: 'ended', reason })}
      className="meeting"
    >
      <RoomView join={join} choices={phase.choices} invitePassword={invitePassword} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function Ended({ reason, onHome }: { reason?: DisconnectReason; onHome: () => void }) {
  const t = useT();
  const text =
    reason === DisconnectReason.ROOM_DELETED ? t.meeting.ended : reason === DisconnectReason.PARTICIPANT_REMOVED ? t.meeting.removed : t.meeting.disconnected;
  const Icon = reason === DisconnectReason.PARTICIPANT_REMOVED ? UserMinus : DoorOpen;
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
