import { Home, Languages, LogIn, Moon, PanelLeftClose, PanelLeftOpen, Plus, Settings as SettingsIcon, Sun, Volume2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import icon from '../../../build/icon.svg';
import { useNavigate, type Route } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { useProfile, useStore } from '../lib/store';
import { Avatar, SpaceIcon } from './ui';

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

/** Sidebar | page. */
export function AppShell({ active, spaceId, children }: { active: Route['name']; spaceId?: string; children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar active={active} spaceId={spaceId} />
      <main className={`app-main ${active === 'home' ? 'is-home' : ''}`}>{children}</main>
    </div>
  );
}

/**
 * One sidebar: pages, then your spaces, then you. Folded it's a strip of icons (names show on hover);
 * unfolded the names show too. It remembers how you left it.
 */
function Sidebar({ active, spaceId }: { active: Route['name']; spaceId?: string }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const t = useT();
  const { live } = useStore();
  const { settings, set } = useSettings();
  const open = settings.sidebarOpen;
  const spaces = useRailSpaces();
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const rtl = document.documentElement.dir === 'rtl';
  // Folded, every button names itself in a tooltip (and to screen readers either way).
  const named = (text: string) => ({
    'aria-label': text,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (open) return;
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ text, top: r.top + r.height / 2, left: rtl ? r.left - 12 : r.right + 12 });
    },
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  });
  const go = (route: Route) => {
    setTip(null);
    navigate(route);
  };
  const pages = [
    { route: { name: 'home' } as Route, icon: Home, label: t.nav.home },
    { route: { name: 'join' } as Route, icon: LogIn, label: t.nav.join },
    { route: { name: 'settings' } as Route, icon: SettingsIcon, label: t.nav.settings },
  ];

  return (
    <nav className={`sb ${open ? 'is-open' : ''}`} aria-label="Main">
      <div className="sb-head">
        <button className="sb-logo" onClick={() => go({ name: 'home' })} {...named('Brightboard')}>
          <img src={icon} alt="" />
          <span className="sb-text">Brightboard</span>
        </button>
        <button className="sb-toggle" onClick={() => set('sidebarOpen', !open)} {...named(open ? t.nav.collapse : t.nav.expand)} aria-expanded={open}>
          {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      <div className="sb-scroll">
        <div className="sb-group">
          {pages.map(({ route, icon: Icon, label }) => (
            <button key={route.name} className={`sb-item ${active === route.name ? 'is-active' : ''}`} onClick={() => go(route)} {...named(label)}>
              <span className="sb-icon">
                <Icon size={20} />
              </span>
              <span className="sb-text">{label}</span>
            </button>
          ))}
        </div>

        <div className="sb-group">
          <div className="sb-title">{t.home.yourSpaces}</div>
          {spaces.map((s) => (
            <button key={s.id} className={`sb-item sb-space ${active === 'space' && s.id === spaceId ? 'is-active' : ''}`} onClick={() => go({ name: 'space', id: s.id })} {...named(s.title)}>
              <span className="sb-icon">
                <SpaceIcon title={s.title} color={s.color} picture={s.picture} size={32} />
                {live.has(s.code) && <span className="sb-live" />}
              </span>
              <span className="sb-text">{s.title}</span>
              {live.has(s.code) && (
                <span className="sb-badge">
                  <Volume2 size={13} /> {t.home.liveNow}
                </span>
              )}
            </button>
          ))}
          <button className="sb-item sb-add" onClick={() => go({ name: 'home', newSpace: true })} {...named(t.home.newSpace)}>
            <span className="sb-icon">
              <Plus size={20} />
            </span>
            <span className="sb-text">{t.home.newSpace}</span>
          </button>
        </div>
      </div>

      <button className="sb-item sb-user" onClick={() => go({ name: 'settings' })} {...named(profile.name)}>
        <span className="sb-icon">
          <Avatar name={profile.name} color={profile.color} picture={profile.picture} size={32} />
          <span className="status-dot" aria-hidden />
        </span>
        <span className="sb-text user-card-text">
          <strong>{profile.name}</strong>
          {profile.about && <span className="muted small">{profile.about}</span>}
        </span>
      </button>

      {tip && (
        <div className="rail-tip" style={{ top: tip.top, ...(rtl ? { right: window.innerWidth - tip.left } : { left: tip.left }) }}>
          {tip.text}
        </div>
      )}
    </nav>
  );
}
