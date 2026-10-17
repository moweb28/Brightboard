import { contextBridge, ipcRenderer } from 'electron';

export interface ScreenSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
  icon: string | null;
}

export type RemoteGrantResult = { ok: true } | { ok: false; reason: 'notScreen' | 'permission' | 'unavailable' };
export type RemoteEndReason = 'local' | 'remote' | 'idle' | 'shareEnded';

export interface BrightboardBridge {
  /** Class code from the link that launched the app, if any (returned once). */
  takePendingJoin(): Promise<string | null>;
  /** Called when a brightboard:// link is opened while the app is running. */
  onJoinLink(callback: (code: string) => void): () => void;
  /** Screens and windows that can be shared, with thumbnails. */
  getScreenSources(): Promise<ScreenSource[]>;
  /** Chooses what the next screen-share request will capture. */
  selectScreenSource(id: string): Promise<void>;
  /** Tells the app this computer stopped sharing its screen. */
  screenShareStopped(): void;
  /** Puts text on the clipboard (works even when the window isn't focused). */
  copyText(text: string): Promise<void>;
  store: {
    load(): Promise<unknown>;
    save(data: unknown): Promise<void>;
    /** Saves a backup file where the user picks; false if they cancelled. */
    backup(data: unknown, title: string): Promise<boolean>;
    /** Reads a backup file the user picks: the data, 'invalid', or null if cancelled. */
    restore(title: string): Promise<unknown>;
  };
  files: {
    /** Media source id of this app window, for recording what the user sees. */
    windowSource(): Promise<string | null>;
    startRecording(title: string): Promise<{ id: number; path: string }>;
    writeRecording(id: number, chunk: ArrayBuffer): void;
    stopRecording(id: number): Promise<string | null>;
    saveTranscript(title: string, startedAt: number, text: string): Promise<string>;
    reveal(path: string): Promise<void>;
  };
  remote: {
    /** Let `controller` drive this computer (shows the red "being controlled" bar). */
    grant(args: { controller: string; text: string; stopLabel: string; rtl: boolean }): Promise<RemoteGrantResult>;
    /** Forward one input event; the main process checks it came from the granted controller. */
    input(from: string, event: unknown): void;
    stop(remote: boolean): Promise<void>;
    onEnded(callback: (reason: RemoteEndReason) => void): () => void;
  };
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
  screenShareStopped: () => ipcRenderer.send('screen:stopped'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (data) => ipcRenderer.invoke('store:save', data),
    backup: (data, title) => ipcRenderer.invoke('store:backup', data, title),
    restore: (title) => ipcRenderer.invoke('store:restore', title),
  },
  files: {
    windowSource: () => ipcRenderer.invoke('rec:windowSource'),
    startRecording: (title) => ipcRenderer.invoke('rec:start', title),
    writeRecording: (id, chunk) => ipcRenderer.send('rec:chunk', id, chunk),
    stopRecording: (id) => ipcRenderer.invoke('rec:stop', id),
    saveTranscript: (title, startedAt, text) => ipcRenderer.invoke('transcript:save', title, startedAt, text),
    reveal: (path) => ipcRenderer.invoke('file:reveal', path),
  },
  remote: {
    grant: (args) => ipcRenderer.invoke('remote:grant', args),
    input: (from, event) => ipcRenderer.send('remote:input', from, event),
    stop: (remote) => ipcRenderer.invoke('remote:stop', remote),
    onEnded: (callback) => {
      const listener = (_e: unknown, reason: RemoteEndReason) => callback(reason);
      ipcRenderer.on('remote:ended', listener);
      return () => ipcRenderer.removeListener('remote:ended', listener);
    },
  },
};

contextBridge.exposeInMainWorld('brightboard', bridge);
