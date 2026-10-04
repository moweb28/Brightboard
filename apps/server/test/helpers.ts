import type { Role } from '@classroom/protocol';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import type { RoomControl } from '../src/roomControl';

export const testConfig: Config = {
  port: 0,
  jwtSecret: 'test-secret-test-secret-test-secret',
  dbPath: ':memory:',
  livekitUrl: 'ws://localhost:7880',
  livekitApiKey: 'devkey',
  livekitApiSecret: 'secret-secret-secret-secret-secret',
  downloadUrl: 'https://example.com/download',
};

/** Records every LiveKit call; participants can be seeded per room. */
export class FakeRoomControl implements RoomControl {
  calls: { fn: string; args: unknown[] }[] = [];
  participants = new Map<string, { identity: string; metadata: string; tracks: { sid: string; source: string }[] }[]>();

  private record(fn: string, ...args: unknown[]) {
    this.calls.push({ fn, args });
  }
  callsTo(fn: string) {
    return this.calls.filter((c) => c.fn === fn).map((c) => c.args);
  }
  async ensureRoom(room: string, metadata: string) { this.record('ensureRoom', room, metadata); }
  async deleteRoom(room: string) { this.record('deleteRoom', room); }
  async setRoomMetadata(room: string, metadata: string) { this.record('setRoomMetadata', room, metadata); }
  async listParticipants(room: string) { return this.participants.get(room) ?? []; }
  async muteTrack(room: string, identity: string, trackSid: string) { this.record('muteTrack', room, identity, trackSid); }
  async removeParticipant(room: string, identity: string) { this.record('removeParticipant', room, identity); }
  async updateParticipant(room: string, identity: string, metadata: string | undefined, permission: object | undefined) {
    this.record('updateParticipant', room, identity, metadata, permission);
  }
}

export function makeApp() {
  const rc = new FakeRoomControl();
  const app = buildApp(testConfig, { roomControl: rc });
  return Object.assign(app, { rc });
}

export type TestApp = ReturnType<typeof makeApp>;

export async function register(app: TestApp, role: Role = 'teacher', email = `${role}@example.com`) {
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123', role } });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  return res.json().token as string;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export async function createClass(app: TestApp, token: string, body: Record<string, unknown> = {}) {
  const res = await app.inject({ method: 'POST', url: '/classes', headers: bearer(token), payload: { title: 'Math 101', password: '4821', ...body } });
  if (res.statusCode !== 201) throw new Error(`create class failed: ${res.body}`);
  return res.json();
}
