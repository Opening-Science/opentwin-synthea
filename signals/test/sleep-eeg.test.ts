import { describe, expect, it } from 'vitest';
import { generateSleepEeg, thalamocortical } from '../src/sleep-eeg.ts';

const FS = 256;

/** Power summed over frequencies lo..hi Hz in 0.1 Hz steps, after removing the mean; every 4th sample. */
function power(x: Float64Array, lo: number, hi: number): number {
  const fs = FS / 4;
  const xs = Array.from({ length: Math.floor(x.length / 4) }, (_, i) => x[i * 4] ?? 0);
  const m = xs.reduce((a, v) => a + v, 0) / xs.length;
  let p = 0;
  for (let f = lo; f <= hi + 1e-9; f += 0.1) {
    let re = 0;
    let im = 0;
    xs.forEach((v, t) => {
      re += (v - m) * Math.cos((2 * Math.PI * f * t) / fs);
      im += (v - m) * Math.sin((2 * Math.PI * f * t) / fs);
    });
    p += re * re + im * im;
  }
  return p;
}
const peakFrequency = (x: Float64Array, lo: number, hi: number): number => {
  let best = { f: lo, p: -1 };
  for (let f = lo; f <= hi + 1e-9; f += 0.05) {
    const p = power(x, f, f);
    if (p > best.p) best = { f, p };
  }
  return best.f;
};
/** The paper's K-complex and slow oscillation criterion: troughs of the pyramidal voltage below -69 mV. */
const troughs = (vp: Float64Array): number => {
  let n = 0;
  let inside = false;
  for (const v of vp) {
    if (v < -69 && !inside) {
      n++;
      inside = true;
    } else if (v > -60) inside = false;
  }
  return n;
};

describe('thalamocortical, stage N2', () => {
  const { vp, vt } = thalamocortical('n2', 'N2', 120);

  it('has thalamic spindles at 12 to 15 Hz', () => {
    const f = peakFrequency(vt, 9, 17);
    expect(f).toBeGreaterThanOrEqual(12);
    expect(f).toBeLessThanOrEqual(15);
    expect(power(vt, 11, 16)).toBeGreaterThan(10 * power(vt, 5, 10));
  });

  it('shows isolated K-complexes, not continuous slow oscillations', () => {
    expect(troughs(vp)).toBeGreaterThanOrEqual(1);
    expect(troughs(vp)).toBeLessThanOrEqual(10);
  });
});

describe('thalamocortical, stage N3', () => {
  const { vp } = thalamocortical('n3', 'N3', 120);

  it('is dominated by slow oscillations near 0.8 Hz', () => {
    const f = peakFrequency(vp, 0.3, 4);
    expect(f).toBeGreaterThanOrEqual(0.5);
    expect(f).toBeLessThanOrEqual(1.2);
  });

  it('reaches the K-complex trough repeatedly', () => {
    expect(troughs(vp) / 2).toBeGreaterThanOrEqual(10);
  });
});

describe('generateSleepEeg', () => {
  it('gives the same channels for the same seed', () => {
    const a = generateSleepEeg({ seed: 'p1', stage: 'N3', seconds: 4, channels: ['C3', 'C4'] });
    expect(generateSleepEeg({ seed: 'p1', stage: 'N3', seconds: 4, channels: ['C3', 'C4'] })).toEqual(a);
    expect(a.channels[0]?.microvolts).toHaveLength(4 * FS);
  });

  it('gives larger waves in N3 than in N2', () => {
    const range = (stage: 'N2' | 'N3'): number => {
      const v = generateSleepEeg({ seed: 'amp', stage, seconds: 30, channels: ['C3'] }).channels[0]?.microvolts ?? [];
      return Math.max(...v) - Math.min(...v);
    };
    expect(range('N3')).toBeGreaterThan(75);
    expect(range('N3')).toBeGreaterThan(range('N2'));
  });
});
