import { MAX_PEERS, type AdminHello, type ClientMessage, type ServerMessage } from '@classroom/protocol';
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
    key: KEY,
    space: { title: 'Algebra', color: '#4f46e5', picture: null, kind: 'class', schedule: null, adminName: 'Huda' },
    settings: { waitingRoom: false, muteOnJoin: true, guestsCanShare: false, guestsCanBoard: false, chatEnabled: true },
    password: '',
    ...over,
  },
});
const KEY = 'k'.repeat(48);
const OTHER_KEY = 'o'.repeat(48);
const guestHello = (name = 'Omar', password = ''): ClientMessage => ({ t: 'hello', name, color: '#0ea5e9', picture: null, password });

let room: RoomCore;
let owner: string | null;
let timers: (() => void)[];
let clock: number;
let n = 0;
async function join(hello: ClientMessage, ip?: string) {
  const c = new FakeConn(`c${++n}`, ip);
  room.connect(c);
  await room.message(c.id, hello);
  return c;
}

beforeEach(() => {
  n = 0;
  owner = null;
  timers = [];
  clock = 1000;
  room = new RoomCore({
    now: () => clock,
    issueTicket: async (id) => `ticket-${id}`,
    owner: { get: async () => owner, set: async (h) => void (owner = h) },
    schedule: (fn) => void timers.push(fn),
  });
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
    const fake = await join(adminHello({ key: OTHER_KEY }));
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
    const a = await join(adminHello({ settings: { waitingRoom: true, muteOnJoin: false, guestsCanShare: true, guestsCanBoard: true, chatEnabled: true } }));
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
    // Only the owner can open it again; another key can't take the code over.
    expect((await join(adminHello({ key: OTHER_KEY }))).last('error')?.code).toBe('notAdmin');
    expect((await join(adminHello())).last('welcome')).toBeDefined();
  });
});

describe('defenses', () => {
  it('lets a space be claimed once, by its key, and keeps squatters out', async () => {
    const claim = async (key: string) => {
      const c = new FakeConn(`c${++n}`);
      room.connect(c);
      await room.message(c.id, { t: 'claim', key });
      return c.last('claimed')?.ok;
    };
    expect(await claim('short')).toBe(false);
    expect(await claim(KEY)).toBe(true);
    expect(await claim(KEY)).toBe(true);
    expect(await claim(OTHER_KEY)).toBe(false);
    expect(owner).toMatch(/^[0-9a-f]{64}$/); // only a hash is stored, never the key
    expect((await join(adminHello({ key: OTHER_KEY }))).last('error')?.code).toBe('notAdmin');
    expect((await join(adminHello())).last('welcome')).toBeDefined();
  });

  it('closes sockets that never say hello', async () => {
    const idle = new FakeConn('idle');
    room.connect(idle);
    const a = await join(adminHello());
    timers.forEach((fn) => fn());
    expect(idle.closed).toBe(true);
    expect(a.closed).toBe(false);
  });

  it('turns people away once the room is full', async () => {
    await join(adminHello());
    for (let i = 0; i < MAX_PEERS - 1; i++) await join(guestHello(`g${i}`));
    expect((await join(guestHello('late'))).last('error')?.code).toBe('full');
  });

  it('drops message floods and cuts off the flooder', async () => {
    const a = await join(adminHello());
    const g = await join(guestHello());
    for (let i = 0; i < 1000; i++) await room.message(g.id, { t: 'send', topic: 'chat', data: i });
    const got = a.all('msg').length;
    expect(got).toBeGreaterThan(100);
    expect(got).toBeLessThanOrEqual(401);
    clock += 1000; // a second later the guest can talk again
    await room.message(g.id, { t: 'send', topic: 'chat', data: 'ok' });
    expect(a.last('msg')?.data).toBe('ok');
    for (let i = 0; i < 3500; i++) await room.message(g.id, { t: 'send', topic: 'chat', data: i });
    expect(g.closed).toBe(true);
  });

  it('cleans hostile profile and space fields', async () => {
    const a = await join({ ...adminHello(), admin: { ...(adminHello() as { admin: AdminHello }).admin, space: { title: 'x'.repeat(500), color: 'red;x:url(y)', picture: 'data:image/svg+xml,<svg onload=alert(1)>', kind: 'evil', schedule: null, adminName: 'H' } as never } } as ClientMessage);
    expect(a.last('welcome')!.space).toMatchObject({ color: '#4f46e5', picture: null, kind: 'meeting' });
    expect(a.last('welcome')!.space.title).toHaveLength(80);
    await join({ t: 'hello', name: 'x', color: 'red;background:url(https://evil.example)', picture: 'data:image/svg+xml,<svg onload=alert(1)>' });
    expect(a.last('peer')!.peer).toMatchObject({ color: '#4f46e5', picture: null });
  });

  it('lets an admitted guest come back after a dropped connection, skipping the waiting room', async () => {
    const a = await join(adminHello({ settings: { waitingRoom: true, muteOnJoin: false, guestsCanShare: false, guestsCanBoard: false, chatEnabled: true } }));
    const g = await join(guestHello());
    const id = g.last('welcome')!.you.id;
    await room.message(a.id, { t: 'admin', action: { action: 'admit', identity: id } });
    const pass = g.last('welcome')!.resume!;
    expect(pass).toBeTruthy();
    room.disconnect(g.id); // wifi drops
    const back = await join({ ...guestHello(), resume: pass } as ClientMessage);
    expect(back.last('welcome')!.you).toMatchObject({ id, waiting: false });
    expect(back.last('welcome')!.ticket).toBeTruthy();
    // A made-up pass, or one used after removal, gets the normal waiting room.
    expect((await join({ ...guestHello('x'), resume: 'nope' } as ClientMessage)).last('welcome')!.you.waiting).toBe(true);
    await room.message(a.id, { t: 'admin', action: { action: 'remove', identity: id } });
    expect((await join({ ...guestHello(), resume: pass } as ClientMessage)).last('welcome')!.you.waiting).toBe(true);
  });

  it('expires resume passes after a few minutes', async () => {
    await join(adminHello({ settings: { waitingRoom: true, muteOnJoin: false, guestsCanShare: false, guestsCanBoard: false, chatEnabled: true } }));
    const g = await join(guestHello());
    await room.message('c1', { t: 'admin', action: { action: 'admit', identity: g.last('welcome')!.you.id } });
    const pass = g.last('welcome')!.resume!;
    room.disconnect(g.id);
    clock += 4 * 60_000;
    expect((await join({ ...guestHello(), resume: pass } as ClientMessage)).last('welcome')!.you.waiting).toBe(true);
  });

  it('lets guests open the whiteboard only when allowed, and never close it', async () => {
    const a = await join(adminHello({ settings: { waitingRoom: false, muteOnJoin: false, guestsCanShare: false, guestsCanBoard: true, chatEnabled: true } }));
    const g = await join(guestHello());
    await room.message(g.id, { t: 'admin', action: { action: 'board', value: true } });
    expect(a.last('room')!.room.boardOpen).toBe(true);
    await room.message(g.id, { t: 'admin', action: { action: 'board', value: false } });
    expect(g.last('error')?.code).toBe('notAdmin');
    expect(a.last('room')!.room.boardOpen).toBe(true);
    await room.message(a.id, { t: 'admin', action: { action: 'board', value: false } });
    await room.message(a.id, { t: 'admin', action: { action: 'settings', patch: { guestsCanBoard: false } } });
    await room.message(g.id, { t: 'admin', action: { action: 'board', value: true } });
    expect(a.last('room')!.room.boardOpen).toBe(false);
  });

  it('honors media passes only for people still in the room', async () => {
    const a = await join(adminHello());
    const g = await join(guestHello());
    const id = g.last('welcome')!.you.id;
    expect(room.hasPeer(id)).toBe(true);
    await room.message(a.id, { t: 'admin', action: { action: 'remove', identity: id } });
    expect(room.hasPeer(id)).toBe(false);
  });
});
