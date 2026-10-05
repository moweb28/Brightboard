import { extractRoomCode, formatRoomCode } from '@classroom/protocol';
import { ArrowLeft, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShell, AuthLayout } from '../components/layout';
import { Button, ErrorText, Field } from '../components/ui';
import { api, safeGet, safeSet } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNavigate } from '../lib/nav';
import { useT } from '../lib/settings';
import { useAsync } from '../lib/useAsync';

const NAME_KEY = 'guestName';

/** The join form, shared by guests (before login) and logged-in students. */
export function JoinForm({ initialCode }: { initialCode?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [codeInput, setCodeInput] = useState(initialCode ? formatRoomCode(initialCode) : '');
  const [name, setName] = useState(() => safeGet(NAME_KEY) ?? '');
  const [password, setPassword] = useState('');
  const { busy, error, setError, run } = useAsync();

  useEffect(() => {
    if (initialCode) setCodeInput(formatRoomCode(initialCode));
  }, [initialCode]);

  // Pasting a full invite link turns into the short code.
  const onCodeChange = (value: string) => {
    const fromLink = /[/:]/.test(value) ? extractRoomCode(value) : null;
    setCodeInput(fromLink ? formatRoomCode(fromLink) : value.toUpperCase());
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = extractRoomCode(codeInput);
    if (!code) return setError('badCode');
    run(async () => {
      if (!user) safeSet(NAME_KEY, name.trim());
      const join = await api.join(code, user ? user.displayName : name.trim(), password);
      navigate({ name: 'meeting', join });
    });
  };

  return (
    <form onSubmit={submit} className="stack">
      <Field
        label={t.join.code}
        className="code-input"
        dir="ltr"
        value={codeInput}
        onChange={(e) => onCodeChange(e.target.value)}
        placeholder={t.join.codePlaceholder}
        spellCheck={false}
        autoFocus={!initialCode}
        required
      />
      {user ? (
        <p className="muted small">{t.join.joiningAs(user.displayName)}</p>
      ) : (
        <Field label={t.join.yourName} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t.join.namePlaceholder} required autoFocus={!!initialCode} />
      )}
      <Field label={t.join.password} type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!!initialCode && !!user} />
      <ErrorText code={error} />
      <Button size="lg" icon={LogIn} block loading={busy} disabled={!user && !name.trim()}>
        {t.join.button}
      </Button>
    </form>
  );
}

export function GuestJoin({ code }: { code?: string }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <AuthLayout>
      <Button variant="link" icon={ArrowLeft} className="back-link" onClick={() => navigate({ name: 'welcome' })}>
        {t.common.back}
      </Button>
      <header className="heading">
        <h2>{t.join.title}</h2>
        <p className="muted">{t.join.subtitle}</p>
      </header>
      <JoinForm initialCode={code} />
    </AuthLayout>
  );
}

export function JoinPage({ code }: { code?: string }) {
  const t = useT();
  return (
    <AppShell active="join">
      <div className="page page-narrow">
        <header className="page-head">
          <div>
            <h1>{t.join.title}</h1>
            <p className="muted">{t.join.subtitle}</p>
          </div>
        </header>
        <div className="card card-pad">
          <JoinForm initialCode={code} />
        </div>
      </div>
    </AppShell>
  );
}
