import type { ModerateAction, ParticipantMeta } from '@classroom/protocol';
import type { FastifyInstance } from 'fastify';
import { HttpError, type Auth } from './auth';
import type { SpaceStore } from './spaceStore';
import type { Db } from './db';
import { sourcesFor, type RoomControl, type RoomParticipant } from './roomControl';

const parseMeta = (p: RoomParticipant): ParticipantMeta => {
  try {
    return JSON.parse(p.metadata) as ParticipantMeta;
  } catch {
    return { role: 'guest' };
  }
};

const ACTIONS = ['mute', 'stopVideo', 'remove', 'admit', 'muteAll', 'admitAll', 'allowShare', 'lock', 'chat', 'recording', 'board', 'boardLock', 'spotlight'];

export function registerModerate(app: FastifyInstance, db: Db, auth: Auth, store: SpaceStore, rc: RoomControl) {
  app.post<{ Params: { id: string }; Body: ModerateAction }>(
    '/spaces/:id/moderate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['action'],
          properties: { action: { enum: ACTIONS }, identity: { type: ['string', 'null'], maxLength: 64 }, value: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      const user = await auth.requireUser(req);
      const c = store.findHosted(Number(req.params.id), user.id);
      if (!store.openCall(c.id)) throw new HttpError(409, 'This space is not live', 'notLive');
      const body = req.body;
      const participants = await rc.listParticipants(c.code);
      const guests = participants.filter((p) => parseMeta(p).role !== 'host');

      const target = () => {
        const identity = 'identity' in body ? body.identity : null;
        const p = participants.find((x) => x.identity === identity);
        if (!p) throw new HttpError(404, 'That person is no longer here', 'gone');
        if (parseMeta(p).role === 'host') throw new HttpError(400, 'You cannot moderate yourself', 'self');
        return p;
      };
      const muteSource = async (p: RoomParticipant, source: string) => {
        for (const t of p.tracks.filter((t) => t.source === source)) await rc.muteTrack(c.code, p.identity, t.sid);
      };
      const admit = (p: RoomParticipant) =>
        rc.updateParticipant(c.code, p.identity, JSON.stringify({ ...parseMeta(p), waiting: false }), {
          canSubscribe: true,
          canPublish: true,
          canPublishData: true,
          canUpdateMetadata: true,
          canPublishSources: sourcesFor(!!c.guests_can_share),
        });
      const updateSpace = async (column: 'locked' | 'chat_enabled' | 'recording' | 'board_open' | 'board_locked' | 'spotlight', value: number | string | null) => {
        db.prepare(`UPDATE spaces SET ${column} = ? WHERE id = ?`).run(value, c.id);
        await rc.setRoomMetadata(c.code, JSON.stringify(store.roomMeta(store.byId(c.id)!)));
      };

      switch (body.action) {
        case 'mute':
          await muteSource(target(), 'MICROPHONE');
          break;
        case 'stopVideo':
          await muteSource(target(), 'CAMERA');
          break;
        case 'remove':
          await rc.removeParticipant(c.code, target().identity);
          break;
        case 'admit':
          await admit(target());
          break;
        case 'muteAll':
          for (const p of guests) await muteSource(p, 'MICROPHONE');
          break;
        case 'admitAll':
          for (const p of guests.filter((p) => parseMeta(p).waiting)) await admit(p);
          break;
        case 'allowShare': {
          const p = target();
          await rc.updateParticipant(c.code, p.identity, undefined, { canPublishSources: sourcesFor(body.value) });
          break;
        }
        case 'lock':
          await updateSpace('locked', Number(body.value));
          break;
        case 'chat':
          await updateSpace('chat_enabled', Number(body.value));
          break;
        case 'recording':
          await updateSpace('recording', Number(body.value));
          break;
        case 'board':
          await updateSpace('board_open', Number(body.value));
          break;
        case 'boardLock':
          await updateSpace('board_locked', Number(body.value));
          break;
        case 'spotlight':
          if (body.identity) target();
          await updateSpace('spotlight', body.identity ?? null);
          break;
      }
      reply.code(204);
    },
  );
}
