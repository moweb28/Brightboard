import type { JoinInfo } from '@classroom/protocol';
import { createContext, useContext } from 'react';

export type Route =
  | { name: 'welcome' }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'guestJoin'; code?: string }
  | { name: 'onboarding' }
  | { name: 'home'; newSpace?: boolean }
  | { name: 'space'; id: number }
  | { name: 'join'; code?: string }
  | { name: 'settings' }
  | { name: 'meeting'; join: JoinInfo; invitePassword?: string };

export const NavContext = createContext<(route: Route) => void>(() => {});
export const useNavigate = () => useContext(NavContext);
