import { describe, expect, it } from 'vitest';
import { GEO_SHAPES, GEO_TRIANGLES, geoShape } from './geometry';
import { measureElement, roundMeasure } from './measure';

const U = 20;
const measure = (kind: Parameters<typeof geoShape>[0]) => {
  const spec = geoShape(kind, U);
  const el = spec.type === 'polygon' ? { type: 'line', width: spec.width, height: spec.height, points: spec.points } : spec;
  return measureElement(el, U)!;
};
const row = (kind: Parameters<typeof geoShape>[0], key: string) => measure(kind).rows.find((r) => r.key === key)?.value;
const round = (v: unknown) => (Array.isArray(v) ? v.map((n) => Math.round(n)) : roundMeasure(v as number));

describe('ready-made shapes', () => {
  it('makes every shape, measurable', () => {
    for (const kind of [...GEO_SHAPES, ...GEO_TRIANGLES]) expect(measure(kind)).not.toBeNull();
  });

  it('gives the right kinds of triangle', () => {
    expect(measure('equilateral').kind).toBe('triangle');
    expect(round(row('equilateral', 'angles'))).toEqual([60, 60, 60]);
    expect(round(row('equilateral', 'sides'))).toEqual([6, 6, 6]);
    const iso = row('isosceles', 'sides') as number[];
    expect(roundMeasure(iso[0])).toBe(roundMeasure(iso[2]));
    expect(round(row('right', 'angles'))).toContain(90);
    expect(round(row('right', 'sides'))).toEqual([10, 8, 6]);
    const scalene = (row('scalene', 'sides') as number[]).map(roundMeasure);
    expect(new Set(scalene).size).toBe(3);
    expect(Math.max(...(row('obtuse', 'angles') as number[]))).toBeGreaterThan(90);
  });

  it('gives the right quadrilaterals and polygons', () => {
    expect(measure('square').kind).toBe('square');
    expect(measure('rectangle').kind).toBe('rectangle');
    expect(measure('rhombus').kind).toBe('rhombus');
    expect(measure('circle').kind).toBe('circle');
    const para = (row('parallelogram', 'sides') as number[]).map(roundMeasure);
    expect(para[0]).toBe(para[2]);
    expect(para[1]).toBe(para[3]);
    expect(row('parallelogram', 'area')).toBe(40); // base 8 × height 5
    expect(row('trapezoid', 'area')).toBe(30); // (8 + 4) / 2 × 5
    expect(measure('hexagon').rows.find((r) => r.key === 'sides')!.value).toHaveLength(6);
    expect(new Set((row('hexagon', 'sides') as number[]).map(roundMeasure)).size).toBe(1);
    expect(round(row('hexagon', 'angles'))).toEqual([120, 120, 120, 120, 120, 120]);
    expect(round(row('pentagon', 'angles'))).toEqual([108, 108, 108, 108, 108]);
  });
});
