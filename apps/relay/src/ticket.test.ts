import { describe, expect, it } from 'vitest';
import { signTicket, verifyTicket } from './ticket';

describe('room passes', () => {
  it('verify when signed with the same secret and not expired', async () => {
    const t = await signTicket('s3cret', 'ABC123', 'g-1', 1000);
    expect(await verifyTicket('s3cret', t, 2000)).toMatchObject({ room: 'ABC123', peer: 'g-1' });
  });

  it('fail with another secret, after 12 hours, or when tampered with', async () => {
    const t = await signTicket('s3cret', 'ABC123', 'g-1', 0);
    expect(await verifyTicket('other', t, 1)).toBeNull();
    expect(await verifyTicket('s3cret', t, 12 * 3_600_000 + 1)).toBeNull();
    const [body, sig] = t.split('.');
    const forged = btoa(JSON.stringify({ room: 'ZZZ999', peer: 'g-1', exp: 9e15 })).replace(/=+$/, '');
    expect(await verifyTicket('s3cret', `${forged}.${sig}`, 1)).toBeNull();
    expect(await verifyTicket('s3cret', body, 1)).toBeNull();
    expect(await verifyTicket('s3cret', null, 1)).toBeNull();
  });
});
