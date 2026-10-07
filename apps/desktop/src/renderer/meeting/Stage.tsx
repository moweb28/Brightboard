import type { ModerateAction, RoomMeta } from '@classroom/protocol';
import { isTrackReference, useIsSpeaking, useTracks, VideoTrack, type TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track, type Room } from 'livekit-client';
import { Crown, EyeOff, Loader2, MicOff, MonitorUp, MoreHorizontal, MousePointer2, Pin, Star } from 'lucide-react';
import { Avatar, IconButton, Menu } from '../components/ui';
import { useSettings, useT } from '../lib/settings';
import { participantActions } from './moderation';
import { RemoteSurface } from './RemoteSurface';
import type { Remote } from './useRemote';
import { colorOf, handUp, isAway, isHost, isWaiting, nameOf } from './participants';

export type Layout = 'grid' | 'speaker';

interface Props {
  room: Room;
  meta: RoomMeta;
  layout: Layout;
  amHost: boolean;
  pinned: string | null;
  setPinned: (id: string | null) => void;
  moderate: (a: ModerateAction) => void;
  remote: Remote;
}

const keyOf = (r: TrackReferenceOrPlaceholder) => `${r.participant.identity}:${r.source}`;

function gridColumns(n: number) {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  if (n <= 16) return 4;
  return 5;
}

export function Stage({ room, meta, layout, amHost, pinned, setPinned, moderate, remote }: Props) {
  const refs = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  ).filter((r) => !isWaiting(r.participant));

  const cameras = refs.filter((r) => r.source === Track.Source.Camera);
  const shares = refs.filter((r) => r.source === Track.Source.ScreenShare && isTrackReference(r));
  const cameraOf = (identity: string | null) => cameras.find((r) => r.participant.identity === identity);
  const speaker = room.activeSpeakers.find((p) => !p.isLocal) ?? room.activeSpeakers[0];

  const focus: TrackReferenceOrPlaceholder | undefined =
    cameraOf(pinned) ?? cameraOf(meta.spotlight) ?? shares[0] ?? (layout === 'speaker' && cameras.length > 1 ? (cameraOf(speaker?.identity ?? null) ?? cameras.find((r) => !r.participant.isLocal)) : undefined);

  const tile = (r: TrackReferenceOrPlaceholder, size: 'grid' | 'focus' | 'strip') => (
    <Tile key={keyOf(r)} trackRef={r} size={size} meta={meta} amHost={amHost} pinned={pinned} setPinned={setPinned} moderate={moderate} remote={remote} />
  );

  if (focus) {
    const others = [...shares.filter((s) => s !== focus), ...cameras.filter((c) => c !== focus)];
    return (
      <div className="stage stage-focus">
        <div className="stage-main">{tile(focus, 'focus')}</div>
        {others.length > 0 && <div className="filmstrip">{others.map((r) => tile(r, 'strip'))}</div>}
      </div>
    );
  }

  return (
    <div className="stage stage-grid" style={{ '--cols': gridColumns(cameras.length), '--rows': Math.ceil(cameras.length / gridColumns(cameras.length)) } as React.CSSProperties}>
      {cameras.map((r) => tile(r, 'grid'))}
    </div>
  );
}

interface TileProps {
  trackRef: TrackReferenceOrPlaceholder;
  size: 'grid' | 'focus' | 'strip';
  meta: RoomMeta;
  amHost: boolean;
  pinned: string | null;
  setPinned: (id: string | null) => void;
  moderate: (a: ModerateAction) => void;
  remote: Remote;
}

function Tile({ trackRef, size, meta, amHost, pinned, setPinned, moderate, remote }: TileProps) {
  const t = useT();
  const { settings } = useSettings();
  const p = trackRef.participant;
  const speaking = useIsSpeaking(p);
  const isShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted && (trackRef.publication.isSubscribed || p.isLocal);
  const name = nameOf(p);
  const actions = participantActions(p, { t, amHost, meta, pinned, setPinned, moderate });
  const avatarSize = size === 'strip' ? 52 : size === 'focus' ? 140 : 96;

  return (
    <div
      style={{ '--ring': colorOf(p) } as React.CSSProperties}
      className={`tile tile-${size} ${speaking && !isShare ? 'is-speaking' : ''} ${isShare ? 'is-share' : ''}`}
      onDoubleClick={() => !isShare && setPinned(pinned === p.identity ? null : p.identity)}
    >
      {hasVideo ? (
        <VideoTrack trackRef={trackRef} className={`tile-video ${p.isLocal && !isShare && settings.mirror ? 'mirror' : ''} ${isShare ? 'contain' : ''}`} />
      ) : (
        <div className="tile-avatar">
          <Avatar name={name} color={colorOf(p)} size={avatarSize} />
        </div>
      )}

      <div className="tile-badges">
        {handUp(p) && !isShare && (
          <span className="tile-badge badge-hand" title={t.meeting.raiseHand}>
            ✋
          </span>
        )}
        {isAway(p) && !isShare && (
          <span className="tile-badge badge-away" title={t.meeting.awayHint}>
            <EyeOff size={14} /> {t.meeting.away}
          </span>
        )}
        {meta.spotlight === p.identity && !isShare && (
          <span className="tile-badge">
            <Star size={14} />
          </span>
        )}
        {pinned === p.identity && !isShare && (
          <span className="tile-badge">
            <Pin size={14} />
          </span>
        )}
      </div>

      <div className="tile-label">
        {isShare ? <MonitorUp size={15} /> : isHost(p) ? <Crown size={15} /> : null}
        <span>{isShare ? t.meeting.presenting(name) : p.isLocal ? `${name} (${t.common.you})` : name}</span>
        {!isShare && !p.isMicrophoneEnabled && <MicOff size={15} className="icon-off" aria-label="muted" />}
      </div>

      {isShare && amHost && !p.isLocal && size !== 'strip' && <ShareControl remote={remote} identity={p.identity} name={name} />}

      {!isShare && actions.some((a) => !a.hidden) && (
        <div className="tile-menu">
          <Menu trigger={(open) => <IconButton icon={MoreHorizontal} label={t.meeting.moreActions} onClick={open} />} items={actions} />
        </div>
      )}
    </div>
  );
}

/** Host-only controls on a guest's shared screen: ask for control, wait, or drive it. */
function ShareControl({ remote, identity, name }: { remote: Remote; identity: string; name: string }) {
  const t = useT();
  const state = remote.sessions[identity];
  if (state === 'active') return <RemoteSurface name={name} send={(e) => remote.send(identity, e)} onRelease={() => remote.release(identity)} />;
  return (
    <div className="share-control">
      {state === 'pending' ? (
        <span className="share-control-btn is-pending">
          <Loader2 size={16} className="spin" /> {t.remote.pending(name)}
        </span>
      ) : (
        <button className="share-control-btn" onClick={() => remote.request(identity)} title={t.remote.requestHint}>
          <MousePointer2 size={16} /> {t.remote.request}
        </button>
      )}
    </div>
  );
}
