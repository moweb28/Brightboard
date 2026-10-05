import { formatRoomCode, type SpaceDto } from '@classroom/protocol';
import { Check, Copy, KeyRound, LockOpen, Send } from 'lucide-react';
import { useState } from 'react';
import { api, inviteLink, randomPassword } from '../lib/api';
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

/** Link, code and (optional) password for a space. Hosts can also change the password. */
export function InviteBox({ space, onChange }: { space: Pick<SpaceDto, 'id' | 'code' | 'title' | 'password'>; onChange?: (s: SpaceDto) => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = inviteLink(space.code);
  const password = space.password ?? '';

  const copyAll = async () => {
    await navigator.clipboard.writeText(t.space.inviteMessage(space.title, link, formatRoomCode(space.code), password));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const setPassword = async (pw: string) => {
    setBusy(true);
    try {
      onChange?.(await api.updateSpace(space.id, { password: pw }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="invite-box">
      <p className="muted small">{t.space.inviteHint}</p>
      <CopyRow label={t.space.link} value={link} />
      <CopyRow label={t.space.code} value={formatRoomCode(space.code)} />
      {password ? (
        <CopyRow label={t.space.password} value={password} />
      ) : (
        <div className="copy-row">
          <span className="copy-label">{t.space.password}</span>
          <span className="muted">{t.space.noPassword}</span>
        </div>
      )}
      <div className="row-wrap">
        <Button icon={copied ? Check : Send} onClick={copyAll}>
          {copied ? t.common.copied : t.space.copyInvitation}
        </Button>
        {onChange &&
          (password ? (
            <>
              <Button variant="secondary" icon={KeyRound} loading={busy} onClick={() => setPassword(randomPassword())}>
                {t.space.newPassword}
              </Button>
              <Button variant="ghost" icon={LockOpen} disabled={busy} onClick={() => setPassword('')}>
                {t.space.removePassword}
              </Button>
            </>
          ) : (
            <Button variant="secondary" icon={KeyRound} loading={busy} onClick={() => setPassword(randomPassword())}>
              {t.space.addPassword}
            </Button>
          ))}
      </div>
    </div>
  );
}
