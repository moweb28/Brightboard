import { BOARD_DESIGNS, type BoardDesign } from '@classroom/protocol';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { Check, Highlighter, LayoutTemplate, Pen, PenLine, PenTool, Type } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Dict } from '../../lib/i18n';

/**
 * Extra whiteboard tools: pen kinds (pen, marker, highlighter, chalk) with colors and thickness,
 * fonts and big text sizes, and board looks. They set Excalidraw's "next item" style, so they
 * work with everything Excalidraw already does (undo, sync, export).
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
const INK_COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#c2255c', '#0c8599'];
const HIGHLIGHTS = ['#fcc419', '#94d82d', '#ff8787', '#74c0fc', '#da77f2'];
const WIDTHS = [0.5, 1, 2, 4];

/** Excalidraw's built-in font ids, with the name each shows in its own typeface. */
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

/** A board-bar button that opens a panel; closes on outside click or Esc. */
function Popover({ icon, label, title, active, children }: { icon: ReactNode; label: string; title: string; active?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      <button className={`board-btn ${open || active ? 'is-active' : ''}`} onClick={() => setOpen((o) => !o)} title={title} aria-expanded={open}>
        {icon} <span className="board-btn-label">{label}</span>
      </button>
      {open && <div className="board-pop">{children(() => setOpen(false))}</div>}
    </div>
  );
}

interface PensProps {
  t: Dict;
  api: () => Api | null;
  design: BoardDesign;
  smart: { shapes: boolean; handwriting: boolean; toggleShapes(): void; toggleHandwriting(): void };
}

/** Pens (kind, color, thickness), the smart pen switches, and text (font, size). */
export function PensAndText({ t, api, design, smart }: PensProps) {
  const [kind, setKind] = useState<PenKind>('pen');
  const [ink, setInk] = useState<string>(inkFor(design));
  const [highlight, setHighlight] = useState(HIGHLIGHTS[0]);
  const [width, setWidth] = useState(PENS.pen.width);
  const [font, setFont] = useState(5);
  const [size, setSize] = useState(20);

  // A new board look brings ink that shows up on it.
  useEffect(() => setInk(inkFor(design)), [design]);

  const choosePen = (k: PenKind, opts: { color?: string; w?: number } = {}) => {
    const a = api();
    if (!a) return;
    const p = PENS[k];
    const w = opts.w ?? (k === kind ? width : p.width);
    const color = opts.color ?? (k === 'highlighter' ? highlight : k === 'chalk' ? LIGHT_INK : ink);
    setKind(k);
    setWidth(w);
    a.setActiveTool({ type: 'freedraw' });
    a.updateScene({ appState: { currentItemStrokeColor: color, currentItemStrokeWidth: w, currentItemOpacity: p.opacity } as never });
  };
  const pickColor = (c: string) => {
    if (kind === 'highlighter') setHighlight(c);
    else setInk(c);
    choosePen(kind === 'chalk' ? 'pen' : kind, { color: c });
  };
  const chooseText = (f: number, s: number) => {
    const a = api();
    if (!a) return;
    setFont(f);
    setSize(s);
    a.setActiveTool({ type: 'text' });
    a.updateScene({ appState: { currentItemFontFamily: f, currentItemFontSize: s, currentItemStrokeColor: ink, currentItemOpacity: 100 } as never });
  };

  const colors = kind === 'highlighter' ? HIGHLIGHTS : [inkFor(design), ...INK_COLORS];
  const current = kind === 'highlighter' ? highlight : ink;
  return (
    <Popover icon={<Pen size={16} />} label={t.board.pens} title={t.board.pensTitle}>
      {() => (
        <div className="pens">
          <p className="pop-title">{t.board.pens}</p>
          <div className="pen-kinds">
            {(Object.keys(PENS) as PenKind[]).map((k) => {
              const Icon = PENS[k].icon;
              return (
                <button key={k} className={`pen-kind ${kind === k ? 'is-on' : ''}`} onClick={() => choosePen(k)}>
                  <Icon size={18} />
                  {t.board.penKinds[k]}
                </button>
              );
            })}
          </div>
          <div className="swatches" role="group" aria-label={t.board.color}>
            {colors.map((c) => (
              <button key={c} className={`swatch ${current === c ? 'is-on' : ''}`} style={{ background: c }} onClick={() => pickColor(c)} aria-label={c}>
                {current === c && <Check size={14} />}
              </button>
            ))}
          </div>
          <div className="widths" role="group" aria-label={t.board.thickness}>
            {WIDTHS.map((w, i) => (
              <button key={w} className={`width ${width === w ? 'is-on' : ''}`} onClick={() => choosePen(kind, { w })} title={t.board.widths[i]}>
                <span style={{ height: Math.max(2, w * 3.2) }} />
              </button>
            ))}
          </div>
          <label className="pop-check">
            <input type="checkbox" checked={smart.shapes} onChange={smart.toggleShapes} />
            <span>
              <strong>{t.board.smartShapes}</strong>
              <small>{t.board.smartShapesHint}</small>
            </span>
          </label>
          <label className="pop-check">
            <input type="checkbox" checked={smart.handwriting} onChange={smart.toggleHandwriting} />
            <span>
              <strong>{t.board.handwriting}</strong>
              <small>{t.board.handwritingHint}</small>
            </span>
          </label>

          <p className="pop-title">
            <Type size={14} /> {t.board.text}
          </p>
          <div className="fonts">
            {FONTS.map((f) => (
              <button key={f.id} className={`font ${font === f.id ? 'is-on' : ''}`} style={{ fontFamily: `'${f.css}', 'Segoe UI', sans-serif` }} onClick={() => chooseText(f.id, size)}>
                {t.board.fonts[f.key]}
              </button>
            ))}
          </div>
          <div className="sizes">
            {SIZES.map(([label, s]) => (
              <button key={s} className={`size ${size === s ? 'is-on' : ''}`} onClick={() => chooseText(font, s)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

/** Admin only: the look everyone's board has. */
export function DesignPicker({ t, design, onPick }: { t: Dict; design: BoardDesign; onPick(d: BoardDesign): void }) {
  return (
    <Popover icon={<LayoutTemplate size={16} />} label={t.board.design} title={t.board.designTitle}>
      {(close) => (
        <div className="designs">
          <p className="pop-title">{t.board.designTitle}</p>
          <div className="design-list">
            {BOARD_DESIGNS.map((d) => (
              <button
                key={d}
                className={`design ${design === d ? 'is-on' : ''}`}
                onClick={() => {
                  onPick(d);
                  close();
                }}
              >
                <span className={`design-swatch design-${d}`} />
                {t.board.designs[d]}
              </button>
            ))}
          </div>
          <p className="pop-note">{t.board.designNote}</p>
        </div>
      )}
    </Popover>
  );
}
