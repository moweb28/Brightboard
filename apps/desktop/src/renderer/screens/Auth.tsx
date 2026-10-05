import { ArrowLeft } from 'lucide-react';
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
  const { busy, error, setError, run } = useAsync();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => (mode === 'login' ? auth.login(email, password) : auth.register(email, password)));
  };

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
