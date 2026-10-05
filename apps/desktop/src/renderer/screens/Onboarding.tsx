import { AVATAR_COLORS, USE_CASES, type UseCase } from '@classroom/protocol';
import { ArrowLeft, ArrowRight, Briefcase, Check, GraduationCap, House, PartyPopper, Sparkles, Ticket, Video, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { LanguagePicker, ScenePicker, ThemePicker } from '../components/AppearancePicker';
import { DeviceCheck } from '../components/DeviceCheck';
import { Logo, QuickPrefs } from '../components/layout';
import { Avatar, Button, ColorPicker, ErrorText, Field } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNavigate } from '../lib/nav';
import { useT } from '../lib/settings';
import { useAsync } from '../lib/useAsync';

const STEPS = 5;
export const USE_CASE_ICONS: Record<UseCase, LucideIcon> = { friends: House, work: Briefcase, school: GraduationCap, events: Ticket };

export function Onboarding() {
  const t = useT();
  const { user, update } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor ?? AVATAR_COLORS[0]);
  const [about, setAbout] = useState(user?.about ?? '');
  const [useCases, setUseCases] = useState<UseCase[]>(user?.useCases ?? []);
  const { busy, error, run } = useAsync();
  if (!user) return null;

  const toggleUse = (u: UseCase) => setUseCases((list) => (list.includes(u) ? list.filter((x) => x !== u) : [...list, u]));
  const save = () => update({ displayName: displayName.trim(), avatarColor, about: about.trim(), useCases, onboarded: true });

  const finishHome = () => run(save);
  const finishStart = () =>
    run(async () => {
      await save();
      navigate({ name: 'meeting', join: await api.instant() });
    });

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
              <Avatar name={displayName || '?'} color={avatarColor} size={96} ring />
            </div>
            <Field label={t.onboarding.displayName} maxLength={40} autoFocus required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <ColorPicker label={t.onboarding.avatarColor} colors={AVATAR_COLORS} value={avatarColor} onChange={setAvatarColor} />
          </section>
        )}

        {step === 2 && (
          <section className="stack">
            <header className="heading">
              <h2>{t.onboarding.useTitle}</h2>
              <p className="muted">{t.onboarding.useText}</p>
            </header>
            <div className="choice-grid" role="group" aria-label={t.onboarding.useTitle}>
              {USE_CASES.map((u) => {
                const Icon = USE_CASE_ICONS[u];
                const on = useCases.includes(u);
                return (
                  <button key={u} type="button" aria-pressed={on} className={`choice ${on ? 'is-active' : ''}`} onClick={() => toggleUse(u)}>
                    <span className="choice-icon">
                      <Icon size={22} />
                    </span>
                    <span>{t.useCases[u]}</span>
                    {on && <Check size={18} className="choice-check" />}
                  </button>
                );
              })}
            </div>
            <Field label={t.onboarding.about} placeholder={t.onboarding.aboutPlaceholder} maxLength={120} value={about} onChange={(e) => setAbout(e.target.value)} />
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
            <DeviceCheck name={displayName} color={avatarColor} />
          </section>
        )}

        {step === 5 && (
          <section className="stack done-step">
            <span className="done-icon">
              <PartyPopper size={36} />
            </span>
            <h2>{t.onboarding.doneTitle}</h2>
            <p className="muted">{t.onboarding.doneText}</p>
            <ErrorText code={error} />
            <div className="row-wrap center">
              <Button size="lg" icon={Video} loading={busy} onClick={finishStart}>
                {t.onboarding.startNow}
              </Button>
              <Button size="lg" variant="secondary" icon={Sparkles} disabled={busy} onClick={finishHome}>
                {t.onboarding.goHome}
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
              <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !displayName.trim()}>
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
