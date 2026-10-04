import { contextBridge, ipcRenderer } from 'electron';

export interface ScreenSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
  icon: string | null;
}

export interface BrightboardBridge {
  /** Class code from the link that launched the app, if any (returned once). */
  takePendingJoin(): Promise<string | null>;
  /** Called when a brightboard:// link is opened while the app is running. */
  onJoinLink(callback: (code: string) => void): () => void;
  /** Screens and windows that can be shared, with thumbnails. */
  getScreenSources(): Promise<ScreenSource[]>;
  /** Chooses what the next screen-share request will capture. */
  selectScreenSource(id: string): Promise<void>;
}

const bridge: BrightboardBridge = {
  takePendingJoin: () => ipcRenderer.invoke('take-pending-join'),
  onJoinLink: (callback) => {
    const listener = (_e: unknown, code: string) => callback(code);
    ipcRenderer.on('join-link', listener);
    return () => ipcRenderer.removeListener('join-link', listener);
  },
  getScreenSources: () => ipcRenderer.invoke('screen:sources'),
  selectScreenSource: (id) => ipcRenderer.invoke('screen:select', id),
};

contextBridge.exposeInMainWorld('brightboard', bridge);
