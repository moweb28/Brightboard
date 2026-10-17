import type { Pt } from './shapes';

/**
 * Ready-made geometric shapes for the whiteboard, sized in measuring units (one unit = one grid
 * square). Boxes, circles and rhombi become Excalidraw's own shapes; the rest are closed lines
 * (polygons), which the measure tools read as sides, angles, perimeter and area.
 */

export const GEO_SHAPES = ['square', 'rectangle', 'parallelogram', 'trapezoid', 'rhombus', 'pentagon', 'hexagon', 'circle'] as const;
export const GEO_TRIANGLES = ['equilateral', 'isosceles', 'right', 'scalene', 'obtuse'] as const;
export type GeoShape = (typeof GEO_SHAPES)[number] | (typeof GEO_TRIANGLES)[number];


export type GeoSpec =
  | { type: 'rectangle' | 'ellipse' | 'diamond'; width: number; height: number }
  /** Corner points from the top-left of the shape's box, closed (the last point repeats the first). */
  | { type: 'polygon'; width: number; height: number; points: Pt[] };

const regular = (n: number, side: number): Pt[] => {
  const r = side / (2 * Math.sin(Math.PI / n));
  // Flat bottom edge: start below the center and go round.
  const start = Math.PI / 2 + Math.PI / n;
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / n;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
};

/** Shifts points so the box starts at 0,0, closes the outline, and returns it with its size. */
function polygon(corners: Pt[]): GeoSpec {
  const minX = Math.min(...corners.map((p) => p[0]));
  const minY = Math.min(...corners.map((p) => p[1]));
  const pts = corners.map(([x, y]) => [x - minX, y - minY] as Pt);
  const width = Math.max(...pts.map((p) => p[0]));
  const height = Math.max(...pts.map((p) => p[1]));
  return { type: 'polygon', width, height, points: [...pts, [...pts[0]] as Pt] };
}

/** The shape at a classroom-friendly size; `unit` is board pixels per unit. */
export function geoShape(kind: GeoShape, unit: number): GeoSpec {
  const u = unit > 0 ? unit : 20;
  switch (kind) {
    case 'square':
      return { type: 'rectangle', width: 6 * u, height: 6 * u };
    case 'rectangle':
      return { type: 'rectangle', width: 8 * u, height: 5 * u };
    case 'circle':
      return { type: 'ellipse', width: 6 * u, height: 6 * u };
    case 'rhombus':
      return { type: 'diamond', width: 8 * u, height: 6 * u };
    case 'parallelogram':
      return polygon([
        [2 * u, 0],
        [10 * u, 0],
        [8 * u, 5 * u],
        [0, 5 * u],
      ]);
    case 'trapezoid':
      return polygon([
        [2 * u, 0],
        [6 * u, 0],
        [8 * u, 5 * u],
        [0, 5 * u],
      ]);
    case 'pentagon':
      return polygon(regular(5, 4 * u));
    case 'hexagon':
      return polygon(regular(6, 3.5 * u));
    case 'equilateral': {
      const s = 6 * u;
      return polygon([
        [s / 2, 0],
        [s, (s * Math.sqrt(3)) / 2],
        [0, (s * Math.sqrt(3)) / 2],
      ]);
    }
    case 'isosceles':
      return polygon([
        [3 * u, 0],
        [6 * u, 7 * u],
        [0, 7 * u],
      ]);
    case 'right':
      return polygon([
        [0, 0],
        [8 * u, 6 * u],
        [0, 6 * u],
      ]);
    case 'scalene':
      return polygon([
        [2 * u, 0],
        [9 * u, 5 * u],
        [0, 5 * u],
      ]);
    case 'obtuse':
      return polygon([
        [7 * u, 0],
        [9 * u, 3 * u],
        [0, 3 * u],
      ]);
  }
}
