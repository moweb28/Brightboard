import { normalizeRoomCode } from '@classroom/protocol';
import { useEffect, useState } from 'react';
import { ToastProvider } from './components/toast';
import { Spinner } from './components/ui';
import { NavContext, type Route } from './lib/nav';
import { SettingsProvider } from './lib/settings';
import { StoreProvider, useStore } from './lib/store';
import { useLivePoll } from './lib/useLivePoll';
import { Meeting } from './meeting/Meeting';
import { Home } from './screens/Home';
import { JoinPage } from './screens/Join';
import { Onboarding } from './screens/Onboarding';
import { SettingsPage } from './screens/Settings';
import { SpacePage } from './screens/SpacePage';

export function App() {
  return (
    <SettingsProvider>
      <StoreProvider>
        <ToastProvider>
          <Router />
        </ToastProvider>
      </StoreProvider>
    </SettingsProvider>
  );
}

function Router() {
  const { data } = useStore();
  const [route, setRoute] = useState<Route>({ name: 'home' });
  // Your own call's live state comes from the call itself, not from polling.
  useLivePoll(route.name === 'meeting' ? route.join.roomName : null);

  // brightboard://join/CODE links open the join screen with the code filled in (never interrupting a call).
  useEffect(() => {
    const open = (code: string) => setRoute((r) => (r.name === 'meeting' ? r : { name: 'join', code }));
    const bridge = window.brightboard;
    if (!bridge) {
      // The website: invite pages send people to /?join=CODE.
      const code = normalizeRoomCode(new URLSearchParams(location.search).get('join') ?? '');
      if (code) {
        history.replaceState(null, '', location.pathname);
        open(code);
      }
      return;
    }
    bridge.takePendingJoin().then((code) => code && open(code));
    return bridge.onJoinLink(open);
  }, []);

  if (!data) return <Spinner />;
  // First launch: set up a profile before anything else (a pending join link waits until then).
  if (!data.profile) return <Onboarding />;

  return (
    <NavContext.Provider value={setRoute}>
      <Screen route={route} />
    </NavContext.Provider>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home newSpace={route.newSpace} />;
    case 'space':
      return <SpacePage key={route.id} id={route.id} />;
    case 'join':
      return <JoinPage code={route.code} />;
    case 'settings':
      return <SettingsPage />;
    case 'meeting':
      return <Meeting key={route.join.token} join={route.join} password={route.password} />;
  }
}
