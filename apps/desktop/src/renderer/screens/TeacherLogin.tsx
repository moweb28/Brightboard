import type { JoinInfo } from '@classroom/protocol';
import { useState } from 'react';
import { api, teacherToken } from '../api';
import { useAsync } from './useAsync';

export function TeacherLogin({ onBack, onStarted }: { onBack: () => void; onStarted: (j: JoinInfo) => void }) {
  const [loggedIn, setLoggedIn] = useState(() => teacherToken.get() !== null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAsync();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { token } = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      teacherToken.set(token);
      setLoggedIn(true);
    });
  };

  const startClass = () =>
    run(async () => {
      try {
        const room = await api.createRoom();
        onStarted(await api.host(room.code));
      } catch (e) {
        if (!teacherToken.get()) setLoggedIn(false);
        throw e;
      }
    });

  const logOut = () => {
    teacherToken.clear();
    setLoggedIn(false);
  };

  if (loggedIn) {
    return (
      <main className="center">
        <div className="card">
          <h1>Ready to teach?</h1>
          <p className="muted">Start a class, then share the code with your students.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" onClick={startClass} disabled={busy}>
            {busy ? 'Starting…' : 'Start a new class'}
          </button>
        </div>
        <div className="row">
          <button className="link" onClick={onBack}>← Back</button>
          <button className="link" onClick={logOut}>Log out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="center">
      <div className="card">
        <h1>{mode === 'login' ? 'Teacher login' : 'Create teacher account'}</h1>
        {mode === 'register' && <p className="muted">Only the first account on a new server can be created here.</p>}
        <form onSubmit={submit} className="stack">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <button className="link small" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'First time? Create the teacher account' : 'Have an account? Log in'}
        </button>
      </div>
      <button className="link" onClick={onBack}>← Back</button>
    </main>
  );
}
