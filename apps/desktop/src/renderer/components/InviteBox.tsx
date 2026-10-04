import { formatRoomCode, type ClassDto } from '@classroom/protocol';
import { Check, Copy, KeyRound, RefreshCw, Send } from 'lucide-react';
import { useState } from 'react';
import { api, inviteLink } from '../lib/api';
import { useT } from '../lib/settings';
import { Button, IconButton } from './ui';

function CopyRow({ label, value }: { label: string; value: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <div className="copy-row">
      <span className="copy-label">{label}</span>
      <code dir="ltr">{value}</code>
      <IconButton
        icon={done ? Check : Copy}
        label={t.common.copy}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      />
    </div>
  );
}

/** Link, code and password for a class, with "copy invitation" and (for the owner) a new-password button. */
export function InviteBox({ cls, onChange }: { cls: Pick<ClassDto, 'id' | 'code' | 'title' | 'joinPassword'>; onChange?: (c: ClassDto) => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = inviteLink(cls.code);
  const password = cls.joinPassword ?? '';

  const copyAll = async () => {
    await navigator.clipboard.writeText(t.classPage.inviteMessage(cls.title, link, formatRoomCode(cls.code), password));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const newPassword = async () => {
    setBusy(true);
    try {
      onChange?.(await api.updateClass(cls.id, { password: String(1000 + Math.floor(Math.random() * 9000)) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="invite-box">
      <p className="muted small">{t.classPage.inviteHint}</p>
      <CopyRow label={t.classPage.link} value={link} />
      <CopyRow label={t.classPage.code} value={formatRoomCode(cls.code)} />
      <CopyRow label={t.classPage.password} value={password} />
      <div className="row-wrap">
        <Button icon={copied ? Check : Send} onClick={copyAll}>
          {copied ? t.common.copied : t.classPage.copyInvitation}
        </Button>
        {onChange && (
          <Button variant="secondary" icon={busy ? RefreshCw : KeyRound} loading={busy} onClick={newPassword}>
            {t.classPage.newPassword}
          </Button>
        )}
      </div>
    </div>
  );
}
