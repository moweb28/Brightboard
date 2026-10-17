import type { AdminHello, ClientMessage, ServerMessage } from '@classroom/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { RoomCore, type Conn } from './core';

class FakeConn implements Conn {
  sent: ServerMessage[] = [];
  closed = false;
  constructor(public id: string, public ip = '1.1.1.1') {}
  send(m: ServerMessage) {
    this.sent.push(m);
  }
  close() {
    this.closed = true;
  }
  last<T extends ServerMessage['t']>(t: T) {
    return [...this.sent].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
  }
  all<T extends ServerMessage['t']>(t: T) {
    return this.sent.filter((m) => m.t === t) as Extract<ServerMessage, { t: T }>[];
  }
}

const adminHello = (over: Partial<AdminHello> = {}): ClientMessage => ({
  t: 'hello',
  name: 'Huda',
  color: '#4f46e5',
  picture: null,
  admin: {
    key: 'secret-key',
    space: { title: 'Algebra', color: '#4f46e5', picture: null, kind: 'class', schedule: null, adminName: 'Huda' },
    settings: { waitingRoom: false, muteOnJoin: true, guestsCanShare: false, chatEnabled: true },
    password: '',
    ...over,
  },
});
const guestHello = (name = 'Omar', password = ''): ClientMessage => ({ t: 'hello', name, color: '#0ea5e9', picture: null, password });

let room: RoomCore;
let n = 0;
async function join(hello: ClientMessage, ip?: string) {
  const c = new FakeConn(`c${++n}`, ip);
  room.connect(c);
  await room.message(c.id, hello);
  return c;
}

beforeEach(() => {
  n = 0;
  room = new RoomCore({ now: () => 1000, issueTicket: async (id) => `ticket-${id}` });
});

describe('opening a room', () => {
  it('turns guests away until the admin has opened it', async () => {
    const g = await join(guestHello());
    expect(g.last('error')?.code).toBe('notStarted');
    expect(g.closed).toBe(true);
    expect(room.isLive()).toBe(false);
  });

  it('welcomes the admin with the room and a media ticket', async () => {
    const a = await join(adminHello());
    const w = a.last('welcome')!;
    expect(w.you.role).toBe('host');
    expect(w.ticket).toBe(`ticket-${w.you.id}`);
    expect(w.room).toMatchObject({ title: 'Algebra', kind: 'class', muteOnJoin: true, locked: false, recording: false });
    expect(room.isLive()).toBe(true);
  });

  it('rejects someone claiming to be admin with the wrong key', async () => {
    await join(adminHello());
    const fake = await join(adminHello({ key: 'guess' }));
    expect(fake.last('error')?.code).toBe('notAdmin');
    expect(fake.closed).toBe(true);
  });

  it('replaces the admin’s old connection when they rejoin', async () => {
    const a1 = await join(adminHello());
    const a2 = await join(adminHello());
    expect(a1.last('bye')?.reason).toBe('replaced');
    expect(a1.closed).toBe(true);
    expect(a2.last('welcome')!.peers).toEqual([]);
  });
});

describe('guests', () => {
  it('see each other and get told about newcomers and leavers', async () => {
    const a = await join(adminHello());
    const g = await join(guestHello());
    const w = g.last('welcome')!;
    expect(w.you).toMatchObject({ role: 'guest', name: 'Omar', canShare: false, waiting: false });
    expect(w.peers.map((p) => p.name)).toEqual(['Huda']);
    expect(w.space.title).toBe('Algebra');
    expect(a.last('peer')!.peer.name).toBe('Omar');
    room.disconnect(g.id);
    expect(a.last('left')!.id).toBe(w.you.id);
  });

  it('need the password when there is one, and get blocked after many wrong tries', async () => {
    await join(adminHello({ password: '1234' }));
    const wrong = await join(guestHello('Omar', '0000'));
    expect(wrong.last('error')?.code).toBe('wrongPassword');
    expect((await join(guestHello('Omar', '1234'))).last('welcome')).toBeDefined();
    for (let i = 0; i < 10; i++) await join(guestHello('X', 'nope'), '9.9.9.9');
    expect((await join(guestHello('X', '1234'), '9.9.9.9')).last('error')?.code).toBe('tooMany');
  });

  it('can check the password before joining, without being seen', async () => {
    const a = await join(adminHello({ password: '1234' }));
    const ok = await join({ t: 'check', password: '1234' });
    expect(ok.last('checked')).toMatchObject({ space: { title: 'Algebra' }, needsPassword: true });
    expect(ok.closed).toBe(true);
    expect(a.last('peer')).toBeUndefined();
    expect((await join({ t: 'check', password: 'no' })).last('error')?.code).toBe('wrongPassword');
  });

  it('cannot join a locked room', async () => {
    const a = await join(adminHello());
    await room.message(a.id, { t: 'admin', action: { action: 'lock', value: true } });
    expect((await join(guestHello())).last('error')?.code).toBe('locked');
  });

  it('wait in the waiting room until admitted, seeing nobody and getting no ticket', async () => {
    const a = await join(adminHello({ settings: { waitingRoom: true, muteOnJoin: false, guestsCanShare: true, chatEnabled: true } }));
    const g1 = await join(guestHello('Omar'));
    const waitingWelcome = g1.last('welcome')!;
    expect(waitingWelcome.you.waiting).toBe(true);
    expect(waitingWelcome.ticket).toBeNull();
    expect(waitingWelcome.peers).toEqual([]);
    expect(a.last('peer')!.peer).toMatchObject({ name: 'Omar', waiting: true });

    // A second guest admitted earlier must not learn about people still waiting.
    await room.message(a.id, { t: 'admin', action: { action: 'admit', identity: waitingWelcome.you.id } });
    const admitted = g1.last('welcome')!;
    expect(admitted.you.waiting).toBe(false);
    expect(admitted.ticket).toBe(`ticket-${admitted.you.id}`);
    expect(admitted.peers.map((p) => p.name)).toEqual(['Huda']);

    const g2 = await join(guestHello('Sara'));
    expect(g1.all('peer').some((m) => m.peer.name === 'Sara')).toBe(false);
    await room.message(a.id, { t: 'admin', action: { action: 'admitAll' } });
    expect(g1.last('peer')!.peer).toMatchObject({ name: 'Sara', waiting: false });
    expect(g2.last('welcome')!.you.waiting).toBe(false);
  });
});

describe('in the call', () => {
  let a: FakeConn, g: FakeConn, gId: string;
  beforeEach(async () => {
    a = await join(adminHello());
    g = await join(guestHello());
    gId = g.last('welcome')!.you.id;
  });

  it('shares track and state changes with everyone else', async () => {
    await room.message(g.id, { t: 'tracks', tracks: { mic: { sessionId: 's1', trackName: 'm1' } } });
    await room.message(g.id, { t: 'state', state: { micOn: true, hand: true } });
    const seen = a.last('peer')!.peer;
    expect(seen.tracks.mic).toEqual({ sessionId: 's1', trackName: 'm1' });
    expect(seen.state).toMatchObject({ micOn: true, hand: true, cameraOn: false });
  });

  it('relays messages to everyone, or only to the people named', async () => {
    const g2 = await join(guestHello('Sara'));
    await room.message(g.id, { t: 'send', topic: 'chat', data: { text: 'hi' } });
    expect(a.last('msg')).toEqual({ t: 'msg', from: gId, topic: 'chat', data: { text: 'hi' } });
    expect(g2.last('msg')?.topic).toBe('chat');
    expect(g.last('msg')).toBeUndefined();
    const adminId = a.last('welcome')!.you.id;
    await room.message(g.id, { t: 'send', topic: 'dm', data: 1, to: [adminId] });
    expect(a.last('msg')?.topic).toBe('dm');
    expect(g2.last('msg')?.topic).toBe('chat');
  });

  it('only lets the admin moderate', async () => {
    await room.message(g.id, { t: 'admin', action: { action: 'lock', value: true } });
    expect(a.last('room')).toBeUndefined();
    expect(g.last('error')?.code).toBe('notAdmin');
  });

  it('lets the admin mute, allow sharing, spotlight and remove people', async () => {
    await room.message(a.id, { t: 'admin', action: { action: 'mute', identity: gId } });
    expect(g.last('cmd')?.cmd).toBe('mute');
    await room.message(a.id, { t: 'admin', action: { action: 'allowShare', identity: gId, value: true } });
    expect(g.last('peer')!.peer.canShare).toBe(true);
    await room.message(a.id, { t: 'admin', action: { action: 'spotlight', identity: gId } });
    expect(g.last('room')!.room.spotlight).toBe(gId);
    await room.message(a.id, { t: 'admin', action: { action: 'remove', identity: gId } });
    expect(g.last('bye')?.reason).toBe('removed');
    expect(g.closed).toBe(true);
    expect(a.last('left')!.id).toBe(gId);
  });

  it('updates settings live and ends the call for everyone', async () => {
    await room.message(a.id, { t: 'admin', action: { action: 'settings', patch: { chatEnabled: false } } });
    expect(g.last('room')!.room.chatEnabled).toBe(false);
    await room.message(a.id, { t: 'admin', action: { action: 'recording', value: true } });
    expect(g.last('room')!.room.recording).toBe(true);
    await room.message(a.id, { t: 'admin', action: { action: 'end' } });
    expect(g.last('bye')?.reason).toBe('ended');
    expect(a.closed && g.closed).toBe(true);
    expect(room.isLive()).toBe(false);
  });

  it('clears the admin-only flags when the admin drops out, and forgets the room once empty', async () => {
    await room.message(a.id, { t: 'admin', action: { action: 'recording', value: true } });
    room.disconnect(a.id);
    expect(g.last('room')!.room.recording).toBe(false);
    expect(room.isLive()).toBe(true);
    room.disconnect(g.id);
    expect(room.isLive()).toBe(false);
    // A fresh admin key can open it again: nothing was kept.
    expect((await join(adminHello({ key: 'other' }))).last('welcome')).toBeDefined();
  });
});
