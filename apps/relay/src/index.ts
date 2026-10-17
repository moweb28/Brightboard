import { normalizeRoomCode } from '@classroom/protocol';
import { routePartyTracksRequest } from 'partytracks/server';
import { invitePage } from './invite';
import { verifyTicket } from './ticket';

export { Room } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace;
  /** Cloudflare Realtime SFU app (secrets). */
  SFU_APP_ID: string;
  SFU_APP_TOKEN: string;
  /** Optional Cloudflare TURN key, for students behind strict networks (secrets). */
  TURN_APP_ID?: string;
  TURN_APP_TOKEN?: string;
  /** Signs room passes (secret). */
  TICKET_SECRET: string;
  /** Where the invite page sends people who don't have the app yet. */
  DOWNLOAD_URL?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Ticket',
  'Access-Control-Max-Age': '86400',
};

const withCors = (res: Response) => {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
};

/**
 * The connection service. It stores nothing:
 *   /room/CODE/ws       the room's live connection (who's here, messages, admin commands)
 *   /room/CODE/status   is a call going on right now
 *   /partytracks/*      video and sound, for people holding a room pass
 *   /j/ABC-123          invite link page: open the app, or download it
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const room = url.pathname.match(/^\/room\/([^/]+)\/(ws|status)$/);
    if (room) {
      const code = normalizeRoomCode(room[1]);
      if (!code) return withCors(new Response('Unknown room', { status: 404 }));
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const target = new URL(request.url);
      target.searchParams.set('code', code);
      const res = await stub.fetch(new Request(target, request));
      return room[2] === 'ws' ? res : withCors(res);
    }

    if (url.pathname.startsWith('/partytracks/')) {
      if (!(await verifyTicket(env.TICKET_SECRET, request.headers.get('X-Ticket')))) return withCors(new Response('Not in a room', { status: 401 }));
      const res = await routePartyTracksRequest({
        appId: env.SFU_APP_ID,
        token: env.SFU_APP_TOKEN,
        turnServerAppId: env.TURN_APP_ID,
        turnServerAppToken: env.TURN_APP_TOKEN,
        prefix: '/partytracks',
        // The room pass already locks access; the cookie lock doesn't work across origins.
        lockSessionToInitiator: false,
        request,
      });
      return withCors(res);
    }

    const invite = url.pathname.match(/^\/j\/([^/]+)$/);
    if (invite) {
      const code = normalizeRoomCode(invite[1]);
      return new Response(invitePage(code, env.DOWNLOAD_URL), { status: code ? 200 : 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    if (url.pathname === '/health') return withCors(Response.json({ ok: true }));
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
