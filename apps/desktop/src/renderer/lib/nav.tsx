import type { JoinInfo } from '@classroom/protocol';
import { createContext, useContext } from 'react';

export type Route =
  | { name: 'welcome' }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'guestJoin'; code?: string }
  | { name: 'onboarding' }
  | { name: 'home'; newClass?: boolean }
  | { name: 'class'; id: number }
  | { name: 'join'; code?: string }
  | { name: 'settings' }
  | { name: 'meeting'; join: JoinInfo; inviteCode?: string; invitePassword?: string };

export const NavContext = createContext<(route: Route) => void>(() => {});
export const useNavigate = () => useContext(NavContext);
