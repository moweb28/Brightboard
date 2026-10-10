import type { JoinInfo } from '@classroom/protocol';
import { ArrowLeft, Video } from 'lucide-react';
import { useState } from 'react';
import { DeviceCheck } from '../components/DeviceCheck';
import { Logo, QuickPrefs } from '../components/layout';
import { Badge, Button } from '../components/ui';
import { useProfile } from '../lib/store';
import { useSettings, useT } from '../lib/settings';

export interface JoinChoices {
  mic: boolean;
  cam: boolean;
}

export function PreJoin({ join, onJoin, onCancel }: { join: JoinInfo; onJoin: (c: JoinChoices) => void; onCancel: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const profile = useProfile();
  const [mic, setMic] = useState(!settings.joinMuted);
  const [cam, setCam] = useState(!settings.joinCameraOff);
  const name = profile.name;
  const color = profile.color;

  return (
    <div className="prejoin">
      <header className="onboarding-top">
        <Logo small />
        <QuickPrefs />
      </header>
      <div className="prejoin-body">
        <div className="prejoin-preview">
          <DeviceCheck name={name || '?'} color={color} camOn={cam} micOn={mic} onToggleCam={() => setCam(!cam)} onToggleMic={() => setMic(!mic)} />
        </div>
        <aside className="prejoin-side card card-pad">
          <Badge tone="accent">{t.kinds[join.kind].name}</Badge>
          <h1>{join.spaceTitle}</h1>
          <h2 className="muted">{t.meeting.prejoinTitle}</h2>
          <p className="muted">{t.meeting.prejoinSubtitle}</p>
          <Button size="lg" icon={Video} block onClick={() => onJoin({ mic, cam })} autoFocus>
            {t.meeting.joinNow}
          </Button>
          <Button variant="ghost" icon={ArrowLeft} block onClick={onCancel}>
            {t.common.back}
          </Button>
        </aside>
      </div>
    </div>
  );
}
