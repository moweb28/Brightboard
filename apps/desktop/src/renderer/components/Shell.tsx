import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { LangToggle, Logo } from './bits';

/** Two-column layout for the pre-meeting screens: brand panel + content panel. */
export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="shell">
      <aside className="hero">
        <Logo />
        <div className="hero-copy">
          <h1>
            {t.heroLine1}
            <br />
            <span className="hero-accent">{t.heroLine2}</span>
          </h1>
          <ul className="hero-points">
            {t.heroPoints.map((p) => (
              <li key={p}>
                <span className="tick" aria-hidden>✓</span>
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
      <main className="panel">
        <div className="panel-top">
          <LangToggle />
        </div>
        <div className="panel-body">{children}</div>
      </main>
    </div>
  );
}
