/**
 * Remote control (Parsec-style): the host drives a guest's shared screen with the guest's consent.
 * Packets travel over the LiveKit data channel on REMOTE_TOPIC, addressed to one participant.
 * The sender identity always comes from LiveKit, never from the packet.
 */
export const REMOTE_TOPIC = 'remote';
export const IDLE_TIMEOUT_MS = 60_000;

export type MouseButtonName = 'left' | 'right' | 'middle';

export type RemoteInput =
  | { k: 'move'; x: number; y: number }
  | { k: 'down' | 'up'; b: MouseButtonName; x: number; y: number }
  | { k: 'wheel'; dx: number; dy: number }
  | { k: 'keydown' | 'keyup'; code: string };

export type RemotePacket =
  | { type: 'request' } // host -> guest: may I control?
  | { type: 'grant' } // guest -> host: yes
  | { type: 'deny' } // guest -> host: no
  | { type: 'end' } // either side: stop now
  | { type: 'input'; e: RemoteInput }; // host -> guest

/** Tracks who may control this computer right now. Pure, so the rules are unit-tested. */
export class RemoteGate {
  controller: string | null = null;
  private lastActivity = 0;

  get active() {
    return this.controller !== null;
  }

  grant(controller: string, now: number) {
    this.controller = controller;
    this.lastActivity = now;
  }

  revoke() {
    this.controller = null;
  }

  /** True once the session has gone quiet for too long (and ends it). */
  expired(now: number) {
    if (this.active && now - this.lastActivity > IDLE_TIMEOUT_MS) this.revoke();
    return !this.active;
  }

  /** Whether input from `from` may be injected. */
  accept(from: string, now: number) {
    if (!this.active || this.expired(now) || from !== this.controller) return false;
    this.lastActivity = now;
    return true;
  }
}

const unit = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const BUTTONS: readonly string[] = ['left', 'right', 'middle'];
const clampWheel = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(-20, Math.min(20, Math.round(n))) : 0);

/** Returns a clean copy of an input event, or null if anything about it is off. */
export function sanitizeInput(raw: unknown): RemoteInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  switch (e.k) {
    case 'move':
      return unit(e.x) && unit(e.y) ? { k: 'move', x: e.x, y: e.y } : null;
    case 'down':
    case 'up':
      return unit(e.x) && unit(e.y) && typeof e.b === 'string' && BUTTONS.includes(e.b) ? { k: e.k, b: e.b as MouseButtonName, x: e.x, y: e.y } : null;
    case 'wheel':
      return { k: 'wheel', dx: clampWheel(e.dx), dy: clampWheel(e.dy) };
    case 'keydown':
    case 'keyup':
      return typeof e.code === 'string' && codeToNutKey(e.code) ? { k: e.k, code: e.code } : null;
    default:
      return null;
  }
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Normalized (0–1) point on the shared screen -> absolute desktop pixel. `scale` converts to the driver's pixel space. */
export function mapToDisplay(nx: number, ny: number, b: Bounds, scale = 1) {
  const x = b.x + Math.min(Math.floor(nx * b.width), b.width - 1);
  const y = b.y + Math.min(Math.floor(ny * b.height), b.height - 1);
  return { x: Math.round(x * scale), y: Math.round(y * scale) };
}

const NAMED: Record<string, string> = {
  Escape: 'Escape', Backquote: 'Grave', Minus: 'Minus', Equal: 'Equal', Backspace: 'Backspace', Tab: 'Tab',
  BracketLeft: 'LeftBracket', BracketRight: 'RightBracket', Backslash: 'Backslash', CapsLock: 'CapsLock',
  Semicolon: 'Semicolon', Quote: 'Quote', Enter: 'Enter', Comma: 'Comma', Period: 'Period', Slash: 'Slash', Space: 'Space',
  ShiftLeft: 'LeftShift', ShiftRight: 'RightShift', ControlLeft: 'LeftControl', ControlRight: 'RightControl',
  AltLeft: 'LeftAlt', AltRight: 'RightAlt', MetaLeft: 'LeftSuper', MetaRight: 'RightSuper', ContextMenu: 'Menu',
  Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  PrintScreen: 'Print', ScrollLock: 'ScrollLock', Pause: 'Pause', NumLock: 'NumLock',
  NumpadDivide: 'Divide', NumpadMultiply: 'Multiply', NumpadSubtract: 'Subtract', NumpadAdd: 'Add', NumpadEnter: 'Enter', NumpadDecimal: 'Decimal',
};

/** KeyboardEvent.code (physical key) -> nut.js Key name, or null if we don't forward that key. */
export function codeToNutKey(code: string): string | null {
  if (NAMED[code]) return NAMED[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit([0-9])$/.exec(code);
  if (m) return `Num${m[1]}`;
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return `NumPad${m[1]}`;
  m = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
  if (m) return `F${m[1]}`;
  return null;
}

/** Ctrl+Alt+Q always stops remote control on the guest's computer, so it is never forwarded. */
export function isStopCombo(code: string, held: ReadonlySet<string>) {
  const ctrl = held.has('ControlLeft') || held.has('ControlRight');
  const alt = held.has('AltLeft') || held.has('AltRight');
  return code === 'KeyQ' && ctrl && alt;
}
