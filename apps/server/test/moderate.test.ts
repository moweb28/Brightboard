import { describe, expect, it } from 'vitest';
import { bearer, createSpace, makeApp, register } from './helpers';

async function setup() {
  const app = makeApp();
  const host = await register(app);
  const c = await createSpace(app, host);
  await app.inject({ method: 'POST', url: `/spaces/${c.id}/start`, headers: bearer(host) });
  app.rc.participants.set(c.code, [
    { identity: 't-1', metadata: JSON.stringify({ role: 'host' }), tracks: [{ sid: 'TR_t', source: 'MICROPHONE' }] },
    { identity: 'g-a', metadata: JSON.stringify({ role: 'guest' }), tracks: [{ sid: 'TR_a_mic', source: 'MICROPHONE' }, { sid: 'TR_a_cam', source: 'CAMERA' }] },
    { identity: 'g-b', metadata: JSON.stringify({ role: 'guest', waiting: true }), tracks: [] },
  ]);
  const mod = (payload: object, token = host) => app.inject({ method: 'POST', url: `/spaces/${c.id}/moderate`, headers: bearer(token), payload });
  return { app, c, host, mod };
}

describe('moderation', () => {
  it('only the owner can moderate', async () => {
    const { app, mod } = await setup();
    const other = await register(app, 'guest@example.com');
    expect((await mod({ action: 'muteAll' }, other)).statusCode).toBe(404);
  });

  it('mutes one guest mic, or all guest mics but not the host', async () => {
    const { app, c, mod } = await setup();
    expect((await mod({ action: 'mute', identity: 'g-a' })).statusCode).toBe(204);
    expect(app.rc.callsTo('muteTrack')).toEqual([[c.code, 'g-a', 'TR_a_mic']]);
    app.rc.calls = [];
    await mod({ action: 'muteAll' });
    expect(app.rc.callsTo('muteTrack')).toEqual([[c.code, 'g-a', 'TR_a_mic']]);
  });

  it('stops a camera and removes a participant', async () => {
    const { app, c, mod } = await setup();
    await mod({ action: 'stopVideo', identity: 'g-a' });
    expect(app.rc.callsTo('muteTrack')).toEqual([[c.code, 'g-a', 'TR_a_cam']]);
    await mod({ action: 'remove', identity: 'g-a' });
    expect(app.rc.callsTo('removeParticipant')).toEqual([[c.code, 'g-a']]);
  });

  it('cannot target the host', async () => {
    const { mod } = await setup();
    expect((await mod({ action: 'remove', identity: 't-1' })).statusCode).toBe(400);
  });

  it('admits waiting guests with full rights', async () => {
    const { app, c, mod } = await setup();
    await mod({ action: 'admitAll' });
    const calls = app.rc.callsTo('updateParticipant');
    expect(calls).toHaveLength(1);
    const [room, identity, metadata, permission] = calls[0] as [string, string, string, Record<string, unknown>];
    expect([room, identity]).toEqual([c.code, 'g-b']);
    expect(JSON.parse(metadata).waiting).toBe(false);
    expect(permission).toMatchObject({ canSubscribe: true, canPublish: true, canPublishData: true });
  });

  it('toggles screen share permission per guest', async () => {
    const { app, mod } = await setup();
    await mod({ action: 'allowShare', identity: 'g-a', value: true });
    const [, , , permission] = app.rc.callsTo('updateParticipant')[0] as [string, string, string, { canPublishSources: number[] }];
    expect(permission.canPublishSources).toHaveLength(4);
  });

  it('lock, chat and spotlight update room metadata', async () => {
    const { app, mod } = await setup();
    await mod({ action: 'lock', value: true });
    await mod({ action: 'chat', value: false });
    await mod({ action: 'spotlight', identity: 'g-a' });
    const meta = JSON.parse(app.rc.callsTo('setRoomMetadata').at(-1)![1] as string);
    expect(meta).toMatchObject({ locked: true, chatEnabled: false, spotlight: 'g-a' });
  });

  it('rejects unknown actions', async () => {
    const { mod } = await setup();
    expect((await mod({ action: 'explode' })).statusCode).toBe(400);
  });
});

describe('recording flag', () => {
  it('the admin can mark the call as recorded, and a new call starts unrecorded', async () => {
    const { app, c, host, mod } = await setup();
    expect((await mod({ action: 'recording', value: true })).statusCode).toBe(204);
    expect(JSON.parse(app.rc.callsTo('setRoomMetadata').at(-1)![1] as string).recording).toBe(true);
    await app.inject({ method: 'POST', url: `/spaces/${c.id}/end`, headers: bearer(host) });
    await app.inject({ method: 'POST', url: `/spaces/${c.id}/start`, headers: bearer(host) });
    expect(JSON.parse(app.rc.callsTo('ensureRoom').at(-1)![1] as string).recording).toBe(false);
  });
});

describe('recording flag after a crash', () => {
  it('rejoining an open call clears a stale recording flag (only the admin records)', async () => {
    const { app, c, host, mod } = await setup();
    await mod({ action: 'recording', value: true });
    // Admin's app restarts and starts the space again while the call is still open.
    await app.inject({ method: 'POST', url: `/spaces/${c.id}/start`, headers: bearer(host) });
    expect(JSON.parse(app.rc.callsTo('ensureRoom').at(-1)![1] as string).recording).toBe(false);
  });
});
