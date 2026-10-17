import { MAX_MESSAGE_BYTES, type ClientMessage } from '@classroom/protocol';
import { DurableObject } from 'cloudflare:workers';
import { RoomCore } from './core';
import type { Env } from './index';
import { signTicket } from './ticket';

/**
 * One room per code. Connections stay open (no hibernation), so the room lives in memory
 * while anyone is in it and is gone when they leave. The only thing written to storage is a
 * hash of the admin key (the room's owner), so nobody else can take the code over.
 */
export class Room extends DurableObject<Env> {
  private core: RoomCore;
  private code = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new RoomCore({
      now: () => Date.now(),
      issueTicket: (peer) => signTicket(env.TICKET_SECRET, this.code, peer),
      owner: {
        get: async () => (await ctx.storage.get<string>('owner')) ?? null,
        set: (hash) => ctx.storage.put('owner', hash),
      },
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.code = url.searchParams.get('code') ?? this.code;
    if (url.pathname.endsWith('/status')) return Response.json({ live: this.core.isLive() });
    if (url.pathname.endsWith('/present')) return Response.json({ present: this.core.hasPeer(url.searchParams.get('peer') ?? '') });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const id = crypto.randomUUID();
    this.core.connect({
      id,
      ip: request.headers.get('CF-Connecting-IP') ?? 'unknown',
      send: (msg) => {
        try {
          server.send(JSON.stringify(msg));
        } catch {
          /* already closed */
        }
      },
      close: () => {
        try {
          server.close(1000, 'bye');
        } catch {
          /* already closed */
        }
      },
    });
    server.addEventListener('message', (e) => {
      if (typeof e.data !== 'string' || e.data.length > MAX_MESSAGE_BYTES) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      void this.core.message(id, msg);
    });
    const gone = () => this.core.disconnect(id);
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
}
