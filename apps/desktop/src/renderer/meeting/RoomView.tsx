import { formatRoomCode, type JoinInfo } from '@classroom/protocol';
import { useConnectionState, useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent, Track, type LocalVideoTrack, type Participant, type TrackPublication } from 'livekit-client';
import {
  Hand,
  LayoutGrid,
  Lock,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Send,
  Settings as SettingsIcon,
  SmilePlus,
  SquareUserRound,
  Users,
  Video,
  VideoOff,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { InviteBox } from '../components/InviteBox';
import { Logo } from '../components/layout';
import { useToast } from '../components/toast';
import { Badge, Button, Menu, Modal } from '../components/ui';
import { api } from '../lib/api';
import { applyBackground } from '../lib/effects';
import { formatDuration } from '../lib/format';
import { useSettings, useT } from '../lib/settings';
import { sounds } from '../lib/sounds';
import { ChatPanel } from './ChatPanel';
import { MeetingSettings } from './MeetingSettings';
import { useModerate } from './moderation';
import { allParticipants, canShareScreen, handUp, isWaiting, nameOf, roomMetaOf, useRoomVersion } from './participants';
import { PeoplePanel } from './PeoplePanel';
import type { JoinChoices } from './PreJoin';
import { QUICK_REACTIONS, ReactionLayer, useReactions } from './Reactions';
import { ScreenPicker } from './ScreenPicker';
import { Stage, type Layout } from './Stage';
import { useChat } from './useChat';

interface Props {
  join: JoinInfo;
  choices: JoinChoices;
  inviteCode: string;
  invitePassword?: string;
}

export function RoomView({ join, choices, inviteCode, invitePassword }: Props) {
  const t = useT();
  const toast = useToast();
  const { settings } = useSettings();
  const room = useRoomContext();
  const connection = useConnectionState();
  useRoomVersion(room);
  const local = room.localParticipant;
  const meta = roomMetaOf(room);
  const amTeacher = join.role === 'teacher';
  const waiting = isWaiting(local);
  const moderate = useModerate(join.classId);

  const [panel, setPanel] = useState<'chat' | 'people' | null>(null);
  const [layout, setLayout] = useState<Layout>('grid');
  const [pinned, setPinned] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [startedAt] = useState(Date.now());
  const [, tick] = useState(0);
  const selfMuting = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const chat = useChat(room, panel === 'chat', (m) => {
    if (settingsRef.current.soundChat) sounds.chat();
    if (panel !== 'chat') toast({ icon: MessageSquare, text: `${m.fromName}: ${m.text.slice(0, 80)}`, action: { label: t.meeting.chat, onClick: () => setPanel('chat') } });
  });
  const reactions = useReactions(room);

  // Clock in the header.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Publish mic/camera once connected and admitted (waiting students can't publish yet).
  const published = useRef(false);
  useEffect(() => {
    if (connection !== ConnectionState.Connected || waiting || published.current) return;
    published.current = true;
    const startMuted = !amTeacher && meta.muteOnJoin;
    local.setMicrophoneEnabled(choices.mic && !startMuted).catch(() => toast({ icon: MicOff, text: t.meeting.micBlocked, tone: 'warn' }));
    local.setCameraEnabled(choices.cam).catch(() => toast({ icon: VideoOff, text: t.meeting.cameraBlocked, tone: 'warn' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, waiting]);

  // Camera background effect follows the setting.
  const cameraTrack = local.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack | undefined;
  useEffect(() => {
    if (cameraTrack) applyBackground(cameraTrack, settings.background);
  }, [cameraTrack, settings.background]);

  // Students: tell the teacher when the app is not in focus.
  useEffect(() => {
    if (amTeacher || waiting) return;
    const update = () => local.setAttributes({ away: document.hasFocus() && !document.hidden ? '' : '1' }).catch(() => undefined);
    window.addEventListener('blur', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('blur', update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [amTeacher, waiting, local]);

  // Notifications for joins, waiting room, raised hands and being muted.
  useEffect(() => {
    const onJoin = (p: Participant) => {
      if (isWaiting(p)) {
        if (amTeacher) {
          if (settingsRef.current.soundJoin) sounds.join();
          toast({ icon: Users, text: t.meeting.waitingToast(nameOf(p)), action: { label: t.meeting.admit, onClick: () => moderate({ action: 'admit', identity: p.identity }) } });
        }
        return;
      }
      if (settingsRef.current.soundJoin) sounds.join();
      toast({ icon: Users, text: t.meeting.joined(nameOf(p)) });
    };
    const onAttrs = (changed: Record<string, string>, p: Participant) => {
      if (changed.hand === '1' && !p.isLocal) {
        if (settingsRef.current.soundHand) sounds.hand();
        toast({ icon: Hand, text: t.meeting.handRaised(nameOf(p)) });
      }
    };
    const onMuted = (pub: TrackPublication, p: Participant) => {
      if (p.isLocal && pub.source === Track.Source.Microphone && !selfMuting.current && !amTeacher) toast({ icon: MicOff, text: t.meeting.mutedByTeacher, tone: 'warn' });
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantAttributesChanged, onAttrs);
    room.on(RoomEvent.TrackMuted, onMuted);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoin);
      room.off(RoomEvent.ParticipantAttributesChanged, onAttrs);
      room.off(RoomEvent.TrackMuted, onMuted);
    };
  }, [room, amTeacher, t, toast, moderate]);

  const toggleMic = async () => {
    selfMuting.current = true;
    await local.setMicrophoneEnabled(!local.isMicrophoneEnabled).catch(() => toast({ icon: MicOff, text: t.meeting.micBlocked, tone: 'warn' }));
    selfMuting.current = false;
  };
  const toggleCam = () => local.setCameraEnabled(!local.isCameraEnabled).catch(() => toast({ icon: VideoOff, text: t.meeting.cameraBlocked, tone: 'warn' }));
  const toggleHand = () => local.setAttributes({ hand: handUp(local) ? '' : '1' }).catch(() => undefined);

  const toggleShare = async () => {
    if (local.isScreenShareEnabled) return void local.setScreenShareEnabled(false);
    if (!canShareScreen(local)) return toast({ icon: MonitorX, text: t.meeting.noShareRights, tone: 'warn' });
    if (window.brightboard) setPicker(true);
    else local.setScreenShareEnabled(true, { audio: true }).catch(() => undefined);
  };
  const shareSource = async (id: string, audio: boolean) => {
    setPicker(false);
    await window.brightboard!.selectScreenSource(id);
    await local.setScreenShareEnabled(true, { audio, selfBrowserSurface: 'exclude', surfaceSwitching: 'exclude' }).catch(() => undefined);
  };

  const endForAll = async () => {
    await api.end(join.classId).catch(() => undefined);
    room.disconnect();
  };

  const studentsWaiting = amTeacher ? allParticipants(room).filter(isWaiting).length : 0;
  const people = allParticipants(room).filter((p) => !isWaiting(p)).length;
  const chatAllowed = amTeacher || meta.chatEnabled;

  if (waiting) {
    return (
      <div className="center-screen">
        <div className="card card-pad ended waiting-card">
          <Logo />
          <div className="waiting-pulse" aria-hidden />
          <h1>{t.meeting.waitingTitle}</h1>
          <p className="muted">{t.meeting.waitingText}</p>
          <p className="muted small">{join.classTitle}</p>
          <Button variant="secondary" icon={LogOut} onClick={() => room.disconnect()}>
            {t.meeting.leave}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="room">
      <header className="room-top">
        <Logo small />
        <div className="room-title">
          <strong>{join.classTitle}</strong>
          <span className="muted small" dir="ltr">
            {formatDuration(Date.now() - startedAt)}
          </span>
        </div>
        <span className="pill" dir="ltr">
          {formatRoomCode(join.roomName)}
        </span>
        {meta.locked && (
          <Badge tone="warn">
            <Lock size={13} /> {t.meeting.locked}
          </Badge>
        )}
        {connection === ConnectionState.Reconnecting && (
          <Badge tone="warn">
            <WifiOff size={13} /> {t.meeting.reconnecting}
          </Badge>
        )}
        <div className="spacer" />
        {amTeacher && (
          <Button size="sm" icon={Send} onClick={() => setInviteOpen(true)}>
            {t.meeting.invite}
          </Button>
        )}
      </header>

      {local.isScreenShareEnabled && (
        <div className="presenting-banner">
          <MonitorUp size={18} /> {t.meeting.youArePresenting}
          <Button size="sm" variant="danger" onClick={toggleShare}>
            {t.meeting.stopShare}
          </Button>
        </div>
      )}

      <div className="room-body">
        <div className="room-stage">
          <Stage room={room} meta={meta} layout={layout} amTeacher={amTeacher} pinned={pinned} setPinned={setPinned} moderate={moderate} />
          <ReactionLayer items={reactions.items} />
        </div>
        {panel === 'chat' && <ChatPanel room={room} chat={chat} canSend={chatAllowed} onClose={() => setPanel(null)} />}
        {panel === 'people' && <PeoplePanel room={room} classId={join.classId} meta={meta} amTeacher={amTeacher} pinned={pinned} setPinned={setPinned} moderate={moderate} onClose={() => setPanel(null)} />}
      </div>

      <footer className="control-bar">
        <div className="control-group">
          <Ctrl icon={local.isMicrophoneEnabled ? Mic : MicOff} label={local.isMicrophoneEnabled ? t.meeting.micOn : t.meeting.micOff} off={!local.isMicrophoneEnabled} onClick={toggleMic} />
          <Ctrl icon={local.isCameraEnabled ? Video : VideoOff} label={local.isCameraEnabled ? t.meeting.cameraOn : t.meeting.cameraOff} off={!local.isCameraEnabled} onClick={toggleCam} />
          <Ctrl icon={local.isScreenShareEnabled ? MonitorX : MonitorUp} label={local.isScreenShareEnabled ? t.meeting.stopShare : t.meeting.share} active={local.isScreenShareEnabled} onClick={toggleShare} />
          {!amTeacher && <Ctrl icon={Hand} label={handUp(local) ? t.meeting.lowerHand : t.meeting.raiseHand} active={handUp(local)} onClick={toggleHand} />}
          <Menu
            up
            align="start"
            trigger={(open, isOpen) => <Ctrl icon={SmilePlus} label={t.meeting.react} active={isOpen} onClick={open} />}
            items={QUICK_REACTIONS.map((e) => ({ label: e, onClick: () => reactions.send(e) }))}
          />
        </div>
        <div className="control-group">
          <Ctrl icon={MessageSquare} label={t.meeting.chat} active={panel === 'chat'} badge={chat.unread} onClick={() => setPanel(panel === 'chat' ? null : 'chat')} />
          <Ctrl icon={Users} label={t.meeting.people} active={panel === 'people'} badge={studentsWaiting} count={people} onClick={() => setPanel(panel === 'people' ? null : 'people')} />
          <Ctrl icon={layout === 'grid' ? SquareUserRound : LayoutGrid} label={layout === 'grid' ? t.meeting.speaker : t.meeting.grid} onClick={() => setLayout(layout === 'grid' ? 'speaker' : 'grid')} />
          <Ctrl icon={SettingsIcon} label={t.meeting.settings} onClick={() => setDevicesOpen(true)} />
        </div>
        <div className="control-group">
          {amTeacher ? (
            <Menu
              up
              trigger={(open) => <Ctrl icon={PhoneOff} label={t.meeting.leave} danger onClick={open} />}
              items={[
                { icon: LogOut, label: t.meeting.leaveClass, onClick: () => room.disconnect() },
                { icon: PhoneOff, label: t.meeting.endForAll, onClick: endForAll, danger: true },
              ]}
            />
          ) : (
            <Ctrl icon={PhoneOff} label={t.meeting.leave} danger onClick={() => room.disconnect()} />
          )}
        </div>
      </footer>

      {picker && <ScreenPicker onCancel={() => setPicker(false)} onShare={shareSource} />}
      {devicesOpen && <MeetingSettings room={room} onClose={() => setDevicesOpen(false)} />}
      {inviteOpen && (
        <Modal title={t.classPage.invitePeople} onClose={() => setInviteOpen(false)}>
          <InviteBox cls={{ id: join.classId, code: inviteCode, title: join.classTitle, joinPassword: invitePassword }} />
        </Modal>
      )}
    </div>
  );
}

function Ctrl({ icon: Icon, label, onClick, off, active, danger, badge, count }: { icon: LucideIcon; label: string; onClick: () => void; off?: boolean; active?: boolean; danger?: boolean; badge?: number; count?: number }) {
  return (
    <button className={`ctrl ${off ? 'is-off' : ''} ${active ? 'is-active' : ''} ${danger ? 'is-danger' : ''}`} onClick={onClick} aria-pressed={active} title={label}>
      <span className="ctrl-icon">
        <Icon size={22} strokeWidth={2.2} />
        {!!badge && <span className="ctrl-badge">{badge > 99 ? '99+' : badge}</span>}
        {!badge && count !== undefined && <span className="ctrl-count">{count}</span>}
      </span>
      <span className="ctrl-label">{label}</span>
    </button>
  );
}

