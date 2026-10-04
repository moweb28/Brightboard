import type { InputHTMLAttributes, ReactNode } from 'react';
import icon from '../../../build/icon.svg';
import type { ErrorKey } from '../i18n';
import { useI18n } from '../i18n';

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={small ? 'logo logo-small' : 'logo'}>
      <img src={icon} alt="" />
      <span>Brightboard</span>
    </div>
  );
}

export function LangToggle() {
  const { lang, toggleLang } = useI18n();
  return (
    <button className="lang-toggle" onClick={toggleLang} lang={lang === 'en' ? 'ar' : 'en'}>
      🌐 {lang === 'en' ? 'العربية' : 'English'}
    </button>
  );
}

export function Field({ label, hint, ...input }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input {...input} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ErrorText({ error }: { error: ErrorKey | null }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {t.errors[error]}
    </p>
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <header className="heading">
      <h2>{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
    </header>
  );
}
