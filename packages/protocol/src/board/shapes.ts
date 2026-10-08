/** Smart pen: recognizes rough mouse-drawn shapes so they can be replaced by clean ones. */
export type Pt = [number, number];

export interface RecognizedShape {
  kind: 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'triangle';
  /** Bounding box in the same coordinates as the input points. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Key points: line/arrow = [start, end], triangle = 3 corners. */
  points: Pt[];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pathLength(pts: readonly Pt[]) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function bounds(pts: readonly Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Distance from p to segment ab. */
function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Ramer–Douglas–Peucker simplification. */
function simplify(pts: readonly Pt[], eps: number): Pt[] {
  if (pts.length < 3) return [...pts];
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/** Interior angle at b, in degrees. */
function angleAt(a: Pt, b: Pt, c: Pt) {
  const v1 = [a[0] - b[0], a[1] - b[1]];
  const v2 = [c[0] - b[0], c[1] - b[1]];
  const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Corners of a closed stroke: simplify, then drop vertices that are nearly straight (e.g. where the pen started mid-side). */
function corners(closed: readonly Pt[], diag: number) {
  let v = simplify(closed, diag * 0.06).slice(0, -1); // last point repeats the first
  let changed = true;
  while (changed && v.length > 3) {
    changed = false;
    for (let i = 0; i < v.length; i++) {
      const prev = v[(i - 1 + v.length) % v.length];
      const next = v[(i + 1) % v.length];
      if (angleAt(prev, v[i], next) > 150) {
        v = v.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return v;
}

const MIN_SIZE = 20;

export function recognizeShape(pts: readonly Pt[]): RecognizedShape | null {
  if (pts.length < 4) return null;
  const box = bounds(pts);
  const diag = Math.hypot(box.width, box.height);
  if (diag < MIN_SIZE) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const len = pathLength(pts);

  // Closed shapes: the stroke ends near where it started.
  if (dist(first, last) < diag * 0.25 && len > diag * 1.5) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const rx = box.width / 2 || 1;
    const ry = box.height / 2 || 1;
    const ellipseError = pts.reduce((sum, [x, y]) => sum + Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1), 0) / pts.length;
    if (ellipseError < 0.1) return { kind: 'ellipse', ...box, points: [] };
    const c = corners([...pts.slice(0, -1), first], diag);
    if (c.length === 3) return { kind: 'triangle', ...box, points: c };
    if (c.length === 4) return { kind: 'rectangle', ...box, points: [] };
    return null;
  }

  // Straight line.
  if (dist(first, last) / len > 0.92) return { kind: 'line', ...box, points: [first, last] };

  // Arrow: a straight shaft to the farthest point, then a short hook (the head) near that tip.
  let tipIdx = 0;
  for (let i = 1; i < pts.length; i++) if (dist(first, pts[i]) > dist(first, pts[tipIdx])) tipIdx = i;
  const tip = pts[tipIdx];
  const shaft = pts.slice(0, tipIdx + 1);
  const tail = pts.slice(tipIdx);
  const shaftLen = dist(first, tip);
  if (
    tipIdx < pts.length - 2 &&
    shaftLen > MIN_SIZE &&
    shaftLen / pathLength(shaft) > 0.92 &&
    pathLength(tail) > shaftLen * 0.08 &&
    tail.every((p) => dist(p, tip) < shaftLen * 0.35)
  ) {
    return { kind: 'arrow', ...bounds(shaft), points: [first, tip] };
  }
  return null;
}

/** Chaikin corner-cutting (2 passes): calms mouse jitter, keeps both endpoints exactly. */
export function smoothStroke(pts: readonly Pt[], passes = 2): Pt[] {
  let out = [...pts];
  for (let p = 0; p < passes && out.length > 2; p++) {
    const next: Pt[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const [x0, y0] = out[i];
      const [x1, y1] = out[i + 1];
      next.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}
