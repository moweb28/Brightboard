import type { ModerateAction, RoomMeta } from '@classroom/protocol';
import { Track, type Participant, type Room } from 'livekit-client';
import { DoorOpen, EyeOff, Hand, Lock, LockOpen, MessageSquare, MessageSquareOff, Mic, MicOff, MonitorUp, MoreVertical, Search, UserCheck, Video, VideoOff, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Badge, Button, IconButton, Menu } from '../components/ui';
import { callService } from '../lib/call';
import { useT } from '../lib/settings';
import { participantActions } from './moderation';
import { allParticipants, colorOf, handUp, isAway, isHost, isWaiting, nameOf } from './participants';

interface Props {
  room: Room;
  /** Room code. */
  spaceId: string;
  meta: RoomMeta;
  amHost: boolean;
  pinned: string | null;
  setPinned: (id: string | null) => void;
  moderate: (a: ModerateAction) => void;
  onClose: () => void;
}

export function PeoplePanel({ room, spaceId, meta, amHost, pinned, setPinned, moderate, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const everyone = allParticipants(room);
  const waiting = everyone.filter(isWaiting);
  const inClass = everyone
    .filter((p) => !isWaiting(p))
    .filter((p) => nameOf(p).toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(isHost(b)) - Number(isHost(a)) || Number(handUp(b)) - Number(handUp(a)) || nameOf(a).localeCompare(nameOf(b)));
  const hands = everyone.filter((p) => !isWaiting(p) && handUp(p));

  return (
    <aside className="side-panel people-panel" aria-label={t.meeting.people}>
      <header className="side-head">
        <h2>{t.meeting.people}</h2>
        <IconButton icon={X} label={t.common.close} onClick={onClose} />
      </header>

      {amHost && (
        <div className="host-tools">
          <Button size="sm" variant="secondary" icon={MicOff} onClick={() => moderate({ action: 'muteAll' })}>
            {t.meeting.muteAll}
          </Button>
          <Button size="sm" variant="secondary" icon={meta.locked ? LockOpen : Lock} onClick={() => moderate({ action: 'lock', value: !meta.locked })}>
            {meta.locked ? t.meeting.unlock : t.meeting.lock}
          </Button>
          <Button size="sm" variant="secondary" icon={meta.chatEnabled ? MessageSquareOff : MessageSquare} onClick={() => moderate({ action: 'chat', value: !meta.chatEnabled })}>
            {meta.chatEnabled ? t.meeting.chatOff : t.meeting.chatOn}
          </Button>
          <Button size="sm" variant="secondary" icon={DoorOpen} onClick={() => callService.updateRoom(spaceId, { waitingRoom: !meta.waitingRoom }).catch(() => undefined)}>
            {meta.waitingRoom ? t.meeting.waitingOff : t.meeting.waitingOn}
          </Button>
        </div>
      )}
      {meta.locked && (
        <p className="panel-note">
          <Lock size={14} /> {t.meeting.lockedNote}
        </p>
      )}

      <div className="side-scroll">
        {amHost && waiting.length > 0 && (
          <section className="people-section">
            <div className="people-section-head">
              <h3>
                {t.meeting.waiting} ({waiting.length})
              </h3>
              <Button size="sm" icon={UserCheck} onClick={() => moderate({ action: 'admitAll' })}>
                {t.meeting.admitAll}
              </Button>
            </div>
            {waiting.map((p) => (
              <div className="person" key={p.identity}>
                <Avatar name={nameOf(p)} color={colorOf(p)} size={36} />
                <span className="person-name">{nameOf(p)}</span>
                <Button size="sm" variant="secondary" onClick={() => moderate({ action: 'admit', identity: p.identity })}>
                  {t.meeting.admit}
                </Button>
              </div>
            ))}
          </section>
        )}

        {hands.length > 0 && (
          <section className="people-section">
            <h3>
              <Hand size={15} /> {t.meeting.raisedHands} ({hands.length})
            </h3>
            {hands.map((p) => (
              <div className="person person-hand" key={p.identity}>
                <span className="hand-emoji" aria-hidden>
                  ✋
                </span>
                <span className="person-name">{nameOf(p)}</span>
              </div>
            ))}
          </section>
        )}

        <section className="people-section">
          <h3>{t.meeting.here(everyone.length - waiting.length)}</h3>
          {everyone.length > 8 && (
            <label className="search">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="…" aria-label="Search" />
            </label>
          )}
          {inClass.map((p) => (
            <PersonRow key={p.identity} p={p} actions={participantActions(p, { t, amHost, meta, pinned, setPinned, moderate })} />
          ))}
        </section>
      </div>
    </aside>
  );
}

function PersonRow({ p, actions }: { p: Participant; actions: ReturnType<typeof participantActions> }) {
  const t = useT();
  const camOn = p.getTrackPublication(Track.Source.Camera)?.isMuted === false;
  const sharing = !!p.getTrackPublication(Track.Source.ScreenShare);
  return (
    <div className="person">
      <Avatar name={nameOf(p)} color={colorOf(p)} size={36} />
      <span className="person-name">
        {nameOf(p)}
        {p.isLocal && <span className="muted"> ({t.common.you})</span>}
        {isHost(p) && <Badge tone="accent">{t.common.host}</Badge>}
      </span>
      <span className="person-icons">
        {handUp(p) && <Hand size={17} className="icon-hand" aria-label={t.meeting.raiseHand} />}
        {isAway(p) && <EyeOff size={17} className="icon-away" aria-label={t.meeting.away} />}
        {sharing && <MonitorUp size={17} className="icon-accent" />}
        {camOn ? <Video size={17} /> : <VideoOff size={17} className="icon-off" />}
        {p.isMicrophoneEnabled ? <Mic size={17} /> : <MicOff size={17} className="icon-off" />}
      </span>
      {actions.some((a) => !a.hidden) && <Menu trigger={(open) => <IconButton icon={MoreVertical} label={t.meeting.moreActions} onClick={open} />} items={actions} />}
    </div>
  );
}
