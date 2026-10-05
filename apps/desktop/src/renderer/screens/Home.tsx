import { extractRoomCode, type SpaceDto } from '@classroom/protocol';
import { ArrowRight, CalendarClock, Clock, Lock, Play, Plus, Radio, Send, Sparkles, Users, Video, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { InviteBox } from '../components/InviteBox';
import { AppShell } from '../components/layout';
import { SpaceFormModal } from '../components/SpaceFormModal';
import { useToast } from '../components/toast';
import { Badge, Button, EmptyState, Modal, Spinner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dayPart, formatRelative } from '../lib/format';
import { useNavigate } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { useLoad } from '../lib/useAsync';

/** Refetch every 15 s so live badges stay current. */
function useSpaces() {
  const res = useLoad(() => api.spaces(), []);
  useEffect(() => {
    const id = setInterval(res.reload, 15_000);
    return () => clearInterval(id);
  }, [res.reload]);
  return res;
}

export function Home({ newSpace }: { newSpace?: boolean }) {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: spaces, reload, error } = useSpaces();
  const hosted = spaces?.filter((s) => s.isHost) ?? [];
  const joined = spaces?.filter((s) => !s.isHost) ?? [];
  const { data: stats } = useLoad(() => (hosted.length ? api.stats() : Promise.resolve(undefined)), [hosted.length]);
  const [creating, setCreating] = useState(!!newSpace);
  const [inviting, setInviting] = useState<SpaceDto | null>(null);
  const [paste, setPaste] = useState('');
  const [starting, setStarting] = useState(false);
  const live = spaces?.filter((s) => s.live) ?? [];

  const fail = (e: unknown) => toast({ text: t.errors[e instanceof ApiError ? e.code : 'generic'] ?? t.errors.generic, tone: 'warn' });

  const startNow = async () => {
    setStarting(true);
    try {
      navigate({ name: 'meeting', join: await api.instant() });
    } catch (e) {
      fail(e);
      setStarting(false);
    }
  };

  /** Host: start (or rejoin) the call. Member: join it, asking for the password only if needed. */
  const open = async (s: SpaceDto) => {
    try {
      if (s.isHost) navigate({ name: 'meeting', join: await api.start(s.id), invitePassword: s.password });
      else navigate({ name: 'meeting', join: await api.join(s.code, user!.displayName, '') });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'wrongPassword') navigate({ name: 'join', code: s.code });
      else fail(e);
    }
  };

  const joinPasted = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = extractRoomCode(paste);
    if (!code) return toast({ text: t.errors.badCode, tone: 'warn' });
    try {
      navigate({ name: 'meeting', join: await api.join(code, user!.displayName, '') });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'wrongPassword') navigate({ name: 'join', code });
      else fail(err);
    }
  };

  const statCards = stats && [
    { icon: Sparkles, label: t.home.statSpaces, value: stats.spaces },
    { icon: Users, label: t.home.statPeople, value: stats.people },
    { icon: CalendarClock, label: t.home.statCalls, value: stats.callsThisWeek },
    { icon: Clock, label: t.home.statMinutes, value: stats.minutesTogether },
  ];

  return (
    <AppShell active="home">
      <div className="page">
        <header className="home-hero">
          <h1 className="display">{t.home.greeting(dayPart(), user?.displayName ?? '')}</h1>
          <p className="muted lead">{t.home.subtitle}</p>
          <div className="home-actions">
            <button className="action-tile action-primary" onClick={startNow} disabled={starting}>
              <span className="action-icon">
                <Zap size={24} />
              </span>
              <span className="action-text">
                <strong>{t.home.startNow}</strong>
                <span>{t.home.startNowHint}</span>
              </span>
            </button>
            <button className="action-tile" onClick={() => setCreating(true)}>
              <span className="action-icon">
                <Plus size={24} />
              </span>
              <span className="action-text">
                <strong>{t.home.newSpace}</strong>
                <span>{t.kinds.hangout.name} · {t.kinds.meeting.name} · {t.kinds.class.name} · {t.kinds.event.name}</span>
              </span>
            </button>
            <form className="paste-join" onSubmit={joinPasted}>
              <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t.home.pastePlaceholder} dir="auto" aria-label={t.home.pastePlaceholder} />
              <Button icon={ArrowRight} disabled={!paste.trim()} aria-label={t.home.joinNow}>
                {t.home.joinNow}
              </Button>
            </form>
          </div>
        </header>

        {live.length > 0 && (
          <section className="live-strip">
            {live.map((s) => (
              <div className="live-banner" key={s.id}>
                <Radio size={20} />
                <span className="live-emoji">{s.emoji}</span>
                <div>
                  <strong>{t.home.liveNow}</strong>
                  <span>{s.title}</span>
                </div>
                <Button icon={Video} onClick={() => open(s)}>
                  {s.isHost ? t.home.rejoin : t.home.joinNow}
                </Button>
              </div>
            ))}
          </section>
        )}

        {statCards && (
          <div className="stats">
            {statCards.map(({ icon: Icon, label, value }) => (
              <div className="stat" key={label}>
                <Icon size={18} />
                <strong>{value}</strong>
                <span className="muted small">{label}</span>
              </div>
            ))}
          </div>
        )}

        {!spaces && !error && <Spinner />}
        {spaces?.length === 0 && (
          <EmptyState
            icon={Sparkles}
            title={t.home.emptyTitle}
            text={t.home.emptyText}
            action={
              <Button icon={Plus} onClick={() => setCreating(true)}>
                {t.home.newSpace}
              </Button>
            }
          />
        )}

        {hosted.length > 0 && (
          <>
            <h2 className="section-title">{t.home.yourSpaces}</h2>
            <div className="space-grid">
              {hosted.map((s) => (
                <SpaceCard key={s.id} space={s} onOpen={() => open(s)} onInvite={() => setInviting(s)} onDetails={() => navigate({ name: 'space', id: s.id })} />
              ))}
            </div>
          </>
        )}
        {joined.length > 0 && (
          <>
            <h2 className="section-title">{t.home.joined}</h2>
            <div className="space-grid">
              {joined.map((s) => (
                <SpaceCard key={s.id} space={s} onOpen={() => open(s)} />
              ))}
            </div>
          </>
        )}
      </div>

      {creating && (
        <SpaceFormModal
          onClose={() => setCreating(false)}
          onSaved={(s) => {
            setCreating(false);
            reload();
            setInviting(s);
          }}
        />
      )}
      {inviting && (
        <Modal title={`${t.space.invite} · ${inviting.emoji} ${inviting.title}`} onClose={() => setInviting(null)}>
          <InviteBox space={inviting} onChange={(s) => (setInviting(s), reload())} />
        </Modal>
      )}
    </AppShell>
  );
}

function SpaceCard({ space: s, onOpen, onInvite, onDetails }: { space: SpaceDto; onOpen: () => void; onInvite?: () => void; onDetails?: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  return (
    <article
      className={`space-card ${onDetails ? 'is-clickable' : ''}`}
      style={{ '--space-color': s.color } as React.CSSProperties}
      onClick={onDetails}
      onKeyDown={(e) => onDetails && e.key === 'Enter' && onDetails()}
      tabIndex={onDetails ? 0 : undefined}
    >
      <div className="space-card-top">
        <span className="space-emoji">{s.emoji}</span>
        <div className="row">
          {s.hasPassword && (
            <span className="icon-chip" title={t.home.locked}>
              <Lock size={13} />
            </span>
          )}
          {s.live ? <Badge tone="live">● {t.home.live}</Badge> : <Badge>{t.kinds[s.kind].name}</Badge>}
        </div>
      </div>
      <h3>{s.title}</h3>
      <p className="muted small">{s.isHost ? s.schedule || t.kinds[s.kind].name : t.home.hostedBy(s.hostName)}</p>
      <p className="muted small icon-line">
        <Users size={14} /> {t.home.people(s.peopleCount)} · {s.lastCallAt ? t.home.lastCall(formatRelative(s.lastCallAt, settings.lang)) : t.home.neverHeld}
      </p>
      <div className="space-card-actions" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" icon={Play} disabled={!s.isHost && !s.live} onClick={onOpen}>
          {s.isHost ? (s.live ? t.home.rejoin : t.home.start) : t.home.joinNow}
        </Button>
        {onInvite && (
          <Button size="sm" variant="secondary" icon={Send} onClick={onInvite}>
            {t.home.invite}
          </Button>
        )}
      </div>
    </article>
  );
}
