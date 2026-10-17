import { describe, expect, it } from 'vitest';
import { ellipsePerimeter, measureElement, resizeFor, roundMeasure, type MeasureRow } from './measure';

const row = (rows: MeasureRow[] | undefined, key: string) => rows?.find((r) => r.key === key)?.value;
const SCALE = 20; // 20 px = 1 cm

describe('measuring board shapes', () => {
  it('measures rectangles and squares', () => {
    const rect = measureElement({ type: 'rectangle', width: 100, height: 60 }, SCALE)!;
    expect(rect.kind).toBe('rectangle');
    expect(row(rect.rows, 'width')).toBe(5);
    expect(row(rect.rows, 'height')).toBe(3);
    expect(row(rect.rows, 'perimeter')).toBe(16);
    expect(row(rect.rows, 'area')).toBe(15);
    const square = measureElement({ type: 'rectangle', width: 80, height: 80 }, SCALE)!;
    expect(square.kind).toBe('square');
    expect(row(square.rows, 'area')).toBe(16);
    expect(row(square.rows, 'perimeter')).toBe(16);
  });

  it('measures circles, ellipses and rhombi', () => {
    const circle = measureElement({ type: 'ellipse', width: 40, height: 40 }, SCALE)!;
    expect(circle.kind).toBe('circle');
    expect(row(circle.rows, 'radius')).toBe(1);
    expect(roundMeasure(row(circle.rows, 'area') as number)).toBe(3.14);
    expect(roundMeasure(row(circle.rows, 'perimeter') as number)).toBe(6.28);
    const ellipse = measureElement({ type: 'ellipse', width: 80, height: 40 }, SCALE)!;
    expect(ellipse.kind).toBe('ellipse');
    expect(roundMeasure(row(ellipse.rows, 'area') as number)).toBe(6.28);
    expect(roundMeasure(ellipsePerimeter(1, 1))).toBe(6.28);
    const rhombus = measureElement({ type: 'diamond', width: 60, height: 80 }, SCALE)!;
    expect(row(rhombus.rows, 'side')).toBe(2.5);
    expect(row(rhombus.rows, 'area')).toBe(6);
  });

  it('measures lines and paths', () => {
    const line = measureElement({ type: 'line', width: 60, height: 80, points: [[0, 0], [60, 80]] }, SCALE)!;
    expect(line.kind).toBe('line');
    expect(row(line.rows, 'length')).toBe(5);
    const path = measureElement({ type: 'arrow', width: 40, height: 40, points: [[0, 0], [40, 0], [40, 40]] }, SCALE)!;
    expect(path.kind).toBe('path');
    expect(row(path.rows, 'length')).toBe(4);
  });

  it('measures a closed triangle: sides, perimeter, area and angles', () => {
    // A 3-4-5 right triangle, closed back to the start.
    const tri = measureElement({ type: 'line', width: 80, height: 60, points: [[0, 0], [80, 0], [0, 60], [0, 0]] }, SCALE)!;
    expect(tri.kind).toBe('triangle');
    expect((row(tri.rows, 'sides') as number[]).map(roundMeasure)).toEqual([4, 5, 3]);
    expect(row(tri.rows, 'perimeter')).toBe(12);
    expect(row(tri.rows, 'area')).toBe(6);
    const angles = (row(tri.rows, 'angles') as number[]).map(Math.round);
    expect(angles.reduce((a, b) => a + b, 0)).toBe(180);
    expect(angles).toContain(90);
  });

  it('ignores text and pictures', () => {
    expect(measureElement({ type: 'text', width: 100, height: 20 }, SCALE)).toBeNull();
    expect(measureElement({ type: 'image', width: 100, height: 20 }, SCALE)).toBeNull();
  });

  it('turns typed measurements into new sizes', () => {
    expect(resizeFor({ type: 'rectangle', width: 100, height: 60 }, 'width', 7, SCALE)).toEqual({ width: 140 });
    expect(resizeFor({ type: 'rectangle', width: 80, height: 80 }, 'side', 3, SCALE)).toEqual({ width: 60, height: 60 });
    expect(resizeFor({ type: 'ellipse', width: 40, height: 40 }, 'radius', 2, SCALE)).toEqual({ width: 80, height: 80 });
    expect(resizeFor({ type: 'line', width: 60, height: 80, points: [[0, 0], [60, 80]] }, 'length', 10, SCALE)).toEqual({ factor: 2 });
    expect(resizeFor({ type: 'rectangle', width: 100, height: 60 }, 'area', 5, SCALE)).toBeNull();
    expect(resizeFor({ type: 'rectangle', width: 100, height: 60 }, 'width', -1, SCALE)).toBeNull();
  });
});
