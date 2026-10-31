import { describe, expect, it } from 'vitest';
import { fromState, seededRandom } from '../src/random.ts';

describe('xoshiro128**', () => {
  it('matches the reference implementation for state {1, 2, 3, 4}', () => {
    const r = fromState([1, 2, 3, 4]);
    expect([r.nextUint32(), r.nextUint32(), r.nextUint32()]).toEqual([11520, 0, 5927040]);
  });

  it('rejects an all-zero state', () => {
    expect(() => fromState([0, 0, 0, 0])).toThrow();
  });
});

describe('seededRandom', () => {
  it('gives the same sequence for the same seed and a different one for another', () => {
    const a = seededRandom('patient-1');
    const b = seededRandom('patient-1');
    const c = seededRandom('patient-2');
    const first = Array.from({ length: 5 }, () => a.nextUint32());
    expect(Array.from({ length: 5 }, () => b.nextUint32())).toEqual(first);
    expect(Array.from({ length: 5 }, () => c.nextUint32())).not.toEqual(first);
  });

  it('keeps the sequence for a fixed seed stable across releases', () => {
    const r = seededRandom('opentwin-synthea');
    expect(Array.from({ length: 3 }, () => r.nextUint32())).toMatchInlineSnapshot(`
      [
        3048166378,
        3310109738,
        2214670610,
      ]
    `);
  });

  it('draws uniform values in [0, 1) and standard normal values', () => {
    const r = seededRandom('distribution');
    const n = 100_000;
    const u = Array.from({ length: n }, () => r.next());
    const z = Array.from({ length: n }, () => r.normal());
    const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = (xs: number[]): number => {
      const m = mean(xs);
      return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    };
    expect(Math.min(...u)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...u)).toBeLessThan(1);
    expect(mean(u)).toBeCloseTo(0.5, 2);
    expect(mean(z)).toBeCloseTo(0, 1);
    expect(sd(z)).toBeCloseTo(1, 1);
  });
});
