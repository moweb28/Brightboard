import { nextMeeting, type CallRecord, type JoinedSpace, type Space } from '@classroom/protocol';
import { CalendarClock, ChevronDown, History, LogIn, MoreHorizontal, Pencil, Play, Settings2, Trash2, UserCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { InviteBox } from '../components/InviteBox';
import { AppShell } from '../components/layout';
import { SpaceFormModal } from '../components/SpaceFormModal';
import { Avatar, Badge, Button, EmptyState, IconButton, Menu, SpaceIcon, Toggle } from '../components/ui';
import { callService } from '../lib/call';
import { colorFor, formatDate, formatDay, formatSchedule, formatTime } from '../lib/format';
import { useNavigate } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { useStore } from '../lib/store';
import { useOpenCall } from '../lib/useOpenCall';

type SettingKey = 'waitingRoom' | 'muteOnJoin' | 'guestsCanShare' | 'guestsCanBoard' | 'chatEnabled';

/** `id` is a local space id, or `j:CODE` for a space you joined. */
export function SpacePage({ id }: { id: string }) {
  const t = useT();
  const navigate = useNavigate();
  const { data } = useStore();
  const space = data?.spaces.find((s) => s.id === id);
  const joined = id.startsWith('j:') ? data?.joined.find((j) => j.code === id.slice(2)) : undefined;

  return (
    <AppShell active="space" spaceId={id}>
      <div className="page">
        {space && <AdminSpace space={space} />}
        {joined && <JoinedSpaceView space={joined} />}
        {!space && !joined && (
          <EmptyState icon={UserRound} title={t.errors.notFound} text="" action={<Button onClick={() => navigate({ name: 'home' })}>{t.nav.home}</Button>} />
        )}
      </div>
    </AppShell>
  );
}

function ScheduleLine({ schedule }: { schedule: Space['schedule'] }) {
  const t = useT();
  const { settings } = useSettings();
  if (!schedule) return <p className="muted">{t.spaceForm.scheduleOff}</p>;
  const next = nextMeeting(schedule, new Date());
  return (
    <p className="muted icon-line">
      <CalendarClock size={16} /> {formatSchedule(schedule, settings.lang)}
      {next && <span className="next-pill">{t.space.next(formatDay(next.start, settings.lang), formatTime(next.start.getTime(), settings.lang))}</span>}
    </p>
  );
}

function AdminSpace({ space }: { space: Space }) {
  const t = useT();
  const navigate = useNavigate();
  const openCall = useOpenCall();
  const { data, live, updateSpace, deleteSpace } = useStore();
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  const isLive = live.has(space.code);
  const calls = (data?.calls ?? []).filter((c) => c.spaceId === space.id).sort((a, b) => b.startedAt - a.startedAt);

  const setting = (key: SettingKey, value: boolean) => {
    updateSpace(space.id, { [key]: value });
    // During a call the change applies right away too.
    if (isLive) void callService.updateRoom(space.code, { [key]: value }).catch(() => undefined);
  };
  const start = async () => {
    setStarting(true);
    if (!(await openCall({ admin: space }))) setStarting(false);
  };
  const remove = () => {
    if (!confirm(t.space.archiveConfirm)) return;
    deleteSpace(space.id);
    navigate({ name: 'home' });
  };

  const toggles: { key: SettingKey; label: string; desc: string }[] = [
    { key: 'waitingRoom', label: t.space.waitingRoom, desc: t.space.waitingRoomDesc },
    { key: 'muteOnJoin', label: t.space.muteOnJoin, desc: t.space.muteOnJoinDesc },
    { key: 'guestsCanShare', label: t.space.guestsCanShare, desc: t.space.guestsCanShareDesc },
    { key: 'guestsCanBoard', label: t.space.guestsCanBoard, desc: t.space.guestsCanBoardDesc },
    { key: 'chatEnabled', label: t.space.chatEnabled, desc: t.space.chatEnabledDesc },
  ];

  return (
    <>
      <header className="space-hero" style={{ '--space-color': space.color } as React.CSSProperties}>
        <span className="space-hero-icon">
          <SpaceIcon title={space.title} color={space.color} picture={space.picture} size={84} />
        </span>
        <div className="space-hero-text">
          <div className="row">
            <Badge tone="accent">{t.kinds[space.kind].name}</Badge>
            {isLive && <Badge tone="live">{t.home.live}</Badge>}
          </div>
          <h1 className="display">{space.title}</h1>
          <ScheduleLine schedule={space.schedule} />
        </div>
        <div className="row">
          <Button size="lg" icon={Play} onClick={start} loading={starting}>
            {isLive ? t.space.rejoin : t.space.start}
          </Button>
          <Menu
            trigger={(open) => <IconButton icon={MoreHorizontal} label={t.meeting.moreActions} onClick={open} className="icon-btn-lg" />}
            items={[
              { icon: Pencil, label: t.common.edit, onClick: () => setEditing(true) },
              { icon: Trash2, label: t.space.archive, onClick: remove, danger: true },
            ]}
          />
        </div>
      </header>

      <div className="two-columns">
        <div className="stack">
          <section className="card card-pad">
            <h2 className="card-title">{t.space.invite}</h2>
            <InviteBox space={space} onPasswordChange={(password) => updateSpace(space.id, { password })} />
          </section>
          <section className="card card-pad">
            <h2 className="card-title icon-line">
              <Settings2 size={18} /> {t.space.settings}
            </h2>
            <p className="muted small">{t.space.settingsLiveNote}</p>
            {toggles.map(({ key, label, desc }) => (
              <Toggle key={key} label={label} description={desc} checked={space[key]} onChange={(v) => setting(key, v)} />
            ))}
          </section>
        </div>
        <section className="card card-pad">
          <h2 className="card-title icon-line">
            <History size={18} /> {t.space.history}
          </h2>
          {calls.length === 0 && <p className="muted">{t.space.noCalls}</p>}
          <ul className="session-list">
            {calls.map((c) => (
              <CallRow key={c.id} call={c} />
            ))}
          </ul>
        </section>
      </div>
      {editing && <SpaceFormModal existing={space} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </>
  );
}

function JoinedSpaceView({ space }: { space: JoinedSpace }) {
  const t = useT();
  const navigate = useNavigate();
  const openCall = useOpenCall();
  const { live, forgetJoined } = useStore();
  const [joining, setJoining] = useState(false);
  const join = async () => {
    setJoining(true);
    if (!(await openCall({ code: space.code }))) setJoining(false);
  };
  const forget = () => {
    forgetJoined(space.code);
    navigate({ name: 'home' });
  };
  return (
    <header className="space-hero" style={{ '--space-color': space.color } as React.CSSProperties}>
      <span className="space-hero-icon">
        <SpaceIcon title={space.title} color={space.color} picture={space.picture} size={84} />
      </span>
      <div className="space-hero-text">
        <div className="row">
          <Badge tone="accent">{t.kinds[space.kind].name}</Badge>
          {live.has(space.code) && <Badge tone="live">{t.home.live}</Badge>}
        </div>
        <h1 className="display">{space.title}</h1>
        <p className="muted">{t.home.hostedBy(space.adminName)}</p>
        <ScheduleLine schedule={space.schedule} />
      </div>
      <div className="row">
        <Button size="lg" icon={LogIn} onClick={join} loading={joining}>
          {t.home.joinNow}
        </Button>
        <Menu
          trigger={(open) => <IconButton icon={MoreHorizontal} label={t.meeting.moreActions} onClick={open} className="icon-btn-lg" />}
          items={[{ icon: Trash2, label: t.space.forget, onClick: forget, danger: true }]}
        />
      </div>
    </header>
  );
}

function CallRow({ call }: { call: CallRecord }) {
  const t = useT();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const minutes = call.endedAt ? Math.max(1, Math.round((call.endedAt - call.startedAt) / 60_000)) : null;
  return (
    <li className="session">
      <button className="session-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="session-date">
          <strong>{formatDate(call.startedAt, settings.lang)}</strong>
          <span className="muted small">
            {formatTime(call.startedAt, settings.lang)}, {minutes ? t.space.minutes(minutes) : t.space.inProgress}
          </span>
        </span>
        <Badge>
          <UserCheck size={14} /> {t.space.attendees(call.attendees.length)}
        </Badge>
        <ChevronDown size={18} className={open ? 'rotate' : ''} />
      </button>
      {open && (
        <div className="attendance">
          {call.attendees.length === 0 && <p className="muted small">{t.space.noAttendees}</p>}
          {call.attendees.map((p) => (
            <div className="attendee" key={p.name}>
              <Avatar name={p.name} color={colorFor(p.name)} size={28} />
              <span>{p.name}</span>
              <span className="muted small push">{formatTime(p.joinedAt, settings.lang)}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
