/**
 * The whiteboard engine is the biggest part of the app, so it loads the first time it's needed
 * (or quietly in the background once a call starts), not before the first screen shows.
 */
let engine: Promise<typeof import('@excalidraw/excalidraw')> | null = null;
export const loadExcalidraw = () => (engine ??= import('@excalidraw/excalidraw'));
