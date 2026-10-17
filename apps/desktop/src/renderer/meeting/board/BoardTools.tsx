import { BOARD_DESIGNS, GEO_SHAPES, GEO_TRIANGLES, geoShape, type BoardDesign, type GeoShape } from '@classroom/protocol';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { Check, ChevronDown, Download, GitBranch, Grid3x3, Hexagon, Highlighter, Tag, MoreHorizontal, Pen, PenLine, PenTool, Shapes, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Dict } from '../../lib/i18n';

/**
 * Extra whiteboard tools. Picking Excalidraw's pen or text tool shows a bar of styles right
 * under the toolbar (pen kinds, colors, thickness / fonts, sizes, colors). They set Excalidraw's
 * "next item" style, so undo, sync and export work as usual. Less-used actions live in "More".
 */

type Api = ExcalidrawImperativeAPI;

/** How each look paints the board. `dark` boards get light ink by default. */
export const DESIGNS: Record<BoardDesign, { bg: string; grid: boolean; dark: boolean }> = {
  auto: { bg: '#ffffff', grid: false, dark: false },
  white: { bg: '#ffffff', grid: false, dark: false },
  black: { bg: '#141414', grid: false, dark: true },
  chalk: { bg: '#1f3b2f', grid: false, dark: true },
  paper: { bg: '#fbf6e8', grid: false, dark: false },
  grid: { bg: '#ffffff', grid: true, dark: false },
  blueprint: { bg: '#143a6b', grid: true, dark: true },
};
const LIGHT_INK = '#f1f3f5';
const DARK_INK = '#1e1e1e';
export const inkFor = (design: BoardDesign) => (DESIGNS[design].dark ? LIGHT_INK : DARK_INK);

/** Applies a look to the board (background, grid, and default ink that shows up on it). */
export function applyDesign(api: Api, design: BoardDesign) {
  const d = DESIGNS[design];
  api.updateScene({ appState: { viewBackgroundColor: d.bg, gridModeEnabled: d.grid, currentItemStrokeColor: inkFor(design) } as never });
}

type PenKind = 'pen' | 'marker' | 'highlighter' | 'chalk';
/** Excalidraw draws freehand strokes about 4× strokeWidth wide. */
const PENS: Record<PenKind, { width: number; opacity: number; icon: typeof Pen }> = {
  pen: { width: 1, opacity: 100, icon: Pen },
  marker: { width: 2.5, opacity: 100, icon: PenTool },
  highlighter: { width: 5, opacity: 35, icon: Highlighter },
  chalk: { width: 1.5, opacity: 85, icon: PenLine },
};
const INK_COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#c2255c'];
const HIGHLIGHTS = ['#fcc419', '#94d82d', '#ff8787', '#74c0fc', '#da77f2'];
const WIDTHS = [0.5, 1, 2, 4];

/** Excalidraw's built-in font ids, each named in its own typeface. */
const FONTS: { id: number; css: string; key: keyof Dict['board']['fonts'] }[] = [
  { id: 5, css: 'Excalifont', key: 'hand' },
  { id: 6, css: 'Nunito', key: 'normal' },
  { id: 7, css: 'Lilita One', key: 'headline' },
  { id: 8, css: 'Comic Shanns', key: 'playful' },
  { id: 9, css: 'Liberation Sans', key: 'clean' },
  { id: 1, css: 'Virgil', key: 'classic' },
  { id: 3, css: 'Cascadia', key: 'code' },
];
const SIZES: [string, number][] = [
  ['S', 16],
  ['M', 20],
  ['L', 28],
  ['XL', 36],
  ['2XL', 48],
  ['3XL', 72],
];

/** Closes on outside click or Esc. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function Swatches({ colors, current, onPick, label }: { colors: string[]; current: string; onPick(c: string): void; label: string }) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {colors.map((c) => {
        const on = current.toLowerCase() === c.toLowerCase();
        return (
          <button key={c} className={`swatch ${on ? 'is-on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} aria-pressed={on}>
            {on && <Check size={13} />}
          </button>
        );
      })}
    </div>
  );
}

/** What kind of pen the current style is (to show which one is picked). */
function penKindOf(opacity: number, width: number, color: string): PenKind {
  if (opacity < 60) return 'highlighter';
  if (opacity < 100 && color.toLowerCase() === LIGHT_INK) return 'chalk';
  return width >= 2 ? 'marker' : 'pen';
}

interface PenBarProps {
  t: Dict;
  api: Api;
  design: BoardDesign;
  smart: { shapes: boolean; handwriting: boolean; toggleShapes(): void; toggleHandwriting(): void };
}

/** Shown while the pen tool is picked: pen kind, color, thickness, and the smart pen switches. */
export function PenBar({ t, api, design, smart }: PenBarProps) {
  const st = api.getAppState();
  const [kind, setKind] = useState<PenKind>(() => penKindOf(st.currentItemOpacity, st.currentItemStrokeWidth, st.currentItemStrokeColor));
  const [color, setColor] = useState(st.currentItemStrokeColor);
  const [width, setWidth] = useState(st.currentItemStrokeWidth);
  const lastInk = useRef(kind === 'highlighter' || kind === 'chalk' ? inkFor(design) : st.currentItemStrokeColor);
  const lastHighlight = useRef(kind === 'highlighter' ? st.currentItemStrokeColor : HIGHLIGHTS[0]);

  const apply = (k: PenKind, c: string, w: number) => {
    setKind(k);
    setColor(c);
    setWidth(w);
    if (k === 'highlighter') lastHighlight.current = c;
    else if (k !== 'chalk') lastInk.current = c;
    api.updateScene({ appState: { currentItemStrokeColor: c, currentItemStrokeWidth: w, currentItemOpacity: PENS[k].opacity } as never });
  };
  const pickKind = (k: PenKind) => apply(k, k === 'highlighter' ? lastHighlight.current : k === 'chalk' ? LIGHT_INK : lastInk.current, PENS[k].width);
  const pickColor = (c: string) => apply(kind === 'chalk' ? 'pen' : kind, c, width);
  const colors = kind === 'highlighter' ? HIGHLIGHTS : [inkFor(design), ...INK_COLORS];

  return (
    <div className="board-ctx" role="toolbar" aria-label={t.board.pens}>
      <div className="ctx-group">
        {(Object.keys(PENS) as PenKind[]).map((k) => {
          const Icon = PENS[k].icon;
          return (
            <button key={k} className={`ctx-btn ${kind === k ? 'is-on' : ''}`} onClick={() => pickKind(k)} title={t.board.penKinds[k]}>
              <Icon size={16} />
              <span className="ctx-label">{t.board.penKinds[k]}</span>
            </button>
          );
        })}
      </div>
      <span className="ctx-sep" />
      <Swatches colors={colors} current={color} onPick={pickColor} label={t.board.color} />
      <span className="ctx-sep" />
      <div className="ctx-group" role="group" aria-label={t.board.thickness}>
        {WIDTHS.map((w, i) => (
          <button key={w} className={`ctx-btn ctx-width ${width === w ? 'is-on' : ''}`} onClick={() => apply(kind, color, w)} title={t.board.widths[i]}>
            <span style={{ height: Math.max(2, w * 3) }} />
          </button>
        ))}
      </div>
      <span className="ctx-sep" />
      <button className={`ctx-btn ${smart.shapes ? 'is-on' : ''}`} onClick={smart.toggleShapes} title={t.board.smartShapesHint} aria-pressed={smart.shapes}>
        <Shapes size={16} />
        <span className="ctx-label">{t.board.smartShort}</span>
      </button>
      <button className={`ctx-btn ${smart.handwriting ? 'is-on' : ''}`} onClick={smart.toggleHandwriting} title={t.board.handwritingHint} aria-pressed={smart.handwriting}>
        <Type size={16} />
        <span className="ctx-label">{t.board.handwritingShort}</span>
      </button>
    </div>
  );
}

/** Shown while the text tool is picked: font, size and color for what you type next. */
export function TextBar({ t, api, design }: { t: Dict; api: Api; design: BoardDesign }) {
  const st = api.getAppState();
  const [font, setFont] = useState<number>(st.currentItemFontFamily);
  const [size, setSize] = useState<number>(st.currentItemFontSize);
  const [color, setColor] = useState<string>(st.currentItemOpacity < 100 ? inkFor(design) : st.currentItemStrokeColor);
  const [fontsOpen, setFontsOpen] = useState(false);
  const fontsRef = useDismiss(fontsOpen, () => setFontsOpen(false));

  const apply = (f: number, s: number, c: string) => {
    setFont(f);
    setSize(s);
    setColor(c);
    // Text is always solid, whatever pen was used last.
    api.updateScene({ appState: { currentItemFontFamily: f, currentItemFontSize: s, currentItemStrokeColor: c, currentItemOpacity: 100 } as never });
  };
  // Typing right after the highlighter would otherwise give see-through text.
  useEffect(() => apply(font, size, color), []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = FONTS.find((f) => f.id === font) ?? FONTS[0];
  return (
    <div className="board-ctx" role="toolbar" aria-label={t.board.text}>
      <div className="menu-anchor" ref={fontsRef}>
        <button className="ctx-btn ctx-font" onClick={() => setFontsOpen((o) => !o)} aria-expanded={fontsOpen} style={{ fontFamily: `'${current.css}', 'Segoe UI', sans-serif` }}>
          {t.board.fonts[current.key]}
          <ChevronDown size={14} />
        </button>
        {fontsOpen && (
          <div className="ctx-list">
            {FONTS.map((f) => (
              <button
                key={f.id}
                className={`ctx-item ${font === f.id ? 'is-on' : ''}`}
                style={{ fontFamily: `'${f.css}', 'Segoe UI', sans-serif` }}
                onClick={() => {
                  apply(f.id, size, color);
                  setFontsOpen(false);
                }}
              >
                {t.board.fonts[f.key]}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="ctx-sep" />
      <div className="ctx-group" role="group" aria-label={t.board.textSize}>
        {SIZES.map(([label, s]) => (
          <button key={s} className={`ctx-btn ctx-size ${size === s ? 'is-on' : ''}`} onClick={() => apply(font, s, color)}>
            {label}
          </button>
        ))}
      </div>
      <span className="ctx-sep" />
      <Swatches colors={[inkFor(design), ...INK_COLORS]} current={color} onPick={(c) => apply(font, size, c)} label={t.board.color} />
    </div>
  );
}

interface MoreProps {
  t: Dict;
  amHost: boolean;
  canDraw: boolean;
  design: BoardDesign;
  onDesign(d: BoardDesign): void;
  onMindMap(): void;
  onExport(): void;
  /** Grid lines on this board (just for you); one square is one measuring unit. */
  grid: boolean;
  onToggleGrid(): void;
  /** Lengths written on shapes. */
  labels: boolean;
  onToggleLabels(): void;
}

/** Mind map, save as image, and (admin) the board look. */
export function MoreMenu({ t, amHost, canDraw, design, onDesign, onMindMap, onExport, grid, onToggleGrid, labels, onToggleLabels }: MoreProps) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="menu-anchor" ref={ref}>
      <button className={`board-btn ${open ? 'is-active' : ''}`} onClick={() => setOpen((o) => !o)} title={t.board.more} aria-label={t.board.more} aria-expanded={open}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="board-pop">
          {canDraw && (
            <button className="pop-row" onClick={run(onMindMap)} title={t.board.mindHint}>
              <GitBranch size={16} /> {t.board.mindMap}
            </button>
          )}
          <button className={`pop-row ${grid ? 'is-on' : ''}`} onClick={run(onToggleGrid)} aria-pressed={grid}>
            <Grid3x3 size={16} /> {t.board.measure.grid}
            {grid && <Check size={16} className="pop-check-icon" />}
          </button>
          <button className={`pop-row ${labels ? 'is-on' : ''}`} onClick={run(onToggleLabels)} aria-pressed={labels}>
            <Tag size={16} /> {t.board.measure.labels}
            {labels && <Check size={16} className="pop-check-icon" />}
          </button>
          <button className="pop-row" onClick={run(onExport)}>
            <Download size={16} /> {t.board.exportPng}
          </button>
          {amHost && (
            <>
              <p className="pop-title">{t.board.designTitle}</p>
              <div className="design-list">
                {BOARD_DESIGNS.map((d) => (
                  <button key={d} className={`design ${design === d ? 'is-on' : ''}`} onClick={run(() => onDesign(d))}>
                    <span className={`design-swatch design-${d}`} />
                    {t.board.designs[d]}
                  </button>
                ))}
              </div>
              <p className="pop-note">{t.board.designNote}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A shape's outline as a small icon, drawn from the same geometry the board uses. */
function ShapeIcon({ kind }: { kind: GeoShape }) {
  const spec = geoShape(kind, 1);
  const k = 18 / Math.max(spec.width, spec.height);
  const w = spec.width * k;
  const h = spec.height * k;
  const ox = (24 - w) / 2;
  const oy = (24 - h) / 2;
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round' as const };
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      {spec.type === 'rectangle' && <rect x={ox} y={oy} width={w} height={h} {...common} />}
      {spec.type === 'ellipse' && <ellipse cx={12} cy={12} rx={w / 2} ry={h / 2} {...common} />}
      {spec.type === 'diamond' && <polygon points={`${12},${oy} ${ox + w},${12} ${12},${oy + h} ${ox},${12}`} {...common} />}
      {spec.type === 'polygon' && <polygon points={spec.points.slice(0, -1).map(([x, y]) => `${ox + x * k},${oy + y * k}`).join(' ')} {...common} />}
    </svg>
  );
}

/** Ready-made geometric shapes: click one and it lands in the middle of the board, sized in units. */
export function ShapesMenu({ t, onPick }: { t: Dict; onPick(kind: GeoShape): void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const tile = (kind: GeoShape) => (
    <button
      key={kind}
      className="shape-tile"
      onClick={() => {
        setOpen(false);
        onPick(kind);
      }}
    >
      <ShapeIcon kind={kind} />
      <span>{t.board.geo[kind]}</span>
    </button>
  );
  return (
    <div className="menu-anchor" ref={ref}>
      <button className={`board-btn ${open ? 'is-active' : ''}`} onClick={() => setOpen((o) => !o)} title={t.board.shapesTitle} aria-expanded={open}>
        <Hexagon size={16} /> <span className="board-btn-label">{t.board.shapes}</span>
      </button>
      {open && (
        <div className="board-pop shapes-pop">
          <p className="pop-title">{t.board.shapes}</p>
          <div className="shape-grid">{GEO_SHAPES.map(tile)}</div>
          <p className="pop-title">{t.board.triangles}</p>
          <div className="shape-grid">{GEO_TRIANGLES.map(tile)}</div>
        </div>
      )}
    </div>
  );
}
