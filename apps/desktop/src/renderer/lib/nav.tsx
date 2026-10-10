import type { JoinInfo } from '@classroom/protocol';
import { createContext, useContext } from 'react';

export type Route =
  | { name: 'home'; newSpace?: boolean }
  | { name: 'space'; id: string }
  | { name: 'join'; code?: string }
  | { name: 'settings' }
  | { name: 'meeting'; join: JoinInfo; password?: string };

export const NavContext = createContext<(route: Route) => void>(() => {});
export const useNavigate = () => useContext(NavContext);
