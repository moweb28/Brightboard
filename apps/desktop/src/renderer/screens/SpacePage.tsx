import type { CallDto, SpaceDto } from '@classroom/protocol';
import { ArrowLeft, CalendarClock, ChevronDown, History, MoreHorizontal, Pencil, Play, Settings2, Square, Trash2, UserCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { InviteBox } from '../components/InviteBox';
import { AppShell } from '../components/layout';
import { SpaceFormModal } from '../components/SpaceFormModal';
import { useToast } from '../components/toast';
import { Avatar, Badge, Button, EmptyState, IconButton, Menu, Spinner, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { colorFor, formatDate, formatTime } from '../lib/format';
import { useNavigate } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { useLoad } from '../lib/useAsync';

type SettingKey = 'waitingRoom' | 'muteOnJoin' | 'guestsCanShare' | 'chatEnabled';

export function SpacePage({ id }: { id: number }) {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: space, setData: setSpace, error } = useLoad(() => api.getSpace(id), [id]);
  const { data: calls, reload: reloadCalls } = useLoad(() => api.calls(id), [id]);
  const [editing, setEditing] = useState(false);

  if (error) {
    return (
      <AppShell active="space">
        <div className="page">
          <EmptyState icon={Users} title={t.errors.notFound} text="" action={<Button onClick={() => navigate({ name: 'home' })}>{t.nav.home}</Button>} />
        </div>
      </AppShell>
    );
  }
  if (!space) {
    return (
      <AppShell active="space">
        <Spinner />
      </AppShell>
    );
  }

  const setting = async (key: SettingKey, value: boolean) => {
    setSpace({ ...space, [key]: value });
    try {
      setSpace(await api.updateSpace(space.id, { [key]: value }));
    } catch {
      setSpace(space);
      toast({ text: t.errors.generic, tone: 'warn' });
    }
  };
  const start = async () => navigate({ name: 'meeting', join: await api.start(space.id), invitePassword: space.password });
  const end = async () => {
    await api.end(space.id);
    setSpace({ ...space, live: false });
    reloadCalls();
  };
  const remove = async () => {
    if (!confirm(t.space.archiveConfirm)) return;
    await api.deleteSpace(space.id);
    navigate({ name: 'home' });
  };

  const toggles: { key: SettingKey; label: string; desc: string }[] = [
    { key: 'waitingRoom', label: t.space.waitingRoom, desc: t.space.waitingRoomDesc },
    { key: 'muteOnJoin', label: t.space.muteOnJoin, desc: t.space.muteOnJoinDesc },
    { key: 'guestsCanShare', label: t.space.guestsCanShare, desc: t.space.guestsCanShareDesc },
    { key: 'chatEnabled', label: t.space.chatEnabled, desc: t.space.chatEnabledDesc },
  ];

  return (
    <AppShell active="space">
      <div className="page">
        <Button variant="link" icon={ArrowLeft} className="back-link" onClick={() => navigate({ name: 'home' })}>
          {t.nav.home}
        </Button>
        <header className="space-hero" style={{ '--space-color': space.color } as React.CSSProperties}>
          <span className="space-hero-emoji">{space.emoji}</span>
          <div className="space-hero-text">
            <div className="row">
              <Badge tone="accent">{t.kinds[space.kind].name}</Badge>
              {space.live && <Badge tone="live">● {t.home.live}</Badge>}
            </div>
            <h1 className="display">{space.title}</h1>
            <p className="muted icon-line">
              {space.schedule && (
                <>
                  <CalendarClock size={16} /> {space.schedule} ·{' '}
                </>
              )}
              <Users size={16} /> {t.home.people(space.peopleCount)}
            </p>
          </div>
          <div className="row">
            <Button size="lg" icon={Play} onClick={start}>
              {space.live ? t.space.rejoin : t.space.start}
            </Button>
            {space.live && (
              <Button size="lg" variant="secondary" icon={Square} onClick={end}>
                {t.space.end}
              </Button>
            )}
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
              <InviteBox space={space} onChange={setSpace} />
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
            {!calls && <Spinner />}
            {calls?.length === 0 && <p className="muted">{t.space.noCalls}</p>}
            <ul className="session-list">
              {calls?.map((c) => <CallRow key={c.id} space={space} call={c} />)}
            </ul>
          </section>
        </div>
      </div>
      {editing && (
        <SpaceFormModal
          existing={space}
          onClose={() => setEditing(false)}
          onSaved={(s) => {
            setSpace(s);
            setEditing(false);
          }}
        />
      )}
    </AppShell>
  );
}

function CallRow({ space, call }: { space: SpaceDto; call: CallDto }) {
  const t = useT();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const { data: people } = useLoad(() => (open ? api.attendance(space.id, call.id) : Promise.resolve(undefined)), [open]);
  const minutes = call.endedAt ? Math.max(1, Math.round((call.endedAt - call.startedAt) / 60_000)) : null;
  return (
    <li className="session">
      <button className="session-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="session-date">
          <strong>{formatDate(call.startedAt, settings.lang)}</strong>
          <span className="muted small">
            {formatTime(call.startedAt, settings.lang)} · {minutes ? t.space.minutes(minutes) : t.space.inProgress}
          </span>
        </span>
        <Badge>
          <UserCheck size={14} /> {t.space.attendees(call.attendeeCount)}
        </Badge>
        <ChevronDown size={18} className={open ? 'rotate' : ''} />
      </button>
      {open && (
        <div className="attendance">
          {!people && <Spinner />}
          {people?.length === 0 && <p className="muted small">{t.space.noAttendees}</p>}
          {people?.map((p, i) => (
            <div className="attendee" key={i}>
              <Avatar name={p.name} color={colorFor(p.name)} size={28} />
              <span>{p.name}</span>
              {!p.userId && <Badge>{t.common.guest}</Badge>}
              <span className="muted small push">{formatTime(p.joinedAt, settings.lang)}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
