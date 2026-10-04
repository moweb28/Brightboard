import { AVATAR_COLORS } from '@classroom/protocol';
import { ArrowLeft, ArrowRight, LayoutDashboard, Link2, PartyPopper, Plus } from 'lucide-react';
import { useState } from 'react';
import { LanguagePicker, ScenePicker, ThemePicker } from '../components/AppearancePicker';
import { DeviceCheck } from '../components/DeviceCheck';
import { Logo, QuickPrefs } from '../components/layout';
import { Avatar, Button, ColorPicker, ErrorText, Field } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useNavigate } from '../lib/nav';
import { useT } from '../lib/settings';
import { useAsync } from '../lib/useAsync';

const STEPS = 5;

export function Onboarding() {
  const t = useT();
  const { user, update } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState({
    displayName: user?.displayName ?? '',
    avatarColor: user?.avatarColor ?? AVATAR_COLORS[0],
    school: user?.school ?? '',
    subject: user?.subject ?? '',
    grade: user?.grade ?? '',
  });
  const { busy, error, run } = useAsync();
  if (!user) return null;
  const isTeacher = user.role === 'teacher';
  const field = (key: keyof typeof profile) => ({ value: profile[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setProfile({ ...profile, [key]: e.target.value }) });

  const finish = (next: Parameters<typeof navigate>[0]) =>
    run(async () => {
      await update({ ...profile, displayName: profile.displayName.trim(), onboarded: true });
      navigate(next);
    });

  const canContinue = step !== 1 || profile.displayName.trim().length > 0;

  return (
    <div className="onboarding">
      <header className="onboarding-top">
        <Logo small />
        <QuickPrefs />
      </header>
      <div className="onboarding-card card">
        <div className="progress" aria-label={t.onboarding.stepOf(step, STEPS)}>
          <span style={{ width: `${(step / STEPS) * 100}%` }} />
        </div>
        <p className="muted small">{t.onboarding.stepOf(step, STEPS)}</p>

        {step === 1 && (
          <section className="stack">
            <header className="heading">
              <h2>{t.onboarding.profileTitle}</h2>
              <p className="muted">{t.onboarding.profileText}</p>
            </header>
            <div className="profile-preview">
              <Avatar name={profile.displayName || '?'} color={profile.avatarColor} size={88} ring />
            </div>
            <Field label={t.onboarding.displayName} maxLength={40} autoFocus required {...field('displayName')} />
            <ColorPicker label={t.onboarding.avatarColor} colors={AVATAR_COLORS} value={profile.avatarColor} onChange={(c) => setProfile({ ...profile, avatarColor: c })} />
          </section>
        )}

        {step === 2 && (
          <section className="stack">
            <header className="heading">
              <h2>{isTeacher ? t.onboarding.aboutTeacherTitle : t.onboarding.aboutStudentTitle}</h2>
              <p className="muted">{t.onboarding.aboutText}</p>
            </header>
            <Field label={t.onboarding.school} placeholder={t.onboarding.schoolPlaceholder} maxLength={80} {...field('school')} />
            {isTeacher ? (
              <Field label={t.onboarding.subject} placeholder={t.onboarding.subjectPlaceholder} maxLength={60} {...field('subject')} />
            ) : (
              <Field label={t.onboarding.grade} placeholder={t.onboarding.gradePlaceholder} maxLength={40} {...field('grade')} />
            )}
          </section>
        )}

        {step === 3 && (
          <section className="stack">
            <header className="heading">
              <h2>{t.onboarding.lookTitle}</h2>
              <p className="muted">{t.onboarding.lookText}</p>
            </header>
            <div className="field">
              <span className="field-label">{t.settings.themeMode}</span>
              <ThemePicker />
            </div>
            <div className="field">
              <span className="field-label">{t.settings.scene}</span>
              <ScenePicker />
            </div>
            <div className="field">
              <span className="field-label">{t.settings.language}</span>
              <LanguagePicker />
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="stack">
            <header className="heading">
              <h2>{t.onboarding.devicesTitle}</h2>
              <p className="muted">{t.onboarding.devicesText}</p>
            </header>
            <DeviceCheck name={profile.displayName} color={profile.avatarColor} />
          </section>
        )}

        {step === 5 && (
          <section className="stack done-step">
            <span className="done-icon">
              <PartyPopper size={36} />
            </span>
            <h2>{isTeacher ? t.onboarding.doneTeacherTitle : t.onboarding.doneStudentTitle}</h2>
            <p className="muted">{isTeacher ? t.onboarding.doneTeacherText : t.onboarding.doneStudentText}</p>
            <ErrorText code={error} />
            <div className="row-wrap center">
              {isTeacher ? (
                <Button size="lg" icon={Plus} loading={busy} onClick={() => finish({ name: 'home', newClass: true })}>
                  {t.onboarding.createFirstClass}
                </Button>
              ) : (
                <Button size="lg" icon={Link2} loading={busy} onClick={() => finish({ name: 'join' })}>
                  {t.nav.joinClass}
                </Button>
              )}
              <Button size="lg" variant="secondary" icon={LayoutDashboard} disabled={busy} onClick={() => finish({ name: 'home' })}>
                {t.onboarding.goToDashboard}
              </Button>
            </div>
          </section>
        )}

        {step < STEPS && (
          <footer className="onboarding-nav">
            {step > 1 ? (
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(step - 1)}>
                {t.common.back}
              </Button>
            ) : (
              <span />
            )}
            <div className="row">
              {(step === 2 || step === 4) && (
                <Button variant="link" onClick={() => setStep(step + 1)}>
                  {t.common.skip}
                </Button>
              )}
              <Button onClick={() => setStep(step + 1)} disabled={!canContinue}>
                {t.common.continue}
                <ArrowRight size={18} className="flip-rtl" />
              </Button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
