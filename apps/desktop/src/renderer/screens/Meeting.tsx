import { formatRoomCode, type JoinInfo } from '@classroom/protocol';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { useState } from 'react';

export function Meeting({ join, onLeave }: { join: JoinInfo; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const display = formatRoomCode(join.roomName);

  const copy = async () => {
    await navigator.clipboard.writeText(display);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="meeting" data-lk-theme="default">
      <header className="meeting-bar">
        <span className="muted">Class code</span>
        <strong className="code">{display}</strong>
        <button className="chip" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
        {join.role === 'teacher' && <span className="badge">Teacher</span>}
      </header>
      <LiveKitRoom serverUrl={join.url} token={join.token} connect video audio onDisconnected={onLeave} className="meeting-room">
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
