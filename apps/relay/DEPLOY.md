# Deploying the relay

The relay is one Cloudflare Worker (`brightboard`) with a Durable Object per room, plus Cloudflare Realtime for video and sound. Everything stays on free plans: no card is needed for Workers Free, and Realtime has a free monthly allowance (check the current amount on the Realtime pricing page before going big).

Run every command from `apps/relay`.

## 1. Cloudflare account
Sign up or log in at https://dash.cloudflare.com (the free plan is enough). The first time you open **Workers & Pages**, pick your `workers.dev` subdomain. The relay will live at `https://brightboard.<subdomain>.workers.dev`.

## 2. Log wrangler in
```
npx wrangler login
```
This opens the browser so you can allow access. Check it with `npx wrangler whoami`.

## 3. Create the Realtime apps (dashboard → Realtime)
- **Serverless SFU** → *Create* → name it `brightboard`. Copy the **App ID** and **App Token**.
- **TURN Server** (optional, for students behind strict school or office networks) → *Create*. Copy the **Turn Token ID** and **API Token**.

## 4. Set the secrets
```
npx wrangler secret put SFU_APP_ID
npx wrangler secret put SFU_APP_TOKEN
npx wrangler secret put TICKET_SECRET
npx wrangler secret put TURN_APP_ID      # optional
npx wrangler secret put TURN_APP_TOKEN   # optional
```
For `TICKET_SECRET`, paste a long random value, for example the output of:
```
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```
Use a different value from the one in your local `.dev.vars`. To test real video locally too, put the same SFU (and TURN) values into `.dev.vars`. That file is git-ignored; never commit it.

## 5. Deploy
```
npx wrangler deploy
```
It prints the URL. Check it: `https://brightboard.<subdomain>.workers.dev/health` should show `{"ok":true}`.

## 6. Point the app at it
In `apps/desktop/.env.production`, replace the placeholder:
```
VITE_RELAY_URL=https://brightboard.<subdomain>.workers.dev
```
Until you do, `npm run build` in the desktop app stops with a reminder. `npm run dev` keeps using the local relay from `.env.development`.

## Later
- Once the Windows installer is on GitHub Releases, set `DOWNLOAD_URL` in `wrangler.jsonc` to that page and deploy again.
- Logs: `npx wrangler tail`. Usage: dashboard → Workers & Pages → brightboard, and Realtime → your app.

## Security check after deploying
Run the attack script against your live relay. All 11 checks should say `safe`:
```
node attack/attack.mjs https://brightboard.<subdomain>.workers.dev
```
It tries room squatting, password guessing, connection and message floods, bot floods, forged or stale media passes, hostile profile data and waiting-room leaks.

What the relay stores: only a SHA-256 hash of each space's admin key, so nobody else can ever open that space as admin. No names, messages, pictures or passwords are ever written down.

Optional extra shield (free): dashboard → your domain or Worker → Security → WAF → Rate limiting rules, e.g. 60 requests per 10 seconds per IP on `/room/*`. This keeps a stranger from burning your free daily request allowance.
