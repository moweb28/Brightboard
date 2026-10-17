/**
 * Measurements for whiteboard shapes, in a chosen unit. `scale` is how many board pixels make
 * one unit (the board's grid square is one unit). Lengths come out in units, areas in units².
 */

export type MeasuredKind = 'square' | 'rectangle' | 'rhombus' | 'circle' | 'ellipse' | 'line' | 'path' | 'triangle' | 'polygon' | 'stroke';

export type MeasureKey = 'side' | 'width' | 'height' | 'diagonal' | 'diagonal1' | 'diagonal2' | 'radius' | 'diameter' | 'length' | 'perimeter' | 'area' | 'angles' | 'sides';

export interface MeasureRow {
  key: MeasureKey;
  /** One number (a length or area), or several (the sides or angles of a polygon). */
  value: number | number[];
  /** 1 = length, 2 = area, 0 = degrees. */
  dim: 0 | 1 | 2;
  /** Can be typed in to resize the shape. */
  editable?: boolean;
}

export interface Measurement {
  kind: MeasuredKind;
  rows: MeasureRow[];
}

/** The parts of an Excalidraw element we need. */
export interface MeasurableElement {
  type: string;
  width: number;
  height: number;
  points?: readonly (readonly [number, number])[];
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.max(a, b) * 0.02);
const dist = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Rounds for display: up to 2 decimals, no trailing zeros. */
export function roundMeasure(n: number) {
  return Math.round(n * 100) / 100;
}

/** Ramanujan's approximation of an ellipse's perimeter (exact for circles). */
export function ellipsePerimeter(a: number, b: number) {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/** Interior angles (degrees) of a polygon given its corners in order. */
function angles(pts: readonly (readonly [number, number])[]) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const v1 = [a[0] - p[0], a[1] - p[1]];
    const v2 = [b[0] - p[0], b[1] - p[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  });
}

/** What a shape measures, or null for things without a geometric size (text, pictures). */
export function measureElement(el: MeasurableElement, scale: number): Measurement | null {
  const s = scale > 0 ? scale : 1;
  const w = Math.abs(el.width) / s;
  const h = Math.abs(el.height) / s;
  switch (el.type) {
    case 'rectangle':
      if (near(w, h)) {
        return {
          kind: 'square',
          rows: [
            { key: 'side', value: w, dim: 1, editable: true },
            { key: 'perimeter', value: 4 * w, dim: 1 },
            { key: 'area', value: w * w, dim: 2 },
            { key: 'diagonal', value: Math.SQRT2 * w, dim: 1 },
          ],
        };
      }
      return {
        kind: 'rectangle',
        rows: [
          { key: 'width', value: w, dim: 1, editable: true },
          { key: 'height', value: h, dim: 1, editable: true },
          { key: 'perimeter', value: 2 * (w + h), dim: 1 },
          { key: 'area', value: w * h, dim: 2 },
          { key: 'diagonal', value: Math.hypot(w, h), dim: 1 },
        ],
      };
    case 'diamond': {
      const side = Math.hypot(w / 2, h / 2);
      return {
        kind: 'rhombus',
        rows: [
          { key: 'diagonal1', value: w, dim: 1, editable: true },
          { key: 'diagonal2', value: h, dim: 1, editable: true },
          { key: 'side', value: side, dim: 1 },
          { key: 'perimeter', value: 4 * side, dim: 1 },
          { key: 'area', value: (w * h) / 2, dim: 2 },
        ],
      };
    }
    case 'ellipse':
      if (near(w, h)) {
        const r = w / 2;
        return {
          kind: 'circle',
          rows: [
            { key: 'radius', value: r, dim: 1, editable: true },
            { key: 'diameter', value: w, dim: 1, editable: true },
            { key: 'perimeter', value: 2 * Math.PI * r, dim: 1 },
            { key: 'area', value: Math.PI * r * r, dim: 2 },
          ],
        };
      }
      return {
        kind: 'ellipse',
        rows: [
          { key: 'width', value: w, dim: 1, editable: true },
          { key: 'height', value: h, dim: 1, editable: true },
          { key: 'perimeter', value: ellipsePerimeter(w / 2, h / 2), dim: 1 },
          { key: 'area', value: (Math.PI * w * h) / 4, dim: 2 },
        ],
      };
    case 'line':
    case 'arrow': {
      const pts = (el.points ?? []).map(([x, y]) => [x / s, y / s] as const);
      if (pts.length < 2) return null;
      const closed = pts.length >= 4 && dist(pts[0], pts[pts.length - 1]) <= Math.max(0.05, 0.03 * Math.max(w, h));
      if (closed) {
        const corners = pts.slice(0, -1);
        const sides = corners.map((p, i) => dist(p, corners[(i + 1) % corners.length]));
        const area = Math.abs(corners.reduce((sum, p, i) => sum + p[0] * corners[(i + 1) % corners.length][1] - corners[(i + 1) % corners.length][0] * p[1], 0)) / 2;
        return {
          kind: corners.length === 3 ? 'triangle' : 'polygon',
          rows: [
            { key: 'sides', value: sides, dim: 1 },
            { key: 'perimeter', value: sides.reduce((a, b) => a + b, 0), dim: 1 },
            { key: 'area', value: area, dim: 2 },
            ...(corners.length <= 6 ? [{ key: 'angles' as const, value: angles(corners), dim: 0 as const }] : []),
          ],
        };
      }
      const length = pts.slice(1).reduce((sum, p, i) => sum + dist(pts[i], p), 0);
      return { kind: pts.length === 2 ? 'line' : 'path', rows: [{ key: 'length', value: length, dim: 1, editable: true }] };
    }
    case 'freedraw': {
      const pts = el.points ?? [];
      if (pts.length < 2) return null;
      const length = pts.slice(1).reduce((sum, p, i) => sum + dist(pts[i], p), 0) / s;
      return { kind: 'stroke', rows: [{ key: 'length', value: length, dim: 1 }] };
    }
    default:
      return null;
  }
}

/**
 * The new size for a shape when a measurement is typed in (in board pixels), or null if that
 * row can't be edited. Lines are scaled as a whole so they keep their shape.
 */
export function resizeFor(el: MeasurableElement, key: MeasureKey, value: number, scale: number): { width?: number; height?: number; factor?: number } | null {
  if (!(value > 0)) return null;
  const px = value * (scale > 0 ? scale : 1);
  if (el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse') {
    if (key === 'side') return { width: px, height: px };
    if (key === 'radius') return { width: 2 * px, height: 2 * px };
    if (key === 'diameter') return { width: px, height: px };
    if (key === 'width' || key === 'diagonal1') return { width: px };
    if (key === 'height' || key === 'diagonal2') return { height: px };
  }
  if ((el.type === 'line' || el.type === 'arrow') && key === 'length') {
    const m = measureElement(el, 1);
    const current = m?.rows.find((r) => r.key === 'length')?.value;
    if (typeof current === 'number' && current > 0) return { factor: px / current };
  }
  return null;
}
