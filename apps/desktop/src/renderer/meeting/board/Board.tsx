import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { Download, GitBranch, Loader2, Lock, LockOpen, Sparkles, Wand2, X } from 'lucide-react';
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
            {!viewOnly && (
              <button className="board-btn" onClick={() => api.current && insertMindMap(api.current, t.board.rootText)} title={t.board.mindHint}>
                <GitBranch size={16} /> {t.board.mindMap}
              </button>
            )}
            {!viewOnly && (
              <Menu
                trigger={(open, isOpen) => (
                  <button className={`board-btn ${isOpen ? 'is-active' : ''}`} onClick={open} title={t.board.smartPen}>
                    <Wand2 size={16} /> {t.board.smartPen}
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
