# Brightboard

Free, simple video spaces for everyone (friends, family, teams, classes and events), in English and العربية. Chat, screen share, whiteboard, reactions, recording, transcripts and host controls.

**Local-first:** your profile, spaces, pictures, history and recordings stay on your own computer. Only the live call travels over the internet, through a tiny Cloudflare service that stores nothing. No accounts, no emails.

## Download

Get the latest **Brightboard-Setup.exe** from the [Releases page](../../releases/latest) (Windows 10/11).
The installer isn't code-signed (certificates cost money), so Windows may say *"Windows protected your PC"*: click **More info → Run anyway**.

## Use it

1. Pick a name, picture and color on first launch.
2. **Start now** for an instant space, or **New space** to pick Hangout / Meeting / Class / Event, with an optional schedule and password.
3. Click **Invite** and share the link or code. People with the app join in one click; others get a download page.

## Layout

The **Layout** button in the dock picks the main view (everyone the same size, or whoever is talking big) and where
the other videos go next to a board, screen or speaker: on the side, at the bottom, or hidden with a small
"… talking" label. It's just for you.

## Whiteboard

The admin opens it from the dock; it takes the stage for everyone. Text, pictures (paste/drag/upload), shapes,
**mind maps** (Mind map button, then Tab = branch, Enter = sibling, Delete = remove), export to PNG, and a
**Smart pen** for mouse users: rough circles/boxes/lines/arrows/triangles snap to clean shapes (Ctrl+Z restores the
stroke), other strokes are smoothed, and optional handwriting → text (local OCR, best with neat print).
Picking the board's **pen** shows a pen bar (pen, marker, highlighter, chalk, colors, thickness, *Clean shapes*,
*Writing → text*); picking **text** shows fonts, sizes and colors. **Full screen** gives the board the whole screen.
**Writing → text** reads letters and words drawn with the mouse (English, or Arabic + English) and types them.
**Pens & text**: pen, marker, highlighter and chalk, with colors and thickness; seven fonts (hand-drawn, normal,
headline, playful, clean, sketchy, code) up to 3XL. The admin picks the **board look** for everyone: whiteboard,
blackboard, chalkboard, paper, grid paper or blueprint (dark boards switch to light ink).
**Shapes** adds ready-made geometry in the middle of the board, sized in units: square, rectangle, parallelogram,
trapezoid, rhombus, pentagon, hexagon, circle, and equilateral, isosceles, right, scalene and obtuse triangles.
Corners of triangles, rhombi and polygons show a curved angle arc with its degrees (a small square for 90°), and
circles show their diameter inside. A selected shape shows its area and perimeter just below it, and the Measure
panel works them out step by step (for example A = w × h = 6 × 4 = 24 cm²).
**Sizes on shapes** writes lengths right on the edges of boxes, circles, lines and triangles, live, grid or not
(turn it off in More or the Measure panel). New shapes use clean single lines. **Measure** (ruler button) opens a side panel with the selected shape's sizes in cm, m, inches or grid squares:
sides, width and height, radius and diameter, line length, perimeter, area and a triangle's angles. Type a width,
side, radius or length to resize the shape exactly. **Grid** (in the panel or More) shows squares of one unit.
**Snip** grabs part of your screen (another app, a website, a PDF) and drops it on the board: Brightboard steps
aside, you drag a rectangle, and the picture appears for everyone (Esc or right-click cancels).
The admin can lock it so only they draw. Late joiners get the full board.

## Recording and transcript (admin)

- **Recording** saves what the admin sees plus everyone's voices to `Videos/Brightboard`. When a session starts the
  app asks "Record this session?" (and reminds once after 5 minutes). Everyone sees a REC indicator.
- **Transcript** turns speech into text on the admin's computer (Whisper, Arabic + English; the model downloads once,
  ~80 MB or ~250 MB for high accuracy). Choose *Only me* or *Everyone* (everyone then sees a notice). Saved as a
  `.txt` in `Documents/Brightboard` when stopped or when the admin leaves.

## Remote control (Parsec-style)

When a guest shares their **whole screen**, the host sees **Request control** on it. If the guest clicks **Allow**,
the host's mouse and keyboard over that screen drive the guest's computer. The guest always sees a red
"being controlled" bar with **Stop**, and **Ctrl+Alt+Q** stops it instantly (the host can never send that shortcut).
Control also ends when the share stops, either person leaves, or after 60 seconds without input.
On macOS the guest must allow Brightboard under Privacy & Security → Accessibility.

## Run it from source

```bash
npm install
npm run dev:relay     # local call service on http://127.0.0.1:8787 (needs apps/relay/.dev.vars)
npm run dev:desktop   # opens the app
```

`apps/relay/.dev.vars` holds `TICKET_SECRET`, `SFU_APP_ID` and `SFU_APP_TOKEN` (Cloudflare Realtime). Without real Realtime keys, everything except video and sound still works locally.

## Build the Windows installer

```bash
npm run build:win     # → apps/desktop/dist/Brightboard-Setup-<version>.exe
```

It uses `VITE_RELAY_URL` from `apps/desktop/.env.production`. Deploying the call service: [apps/relay/DEPLOY.md](apps/relay/DEPLOY.md).

## Tests

```bash
npm test
```

## Development notes

- Invite links look like `https://<relay>/j/K7P-2QX` and open the app via `brightboard://join/K7P2QX`. Set `DOWNLOAD_URL` in `apps/relay/wrangler.jsonc` for the "Download" button.
- App icon source: `apps/desktop/build/icon.svg` (regenerate PNG/ICO with `node apps/desktop/build/make-icons.mjs`).
- Current design: `docs/superpowers/specs/2026-10-10-local-first-cloudflare.md`
