import { describe, expect, it } from 'vitest';
import { generateEeg, jansenRit } from '../src/eeg.ts';

/** Frequency with the most power between 1 and 30 Hz, in 0.25 Hz steps. */
function peakFrequency(x: ArrayLike<number>, fs: number): number {
  const n = x.length;
  let mean = 0;
  for (let t = 0; t < n; t++) mean += (x[t] ?? 0) / n;
  let best = { f: 0, p: -1 };
  for (let f = 1; f <= 30; f += 0.25) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const v = (x[t] ?? 0) - mean;
      re += v * Math.cos((2 * Math.PI * f * t) / fs);
      im += v * Math.sin((2 * Math.PI * f * t) / fs);
    }
    if (re * re + im * im > best.p) best = { f, p: re * re + im * im };
  }
  return best.f;
}

describe('jansenRit', () => {
  it.each(['a', 'b', 'c'])('peaks in the alpha band at C = 135, as the paper reports (seed %s)', (seed) => {
    const f = peakFrequency(jansenRit(seed, 4), 1024);
    expect(f).toBeGreaterThanOrEqual(8);
    expect(f).toBeLessThanOrEqual(12);
  });

  it('turns into slower, larger waves at C = 270', () => {
    const alpha = jansenRit('s', 4, 135);
    const slow = jansenRit('s', 4, 270);
    const range = (x: Float64Array): number => Math.max(...x) - Math.min(...x);
    expect(peakFrequency(slow, 1024)).toBeLessThan(7);
    expect(range(slow)).toBeGreaterThan(2 * range(alpha));
  });
});

describe('generateEeg', () => {
  const eeg = generateEeg({ seed: 'p1', seconds: 8, channels: ['O1', 'O2'] });

  it('gives the same channels for the same seed', () => {
    expect(generateEeg({ seed: 'p1', seconds: 8, channels: ['O1', 'O2'] })).toEqual(eeg);
  });

  it('scales each channel to the requested standard deviation', () => {
    for (const c of eeg.channels) {
      const m = c.microvolts.reduce((s, v) => s + v, 0) / c.microvolts.length;
      const sd = Math.sqrt(c.microvolts.reduce((s, v) => s + (v - m) ** 2, 0) / c.microvolts.length);
      expect(m).toBeCloseTo(0, 6);
      expect(sd).toBeCloseTo(20, 6);
    }
  });

  it('drives channels with independent input', () => {
    const [o1, o2] = eeg.channels.map((c) => c.microvolts) as [number[], number[]];
    const r = o1.reduce((s, v, i) => s + v * (o2[i] ?? 0), 0) / (o1.length * 400);
    expect(Math.abs(r)).toBeLessThan(0.3);
  });

  it('rejects a sample rate that does not divide 1024 Hz and an empty montage', () => {
    expect(() => generateEeg({ seed: 'x', seconds: 1, channels: ['O1'], sampleRate: 300 })).toThrow('divide');
    expect(() => generateEeg({ seed: 'x', seconds: 1, channels: [] })).toThrow('channel');
  });
});
