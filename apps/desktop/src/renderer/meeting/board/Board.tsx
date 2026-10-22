import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, exportToBlob, newElementWith } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { geoShape, type BoardDesign, type GeoShape } from '@classroom/protocol';
import { Eraser, Hand, ImagePlus, Loader2, Lock, LockOpen, Maximize2, Minimize2, MousePointer2, Pen, Ruler, Scissors, Type, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings, useT } from '../../lib/settings';
import { applyDesign, inkFor, MoreMenu, PenBar, ShapesMenu, TextBar } from './BoardTools';
import { MeasurePanel } from './MeasurePanel';
import { SizeLabels } from './SizeLabels';
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

  // Measuring: a side panel with lengths, area and perimeter, kept live while it's open.
  const [measureOpen, setMeasureOpen] = useState(false);
  const measureOpenRef = useRef(false);
  measureOpenRef.current = measureOpen;
  const labelsRef = useRef(settings.measureLabels);
  labelsRef.current = settings.measureLabels;
  const [measureTick, setMeasureTick] = useState(0);
  const tickPending = useRef(false);
  const [gridOn, setGridOn] = useState(false);
  const gridRef = useRef(false);
  // One grid square is one measuring unit.
  const setGrid = (on: boolean, size = settings.measureScale) => api.current?.updateScene({ appState: { gridModeEnabled: on, gridSize: size, gridStep: 5 } as never });
  const changeScale = (px: number) => {
    set('measureScale', px);
    if (gridRef.current) setGrid(true, px);
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
  // New shapes start with clean single lines (the "sketchy" style draws every edge twice), better for geometry.
  const initialData = useMemo(
    () => ({ elements: sync.store.current.elements, files: sync.store.current.files, scrollToContent: true, appState: { currentItemRoughness: 0 } }),
    [sync],
  );

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

  // Pictures (a snip or a file) land in the middle of the view, shrunk if they wouldn't fit in most of it.
  const placeImage = (dataURL: string, mimeType: string, w: number, h: number) => {
    const b = api.current;
    if (!b) return;
    const fileId = crypto.randomUUID() as BinaryFileData['id'];
    b.addFiles([{ id: fileId, dataURL: dataURL as BinaryFileData['dataURL'], mimeType: mimeType as BinaryFileData['mimeType'], created: Date.now() }]);
    const st = b.getAppState();
    const viewW = st.width / st.zoom.value;
    const viewH = st.height / st.zoom.value;
    const scale = Math.min(1, (viewW * 0.8) / w, (viewH * 0.8) / h);
    const width = w * scale;
    const height = h * scale;
    const [image] = convertToExcalidrawElements([{ type: 'image', fileId, status: 'saved', x: -st.scrollX + viewW / 2 - width / 2, y: -st.scrollY + viewH / 2 - height / 2, width, height }]);
    b.setActiveTool({ type: 'selection' });
    b.updateScene({ elements: [...b.getSceneElementsIncludingDeleted(), image], appState: { selectedElementIds: { [image.id]: true } } as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  // Snipping tool: grab part of the screen (another app, a website, a PDF) and drop it on the board.
  const [snipping, setSnipping] = useState(false);
  const snip = async () => {
    const bridge = window.brightboard;
    if (!api.current || !bridge || snipping) return;
    setSnipping(true);
    try {
      const shot = await bridge.snip(t.board.snipHint, settings.lang === 'ar');
      if (shot) placeImage(shot.dataURL, shot.mimeType, shot.width, shot.height);
    } finally {
      setSnipping(false);
    }
  };

  // A picture from a file on this computer.
  const pictureInput = useRef<HTMLInputElement>(null);
  const addPicture = async (file: File | undefined) => {
    if (!file || !/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type) || file.size > 8_000_000) return;
    const dataURL = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const img = new Image();
    img.src = dataURL;
    await img.decode().catch(() => undefined);
    placeImage(dataURL, file.type, img.naturalWidth || 400, img.naturalHeight || 300);
  };

  // Admin only: wipes the board for everyone (as deletions, so it syncs and can be undone).
  const clearBoard = () => {
    const a = api.current;
    if (!a || !window.confirm(t.board.clearConfirm)) return;
    a.updateScene({ elements: a.getSceneElementsIncludingDeleted().map((el) => (el.isDeleted ? el : newElementWith(el, { isDeleted: true }))), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const pickTool = (type: string) => api.current?.setActiveTool({ type } as never);

  // Ready-made shapes land in the middle of the view, one unit = one grid square, clean and selected.
  const insertShape = (kind: GeoShape) => {
    const a = api.current;
    if (!a) return;
    const spec = geoShape(kind, settings.measureScale);
    const st = a.getAppState();
    const cx = -st.scrollX + st.width / 2 / st.zoom.value;
    const cy = -st.scrollY + st.height / 2 / st.zoom.value;
    const x = cx - spec.width / 2;
    const y = cy - spec.height / 2;
    const style = { strokeColor: st.currentItemOpacity < 100 ? inkFor(design) : st.currentItemStrokeColor, backgroundColor: 'transparent', strokeWidth: 2, roughness: 0, opacity: 100 };
    const [base] =
      spec.type === 'polygon'
        ? convertToExcalidrawElements([{ type: 'line', x, y, width: 1, height: 1, ...style }])
        : convertToExcalidrawElements([{ type: spec.type, x, y, width: spec.width, height: spec.height, ...style }]);
    const shape = newElementWith(base, { roundness: null, ...(spec.type === 'polygon' ? { points: spec.points, width: spec.width, height: spec.height } : {}) } as never);
    a.setActiveTool({ type: 'selection' });
    a.updateScene({ elements: [...a.getSceneElementsIncludingDeleted(), shape], appState: { selectedElementIds: { [shape.id]: true } } as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
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

  // One Brightboard bar replaces Excalidraw's toolbar (hidden in CSS); only full screen and "More" sit apart on the side.
  const toolBtn = (type: string, Icon: typeof Pen, label: string) => (
    <button className={`bar-btn ${tool === type ? 'is-active' : ''}`} onClick={() => pickTool(type)} title={label} aria-label={label} aria-pressed={tool === type}>
      <Icon size={18} />
    </button>
  );
  const measureBtn = (
    <button className={`bar-btn ${measureOpen ? 'is-active' : ''}`} onClick={() => setMeasureOpen((o) => !o)} title={t.board.measure.buttonTitle} aria-label={t.board.measure.title} aria-pressed={measureOpen}>
      <Ruler size={18} />
    </button>
  );
  const top = (
    <div className="board-top">
      {!viewOnly && (
        <div className="board-bar" role="toolbar" aria-label={t.board.toolbar}>
          {toolBtn('selection', MousePointer2, t.board.tools.selection)}
          {toolBtn('hand', Hand, t.board.tools.hand)}
          <span className="bar-sep" aria-hidden />
          {toolBtn('freedraw', Pen, t.board.tools.freedraw)}
          {toolBtn('text', Type, t.board.tools.text)}
          {toolBtn('eraser', Eraser, t.board.tools.eraser)}
          <ShapesMenu t={t} tool={tool} onTool={pickTool} onPick={insertShape} />
          {toolBtn('laser', Wand2, t.board.tools.laser)}
          <span className="bar-sep" aria-hidden />
          <button className="bar-btn" onClick={() => pictureInput.current?.click()} title={t.board.tools.image} aria-label={t.board.tools.image}>
            <ImagePlus size={18} />
          </button>
          {window.brightboard && (
            <button className={`bar-btn ${snipping ? 'is-active' : ''}`} onClick={() => void snip()} title={t.board.snipTitle} aria-label={t.board.snip}>
              <Scissors size={18} />
            </button>
          )}
          {measureBtn}
          {amHost && (
            <>
              <span className="bar-sep" aria-hidden />
              <button className={`bar-btn ${locked ? 'is-active' : ''}`} onClick={onToggleLock} title={locked ? t.board.unlock : t.board.lock} aria-label={locked ? t.board.unlock : t.board.lock}>
                {locked ? <Lock size={18} /> : <LockOpen size={18} />}
              </button>
              <button className="bar-btn" onClick={onClose} title={t.board.close} aria-label={t.board.close}>
                <X size={18} />
              </button>
            </>
          )}
          <input ref={pictureInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden onChange={(e) => void addPicture(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        </div>
      )}
      <div className="board-side">
        {reading && (
          <span className="board-pill">
            <Loader2 size={14} className="spin" /> {t.board.reading}
          </span>
        )}
        {viewOnly && measureBtn}
        <button className={`bar-btn ${fullscreen ? 'is-active' : ''}`} onClick={toggleFullscreen} title={fullscreen ? t.board.exitFullscreen : t.board.fullscreen} aria-label={fullscreen ? t.board.exitFullscreen : t.board.fullscreen}>
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <MoreMenu
          t={t}
          amHost={amHost}
          canDraw={!viewOnly}
          design={design}
          onDesign={pickDesign}
          onMindMap={() => api.current && insertMindMap(api.current, t.board.rootText)}
          onExport={() => void exportPng()}
          onClear={amHost ? clearBoard : undefined}
          grid={gridOn}
          onToggleGrid={() => setGrid(!gridOn)}
          labels={settings.measureLabels}
          onToggleLabels={() => set('measureLabels', !settings.measureLabels)}
        />
      </div>
    </div>
  );

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
          if (appState.gridModeEnabled !== gridRef.current) {
            gridRef.current = appState.gridModeEnabled;
            setGridOn(appState.gridModeEnabled);
          }
          if ((measureOpenRef.current || labelsRef.current) && !tickPending.current) {
            tickPending.current = true;
            requestAnimationFrame(() => {
              tickPending.current = false;
              setMeasureTick((n) => n + 1);
            });
          }
        }}
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
      {settings.measureLabels && api.current && <SizeLabels api={api.current} tick={measureTick} scale={settings.measureScale} unit={t.board.measure.units[settings.measureUnit]} />}
      {measureOpen && api.current && (
        <MeasurePanel
          t={t}
          api={api.current}
          tick={measureTick}
          unit={settings.measureUnit}
          scale={settings.measureScale}
          grid={gridOn}
          labels={settings.measureLabels}
          onToggleLabels={() => set('measureLabels', !settings.measureLabels)}
          onUnit={(u) => set('measureUnit', u)}
          onScale={changeScale}
          onToggleGrid={() => setGrid(!gridOn)}
          onClose={() => setMeasureOpen(false)}
        />
      )}
      {top}
      {viewOnly && <div className="board-note">{t.board.lockedNote}</div>}
    </div>
  );
}
