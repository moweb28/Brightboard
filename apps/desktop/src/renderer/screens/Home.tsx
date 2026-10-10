import { extractRoomCode, generateRoomCode, KIND_PRESETS, SPACE_COLORS, upcomingMeetings, type Space } from '@classroom/protocol';
import { ArrowRight, CalendarDays, LogIn, Play, Plus, Send, Sparkles, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { InviteBox } from '../components/InviteBox';
import { AppShell, useRailSpaces } from '../components/layout';
import { SpaceFormModal } from '../components/SpaceFormModal';
import { useToast } from '../components/toast';
import { Badge, Button, EmptyState, Modal, SpaceIcon } from '../components/ui';
import { dayPart, formatDay, formatRelative, formatSchedule, formatTime } from '../lib/format';
import { useNavigate } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { useProfile, useStore } from '../lib/store';
import { useOpenCall } from '../lib/useOpenCall';

/** The current time, updated on each new second. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      id = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    id = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => clearTimeout(id);
  }, []);
  return now;
}

export function Home({ newSpace }: { newSpace?: boolean }) {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const openCall = useOpenCall();
  const profile = useProfile();
  const { settings } = useSettings();
  const { data, live } = useStore();
  const now = useNow();
  const [creating, setCreating] = useState(!!newSpace);
  const [inviting, setInviting] = useState<Space | null>(null);
  const [paste, setPaste] = useState('');
  const [starting, setStarting] = useState(false);
  const spaces = data?.spaces ?? [];
  const joined = data?.joined ?? [];
  const railIds = new Map(useRailSpaces().map((s) => [s.code, s.id]));

  useEffect(() => setCreating(!!newSpace), [newSpace]);

  // An instant call is a throwaway space: nothing is saved unless you create a real one.
  const startNow = async () => {
    setStarting(true);
    const quick: Space = {
      ...KIND_PRESETS.hangout,
      id: `quick-${Date.now()}`,
      code: generateRoomCode(),
      title: t.home.quickCall(profile.name),
      color: SPACE_COLORS[0],
      picture: null,
      kind: 'hangout',
      schedule: null,
      password: '',
      adminKey: globalThis.crypto.randomUUID(),
      createdAt: Date.now(),
    };
    if (!(await openCall({ admin: quick }))) setStarting(false);
  };

  const joinPasted = (e: React.FormEvent) => {
    e.preventDefault();
    const code = extractRoomCode(paste);
    if (!code) return toast({ text: t.errors.badCode, tone: 'warn' });
    void openCall({ code });
  };

  const upcoming = upcomingMeetings(
    [...spaces.map((s) => ({ ...s, admin: true })), ...joined.map((j) => ({ ...j, admin: false }))],
    now,
    7,
  ).slice(0, 6);

  const openUpcoming = (item: (typeof upcoming)[number]['item']) => {
    if (item.admin) void openCall({ admin: item as unknown as Space });
    else void openCall({ code: item.code });
  };

  const when = (m: (typeof upcoming)[number]) => {
    if (m.now) return t.home.happeningNow;
    const mins = (m.start.getTime() - now.getTime()) / 60_000;
    if (mins <= 60) return formatRelative(m.start.getTime(), settings.lang);
    return `${formatDay(m.start, settings.lang, now)}, ${formatTime(m.start.getTime(), settings.lang)}`;
  };

  return (
    <AppShell active="home">
      <div className="page">
        <header className="home-head">
          <div className="clock" aria-live="off">
            <time className="clock-time" dateTime={now.toISOString()}>
              {now.toLocaleTimeString(settings.lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' })}
            </time>
            <span className="clock-date">{now.toLocaleDateString(settings.lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
          <p className="home-greeting">{t.home.greeting(dayPart(), profile.name)}</p>
        </header>

        <div className="home-actions">
          <Button size="lg" icon={Zap} onClick={startNow} loading={starting} title={t.home.startNowHint}>
            {t.home.startNow}
          </Button>
          <Button size="lg" variant="secondary" icon={Plus} onClick={() => setCreating(true)}>
            {t.home.newSpace}
          </Button>
          <form className="paste-join" onSubmit={joinPasted}>
            <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t.home.pastePlaceholder} dir="auto" aria-label={t.home.pastePlaceholder} />
            <Button size="sm" icon={ArrowRight} disabled={!paste.trim()}>
              {t.home.joinNow}
            </Button>
          </form>
        </div>

        <section className="stack-tight">
          <h2 className="section-title icon-line">
            <CalendarDays size={18} /> {t.home.upcoming}
          </h2>
          {upcoming.length === 0 ? (
            <p className="muted upcoming-empty">{t.home.nothingUpcoming}</p>
          ) : (
            <ol className="upcoming">
              {upcoming.map((m) => (
                <li key={m.item.code} className={`upcoming-row ${m.now ? 'is-now' : ''}`}>
                  <button className="upcoming-main" onClick={() => navigate({ name: 'space', id: railIds.get(m.item.code) ?? '' })}>
                    <SpaceIcon title={m.item.title} color={m.item.color} picture={m.item.picture} size={40} />
                    <span className="upcoming-text">
                      <strong>{m.item.title}</strong>
                      <span className="muted small">{m.item.admin ? t.kinds[m.item.kind].name : t.home.hostedBy((m.item as { adminName: string }).adminName)}</span>
                    </span>
                    <span className="upcoming-when">{when(m)}</span>
                  </button>
                  <Button size="sm" variant={m.now ? 'success' : 'secondary'} icon={m.item.admin ? Play : LogIn} onClick={() => openUpcoming(m.item)}>
                    {m.item.admin ? (live.has(m.item.code) ? t.home.rejoin : t.home.start) : t.home.joinNow}
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {spaces.length === 0 && joined.length === 0 && (
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

        {spaces.length > 0 && (
          <>
            <h2 className="section-title">{t.home.yourSpaces}</h2>
            <div className="space-grid">
              {spaces.map((s) => (
                <SpaceCard
                  key={s.id}
                  title={s.title}
                  color={s.color}
                  picture={s.picture}
                  badge={live.has(s.code) ? <Badge tone="live">{t.home.live}</Badge> : <Badge>{t.kinds[s.kind].name}</Badge>}
                  line={s.schedule ? formatSchedule(s.schedule, settings.lang) : t.spaceForm.scheduleOff}
                  onOpen={() => navigate({ name: 'space', id: s.id })}
                  actions={
                    <>
                      <Button size="sm" icon={Play} onClick={() => void openCall({ admin: s })}>
                        {live.has(s.code) ? t.home.rejoin : t.home.start}
                      </Button>
                      <Button size="sm" variant="secondary" icon={Send} onClick={() => setInviting(s)}>
                        {t.home.invite}
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          </>
        )}
        {joined.length > 0 && (
          <>
            <h2 className="section-title">{t.home.joined}</h2>
            <div className="space-grid">
              {joined.map((j) => (
                <SpaceCard
                  key={j.code}
                  title={j.title}
                  color={j.color}
                  picture={j.picture}
                  badge={live.has(j.code) ? <Badge tone="live">{t.home.live}</Badge> : <Badge>{t.kinds[j.kind].name}</Badge>}
                  line={t.home.hostedBy(j.adminName)}
                  onOpen={() => navigate({ name: 'space', id: `j:${j.code}` })}
                  actions={
                    <Button size="sm" icon={LogIn} onClick={() => void openCall({ code: j.code })}>
                      {t.home.joinNow}
                    </Button>
                  }
                />
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
            setInviting(s);
          }}
        />
      )}
      {inviting && (
        <Modal title={`${t.space.invite}: ${inviting.title}`} onClose={() => setInviting(null)}>
          <InviteBox space={inviting} />
        </Modal>
      )}
    </AppShell>
  );
}

function SpaceCard(props: { title: string; color: string; picture: string | null; badge: React.ReactNode; line: string; onOpen: () => void; actions: React.ReactNode }) {
  return (
    <article
      className="space-card is-clickable"
      style={{ '--space-color': props.color } as React.CSSProperties}
      onClick={props.onOpen}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && props.onOpen()}
      tabIndex={0}
    >
      <div className="space-banner">{props.badge}</div>
      <div className="space-body">
        <span className="space-card-icon">
          <SpaceIcon title={props.title} color={props.color} picture={props.picture} size={56} />
        </span>
        <h3>{props.title}</h3>
        <p className="muted small">{props.line}</p>
        <div className="space-card-actions" onClick={(e) => e.stopPropagation()}>
          {props.actions}
        </div>
      </div>
    </article>
  );
}
