import type { JoinInfo, ModerateAction, SpaceSettings, Space } from '@classroom/protocol';

/**
 * The only part of the app that talks to the internet: it connects to a live call by room code.
 * Phase 2 implements this on Cloudflare (a Worker + Durable Object per room, and the Realtime SFU for media).
 */

/** A call failure with a stable `code` the UI translates (see `errors` in i18n). */
export class CallError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export interface OpenCall {
  code: string;
  name: string;
  picture: string | null;
  color: string;
  /** Present when this computer is the space's admin. */
  admin?: Space;
  password?: string;
}

const notYet = (): never => {
  throw new CallError('comingSoon');
};

export const callService = {
  open: async (_req: OpenCall): Promise<JoinInfo> => notYet(),
  moderate: async (_code: string, _action: ModerateAction): Promise<void> => notYet(),
  updateRoom: async (_code: string, _patch: Partial<SpaceSettings>): Promise<void> => notYet(),
  end: async (_code: string): Promise<void> => notYet(),
};

/** `https://…/j/ABC-123` once the call service is online; until then the app link. */
const INVITE_BASE: string | undefined = import.meta.env.VITE_INVITE_URL;
export const inviteLink = (code: string) =>
  INVITE_BASE ? `${INVITE_BASE.replace(/\/$/, '')}/j/${code.slice(0, 3)}-${code.slice(3)}` : `brightboard://join/${code}`;

export const randomPassword = () => String(1000 + Math.floor(Math.random() * 9000));
