import type { ClassDto, SessionDto } from '@classroom/protocol';
import { Archive, ArrowLeft, CalendarClock, ChevronDown, History, MoreHorizontal, Pencil, Play, Settings2, Square, UserCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { ClassFormModal } from '../components/ClassFormModal';
import { InviteBox } from '../components/InviteBox';
import { AppShell } from '../components/layout';
import { useToast } from '../components/toast';
import { Avatar, Badge, Button, EmptyState, IconButton, Menu, Spinner, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { colorFor, formatDate, formatTime } from '../lib/format';
import { useNavigate } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { useLoad } from '../lib/useAsync';

export function ClassPage({ id }: { id: number }) {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: cls, setData: setCls, error } = useLoad(() => api.getClass(id), [id]);
  const { data: sessions, reload: reloadSessions } = useLoad(() => api.sessions(id), [id]);
  const [editing, setEditing] = useState(false);

  if (error) {
    return (
      <AppShell active="class">
        <div className="page">
          <EmptyState icon={Users} title={t.errors.notFound} text="" action={<Button onClick={() => navigate({ name: 'home' })}>{t.nav.home}</Button>} />
        </div>
      </AppShell>
    );
  }
  if (!cls) {
    return (
      <AppShell active="class">
        <Spinner />
      </AppShell>
    );
  }

  const setting = async (key: 'waitingRoom' | 'muteOnJoin' | 'studentsCanShare' | 'chatEnabled', value: boolean) => {
    setCls({ ...cls, [key]: value });
    try {
      setCls(await api.updateClass(cls.id, { [key]: value }));
    } catch {
      setCls(cls);
      toast({ text: t.errors.generic, tone: 'warn' });
    }
  };

  const start = async () => {
    const join = await api.start(cls.id);
    navigate({ name: 'meeting', join, inviteCode: cls.code, invitePassword: cls.joinPassword });
  };
  const end = async () => {
    await api.end(cls.id);
    setCls({ ...cls, live: false });
    reloadSessions();
  };
  const archive = async () => {
    if (!confirm(t.classPage.archiveConfirm)) return;
    await api.archiveClass(cls.id);
    navigate({ name: 'home' });
  };

  return (
    <AppShell active="class">
      <div className="page">
        <Button variant="link" icon={ArrowLeft} className="back-link" onClick={() => navigate({ name: 'home' })}>
          {t.nav.home}
        </Button>
        <header className="class-hero" style={{ '--class-color': cls.color } as React.CSSProperties}>
          <div className="class-hero-text">
            <div className="row">
              {cls.subject && <Badge tone="accent">{cls.subject}</Badge>}
              {cls.live && <Badge tone="live">● {t.dashboard.live}</Badge>}
            </div>
            <h1>{cls.title}</h1>
            <p className="icon-line">
              {cls.schedule && (
                <>
                  <CalendarClock size={16} /> {cls.schedule} ·{' '}
                </>
              )}
              <Users size={16} /> {t.dashboard.students(cls.studentCount)}
            </p>
          </div>
          <div className="row">
            <Button size="lg" icon={Play} onClick={start}>
              {cls.live ? t.classPage.rejoinClass : t.classPage.startClass}
            </Button>
            {cls.live && (
              <Button size="lg" variant="secondary" icon={Square} onClick={end}>
                {t.classPage.endClass}
              </Button>
            )}
            <Menu
              trigger={(open) => <IconButton icon={MoreHorizontal} label={t.meeting.moreActions} onClick={open} className="icon-btn-lg" />}
              items={[
                { icon: Pencil, label: t.common.edit, onClick: () => setEditing(true) },
                { icon: Archive, label: t.classPage.archive, onClick: archive, danger: true },
              ]}
            />
          </div>
        </header>

        <div className="class-columns">
          <div className="stack">
            <section className="card card-pad">
              <h2 className="card-title">{t.classPage.invitePeople}</h2>
              <InviteBox cls={cls} onChange={setCls} />
            </section>
            <section className="card card-pad">
              <h2 className="card-title icon-line">
                <Settings2 size={18} /> {t.classPage.settings}
              </h2>
              <p className="muted small">{t.classPage.settingsLiveNote}</p>
              <Toggle label={t.classPage.waitingRoom} description={t.classPage.waitingRoomDesc} checked={cls.waitingRoom} onChange={(v) => setting('waitingRoom', v)} />
              <Toggle label={t.classPage.muteOnJoin} description={t.classPage.muteOnJoinDesc} checked={cls.muteOnJoin} onChange={(v) => setting('muteOnJoin', v)} />
              <Toggle label={t.classPage.studentsCanShare} description={t.classPage.studentsCanShareDesc} checked={cls.studentsCanShare} onChange={(v) => setting('studentsCanShare', v)} />
              <Toggle label={t.classPage.chatEnabled} description={t.classPage.chatEnabledDesc} checked={cls.chatEnabled} onChange={(v) => setting('chatEnabled', v)} />
            </section>
          </div>
          <section className="card card-pad">
            <h2 className="card-title icon-line">
              <History size={18} /> {t.classPage.history}
            </h2>
            {!sessions && <Spinner />}
            {sessions?.length === 0 && <p className="muted">{t.classPage.noSessions}</p>}
            <ul className="session-list">
              {sessions?.map((s) => <SessionRow key={s.id} cls={cls} session={s} />)}
            </ul>
          </section>
        </div>
      </div>
      {editing && (
        <ClassFormModal
          existing={cls}
          onClose={() => setEditing(false)}
          onSaved={(c) => {
            setCls(c);
            setEditing(false);
          }}
        />
      )}
    </AppShell>
  );
}

function SessionRow({ cls, session }: { cls: ClassDto; session: SessionDto }) {
  const t = useT();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const { data: people } = useLoad(() => (open ? api.attendance(cls.id, session.id) : Promise.resolve(undefined)), [open]);
  const minutes = session.endedAt ? Math.max(1, Math.round((session.endedAt - session.startedAt) / 60_000)) : null;
  return (
    <li className="session">
      <button className="session-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="session-date">
          <strong>{formatDate(session.startedAt, settings.lang)}</strong>
          <span className="muted small">
            {formatTime(session.startedAt, settings.lang)} · {minutes ? t.classPage.minutes(minutes) : t.classPage.inProgress}
          </span>
        </span>
        <Badge>
          <UserCheck size={14} /> {t.classPage.attendees(session.attendeeCount)}
        </Badge>
        <ChevronDown size={18} className={open ? 'rotate' : ''} />
      </button>
      {open && (
        <div className="attendance">
          {!people && <Spinner />}
          {people?.length === 0 && <p className="muted small">{t.classPage.noAttendees}</p>}
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
