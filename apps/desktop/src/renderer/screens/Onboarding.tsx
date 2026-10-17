import { AVATAR_COLORS } from '@classroom/protocol';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { LanguagePicker, ScenePicker, ThemePicker } from '../components/AppearancePicker';
import { DeviceCheck } from '../components/DeviceCheck';
import { Logo, QuickPrefs } from '../components/layout';
import { PicturePicker } from '../components/PicturePicker';
import { Avatar, Button, ColorPicker, Field } from '../components/ui';
import { useT } from '../lib/settings';
import { useStore } from '../lib/store';

const STEPS = 3;

/** First launch: who you are, how the app looks, and a camera/mic check. Everything stays on this computer. */
export function Onboarding() {
  const t = useT();
  const { setProfile } = useStore();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  const [picture, setPicture] = useState<string | null>(null);

  const finish = () => setProfile({ name: name.trim(), color, picture, about: '', useCases: [] });

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
            <PicturePicker preview={<Avatar name={name || '?'} color={color} picture={picture} size={96} />} value={picture} onChange={setPicture} />
            <Field label={t.onboarding.displayName} placeholder={t.onboarding.displayNamePlaceholder} maxLength={40} autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
            {!picture && <ColorPicker label={t.onboarding.avatarColor} colors={AVATAR_COLORS} value={color} onChange={setColor} />}
          </section>
        )}

        {step === 2 && (
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

        {step === 3 && (
          <section className="stack">
            <header className="heading">
              <h2>{t.onboarding.devicesTitle}</h2>
              <p className="muted">{t.onboarding.devicesText}</p>
            </header>
            <DeviceCheck name={name} color={color} picture={picture} />
          </section>
        )}

        <footer className="onboarding-nav">
          {step > 1 ? (
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(step - 1)}>
              {t.common.back}
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS ? (
            <Button onClick={() => setStep(step + 1)} disabled={!name.trim()}>
              {t.common.continue}
              <ArrowRight size={18} className="flip-rtl" />
            </Button>
          ) : (
            <Button icon={Check} onClick={finish}>
              {t.onboarding.finish}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
