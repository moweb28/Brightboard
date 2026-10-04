import type { JoinInfo } from '@classroom/protocol';
import { useEffect, useState } from 'react';
import { I18nProvider } from './i18n';
import { Home } from './screens/Home';
import { Meeting } from './screens/Meeting';
import { TeacherLogin } from './screens/TeacherLogin';

export type Screen =
  | { name: 'home'; code?: string }
  | { name: 'teacher' }
  | { name: 'meeting'; join: JoinInfo; classPassword?: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  // brightboard://join/CODE links: open the join form with the code filled in (never interrupt a meeting).
  useEffect(() => {
    const bridge = window.brightboard;
    if (!bridge) return;
    const openCode = (code: string) => setScreen((s) => (s.name === 'meeting' ? s : { name: 'home', code }));
    bridge.takePendingJoin().then((code) => code && openCode(code));
    return bridge.onJoinLink(openCode);
  }, []);

  return (
    <I18nProvider>
      {screen.name === 'home' && (
        <Home initialCode={screen.code} onJoined={(join) => setScreen({ name: 'meeting', join })} onTeacher={() => setScreen({ name: 'teacher' })} />
      )}
      {screen.name === 'teacher' && (
        <TeacherLogin onBack={() => setScreen({ name: 'home' })} onStarted={(join, classPassword) => setScreen({ name: 'meeting', join, classPassword })} />
      )}
      {screen.name === 'meeting' && <Meeting join={screen.join} classPassword={screen.classPassword} onLeave={() => setScreen({ name: 'home' })} />}
    </I18nProvider>
  );
}
