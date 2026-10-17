import { AVATAR_COLORS } from '@classroom/protocol';
import { Bell, Check, CircleDot, HardDrive, Languages, Palette, User, Video } from 'lucide-react';
import { useState } from 'react';
import { LanguagePicker, ScenePicker, ThemePicker } from '../components/AppearancePicker';
import { DeviceCheck } from '../components/DeviceCheck';
import { AppShell } from '../components/layout';
import { useToast } from '../components/toast';
import { PicturePicker } from '../components/PicturePicker';
import { Avatar, Button, ColorPicker, Field, Segmented, Toggle } from '../components/ui';
import { BACKGROUND_IMAGES, backgroundsSupported } from '../lib/effects';
import { BACKGROUNDS, useSettings, useT } from '../lib/settings';
import { useProfile, useStore } from '../lib/store';

type Section = 'profile' | 'appearance' | 'language' | 'audioVideo' | 'sessions' | 'notifications' | 'data';

export function SettingsPage() {
  const t = useT();
  const [section, setSection] = useState<Section>('profile');
  const sections: { id: Section; icon: typeof User; label: string }[] = [
    { id: 'profile', icon: User, label: t.settings.profile },
    { id: 'appearance', icon: Palette, label: t.settings.appearance },
    { id: 'language', icon: Languages, label: t.settings.language },
    { id: 'audioVideo', icon: Video, label: t.settings.audioVideo },
    { id: 'sessions', icon: CircleDot, label: t.recording.section },
    { id: 'notifications', icon: Bell, label: t.settings.notifications },
    { id: 'data', icon: HardDrive, label: t.settings.yourData },
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
            {section === 'sessions' && <SessionsSection />}
            {section === 'notifications' && <NotificationsSection />}
            {section === 'data' && <p className="muted">{t.settings.dataNote}</p>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ProfileSection() {
  const t = useT();
  const toast = useToast();
  const profile = useProfile();
  const { setProfile } = useStore();
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color);
  const [picture, setPicture] = useState(profile.picture);
  const [about, setAbout] = useState(profile.about);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setProfile({ ...profile, name: name.trim(), color, picture, about: about.trim() });
    toast({ text: t.common.saved, icon: Check, tone: 'success' });
  };
  return (
    <form className="stack" onSubmit={save}>
      <PicturePicker preview={<Avatar name={name || '?'} color={color} picture={picture} size={80} />} value={picture} onChange={setPicture} />
      <Field label={t.onboarding.displayName} placeholder={t.onboarding.displayNamePlaceholder} maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} />
      {!picture && <ColorPicker label={t.onboarding.avatarColor} colors={AVATAR_COLORS} value={color} onChange={setColor} />}
      <Field label={t.onboarding.about} placeholder={t.onboarding.aboutPlaceholder} maxLength={120} value={about} onChange={(e) => setAbout(e.target.value)} />
      <div>
        <Button disabled={!name.trim()}>{t.common.save}</Button>
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
  const profile = useProfile();
  const { settings, set } = useSettings();
  const supported = backgroundsSupported();
  return (
    <div className="stack">
      <DeviceCheck name={profile.name} color={profile.color} picture={profile.picture} />
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

function SessionsSection() {
  const t = useT();
  const { settings, set } = useSettings();
  return (
    <div className="stack">
      <div className="field">
        <span className="field-label">{t.recording.whenAdmin}</span>
        <Segmented
          label={t.recording.whenAdmin}
          value={settings.recordPrompt}
          onChange={(v) => {
            set('recordPrompt', v);
            if (v === 'ask') set('noRecordAsk', []);
          }}
          options={[
            { value: 'ask', label: t.recording.ask },
            { value: 'always', label: t.recording.always },
            { value: 'never', label: t.recording.never },
          ]}
        />
      </div>
      <div className="field">
        <span className="field-label">{t.transcript.who}</span>
        <Segmented
          label={t.transcript.who}
          value={settings.transcriptMode}
          onChange={(v) => set('transcriptMode', v)}
          options={[
            { value: 'me', label: t.transcript.me },
            { value: 'everyone', label: t.transcript.everyone },
          ]}
        />
      </div>
      <div className="field">
        <span className="field-label">{t.transcript.quality}</span>
        <Segmented
          label={t.transcript.quality}
          value={settings.transcriptModel}
          onChange={(v) => set('transcriptModel', v)}
          options={[
            { value: 'standard', label: t.transcript.standard },
            { value: 'accurate', label: t.transcript.accurate },
          ]}
        />
      </div>
      <p className="muted small">{t.transcript.privacy}</p>
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
