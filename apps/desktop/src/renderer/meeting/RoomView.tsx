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
  FileText,
  Presentation,
  CircleDot,
  MousePointer2,
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
import { useRecording } from './useRecording';
import { useTranscript } from './useTranscript';
import { TranscriptPanel } from './TranscriptPanel';
import { useRemote } from './useRemote';
import { Board } from './board/Board';
import { useBoardSync } from './board/useBoardSync';

interface Props {
  join: JoinInfo;
  choices: JoinChoices;
  invitePassword?: string;
}

export function RoomView({ join, choices, invitePassword }: Props) {
  const t = useT();
  const toast = useToast();
  const { settings } = useSettings();
  const room = useRoomContext();
  const connection = useConnectionState();
  useRoomVersion(room);
  const local = room.localParticipant;
  const meta = roomMetaOf(room);
  const amHost = join.role === 'host';
  const waiting = isWaiting(local);
  const moderate = useModerate(join.spaceId);

  const [panel, setPanel] = useState<'chat' | 'people' | 'transcript' | null>(null);
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
  const remote = useRemote(room);
  const boardSync = useBoardSync(room, amHost);
  const rec = useRecording(room, join, connection, moderate);
  const tx = useTranscript(room, join, moderate);
  const [dontAskRecord, setDontAskRecord] = useState(false);

  // Clock in the header.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Publish mic/camera once connected and admitted (waiting guests can't publish yet).
  const published = useRef(false);
  useEffect(() => {
    if (connection !== ConnectionState.Connected || waiting || published.current) return;
    published.current = true;
    const startMuted = !amHost && meta.muteOnJoin;
    local.setMicrophoneEnabled(choices.mic && !startMuted).catch(() => toast({ icon: MicOff, text: t.meeting.micBlocked, tone: 'warn' }));
    local.setCameraEnabled(choices.cam).catch(() => toast({ icon: VideoOff, text: t.meeting.cameraBlocked, tone: 'warn' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, waiting]);

  // Camera background effect follows the setting.
  const cameraTrack = local.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack | undefined;
  useEffect(() => {
    if (cameraTrack) applyBackground(cameraTrack, settings.background);
  }, [cameraTrack, settings.background]);

  // Guests: tell the host when the app is not in focus.
  useEffect(() => {
    if (amHost || waiting) return;
    const update = () => local.setAttributes({ away: document.hasFocus() && !document.hidden ? '' : '1' }).catch(() => undefined);
    window.addEventListener('blur', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('blur', update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [amHost, waiting, local]);

  // Notifications for joins, waiting room, raised hands and being muted.
  useEffect(() => {
    const onJoin = (p: Participant) => {
      if (isWaiting(p)) {
        if (amHost) {
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
      if (p.isLocal && pub.source === Track.Source.Microphone && !selfMuting.current && !amHost) toast({ icon: MicOff, text: t.meeting.mutedByHost, tone: 'warn' });
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantAttributesChanged, onAttrs);
    room.on(RoomEvent.TrackMuted, onMuted);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoin);
      room.off(RoomEvent.ParticipantAttributesChanged, onAttrs);
      room.off(RoomEvent.TrackMuted, onMuted);
    };
  }, [room, amHost, t, toast, moderate]);

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

  const leave = async () => {
    await Promise.all([rec.stop(), tx.stop()]);
    room.disconnect();
  };
  const endForAll = async () => {
    await Promise.all([rec.stop(), tx.stop()]);
    await api.end(join.spaceId).catch(() => undefined);
    room.disconnect();
  };

  const guestsWaiting = amHost ? allParticipants(room).filter(isWaiting).length : 0;
  const people = allParticipants(room).filter((p) => !isWaiting(p)).length;
  const chatAllowed = amHost || meta.chatEnabled;

  if (waiting) {
    return (
      <div className="center-screen">
        <div className="card card-pad ended waiting-card">
          <Logo />
          <div className="waiting-pulse" aria-hidden />
          <h1>{t.meeting.waitingTitle}</h1>
          <p className="muted">{t.meeting.waitingText}</p>
          <p className="muted small">{join.spaceTitle}</p>
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
        <div className="chip chip-title">
          <span className="chip-emoji">{join.spaceEmoji}</span>
          <strong>{join.spaceTitle}</strong>
          <span className="chip-sep" aria-hidden />
          <span className="live-dot" aria-hidden />
          <span dir="ltr">{formatDuration(Date.now() - startedAt)}</span>
        </div>
        <span className="chip chip-code" dir="ltr">
          {formatRoomCode(join.roomName)}
        </span>
        {meta.recording && (
          <span className="chip chip-rec">
            <span className="rec-dot" aria-hidden /> {t.recording.chip}
          </span>
        )}
        {meta.transcribing && (
          <span className="chip">
            <FileText size={14} /> {t.transcript.chip}
          </span>
        )}
        {meta.locked && (
          <span className="chip chip-warn">
            <Lock size={14} /> {t.meeting.locked}
          </span>
        )}
        {connection === ConnectionState.Reconnecting && (
          <span className="chip chip-warn">
            <WifiOff size={14} /> {t.meeting.reconnecting}
          </span>
        )}
        {local.isScreenShareEnabled && (
          <span className="chip chip-accent">
            <MonitorUp size={14} /> {t.meeting.youArePresenting}
            <button className="chip-action" onClick={toggleShare}>
              {t.meeting.stopShare}
            </button>
          </span>
        )}
        {remote.controller && (
          <span className="chip chip-danger">
            <MousePointer2 size={14} /> {t.remote.overlay(remote.controller.name)}
            <button className="chip-action" onClick={remote.stopBeingControlled}>
              {t.remote.overlayStop}
            </button>
          </span>
        )}
        <div className="spacer" />
        {amHost && (
          <Button size="sm" icon={Send} onClick={() => setInviteOpen(true)}>
            {t.meeting.invite}
          </Button>
        )}
      </header>

      <div className="room-body">
        <div className="room-stage">
          <Stage room={room} meta={meta} layout={layout} amHost={amHost} pinned={pinned} setPinned={setPinned} moderate={moderate}
            remote={remote}
            board={
              meta.boardOpen ? (
                <Board
                  sync={boardSync}
                  title={join.spaceTitle}
                  amHost={amHost}
                  locked={meta.boardLocked}
                  onClose={() => moderate({ action: 'board', value: false })}
                  onToggleLock={() => moderate({ action: 'boardLock', value: !meta.boardLocked })}
                />
              ) : undefined
            }
          />
          <ReactionLayer items={reactions.items} />
        </div>
        {panel === 'chat' && <ChatPanel room={room} chat={chat} canSend={chatAllowed} onClose={() => setPanel(null)} />}
        {panel === 'transcript' && <TranscriptPanel tx={tx} onClose={() => setPanel(null)} />}
        {panel === 'people' && <PeoplePanel room={room} spaceId={join.spaceId} meta={meta} amHost={amHost} pinned={pinned} setPinned={setPinned} moderate={moderate} onClose={() => setPanel(null)} />}
      </div>

      <footer className="dock-wrap">
        <nav className="dock" aria-label={t.meeting.settings}>
          <Ctrl icon={local.isMicrophoneEnabled ? Mic : MicOff} label={local.isMicrophoneEnabled ? t.meeting.micOn : t.meeting.micOff} off={!local.isMicrophoneEnabled} onClick={toggleMic} />
          <Ctrl icon={local.isCameraEnabled ? Video : VideoOff} label={local.isCameraEnabled ? t.meeting.cameraOn : t.meeting.cameraOff} off={!local.isCameraEnabled} onClick={toggleCam} />
          <Ctrl icon={local.isScreenShareEnabled ? MonitorX : MonitorUp} label={local.isScreenShareEnabled ? t.meeting.stopShare : t.meeting.share} active={local.isScreenShareEnabled} onClick={toggleShare} />
          <span className="dock-sep" aria-hidden />
          {!amHost && <Ctrl icon={Hand} label={handUp(local) ? t.meeting.lowerHand : t.meeting.raiseHand} active={handUp(local)} onClick={toggleHand} />}
          <Menu
            up
            align="start"
            trigger={(open, isOpen) => <Ctrl icon={SmilePlus} label={t.meeting.react} active={isOpen} onClick={open} />}
            items={QUICK_REACTIONS.map((e) => ({ label: e, onClick: () => reactions.send(e) }))}
          />
          {amHost && <Ctrl icon={Presentation} label={meta.boardOpen ? t.board.close : t.board.open} active={meta.boardOpen} onClick={() => moderate({ action: 'board', value: !meta.boardOpen })} />}
          <Ctrl icon={MessageSquare} label={t.meeting.chat} active={panel === 'chat'} badge={chat.unread} onClick={() => setPanel(panel === 'chat' ? null : 'chat')} />
          <Ctrl icon={Users} label={t.meeting.people} active={panel === 'people'} badge={guestsWaiting} count={people} onClick={() => setPanel(panel === 'people' ? null : 'people')} />
          <span className="dock-sep" aria-hidden />
          <Ctrl icon={layout === 'grid' ? SquareUserRound : LayoutGrid} label={layout === 'grid' ? t.meeting.speaker : t.meeting.grid} onClick={() => setLayout(layout === 'grid' ? 'speaker' : 'grid')} />
          {tx.available && (
            <Ctrl icon={FileText} label={t.transcript.title} active={panel === 'transcript' || tx.running} onClick={() => setPanel(panel === 'transcript' ? null : 'transcript')} />
          )}
          {rec.available && (
            <Ctrl icon={CircleDot} label={rec.recording ? t.recording.stop : t.recording.record} active={rec.recording} rec onClick={() => (rec.recording ? rec.stop() : rec.start())} />
          )}
          <Ctrl icon={SettingsIcon} label={t.meeting.settings} onClick={() => setDevicesOpen(true)} />
          {amHost ? (
            <Menu
              up
              trigger={(open) => <LeaveButton label={t.meeting.leave} onClick={open} />}
              items={[
                { icon: LogOut, label: t.meeting.leaveSpace, onClick: leave },
                { icon: PhoneOff, label: t.meeting.endForAll, onClick: endForAll, danger: true },
              ]}
            />
          ) : (
            <LeaveButton label={t.meeting.leave} onClick={leave} />
          )}
        </nav>
      </footer>

      {rec.asking && (
        <Modal
          title={t.recording.promptTitle}
          onClose={() => rec.answer(false, dontAskRecord)}
          footer={
            <>
              <Button variant="ghost" onClick={() => rec.answer(false, dontAskRecord)}>
                {t.recording.notNow}
              </Button>
              <Button icon={CircleDot} onClick={() => rec.answer(true, dontAskRecord)} autoFocus>
                {t.recording.start}
              </Button>
            </>
          }
        >
          <div className="stack">
            <p className="muted">{t.recording.promptText}</p>
            <label className="check-row">
              <input type="checkbox" checked={dontAskRecord} onChange={(e) => setDontAskRecord(e.target.checked)} />
              {t.recording.dontAsk}
            </label>
          </div>
        </Modal>
      )}
      {remote.incoming && (
        <Modal
          title={t.remote.askTitle(remote.incoming.name)}
          onClose={() => remote.answer(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => remote.answer(false)}>
                {t.remote.deny}
              </Button>
              <Button icon={MousePointer2} onClick={() => remote.answer(true)} autoFocus>
                {t.remote.allow}
              </Button>
            </>
          }
        >
          <p className="muted">{t.remote.askText}</p>
        </Modal>
      )}
      {picker && <ScreenPicker onCancel={() => setPicker(false)} onShare={shareSource} />}
      {devicesOpen && <MeetingSettings room={room} onClose={() => setDevicesOpen(false)} />}
      {inviteOpen && (
        <Modal title={t.space.invite} onClose={() => setInviteOpen(false)}>
          <InviteBox space={{ id: join.spaceId, code: join.roomName, title: join.spaceTitle, password: invitePassword }} />
        </Modal>
      )}
    </div>
  );
}

function LeaveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="dock-leave" onClick={onClick}>
      <PhoneOff size={18} strokeWidth={2.4} />
      <span>{label}</span>
    </button>
  );
}

/** Round dock button; the label shows as a tooltip above it. */
function Ctrl({ icon: Icon, label, onClick, off, active, rec, badge, count }: { icon: LucideIcon; label: string; onClick: () => void; off?: boolean; active?: boolean; rec?: boolean; badge?: number; count?: number }) {
  return (
    <button className={`dock-btn ${off ? 'is-off' : ''} ${active ? 'is-active' : ''} ${rec ? 'is-rec' : ''}`} onClick={onClick} aria-pressed={active} aria-label={label} data-tip={label}>
      <Icon size={21} strokeWidth={2.2} />
      {!!badge && <span className="dock-badge">{badge > 99 ? '99+' : badge}</span>}
      {!badge && count !== undefined && <span className="dock-count">{count}</span>}
    </button>
  );
}
