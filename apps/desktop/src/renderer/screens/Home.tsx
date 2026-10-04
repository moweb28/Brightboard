import { formatRoomCode, normalizeRoomCode, type JoinInfo } from '@classroom/protocol';
import { useState } from 'react';
import { api } from '../api';
import { useAsync } from './useAsync';

const NAME_KEY = 'studentName';

export function Home({ onJoined, onTeacher }: { onJoined: (j: JoinInfo) => void; onTeacher: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const { busy, error, run } = useAsync();
  const normalized = normalizeRoomCode(code);

  const onCodeChange = (value: string) => {
    const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(raw.length > 3 ? formatRoomCode(raw) : raw);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalized || !name.trim()) return;
    run(async () => {
      localStorage.setItem(NAME_KEY, name.trim());
      onJoined(await api.join(normalized, name.trim()));
    });
  };

  return (
    <main className="center">
      <div className="card">
        <h1>Join your class</h1>
        <p className="muted">Enter the code your teacher gave you.</p>
        <form onSubmit={submit} className="stack">
          <label>
            Class code
            <input className="code-input" value={code} onChange={(e) => onCodeChange(e.target.value)} placeholder="ABC-123" autoFocus spellCheck={false} />
          </label>
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Sara Ahmed" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy || !normalized || !name.trim()}>
            {busy ? 'Joining…' : 'Join class'}
          </button>
        </form>
      </div>
      <button className="link" onClick={onTeacher}>
        I'm the teacher →
      </button>
    </main>
  );
}
