# Brightboard

Free, simple video spaces for everyone — friends, family, teams, classes and events (English + العربية). Hangouts, meetings, classes and events, with chat, screen share, reactions and host controls.

## Run it locally (Windows/Mac)

Open three terminals in this folder:

```bash
npm install
npm run dev:livekit   # video server (downloads LiveKit the first time)
npm run dev:server    # class server on http://localhost:4000
npm run dev:desktop   # opens the app
```

1. Create an account (or use a demo account below) and finish the short setup.
2. Click **Start now** for an instant space, or **New space** to pick Hangout / Meeting / Class / Event.
3. Click **Invite** and share the link. People can join with an account or as a guest; a password is optional.

## Whiteboard

The admin opens it from the dock; it takes the stage for everyone. Text, pictures (paste/drag/upload), shapes,
**mind maps** (Mind map button, then Tab = branch, Enter = sibling, Delete = remove), export to PNG, and a
**Smart pen** for mouse users: rough circles/boxes/lines/arrows/triangles snap to clean shapes (Ctrl+Z restores the
stroke), other strokes are smoothed, and optional handwriting → text (local OCR, best with neat print).
The admin can lock it so only they draw. Late joiners get the full board.

## Recording and transcript (admin)

- **Recording** saves what the admin sees plus everyone's voices to . When a session starts the
  app asks "Record this session?" (and reminds once after 5 minutes). Everyone sees a REC indicator.
- **Transcript** turns speech into text on the admin's computer (Whisper, Arabic + English; the model downloads once,
  ~80 MB or ~250 MB for high accuracy). Choose *Only me* or *Everyone* (everyone then sees a notice). Saved as a
   in  when stopped or when the admin leaves.

## Remote control (Parsec-style)

When a guest shares their **whole screen**, the host sees **Request control** on it. If the guest clicks **Allow**,
the host's mouse and keyboard over that screen drive the guest's computer. The guest always sees a red
"being controlled" bar with **Stop**, and **Ctrl+Alt+Q** stops it instantly (the host can never send that shortcut).
Control also ends when the share stops, either person leaves, or after 60 seconds without input.
On macOS the guest must allow Brightboard under Privacy & Security → Accessibility.

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

- Demo accounts (run `npm run seed -w @classroom/server`): `huda@brightboard.test` / `demo1234` (hosts 3 spaces) and `omar@brightboard.test` / `demo1234`.
- Invite links look like `http://<server>/j/K7P-2QX` and open the app via `brightboard://join/K7P2QX`. Set `DOWNLOAD_URL` on the server for the "Download" button.
- App icon source: `apps/desktop/build/icon.svg` (regenerate PNG/ICO with `node apps/desktop/build/make-icons.mjs`).
- Design spec: `docs/superpowers/specs/2026-10-04-classroom-meetings-design.md`
- Current design: `docs/superpowers/specs/2026-10-06-everyone-spaces-design.md`
