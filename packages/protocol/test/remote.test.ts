import { describe, expect, it } from 'vitest';
import { codeToNutKey, IDLE_TIMEOUT_MS, isStopCombo, mapToDisplay, RemoteGate, sanitizeInput } from '../src/remote';

describe('RemoteGate', () => {
  it('accepts input only from the granted controller while active', () => {
    const gate = new RemoteGate();
    expect(gate.accept('h-1', 0)).toBe(false);
    gate.grant('h-1', 0);
    expect(gate.accept('h-1', 10)).toBe(true);
    expect(gate.accept('u-9', 20)).toBe(false);
    gate.revoke();
    expect(gate.accept('h-1', 30)).toBe(false);
    expect(gate.active).toBe(false);
  });

  it('expires after the idle timeout and refuses late input', () => {
    const gate = new RemoteGate();
    gate.grant('h-1', 1000);
    expect(gate.accept('h-1', 1000 + IDLE_TIMEOUT_MS - 1)).toBe(true);
    // Activity resets the idle clock.
    expect(gate.expired(1000 + IDLE_TIMEOUT_MS + 10)).toBe(false);
    expect(gate.expired(1000 + 2 * IDLE_TIMEOUT_MS)).toBe(true);
    expect(gate.accept('h-1', 1000 + 2 * IDLE_TIMEOUT_MS)).toBe(false);
    expect(gate.active).toBe(false);
  });

  it('a new grant replaces the old controller', () => {
    const gate = new RemoteGate();
    gate.grant('h-1', 0);
    gate.grant('h-2', 5);
    expect(gate.accept('h-1', 6)).toBe(false);
    expect(gate.accept('h-2', 6)).toBe(true);
    expect(gate.controller).toBe('h-2');
  });
});

describe('sanitizeInput', () => {
  it('accepts well-formed events', () => {
    expect(sanitizeInput({ k: 'move', x: 0.5, y: 0.25 })).toEqual({ k: 'move', x: 0.5, y: 0.25 });
    expect(sanitizeInput({ k: 'down', b: 'left', x: 0, y: 1 })).toEqual({ k: 'down', b: 'left', x: 0, y: 1 });
    expect(sanitizeInput({ k: 'wheel', dx: 0, dy: -3 })).toEqual({ k: 'wheel', dx: 0, dy: -3 });
    expect(sanitizeInput({ k: 'keydown', code: 'KeyA' })).toEqual({ k: 'keydown', code: 'KeyA' });
  });

  it('rejects out-of-range coordinates, unknown kinds, buttons and keys', () => {
    expect(sanitizeInput({ k: 'move', x: 1.5, y: 0 })).toBeNull();
    expect(sanitizeInput({ k: 'move', x: Number.NaN, y: 0 })).toBeNull();
    expect(sanitizeInput({ k: 'down', b: 'back', x: 0, y: 0 })).toBeNull();
    expect(sanitizeInput({ k: 'exec', cmd: 'rm -rf' })).toBeNull();
    expect(sanitizeInput({ k: 'keydown', code: 'NotAKey' })).toBeNull();
    expect(sanitizeInput(null)).toBeNull();
    expect(sanitizeInput('move')).toBeNull();
  });

  it('clamps wheel deltas', () => {
    expect(sanitizeInput({ k: 'wheel', dx: 0, dy: 9999 })).toEqual({ k: 'wheel', dx: 0, dy: 20 });
  });
});

describe('mapToDisplay', () => {
  const bounds = { x: 1920, y: 0, width: 1280, height: 720 };
  it('maps normalized points into the shared display', () => {
    expect(mapToDisplay(0, 0, bounds)).toEqual({ x: 1920, y: 0 });
    expect(mapToDisplay(0.5, 0.5, bounds)).toEqual({ x: 2560, y: 360 });
  });
  it('keeps the far edge inside the display', () => {
    expect(mapToDisplay(1, 1, bounds)).toEqual({ x: 3199, y: 719 });
  });
  it('applies a scale factor for physical-pixel drivers', () => {
    expect(mapToDisplay(0.5, 0.5, { x: 0, y: 0, width: 1536, height: 864 }, 1.25)).toEqual({ x: 960, y: 540 });
  });
});

describe('keys', () => {
  it('maps browser key codes to nut.js key names', () => {
    expect(codeToNutKey('KeyA')).toBe('A');
    expect(codeToNutKey('Digit7')).toBe('Num7');
    expect(codeToNutKey('Enter')).toBe('Enter');
    expect(codeToNutKey('ArrowLeft')).toBe('Left');
    expect(codeToNutKey('ShiftLeft')).toBe('LeftShift');
    expect(codeToNutKey('ControlRight')).toBe('RightControl');
    expect(codeToNutKey('MetaLeft')).toBe('LeftSuper');
    expect(codeToNutKey('F5')).toBe('F5');
    expect(codeToNutKey('Numpad3')).toBe('NumPad3');
    expect(codeToNutKey('Whatever')).toBeNull();
  });

  it('recognizes the stop shortcut Ctrl+Alt+Q so it is never injected', () => {
    expect(isStopCombo('KeyQ', new Set(['ControlLeft', 'AltLeft']))).toBe(true);
    expect(isStopCombo('KeyQ', new Set(['ControlRight', 'AltRight']))).toBe(true);
    expect(isStopCombo('KeyQ', new Set(['ControlLeft']))).toBe(false);
    expect(isStopCombo('KeyW', new Set(['ControlLeft', 'AltLeft']))).toBe(false);
  });
});
