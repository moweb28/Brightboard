# Classroom

A free, simple desktop app for live classes: video, audio, screen share, chat. Teacher controls, local recording and remote control are coming next.

## Run it locally (Windows/Mac)

Open three terminals in this folder:

```bash
npm install
npm run dev:livekit   # video server (downloads LiveKit the first time)
npm run dev:server    # class server on http://localhost:4000
npm run dev:desktop   # opens the app
```

1. In the app: **I'm the teacher → First time? Create the teacher account** (only the first account can be created).
2. **Start a new class** and copy the code.
3. Open a second app window (run `npm run dev:desktop` again or use another computer), choose **Join class**, enter the code and a name.

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

- Dev test teacher account (created during development, local DB only): `dev@local.test` / `devpassword1`.
  Delete `apps/server/classroom.db` (while the server is stopped) to start fresh and create your own.
- Design spec: `docs/superpowers/specs/2026-10-04-classroom-meetings-design.md`
- Current plan: `docs/superpowers/plans/2026-10-04-core-meeting.md`
