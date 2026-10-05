import { defaultKindFor, KIND_EMOJI, SPACE_COLORS, SPACE_EMOJIS, SPACE_KINDS, type SpaceDto, type SpaceKind } from '@classroom/protocol';
import { useState } from 'react';
import { api, randomPassword } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/settings';
import { useAsync } from '../lib/useAsync';
import { Button, ColorPicker, ErrorText, Field, Modal, Toggle } from './ui';

export function SpaceFormModal({ existing, onClose, onSaved }: { existing?: SpaceDto; onClose: () => void; onSaved: (s: SpaceDto) => void }) {
  const t = useT();
  const { user } = useAuth();
  const initialKind = existing?.kind ?? defaultKindFor(user?.useCases ?? []);
  const [kind, setKind] = useState<SpaceKind>(initialKind);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? KIND_EMOJI[initialKind]);
  const [emojiTouched, setEmojiTouched] = useState(!!existing);
  const [schedule, setSchedule] = useState(existing?.schedule ?? '');
  const [color, setColor] = useState(existing?.color ?? SPACE_COLORS[0]);
  const [needsPassword, setNeedsPassword] = useState(existing?.hasPassword ?? initialKind === 'class');
  const { busy, error, run } = useAsync();

  const pickKind = (k: SpaceKind) => {
    setKind(k);
    if (!emojiTouched) setEmoji(KIND_EMOJI[k]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const base = { title, emoji, schedule, color, kind };
    run(async () => {
      if (existing) {
        const password = needsPassword ? existing.password || randomPassword() : '';
        onSaved(await api.updateSpace(existing.id, { ...base, password }));
      } else {
        // New spaces take the kind's preset settings on the server.
        onSaved(await api.createSpace({ ...base, password: needsPassword ? randomPassword() : '' }));
      }
    });
  };

  return (
    <Modal
      wide
      title={existing ? t.spaceForm.editTitle : t.spaceForm.newTitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button form="space-form" loading={busy} disabled={!title.trim()}>
            {existing ? t.spaceForm.saveChanges : t.spaceForm.create}
          </Button>
        </>
      }
    >
      <form id="space-form" onSubmit={submit} className="stack">
        <div className="field">
          <span className="field-label">{t.spaceForm.kind}</span>
          <div className="kind-grid" role="radiogroup" aria-label={t.spaceForm.kind}>
            {SPACE_KINDS.map((k) => (
              <button type="button" key={k} role="radio" aria-checked={kind === k} className={`kind-card ${kind === k ? 'is-active' : ''}`} onClick={() => pickKind(k)}>
                <span className="kind-emoji">{KIND_EMOJI[k]}</span>
                <strong>{t.kinds[k].name}</strong>
                <span className="muted small">{t.kinds[k].desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-form-row">
          <div className="space-preview" style={{ '--space-color': color } as React.CSSProperties}>
            <span className="space-preview-emoji">{emoji}</span>
          </div>
          <div className="stack grow">
            <Field label={t.spaceForm.title} placeholder={t.spaceForm.titlePlaceholder} maxLength={80} autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
            <Field label={t.spaceForm.schedule} placeholder={t.spaceForm.schedulePlaceholder} maxLength={80} value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <span className="field-label">{t.spaceForm.emoji}</span>
          <div className="emoji-row" role="radiogroup" aria-label={t.spaceForm.emoji}>
            {SPACE_EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                role="radio"
                aria-checked={emoji === e}
                className={emoji === e ? 'is-active' : ''}
                onClick={() => {
                  setEmoji(e);
                  setEmojiTouched(true);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <ColorPicker label={t.spaceForm.color} colors={SPACE_COLORS} value={color} onChange={setColor} />
        <Toggle label={t.spaceForm.requirePassword} description={t.spaceForm.requirePasswordDesc} checked={needsPassword} onChange={setNeedsPassword} />
        <ErrorText code={error} />
      </form>
    </Modal>
  );
}
