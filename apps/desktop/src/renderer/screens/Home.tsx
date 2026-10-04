import type { ClassDto } from '@classroom/protocol';
import { BookOpen, CalendarClock, Clock, Link2, Play, Plus, Radio, Send, Users, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ClassFormModal } from '../components/ClassFormModal';
import { InviteBox } from '../components/InviteBox';
import { AppShell } from '../components/layout';
import { useToast } from '../components/toast';
import { Badge, Button, EmptyState, Modal, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dayPart, formatRelative } from '../lib/format';
import { useNavigate } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { useLoad } from '../lib/useAsync';

export function Home({ newClass }: { newClass?: boolean }) {
  const { user } = useAuth();
  return user?.role === 'teacher' ? <TeacherHome openNew={newClass} /> : <StudentHome />;
}

/** Refetch every 15 s so live badges stay current. */
function useClasses() {
  const res = useLoad(() => api.classes(), []);
  useEffect(() => {
    const id = setInterval(res.reload, 15_000);
    return () => clearInterval(id);
  }, [res.reload]);
  return res;
}

function Greeting({ subtitle, action }: { subtitle: string; action?: React.ReactNode }) {
  const { user } = useAuth();
  const t = useT();
  return (
    <header className="page-head">
      <div>
        <h1>{t.dashboard.greeting(dayPart(), user?.displayName ?? '')}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function useStartClass() {
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  return async (c: ClassDto) => {
    try {
      const join = await api.start(c.id);
      navigate({ name: 'meeting', join, inviteCode: c.code, invitePassword: c.joinPassword });
    } catch {
      toast({ text: t.errors.generic, tone: 'warn' });
    }
  };
}

function TeacherHome({ openNew }: { openNew?: boolean }) {
  const t = useT();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { data: classes, reload, error } = useClasses();
  const { data: stats } = useLoad(() => api.stats(), [classes?.length]);
  const [creating, setCreating] = useState(!!openNew);
  const [inviting, setInviting] = useState<ClassDto | null>(null);
  const start = useStartClass();
  const live = classes?.find((c) => c.live);

  const statCards = [
    { icon: BookOpen, label: t.dashboard.statClasses, value: stats?.classes },
    { icon: Users, label: t.dashboard.statStudents, value: stats?.students },
    { icon: CalendarClock, label: t.dashboard.statSessionsWeek, value: stats?.sessionsThisWeek },
    { icon: Clock, label: t.dashboard.statMinutes, value: stats?.minutesTaught },
  ];

  return (
    <AppShell active="home">
      <div className="page">
        <Greeting
          subtitle={t.dashboard.teacherSubtitle}
          action={
            <Button icon={Plus} onClick={() => setCreating(true)}>
              {t.dashboard.newClass}
            </Button>
          }
        />

        {live && (
          <div className="live-banner">
            <Radio size={22} />
            <div>
              <strong>{t.dashboard.liveNow}</strong>
              <span>{t.dashboard.liveNowText(live.title)}</span>
            </div>
            <Button icon={Video} onClick={() => start(live)}>
              {t.dashboard.rejoin}
            </Button>
          </div>
        )}

        <div className="stats">
          {statCards.map(({ icon: Icon, label, value }) => (
            <div className="stat card" key={label}>
              <span className="stat-icon">
                <Icon size={20} />
              </span>
              <strong>{value ?? '–'}</strong>
              <span className="muted small">{label}</span>
            </div>
          ))}
        </div>

        <h2 className="section-title">{t.dashboard.yourClasses}</h2>
        {!classes && !error && <Spinner />}
        {classes?.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title={t.dashboard.noClassesTitle}
            text={t.dashboard.noClassesText}
            action={
              <Button icon={Plus} onClick={() => setCreating(true)}>
                {t.dashboard.newClass}
              </Button>
            }
          />
        )}
        <div className="class-grid">
          {classes?.map((c) => (
            <article key={c.id} className="class-card card" onClick={() => navigate({ name: 'class', id: c.id })} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate({ name: 'class', id: c.id })}>
              <div className="class-card-band" style={{ background: c.color }}>
                <span className="class-card-subject">{c.subject || '—'}</span>
                {c.live && <Badge tone="live">● {t.dashboard.live}</Badge>}
              </div>
              <div className="class-card-body">
                <h3>{c.title}</h3>
                {c.schedule && (
                  <p className="muted small icon-line">
                    <CalendarClock size={14} /> {c.schedule}
                  </p>
                )}
                <p className="muted small icon-line">
                  <Users size={14} /> {t.dashboard.students(c.studentCount)} · {c.lastSessionAt ? t.dashboard.lastSession(formatRelative(c.lastSessionAt, settings.lang)) : t.dashboard.neverHeld}
                </p>
              </div>
              <div className="class-card-actions" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" icon={Play} onClick={() => start(c)}>
                  {c.live ? t.dashboard.rejoin : t.dashboard.start}
                </Button>
                <Button size="sm" variant="secondary" icon={Send} onClick={() => setInviting(c)}>
                  {t.dashboard.invite}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {creating && (
        <ClassFormModal
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            reload();
            setInviting(c);
          }}
        />
      )}
      {inviting && (
        <Modal title={`${t.classPage.invitePeople} · ${inviting.title}`} onClose={() => setInviting(null)}>
          <InviteBox cls={inviting} onChange={(c) => (setInviting(c), reload())} />
        </Modal>
      )}
    </AppShell>
  );
}

function StudentHome() {
  const t = useT();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { data: classes, error } = useClasses();

  const joinNow = async (c: ClassDto) => {
    try {
      const join = await api.join(c.code, user!.displayName, '');
      navigate({ name: 'meeting', join });
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'generic';
      if (code === 'wrongPassword') navigate({ name: 'join', code: c.code });
      else toast({ text: t.errors[code] ?? t.errors.generic, tone: 'warn' });
    }
  };

  return (
    <AppShell active="home">
      <div className="page">
        <Greeting
          subtitle={t.dashboard.studentSubtitle}
          action={
            <Button icon={Link2} onClick={() => navigate({ name: 'join' })}>
              {t.nav.joinClass}
            </Button>
          }
        />
        <h2 className="section-title">{t.dashboard.myClasses}</h2>
        {!classes && !error && <Spinner />}
        {classes?.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title={t.dashboard.noMyClassesTitle}
            text={t.dashboard.noMyClassesText}
            action={
              <Button icon={Link2} onClick={() => navigate({ name: 'join' })}>
                {t.nav.joinClass}
              </Button>
            }
          />
        )}
        <div className="class-grid">
          {classes
            ?.slice()
            .sort((a, b) => Number(b.live) - Number(a.live))
            .map((c) => (
              <article key={c.id} className="class-card card">
                <div className="class-card-band" style={{ background: c.color }}>
                  <span className="class-card-subject">{c.subject || '—'}</span>
                  {c.live ? <Badge tone="live">● {t.dashboard.live}</Badge> : <Badge>{t.dashboard.notLive}</Badge>}
                </div>
                <div className="class-card-body">
                  <h3>{c.title}</h3>
                  <p className="muted small">{t.dashboard.byTeacher(c.teacherName)}</p>
                  {c.schedule && (
                    <p className="muted small icon-line">
                      <CalendarClock size={14} /> {c.schedule}
                    </p>
                  )}
                  {c.lastSessionAt && <p className="muted small">{t.dashboard.lastSession(formatRelative(c.lastSessionAt, settings.lang))}</p>}
                </div>
                <div className="class-card-actions">
                  <Button size="sm" icon={Video} disabled={!c.live} onClick={() => joinNow(c)}>
                    {t.dashboard.joinNow}
                  </Button>
                </div>
              </article>
            ))}
        </div>
      </div>
    </AppShell>
  );
}
