// Attacks a running relay to check its defenses. Usage: node attack/attack.mjs [http://127.0.0.1:8787]
// Run it against your own relay only.
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 6 }, () => A[Math.floor(Math.random() * 32)]).join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const space = { title: 'X', color: '#000000', picture: null, kind: 'class', schedule: null, adminName: 'T' };
const settings = { waitingRoom: false, muteOnJoin: false, guestsCanShare: true, chatEnabled: true };

function open(room) {
  return new Promise((res, rej) => {
    const w = new WebSocket(`${WS}/room/${room}/ws`);
    w.msgs = [];
    w.closed = false;
    w.onmessage = (e) => w.msgs.push(JSON.parse(e.data));
    w.onclose = () => (w.closed = true);
    w.onopen = () => res(w);
    w.onerror = () => rej(new Error('ws error'));
  });
}
const send = (w, m) => w.readyState === 1 && w.send(JSON.stringify(m));
const last = (w, t) => [...w.msgs].reverse().find((m) => !t || m.t === t);
const admin = (key, password = '', extra = {}) => ({ t: 'hello', name: 'T', color: '#000000', picture: null, admin: { key, space, settings: { ...settings, ...extra }, password } });
const guest = (name, password) => ({ t: 'hello', name, color: '#000000', picture: null, password });
const results = [];
const report = (name, vulnerable, detail) => {
  results.push({ name, vulnerable });
  console.log(`${vulnerable ? 'VULNERABLE' : 'safe      '}  ${name} — ${detail}`);
};
const realKey = 'r'.repeat(48);

// 1. Squatting: after the real admin used a code, an attacker opens it first with their own key.
{
  const room = code();
  const real = await open(room);
  send(real, admin(realKey));
  await sleep(300);
  send(real, { t: 'admin', action: { action: 'end' } });
  await sleep(300);
  const bad = await open(room);
  send(bad, admin('x'.repeat(48), 'attacker-pw'));
  await sleep(300);
  const back = await open(room);
  send(back, admin(realKey));
  await sleep(300);
  report('room squatting', last(back)?.t !== 'welcome', `real admin got "${last(back)?.t} ${last(back)?.code ?? ''}", attacker got "${last(bad)?.t} ${last(bad)?.code ?? ''}"`);
  bad.close();
  back.close();
}

// 2. Password guessing from one address.
{
  const room = code();
  const h = await open(room);
  send(h, admin(realKey, 'secret'));
  await sleep(300);
  let checked = 0;
  let blocked = 0;
  for (let i = 0; i < 40; i++) {
    const g = await open(room);
    send(g, guest('g', 'guess' + i));
    await sleep(40);
    const m = last(g);
    if (m?.code === 'tooMany') blocked++;
    if (m?.code === 'wrongPassword') checked++;
    g.close();
  }
  report('password guessing limit', blocked === 0, `${checked} guesses checked, ${blocked} blocked`);
  h.close();
}

// 3. Idle connections that never say hello.
{
  const room = code();
  const socks = [];
  for (let i = 0; i < 200; i++) socks.push(await open(room).catch(() => null));
  await sleep(12_000);
  const alive = socks.filter((s) => s && !s.closed).length;
  report('idle connection flood', alive > 20, `${alive}/200 idle sockets still open after 12 s`);
  socks.forEach((s) => s?.close());
}

// 4. Bots filling one room.
{
  const room = code();
  const h = await open(room);
  send(h, admin(realKey));
  await sleep(300);
  const gs = [];
  for (let i = 0; i < 220; i++) {
    const g = await open(room);
    send(g, guest('bot' + i));
    gs.push(g);
  }
  await sleep(2000);
  const inRoom = gs.filter((g) => last(g, 'welcome')).length;
  report('room size cap', inRoom > 150, `${inRoom}/220 bots got in`);
  gs.forEach((g) => g.close());
  h.close();
}

// 5. One guest spamming messages.
{
  const room = code();
  const h = await open(room);
  send(h, admin(realKey));
  await sleep(300);
  const g = await open(room);
  send(g, guest('spammer'));
  await sleep(300);
  for (let i = 0; i < 2000; i++) send(g, { t: 'send', topic: 'chat', data: { s: 'spam' + i } });
  await sleep(2000);
  const got = h.msgs.filter((m) => m.t === 'msg').length;
  report('message flood limit', got > 600, `host received ${got}/2000 spam messages`);
  g.close();
  h.close();
}

// 6. Guest tries admin actions.
{
  const room = code();
  const h = await open(room);
  send(h, admin(realKey));
  await sleep(300);
  const g = await open(room);
  send(g, guest('evil'));
  await sleep(300);
  send(g, { t: 'admin', action: { action: 'end' } });
  await sleep(300);
  report('guest admin actions', h.closed, `guest got "${last(g)?.code}", host still in: ${!h.closed}`);
  g.close();
  h.close();
}

// 7. A removed guest keeps using their media pass.
{
  const room = code();
  const h = await open(room);
  send(h, admin(realKey));
  await sleep(300);
  const g = await open(room);
  send(g, guest('kicked'));
  await sleep(300);
  const { ticket, you } = last(g, 'welcome');
  send(h, { t: 'admin', action: { action: 'remove', identity: you.id } });
  await sleep(300);
  const r = await fetch(`${BASE}/partytracks/sessions/new`, { method: 'POST', headers: { 'X-Ticket': ticket } });
  report('removed guest media pass', r.status !== 401, `media request after removal: HTTP ${r.status}`);
  h.close();
}

// 8. Media with no pass, and with a forged one.
{
  const a = await fetch(`${BASE}/partytracks/sessions/new`, { method: 'POST' });
  const forged = Buffer.from(JSON.stringify({ room: 'AAAAAA', peer: 'x', exp: Date.now() + 1e9 })).toString('base64url') + '.AAAA';
  const b = await fetch(`${BASE}/partytracks/sessions/new`, { method: 'POST', headers: { 'X-Ticket': forged } });
  report('media pass required', a.status !== 401 || b.status !== 401, `no pass: HTTP ${a.status}, forged pass: HTTP ${b.status}`);
}

// 9. Hostile profile fields.
{
  const room = code();
  const h = await open(room);
  send(h, admin(realKey));
  await sleep(300);
  const g = await open(room);
  send(g, { t: 'hello', name: 'x', color: 'red;background:url(https://evil.example/t)', picture: 'data:image/svg+xml,<svg onload=alert(1)>' });
  await sleep(300);
  const p = last(h, 'peer')?.peer;
  report('profile field checks', !!p && (p.color.includes('url(') || (p.picture ?? '').includes('svg')), `color ${JSON.stringify(p?.color)}, picture ${JSON.stringify((p?.picture ?? null)?.slice?.(0, 24) ?? null)}`);
  g.close();
  h.close();
}

// 10. A waiting guest tries to reach the room.
{
  const room = code();
  const h = await open(room);
  send(h, admin(realKey, '', { waitingRoom: true }));
  await sleep(300);
  const g = await open(room);
  send(g, guest('lurker'));
  await sleep(300);
  send(g, { t: 'send', topic: 'chat', data: { s: 'sneaky' } });
  await sleep(300);
  const leaked = h.msgs.some((m) => m.t === 'msg');
  report('waiting room isolation', leaked || !!last(g, 'welcome')?.ticket, `message leaked: ${leaked}, media pass given: ${!!last(g, 'welcome')?.ticket}`);
  g.close();
  h.close();
}

// 11. Huge messages.
{
  const room = code();
  const h = await open(room);
  send(h, admin(realKey));
  await sleep(300);
  const g = await open(room);
  send(g, guest('big'));
  await sleep(300);
  send(g, { t: 'send', topic: 'chat', data: { s: 'x'.repeat(2_000_000) } });
  await sleep(800);
  report('oversized messages', h.msgs.some((m) => m.t === 'msg'), `2 MB message relayed: ${h.msgs.some((m) => m.t === 'msg')}`);
  g.close();
  h.close();
}

const bad = results.filter((r) => r.vulnerable).length;
console.log(`\n${bad} of ${results.length} checks vulnerable`);
process.exit(0);
