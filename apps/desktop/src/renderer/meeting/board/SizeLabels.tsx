import { measureElement, roundMeasure } from '@classroom/protocol';
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
  /** Angles look different from lengths. */
  angle?: boolean;
  /** The area/perimeter badge in the middle of a selected shape (two lines). */
  badge?: string[];
}

/** A dashed line drawn over the board (a circle's diameter), in screen pixels. */
interface Guide {
  key: string;
  a: P;
  b: P;
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
  const guides: Guide[] = [];
  /** Angle arcs and right-angle squares, as SVG path data in screen pixels. */
  const arcs: { key: string; d: string }[] = [];

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

  /**
   * Each corner of a closed shape: a curved arc inside the corner with its angle, or a small
   * square for a right angle, like in a geometry book.
   */
  const cornerAngles = (key: string, corners: P[]) => {
    const n = corners.length;
    corners.forEach((v, i) => {
      const sv = toScreen(v);
      const sa = toScreen(corners[(i - 1 + n) % n]);
      const sb = toScreen(corners[(i + 1) % n]);
      const la = Math.hypot(sa[0] - sv[0], sa[1] - sv[1]);
      const lb = Math.hypot(sb[0] - sv[0], sb[1] - sv[1]);
      if (Math.min(la, lb) < MIN_EDGE_PX * 1.5) return;
      const ua: P = [(sa[0] - sv[0]) / la, (sa[1] - sv[1]) / la];
      const ub: P = [(sb[0] - sv[0]) / lb, (sb[1] - sv[1]) / lb];
      const deg = (Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1]))) * 180) / Math.PI;
      const r = Math.max(12, Math.min(26, Math.min(la, lb) * 0.22));
      if (Math.abs(deg - 90) < 0.6) {
        const q = r * 0.65;
        arcs.push({ key: key + ':r' + i, d: 'M' + (sv[0] + ua[0] * q) + ',' + (sv[1] + ua[1] * q) + ' L' + (sv[0] + (ua[0] + ub[0]) * q) + ',' + (sv[1] + (ua[1] + ub[1]) * q) + ' L' + (sv[0] + ub[0] * q) + ',' + (sv[1] + ub[1] * q) });
      } else {
        const p1: P = [sv[0] + ua[0] * r, sv[1] + ua[1] * r];
        const p2: P = [sv[0] + ub[0] * r, sv[1] + ub[1] * r];
        const sweep = ua[0] * ub[1] - ua[1] * ub[0] > 0 ? 1 : 0;
        arcs.push({ key: key + ':a' + i, d: 'M' + p1[0] + ',' + p1[1] + ' A' + r + ',' + r + ' 0 0 ' + sweep + ' ' + p2[0] + ',' + p2[1] });
      }
      // The number just past the arc, along the bisector (further in for sharp corners).
      const dir: P = [ua[0] + ub[0], ua[1] + ub[1]];
      const dl = Math.hypot(...dir) || 1;
      const d = Math.min(80, Math.max(r + 14, 16 / Math.max(0.2, Math.sin((deg * Math.PI) / 360))));
      labels.push({ key: key + ':n' + i, x: sv[0] + (dir[0] / dl) * d, y: sv[1] + (dir[1] / dl) * d, text: Math.round(deg) + '°', angle: true });
    });
  };

  /** Area and perimeter just below the selected shape (clear of its angles and side lengths). */
  const badge = (el: El, outline: P[]) => {
    if (!selected[el.id]) return;
    const m = measureElement(el as never, scale);
    const area = m?.rows.find((r) => r.key === 'area')?.value;
    const perimeter = m?.rows.find((r) => r.key === 'perimeter')?.value;
    if (typeof area !== 'number' || typeof perimeter !== 'number') return;
    const screen = outline.map(toScreen);
    const xs = screen.map((p) => p[0]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = Math.max(...screen.map((p) => p[1])) + 40;
    labels.push({ key: el.id + ':ap', x: cx, y: cy, text: '', badge: ['A = ' + roundMeasure(area) + ' ' + unit + '²', (m!.kind === 'circle' ? 'C' : 'P') + ' = ' + roundMeasure(perimeter) + ' ' + unit] });
  };

  const shapes = api
    .getSceneElements()
    .filter((e) => ['rectangle', 'diamond', 'ellipse', 'line', 'arrow'].includes(e.type) && !e.boundElements?.some((b) => b.type === 'text'))
    .slice(0, MAX_SHAPES);

  for (const el of shapes as El[]) {
    const { x, y, width: w, height: h, angle } = el;
    const c: P = [x + w / 2, y + h / 2];
    const at = (p: P) => rotate(p, c, angle);
    const box: P[] = [at([x, y]), at([x + w, y]), at([x + w, y + h]), at([x, y + h])];
    if (el.type === 'rectangle') {
      edge(`${el.id}:w`, at([x, y]), at([x + w, y]), at([x + w / 2, y - 1000]), fmt(w), selected[el.id] ? ROTATE_HANDLE_CLEARANCE : 0);
      edge(`${el.id}:h`, at([x + w, y]), at([x + w, y + h]), at([x + w + 1000, y + h / 2]), fmt(h));
      badge(el, box);
    } else if (el.type === 'diamond') {
      // A rhombus: the length of its (equal) sides on the top-right side, and its corner angles.
      edge(`${el.id}:s`, at([x + w / 2, y]), at([x + w, y + h / 2]), at([x + w + 1000, y - 1000]), fmt(Math.hypot(w / 2, h / 2)));
      cornerAngles(el.id, [at([x + w / 2, y]), at([x + w, y + h / 2]), at([x + w / 2, y + h]), at([x, y + h / 2])]);
      badge(el, box);
    } else if (el.type === 'ellipse') {
      const circle = Math.abs(w - h) <= Math.max(1, Math.max(w, h) * 0.02);
      if (circle) {
        // The diameter drawn across the middle, with its length just above the line.
        const a = toScreen(at([x, y + h / 2]));
        const b = toScreen(at([x + w, y + h / 2]));
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= MIN_EDGE_PX * 2) {
          guides.push({ key: `${el.id}:d`, a, b });
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          // Up from the line (perpendicular, toward the top of the screen).
          let nx = -(b[1] - a[1]) / len;
          let ny = (b[0] - a[0]) / len;
          if (ny > 0) [nx, ny] = [-nx, -ny];
          labels.push({ key: `${el.id}:dl`, x: (a[0] + b[0]) / 2 + nx * 13, y: (a[1] + b[1]) / 2 + ny * 13, text: `d = ${fmt(w)}` });
        }
        badge(el, box);
        continue;
      }
      edge(`${el.id}:w`, at([x, y]), at([x + w, y]), at([x + w / 2, y - 1000]), fmt(w), selected[el.id] ? ROTATE_HANDLE_CLEARANCE : 0);
      if (!circle) edge(`${el.id}:h`, at([x + w, y]), at([x + w, y + h]), at([x + w + 1000, y + h / 2]), fmt(h));
      badge(el, box);
    } else if ('points' in el && el.points.length >= 2) {
      const pts = (el.points as readonly P[]).map(([px, py]) => at([x + px, y + py]));
      const closed = pts.length >= 4 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 2;
      // Labels go outside a closed shape (away from its middle), or above an open line.
      const mid: P = pts.slice(0, closed ? -1 : undefined).reduce<P>((m, p, _i, all) => [m[0] + p[0] / all.length, m[1] + p[1] / all.length], [0, 0]);
      // Closed shapes up to six corners: an arc and the angle in each corner; area and perimeter when selected.
      if (closed && pts.length - 1 >= 3 && pts.length - 1 <= 6) cornerAngles(el.id, pts.slice(0, -1));
      if (closed) badge(el, pts);
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
      {(guides.length > 0 || arcs.length > 0) && (
        <svg className="size-guides">
          {guides.map((g) => (
            <line key={g.key} x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} />
          ))}
          {arcs.map((a) => (
            <path key={a.key} className="angle-arc" d={a.d} />
          ))}
        </svg>
      )}
      {labels.map((l) =>
        l.badge ? (
          <span key={l.key} className="size-badge" style={{ left: l.x, top: l.y }}>
            {l.badge.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        ) : (
          <span key={l.key} className={'size-label' + (l.angle ? ' is-angle' : '')} style={{ left: l.x, top: l.y }}>
            {l.text}
          </span>
        ),
      )}
    </div>
  );
}
