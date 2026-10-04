/// <reference types="vite/client" />
/// <reference types="electron-vite/node" />
import type { BrightboardBridge } from '../preload';

declare global {
  interface Window {
    /** Present when running inside the Electron app (absent in a plain browser). */
    brightboard?: BrightboardBridge;
  }
}
