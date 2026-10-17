import { roundMeasure } from '@classroom/protocol';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

type Api = ExcalidrawImperativeAPI;
type El = ReturnType<Api['getSceneElements']>[number];
type P = [number, number];

/** Most shapes labelled at once (keeps big boards fast). */
const MAX_SHAPES = 80;
/** Edges shorter than this on screen get no label (it wouldn't fit). */
const MIN_EDGE_PX = 28;
/** How far a label sits outside its edge, in screen pixels. */
const GAP = 13;
/** Extra lift for the top label of a selected shape, so the rotate handle stays visible. */
const ROTATE_HANDLE_CLEARANCE = 22;

interface Label {
  key: string;
  x: number;
  y: number;
  text: string;
}

const rotate = ([x, y]: P, [cx, cy]: P, a: number): P => {
  if (!a) return [x, y];
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
};

interface Props {
  api: Api;
  /** Bumped by the board on every scene, scroll or zoom change. */
  tick: number;
  scale: number;
  unit: string;
}

/**
 * Lengths written on the shapes themselves: width above the top edge and height beside the
 * right edge of boxes, the diameter of circles, every side of lines and triangles. Live while
 * drawing, resizing, scrolling and zooming. Boxes with text inside (flowcharts) are left alone.
 */
export function SizeLabels({ api, tick, scale, unit }: Props) {
  void tick; // re-render trigger
  const st = api.getAppState();
  const zoom = st.zoom.value;
  const toScreen = ([x, y]: P): P => [(x + st.scrollX) * zoom, (y + st.scrollY) * zoom];
  const fmt = (px: number) => `${roundMeasure(px / (scale > 0 ? scale : 1))} ${unit}`;
  const labels: Label[] = [];

  const selected = st.selectedElementIds;
  /** A label just outside the edge a→b, on the side of `outward` (a point outside the shape). */
  const edge = (key: string, a: P, b: P, outward: P, text: string, extra = 0) => {
    const sa = toScreen(a);
    const sb = toScreen(b);
    if (Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) < MIN_EDGE_PX) return;
    const mid: P = [(sa[0] + sb[0]) / 2, (sa[1] + sb[1]) / 2];
    const so = toScreen(outward);
    const len = Math.hypot(so[0] - mid[0], so[1] - mid[1]) || 1;
    const nx = (so[0] - mid[0]) / len;
    const ny = (so[1] - mid[1]) / len;
    // Push the label out by its own half-size along the normal, so slanted edges don't run through it.
    const halfW = text.length * 3.4 + 6;
    const halfH = 9;
    const d = GAP / 2 + Math.abs(nx) * halfW + Math.abs(ny) * halfH + extra;
    labels.push({ key, x: mid[0] + nx * d, y: mid[1] + ny * d, text });
  };

  const shapes = api
    .getSceneElements()
    .filter((e) => ['rectangle', 'diamond', 'ellipse', 'line', 'arrow'].includes(e.type) && !e.boundElements?.some((b) => b.type === 'text'))
    .slice(0, MAX_SHAPES);

  for (const el of shapes as El[]) {
    const { x, y, width: w, height: h, angle } = el;
    const c: P = [x + w / 2, y + h / 2];
    const at = (p: P) => rotate(p, c, angle);
    if (el.type === 'rectangle') {
      edge(`${el.id}:w`, at([x, y]), at([x + w, y]), at([x + w / 2, y - 1000]), fmt(w), selected[el.id] ? ROTATE_HANDLE_CLEARANCE : 0);
      edge(`${el.id}:h`, at([x + w, y]), at([x + w, y + h]), at([x + w + 1000, y + h / 2]), fmt(h));
    } else if (el.type === 'diamond') {
      // A rhombus: the length of its (equal) sides, on the top-right side.
      edge(`${el.id}:s`, at([x + w / 2, y]), at([x + w, y + h / 2]), at([x + w + 1000, y - 1000]), fmt(Math.hypot(w / 2, h / 2)));
    } else if (el.type === 'ellipse') {
      const circle = Math.abs(w - h) <= Math.max(1, Math.max(w, h) * 0.02);
      edge(`${el.id}:w`, at([x, y]), at([x + w, y]), at([x + w / 2, y - 1000]), circle ? `⌀ ${fmt(w)}` : fmt(w), selected[el.id] ? ROTATE_HANDLE_CLEARANCE : 0);
      if (!circle) edge(`${el.id}:h`, at([x + w, y]), at([x + w, y + h]), at([x + w + 1000, y + h / 2]), fmt(h));
    } else if ('points' in el && el.points.length >= 2) {
      const pts = (el.points as readonly P[]).map(([px, py]) => at([x + px, y + py]));
      const closed = pts.length >= 4 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 2;
      // Labels go outside a closed shape (away from its middle), or above an open line.
      const mid: P = pts.slice(0, closed ? -1 : undefined).reduce<P>((m, p, _i, all) => [m[0] + p[0] / all.length, m[1] + p[1] / all.length], [0, 0]);
      pts.slice(1, 9).forEach((b, i) => {
        const a = pts[i];
        const m: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let normal: P = [-(b[1] - a[1]), b[0] - a[0]];
        const away = closed ? (normal[0] * (m[0] - mid[0]) + normal[1] * (m[1] - mid[1]) < 0 ? -1 : 1) : normal[1] > 0 ? -1 : 1;
        normal = [normal[0] * away, normal[1] * away];
        edge(`${el.id}:${i}`, a, b, [m[0] + normal[0], m[1] + normal[1]], fmt(Math.hypot(b[0] - a[0], b[1] - a[1])));
      });
    }
  }

  return (
    <div className="size-labels" aria-hidden>
      {labels.map((l) => (
        <span key={l.key} className="size-label" style={{ left: l.x, top: l.y }}>
          {l.text}
        </span>
      ))}
    </div>
  );
}
