# Brightboard

A free, simple desktop app for live classes (English + العربية): video, audio, screen share, chat. Teacher controls, local recording and remote control are coming next.

## Run it locally (Windows/Mac)

Open three terminals in this folder:

```bash
npm install
npm run dev:livekit   # video server (downloads LiveKit the first time)
npm run dev:server    # class server on http://localhost:4000
npm run dev:desktop   # opens the app
```

1. In the app: **I'm a teacher → New here? Create a teacher account** (or use the test account below).
2. Pick a class password and **Start class**, then click **Invite → Copy invitation**.
3. Students click the link (it opens Brightboard with the code filled in) or paste it into the code box, then enter their name and the class password.

## Testing with other computers on your network

Start the class server with your computer's LAN IP so students get the right video address:

```bash
LIVEKIT_URL=ws://192.168.1.50:7880 npm run dev:server
```

and build the student app with `VITE_API_URL=http://192.168.1.50:4000`.

## Tests

```bash
npm test
```

## Development notes

- Test teacher account (local dev database only): `dev@local.test` / `devpassword1`. Any number of teacher accounts can be created.
- Invite links look like `http://<server>/j/K7P-2QX` and open the app via `brightboard://join/K7P2QX`. Set `DOWNLOAD_URL` on the server for the "Download" button.
- App icon source: `apps/desktop/build/icon.svg` (regenerate PNG/ICO with `node apps/desktop/build/make-icons.mjs`).
- Design spec: `docs/superpowers/specs/2026-10-04-classroom-meetings-design.md`
- Current plan: `docs/superpowers/plans/2026-10-04-core-meeting.md`
