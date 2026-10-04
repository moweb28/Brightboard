import { describe, expect, it } from 'vitest';
import { bearer, createClass, makeApp, register } from './helpers';

async function setup() {
  const app = makeApp();
  const teacher = await register(app);
  const c = await createClass(app, teacher);
  await app.inject({ method: 'POST', url: `/classes/${c.id}/start`, headers: bearer(teacher) });
  app.rc.participants.set(c.code, [
    { identity: 't-1', metadata: JSON.stringify({ role: 'teacher' }), tracks: [{ sid: 'TR_t', source: 'MICROPHONE' }] },
    { identity: 'g-a', metadata: JSON.stringify({ role: 'student' }), tracks: [{ sid: 'TR_a_mic', source: 'MICROPHONE' }, { sid: 'TR_a_cam', source: 'CAMERA' }] },
    { identity: 'g-b', metadata: JSON.stringify({ role: 'student', waiting: true }), tracks: [] },
  ]);
  const mod = (payload: object, token = teacher) => app.inject({ method: 'POST', url: `/classes/${c.id}/moderate`, headers: bearer(token), payload });
  return { app, c, teacher, mod };
}

describe('moderation', () => {
  it('only the owner can moderate', async () => {
    const { app, mod } = await setup();
    const student = await register(app, 'student');
    expect((await mod({ action: 'muteAll' }, student)).statusCode).toBe(404);
  });

  it('mutes one student mic, or all student mics but not the teacher', async () => {
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

  it('cannot target the teacher', async () => {
    const { mod } = await setup();
    expect((await mod({ action: 'remove', identity: 't-1' })).statusCode).toBe(400);
  });

  it('admits waiting students with full rights', async () => {
    const { app, c, mod } = await setup();
    await mod({ action: 'admitAll' });
    const calls = app.rc.callsTo('updateParticipant');
    expect(calls).toHaveLength(1);
    const [room, identity, metadata, permission] = calls[0] as [string, string, string, Record<string, unknown>];
    expect([room, identity]).toEqual([c.code, 'g-b']);
    expect(JSON.parse(metadata).waiting).toBe(false);
    expect(permission).toMatchObject({ canSubscribe: true, canPublish: true, canPublishData: true });
  });

  it('toggles screen share permission per student', async () => {
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
