import { describe, expect, it } from 'vitest';
import { layoutMindMap, type MindNode } from '../src/board/mindmap';
import { recognizeShape, smoothStroke, type Pt } from '../src/board/shapes';
import { VersionTracker } from '../src/board/sync';

describe('VersionTracker', () => {
  it('reports only elements newer than what was sent or received', () => {
    const v = new VersionTracker();
    const a1 = { id: 'a', version: 1 };
    const b1 = { id: 'b', version: 1 };
    expect(v.unsent([a1, b1]).map((e) => e.id)).toEqual(['a', 'b']);
    v.mark([a1, b1]);
    expect(v.unsent([a1, b1])).toEqual([]);
    expect(v.unsent([{ id: 'a', version: 2 }, b1]).map((e) => e.id)).toEqual(['a']);
  });
  it('remote elements count as known so they are not echoed back', () => {
    const v = new VersionTracker();
    v.mark([{ id: 'r', version: 5 }]);
    expect(v.unsent([{ id: 'r', version: 5 }])).toEqual([]);
  });
});

describe('layoutMindMap', () => {
  const nodes: MindNode[] = [
    { id: 'root', parent: null },
    { id: 'a', parent: 'root' },
    { id: 'b', parent: 'root' },
    { id: 'a1', parent: 'a' },
    { id: 'a2', parent: 'a' },
  ];
  const pos = layoutMindMap(nodes, { x: 0, y: 0 });

  it('keeps the root where it is', () => {
    expect(pos.get('root')).toEqual({ x: 0, y: 0 });
  });
  it('balances first-level branches left and right', () => {
    expect(pos.get('a')!.x).toBeGreaterThan(0);
    expect(pos.get('b')!.x).toBeLessThan(0);
  });
  it('grows each branch outward on its own side', () => {
    expect(pos.get('a1')!.x).toBeGreaterThan(pos.get('a')!.x);
    expect(pos.get('a2')!.x).toBe(pos.get('a1')!.x);
  });
  it('stacks siblings without overlap and centers a parent on its children', () => {
    const a1 = pos.get('a1')!.y;
    const a2 = pos.get('a2')!.y;
    expect(Math.abs(a2 - a1)).toBeGreaterThanOrEqual(80);
    expect(pos.get('a')!.y).toBeCloseTo((a1 + a2) / 2);
  });
  it('ignores nodes whose parent is missing (orphans) instead of crashing', () => {
    const p = layoutMindMap([{ id: 'root', parent: null }, { id: 'x', parent: 'ghost' }], { x: 10, y: 20 });
    expect(p.get('root')).toEqual({ x: 10, y: 20 });
    expect(p.has('x')).toBe(false);
  });
});

// --- shape helpers ---
const circle = (n: number, r: number, wobble = 0): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + wobble * Math.sin(i * 7.3);
    return [r + r * w * Math.cos(a), r + r * w * Math.sin(a)];
  });
const poly = (corners: Pt[], perSide: number, jitter = 0): Pt[] => {
  const out: Pt[] = [];
  for (let c = 0; c < corners.length; c++) {
    const [x1, y1] = corners[c];
    const [x2, y2] = corners[(c + 1) % corners.length];
    for (let i = 0; i < perSide; i++) {
      const t = i / perSide;
      out.push([x1 + (x2 - x1) * t + jitter * Math.sin(i * 3.1 + c), y1 + (y2 - y1) * t + jitter * Math.cos(i * 2.3 + c)]);
    }
  }
  out.push(corners[0]);
  return out;
};

describe('recognizeShape', () => {
  it('turns a wobbly circle into an ellipse', () => {
    expect(recognizeShape(circle(60, 100, 0.05))?.kind).toBe('ellipse');
  });
  it('turns a shaky box into a rectangle with its bounds', () => {
    const r = recognizeShape(poly([[0, 0], [200, 0], [200, 120], [0, 120]], 20, 3));
    expect(r?.kind).toBe('rectangle');
    expect(r!.width).toBeGreaterThan(190);
    expect(r!.height).toBeGreaterThan(110);
  });
  it('recognizes a triangle', () => {
    expect(recognizeShape(poly([[100, 0], [200, 170], [0, 170]], 25, 2))?.kind).toBe('triangle');
  });
  it('turns a nearly straight stroke into a line from start to end', () => {
    const pts: Pt[] = Array.from({ length: 40 }, (_, i) => [i * 10, Math.sin(i) * 3]);
    const r = recognizeShape(pts);
    expect(r?.kind).toBe('line');
    expect(r!.points[0]).toEqual([0, 0]);
    expect(r!.points[1][0]).toBeCloseTo(390, 0);
  });
  it('recognizes an arrow drawn as a line with a hook at the end', () => {
    const shaft: Pt[] = Array.from({ length: 30 }, (_, i) => [i * 10, 0]);
    const head: Pt[] = [[280, -10], [265, -22], [290, 0], [265, 22], [270, 18]];
    expect(recognizeShape([...shaft, ...head])?.kind).toBe('arrow');
  });
  it('leaves scribbles and handwriting alone', () => {
    const scribble: Pt[] = Array.from({ length: 80 }, (_, i) => [i * 3 + 20 * Math.sin(i * 1.7), 30 * Math.cos(i * 2.9)]);
    expect(recognizeShape(scribble)).toBeNull();
  });
  it('ignores tiny strokes (dots, taps)', () => {
    expect(recognizeShape([[0, 0], [2, 1], [3, 2]])).toBeNull();
  });
});

describe('smoothStroke', () => {
  it('reduces jitter but keeps the endpoints', () => {
    const shaky: Pt[] = Array.from({ length: 50 }, (_, i) => [i * 4, i % 2 ? 6 : -6]);
    const smooth = smoothStroke(shaky);
    expect(smooth[0]).toEqual(shaky[0]);
    expect(smooth.at(-1)).toEqual(shaky.at(-1));
    const maxDev = Math.max(...smooth.slice(1, -1).map(([, y]) => Math.abs(y)));
    expect(maxDev).toBeLessThan(6);
  });
});
