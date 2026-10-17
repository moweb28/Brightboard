import { recognizeShape, smoothStroke, type Pt, type RecognizedShape } from '@classroom/protocol';
import { CaptureUpdateAction, convertToExcalidrawElements, exportToCanvas, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

type El = ReturnType<ExcalidrawImperativeAPI['getSceneElementsIncludingDeleted']>[number];
type FreeDraw = El & { points: readonly Pt[] };

const HANDWRITING_IDLE_MS = 1200;
/** Below this the guess is dropped and the ink stays as drawn. Single letters score lower, so their bar is lower. */
const MIN_CONFIDENCE = 60;
const MIN_CONFIDENCE_LETTER = 45;
/** Writing is scaled so letters are about this tall when read (OCR likes ~100 px letters). */
const READ_HEIGHT = 110;

/** Highlighter strokes are see-through; they stay free-form marks. */
const isHighlighter = (stroke: El) => stroke.opacity < 60;

/** Clean, mouse-friendly replacement for a recognized stroke (same color, thickness and opacity). */
function cleanShape(stroke: FreeDraw, s: RecognizedShape): El[] {
  const style = { strokeColor: stroke.strokeColor, strokeWidth: stroke.strokeWidth, opacity: stroke.opacity, roughness: 0, backgroundColor: 'transparent' };
  if (s.kind === 'rectangle' || s.kind === 'ellipse') {
    return convertToExcalidrawElements([{ type: s.kind, x: stroke.x + s.x, y: stroke.y + s.y, width: s.width, height: s.height, ...style }]) as El[];
  }
  const [a, b, c] = s.points;
  if (s.kind === 'triangle') {
    const [line] = convertToExcalidrawElements([{ type: 'line', x: stroke.x + a[0], y: stroke.y + a[1], width: 1, height: 1, ...style }]) as El[];
    const pts: Pt[] = [[0, 0], [b[0] - a[0], b[1] - a[1]], [c[0] - a[0], c[1] - a[1]], [0, 0]];
    return [newElementWith(line, { points: pts, width: s.width, height: s.height } as never)];
  }
  return convertToExcalidrawElements([
    { type: s.kind, x: stroke.x + a[0], y: stroke.y + a[1], width: b[0] - a[0], height: b[1] - a[1], ...style, ...(s.kind === 'line' ? {} : { endArrowhead: 'arrow' }) },
  ]) as El[];
}

type Tesseract = {
  recognize(img: HTMLCanvasElement): Promise<{ data: { text: string; confidence: number } }>;
  setParameters(p: Record<string, string>): Promise<unknown>;
};
const ocr = new Map<string, Promise<Tesseract>>();
/** Loaded on first use only (the language model downloads once): English, or Arabic + English in Arabic. */
const getOcr = (lang: 'en' | 'ar') => {
  const langs = lang === 'ar' ? ['ara', 'eng'] : ['eng'];
  const key = langs.join('+');
  if (!ocr.has(key)) ocr.set(key, import('tesseract.js').then(({ createWorker }) => createWorker(langs) as unknown as Promise<Tesseract>));
  return ocr.get(key)!;
};

export interface SmartPenOptions {
  shapes: boolean;
  handwriting: boolean;
  lang: 'en' | 'ar';
  onReading(busy: boolean): void;
}

/**
 * Watches the board for strokes this user just finished and cleans them up:
 * shapes snap to clean geometry (undo brings the stroke back), other strokes get smoothed,
 * and — if enabled — handwriting becomes typed text after a short pause.
 */
export class SmartPen {
  /** Strokes already handled (or that existed before we started), so nothing is processed twice. */
  private done = new Set<string>();
  private handwriting: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private api: () => ExcalidrawImperativeAPI | null,
    private opts: () => SmartPenOptions,
  ) {}

  /**
   * Hooks into Excalidraw's pointer-up: when *this* user lifts the pen after a freehand stroke,
   * the newest unprocessed stroke is theirs. Strokes that arrive from others are never touched.
   */
  attach(api: ExcalidrawImperativeAPI | null) {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (!api) return;
    for (const e of api.getSceneElementsIncludingDeleted()) if (e.type === 'freedraw') this.done.add(e.id);
    this.unsubscribe = api.onPointerUp((tool) => {
      if (tool.type !== 'freedraw') return;
      setTimeout(() => {
        const fresh = api.getSceneElements().filter((e) => e.type === 'freedraw' && !this.done.has(e.id));
        if (!fresh.length) return;
        const newest = fresh.reduce((a, b) => (b.updated > a.updated ? b : a));
        for (const e of fresh) this.done.add(e.id);
        this.process(newest as FreeDraw);
      }, 0);
    });
  }

  private process(stroke: FreeDraw) {
    const api = this.api();
    const { shapes, handwriting } = this.opts();
    if (!api || (!shapes && !handwriting)) return;
    const all = api.getSceneElementsIncludingDeleted();
    if (isHighlighter(stroke)) {
      // Even thickness (no pen-pressure taper) and a steadier line; never snapped or read as text.
      api.updateScene({
        elements: all.map((e) => (e.id === stroke.id ? newElementWith(e, { points: smoothStroke(stroke.points as Pt[]), pressures: [], simulatePressure: false } as never) : e)),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      return;
    }
    const shape = shapes ? recognizeShape(stroke.points as Pt[]) : null;
    if (shape) {
      const replacement = cleanShape(stroke, shape);
      api.updateScene({
        elements: [...all.map((e) => (e.id === stroke.id ? newElementWith(e, { isDeleted: true }) : e)), ...replacement],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      return;
    }
    if (handwriting) {
      this.handwriting.push(stroke.id);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.readHandwriting(), HANDWRITING_IDLE_MS);
      return;
    }
    // Not a shape: just calm the mouse jitter.
    api.updateScene({
      elements: all.map((e) => (e.id === stroke.id ? newElementWith(e, { points: smoothStroke(stroke.points as Pt[]), pressures: [], simulatePressure: true } as never) : e)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  private async readHandwriting() {
    const ids = new Set(this.handwriting);
    this.handwriting = [];
    const api = this.api();
    if (!api || !ids.size) return;
    const strokes = api.getSceneElementsIncludingDeleted().filter((e) => ids.has(e.id) && !e.isDeleted);
    if (!strokes.length) return;
    this.opts().onReading(true);
    try {
      const x0 = Math.min(...strokes.map((s) => s.x));
      const y0 = Math.min(...strokes.map((s) => s.y));
      const w = Math.max(...strokes.map((s) => s.x + s.width)) - x0;
      const h = Math.max(...strokes.map((s) => s.y + s.height)) - y0;
      // One compact mark (like "M") is read as a single letter; anything wider as one line of words.
      const letter = strokes.length <= 4 && w < h * 1.8;
      // Solid black ink on white, sized for the reader: chalk or white ink would otherwise vanish.
      const scale = Math.max(1, Math.min(6, READ_HEIGHT / Math.max(h, 1)));
      const ink = strokes.map((s) => newElementWith(s, { strokeColor: '#000000', opacity: 100, strokeWidth: Math.max(s.strokeWidth, 1) } as never));
      const canvas = await exportToCanvas({
        elements: ink,
        appState: { exportBackground: true, viewBackgroundColor: '#ffffff' } as never,
        files: null,
        exportPadding: 24,
        getDimensions: (width: number, height: number) => ({ width: width * scale, height: height * scale, scale }),
      });
      const reader = await getOcr(this.opts().lang);
      // "Single word" handles one letter or a short word; wider writing is read as one line.
      await reader.setParameters({ tessedit_pageseg_mode: letter ? '8' : '7' });
      const { data } = await reader.recognize(canvas);
      let text = data.text.replace(/\s+/g, ' ').trim();
      // A single drawn letter sometimes comes back doubled ("MM"): one compact stroke is one letter.
      if (letter && strokes.length === 1 && text.length > 1 && [...text].every((ch) => ch === text[0])) text = text[0];
      if (data.confidence < (letter ? MIN_CONFIDENCE_LETTER : MIN_CONFIDENCE) || !text) return;
      const x = Math.min(...strokes.map((s) => s.x));
      const y = Math.min(...strokes.map((s) => s.y));
      const height = Math.max(...strokes.map((s) => s.y + s.height)) - y;
      const [label] = convertToExcalidrawElements([
        { type: 'text', x, y, text, fontSize: Math.max(16, Math.min(72, Math.round(height * 0.7))), strokeColor: strokes[0].strokeColor },
      ]) as El[];
      const now = this.api();
      if (!now) return;
      now.updateScene({
        elements: [...now.getSceneElementsIncludingDeleted().map((e) => (ids.has(e.id) ? newElementWith(e, { isDeleted: true }) : e)), label],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    } catch (e) {
      console.warn('handwriting recognition failed', e);
    } finally {
      this.opts().onReading(false);
    }
  }
}
