import { CLASS_COLORS, type ClassDto } from '@classroom/protocol';
import { useState } from 'react';
import { api } from '../lib/api';
import { useT } from '../lib/settings';
import { useAsync } from '../lib/useAsync';
import { Button, ColorPicker, ErrorText, Field, Modal } from './ui';

export function ClassFormModal({ existing, onClose, onSaved }: { existing?: ClassDto; onClose: () => void; onSaved: (c: ClassDto) => void }) {
  const t = useT();
  const [form, setForm] = useState({
    title: existing?.title ?? '',
    subject: existing?.subject ?? '',
    schedule: existing?.schedule ?? '',
    color: existing?.color ?? CLASS_COLORS[0],
  });
  const { busy, error, run } = useAsync();
  const field = (key: 'title' | 'subject' | 'schedule') => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => onSaved(existing ? await api.updateClass(existing.id, form) : await api.createClass(form)));
  };

  return (
    <Modal
      title={existing ? t.classForm.editTitle : t.classForm.newTitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button form="class-form" loading={busy} disabled={!form.title.trim()}>
            {existing ? t.classForm.saveChanges : t.classForm.create}
          </Button>
        </>
      }
    >
      <form id="class-form" onSubmit={submit} className="stack">
        <div className="class-form-preview" style={{ background: form.color }}>
          <strong>{form.title || t.classForm.titlePlaceholder}</strong>
          <span>{[form.subject, form.schedule].filter(Boolean).join(' · ')}</span>
        </div>
        <Field label={t.classForm.title} placeholder={t.classForm.titlePlaceholder} maxLength={80} autoFocus required {...field('title')} />
        <div className="grid-2">
          <Field label={t.classForm.subject} placeholder={t.onboarding.subjectPlaceholder} maxLength={60} {...field('subject')} />
          <Field label={t.classForm.schedule} placeholder={t.classForm.schedulePlaceholder} maxLength={80} {...field('schedule')} />
        </div>
        <ColorPicker label={t.classForm.color} colors={CLASS_COLORS} value={form.color} onChange={(color) => setForm({ ...form, color })} />
        <ErrorText code={error} />
      </form>
    </Modal>
  );
}
