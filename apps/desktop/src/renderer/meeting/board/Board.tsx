import { convertToExcalidrawElements, Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { BoardDesign } from '@classroom/protocol';
import { Loader2, Lock, LockOpen, Maximize2, Minimize2, Scissors, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings, useT } from '../../lib/settings';
import { applyDesign, MoreMenu, PenBar, TextBar } from './BoardTools';
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
    () => new SmartPen(() => api.current, () => ({ shapes: settingsRef.current.boardShapes, handwriting: settingsRef.current.boardHandwriting, lang: settingsRef.current.lang, onReading: setReading })),
    [],
  );
  // Full screen: the board alone fills the screen (Esc or the button again exits).
  const boardRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement === boardRef.current) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void boardRef.current?.requestFullscreen().catch(() => undefined);
  };

  // Picking the pen or text tool shows its style bar under the toolbar.
  const [tool, setTool] = useState('selection');
  const toolRef = useRef(tool);

  // The admin's chosen look, shared with everyone.
  const [design, setDesign] = useState<BoardDesign>(sync.store.current.design);
  useEffect(() => sync.onDesign(setDesign), [sync]);
  useEffect(() => {
    if (api.current) applyDesign(api.current, design);
  }, [design]);
  const pickDesign = (d: BoardDesign) => {
    sync.setDesign(d);
    set('boardDesign', d); // the admin's next boards start with it too
  };

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
    <div className={`board ${viewOnly ? 'is-view-only' : ''} ${design !== 'auto' ? 'has-design' : ''} tool-${tool}`} ref={boardRef} onKeyDownCapture={onKeyDownCapture}>
      <Excalidraw
        excalidrawAPI={(a) => {
          api.current = a;
          sync.attach(a);
          pen.attach(a);
          setTimeout(() => api.current === a && applyDesign(a, sync.store.current.design), 0);
          if (import.meta.env.DEV) (window as unknown as { __board?: ExcalidrawImperativeAPI }).__board = a; // test hook, dev builds only
        }}
        initialData={initialData}
        theme={resolvedTheme}
        langCode={settings.lang === 'ar' ? 'ar-SA' : 'en'}
        viewModeEnabled={viewOnly}
        name={title}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false, changeViewBackgroundColor: true } }}
        onChange={(elements, appState, files) => {
          sync.onLocalChange(elements as never, files);
          const active = appState.activeTool.type;
          if (active !== toolRef.current) {
            toolRef.current = active;
            setTool(active);
          }
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
            <button className={`board-btn ${fullscreen ? 'is-active' : ''}`} onClick={toggleFullscreen} title={fullscreen ? t.board.exitFullscreen : t.board.fullscreen} aria-label={fullscreen ? t.board.exitFullscreen : t.board.fullscreen}>
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <MoreMenu
              t={t}
              amHost={amHost}
              canDraw={!viewOnly}
              design={design}
              onDesign={pickDesign}
              onMindMap={() => api.current && insertMindMap(api.current, t.board.rootText)}
              onExport={() => void exportPng()}
            />
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
      {!viewOnly && tool === 'freedraw' && api.current && (
        <PenBar
          t={t}
          api={api.current}
          design={design}
          smart={{
            shapes: settings.boardShapes,
            handwriting: settings.boardHandwriting,
            toggleShapes: () => set('boardShapes', !settings.boardShapes),
            toggleHandwriting: () => set('boardHandwriting', !settings.boardHandwriting),
          }}
        />
      )}
      {!viewOnly && tool === 'text' && api.current && <TextBar t={t} api={api.current} design={design} />}
      {viewOnly && <div className="board-note">{t.board.lockedNote}</div>}
    </div>
  );
}
