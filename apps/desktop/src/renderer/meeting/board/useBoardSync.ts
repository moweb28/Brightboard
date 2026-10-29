import { BOARD_TOPIC, isBoardDesign, VersionTracker, type BoardDesign, type BoardPacket } from '@classroom/protocol';
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { loadExcalidraw } from '../../lib/excalidraw';
import { RoomEvent, type Participant, type Room } from '../../lib/rtc';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { isHost, isWaiting } from '../participants';

type Elements = ReturnType<ExcalidrawImperativeAPI['getSceneElementsIncludingDeleted']>;
const FLUSH_MS = 80;

/** Board contents for the whole call, kept here so closing/reopening the board loses nothing. */
export interface BoardStore {
  elements: Elements;
  files: BinaryFiles;
  /** The look the admin picked; everyone sees the same one. */
  design: BoardDesign;
}

export interface BoardSync {
  store: React.MutableRefObject<BoardStore>;
  /** The Board component registers its Excalidraw API while it's on screen. */
  attach(api: ExcalidrawImperativeAPI | null): void;
  /** Call from Excalidraw's onChange. */
  onLocalChange(elements: Elements, files: BinaryFiles): void;
  /** Admin only: changes the board look for everyone. */
  setDesign(design: BoardDesign): void;
  /** Called whenever the look changes (from the admin, or arriving from them). Returns an unsubscribe. */
  onDesign(listener: (design: BoardDesign) => void): () => void;
}

export function useBoardSync(room: Room, amHost: boolean, initialDesign: BoardDesign = 'auto'): BoardSync {
  const store = useRef<BoardStore>({ elements: [], files: {}, design: amHost ? initialDesign : 'auto' });
  const designListeners = useRef(new Set<(d: BoardDesign) => void>());
  const applyDesign = useCallback((d: BoardDesign) => {
    if (store.current.design === d) return;
    store.current = { ...store.current, design: d };
    for (const fn of designListeners.current) fn(d);
  }, []);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const tracker = useRef(new VersionTracker());
  const sentFiles = useRef(new Set<string>());
  const pending = useRef(new Map<string, Elements[number]>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(
    (packet: BoardPacket, to?: string[]) =>
      room.localParticipant.sendText(JSON.stringify(packet), { topic: BOARD_TOPIC, destinationIdentities: to }).catch((e) => console.warn('board send failed', e)),
    [room],
  );

  const flush = useCallback(() => {
    timer.current = null;
    const elements = [...pending.current.values()];
    pending.current.clear();
    if (elements.length) void send({ type: 'update', elements });
  }, [send]);

  const sendFiles = useCallback(
    (files: BinaryFiles, to?: string[]) => {
      for (const file of Object.values(files)) {
        if (!to && sentFiles.current.has(file.id)) continue;
        if (!to) sentFiles.current.add(file.id);
        void send({ type: 'file', file: { id: file.id, mimeType: file.mimeType, dataURL: file.dataURL, created: file.created } }, to);
      }
    },
    [send],
  );

  // Packets are applied in the order they arrive: they all wait on the same (already loaded) engine.
  const applyRemote = useCallback(async (remote: unknown[]) => {
    const { CaptureUpdateAction, reconcileElements, restoreElements } = await loadExcalidraw();
    const incoming = restoreElements(remote as Elements, null);
    tracker.current.mark(incoming);
    const local = api.current?.getSceneElementsIncludingDeleted() ?? store.current.elements;
    const appState = api.current?.getAppState();
    const merged = reconcileElements(local, incoming as never, appState as never) as unknown as Elements;
    store.current.elements = merged;
    api.current?.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
  }, []);

  // Incoming board traffic.
  useEffect(() => {
    room.registerTextStreamHandler(BOARD_TOPIC, async (reader, from) => {
      let packet: BoardPacket;
      try {
        packet = JSON.parse(await reader.readAll());
      } catch {
        return;
      }
      if (packet.type === 'update' || packet.type === 'scene') applyRemote(packet.elements);
      // Only the admin decides how the board looks.
      if (packet.type === 'design' && isBoardDesign(packet.design)) {
        const sender = room.remoteParticipants.get(from.identity);
        if (sender && isHost(sender)) applyDesign(packet.design);
      }
      if (packet.type === 'file' && packet.file?.dataURL?.startsWith('data:image/')) {
        const file = packet.file as unknown as BinaryFileData;
        sentFiles.current.add(file.id);
        store.current.files = { ...store.current.files, [file.id]: file };
        api.current?.addFiles([file]);
      }
    });
    return () => room.unregisterTextStreamHandler(BOARD_TOPIC);
  }, [room, applyRemote, applyDesign]);

  // The admin's app hands the whole board to anyone who arrives late; guests hand it back to an
  // admin who rejoins (e.g. after restarting the app), so the board survives either side leaving.
  useEffect(() => {
    const sendAll = (p: Participant) => {
      if (isWaiting(p)) return;
      if (!amHost && !isHost(p)) return;
      setTimeout(() => {
        if (amHost && store.current.design !== 'auto') void send({ type: 'design', design: store.current.design }, [p.identity]);
        const elements = api.current?.getSceneElementsIncludingDeleted() ?? store.current.elements;
        if (!elements.length) return;
        void send({ type: 'scene', elements: [...elements] }, [p.identity]);
        sendFiles(api.current?.getFiles() ?? store.current.files, [p.identity]);
      }, 1200);
    };
    const onMeta = (prev: string | undefined, p: Participant) => {
      try {
        if (JSON.parse(prev || '{}').waiting && !isWaiting(p)) sendAll(p);
      } catch {
        /* ignore */
      }
    };
    room.on(RoomEvent.ParticipantConnected, sendAll);
    room.on(RoomEvent.ParticipantMetadataChanged, onMeta);
    return () => {
      room.off(RoomEvent.ParticipantConnected, sendAll);
      room.off(RoomEvent.ParticipantMetadataChanged, onMeta);
    };
  }, [room, amHost, send, sendFiles]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // One stable object for the whole call: the Board's effects depend on it.
  return useMemo<BoardSync>(() => ({
    store,
    setDesign(design) {
      if (!amHost) return;
      applyDesign(design);
      void send({ type: 'design', design });
    },
    onDesign(listener) {
      designListeners.current.add(listener);
      return () => void designListeners.current.delete(listener);
    },
    attach(next) {
      api.current = next;
      if (!next) return;
      // Anything that arrived while the board was still loading goes in now (after Excalidraw's own init).
      // Snapshot it first: Excalidraw's first (empty) onChange may replace the store before the timeout runs.
      const early = { elements: store.current.elements, files: store.current.files };
      setTimeout(async () => {
        const { CaptureUpdateAction, reconcileElements } = await loadExcalidraw();
        if (api.current !== next) return;
        if (early.elements.length) {
          const merged = reconcileElements(next.getSceneElementsIncludingDeleted(), early.elements as never, next.getAppState() as never) as unknown as Elements;
          next.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
        }
        const files = Object.values(early.files);
        if (files.length) next.addFiles(files);
      }, 0);
    },
    onLocalChange(elements, files) {
      // Until the board is ready its (empty) scene must not overwrite what arrived from others.
      if (!api.current) return;
      store.current = { ...store.current, elements, files };
      const changed = tracker.current.unsent(elements);
      if (changed.length) {
        tracker.current.mark(changed);
        for (const e of changed) pending.current.set(e.id, e);
        timer.current ??= setTimeout(flush, FLUSH_MS);
      }
      sendFiles(files);
    },
  }), [flush, sendFiles, amHost, applyDesign, send]);
}
