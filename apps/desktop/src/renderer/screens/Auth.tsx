import type { Role } from '@classroom/protocol';
import { ArrowLeft, Backpack, GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { AuthLayout } from '../components/layout';
import { Button, ErrorText, Field } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useNavigate } from '../lib/nav';
import { useT } from '../lib/settings';
import { useAsync } from '../lib/useAsync';

export function Auth({ mode }: { mode: 'login' | 'register' }) {
  const t = useT();
  const navigate = useNavigate();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('teacher');
  const { busy, error, setError, run } = useAsync();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === 'login') await auth.login(email, password);
      else await auth.register(email, password, role);
    });
  };

  const roles: { value: Role; icon: typeof GraduationCap; label: string; desc: string }[] = [
    { value: 'teacher', icon: GraduationCap, label: t.common.teacher, desc: t.auth.teacherDesc },
    { value: 'student', icon: Backpack, label: t.common.student, desc: t.auth.studentDesc },
  ];

  return (
    <AuthLayout>
      <Button variant="link" icon={ArrowLeft} className="back-link" onClick={() => navigate({ name: 'welcome' })}>
        {t.common.back}
      </Button>
      <header className="heading">
        <h2>{mode === 'login' ? t.auth.loginTitle : t.auth.registerTitle}</h2>
        <p className="muted">{mode === 'login' ? t.auth.loginSubtitle : t.auth.registerSubtitle}</p>
      </header>
      <form onSubmit={submit} className="stack">
        {mode === 'register' && (
          <div className="field">
            <span className="field-label">{t.auth.iAmA}</span>
            <div className="role-cards" role="radiogroup">
              {roles.map(({ value, icon: Icon, label, desc }) => (
                <button type="button" key={value} role="radio" aria-checked={role === value} className={`role-card ${role === value ? 'is-active' : ''}`} onClick={() => setRole(value)}>
                  <span className="role-icon">
                    <Icon size={22} />
                  </span>
                  <strong>{label}</strong>
                  <span className="muted small">{desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label={t.auth.email} type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        <Field
          label={t.auth.password}
          type="password"
          dir="ltr"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={mode === 'register' ? 8 : undefined}
          hint={mode === 'register' ? t.auth.passwordHint : undefined}
          required
        />
        <ErrorText code={error} />
        <Button size="lg" block loading={busy}>
          {mode === 'login' ? t.welcome.logIn : t.auth.createAccount}
        </Button>
      </form>
      <Button
        variant="link"
        onClick={() => {
          setError(null);
          navigate({ name: mode === 'login' ? 'register' : 'login' });
        }}
      >
        {mode === 'login' ? t.auth.noAccount : t.auth.haveAccount}
      </Button>
    </AuthLayout>
  );
}
