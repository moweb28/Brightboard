import { convertToExcalidrawElements, Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { Download, GitBranch, Loader2, Lock, LockOpen, Scissors, Sparkles, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from '../../components/ui';
import { useSettings, useT } from '../../lib/settings';
import { addIdea, insertMindMap, removeIdea, selectedNode } from './mindmapOps';
import { SmartPen } from './smartPen';
import type { BoardSync } from './useBoardSync';

// Fonts are bundled with the app (see build/copy-board-assets.mjs) so the board works offline.
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL('./excalidraw-assets/', document.baseURI).href;

interface Props {
  sync: BoardSync;
  title: string;
  amHost: boolean;
  locked: boolean;
  onClose(): void;
  onToggleLock(): void;
}

export function Board({ sync, title, amHost, locked, onClose, onToggleLock }: Props) {
  const t = useT();
  const { settings, set, resolvedTheme } = useSettings();
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const [reading, setReading] = useState(false);
  const viewOnly = locked && !amHost;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const pen = useMemo(
    () => new SmartPen(() => api.current, () => ({ shapes: settingsRef.current.boardShapes, handwriting: settingsRef.current.boardHandwriting, onReading: setReading })),
    [],
  );
  // Start from whatever was drawn earlier in this call.
  const initialData = useMemo(() => ({ elements: sync.store.current.elements, files: sync.store.current.files, scrollToContent: true }), [sync]);

  useEffect(
    () => () => {
      sync.attach(null);
      pen.attach(null);
    },
    [sync, pen],
  );

  const exportPng = async () => {
    const a = api.current;
    if (!a) return;
    const blob = await exportToBlob({ elements: a.getSceneElements(), appState: { ...a.getAppState(), exportBackground: true }, files: a.getFiles(), mimeType: 'image/png' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title || 'Whiteboard'}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  };

  // Snipping tool: grab part of the screen (another app, a website, a PDF) and drop it on the board.
  const [snipping, setSnipping] = useState(false);
  const snip = async () => {
    const a = api.current;
    const bridge = window.brightboard;
    if (!a || !bridge || snipping) return;
    setSnipping(true);
    try {
      const shot = await bridge.snip(t.board.snipHint, settings.lang === 'ar');
      if (!shot || !api.current) return;
      const b = api.current;
      const fileId = crypto.randomUUID() as BinaryFileData['id'];
      b.addFiles([{ id: fileId, dataURL: shot.dataURL as BinaryFileData['dataURL'], mimeType: shot.mimeType, created: Date.now() }]);
      // Centered in view, shrunk if it wouldn't fit in most of the visible board.
      const st = b.getAppState();
      const viewW = st.width / st.zoom.value;
      const viewH = st.height / st.zoom.value;
      const scale = Math.min(1, (viewW * 0.8) / shot.width, (viewH * 0.8) / shot.height);
      const width = shot.width * scale;
      const height = shot.height * scale;
      const [image] = convertToExcalidrawElements([{ type: 'image', fileId, status: 'saved', x: -st.scrollX + viewW / 2 - width / 2, y: -st.scrollY + viewH / 2 - height / 2, width, height }]);
      b.updateScene({ elements: [...b.getSceneElementsIncludingDeleted(), image], appState: { selectedElementIds: { [image.id]: true } } as never });
    } finally {
      setSnipping(false);
    }
  };

  // Mind-map keys work while a mind-map box is selected (and you're not typing in it).
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const a = api.current;
    if (!a || viewOnly || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return;
    const node = selectedNode(a);
    if (!node) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Tab') addIdea(a, node, 'child', t.board.newIdea);
    else if (e.key === 'Enter') addIdea(a, node, 'sibling', t.board.newIdea);
    else removeIdea(a, node);
  };

  return (
    <div className={`board ${viewOnly ? 'is-view-only' : ''}`} onKeyDownCapture={onKeyDownCapture}>
      <Excalidraw
        excalidrawAPI={(a) => {
          api.current = a;
          sync.attach(a);
          pen.attach(a);
          if (import.meta.env.DEV) (window as unknown as { __board?: ExcalidrawImperativeAPI }).__board = a; // test hook, dev builds only
        }}
        initialData={initialData}
        theme={resolvedTheme}
        langCode={settings.lang === 'ar' ? 'ar-SA' : 'en'}
        viewModeEnabled={viewOnly}
        name={title}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false, changeViewBackgroundColor: true } }}
        onChange={(elements, _appState, files) => {
          sync.onLocalChange(elements as never, files);
        }}
        renderTopRightUI={() => (
          <div className="board-actions">
            {reading && (
              <span className="board-pill">
                <Loader2 size={14} className="spin" /> {t.board.reading}
              </span>
            )}
            {!viewOnly && window.brightboard && (
              <button className={`board-btn ${snipping ? 'is-active' : ''}`} onClick={() => void snip()} title={t.board.snipTitle}>
                <Scissors size={16} /> <span className="board-btn-label">{t.board.snip}</span>
              </button>
            )}
            {!viewOnly && (
              <button className="board-btn" onClick={() => api.current && insertMindMap(api.current, t.board.rootText)} title={t.board.mindHint}>
                <GitBranch size={16} /> <span className="board-btn-label">{t.board.mindMap}</span>
              </button>
            )}
            {!viewOnly && (
              <Menu
                trigger={(open, isOpen) => (
                  <button className={`board-btn ${isOpen ? 'is-active' : ''}`} onClick={open} title={t.board.smartPen}>
                    <Wand2 size={16} /> <span className="board-btn-label">{t.board.smartPen}</span>
                  </button>
                )}
                items={[
                  { icon: Sparkles, label: `${settings.boardShapes ? '✓ ' : ''}${t.board.smartShapes}`, onClick: () => set('boardShapes', !settings.boardShapes) },
                  { icon: Wand2, label: `${settings.boardHandwriting ? '✓ ' : ''}${t.board.handwriting} · ${t.board.handwritingHint}`, onClick: () => set('boardHandwriting', !settings.boardHandwriting) },
                ]}
              />
            )}
            <button className="board-btn" onClick={exportPng} title={t.board.exportPng}>
              <Download size={16} />
            </button>
            {amHost && (
              <button className={`board-btn ${locked ? 'is-active' : ''}`} onClick={onToggleLock} title={locked ? t.board.unlock : t.board.lock}>
                {locked ? <Lock size={16} /> : <LockOpen size={16} />}
              </button>
            )}
            {amHost && (
              <button className="board-btn" onClick={onClose} title={t.board.close}>
                <X size={16} />
              </button>
            )}
          </div>
        )}
      />
      {viewOnly && <div className="board-note">{t.board.lockedNote}</div>}
    </div>
  );
}
