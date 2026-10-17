import { formatRoomCode } from '@classroom/protocol';
import { Check, Copy, KeyRound, LockOpen, Send } from 'lucide-react';
import { useState } from 'react';
import { inviteLink, randomPassword } from '../lib/call';
import { useT } from '../lib/settings';
import { Button, IconButton } from './ui';

/** The desktop clipboard when available (never blocked), the browser's otherwise. */
const copyText = (text: string) => (window.brightboard ? window.brightboard.copyText(text) : navigator.clipboard.writeText(text));

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
          await copyText(value).catch(() => undefined);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      />
    </div>
  );
}

/** Link, code and (optional) password for a space. Admins can also change the password. */
export function InviteBox({ space, onPasswordChange }: { space: { code: string; title: string; password?: string }; onPasswordChange?: (pw: string) => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const link = inviteLink(space.code);
  const password = space.password ?? '';

  const copyAll = async () => {
    await copyText(t.space.inviteMessage(space.title, link, formatRoomCode(space.code), password)).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
        {onPasswordChange &&
          (password ? (
            <>
              <Button variant="secondary" icon={KeyRound} onClick={() => onPasswordChange(randomPassword())}>
                {t.space.newPassword}
              </Button>
              <Button variant="ghost" icon={LockOpen} onClick={() => onPasswordChange('')}>
                {t.space.removePassword}
              </Button>
            </>
          ) : (
            <Button variant="secondary" icon={KeyRound} onClick={() => onPasswordChange(randomPassword())}>
              {t.space.addPassword}
            </Button>
          ))}
      </div>
    </div>
  );
}
