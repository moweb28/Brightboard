import { extractRoomCode, formatRoomCode } from '@classroom/protocol';
import { LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShell } from '../components/layout';
import { Button, ErrorText, Field } from '../components/ui';
import { useT } from '../lib/settings';
import { useProfile } from '../lib/store';
import { useOpenCall } from '../lib/useOpenCall';

/** Paste a link or type a code (and the password if there is one) to join someone's space. */
export function JoinPage({ code }: { code?: string }) {
  const t = useT();
  const profile = useProfile();
  const openCall = useOpenCall();
  const [codeInput, setCodeInput] = useState(code ? formatRoomCode(code) : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (code) setCodeInput(formatRoomCode(code));
  }, [code]);

  // Pasting a full invite link turns into the short code.
  const onCodeChange = (value: string) => {
    const fromLink = /[/:]/.test(value) ? extractRoomCode(value) : null;
    setCodeInput(fromLink ? formatRoomCode(fromLink) : value.toUpperCase());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const room = extractRoomCode(codeInput);
    if (!room) return setError('badCode');
    setError(null);
    setBusy(true);
    if (!(await openCall({ code: room, password }))) setBusy(false);
  };

  return (
    <AppShell active="join">
      <div className="page page-narrow">
        <header className="page-head">
          <div>
            <h1>{t.join.title}</h1>
            <p className="muted">{t.join.subtitle}</p>
          </div>
        </header>
        <form onSubmit={submit} className="card card-pad stack">
          <Field
            label={t.join.code}
            className="code-input"
            dir="ltr"
            value={codeInput}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder={t.join.codePlaceholder}
            spellCheck={false}
            autoFocus={!code}
            required
          />
          <Field label={t.join.password} type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!!code} />
          <p className="muted small">{t.join.joiningAs(profile.name)}</p>
          <ErrorText code={error} />
          <Button size="lg" icon={LogIn} block loading={busy}>
            {t.join.button}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
