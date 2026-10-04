import type { JoinInfo } from '@classroom/protocol';
import { useState } from 'react';
import { Home } from './screens/Home';
import { Meeting } from './screens/Meeting';
import { TeacherLogin } from './screens/TeacherLogin';

export type Screen = { name: 'home' } | { name: 'teacher' } | { name: 'meeting'; join: JoinInfo };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  switch (screen.name) {
    case 'home':
      return <Home onJoined={(join) => setScreen({ name: 'meeting', join })} onTeacher={() => setScreen({ name: 'teacher' })} />;
    case 'teacher':
      return <TeacherLogin onBack={() => setScreen({ name: 'home' })} onStarted={(join) => setScreen({ name: 'meeting', join })} />;
    case 'meeting':
      return <Meeting join={screen.join} onLeave={() => setScreen({ name: 'home' })} />;
  }
}
