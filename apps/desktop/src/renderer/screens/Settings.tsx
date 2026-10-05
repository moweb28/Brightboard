import { AVATAR_COLORS, USE_CASES, type UseCase } from '@classroom/protocol';
import { Bell, Check, Languages, LogOut, Palette, ShieldCheck, User, Video } from 'lucide-react';
import { useState } from 'react';
import { LanguagePicker, ScenePicker, ThemePicker } from '../components/AppearancePicker';
import { DeviceCheck } from '../components/DeviceCheck';
import { AppShell } from '../components/layout';
import { useToast } from '../components/toast';
import { Avatar, Button, ColorPicker, ErrorText, Field, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BACKGROUND_IMAGES, backgroundsSupported } from '../lib/effects';
import { BACKGROUNDS, useSettings, useT } from '../lib/settings';
import { USE_CASE_ICONS } from './Onboarding';
import { useAsync } from '../lib/useAsync';

type Section = 'profile' | 'appearance' | 'language' | 'audioVideo' | 'notifications' | 'account';

export function SettingsPage() {
  const t = useT();
  const [section, setSection] = useState<Section>('profile');
  const sections: { id: Section; icon: typeof User; label: string }[] = [
    { id: 'profile', icon: User, label: t.settings.profile },
    { id: 'appearance', icon: Palette, label: t.settings.appearance },
    { id: 'language', icon: Languages, label: t.settings.language },
    { id: 'audioVideo', icon: Video, label: t.settings.audioVideo },
    { id: 'notifications', icon: Bell, label: t.settings.notifications },
    { id: 'account', icon: ShieldCheck, label: t.settings.account },
  ];
  return (
    <AppShell active="settings">
      <div className="page">
        <header className="page-head">
          <h1>{t.settings.title}</h1>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label={t.settings.title}>
            {sections.map(({ id, icon: Icon, label }) => (
              <button key={id} className={`nav-item ${section === id ? 'is-active' : ''}`} onClick={() => setSection(id)}>
                <Icon size={19} />
                {label}
              </button>
            ))}
          </nav>
          <div className="settings-content card card-pad">
            <h2 className="card-title">{sections.find((s) => s.id === section)!.label}</h2>
            {section === 'profile' && <ProfileSection />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'language' && (
              <div className="stack">
                <p className="muted">{t.settings.languageText}</p>
                <LanguagePicker />
              </div>
            )}
            {section === 'audioVideo' && <AudioVideoSection />}
            {section === 'notifications' && <NotificationsSection />}
            {section === 'account' && <AccountSection />}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ProfileSection() {
  const t = useT();
  const toast = useToast();
  const { user, update } = useAuth();
  const [displayName, setDisplayName] = useState(user!.displayName);
  const [avatarColor, setAvatarColor] = useState(user!.avatarColor);
  const [about, setAbout] = useState(user!.about);
  const [useCases, setUseCases] = useState<UseCase[]>(user!.useCases);
  const { busy, error, run } = useAsync();
  const toggleUse = (u: UseCase) => setUseCases((list) => (list.includes(u) ? list.filter((x) => x !== u) : [...list, u]));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await update({ displayName: displayName.trim(), avatarColor, about: about.trim(), useCases });
      toast({ text: t.common.saved, icon: Check, tone: 'success' });
    });
  };
  return (
    <form className="stack" onSubmit={save}>
      <div className="profile-preview">
        <Avatar name={displayName || '?'} color={avatarColor} size={80} ring />
      </div>
      <Field label={t.onboarding.displayName} maxLength={40} required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <ColorPicker label={t.onboarding.avatarColor} colors={AVATAR_COLORS} value={avatarColor} onChange={setAvatarColor} />
      <Field label={t.onboarding.about} placeholder={t.onboarding.aboutPlaceholder} maxLength={120} value={about} onChange={(e) => setAbout(e.target.value)} />
      <div className="field">
        <span className="field-label">{t.onboarding.useTitle}</span>
        <div className="choice-grid">
          {USE_CASES.map((u) => {
            const Icon = USE_CASE_ICONS[u];
            const on = useCases.includes(u);
            return (
              <button key={u} type="button" aria-pressed={on} className={`choice ${on ? 'is-active' : ''}`} onClick={() => toggleUse(u)}>
                <span className="choice-icon">
                  <Icon size={20} />
                </span>
                <span>{t.useCases[u]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <ErrorText code={error} />
      <div>
        <Button loading={busy} disabled={!displayName.trim()}>
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

function AppearanceSection() {
  const t = useT();
  return (
    <div className="stack">
      <div className="field">
        <span className="field-label">{t.settings.themeMode}</span>
        <ThemePicker />
      </div>
      <div className="field">
        <span className="field-label">{t.settings.scene}</span>
        <ScenePicker />
      </div>
    </div>
  );
}

function AudioVideoSection() {
  const t = useT();
  const { user } = useAuth();
  const { settings, set } = useSettings();
  const supported = backgroundsSupported();
  return (
    <div className="stack">
      <DeviceCheck name={user!.displayName} color={user!.avatarColor} />
      <div className="field">
        <span className="field-label">{t.settings.background}</span>
        {supported ? (
          <div className="bg-grid" role="radiogroup" aria-label={t.settings.background}>
            {BACKGROUNDS.map((bg) => (
              <button key={bg} role="radio" aria-checked={settings.background === bg} className={`bg-option ${settings.background === bg ? 'is-active' : ''}`} onClick={() => set('background', bg)}>
                <span className={`bg-thumb bg-thumb-${bg}`} style={BACKGROUND_IMAGES[bg] ? { backgroundImage: `url(${BACKGROUND_IMAGES[bg]})` } : undefined} />
                <span className="small">{t.settings.backgrounds[bg]}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">{t.settings.backgroundUnsupported}</p>
        )}
      </div>
      <Toggle label={t.settings.mirrorVideo} description={t.settings.mirrorVideoDesc} checked={settings.mirror} onChange={(v) => set('mirror', v)} />
      <Toggle label={t.settings.joinMuted} checked={settings.joinMuted} onChange={(v) => set('joinMuted', v)} />
      <Toggle label={t.settings.joinCameraOff} checked={settings.joinCameraOff} onChange={(v) => set('joinCameraOff', v)} />
    </div>
  );
}

function NotificationsSection() {
  const t = useT();
  const { settings, set } = useSettings();
  return (
    <div className="stack">
      <p className="muted">{t.settings.sounds}</p>
      <Toggle label={t.settings.soundChat} checked={settings.soundChat} onChange={(v) => set('soundChat', v)} />
      <Toggle label={t.settings.soundJoin} checked={settings.soundJoin} onChange={(v) => set('soundJoin', v)} />
      <Toggle label={t.settings.soundHand} checked={settings.soundHand} onChange={(v) => set('soundHand', v)} />
    </div>
  );
}

function AccountSection() {
  const t = useT();
  const toast = useToast();
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const { busy, error, run } = useAsync();
  const change = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast({ text: t.settings.passwordChanged, icon: Check, tone: 'success' });
    });
  };
  return (
    <div className="stack">
      <dl className="info-list">
        <dt>{t.settings.email}</dt>
        <dd dir="ltr">{user!.email}</dd>
      </dl>
      <form className="stack" onSubmit={change}>
        <h3>{t.settings.changePassword}</h3>
        <div className="grid-2">
          <Field label={t.settings.currentPassword} type="password" dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <Field label={t.settings.newPassword} type="password" dir="ltr" autoComplete="new-password" minLength={8} hint={t.auth.passwordHint} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <ErrorText code={error} />
        <div>
          <Button variant="secondary" loading={busy}>
            {t.settings.changePassword}
          </Button>
        </div>
      </form>
      <hr className="sep" />
      <div>
        <Button variant="danger" icon={LogOut} onClick={logout}>
          {t.common.logOut}
        </Button>
      </div>
    </div>
  );
}
