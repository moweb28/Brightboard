import { formatRoomCode, type JoinInfo } from '@classroom/protocol';
import { useConnectionState, useRoomContext } from '../lib/rtc';
import { ConnectionState, RoomEvent, Track, type Participant, type TrackPublication } from '../lib/rtc';
import {
  Hand,
  Lock,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  FileText,
  Presentation,
  ChevronUp,
  CircleDot,
  LayoutGrid,
  MoreHorizontal,
  SquareUserRound,
  MousePointer2,
  PhoneOff,
  Send,
  Settings as SettingsIcon,
  SmilePlus,
  Users,
  Video,
  VideoOff,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { InviteBox } from '../components/InviteBox';
import { Logo } from '../components/layout';
import { useToast, useToastDismiss } from '../components/toast';
import { Badge, Button, Menu, Modal, SpaceIcon } from '../components/ui';
import { callService } from '../lib/call';
import { videoEffectFor } from '../lib/effects';
import { formatDuration } from '../lib/format';
import { useSettings, useT } from '../lib/settings';
import { sounds } from '../lib/sounds';
import { ChatPanel } from './ChatPanel';
import { CamMenu, DockMore, DockPop, MicMenu } from './DockPop';
import { useMedia } from '../lib/useMedia';
import { MeetingSettings } from './MeetingSettings';
import { useModerate } from './moderation';
import { allParticipants, canShareScreen, handUp, isWaiting, nameOf, roomMetaOf, useRoomVersion } from './participants';
import { PeoplePanel } from './PeoplePanel';
import type { JoinChoices } from './PreJoin';
import { QUICK_REACTIONS, ReactionLayer, useReactions } from './Reactions';
import { ScreenPicker } from './ScreenPicker';
import { LayoutMenu } from './LayoutMenu';
import { Stage, type Layout } from './Stage';
import { useChat } from './useChat';
import { useRecording } from './useRecording';
import { useTranscript } from './useTranscript';
import { TranscriptPanel } from './TranscriptPanel';
import { useRemote } from './useRemote';
import { loadExcalidraw } from '../lib/excalidraw';
import { useBoardSync } from './board/useBoardSync';

// The whiteboard (and its engine) loads when it first opens.
const Board = lazy(() => import('./board/Board').then((m) => ({ default: m.Board })));

interface Props {
  join: JoinInfo;
  choices: JoinChoices;
  password?: string;
}

export function RoomView({ join, choices, password }: Props) {
  const t = useT();
  const toast = useToast();
  const dismissToast = useToastDismiss();
  const { settings } = useSettings();
  const room = useRoomContext();
  const connection = useConnectionState();
  useRoomVersion(room);
  const local = room.localParticipant;
  const meta = roomMetaOf(room);
  const amHost = join.role === 'host';
  const waiting = isWaiting(local);
  const moderate = useModerate(join.roomName);

  const [panel, setPanel] = useState<'transcript' | null>(null);
  // Pop-ups that rise from their dock button: chat, people, and the mic/camera choices.
  const [pop, setPop] = useState<'chat' | 'people' | 'mic' | 'cam' | 'more' | null>(null);
  const togglePop = (p: NonNullable<typeof pop>) => setPop((cur) => (cur === p ? null : p));
  const closePop = useCallback(() => setPop(null), []);
  const [layout, setLayout] = useState<Layout>('grid');
  const [pinned, setPinned] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [startedAt] = useState(Date.now());
  const selfMuting = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const chat = useChat(room, pop === 'chat', (m) => {
    if (settingsRef.current.soundChat) sounds.chat();
    if (pop !== 'chat') toast({ icon: MessageSquare, text: `${m.fromName}: ${m.text.slice(0, 80)}`, action: { label: t.meeting.chat, onClick: () => setPop('chat') } });
  });
  const reactions = useReactions(room);
  const remote = useRemote(room);
  const boardSync = useBoardSync(room, amHost, settings.boardDesign);
  const rec = useRecording(room, join, connection, moderate);
  const tx = useTranscript(room, join, moderate);
  const [dontAskRecord, setDontAskRecord] = useState(false);

  // Once the call is up and the device is idle, fetch the whiteboard engine so the board opens instantly.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 3000));
    idle(() => void loadExcalidraw());
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
  useEffect(() => {
    void room.setVideoEffect(videoEffectFor(settings.background));
  }, [room, settings.background]);

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
    const onJoin = (p: Participant, alreadyHere?: boolean) => {
      if (isWaiting(p)) {
        if (amHost) {
          if (settingsRef.current.soundJoin) sounds.join();
          // Stays until they're admitted or leave, so a busy admin can't miss someone at the door.
          toast({ icon: Users, text: t.meeting.waitingToast(nameOf(p)), key: `waiting:${p.identity}`, sticky: true, action: { label: t.meeting.admit, onClick: () => moderate({ action: 'admit', identity: p.identity }) } });
        }
        return;
      }
      // People who were there before you (e.g. when you're let in from the waiting room) aren't news.
      if (alreadyHere) return;
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
    const onAdmittedOrGone = (_prev: string | undefined, p: Participant) => !isWaiting(p) && dismissToast(`waiting:${p.identity}`);
    const onLeft = (p: Participant) => dismissToast(`waiting:${p.identity}`);
    const onMediaFailed = () => toast({ icon: MicOff, text: t.meeting.mediaFailed, tone: 'warn', key: 'media-failed', sticky: true });
    room.on(RoomEvent.MediaFailed, onMediaFailed);
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantAttributesChanged, onAttrs);
    room.on(RoomEvent.TrackMuted, onMuted);
    room.on(RoomEvent.ParticipantMetadataChanged, onAdmittedOrGone);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    return () => {
      room.off(RoomEvent.MediaFailed, onMediaFailed);
      dismissToast('media-failed'); // belongs to this call only
      room.off(RoomEvent.ParticipantConnected, onJoin);
      room.off(RoomEvent.ParticipantAttributesChanged, onAttrs);
      room.off(RoomEvent.TrackMuted, onMuted);
      room.off(RoomEvent.ParticipantMetadataChanged, onAdmittedOrGone);
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
    };
  }, [room, amHost, t, toast, dismissToast, moderate]);

  // Sharing rights come and go with the admin: say so, and stop a share that's no longer allowed.
  const mayShare = canShareScreen(local);
  const hadShare = useRef<boolean | null>(null); // null: not in the call yet, so nothing to compare with
  useEffect(() => {
    if (amHost || waiting) return void (hadShare.current = null);
    if (hadShare.current === null || hadShare.current === mayShare) return void (hadShare.current = mayShare);
    hadShare.current = mayShare;
    if (mayShare) toast({ icon: MonitorUp, text: t.meeting.shareAllowed });
    else {
      if (local.isScreenShareEnabled) void local.setScreenShareEnabled(false);
      toast({ icon: MonitorX, text: t.meeting.shareRevoked, tone: 'warn' });
    }
  }, [mayShare, amHost, waiting, local, toast, t]);

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
    await callService.end(join.roomName).catch(() => undefined);
    room.disconnect();
  };

  // Phones (and folded foldables) get a shorter dock; the rest of the buttons live in "More".
  const narrow = useMedia('(max-width: 640px)');
  // Phone and tablet browsers can't share a screen at all.
  const shareSupported = !!window.brightboard || typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const showShare = canShareScreen(local) && shareSupported;
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
          <SpaceIcon title={join.spaceTitle} color={join.spaceColor} picture={join.spacePicture} size={24} />
          <strong>{join.spaceTitle}</strong>
          <span className="chip-sep" aria-hidden />
          <span className="live-dot" aria-hidden />
          <CallClock startedAt={startedAt} />
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
          <Stage room={room} meta={meta} layout={layout} strip={narrow && settings.videoStrip === 'side' ? 'bottom' : settings.videoStrip} amHost={amHost} pinned={pinned} setPinned={setPinned} moderate={moderate}
            remote={remote}
            board={
              meta.boardOpen ? (
                <Suspense fallback={<div className="board board-loading" aria-busy="true" />}>
                <Board
                  sync={boardSync}
                  title={join.spaceTitle}
                  amHost={amHost}
                  locked={meta.boardLocked}
                  onClose={() => moderate({ action: 'board', value: false })}
                  onToggleLock={() => moderate({ action: 'boardLock', value: !meta.boardLocked })}
                />
                </Suspense>
              ) : undefined
            }
          />
          <ReactionLayer items={reactions.items} />
        </div>
        {panel === 'transcript' && <TranscriptPanel tx={tx} onClose={() => setPanel(null)} />}
      </div>

      <footer className="dock-wrap">
        <nav className="dock" aria-label={t.meeting.settings}>
          <span className="dock-anchor">
            <Ctrl icon={local.isMicrophoneEnabled ? Mic : MicOff} label={local.isMicrophoneEnabled ? t.meeting.micOn : t.meeting.micOff} off={!local.isMicrophoneEnabled} onClick={toggleMic} />
            <Caret label={t.meeting.micChoices} open={pop === 'mic'} onClick={() => togglePop('mic')} />
            {pop === 'mic' && (
              <DockPop light onClose={closePop}>
                <MicMenu room={room} onSettings={() => (setPop(null), setDevicesOpen(true))} />
              </DockPop>
            )}
          </span>
          <span className="dock-anchor">
            <Ctrl icon={local.isCameraEnabled ? Video : VideoOff} label={local.isCameraEnabled ? t.meeting.cameraOn : t.meeting.cameraOff} off={!local.isCameraEnabled} onClick={toggleCam} />
            <Caret label={t.meeting.camChoices} open={pop === 'cam'} onClick={() => togglePop('cam')} />
            {pop === 'cam' && (
              <DockPop light wide onClose={closePop}>
                <CamMenu room={room} onSettings={() => (setPop(null), setDevicesOpen(true))} />
              </DockPop>
            )}
          </span>
          {showShare && !narrow && <Ctrl icon={local.isScreenShareEnabled ? MonitorX : MonitorUp} label={local.isScreenShareEnabled ? t.meeting.stopShare : t.meeting.share} active={local.isScreenShareEnabled} onClick={toggleShare} />}
          {!narrow && <span className="dock-sep" aria-hidden />}
          {!amHost && <Ctrl icon={Hand} label={handUp(local) ? t.meeting.lowerHand : t.meeting.raiseHand} active={handUp(local)} onClick={toggleHand} />}
          {!narrow && (
            <Menu
              up
              align="start"
              trigger={(open, isOpen) => <Ctrl icon={SmilePlus} label={t.meeting.react} active={isOpen} onClick={open} />}
              items={QUICK_REACTIONS.map((e) => ({ label: e, onClick: () => reactions.send(e) }))}
            />
          )}
          {!narrow && amHost && <Ctrl icon={Presentation} label={meta.boardOpen ? t.board.close : t.board.open} active={meta.boardOpen} onClick={() => moderate({ action: 'board', value: !meta.boardOpen })} />}
          {!narrow && !amHost && meta.guestsCanBoard && <Ctrl icon={Presentation} label={meta.boardOpen ? t.board.isOpen : t.board.open} active={meta.boardOpen} onClick={() => !meta.boardOpen && moderate({ action: 'board', value: true })} />}
          <span className="dock-anchor">
            <Ctrl icon={MessageSquare} label={t.meeting.chat} active={pop === 'chat'} badge={chat.unread} onClick={() => togglePop('chat')} />
            {pop === 'chat' && (
              <DockPop onClose={closePop}>
                <ChatPanel room={room} chat={chat} canSend={chatAllowed} onClose={closePop} />
              </DockPop>
            )}
          </span>
          <span className="dock-anchor">
            <Ctrl icon={Users} label={t.meeting.people} active={pop === 'people'} badge={guestsWaiting} count={people} onClick={() => togglePop('people')} />
            {pop === 'people' && (
              <DockPop onClose={closePop}>
                <PeoplePanel room={room} spaceId={join.roomName} meta={meta} amHost={amHost} pinned={pinned} setPinned={setPinned} moderate={moderate} onClose={closePop} />
              </DockPop>
            )}
          </span>
          {narrow ? (
            <span className="dock-anchor">
              <Ctrl icon={MoreHorizontal} label={t.meeting.more} active={pop === 'more'} onClick={() => togglePop('more')} />
              {pop === 'more' && (
                <DockPop light onClose={closePop}>
                  <DockMore
                    reactions={QUICK_REACTIONS}
                    onReact={(e) => (reactions.send(e), setPop(null))}
                    items={[
                      showShare && { icon: local.isScreenShareEnabled ? MonitorX : MonitorUp, label: local.isScreenShareEnabled ? t.meeting.stopShare : t.meeting.share, active: local.isScreenShareEnabled, onClick: toggleShare },
                      amHost && { icon: Presentation, label: meta.boardOpen ? t.board.close : t.board.open, active: meta.boardOpen, onClick: () => moderate({ action: 'board', value: !meta.boardOpen }) },
                      !amHost && meta.guestsCanBoard && !meta.boardOpen && { icon: Presentation, label: t.board.open, onClick: () => moderate({ action: 'board', value: true }) },
                      { icon: layout === 'grid' ? SquareUserRound : LayoutGrid, label: layout === 'grid' ? t.meeting.speaker : t.meeting.grid, onClick: () => setLayout(layout === 'grid' ? 'speaker' : 'grid') },
                      rec.available && { icon: CircleDot, label: rec.recording ? t.recording.stop : t.recording.record, active: rec.recording, onClick: () => (rec.recording ? rec.stop() : rec.start()) },
                      { icon: SettingsIcon, label: t.meeting.settings, onClick: () => setDevicesOpen(true) },
                    ]}
                    onDone={closePop}
                  />
                </DockPop>
              )}
            </span>
          ) : (
            <>
              <span className="dock-sep" aria-hidden />
              <LayoutMenu layout={layout} setLayout={setLayout} />
              {tx.available && (
                <Ctrl icon={FileText} label={t.transcript.title} active={panel === 'transcript' || tx.running} onClick={() => setPanel(panel === 'transcript' ? null : 'transcript')} />
              )}
              {rec.available && (
                <Ctrl icon={CircleDot} label={rec.recording ? t.recording.stop : t.recording.record} active={rec.recording} rec onClick={() => (rec.recording ? rec.stop() : rec.start())} />
              )}
              <Ctrl icon={SettingsIcon} label={t.meeting.settings} onClick={() => setDevicesOpen(true)} />
            </>
          )}
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
              {/* The safe choice has focus: a stray Enter or Space must never start recording. */}
              <Button variant="ghost" onClick={() => rec.answer(false, dontAskRecord)} autoFocus>
                {t.recording.notNow}
              </Button>
              <Button icon={CircleDot} onClick={() => rec.answer(true, dontAskRecord)}>
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
              {/* Deny has focus: someone typing when this pops up must not hand over their computer by accident. */}
              <Button variant="ghost" onClick={() => remote.answer(false)} autoFocus>
                {t.remote.deny}
              </Button>
              <Button icon={MousePointer2} onClick={() => remote.answer(true)}>
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
          <InviteBox space={{ code: join.roomName, title: join.spaceTitle, password }} />
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

/** The small arrow on the mic and camera buttons: device (and background) choices. */
function Caret({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button className={`dock-caret ${open ? 'is-open' : ''}`} onClick={onClick} aria-label={label} aria-expanded={open} title={label}>
      <ChevronUp size={13} strokeWidth={2.6} />
    </button>
  );
}

/** The call timer ticks on its own, so the rest of the call screen doesn't redraw every second. */
function CallClock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span dir="ltr">{formatDuration(now - startedAt)}</span>;
}
