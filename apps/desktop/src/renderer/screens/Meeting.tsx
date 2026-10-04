import { formatRoomCode, type JoinInfo } from '@classroom/protocol';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { useState } from 'react';
import { inviteLink } from '../api';
import { LangToggle, Logo } from '../components/bits';
import { useI18n } from '../i18n';

export function Meeting({ join, classPassword, onLeave }: { join: JoinInfo; classPassword?: string; onLeave: () => void }) {
  const { t } = useI18n();
  const [inviteOpen, setInviteOpen] = useState(false);
  const display = formatRoomCode(join.roomName);

  return (
    <div className="meeting" data-lk-theme="default">
      <header className="meeting-bar">
        <Logo small />
        <span className="pill" dir="ltr">
          {display}
        </span>
        {join.role === 'teacher' && <span className="pill pill-accent">{t.teacher}</span>}
        <div className="spacer" />
        <LangToggle />
        {join.role === 'teacher' && classPassword && (
          <div className="invite-anchor">
            <button className="btn btn-primary btn-sm" onClick={() => setInviteOpen((o) => !o)} aria-expanded={inviteOpen}>
              ✉ {t.invite}
            </button>
            {inviteOpen && <InvitePanel code={join.roomName} password={classPassword} onClose={() => setInviteOpen(false)} />}
          </div>
        )}
      </header>
      <LiveKitRoom serverUrl={join.url} token={join.token} connect video audio onDisconnected={onLeave} className="meeting-room">
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}

function InvitePanel({ code, password, onClose }: { code: string; password: string; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const link = inviteLink(formatRoomCode(code));

  const copy = async () => {
    await navigator.clipboard.writeText(t.inviteMessage(link, formatRoomCode(code), password));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="invite-panel" role="dialog" aria-label={t.inviteTitle}>
      <div className="row-between">
        <h3>{t.inviteTitle}</h3>
        <button className="btn btn-link" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="muted small">{t.inviteHint}</p>
      <dl className="invite-list">
        <dt>{t.link}</dt>
        <dd dir="ltr">{link}</dd>
        <dt>{t.code}</dt>
        <dd dir="ltr">{formatRoomCode(code)}</dd>
        <dt>{t.classPassword}</dt>
        <dd dir="ltr">{password}</dd>
      </dl>
      <button className="btn btn-primary" onClick={copy}>
        {copied ? `✓ ${t.copied}` : t.copyInvite}
      </button>
    </div>
  );
}
