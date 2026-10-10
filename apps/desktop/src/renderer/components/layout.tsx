import { Home, Languages, LogIn, Moon, Plus, Settings as SettingsIcon, Sun, Volume2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import icon from '../../../build/icon.svg';
import { useNavigate, type Route } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { useProfile, useStore } from '../lib/store';
import { Avatar, IconButton, SpaceIcon } from './ui';

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={small ? 'logo logo-small' : 'logo'}>
      <img src={icon} alt="" />
      <span>Brightboard</span>
    </div>
  );
}

/** Quick language + theme switches for the first-launch setup. */
export function QuickPrefs() {
  const { settings, set, resolvedTheme } = useSettings();
  const t = useT();
  return (
    <div className="quick-prefs">
      <button className="chip-btn" onClick={() => set('lang', settings.lang === 'en' ? 'ar' : 'en')} lang={settings.lang === 'en' ? 'ar' : 'en'}>
        <Languages size={16} />
        {settings.lang === 'en' ? 'العربية' : 'English'}
      </button>
      <button
        className="chip-btn"
        onClick={() => set('theme', resolvedTheme === 'dark' ? 'light' : 'dark')}
        aria-label={resolvedTheme === 'dark' ? t.settings.light : t.settings.dark}
        title={resolvedTheme === 'dark' ? t.settings.light : t.settings.dark}
      >
        {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  );
}

/** One entry in the rail and the "Live now" list: your own spaces and the ones you joined. */
export interface RailSpace {
  /** Route id: the local id for your spaces, `j:CODE` for joined ones. */
  id: string;
  code: string;
  title: string;
  color: string;
  picture: string | null;
}

export function useRailSpaces(): RailSpace[] {
  const { data } = useStore();
  if (!data) return [];
  return [
    ...data.spaces.map((s) => ({ id: s.id, code: s.code, title: s.title, color: s.color, picture: s.picture })),
    ...data.joined.map((j) => ({ id: `j:${j.code}`, code: j.code, title: j.title, color: j.color, picture: j.picture })),
  ];
}

/** Rail of spaces | sidebar | page. */
export function AppShell({ active, spaceId, children }: { active: Route['name']; spaceId?: string; children: ReactNode }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const t = useT();
  const { live } = useStore();
  const spaces = useRailSpaces();
  const items = [
    { route: { name: 'home' } as Route, icon: Home, label: t.nav.home },
    { route: { name: 'join' } as Route, icon: LogIn, label: t.nav.join },
    { route: { name: 'settings' } as Route, icon: SettingsIcon, label: t.nav.settings },
  ];
  const liveSpaces = spaces.filter((s) => live.has(s.code));
  return (
    <div className="app-shell">
      <SpaceRail spaces={spaces} activeId={active === 'space' ? spaceId : undefined} homeActive={active === 'home'} />
      <nav className="sidebar" aria-label="Main">
        <div className="sidebar-head">Brightboard</div>
        <div className="sidebar-scroll">
          <div className="nav-list">
            {items.map(({ route, icon: Icon, label }) => (
              <button key={route.name} className={`nav-item ${active === route.name ? 'is-active' : ''}`} onClick={() => navigate(route)}>
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>
          {liveSpaces.length > 0 && (
            <div className="nav-group">
              <div className="nav-group-title">{t.home.liveNow}</div>
              {liveSpaces.map((s) => (
                <button key={s.id} className="voice-row" onClick={() => navigate({ name: 'space', id: s.id })}>
                  <Volume2 size={18} />
                  <span>{s.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="user-panel">
          <button className="user-panel-who" onClick={() => navigate({ name: 'settings' })}>
            <Avatar name={profile.name} color={profile.color} picture={profile.picture} size={34} />
            <span className="status-dot" aria-hidden />
            <span className="user-card-text">
              <strong>{profile.name}</strong>
              {profile.about && <span className="muted small">{profile.about}</span>}
            </span>
          </button>
          <IconButton icon={SettingsIcon} label={t.nav.settings} onClick={() => navigate({ name: 'settings' })} />
        </div>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}

/** Discord-style column of space icons: a pill marks the open one, a green dot marks a live call. */
function SpaceRail({ spaces, activeId, homeActive }: { spaces: RailSpace[]; activeId?: string; homeActive: boolean }) {
  const navigate = useNavigate();
  const t = useT();
  const { live } = useStore();
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const showTip = (text: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const rtl = document.documentElement.dir === 'rtl';
    setTip({ text, top: r.top + r.height / 2, left: rtl ? r.left - 12 : r.right + 12 });
  };
  const tipProps = (text: string) => ({
    'aria-label': text,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(text, e.currentTarget),
    onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(text, e.currentTarget),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  });
  return (
    <aside className="rail" aria-label={t.home.yourSpaces}>
      <div className={`rail-item ${homeActive ? 'is-active' : ''}`}>
        <span className="rail-pill" />
        <button className="rail-btn rail-home" onClick={() => navigate({ name: 'home' })} {...tipProps(t.nav.home)}>
          <img src={icon} alt="" />
        </button>
      </div>
      <div className="rail-sep" />
      {spaces.map((s) => (
        <div key={s.id} className={`rail-item ${s.id === activeId ? 'is-active' : ''} ${live.has(s.code) ? 'is-live' : ''}`}>
          <span className="rail-pill" />
          <button className="rail-btn rail-space" onClick={() => navigate({ name: 'space', id: s.id })} {...tipProps(s.title)}>
            <SpaceIcon title={s.title} color={s.color} picture={s.picture} size={48} />
            {live.has(s.code) && <span className="rail-live" />}
          </button>
        </div>
      ))}
      <div className="rail-item">
        <span className="rail-pill" />
        <button className="rail-btn rail-add" onClick={() => navigate({ name: 'home', newSpace: true })} {...tipProps(t.home.newSpace)}>
          <Plus size={24} />
        </button>
      </div>
      {tip && (
        <div className="rail-tip" style={{ top: tip.top, ...(document.documentElement.dir === 'rtl' ? { right: window.innerWidth - tip.left } : { left: tip.left }) }}>
          {tip.text}
        </div>
      )}
    </aside>
  );
}
