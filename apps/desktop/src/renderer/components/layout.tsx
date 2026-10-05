import { Home, Languages, LogIn, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import icon from '../../../build/icon.svg';
import { useAuth } from '../lib/auth';
import { useNavigate, type Route } from '../lib/nav';
import { useSettings, useT } from '../lib/settings';
import { Avatar } from './ui';

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={small ? 'logo logo-small' : 'logo'}>
      <img src={icon} alt="" />
      <span>Brightboard</span>
    </div>
  );
}

/** Quick language + theme switches for screens before login. */
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

/** Brand panel + content panel, used before the user is inside the app. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="auth-layout">
      <aside className="hero">
        <Logo />
        <div className="hero-copy">
          <h1>
            {t.welcome.heroLine1}
            <br />
            <span className="hero-accent">{t.welcome.heroLine2}</span>
          </h1>
          <ul className="hero-points">
            {t.welcome.heroPoints.map((p) => (
              <li key={p}>
                <span className="tick" aria-hidden>
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="hero-sun" aria-hidden />
        <div className="hero-board" aria-hidden>
          <span />
          <span />
        </div>
      </aside>
      <main className="auth-panel">
        <div className="auth-top">
          <QuickPrefs />
        </div>
        <div className="auth-body">{children}</div>
      </main>
    </div>
  );
}

/** Sidebar layout for logged-in screens. */
export function AppShell({ active, children }: { active: Route['name']; children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  if (!user) return null;
  const items = [
    { route: { name: 'home' } as Route, icon: Home, label: t.nav.home },
    { route: { name: 'join' } as Route, icon: LogIn, label: t.nav.join },
    { route: { name: 'settings' } as Route, icon: SettingsIcon, label: t.nav.settings },
  ];
  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label="Main">
        <Logo small />
        <div className="nav-list">
          {items
            .map(({ route, icon: Icon, label }) => (
              <button
                key={route.name}
                className={`nav-item ${active === route.name || (route.name === 'home' && active === 'space') ? 'is-active' : ''}`}
                onClick={() => navigate(route)}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
        </div>
        <button className="user-card" onClick={() => navigate({ name: 'settings' })}>
          <Avatar name={user.displayName} color={user.avatarColor} size={38} />
          <span className="user-card-text">
            <strong>{user.displayName}</strong>
            {user.about && <span className="muted small">{user.about}</span>}
          </span>
        </button>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}
