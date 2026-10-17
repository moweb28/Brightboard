import { SPACE_COLORS, SPACE_KINDS, type Schedule, type Space, type SpaceKind } from '@classroom/protocol';
import { Briefcase, GraduationCap, Megaphone, Sofa, Zap, type LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { randomPassword } from '../lib/call';
import { useT } from '../lib/settings';
import { useStore } from '../lib/store';
import { PicturePicker } from './PicturePicker';
import { SchedulePicker } from './SchedulePicker';
import { Button, ColorPicker, Field, Modal, SpaceIcon, Toggle } from './ui';

export const KIND_ICONS: Record<SpaceKind, LucideIcon> = { hangout: Sofa, meeting: Briefcase, class: GraduationCap, event: Megaphone };

/** `startNow` is true when the admin chose "Create & start now": the call opens straight away. */
export function SpaceFormModal({ existing, onClose, onSaved }: { existing?: Space; onClose: () => void; onSaved: (s: Space, startNow: boolean) => void }) {
  const t = useT();
  const { data, createSpace, updateSpace } = useStore();
  // New spaces default to the kind you made last.
  const initialKind = existing?.kind ?? data?.spaces.at(-1)?.kind ?? 'class';
  const [kind, setKind] = useState<SpaceKind>(initialKind);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [picture, setPicture] = useState<string | null>(existing?.picture ?? null);
  const [schedule, setSchedule] = useState<Schedule | null>(existing?.schedule ?? null);
  const [color, setColor] = useState<string>(existing?.color ?? SPACE_COLORS[(data?.spaces.length ?? 0) % SPACE_COLORS.length]);
  const [needsPassword, setNeedsPassword] = useState(existing ? !!existing.password : initialKind === 'class');

  // Which create button was pressed (a ref: it must be set before the form submits).
  const startNow = useRef(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fields = { title: title.trim(), picture, schedule, color, kind };
    if (existing) {
      const password = needsPassword ? existing.password || randomPassword() : '';
      updateSpace(existing.id, { ...fields, password });
      onSaved({ ...existing, ...fields, password }, false);
    } else {
      onSaved(createSpace({ ...fields, password: needsPassword ? randomPassword() : '' }), startNow.current);
    }
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
          {existing ? (
            <Button form="space-form" disabled={!title.trim()}>
              {t.spaceForm.saveChanges}
            </Button>
          ) : (
            <>
              <Button variant="secondary" form="space-form" disabled={!title.trim()} onClick={() => (startNow.current = false)}>
                {t.spaceForm.create}
              </Button>
              <Button form="space-form" icon={Zap} disabled={!title.trim()} onClick={() => (startNow.current = true)}>
                {t.spaceForm.createAndStart}
              </Button>
            </>
          )}
        </>
      }
    >
      <form id="space-form" onSubmit={submit} className="stack">
        <div className="field">
          <span className="field-label">{t.spaceForm.kind}</span>
          <div className="kind-grid" role="radiogroup" aria-label={t.spaceForm.kind}>
            {SPACE_KINDS.map((k) => {
              const Icon = KIND_ICONS[k];
              return (
                <button type="button" key={k} role="radio" aria-checked={kind === k} className={`kind-card ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
                  <Icon size={22} className="kind-icon" />
                  <strong>{t.kinds[k].name}</strong>
                  <span className="muted small">{t.kinds[k].desc}</span>
                </button>
              );
            })}
          </div>
        </div>
        <Field label={t.spaceForm.title} placeholder={t.spaceForm.titlePlaceholder} maxLength={80} autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="field">
          <span className="field-label">{t.spaceForm.picture}</span>
          <PicturePicker preview={<SpaceIcon title={title || '?'} color={color} picture={picture} size={72} />} value={picture} onChange={setPicture} />
        </div>
        <ColorPicker label={t.spaceForm.color} colors={SPACE_COLORS} value={color} onChange={setColor} />
        <SchedulePicker value={schedule} onChange={setSchedule} />
        <Toggle label={t.spaceForm.requirePassword} description={t.spaceForm.requirePasswordDesc} checked={needsPassword} onChange={setNeedsPassword} />
      </form>
    </Modal>
  );
}
