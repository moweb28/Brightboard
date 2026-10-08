import { FileText, Loader2, ShieldCheck, Square, X } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Button, IconButton, Segmented } from '../components/ui';
import { useSettings } from '../lib/settings';
import type { Transcript } from './useTranscript';

const stamp = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function TranscriptPanel({ tx, onClose }: { tx: Transcript; onClose: () => void }) {
  const { t, settings, set } = useSettings();
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [tx.lines.length]);

  const s = tx.status;
  const pct = s?.phase === 'loading' && s.total ? Math.min(100, Math.round((s.loaded / s.total) * 100)) : null;

  return (
    <aside className="side-panel transcript-panel" aria-label={t.transcript.title}>
      <header className="side-head">
        <h2>{t.transcript.title}</h2>
        <IconButton icon={X} label={t.common.close} onClick={onClose} />
      </header>

      {!tx.running ? (
        <div className="side-scroll stack">
          <div className="field">
            <span className="field-label">{t.transcript.who}</span>
            <Segmented
              label={t.transcript.who}
              value={settings.transcriptMode}
              onChange={(v) => set('transcriptMode', v)}
              options={[
                { value: 'me', label: t.transcript.me },
                { value: 'everyone', label: t.transcript.everyone },
              ]}
            />
            {settings.transcriptMode === 'everyone' && <span className="field-hint">{t.transcript.everyoneNote}</span>}
          </div>
          <div className="field">
            <span className="field-label">{t.transcript.quality}</span>
            <Segmented
              label={t.transcript.quality}
              value={settings.transcriptModel}
              onChange={(v) => set('transcriptModel', v)}
              options={[
                { value: 'standard', label: t.transcript.standard },
                { value: 'accurate', label: t.transcript.accurate },
              ]}
            />
          </div>
          <p className="privacy-note">
            <ShieldCheck size={16} /> {t.transcript.privacy}
          </p>
          <Button icon={FileText} onClick={tx.start}>
            {t.transcript.start}
          </Button>
        </div>
      ) : (
        <>
          <div className="transcript-status">
            {s?.phase === 'loading' ? (
              <>
                <Loader2 size={15} className="spin" /> {pct === null ? t.transcript.preparing : t.transcript.downloading(pct)}
                {pct !== null && (
                  <span className="progress">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="rec-dot" aria-hidden /> {t.transcript.listening}
              </>
            )}
          </div>
          <div className="transcript-list" ref={listRef} dir="auto">
            {tx.lines.length === 0 && <p className="muted small">{t.transcript.empty}</p>}
            {tx.lines.map((l, i) => (
              <p key={i} className="transcript-line">
                <span className="transcript-time" dir="ltr">
                  {stamp(l.atMs)}
                </span>
                <strong>{l.speaker}</strong>
                <span dir="auto">{l.text}</span>
              </p>
            ))}
          </div>
          <footer className="transcript-foot">
            <Button variant="danger" icon={Square} block onClick={tx.stop}>
              {t.transcript.stop}
            </Button>
          </footer>
        </>
      )}
    </aside>
  );
}
