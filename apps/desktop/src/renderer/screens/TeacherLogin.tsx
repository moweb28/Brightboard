import type { JoinInfo } from '@classroom/protocol';
import { useState } from 'react';
import { api, teacherToken } from '../api';
import { ErrorText, Field, Heading } from '../components/bits';
import { Shell } from '../components/Shell';
import { useI18n } from '../i18n';
import { useAsync } from './useAsync';

const randomClassPassword = () => String(1000 + Math.floor(Math.random() * 9000));

export function TeacherLogin({ onBack, onStarted }: { onBack: () => void; onStarted: (j: JoinInfo, classPassword: string) => void }) {
  const { t } = useI18n();
  const [loggedIn, setLoggedIn] = useState(() => teacherToken.get() !== null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classPassword, setClassPassword] = useState(randomClassPassword);
  const { busy, error, setError, run } = useAsync();

  const submitAuth = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { token } = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      teacherToken.set(token);
      setLoggedIn(true);
    });
  };

  const startClass = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      try {
        const room = await api.createRoom(classPassword);
        onStarted(await api.host(room.code), classPassword);
      } finally {
        if (!teacherToken.get()) setLoggedIn(false);
      }
    });
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
  };

  const logOut = () => {
    teacherToken.clear();
    setLoggedIn(false);
  };

  return (
    <Shell>
      {loggedIn ? (
        <>
          <Heading title={t.startTitle} subtitle={t.startSubtitle} />
          <form onSubmit={startClass} className="form">
            <Field
              label={t.classPassword}
              className="code-input"
              dir="ltr"
              value={classPassword}
              onChange={(e) => setClassPassword(e.target.value)}
              minLength={4}
              maxLength={32}
              hint={t.classPasswordHint}
              required
            />
            <ErrorText error={error} />
            <button className="btn btn-primary" disabled={busy || classPassword.length < 4}>
              {busy ? t.starting : `▶ ${t.startClass}`}
            </button>
          </form>
          <div className="row-between">
            <button className="btn btn-link" onClick={onBack}>
              {t.back}
            </button>
            <button className="btn btn-link" onClick={logOut}>
              {t.logOut}
            </button>
          </div>
        </>
      ) : (
        <>
          <Heading title={mode === 'login' ? t.teacherLogin : t.teacherRegister} subtitle={t.teacherAuthSubtitle} />
          <form onSubmit={submitAuth} className="form">
            <Field label={t.email} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
            <Field
              label={t.password}
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              hint={mode === 'register' ? t.passwordHint : undefined}
              required
            />
            <ErrorText error={error} />
            <button className="btn btn-primary" disabled={busy}>
              {busy ? t.pleaseWait : mode === 'login' ? t.logIn : t.createAccount}
            </button>
          </form>
          <button className="btn btn-link" onClick={switchMode}>
            {mode === 'login' ? t.noAccount : t.haveAccount}
          </button>
          <button className="btn btn-link" onClick={onBack}>
            {t.back}
          </button>
        </>
      )}
    </Shell>
  );
}
