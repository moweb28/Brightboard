import { useEffect, useState } from 'react';
import { ToastProvider } from './components/toast';
import { Spinner } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { NavContext, type Route } from './lib/nav';
import { SettingsProvider } from './lib/settings';
import { Meeting } from './meeting/Meeting';
import { Auth } from './screens/Auth';
import { Home } from './screens/Home';
import { GuestJoin, JoinPage } from './screens/Join';
import { Onboarding } from './screens/Onboarding';
import { SettingsPage } from './screens/Settings';
import { SpacePage } from './screens/SpacePage';
import { Welcome } from './screens/Welcome';

export function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <ToastProvider>
          <Router />
        </ToastProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

const PUBLIC_ROUTES: Route['name'][] = ['welcome', 'login', 'register', 'guestJoin'];

function Router() {
  const { user } = useAuth();
  const [route, setRoute] = useState<Route>({ name: 'welcome' });

  // brightboard://join/CODE links open the join form with the code filled in (never interrupting a class).
  useEffect(() => {
    const bridge = window.brightboard;
    if (!bridge) return;
    const open = (code: string) => setRoute((r) => (r.name === 'meeting' ? r : { name: 'guestJoin', code }));
    bridge.takePendingJoin().then((code) => code && open(code));
    return bridge.onJoinLink(open);
  }, []);

  if (user === undefined) return <Spinner />;

  // Resolve where the user may actually be.
  let current = route;
  if (user) {
    if (!user.onboarded && route.name !== 'meeting') current = { name: 'onboarding' };
    else if (PUBLIC_ROUTES.includes(route.name)) current = route.name === 'guestJoin' && route.code ? { name: 'join', code: route.code } : { name: 'home' };
    else if (route.name === 'onboarding') current = { name: 'home' };
  } else if (!PUBLIC_ROUTES.includes(route.name) && route.name !== 'meeting') {
    current = { name: 'welcome' };
  }

  return (
    <NavContext.Provider value={setRoute}>
      <Screen route={current} />
    </NavContext.Provider>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'welcome':
      return <Welcome />;
    case 'login':
    case 'register':
      return <Auth mode={route.name} />;
    case 'guestJoin':
      return <GuestJoin code={route.code} />;
    case 'onboarding':
      return <Onboarding />;
    case 'home':
      return <Home newSpace={route.newSpace} />;
    case 'space':
      return <SpacePage id={route.id} />;
    case 'join':
      return <JoinPage code={route.code} />;
    case 'settings':
      return <SettingsPage />;
    case 'meeting':
      return <Meeting key={route.join.token} join={route.join} invitePassword={route.invitePassword} />;
  }
}
