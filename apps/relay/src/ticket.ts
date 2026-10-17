/**
 * A room pass: proves the bearer is in room `room` as peer `peer`, until `exp`.
 * Signed with HMAC-SHA256 so only this Worker can make one. Needed to use the media service,
 * which keeps strangers from spending the free Realtime allowance.
 */
export interface Ticket {
  room: string;
  peer: string;
  exp: number;
}

const TICKET_HOURS = 12;
const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signTicket(secret: string, room: string, peer: string, now = Date.now()): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ room, peer, exp: now + TICKET_HOURS * 3_600_000 } satisfies Ticket)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyTicket(secret: string, token: string | null, now = Date.now()): Promise<Ticket | null> {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body)))) return null;
    const ticket = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Ticket;
    return typeof ticket.exp === 'number' && ticket.exp > now ? ticket : null;
  } catch {
    return null;
  }
}
