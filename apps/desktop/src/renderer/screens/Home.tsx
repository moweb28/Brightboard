import { extractRoomCode, formatRoomCode, type JoinInfo } from '@classroom/protocol';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorText, Field, Heading } from '../components/bits';
import { Shell } from '../components/Shell';
import { useI18n } from '../i18n';
import { useAsync } from './useAsync';

const NAME_KEY = 'studentName';

export function Home({ initialCode, onJoined, onTeacher }: { initialCode?: string; onJoined: (j: JoinInfo) => void; onTeacher: () => void }) {
  const { t } = useI18n();
  const [codeInput, setCodeInput] = useState(initialCode ? formatRoomCode(initialCode) : '');
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [password, setPassword] = useState('');
  const { busy, error, setError, run } = useAsync();

  useEffect(() => {
    if (initialCode) setCodeInput(formatRoomCode(initialCode));
  }, [initialCode]);

  const code = extractRoomCode(codeInput);

  // Pasting a full invite link turns it into the short code.
  const onCodeChange = (value: string) => {
    const fromLink = /[/:]/.test(value) ? extractRoomCode(value) : null;
    setCodeInput(fromLink ? formatRoomCode(fromLink) : value.toUpperCase());
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return setError('badCode');
    run(async () => {
      localStorage.setItem(NAME_KEY, name.trim());
      onJoined(await api.join(code, name.trim(), password));
    });
  };

  return (
    <Shell>
      <Heading title={t.joinTitle} subtitle={t.joinSubtitle} />
      <form onSubmit={submit} className="form">
        <Field
          label={t.classCode}
          className="code-input"
          dir="ltr"
          value={codeInput}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder={t.codePlaceholder}
          spellCheck={false}
          autoFocus={!initialCode}
          required
        />
        <Field label={t.yourName} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t.namePlaceholder} required autoFocus={!!initialCode} />
        <Field label={t.classPassword} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <ErrorText error={error} />
        <button className="btn btn-primary" disabled={busy || !name.trim() || !password}>
          {busy ? t.joining : t.joinButton}
        </button>
      </form>
      <div className="divider" />
      <button className="btn btn-ghost" onClick={onTeacher}>
        🎓 {t.imTeacher}
      </button>
    </Shell>
  );
}
