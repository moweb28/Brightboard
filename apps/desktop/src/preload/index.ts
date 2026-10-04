import { contextBridge, ipcRenderer } from 'electron';

export interface BrightboardBridge {
  /** Class code from the link that launched the app, if any (returned once). */
  takePendingJoin(): Promise<string | null>;
  /** Called when a brightboard:// link is opened while the app is running. */
  onJoinLink(callback: (code: string) => void): () => void;
}

const bridge: BrightboardBridge = {
  takePendingJoin: () => ipcRenderer.invoke('take-pending-join'),
  onJoinLink: (callback) => {
    const listener = (_e: unknown, code: string) => callback(code);
    ipcRenderer.on('join-link', listener);
    return () => ipcRenderer.removeListener('join-link', listener);
  },
};

contextBridge.exposeInMainWorld('brightboard', bridge);
